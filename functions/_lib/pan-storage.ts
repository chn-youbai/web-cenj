import type {
  PanCategory,
  PanChunkMeta,
  PanFileItem,
  PanStorageTier,
  PanVisibility,
} from "../../shared/types";
import { ensurePanTables } from "./db";
import { type Env, getEnvString } from "./env";
import { jsonResponse } from "./http";

export const GH_REPO = "chn-youbai/web-cenj";
export const GH_PAN_TAG = "v_pan";
export const CF_D1_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const CF_D1_CHUNK_BYTES = 512 * 1024; // 512 KB per D1 BLOB chunk

export const VALID_PAN_CATEGORIES = new Set<PanCategory>([
  "software",
  "document",
  "image",
  "archive",
  "media",
  "other",
]);

export interface PanFileRow {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  category: string;
  visibility: string;
  storage_tier: string;
  folder_path?: string;
  asset_url: string;
  asset_id: number | null;
  chunks_json: string;
  note: string;
  downloads: number;
  created_at: number;
  updated_at: number;
}

interface GitHubReleaseResp {
  upload_url?: string;
  message?: string;
}

interface GitHubAssetResp {
  id?: number;
  browser_download_url?: string;
  size?: number;
  message?: string;
}

export function inferPanCategory(fileName: string, mimeType: string): PanCategory {
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";

  if (
    ["apk", "exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage", "ipa"].includes(ext) ||
    mime.includes("android.package-archive") ||
    mime.includes("x-msdownload")
  ) {
    return "software";
  }
  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "heic"].includes(ext)
  ) {
    return "image";
  }
  if (
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    ["mp4", "mkv", "webm", "mov", "avi", "mp3", "wav", "flac", "ogg", "m4a"].includes(ext)
  ) {
    return "media";
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "iso"].includes(ext)) {
    return "archive";
  }
  if (
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime.includes("json") ||
    mime.includes("xml") ||
    [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "md",
      "csv",
      "json",
      "yaml",
      "yml",
      "toml",
      "ini",
      "log",
      "ts",
      "js",
      "py",
      "html",
      "css",
      "sh",
    ].includes(ext)
  ) {
    return "document";
  }
  return "other";
}

export function normalizeCategory(
  raw: string | null | undefined,
  fileName: string,
  mime: string,
): PanCategory {
  if (raw && VALID_PAN_CATEGORIES.has(raw as PanCategory)) {
    return raw as PanCategory;
  }
  return inferPanCategory(fileName, mime);
}

export function normalizeVisibility(raw: string | null | undefined): PanVisibility {
  return raw === "private" ? "private" : "public";
}

export function buildPanDirectUrl(id: string, name: string, download = false): string {
  const safeName = encodeURIComponent(name || "file");
  return `/api/pan-raw/${encodeURIComponent(id)}/${safeName}${download ? "?download=1" : ""}`;
}

export function rowToPanItem(row: PanFileRow): PanFileItem {
  let chunks: PanChunkMeta[] | undefined;
  if (row.storage_tier === "gh_chunked" && row.chunks_json) {
    try {
      const parsed = JSON.parse(row.chunks_json) as PanChunkMeta[];
      if (Array.isArray(parsed)) chunks = parsed;
    } catch {
      chunks = [];
    }
  }
  return {
    id: row.id,
    name: row.name,
    size: Number(row.size) || 0,
    mime_type: row.mime_type || "application/octet-stream",
    category: VALID_PAN_CATEGORIES.has(row.category as PanCategory)
      ? (row.category as PanCategory)
      : "other",
    visibility: row.visibility === "private" ? "private" : "public",
    storage_tier: (row.storage_tier as PanStorageTier) || "cf_d1",
    folder_path: row.folder_path || "",
    asset_url: row.asset_url || "",
    asset_id: row.asset_id ?? null,
    chunks,
    note: row.note || "",
    downloads: Number(row.downloads) || 0,
    direct_url: buildPanDirectUrl(row.id, row.name, false),
    download_url: buildPanDirectUrl(row.id, row.name, true),
    created_at: Number(row.created_at) || 0,
    updated_at: Number(row.updated_at) || 0,
  };
}

