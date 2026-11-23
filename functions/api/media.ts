import type {
  MediaItem,
  MediaKind,
  MediaListResponse,
  MediaStorageTier,
  MediaUploadResponse,
  MediaVisibility,
  PanChunkMeta,
  PanChunkUploadResponse,
} from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import { ensureGalleryTables } from "../_lib/db";
import { type Env, getEnvString } from "../_lib/env";
import {
  getErrorMessage,
  jsonResponse,
  noContentOptions,
  noStoreJsonResponse,
  readJsonBody,
} from "../_lib/http";
import { CF_D1_CHUNK_BYTES, CF_D1_MAX_BYTES } from "./pan";

const GH_REPO = "chn-youbai/web-cenj";
const GH_MEDIA_TAG = "v_media";
const MAX_THUMB_BYTES = 512 * 1024;

interface MediaRow {
  id: string;
  kind: string;
  title: string;
  album: string;
  description: string;
  visibility: string;
  storage_tier: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  duration: number;
  asset_url: string;
  asset_id: number | null;
  chunks_json: string;
  has_thumb: number;
  poster_url: string;
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

function normalizeKind(raw: string | null | undefined, mime: string, name: string): MediaKind {
  if (raw === "video" || raw === "photo") return raw;
  const m = mime.toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)$/.test(n)) {
    return "video";
  }
  return "photo";
}

function normalizeVisibility(raw: string | null | undefined): MediaVisibility {
  return raw === "private" ? "private" : "public";
}

function decodeHeaderValue(raw: string | null): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function generateMediaId(kind: MediaKind): string {
  const prefix = kind === "video" ? "vid" : "img";
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function rowToItem(row: MediaRow): MediaItem {
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
    kind: row.kind === "video" ? "video" : "photo",
    title: row.title || "未命名媒体",
    album: row.album || "默认相册",
    description: row.description || "",
    visibility: row.visibility === "private" ? "private" : "public",
    storage_tier: (row.storage_tier as MediaStorageTier) || "cf_d1",
    mime_type: row.mime_type || "application/octet-stream",
    file_size: Number(row.file_size) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    duration: Number(row.duration) || 0,
    asset_url: row.asset_url || "",
    asset_id: row.asset_id ?? null,
    chunks,
    has_thumb: Boolean(row.has_thumb),
    poster_url: row.poster_url || "",
    downloads: Number(row.downloads) || 0,
    created_at: Number(row.created_at) || 0,
    updated_at: Number(row.updated_at) || 0,
  };
}

