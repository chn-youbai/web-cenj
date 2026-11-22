import type {
  PanCategory,
  PanChunkMeta,
  PanChunkUploadResponse,
  PanFileItem,
  PanListResponse,
  PanStorageTier,
  PanUploadResponse,
  PanVisibility,
} from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import { ensurePanTables } from "../_lib/db";
import { type Env, getEnvString } from "../_lib/env";
import {
  getErrorMessage,
  jsonResponse,
  noContentOptions,
  noStoreJsonResponse,
  readJsonBody,
} from "../_lib/http";

const GH_REPO = "chn-youbai/web-cenj";
const GH_PAN_TAG = "v_pan";
export const CF_D1_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const CF_D1_CHUNK_BYTES = 512 * 1024; // 512 KB per D1 BLOB chunk

const VALID_CATEGORIES = new Set<PanCategory>([
  "software",
  "document",
  "image",
  "archive",
  "media",
  "other",
]);

interface PanFileRow {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  category: string;
  visibility: string;
  storage_tier: string;
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

function inferCategory(fileName: string, mimeType: string): PanCategory {
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

function normalizeCategory(
  raw: string | null | undefined,
  fileName: string,
  mime: string,
): PanCategory {
  if (raw && VALID_CATEGORIES.has(raw as PanCategory)) {
    return raw as PanCategory;
  }
  return inferCategory(fileName, mime);
}

function normalizeVisibility(raw: string | null | undefined): PanVisibility {
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

function rowToItem(row: PanFileRow): PanFileItem {
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
    category: VALID_CATEGORIES.has(row.category as PanCategory)
      ? (row.category as PanCategory)
      : "other",
    visibility: row.visibility === "private" ? "private" : "public",
    storage_tier: (row.storage_tier as PanStorageTier) || "cf_d1",
    asset_url: row.asset_url || "",
    asset_id: row.asset_id ?? null,
    chunks,
    note: row.note || "",
    downloads: Number(row.downloads) || 0,
    created_at: Number(row.created_at) || 0,
    updated_at: Number(row.updated_at) || 0,
  };
}

function generatePanId(): string {
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

async function uploadStreamToGitHub(
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

async function deleteGitHubAssets(token: string, assetIds: number[]): Promise<void> {
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
        files: [],
        stats: { total: 0, publicCount: 0, privateCount: 0, totalBytes: 0, cfUsedBytes: 0 },
        message: "Cloudflare D1 数据库未绑定",
      } satisfies PanListResponse,
      503,
    );
  }

  await ensurePanTables(db);
  const auth = verifyAdminPassword(context.env, context.request);
  const isAdmin = auth.configured && auth.valid;

  const query = isAdmin
    ? "SELECT * FROM pan_files ORDER BY created_at DESC"
    : "SELECT * FROM pan_files WHERE visibility = 'public' ORDER BY created_at DESC";

  const { results } = await db.prepare(query).all<PanFileRow>();
  const files = (results || []).map(rowToItem);

  let publicCount = 0;
  let privateCount = 0;
  let totalBytes = 0;
  let cfUsedBytes = 0;

  for (const f of files) {
    if (f.visibility === "private") privateCount += 1;
    else publicCount += 1;
    totalBytes += f.size;
    if (f.storage_tier === "cf_d1") cfUsedBytes += f.size;
  }

  return noStoreJsonResponse({
    status: "ok",
    isAdmin,
    files,
    stats: {
      total: files.length,
      publicCount,
      privateCount,
      totalBytes,
      cfUsedBytes,
    },
  } satisfies PanListResponse);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanTables(db);

  const url = new URL(context.request.url);
  const action = (url.searchParams.get("action") || "upload").toLowerCase();

  try {
    if (action === "link") {
      const parsed = await readJsonBody<{
        name?: string;
        url?: string;
        size?: number;
        category?: string;
        visibility?: string;
        note?: string;
        password?: string;
      }>(context.request);
      if (!parsed.ok) {
        return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
      }

      const body = parsed.data;
      const linkUrl = (body.url || "").trim();
      if (!/^https?:\/\/\S+/i.test(linkUrl)) {
        return jsonResponse(
          { status: "error", error: "请输入有效的 http:// 或 https:// 外链地址" },
          400,
        );
      }

      const visibility = normalizeVisibility(body.visibility);
      if (visibility === "private") {
        const auth = verifyAdminPassword(context.env, context.request, body);
        if (!auth.configured) {
          return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
        }
        if (!auth.valid) {
          return jsonResponse({ status: "error", error: "添加私密资源需要管理密码" }, 401);
        }
      }

      const name =
        (body.name || "").trim() || linkUrl.split("/").pop()?.split("?")[0] || "外链资源";
      const size = Math.max(0, Number(body.size) || 0);
      const mimeType = "application/octet-stream";
      const category = normalizeCategory(body.category, name, mimeType);
      const note = (body.note || "").trim().slice(0, 300);
      const id = generatePanId();
      const now = Date.now();

      await db
        .prepare(`
          INSERT INTO pan_files
            (id, name, size, mime_type, category, visibility, storage_tier, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'external_link', ?, NULL, '[]', ?, 0, ?, ?)
        `)
        .bind(id, name, size, mimeType, category, visibility, linkUrl, note, now, now)
        .run();

      const file: PanFileItem = {
        id,
        name,
        size,
        mime_type: mimeType,
        category,
        visibility,
        storage_tier: "external_link",
        asset_url: linkUrl,
        asset_id: null,
        note,
        downloads: 0,
        created_at: now,
        updated_at: now,
      };
      return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201);
    }

    if (action === "chunk") {
      const visibility = normalizeVisibility(
        context.request.headers.get("X-Pan-Visibility") || url.searchParams.get("visibility"),
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
          { status: "error", error: "上传 >20MB 大文件需要服务端配置 GITHUB_MEDIA_TOKEN" },
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
        "chunk.bin";

      const uploaded = await uploadStreamToGitHub(
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
        name?: string;
        size?: number;
        mime_type?: string;
        category?: string;
        visibility?: string;
        note?: string;
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
          return jsonResponse({ status: "error", error: "保存私密文件需要管理密码" }, 401);
        }
      }

      const chunks = Array.isArray(body.chunks) ? body.chunks : [];
      if (chunks.length === 0) {
        return jsonResponse({ status: "error", error: "缺少分片清单 chunks" }, 400);
      }
      chunks.sort((a, b) => a.index - b.index);

      const name = (body.name || "").trim() || `file_${Date.now()}.bin`;
      const totalSize =
        Number(body.size) || chunks.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
      const mimeType = (body.mime_type || "").trim() || "application/octet-stream";
      const category = normalizeCategory(body.category, name, mimeType);
      const note = (body.note || "").trim().slice(0, 300);
      const id = generatePanId();
      const now = Date.now();

      await db
        .prepare(`
          INSERT INTO pan_files
            (id, name, size, mime_type, category, visibility, storage_tier, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'gh_chunked', '', NULL, ?, ?, 0, ?, ?)
        `)
        .bind(
          id,
          name,
          totalSize,
          mimeType,
          category,
          visibility,
          JSON.stringify(chunks),
          note,
          now,
          now,
        )
        .run();

      const file: PanFileItem = {
        id,
        name,
        size: totalSize,
        mime_type: mimeType,
        category,
        visibility,
        storage_tier: "gh_chunked",
        asset_url: "",
        asset_id: null,
        chunks,
        note,
        downloads: 0,
        created_at: now,
        updated_at: now,
      };
      return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201);
    }