export function generatePanId(): string {
  return `pan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function getOrCreatePanReleaseUploadUrl(token: string): Promise<string> {
  const releaseResp = await fetch(
    `https://api.github.com/repos/${GH_REPO}/releases/tags/${GH_PAN_TAG}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cenj-Pan-Proxy",
      },
    },
  );

  if (releaseResp.ok) {
    const relData = (await releaseResp.json()) as GitHubReleaseResp;
    if (relData.upload_url) return relData.upload_url;
    throw new Error("GitHub Release upload_url 缺失");
  }

  if (releaseResp.status === 404) {
    const createResp = await fetch(`https://api.github.com/repos/${GH_REPO}/releases`, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cenj-Pan-Proxy",
      },
      body: JSON.stringify({
        tag_name: GH_PAN_TAG,
        name: "Cenj Pan Assets",
        body: "Cloud drive assets storage",
        draft: false,
        prerelease: false,
      }),
    });
    const createData = (await createResp.json().catch(() => ({}))) as GitHubReleaseResp;
    if (!createResp.ok || !createData.upload_url) {
      throw new Error(`创建 GitHub Release 失败：${createData.message || createResp.statusText}`);
    }
    return createData.upload_url;
  }

  const errData = (await releaseResp.json().catch(() => ({}))) as GitHubReleaseResp;
  throw new Error(`GitHub 鉴权失败：${errData.message || releaseResp.statusText}`);
}

export async function uploadStreamToGitHub(
  token: string,
  fileName: string,
  contentType: string,
  body: ReadableStream<Uint8Array> | ArrayBuffer | null,
): Promise<{ url: string; assetId: number | null; size: number }> {
  const uploadUrl = await getOrCreatePanReleaseUploadUrl(token);
  const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file.bin";
  const uniqueName = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}_${safeBase}`;
  const targetEndpoint = uploadUrl.replace(
    "{?name,label}",
    `?name=${encodeURIComponent(uniqueName)}`,
  );

  const ghResp = await fetch(targetEndpoint, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": contentType || "application/octet-stream",
      "User-Agent": "Cenj-Pan-Proxy",
    },
    body,
  });

  const ghData = (await ghResp.json().catch(() => ({}))) as GitHubAssetResp;
  if (!ghResp.ok || !ghData.browser_download_url) {
    throw new Error(`GitHub 上传失败：${ghData.message || ghResp.statusText}`);
  }

  return {
    url: ghData.browser_download_url,
    assetId: ghData.id ?? null,
    size: Number(ghData.size) || 0,
  };
}

export async function deleteGitHubAssets(token: string, assetIds: number[]): Promise<void> {
  if (!token || assetIds.length === 0) return;
  for (const id of assetIds) {
    try {
      await fetch(`https://api.github.com/repos/${GH_REPO}/releases/assets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Cenj-Pan-Proxy",
        },
      });
    } catch {
      // ignore remote cleanup error
    }
  }
}

export async function saveD1Blobs(
  db: D1Database,
  fileId: string,
  bytes: Uint8Array,
): Promise<void> {
  const totalChunks = Math.max(1, Math.ceil(bytes.byteLength / CF_D1_CHUNK_BYTES));
  const insertBlobStmt = db.prepare(
    "INSERT INTO pan_blobs (file_id, chunk_index, data) VALUES (?, ?, ?)",
  );

  const batchStmts: D1PreparedStatement[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CF_D1_CHUNK_BYTES;
    const end = Math.min(bytes.byteLength, start + CF_D1_CHUNK_BYTES);
    const slice = bytes.subarray(start, end);
    batchStmts.push(insertBlobStmt.bind(fileId, i, slice));
    if (batchStmts.length >= 8) {
      await db.batch(batchStmts.splice(0, batchStmts.length));
    }
  }
  if (batchStmts.length > 0) {
    await db.batch(batchStmts);
  }
}

