import type { PanChunkMeta } from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import { ensureGalleryTables } from "../_lib/db";
import type { Env } from "../_lib/env";
import { jsonResponse, noContentOptions } from "../_lib/http";
import { CF_D1_CHUNK_BYTES } from "./pan";

interface MediaFileRow {
  id: string;
  kind: string;
  title: string;
  visibility: string;
  storage_tier: string;
  mime_type: string;
  file_size: number;
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

function mimeToExt(mime: string, kind: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("quicktime")) return ".mov";
  if (m.includes("webm")) return ".webm";
  if (m.startsWith("video/")) return ".mp4";
  return kind === "video" ? ".mp4" : ".jpg";
}

function buildDownloadName(title: string, mime: string, kind: string): string {
  const clean = (title || "media").trim();
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return clean;
  return `${clean}${mimeToExt(mime, kind)}`;
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
  return handleMediaFile(context, true);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleMediaFile(context, false);
};

async function handleMediaFile(
  context: EventContext<Env, string, unknown>,
  isHead: boolean,
): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensureGalleryTables(db);

  const url = new URL(context.request.url);
  const id = (url.searchParams.get("id") || "").trim();
  const wantThumb = url.searchParams.get("thumb") === "1";
  const isDownload = url.searchParams.get("download") === "1";

  if (!id) {
    return jsonResponse({ status: "error", error: "缺少媒体 id" }, 400);
  }

  const item = await db
    .prepare(
      "SELECT id, kind, title, visibility, storage_tier, mime_type, file_size, asset_url, chunks_json FROM media_items WHERE id = ?",
    )
    .bind(id)
    .first<MediaFileRow>();

  if (!item) {
    return jsonResponse({ status: "error", error: "媒体不存在" }, 404);
  }

  if (item.visibility === "private") {
    const auth = verifyAdminPassword(context.env, context.request);
    if (!auth.configured) {
      return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
    }
    if (!auth.valid) {
      return jsonResponse({ status: "error", error: "无权访问私密媒体，请先解锁" }, 401);
    }
  }

  if (wantThumb) {
    const thumb = await db
      .prepare("SELECT mime_type, data FROM media_thumbs WHERE media_id = ?")
      .bind(id)
      .first<{ mime_type?: string; data?: unknown }>();
    if (!thumb?.data) {
      return jsonResponse({ status: "error", error: "缩略图不存在" }, 404);
    }
    const bytes = toUint8Array(thumb.data);
    const headers = new Headers({
      "Content-Type": thumb.mime_type || "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        item.visibility === "private" ? "private, no-store" : "public, max-age=86400",
    });
    if (isHead) return new Response(null, { status: 200, headers });
    return new Response(bytes, { status: 200, headers });
  }

  const rangeHeader = context.request.headers.get("Range");
  if (isDownload && !isHead && (!rangeHeader || rangeHeader.startsWith("bytes=0-"))) {
    context.waitUntil(
      db
        .prepare("UPDATE media_items SET downloads = downloads + 1 WHERE id = ?")
        .bind(id)
        .run()
        .catch(() => undefined),
    );
  }

  const fileName = buildDownloadName(item.title, item.mime_type, item.kind);
  const baseHeaders = new Headers();
  baseHeaders.set("Access-Control-Allow-Origin", "*");
  baseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  baseHeaders.set(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges, Content-Type, Content-Disposition",
  );
  baseHeaders.set("Accept-Ranges", "bytes");
  baseHeaders.set("Content-Type", item.mime_type || "application/octet-stream");
  baseHeaders.set("Content-Disposition", buildContentDisposition(fileName, !isDownload));
  baseHeaders.set(
    "Cache-Control",
    item.visibility === "private" ? "private, no-store" : "public, max-age=3600",
  );

  // Tier 1: Cloudflare D1 chunked blobs (<= 20 MB)
  if (item.storage_tier === "cf_d1") {
    const totalSize = Number(item.file_size) || 0;
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
              .prepare("SELECT data FROM media_blobs WHERE media_id = ? AND chunk_index = ?")
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

  // Tier 3: GitHub Releases chunked (> 90 MB)
  if (item.storage_tier === "gh_chunked") {
    let chunks: PanChunkMeta[] = [];
    try {
      chunks = (JSON.parse(item.chunks_json || "[]") as PanChunkMeta[]).sort(
        (a, b) => a.index - b.index,
      );
    } catch {
      chunks = [];
    }

    const totalSize =
      Number(item.file_size) || chunks.reduce((sum, c) => sum + (Number(c.size) || 0), 0);
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

  // Tier 2: gh_single edge proxy
  if (!item.asset_url) {
    return jsonResponse({ status: "error", error: "缺少媒体源地址" }, 404);
  }

  const forwardHeaders = new Headers({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });
  if (rangeHeader) {
    forwardHeaders.set("Range", rangeHeader);
  }

  try {
    const upstreamResp = await fetch(item.asset_url, {
      method: isHead ? "HEAD" : "GET",
      headers: forwardHeaders,
      redirect: "follow",
    });

    const contentLen = upstreamResp.headers.get("Content-Length");
    if (contentLen) baseHeaders.set("Content-Length", contentLen);
    const contentRange = upstreamResp.headers.get("Content-Range");
    if (contentRange) baseHeaders.set("Content-Range", contentRange);

    if (item.kind === "video") {
      const userAgent = context.request.headers.get("User-Agent") || "";
      const isApple = /iPhone|iPad|iPod|Macintosh|Mac OS/i.test(userAgent);
      if (item.mime_type === "video/quicktime" || item.asset_url.toLowerCase().endsWith(".mov")) {
        baseHeaders.set("Content-Type", isApple ? "video/quicktime" : "video/mp4");
      }
    }

    if (isHead) {
      return new Response(null, { status: upstreamResp.status, headers: baseHeaders });
    }
    return new Response(upstreamResp.body, { status: upstreamResp.status, headers: baseHeaders });
  } catch {
    return Response.redirect(item.asset_url, 302);
  }
}