    // Default: action === "upload" (<=20MB -> cf_d1, >20MB -> gh_single)
    const visibility = normalizeVisibility(
      context.request.headers.get("X-Pan-Visibility") || url.searchParams.get("visibility"),
    );
    if (visibility === "private") {
      const auth = verifyAdminPassword(context.env, context.request);
      if (!auth.configured) {
        return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
      }
      if (!auth.valid) {
        return jsonResponse({ status: "error", error: "上传私密文件需要管理密码" }, 401);
      }
    }

    const fileName =
      decodeHeaderValue(context.request.headers.get("X-File-Name")) ||
      url.searchParams.get("name") ||
      `file_${Date.now()}.bin`;
    const mimeType =
      decodeHeaderValue(context.request.headers.get("X-Pan-Mime")) ||
      context.request.headers.get("Content-Type") ||
      "application/octet-stream";
    const category = normalizeCategory(
      decodeHeaderValue(context.request.headers.get("X-Pan-Category")),
      fileName,
      mimeType,
    );
    const note = decodeHeaderValue(context.request.headers.get("X-Pan-Note")).slice(0, 300);
    const declaredSize =
      Number.parseInt(
        context.request.headers.get("X-Pan-Size") ||
          context.request.headers.get("Content-Length") ||
          "0",
        10,
      ) || 0;

    const id = generatePanId();
    const now = Date.now();

    // <= 20 MB: Cloudflare D1 chunked blob storage (0 绑卡 / 5 GB 免费 / 极速直连)
    if (declaredSize <= CF_D1_MAX_BYTES) {
      const buf = await context.request.arrayBuffer();
      const actualSize = buf.byteLength;
      if (actualSize > CF_D1_MAX_BYTES) {
        return jsonResponse(
          { status: "error", error: "文件超过 20MB，请携带 X-Pan-Size 头走 GitHub 直传通道" },
          413,
        );
      }

      const bytes = new Uint8Array(buf);
      const totalChunks = Math.max(1, Math.ceil(actualSize / CF_D1_CHUNK_BYTES));
      const insertBlobStmt = db.prepare(
        "INSERT INTO pan_blobs (file_id, chunk_index, data) VALUES (?, ?, ?)",
      );

      const batchStmts: D1PreparedStatement[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CF_D1_CHUNK_BYTES;
        const end = Math.min(actualSize, start + CF_D1_CHUNK_BYTES);
        const slice = bytes.subarray(start, end);
        batchStmts.push(insertBlobStmt.bind(id, i, slice));
        if (batchStmts.length >= 8) {
          await db.batch(batchStmts.splice(0, batchStmts.length));
        }
      }
      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
      }

