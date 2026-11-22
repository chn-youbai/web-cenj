import type { PanChunkMeta } from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import { ensurePanTables } from "../_lib/db";
import type { Env } from "../_lib/env";
import { jsonResponse, noContentOptions } from "../_lib/http";
import { CF_D1_CHUNK_BYTES } from "./pan";

interface PanFileRow {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  visibility: string;
  storage_tier: string;
  asset_url: string;
  chunks_json: string;
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data as number[]);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(0);
}

function parseRangeHeader(
  rangeHeader: string | null,
  totalSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader || totalSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";

  let start = 0;
  let end = totalSize - 1;

  if (rawStart === "" && rawEnd !== "") {
    const suffix = Number.parseInt(rawEnd, 10);
    if (Number.isNaN(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
  } else {
    start = Number.parseInt(rawStart, 10);
    if (Number.isNaN(start) || start < 0 || start >= totalSize) return null;
    if (rawEnd !== "") {
      const parsedEnd = Number.parseInt(rawEnd, 10);
      if (!Number.isNaN(parsedEnd)) {
        end = Math.min(totalSize - 1, parsedEnd);
      }
    }
  }

  if (start > end) return null;
  return { start, end };
}

function buildContentDisposition(fileName: string, inline: boolean): string {
  const safeAscii = fileName.replace(/["\\\r\n]/g, "_");
  const encoded = encodeURIComponent(fileName);
  const type = inline ? "inline" : "attachment";
  return `${type}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, HEAD, OPTIONS");
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
  return handlePanFile(context, true);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handlePanFile(context, false);
};

async function handlePanFile(
  context: EventContext<Env, string, unknown>,
  isHead: boolean,
): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanTables(db);

  const url = new URL(context.request.url);
  const id = (url.searchParams.get("id") || "").trim();
  const inline = url.searchParams.get("inline") === "1";

  if (!id) {
    return jsonResponse({ status: "error", error: "缺少文件 id" }, 400);
  }

  const file = await db
    .prepare(
      "SELECT id, name, size, mime_type, visibility, storage_tier, asset_url, chunks_json FROM pan_files WHERE id = ?",
    )
    .bind(id)
    .first<PanFileRow>();

  if (!file) {
    return jsonResponse({ status: "error", error: "文件不存在" }, 404);
  }

  if (file.visibility === "private") {
    const auth = verifyAdminPassword(context.env, context.request);
    if (!auth.configured) {
      return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
    }
    if (!auth.valid) {
      return jsonResponse({ status: "error", error: "无权访问私密文件，请先解锁管理权限" }, 401);
    }
  }

  // Increment download counter asynchronously for non-HEAD, non-inline requests
  const rangeHeader = context.request.headers.get("Range");
  if (!isHead && !inline && (!rangeHeader || rangeHeader.startsWith("bytes=0-"))) {
    context.waitUntil(
      db
        .prepare("UPDATE pan_files SET downloads = downloads + 1 WHERE id = ?")
        .bind(id)
        .run()
        .catch(() => undefined),
    );
  }

  const baseHeaders = new Headers();
  baseHeaders.set("Access-Control-Allow-Origin", "*");
  baseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  baseHeaders.set(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges, Content-Disposition",
  );
  baseHeaders.set("Accept-Ranges", "bytes");
  baseHeaders.set("Content-Type", file.mime_type || "application/octet-stream");
  baseHeaders.set("Content-Disposition", buildContentDisposition(file.name, inline));
  baseHeaders.set(
    "Cache-Control",
    file.visibility === "private" ? "private, no-store" : "public, max-age=300",
  );

  // Tier 1: Cloudflare D1 chunked blobs (<= 20 MB)
  if (file.storage_tier === "cf_d1") {
    const totalSize = Number(file.size) || 0;
    const range = parseRangeHeader(rangeHeader, totalSize);
    const start = range ? range.start : 0;
    const end = range ? range.end : Math.max(0, totalSize - 1);
    const contentLength = totalSize === 0 ? 0 : end - start + 1;

    baseHeaders.set("Content-Length", String(contentLength));
    if (range) {
      baseHeaders.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    }

    const status = range ? 206 : 200;
    if (isHead || totalSize === 0) {
      return new Response(null, { status, headers: baseHeaders });
    }

    const firstChunk = Math.floor(start / CF_D1_CHUNK_BYTES);
    const lastChunk = Math.floor(end / CF_D1_CHUNK_BYTES);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (let idx = firstChunk; idx <= lastChunk; idx++) {
            const row = await db
              .prepare("SELECT data FROM pan_blobs WHERE file_id = ? AND chunk_index = ?")
              .bind(id, idx)
              .first<{ data?: unknown }>();
            if (!row?.data) break;
            const chunkBytes = toUint8Array(row.data);
            const chunkGlobalStart = idx * CF_D1_CHUNK_BYTES;
            const sliceStart = Math.max(0, start - chunkGlobalStart);
            const sliceEnd = Math.min(chunkBytes.byteLength, end - chunkGlobalStart + 1);
            if (sliceEnd > sliceStart) {
              controller.enqueue(chunkBytes.subarray(sliceStart, sliceEnd));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, { status, headers: baseHeaders });
  }

  // Tier 3: GitHub Releases chunked (> 90 MB, 80 MB/chunk)
  if (file.storage_tier === "gh_chunked") {
    let chunks: PanChunkMeta[] = [];
    try {
      chunks = (JSON.parse(file.chunks_json || "[]") as PanChunkMeta[]).sort(
        (a, b) => a.index - b.index,
      );
    } catch {
      chunks = [];
    }

    const totalSize =
      Number(file.size) || chunks.reduce((sum, c) => sum + (Number(c.size) || 0), 0);
    if (chunks.length === 0 || totalSize <= 0) {
      return jsonResponse({ status: "error", error: "分片元数据损坏" }, 500);
    }

    const range = parseRangeHeader(rangeHeader, totalSize);
    const start = range ? range.start : 0;
    const end = range ? range.end : totalSize - 1;
    const contentLength = end - start + 1;

    baseHeaders.set("Content-Length", String(contentLength));
    if (range) {
      baseHeaders.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    }

    const status = range ? 206 : 200;
    if (isHead) {
      return new Response(null, { status, headers: baseHeaders });
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

    const pump = (async () => {
      const writer = writable.getWriter();
      try {
        let offset = 0;
        for (const chunk of chunks) {
          const chunkStart = offset;
          const chunkEnd = offset + chunk.size - 1;
          offset += chunk.size;

          if (chunkEnd < start) continue;
          if (chunkStart > end) break;

          const reqStart = Math.max(0, start - chunkStart);
          const reqEnd = Math.min(chunk.size - 1, end - chunkStart);
          const headers = new Headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          });
          if (reqStart > 0 || reqEnd < chunk.size - 1) {
            headers.set("Range", `bytes=${reqStart}-${reqEnd}`);
          }

          const upstream = await fetch(chunk.url, { headers, redirect: "follow" });
          if (!upstream.ok || !upstream.body) {
            throw new Error(`分片 ${chunk.index} 拉取失败 (${upstream.status})`);
          }

          const reader = upstream.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) await writer.write(value);
          }
        }
        await writer.close();
      } catch (err) {
        await writer.abort(err);
      }
    })();

    context.waitUntil(pump);
    return new Response(readable, { status, headers: baseHeaders });
  }

  // Tier 2 & 4: gh_single or external_link edge proxy
  if (!file.asset_url) {
    return jsonResponse({ status: "error", error: "缺少文件源地址" }, 404);
  }

  const forwardHeaders = new Headers({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });
  if (rangeHeader) {
    forwardHeaders.set("Range", rangeHeader);
  }

  try {
    const upstreamResp = await fetch(file.asset_url, {
      method: isHead ? "HEAD" : "GET",
      headers: forwardHeaders,
      redirect: "follow",
    });

    const contentLen = upstreamResp.headers.get("Content-Length");
    if (contentLen) baseHeaders.set("Content-Length", contentLen);
    const contentRange = upstreamResp.headers.get("Content-Range");
    if (contentRange) baseHeaders.set("Content-Range", contentRange);
    const upstreamType = upstreamResp.headers.get("Content-Type");
    if (upstreamType && file.mime_type === "application/octet-stream") {
      baseHeaders.set("Content-Type", upstreamType);
    }

    if (isHead) {
      return new Response(null, { status: upstreamResp.status, headers: baseHeaders });
    }
    return new Response(upstreamResp.body, { status: upstreamResp.status, headers: baseHeaders });
  } catch {
    return Response.redirect(file.asset_url, 302);
  }
}