export async function deletePanFileRecord(
  db: D1Database,
  env: Env,
  existing: PanFileRow,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<void> {
  await db.prepare("DELETE FROM pan_blobs WHERE file_id = ?").bind(existing.id).run();
  await db.prepare("DELETE FROM pan_files WHERE id = ?").bind(existing.id).run();

  const assetIds: number[] = [];
  if (existing.asset_id) {
    assetIds.push(Number(existing.asset_id));
  }
  if (existing.storage_tier === "gh_chunked" && existing.chunks_json) {
    try {
      const chunks = JSON.parse(existing.chunks_json) as PanChunkMeta[];
      for (const c of chunks) {
        if (c.asset_id) assetIds.push(Number(c.asset_id));
      }
    } catch {
      // ignore
    }
  }

  const token = getEnvString(env, "GITHUB_MEDIA_TOKEN");
  if (token && assetIds.length > 0) {
    waitUntil(deleteGitHubAssets(token, assetIds));
  }
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

export function parseRangeHeader(
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
  const safeAscii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\\r\n]/g, "_");
  const encoded = encodeURIComponent(fileName);
  const type = inline ? "inline" : "attachment";
  return `${type}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

function createStreamPair(expectedBytes: number): {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
} {
  if (typeof FixedLengthStream === "function" && expectedBytes > 0) {
    return new FixedLengthStream(expectedBytes) as unknown as {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
  }
  return new TransformStream<Uint8Array, Uint8Array>();
}

export async function streamPanFileResponse(
  context: EventContext<Env, string, unknown>,
  file: PanFileRow,
  options: {
    isHead: boolean;
    inline: boolean;
    corsHeaders?: Record<string, string>;
    redirectExternalFallback?: boolean;
  },
): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanTables(db);

  const { isHead, inline, corsHeaders = {}, redirectExternalFallback = true } = options;
  const rangeHeader = context.request.headers.get("Range");

  if (!isHead && !inline && (!rangeHeader || rangeHeader.startsWith("bytes=0-"))) {
    context.waitUntil(
      db
        .prepare("UPDATE pan_files SET downloads = downloads + 1 WHERE id = ?")
        .bind(file.id)
        .run()
        .catch(() => undefined),
    );
  }

  const edgeCache =
    typeof caches !== "undefined" && "default" in caches
      ? (caches as unknown as { default: Cache }).default
      : null;
  const isCacheablePublic =
    !isHead &&
    !rangeHeader &&
    file.visibility === "public" &&
    file.storage_tier !== "gh_chunked" &&
    Number(file.size) > 0 &&
    Number(file.size) <= 50 * 1024 * 1024;

  let edgeCacheKey: Request | null = null;
  if (edgeCache && isCacheablePublic) {
    const reqUrl = new URL(context.request.url);
    const cacheUrl = new URL(`${reqUrl.origin}/__pan_edge_cache/${encodeURIComponent(file.id)}`);
    cacheUrl.searchParams.set("inline", inline ? "1" : "0");
    cacheUrl.searchParams.set("v", String(file.updated_at || 0));
    edgeCacheKey = new Request(cacheUrl.toString(), { method: "GET" });

    try {
      const cached = await edgeCache.match(edgeCacheKey);
      if (cached) {
        const hitHeaders = new Headers(cached.headers);
        hitHeaders.set(
          "Access-Control-Allow-Origin",
          corsHeaders["Access-Control-Allow-Origin"] || "*",
        );
        if (corsHeaders.Vary) {
          hitHeaders.set("Vary", corsHeaders.Vary);
        }
        return new Response(cached.body, { status: cached.status, headers: hitHeaders });
      }
    } catch {
      // ignore edge cache read error
    }
  }

  const baseHeaders = new Headers();
  baseHeaders.set("Access-Control-Allow-Origin", corsHeaders["Access-Control-Allow-Origin"] || "*");
  if (corsHeaders.Vary) {
    baseHeaders.set("Vary", corsHeaders.Vary);
  }
  baseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  baseHeaders.set(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges, Content-Disposition, ETag",
  );
  baseHeaders.set("Accept-Ranges", "bytes");
  baseHeaders.set("Content-Type", file.mime_type || "application/octet-stream");
  baseHeaders.set("Content-Disposition", buildContentDisposition(file.name, inline));
  baseHeaders.set("ETag", `"${file.id}-${file.updated_at || 0}"`);
  baseHeaders.set(
    "Cache-Control",
    file.visibility === "private" ? "private, no-store" : "public, max-age=86400",
  );

  // Tier 1: Cloudflare D1 chunked blobs (<= 20 MB) with 4-chunk parallel prefetch
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
    const PREFETCH_BATCH = 4;
    const { readable, writable } = createStreamPair(contentLength);

    const d1Pump = (async () => {
      const writer = writable.getWriter();
      try {
        for (let batchStart = firstChunk; batchStart <= lastChunk; batchStart += PREFETCH_BATCH) {
          const batchEnd = Math.min(lastChunk, batchStart + PREFETCH_BATCH - 1);
          const indices: number[] = [];
          for (let idx = batchStart; idx <= batchEnd; idx++) {
            indices.push(idx);
          }
          const rows = await Promise.all(
            indices.map((idx) =>
              db
                .prepare("SELECT data FROM pan_blobs WHERE file_id = ? AND chunk_index = ?")
                .bind(file.id, idx)
                .first<{ data?: unknown }>(),
            ),
          );
          for (let i = 0; i < indices.length; i++) {
            const idx = indices[i]!;
            const row = rows[i];
            if (!row?.data) {
              throw new Error(`D1 分块 ${idx} 缺失`);
            }
            const chunkBytes = toUint8Array(row.data);
            const chunkGlobalStart = idx * CF_D1_CHUNK_BYTES;
            const sliceStart = Math.max(0, start - chunkGlobalStart);
            const sliceEnd = Math.min(chunkBytes.byteLength, end - chunkGlobalStart + 1);
            if (sliceEnd > sliceStart) {
              await writer.write(chunkBytes.subarray(sliceStart, sliceEnd));
            }
          }
        }
        await writer.close();
      } catch (err) {
        await writer.abort(err).catch(() => undefined);
      }
    })();

    context.waitUntil(d1Pump);
    const resp = new Response(readable, { status, headers: baseHeaders });
    if (edgeCache && edgeCacheKey) {
      context.waitUntil(edgeCache.put(edgeCacheKey, resp.clone()).catch(() => undefined));
    }
    return resp;
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
      return jsonResponse({ status: "error", error: "分片元数据损坏" }, 500, corsHeaders);
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

    const { readable, writable } = createStreamPair(contentLength);
    const MAX_SUB_FETCH = 16 * 1024 * 1024;

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

          for (let sliceStart = reqStart; sliceStart <= reqEnd; ) {
            const sliceEnd = Math.min(reqEnd, sliceStart + MAX_SUB_FETCH - 1);
            const expectedSliceBytes = sliceEnd - sliceStart + 1;
            let writtenInSlice = 0;
            let lastErr: unknown = null;

            for (let attempt = 0; attempt < 3 && writtenInSlice < expectedSliceBytes; attempt++) {
              const curStart = sliceStart + writtenInSlice;
              const headers = new Headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              });
              if (curStart > 0 || sliceEnd < chunk.size - 1) {
                headers.set("Range", `bytes=${curStart}-${sliceEnd}`);
              }

              let writeFailed = false;
              try {
                const upstream = await fetch(chunk.url, { headers, redirect: "follow" });
                if (!upstream.ok || !upstream.body) {
                  throw new Error(`分片 ${chunk.index} 拉取失败 (${upstream.status})`);
                }
                let skipRemaining = upstream.status === 200 && curStart > 0 ? curStart : 0;
                const reader = upstream.body.getReader();
                while (writtenInSlice < expectedSliceBytes) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (!value || value.byteLength === 0) continue;

                  let slice = value;
                  if (skipRemaining > 0) {
                    if (slice.byteLength <= skipRemaining) {
                      skipRemaining -= slice.byteLength;
                      continue;
                    }
                    slice = slice.subarray(skipRemaining);
                    skipRemaining = 0;
                  }

                  const remainingNeeded = expectedSliceBytes - writtenInSlice;
                  if (slice.byteLength > remainingNeeded) {
                    slice = slice.subarray(0, remainingNeeded);
                  }

                  try {
                    await writer.write(slice);
                  } catch (writeErr) {
                    writeFailed = true;
                    await reader.cancel().catch(() => undefined);
                    throw writeErr;
                  }
                  writtenInSlice += slice.byteLength;
                  if (writtenInSlice >= expectedSliceBytes) {
                    await reader.cancel().catch(() => undefined);
                    break;
                  }
                }
              } catch (err) {
                lastErr = err;
                if (writeFailed || attempt >= 2) {
                  throw err;
                }
              }
            }

            if (writtenInSlice < expectedSliceBytes) {
              throw lastErr instanceof Error
                ? lastErr
                : new Error(`分片 ${chunk.index} 数据流提前结束`);
            }
            sliceStart = sliceEnd + 1;
          }
        }
        await writer.close();
      } catch (err) {
        await writer.abort(err).catch(() => undefined);
      }
    })();

    context.waitUntil(pump);
    return new Response(readable, { status, headers: baseHeaders });
  }

  // Tier 2 & 4: gh_single or external_link edge proxy
  if (!file.asset_url) {
    return jsonResponse({ status: "error", error: "缺少文件源地址" }, 404, corsHeaders);
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
    if (redirectExternalFallback) {
      return Response.redirect(file.asset_url, 302);
    }
    return jsonResponse({ status: "error", error: "上游资源拉取失败" }, 502, corsHeaders);
  }
}