      await db
        .prepare(`
          INSERT INTO pan_files
            (id, name, size, mime_type, category, visibility, storage_tier, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'cf_d1', '', NULL, '[]', ?, 0, ?, ?)
        `)
        .bind(id, fileName, actualSize, mimeType, category, visibility, note, now, now)
        .run();

      const file: PanFileItem = {
        id,
        name: fileName,
        size: actualSize,
        mime_type: mimeType,
        category,
        visibility,
        storage_tier: "cf_d1",
        asset_url: "",
        asset_id: null,
        note,
        downloads: 0,
        created_at: now,
        updated_at: now,
      };
      return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201);
    }

    // > 20 MB: stream directly to GitHub Releases v_pan
    const token =
      context.request.headers.get("X-GitHub-Token") ||
      getEnvString(context.env, "GITHUB_MEDIA_TOKEN");
    if (!token) {
      return jsonResponse(
        { status: "error", error: "上传 >20MB 文件需要服务端配置 GITHUB_MEDIA_TOKEN" },
        503,
      );
    }

    const uploaded = await uploadStreamToGitHub(token, fileName, mimeType, context.request.body);
    const finalSize = uploaded.size || declaredSize;

    await db
      .prepare(`
        INSERT INTO pan_files
          (id, name, size, mime_type, category, visibility, storage_tier, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'gh_single', ?, ?, '[]', ?, 0, ?, ?)
      `)
      .bind(
        id,
        fileName,
        finalSize,
        mimeType,
        category,
        visibility,
        uploaded.url,
        uploaded.assetId,
        note,
        now,
        now,
      )
      .run();

    const file: PanFileItem = {
      id,
      name: fileName,
      size: finalSize,
      mime_type: mimeType,
      category,
      visibility,
      storage_tier: "gh_single",
      asset_url: uploaded.url,
      asset_id: uploaded.assetId,
      note,
      downloads: 0,
      created_at: now,
      updated_at: now,
    };
    return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201);
  } catch (err) {
    return jsonResponse({ status: "error", error: getErrorMessage(err) }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanTables(db);

  const parsed = await readJsonBody<{
    id?: string;
    name?: string;
    category?: string;
    visibility?: string;
    note?: string;
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
    return jsonResponse({ status: "error", error: "缺少文件 id" }, 400);
  }

  const existing = await db
    .prepare("SELECT * FROM pan_files WHERE id = ?")
    .bind(id)
    .first<PanFileRow>();
  if (!existing) {
    return jsonResponse({ status: "error", error: "文件不存在" }, 404);
  }

  const nextName = (body.name || "").trim() || existing.name;
  const nextCategory = body.category
    ? normalizeCategory(body.category, nextName, existing.mime_type)
    : normalizeCategory(existing.category, nextName, existing.mime_type);
  const nextVisibility = body.visibility
    ? normalizeVisibility(body.visibility)
    : normalizeVisibility(existing.visibility);
  const nextNote = typeof body.note === "string" ? body.note.trim().slice(0, 300) : existing.note;
  const now = Date.now();

  await db
    .prepare(
      "UPDATE pan_files SET name = ?, category = ?, visibility = ?, note = ?, updated_at = ? WHERE id = ?",
    )
    .bind(nextName, nextCategory, nextVisibility, nextNote, now, id)
    .run();

  const updated = rowToItem({
    ...existing,
    name: nextName,
    category: nextCategory,
    visibility: nextVisibility,
    note: nextNote,
    updated_at: now,
  });

  return jsonResponse({ status: "ok", file: updated } satisfies PanUploadResponse);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanTables(db);

  const auth = verifyAdminPassword(context.env, context.request);
  if (!auth.configured) {
    return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
  }
  if (!auth.valid) {
    return jsonResponse({ status: "error", error: "删除文件需要管理密码" }, 401);
  }

  const url = new URL(context.request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    return jsonResponse({ status: "error", error: "缺少文件 id" }, 400);
  }

  const existing = await db
    .prepare("SELECT * FROM pan_files WHERE id = ?")
    .bind(id)
    .first<PanFileRow>();
  if (!existing) {
    return jsonResponse({ status: "error", error: "文件不存在或已删除" }, 404);
  }

  await db.prepare("DELETE FROM pan_blobs WHERE file_id = ?").bind(id).run();
  await db.prepare("DELETE FROM pan_files WHERE id = ?").bind(id).run();

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