async function getOrCreateMediaReleaseUploadUrl(token: string): Promise<string> {
  const releaseResp = await fetch(
    `https://api.github.com/repos/${GH_REPO}/releases/tags/${GH_MEDIA_TAG}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cenj-Media-Proxy",
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
        "User-Agent": "Cenj-Media-Proxy",
      },
      body: JSON.stringify({
        tag_name: GH_MEDIA_TAG,
        name: "Cenj Media Assets",
        body: "Cloud gallery photos & videos assets",
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

async function uploadMediaStreamToGitHub(
  token: string,
  fileName: string,
  contentType: string,
  body: ReadableStream<Uint8Array> | ArrayBuffer | null,
): Promise<{ url: string; assetId: number | null; size: number }> {
  const uploadUrl = await getOrCreateMediaReleaseUploadUrl(token);
  const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "media.bin";
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
      "User-Agent": "Cenj-Media-Proxy",
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

async function deleteGitHubAssets(token: string, assetIds: number[]): Promise<void> {
  if (!token || assetIds.length === 0) return;
  for (const id of assetIds) {
    try {
      await fetch(`https://api.github.com/repos/${GH_REPO}/releases/assets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Cenj-Media-Proxy",
        },
      });
    } catch {
      // ignore remote cleanup errors
    }
  }
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, PATCH, DELETE, OPTIONS");
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return noStoreJsonResponse(
      {
        status: "error",
        isAdmin: false,
        items: [],
        albums: [],
        stats: {
          total: 0,
          photoCount: 0,
          videoCount: 0,
          privateCount: 0,
          totalBytes: 0,
          cfUsedBytes: 0,
        },
        message: "Cloudflare D1 数据库未绑定",
      } satisfies MediaListResponse,
      503,
    );
  }

  await ensureGalleryTables(db);
  const auth = verifyAdminPassword(context.env, context.request);
  const isAdmin = auth.configured && auth.valid;

  const query = isAdmin
    ? "SELECT * FROM media_items ORDER BY created_at DESC"
    : "SELECT * FROM media_items WHERE visibility = 'public' ORDER BY created_at DESC";

  const { results } = await db.prepare(query).all<MediaRow>();
  const items = (results || []).map(rowToItem);

  const albumSet = new Set<string>();
  let photoCount = 0;
  let videoCount = 0;
  let privateCount = 0;
  let totalBytes = 0;
  let cfUsedBytes = 0;

  for (const item of items) {
    if (item.album) albumSet.add(item.album);
    if (item.kind === "video") videoCount += 1;
    else photoCount += 1;
    if (item.visibility === "private") privateCount += 1;
    totalBytes += item.file_size;
    if (item.storage_tier === "cf_d1") cfUsedBytes += item.file_size;
  }

  return noStoreJsonResponse({
    status: "ok",
    isAdmin,
    items,
    albums: Array.from(albumSet),
    stats: {
      total: items.length,
      photoCount,
      videoCount,
      privateCount,
      totalBytes,
      cfUsedBytes,
    },
  } satisfies MediaListResponse);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensureGalleryTables(db);

  const url = new URL(context.request.url);
  const action = (url.searchParams.get("action") || "upload").toLowerCase();

  try {
    if (action === "thumb") {
      const id = (url.searchParams.get("id") || "").trim();
      if (!id) {
        return jsonResponse({ status: "error", error: "缺少媒体 id" }, 400);
      }
      const existing = await db
        .prepare("SELECT visibility FROM media_items WHERE id = ?")
        .bind(id)
        .first<{ visibility: string }>();
      if (!existing) {
        return jsonResponse({ status: "error", error: "媒体不存在" }, 404);
      }
      if (existing.visibility === "private") {
        const auth = verifyAdminPassword(context.env, context.request);
        if (!auth.configured || !auth.valid) {
          return jsonResponse({ status: "error", error: "私密媒体缩略图需要管理密码" }, 401);
        }
      }

      const buf = await context.request.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_THUMB_BYTES) {
        return jsonResponse({ status: "error", error: "缩略图体积必须在 1B–512KB 之间" }, 400);
      }
      const mime = context.request.headers.get("Content-Type") || "image/webp";
      await db
        .prepare("INSERT OR REPLACE INTO media_thumbs (media_id, mime_type, data) VALUES (?, ?, ?)")
        .bind(id, mime, new Uint8Array(buf))
        .run();
      await db.prepare("UPDATE media_items SET has_thumb = 1 WHERE id = ?").bind(id).run();

      return jsonResponse({ status: "ok", id });
    }

    if (action === "chunk") {
      const visibility = normalizeVisibility(
        context.request.headers.get("X-Media-Visibility") || url.searchParams.get("visibility"),
      );
      if (visibility === "private") {
        const auth = verifyAdminPassword(context.env, context.request);
        if (!auth.configured) {
          return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
        }
        if (!auth.valid) {
          return jsonResponse({ status: "error", error: "上传私密分片需要管理密码" }, 401);
        }
      }

      const token =
        context.request.headers.get("X-GitHub-Token") ||
        getEnvString(context.env, "GITHUB_MEDIA_TOKEN");
      if (!token) {
        return jsonResponse(
          { status: "error", error: "上传 >20MB 媒体需要服务端配置 GITHUB_MEDIA_TOKEN" },
          503,
        );
      }

      const chunkIndex = Math.max(
        0,
        Number.parseInt(url.searchParams.get("index") || "0", 10) || 0,
      );
      const fileName =
        decodeHeaderValue(context.request.headers.get("X-File-Name")) ||
        url.searchParams.get("name") ||
        "media.bin";

      const uploaded = await uploadMediaStreamToGitHub(
        token,
        `${fileName}.part${chunkIndex}`,
        "application/octet-stream",
        context.request.body,
      );

      const resp: PanChunkUploadResponse = {
        status: "ok",
        chunk: {
          index: chunkIndex,
          url: uploaded.url,
          asset_id: uploaded.assetId ?? undefined,
          size: uploaded.size,
        },
      };
      return jsonResponse(resp);
    }

    if (action === "commit_chunks") {
      const parsed = await readJsonBody<{
        kind?: string;
        title?: string;
        album?: string;
        description?: string;
        visibility?: string;
        mime_type?: string;
        file_size?: number;
        width?: number;
        height?: number;
        duration?: number;
        chunks?: PanChunkMeta[];
        password?: string;
      }>(context.request);
      if (!parsed.ok) {
        return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
      }

      const body = parsed.data;
      const visibility = normalizeVisibility(body.visibility);
      if (visibility === "private") {
        const auth = verifyAdminPassword(context.env, context.request, body);
        if (!auth.configured) {
          return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
        }
        if (!auth.valid) {
          return jsonResponse({ status: "error", error: "保存私密媒体需要管理密码" }, 401);
        }
      }

      const chunks = Array.isArray(body.chunks) ? body.chunks : [];
      if (chunks.length === 0) {
        return jsonResponse({ status: "error", error: "缺少分片清单 chunks" }, 400);
      }
      chunks.sort((a, b) => a.index - b.index);

      const mimeType = (body.mime_type || "").trim() || "video/mp4";
      const title = (body.title || "").trim() || `媒体_${Date.now()}`;
      const kind = normalizeKind(body.kind, mimeType, title);
      const album = (body.album || "").trim() || "默认相册";
      const description = (body.description || "").trim().slice(0, 300);
      const totalSize =
        Number(body.file_size) || chunks.reduce((sum, c) => sum + (Number(c.size) || 0), 0);
      const width = Math.max(0, Number(body.width) || 0);
      const height = Math.max(0, Number(body.height) || 0);
      const duration = Math.max(0, Number(body.duration) || 0);
      const id = generateMediaId(kind);
      const now = Date.now();

      await db
        .prepare(`
          INSERT INTO media_items
            (id, kind, title, album, description, visibility, storage_tier, mime_type, file_size, width, height, duration, asset_url, asset_id, chunks_json, has_thumb, poster_url, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'gh_chunked', ?, ?, ?, ?, ?, '', NULL, ?, 0, '', 0, ?, ?)
        `)
        .bind(
          id,
          kind,
          title,
          album,
          description,
          visibility,
          mimeType,
          totalSize,
          width,
          height,
          duration,
          JSON.stringify(chunks),
          now,
          now,
        )
        .run();

      const item: MediaItem = {
        id,
        kind,
        title,
        album,
        description,
        visibility,
        storage_tier: "gh_chunked",
        mime_type: mimeType,
        file_size: totalSize,
        width,
        height,
        duration,
        asset_url: "",
        asset_id: null,
        chunks,
        has_thumb: false,
        poster_url: "",
        downloads: 0,
        created_at: now,
        updated_at: now,
      };
      return jsonResponse({ status: "ok", item } satisfies MediaUploadResponse, 201);
    }

    // Default: action === "upload" (<=20MB cf_d1, >20MB gh_single)
    const visibility = normalizeVisibility(
      context.request.headers.get("X-Media-Visibility") || url.searchParams.get("visibility"),
    );
    if (visibility === "private") {
      const auth = verifyAdminPassword(context.env, context.request);
      if (!auth.configured) {
        return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
      }
      if (!auth.valid) {
        return jsonResponse({ status: "error", error: "上传私密媒体需要管理密码" }, 401);
      }
    }

    const fileName =
      decodeHeaderValue(context.request.headers.get("X-File-Name")) ||
      url.searchParams.get("name") ||
      `media_${Date.now()}`;
    const rawTitle = decodeHeaderValue(context.request.headers.get("X-Title"));
    const title = rawTitle || fileName.replace(/\.[^/.]+$/, "") || fileName;
    const mimeType =
      decodeHeaderValue(context.request.headers.get("X-Media-Mime")) ||
      context.request.headers.get("Content-Type") ||
      "application/octet-stream";
    const kind = normalizeKind(context.request.headers.get("X-Media-Kind"), mimeType, fileName);
    const album = decodeHeaderValue(context.request.headers.get("X-Media-Album")) || "默认相册";
    const description = decodeHeaderValue(context.request.headers.get("X-Media-Desc")).slice(
      0,
      300,
    );
    const width = Math.max(
      0,
      Number.parseInt(context.request.headers.get("X-Media-Width") || "0", 10) || 0,
    );
    const height = Math.max(
      0,
      Number.parseInt(context.request.headers.get("X-Media-Height") || "0", 10) || 0,
    );
    const duration = Math.max(
      0,
      Number.parseInt(context.request.headers.get("X-Duration") || "0", 10) || 0,
    );
    const declaredSize =
      Number.parseInt(
        context.request.headers.get("X-Media-Size") ||
          context.request.headers.get("Content-Length") ||
          "0",
        10,
      ) || 0;

    const id = generateMediaId(kind);
    const now = Date.now();

    if (declaredSize <= CF_D1_MAX_BYTES) {
      const buf = await context.request.arrayBuffer();
      const actualSize = buf.byteLength;
      if (actualSize > CF_D1_MAX_BYTES) {
        return jsonResponse(
          { status: "error", error: "媒体超过 20MB，请携带 X-Media-Size 头走 GitHub 直传" },
          413,
        );
      }

      const bytes = new Uint8Array(buf);
      const totalChunks = Math.max(1, Math.ceil(actualSize / CF_D1_CHUNK_BYTES));
      const insertBlobStmt = db.prepare(
        "INSERT INTO media_blobs (media_id, chunk_index, data) VALUES (?, ?, ?)",
      );

      const batchStmts: D1PreparedStatement[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CF_D1_CHUNK_BYTES;
        const end = Math.min(actualSize, start + CF_D1_CHUNK_BYTES);
        batchStmts.push(insertBlobStmt.bind(id, i, bytes.subarray(start, end)));
        if (batchStmts.length >= 8) {
          await db.batch(batchStmts.splice(0, batchStmts.length));
        }
      }
      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
      }

      await db
        .prepare(`
          INSERT INTO media_items
            (id, kind, title, album, description, visibility, storage_tier, mime_type, file_size, width, height, duration, asset_url, asset_id, chunks_json, has_thumb, poster_url, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'cf_d1', ?, ?, ?, ?, ?, '', NULL, '[]', 0, '', 0, ?, ?)
        `)
        .bind(
          id,
          kind,
          title,
          album,
          description,
          visibility,
          mimeType,
          actualSize,
          width,
          height,
          duration,
          now,
          now,
        )
        .run();

      const item: MediaItem = {
        id,
        kind,
        title,
        album,
        description,
        visibility,
        storage_tier: "cf_d1",
        mime_type: mimeType,
        file_size: actualSize,
        width,
        height,
        duration,
        asset_url: "",
        asset_id: null,
        has_thumb: false,
        poster_url: "",
        downloads: 0,
        created_at: now,
        updated_at: now,
      };
      return jsonResponse({ status: "ok", item } satisfies MediaUploadResponse, 201);
    }

    // > 20 MB -> stream directly to GitHub Releases v_media
    const token =
      context.request.headers.get("X-GitHub-Token") ||
      getEnvString(context.env, "GITHUB_MEDIA_TOKEN");
    if (!token) {
      return jsonResponse(
        { status: "error", error: "上传 >20MB 媒体需要服务端配置 GITHUB_MEDIA_TOKEN" },
        503,
      );
    }

    const uploaded = await uploadMediaStreamToGitHub(
      token,
      fileName,
      mimeType,
      context.request.body,
    );
    const finalSize = uploaded.size || declaredSize;

    await db
      .prepare(`
        INSERT INTO media_items
          (id, kind, title, album, description, visibility, storage_tier, mime_type, file_size, width, height, duration, asset_url, asset_id, chunks_json, has_thumb, poster_url, downloads, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'gh_single', ?, ?, ?, ?, ?, ?, ?, '[]', 0, '', 0, ?, ?)
      `)
      .bind(
        id,
        kind,
        title,
        album,
        description,
        visibility,
        mimeType,
        finalSize,
        width,
        height,
        duration,
        uploaded.url,
        uploaded.assetId,
        now,
        now,
      )
      .run();

    const item: MediaItem = {
      id,
      kind,
      title,
      album,
      description,
      visibility,
      storage_tier: "gh_single",
      mime_type: mimeType,
      file_size: finalSize,
      width,
      height,
      duration,
      asset_url: uploaded.url,
      asset_id: uploaded.assetId,
      has_thumb: false,
      poster_url: "",
      downloads: 0,
      created_at: now,
      updated_at: now,
    };
    return jsonResponse({ status: "ok", item } satisfies MediaUploadResponse, 201);
  } catch (err) {
    return jsonResponse({ status: "error", error: getErrorMessage(err) }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensureGalleryTables(db);

  const parsed = await readJsonBody<{
    id?: string;
    title?: string;
    album?: string;
    description?: string;
    visibility?: string;
    password?: string;
  }>(context.request);
  if (!parsed.ok) {
    return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
  }

  const body = parsed.data;
  const auth = verifyAdminPassword(context.env, context.request, body);
  if (!auth.configured) {
    return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
  }
  if (!auth.valid) {
    return jsonResponse({ status: "error", error: "管理密码错误" }, 401);
  }

  const id = (body.id || "").trim();
  if (!id) {
    return jsonResponse({ status: "error", error: "缺少媒体 id" }, 400);
  }

  const existing = await db
    .prepare("SELECT * FROM media_items WHERE id = ?")
    .bind(id)
    .first<MediaRow>();
  if (!existing) {
    return jsonResponse({ status: "error", error: "媒体不存在" }, 404);
  }

  const nextTitle = (body.title || "").trim() || existing.title;
  const nextAlbum = (body.album || "").trim() || existing.album;
  const nextDesc =
    typeof body.description === "string"
      ? body.description.trim().slice(0, 300)
      : existing.description;
  const nextVis = body.visibility
    ? normalizeVisibility(body.visibility)
    : normalizeVisibility(existing.visibility);
  const now = Date.now();

  await db
    .prepare(
      "UPDATE media_items SET title = ?, album = ?, description = ?, visibility = ?, updated_at = ? WHERE id = ?",
    )
    .bind(nextTitle, nextAlbum, nextDesc, nextVis, now, id)
    .run();

  const updated = rowToItem({
    ...existing,
    title: nextTitle,
    album: nextAlbum,
    description: nextDesc,
    visibility: nextVis,
    updated_at: now,
  });

  return jsonResponse({ status: "ok", item: updated } satisfies MediaUploadResponse);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensureGalleryTables(db);

  const auth = verifyAdminPassword(context.env, context.request);
  if (!auth.configured) {
    return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
  }
  if (!auth.valid) {
    return jsonResponse({ status: "error", error: "删除媒体需要管理密码" }, 401);
  }

  const url = new URL(context.request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    return jsonResponse({ status: "error", error: "缺少媒体 id" }, 400);
  }

  const existing = await db
    .prepare("SELECT * FROM media_items WHERE id = ?")
    .bind(id)
    .first<MediaRow>();
  if (!existing) {
    return jsonResponse({ status: "error", error: "媒体不存在或已删除" }, 404);
  }

  await db.prepare("DELETE FROM media_blobs WHERE media_id = ?").bind(id).run();
  await db.prepare("DELETE FROM media_thumbs WHERE media_id = ?").bind(id).run();
  await db.prepare("DELETE FROM media_items WHERE id = ?").bind(id).run();

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

  const token = getEnvString(context.env, "GITHUB_MEDIA_TOKEN");
  if (token && assetIds.length > 0) {
    context.waitUntil(deleteGitHubAssets(token, assetIds));
  }

  return jsonResponse({ status: "ok", id });
};
