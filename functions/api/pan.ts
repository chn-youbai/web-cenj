import type {
  PanChunkMeta,
  PanChunkUploadResponse,
  PanFileItem,
  PanListResponse,
  PanUploadResponse,
} from "../../shared/types";
import { ensurePanTables } from "../_lib/db";
import { type Env, getEnvString } from "../_lib/env";
import {
  getErrorMessage,
  jsonResponse,
  noContentOptions,
  noStoreJsonResponse,
  readJsonBody,
} from "../_lib/http";
import {
  buildPanCorsHeaders,
  ensureFolderHierarchy,
  recordPanApiKeyUsage,
  resolvePanAuth,
  sanitizeFolderPath,
} from "../_lib/pan-auth";
import {
  CF_D1_MAX_BYTES,
  type PanFileRow,
  deletePanFileRecord,
  generatePanId,
  normalizeCategory,
  normalizeVisibility,
  rowToPanItem,
  saveD1Blobs,
  uploadStreamToGitHub,
} from "../_lib/pan-storage";

export { CF_D1_CHUNK_BYTES, CF_D1_MAX_BYTES } from "../_lib/pan-storage";

const GH_SINGLE_MAX_BYTES = 90 * 1024 * 1024;

function decodeHeaderValue(raw: string | null): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const origin = context.request.headers.get("Origin");
  if (origin) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, Range, X-API-Key, X-Admin-Password, x-admin-key, X-Access-Pwd, X-GitHub-Token, X-File-Name, X-Pan-Visibility, X-Pan-Category, X-Pan-Note, X-Pan-Mime, X-Pan-Size, X-Pan-Folder, X-Pan-Overwrite, X-Pan-Storage-Tier",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }
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
  const authCtx = await resolvePanAuth(context.env, context.request);
  const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

  const hasApiKeyAttempt = Boolean(
    context.request.headers.get("X-API-Key") ||
      context.request.headers.get("Authorization") ||
      new URL(context.request.url).searchParams.get("api_key"),
  );

  if (hasApiKeyAttempt && !authCtx.authenticated) {
    return noStoreJsonResponse(
      {
        status: "error",
        isAdmin: false,
        files: [],
        stats: { total: 0, publicCount: 0, privateCount: 0, totalBytes: 0, cfUsedBytes: 0 },
        message: authCtx.authError || "鉴权失败",
      } satisfies PanListResponse,
      authCtx.authStatus || 401,
      corsHeaders,
    );
  }

  if (authCtx.authenticated && authCtx.keyRecord) {
    if (!authCtx.canRead) {
      return noStoreJsonResponse(
        {
          status: "error",
          isAdmin: false,
          files: [],
          stats: { total: 0, publicCount: 0, privateCount: 0, totalBytes: 0, cfUsedBytes: 0 },
          message: "该 API Key 无读取权限",
        } satisfies PanListResponse,
        403,
        corsHeaders,
      );
    }
    recordPanApiKeyUsage(context, authCtx);
  }

  const canViewPrivate = authCtx.isAdmin || (authCtx.authenticated && authCtx.canPrivate);
  const query = canViewPrivate
    ? "SELECT * FROM pan_files ORDER BY created_at DESC"
    : "SELECT * FROM pan_files WHERE visibility = 'public' ORDER BY created_at DESC";

  const { results } = await db.prepare(query).all<PanFileRow>();
  let files = (results || []).map(rowToPanItem);

  const url = new URL(context.request.url);
  const folderParam = url.searchParams.get("folder");
  if (folderParam !== null) {
    const parsedFolder = sanitizeFolderPath(folderParam);
    if (!parsedFolder.ok) {
      return noStoreJsonResponse(
        {
          status: "error",
          isAdmin: authCtx.isAdmin,
          files: [],
          stats: { total: 0, publicCount: 0, privateCount: 0, totalBytes: 0, cfUsedBytes: 0 },
          message: parsedFolder.error,
        } satisfies PanListResponse,
        400,
        corsHeaders,
      );
    }
    files = files.filter((f) => (f.folder_path || "") === parsedFolder.path);
  }

  const visFilter = url.searchParams.get("visibility");
  if (visFilter === "public" || visFilter === "private") {
    files = files.filter((f) => f.visibility === visFilter);
  }

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

  return noStoreJsonResponse(
    {
      status: "ok",
      isAdmin: authCtx.isAdmin,
      files,
      stats: {
        total: files.length,
        publicCount,
        privateCount,
        totalBytes,
        cfUsedBytes,
      },
    } satisfies PanListResponse,
    200,
    corsHeaders,
  );
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
        folder_path?: string;
        note?: string;
        password?: string;
      }>(context.request);
      if (!parsed.ok) {
        return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
      }

      const body = parsed.data;
      const authCtx = await resolvePanAuth(context.env, context.request, body);
      const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

      if (authCtx.providedCredentials && !authCtx.authenticated) {
        return jsonResponse(
          { status: "error", error: authCtx.authError || "鉴权失败" },
          authCtx.authStatus || 401,
          corsHeaders,
        );
      }
      if (authCtx.authenticated && authCtx.keyRecord && !authCtx.canWrite) {
        return jsonResponse({ status: "error", error: "该 API Key 无写入权限" }, 403, corsHeaders);
      }

      const linkUrl = (body.url || "").trim();
      if (!/^https?:\/\/\S+/i.test(linkUrl)) {
        return jsonResponse(
          { status: "error", error: "请输入有效的 http:// 或 https:// 外链地址" },
          400,
          corsHeaders,
        );
      }

      const visibility = normalizeVisibility(body.visibility);
      if (visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
        return jsonResponse(
          { status: "error", error: "添加私密资源需要管理密码或带私密权限的 API Key" },
          authCtx.authenticated ? 403 : 401,
          corsHeaders,
        );
      }

      const folderParsed = sanitizeFolderPath(body.folder_path);
      if (!folderParsed.ok) {
        return jsonResponse({ status: "error", error: folderParsed.error }, 400, corsHeaders);
      }
      const folderPath = folderParsed.path;

      const name =
        (body.name || "").trim() || linkUrl.split("/").pop()?.split("?")[0] || "外链资源";
      const size = Math.max(0, Number(body.size) || 0);
      const mimeType = "application/octet-stream";
      const category = normalizeCategory(body.category, name, mimeType);
      const note = (body.note || "").trim().slice(0, 300);
      const id = generatePanId();
      const now = Date.now();

      if (folderPath) {
        await ensureFolderHierarchy(db, visibility, folderPath, now);
      }

      await db
        .prepare(`
          INSERT INTO pan_files
            (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'external_link', ?, ?, NULL, '[]', ?, 0, ?, ?)
        `)
        .bind(id, name, size, mimeType, category, visibility, folderPath, linkUrl, note, now, now)
        .run();

      recordPanApiKeyUsage(context, authCtx);
      const file = rowToPanItem({
        id,
        name,
        size,
        mime_type: mimeType,
        category,
        visibility,
        storage_tier: "external_link",
        folder_path: folderPath,
        asset_url: linkUrl,
        asset_id: null,
        chunks_json: "[]",
        note,
        downloads: 0,
        created_at: now,
        updated_at: now,
      });
      return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201, corsHeaders);
    }

    if (action === "chunk") {
      const authCtx = await resolvePanAuth(context.env, context.request);
      const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

      if (authCtx.providedCredentials && !authCtx.authenticated) {
        return jsonResponse(
          { status: "error", error: authCtx.authError || "鉴权失败" },
          authCtx.authStatus || 401,
          corsHeaders,
        );
      }
      if (authCtx.authenticated && authCtx.keyRecord && !authCtx.canWrite) {
        return jsonResponse({ status: "error", error: "该 API Key 无上传权限" }, 403, corsHeaders);
      }

      const visibility = normalizeVisibility(
        context.request.headers.get("X-Pan-Visibility") || url.searchParams.get("visibility"),
      );
      if (visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
        return jsonResponse(
          { status: "error", error: "上传私密分片需要管理密码或带私密权限的 API Key" },
          authCtx.authenticated ? 403 : 401,
          corsHeaders,
        );
      }

      const token =
        context.request.headers.get("X-GitHub-Token") ||
        getEnvString(context.env, "GITHUB_MEDIA_TOKEN");
      if (!token) {
        return jsonResponse(
          { status: "error", error: "上传 >20MB 大文件需要服务端配置 GITHUB_MEDIA_TOKEN" },
          503,
          corsHeaders,
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

      recordPanApiKeyUsage(context, authCtx);
      const resp: PanChunkUploadResponse = {
        status: "ok",
        chunk: {
          index: chunkIndex,
          url: uploaded.url,
          asset_id: uploaded.assetId ?? undefined,
          size: uploaded.size,
        },
      };
      return jsonResponse(resp, 200, corsHeaders);
    }

    if (action === "commit_chunks") {
      const parsed = await readJsonBody<{
        name?: string;
        size?: number;
        mime_type?: string;
        category?: string;
        visibility?: string;
        folder_path?: string;
        note?: string;
        chunks?: PanChunkMeta[];
        password?: string;
      }>(context.request);
      if (!parsed.ok) {
        return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
      }

      const body = parsed.data;
      const authCtx = await resolvePanAuth(context.env, context.request, body);
      const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

      if (authCtx.providedCredentials && !authCtx.authenticated) {
        return jsonResponse(
          { status: "error", error: authCtx.authError || "鉴权失败" },
          authCtx.authStatus || 401,
          corsHeaders,
        );
      }
      if (authCtx.authenticated && authCtx.keyRecord && !authCtx.canWrite) {
        return jsonResponse({ status: "error", error: "该 API Key 无写入权限" }, 403, corsHeaders);
      }

      const visibility = normalizeVisibility(body.visibility);
      if (visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
        return jsonResponse(
          { status: "error", error: "保存私密文件需要管理密码或带私密权限的 API Key" },
          authCtx.authenticated ? 403 : 401,
          corsHeaders,
        );
      }

      const folderParsed = sanitizeFolderPath(body.folder_path);
      if (!folderParsed.ok) {
        return jsonResponse({ status: "error", error: folderParsed.error }, 400, corsHeaders);
      }
      const folderPath = folderParsed.path;

      const chunks = Array.isArray(body.chunks) ? body.chunks : [];
      if (chunks.length === 0) {
        return jsonResponse({ status: "error", error: "缺少分片清单 chunks" }, 400, corsHeaders);
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

      if (folderPath) {
        await ensureFolderHierarchy(db, visibility, folderPath, now);
      }

      await db
        .prepare(`
          INSERT INTO pan_files
            (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'gh_chunked', ?, '', NULL, ?, ?, 0, ?, ?)
        `)
        .bind(
          id,
          name,
          totalSize,
          mimeType,
          category,
          visibility,
          folderPath,
          JSON.stringify(chunks),
          note,
          now,
          now,
        )
        .run();

      recordPanApiKeyUsage(context, authCtx);
      const file = rowToPanItem({
        id,
        name,
        size: totalSize,
        mime_type: mimeType,
        category,
        visibility,
        storage_tier: "gh_chunked",
        folder_path: folderPath,
        asset_url: "",
        asset_id: null,
        chunks_json: JSON.stringify(chunks),
        note,
        downloads: 0,
        created_at: now,
        updated_at: now,
      });
      return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201, corsHeaders);
    }

    // Default: action === "upload" (supports both multipart/form-data and raw binary stream)
    const contentTypeHeader = (context.request.headers.get("Content-Type") || "").toLowerCase();
    const isMultipart = contentTypeHeader.includes("multipart/form-data");

    let formData: FormData | null = null;
    let formFile: File | null = null;
    let bodyAuthFields: Record<string, unknown> | null = null;

    if (isMultipart) {
      formData = await context.request.formData();
      const candidate = formData.get("file") as unknown;
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        typeof (candidate as File).arrayBuffer !== "function"
      ) {
        return jsonResponse(
          { status: "error", error: "multipart/form-data 请求必须包含 file 字段" },
          400,
        );
      }
      formFile = candidate as File;
      const pwdVal = formData.get("password") ?? formData.get("pwd");
      if (typeof pwdVal === "string" && pwdVal.trim()) {
        bodyAuthFields = { password: pwdVal.trim() };
      }
    }

    const authCtx = await resolvePanAuth(context.env, context.request, bodyAuthFields);
    const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

    if (authCtx.providedCredentials && !authCtx.authenticated) {
      return jsonResponse(
        { status: "error", error: authCtx.authError || "鉴权失败" },
        authCtx.authStatus || 401,
        corsHeaders,
      );
    }
    if (authCtx.authenticated && authCtx.keyRecord && !authCtx.canWrite) {
      return jsonResponse({ status: "error", error: "该 API Key 无上传权限" }, 403, corsHeaders);
    }

    const readFormText = (key: string): string => {
      if (!formData) return "";
      const v = formData.get(key);
      return typeof v === "string" ? v.trim() : "";
    };

    const visibility = normalizeVisibility(
      readFormText("visibility") ||
        context.request.headers.get("X-Pan-Visibility") ||
        url.searchParams.get("visibility"),
    );

    if (visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
      return jsonResponse(
        { status: "error", error: "上传私密文件需要管理密码或带私密权限的 API Key" },
        authCtx.authenticated ? 403 : 401,
        corsHeaders,
      );
    }

    const folderParsed = sanitizeFolderPath(
      readFormText("folder_path") ||
        readFormText("folder") ||
        decodeHeaderValue(context.request.headers.get("X-Pan-Folder")) ||
        url.searchParams.get("folder") ||
        url.searchParams.get("folder_path"),
    );
    if (!folderParsed.ok) {
      return jsonResponse({ status: "error", error: folderParsed.error }, 400, corsHeaders);
    }
    const folderPath = folderParsed.path;

    const overwriteFlag =
      readFormText("overwrite") === "1" ||
      readFormText("overwrite") === "true" ||
      context.request.headers.get("X-Pan-Overwrite") === "1" ||
      url.searchParams.get("overwrite") === "1";

    if (overwriteFlag && !(authCtx.authenticated && authCtx.canDelete)) {
      return jsonResponse(
        { status: "error", error: "同名覆盖需要管理员密码或具备删除权限的 API Key" },
        authCtx.authenticated ? 403 : 401,
        corsHeaders,
      );
    }

    const fileName =
      readFormText("name") ||
      (formFile ? formFile.name : "") ||
      decodeHeaderValue(context.request.headers.get("X-File-Name")) ||
      url.searchParams.get("name") ||
      `file_${Date.now()}.bin`;

    const mimeType =
      readFormText("mime_type") ||
      (formFile?.type ? formFile.type : "") ||
      decodeHeaderValue(context.request.headers.get("X-Pan-Mime")) ||
      (!isMultipart ? context.request.headers.get("Content-Type") || "" : "") ||
      "application/octet-stream";

    const category = normalizeCategory(
      readFormText("category") || decodeHeaderValue(context.request.headers.get("X-Pan-Category")),
      fileName,
      mimeType,
    );

    const note = (
      readFormText("note") || decodeHeaderValue(context.request.headers.get("X-Pan-Note"))
    ).slice(0, 300);

    const rawRequestedTier = (
      readFormText("storage_tier") ||
      decodeHeaderValue(context.request.headers.get("X-Pan-Storage-Tier")) ||
      url.searchParams.get("storage_tier") ||
      ""
    ).toLowerCase();

    if (rawRequestedTier && !["auto", "cf_d1", "gh_single"].includes(rawRequestedTier)) {
      return jsonResponse(
        {
          status: "error",
          error: "storage_tier 仅支持 auto、cf_d1 或 gh_single（分片请走 chunk 接口）",
        },
        400,
        corsHeaders,
      );
    }

    const requestedTier = (rawRequestedTier || "auto") as "auto" | "cf_d1" | "gh_single";
    if (requestedTier !== "auto" && !(authCtx.authenticated && authCtx.isAdmin)) {
      return jsonResponse(
        { status: "error", error: "仅管理员可指定上传储存方式" },
        authCtx.authenticated ? 403 : 401,
        corsHeaders,
      );
    }

    const declaredSize = formFile
      ? formFile.size
      : Number.parseInt(
          context.request.headers.get("X-Pan-Size") ||
            context.request.headers.get("Content-Length") ||
            "0",
          10,
        ) || 0;

    if (requestedTier === "cf_d1" && declaredSize > CF_D1_MAX_BYTES) {
      return jsonResponse(
        {
          status: "error",
          error: "CF D1 边缘库单文件上限 20MB，请选择 GitHub 直传或分片存储",
        },
        413,
        corsHeaders,
      );
    }

    if (requestedTier === "gh_single" && declaredSize > GH_SINGLE_MAX_BYTES) {
      return jsonResponse(
        {
          status: "error",
          error: "GitHub 直传单文件上限 90MB，请使用分片上传",
        },
        413,
        corsHeaders,
      );
    }

    if (overwriteFlag) {
      const existing = await db
        .prepare("SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?")
        .bind(visibility, folderPath, fileName)
        .first<PanFileRow>();
      if (existing) {
        await deletePanFileRecord(db, context.env, existing, (p) => context.waitUntil(p));
      }
    }

    const id = generatePanId();
    const now = Date.now();
    if (folderPath) {
      await ensureFolderHierarchy(db, visibility, folderPath, now);
    }

    const useD1 =
      requestedTier === "cf_d1" || (requestedTier === "auto" && declaredSize <= CF_D1_MAX_BYTES);

    // Cloudflare D1 chunked blob storage (<= 20 MB)
    if (useD1) {
      const buf = formFile ? await formFile.arrayBuffer() : await context.request.arrayBuffer();
      const actualSize = buf.byteLength;
      if (actualSize > CF_D1_MAX_BYTES) {
        return jsonResponse(
          { status: "error", error: "文件超过 20MB，请携带 X-Pan-Size 头走 GitHub 直传通道" },
          413,
          corsHeaders,
        );
      }

      await saveD1Blobs(db, id, new Uint8Array(buf));

      await db
        .prepare(`
          INSERT INTO pan_files
            (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'cf_d1', ?, '', NULL, '[]', ?, 0, ?, ?)
        `)
        .bind(id, fileName, actualSize, mimeType, category, visibility, folderPath, note, now, now)
        .run();

      recordPanApiKeyUsage(context, authCtx);
      const file: PanFileItem = rowToPanItem({
        id,
        name: fileName,
        size: actualSize,
        mime_type: mimeType,
        category,
        visibility,
        storage_tier: "cf_d1",
        folder_path: folderPath,
        asset_url: "",
        asset_id: null,
        chunks_json: "[]",
        note,
        downloads: 0,
        created_at: now,
        updated_at: now,
      });
      return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201, corsHeaders);
    }

    // Stream directly to GitHub Releases v_pan
    const token =
      context.request.headers.get("X-GitHub-Token") ||
      getEnvString(context.env, "GITHUB_MEDIA_TOKEN");
    if (!token) {
      return jsonResponse(
        { status: "error", error: "上传至 GitHub Releases 需要服务端配置 GITHUB_MEDIA_TOKEN" },
        503,
        corsHeaders,
      );
    }

    const uploadBody = formFile ? formFile.stream() : context.request.body;
    const uploaded = await uploadStreamToGitHub(token, fileName, mimeType, uploadBody);
    const finalSize = uploaded.size || declaredSize;

    await db
      .prepare(`
        INSERT INTO pan_files
          (id, name, size, mime_type, category, visibility, storage_tier, folder_path, asset_url, asset_id, chunks_json, note, downloads, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'gh_single', ?, ?, ?, '[]', ?, 0, ?, ?)
      `)
      .bind(
        id,
        fileName,
        finalSize,
        mimeType,
        category,
        visibility,
        folderPath,
        uploaded.url,
        uploaded.assetId,
        note,
        now,
        now,
      )
      .run();

    recordPanApiKeyUsage(context, authCtx);
    const file: PanFileItem = rowToPanItem({
      id,
      name: fileName,
      size: finalSize,
      mime_type: mimeType,
      category,
      visibility,
      storage_tier: "gh_single",
      folder_path: folderPath,
      asset_url: uploaded.url,
      asset_id: uploaded.assetId,
      chunks_json: "[]",
      note,
      downloads: 0,
      created_at: now,
      updated_at: now,
    });
    return jsonResponse({ status: "ok", file } satisfies PanUploadResponse, 201, corsHeaders);
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
    folder_path?: string;
    note?: string;
    password?: string;
  }>(context.request);
  if (!parsed.ok) {
    return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
  }

  const body = parsed.data;
  const authCtx = await resolvePanAuth(context.env, context.request, body);
  const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

  if (!authCtx.authenticated) {
    if (!authCtx.providedCredentials && !getEnvString(context.env, "ADMIN_PASSWORD")) {
      return jsonResponse(
        { status: "error", error: "服务端未配置 ADMIN_PASSWORD" },
        503,
        corsHeaders,
      );
    }
    return jsonResponse(
      { status: "error", error: authCtx.authError || "编辑文件需要管理密码或 API Key" },
      authCtx.authStatus || 401,
      corsHeaders,
    );
  }
  if (authCtx.keyRecord && !authCtx.canWrite) {
    return jsonResponse({ status: "error", error: "该 API Key 无编辑权限" }, 403, corsHeaders);
  }

  const id = (body.id || "").trim();
  if (!id) {
    return jsonResponse({ status: "error", error: "缺少文件 id" }, 400, corsHeaders);
  }

  const existing = await db
    .prepare("SELECT * FROM pan_files WHERE id = ?")
    .bind(id)
    .first<PanFileRow>();
  if (!existing) {
    return jsonResponse({ status: "error", error: "文件不存在" }, 404, corsHeaders);
  }

  const nextName = (body.name || "").trim() || existing.name;
  const nextCategory = body.category
    ? normalizeCategory(body.category, nextName, existing.mime_type)
    : normalizeCategory(existing.category, nextName, existing.mime_type);
  const nextVisibility = body.visibility
    ? normalizeVisibility(body.visibility)
    : normalizeVisibility(existing.visibility);

  if ((existing.visibility === "private" || nextVisibility === "private") && !authCtx.canPrivate) {
    return jsonResponse(
      { status: "error", error: "该 API Key 无权修改或设为私密文件" },
      403,
      corsHeaders,
    );
  }

  let nextFolder = existing.folder_path || "";
  if (typeof body.folder_path === "string") {
    const folderParsed = sanitizeFolderPath(body.folder_path);
    if (!folderParsed.ok) {
      return jsonResponse({ status: "error", error: folderParsed.error }, 400, corsHeaders);
    }
    nextFolder = folderParsed.path;
  }

  const nextNote = typeof body.note === "string" ? body.note.trim().slice(0, 300) : existing.note;
  const now = Date.now();

  if (nextFolder) {
    await ensureFolderHierarchy(db, nextVisibility, nextFolder, now);
  }

  await db
    .prepare(
      "UPDATE pan_files SET name = ?, category = ?, visibility = ?, folder_path = ?, note = ?, updated_at = ? WHERE id = ?",
    )
    .bind(nextName, nextCategory, nextVisibility, nextFolder, nextNote, now, id)
    .run();

  recordPanApiKeyUsage(context, authCtx);
  const updated = rowToPanItem({
    ...existing,
    name: nextName,
    category: nextCategory,
    visibility: nextVisibility,
    folder_path: nextFolder,
    note: nextNote,
    updated_at: now,
  });

  return jsonResponse(
    { status: "ok", file: updated } satisfies PanUploadResponse,
    200,
    corsHeaders,
  );
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanTables(db);

  const authCtx = await resolvePanAuth(context.env, context.request);
  const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

  if (!authCtx.authenticated) {
    if (!authCtx.providedCredentials && !getEnvString(context.env, "ADMIN_PASSWORD")) {
      return jsonResponse(
        { status: "error", error: "服务端未配置 ADMIN_PASSWORD" },
        503,
        corsHeaders,
      );
    }
    return jsonResponse(
      { status: "error", error: authCtx.authError || "删除文件需要管理密码或 API Key" },
      authCtx.authStatus || 401,
      corsHeaders,
    );
  }
  if (authCtx.keyRecord && !authCtx.canDelete) {
    return jsonResponse({ status: "error", error: "该 API Key 无删除权限" }, 403, corsHeaders);
  }

  const url = new URL(context.request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    return jsonResponse({ status: "error", error: "缺少文件 id" }, 400, corsHeaders);
  }

  const existing = await db
    .prepare("SELECT * FROM pan_files WHERE id = ?")
    .bind(id)
    .first<PanFileRow>();
  if (!existing) {
    return jsonResponse({ status: "error", error: "文件不存在或已删除" }, 404, corsHeaders);
  }

  if (existing.visibility === "private" && !authCtx.canPrivate) {
    return jsonResponse(
      { status: "error", error: "该 API Key 无权删除私密文件" },
      403,
      corsHeaders,
    );
  }

  await deletePanFileRecord(db, context.env, existing, (p) => context.waitUntil(p));
  recordPanApiKeyUsage(context, authCtx);

  return jsonResponse({ status: "ok", id }, 200, corsHeaders);
};
