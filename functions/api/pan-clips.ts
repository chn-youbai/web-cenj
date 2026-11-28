import type {
  PanClipConsumeResponse,
  PanClipCreateResponse,
  PanClipItem,
  PanClipKind,
  PanClipsListResponse,
  PanVisibility,
} from "../../shared/types";
import { ensurePanClipsTable } from "../_lib/db";
import type { Env } from "../_lib/env";
import {
  getErrorMessage,
  jsonResponse,
  noContentOptions,
  noStoreJsonResponse,
  readJsonBody,
} from "../_lib/http";
import { buildPanCorsHeaders, resolvePanAuth } from "../_lib/pan-auth";

const MAX_CLIP_TEXT_LEN = 100_000;
const MAX_CLIP_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TTL_MINUTES = 24 * 60;
const MAX_TTL_MINUTES = 7 * 24 * 60;

interface PanClipRow {
  id: string;
  kind: string;
  content: string;
  image_data?: unknown;
  image_mime: string;
  image_size: number;
  visibility: string;
  burn_after_read: number;
  expires_at: number;
  created_at: number;
}

function generateClipId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `clip_${ts}_${rand}`;
}

function normalizeVisibility(raw: unknown): PanVisibility {
  return String(raw || "")
    .trim()
    .toLowerCase() === "private"
    ? "private"
    : "public";
}

function normalizeTtlMinutes(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MINUTES;
  return Math.max(1, Math.min(MAX_TTL_MINUTES, Math.round(n)));
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data as number[]);
  return new Uint8Array(0);
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function parseDataUrlImage(raw: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(raw.trim());
  if (!m) return null;
  const mime = (m[1] || "image/png").toLowerCase();
  const b64 = m[2] || "";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mime };
}

function rowToClipItem(row: PanClipRow, revealBurned = false, pwdParam = ""): PanClipItem {
  const burnAfterRead = Number(row.burn_after_read) === 1;
  const masked = burnAfterRead && !revealBurned;
  const hasImage = Number(row.image_size) > 0;
  const kind: PanClipKind =
    row.kind === "image" || row.kind === "mixed" || row.kind === "text" ? row.kind : "text";
  const visibility = normalizeVisibility(row.visibility);

  let imageUrl: string | undefined;
  if (hasImage && !masked) {
    const base = `/api/pan-clips?action=image&id=${encodeURIComponent(row.id)}`;
    imageUrl =
      visibility === "private" && pwdParam ? `${base}&pwd=${encodeURIComponent(pwdParam)}` : base;
  }

  const rawContent = masked ? "" : row.content || "";
  const preview = masked
    ? "阅后即焚内容（点击查看并复制后将立即销毁）"
    : rawContent.slice(0, 140) || (hasImage ? `[截图 · ${row.image_mime || "image"}]` : "");

  return {
    id: row.id,
    kind,
    content: rawContent,
    preview,
    has_image: hasImage,
    image_mime: row.image_mime || "",
    image_size: Number(row.image_size) || 0,
    image_url: imageUrl,
    visibility,
    burn_after_read: burnAfterRead,
    expires_at: Number(row.expires_at) || 0,
    created_at: Number(row.created_at) || 0,
  };
}

async function purgeExpiredClips(db: D1Database, now: number): Promise<void> {
  await db.prepare("DELETE FROM pan_clips WHERE expires_at <= ?").bind(now).run();
}

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const origin = context.request.headers.get("Origin");
  if (origin) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key, X-Admin-Password, x-admin-key, X-Access-Pwd",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }
  return noContentOptions("GET, POST, DELETE, OPTIONS");
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return noStoreJsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanClipsTable(db);

  const url = new URL(context.request.url);
  const action = (url.searchParams.get("action") || "").toLowerCase();
  const now = Date.now();
  await purgeExpiredClips(db, now);

  const authCtx = await resolvePanAuth(context.env, context.request);
  const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

  if (authCtx.providedCredentials && !authCtx.authenticated) {
    return noStoreJsonResponse(
      { status: "error", error: authCtx.authError || "鉴权失败" },
      authCtx.authStatus || 401,
      corsHeaders,
    );
  }
  if (authCtx.authenticated && authCtx.keyRecord && !authCtx.canRead) {
    return noStoreJsonResponse(
      { status: "error", error: "该 API Key 无读取权限" },
      403,
      corsHeaders,
    );
  }

  if (action === "image") {
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) {
      return noStoreJsonResponse({ status: "error", error: "缺少剪切板 id" }, 400, corsHeaders);
    }

    const row = await db
      .prepare(
        "SELECT id, kind, content, image_data, image_mime, image_size, visibility, burn_after_read, expires_at, created_at FROM pan_clips WHERE id = ? AND expires_at > ?",
      )
      .bind(id, now)
      .first<PanClipRow>();

    if (!row || Number(row.image_size) <= 0 || !row.image_data) {
      return noStoreJsonResponse(
        { status: "error", error: "图片不存在或已过期" },
        404,
        corsHeaders,
      );
    }

    if (row.visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
      return noStoreJsonResponse(
        { status: "error", error: "访问私密剪切板图片需要管理员权限" },
        authCtx.authenticated ? 403 : 401,
        corsHeaders,
      );
    }

    if (Number(row.burn_after_read) === 1) {
      return noStoreJsonResponse(
        { status: "error", error: "阅后即焚图片需通过确认查看接口一次性提取" },
        403,
        corsHeaders,
      );
    }

    const bytes = toUint8Array(row.image_data);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": row.image_mime || "image/png",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": row.visibility === "private" ? "private, no-store" : "public, max-age=300",
        "Access-Control-Allow-Origin": corsHeaders["Access-Control-Allow-Origin"] || "*",
      },
    });
  }

  const canViewPrivate = authCtx.authenticated && authCtx.canPrivate;
  const pwdParam = (url.searchParams.get("pwd") || "").trim();

  const sql = canViewPrivate
    ? "SELECT id, kind, content, image_mime, image_size, visibility, burn_after_read, expires_at, created_at FROM pan_clips WHERE expires_at > ? ORDER BY created_at DESC LIMIT 80"
    : "SELECT id, kind, content, image_mime, image_size, visibility, burn_after_read, expires_at, created_at FROM pan_clips WHERE expires_at > ? AND visibility = 'public' ORDER BY created_at DESC LIMIT 80";

  const rows = await db.prepare(sql).bind(now).all<PanClipRow>();
  const clips = (rows.results || []).map((r) => rowToClipItem(r, false, pwdParam));

  const body: PanClipsListResponse = {
    status: "ok",
    isAdmin: authCtx.isAdmin,
    clips,
    activeCount: clips.length,
  };
  return noStoreJsonResponse(body, 200, corsHeaders);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanClipsTable(db);

  const url = new URL(context.request.url);
  const action = (url.searchParams.get("action") || "").toLowerCase();
  const contentType = context.request.headers.get("Content-Type") || "";
  const now = Date.now();
  await purgeExpiredClips(db, now);

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      const pwdVal = formData.get("password") ?? formData.get("pwd");
      const bodyAuthFields =
        typeof pwdVal === "string" && pwdVal.trim() ? { password: pwdVal.trim() } : null;

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
        return jsonResponse({ status: "error", error: "该 API Key 无写入权限" }, 403, corsHeaders);
      }

      const readText = (key: string): string => {
        const v = formData.get(key);
        return typeof v === "string" ? v : "";
      };

      const visibility = normalizeVisibility(readText("visibility"));
      if (visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
        return jsonResponse(
          { status: "error", error: "发布私密剪切板需要管理密码或私密权限 API Key" },
          authCtx.authenticated ? 403 : 401,
          corsHeaders,
        );
      }

      const rawText = readText("content").replace(/\r\n/g, "\n");
      if (rawText.length > MAX_CLIP_TEXT_LEN) {
        return jsonResponse(
          { status: "error", error: "文本内容过长，单条上限 100,000 字符" },
          413,
          corsHeaders,
        );
      }

      const candidate = formData.get("image") as unknown;
      let imageBytes: Uint8Array | null = null;
      let imageMime = "";
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        typeof (candidate as File).arrayBuffer === "function"
      ) {
        const imgFile = candidate as File;
        if (imgFile.size > MAX_CLIP_IMAGE_BYTES) {
          return jsonResponse(
            { status: "error", error: "截图体积不能超过 5 MB" },
            413,
            corsHeaders,
          );
        }
        const mime = (imgFile.type || "image/png").toLowerCase();
        if (!mime.startsWith("image/")) {
          return jsonResponse(
            { status: "error", error: "仅支持粘贴或选择图片文件" },
            400,
            corsHeaders,
          );
        }
        const buf = await imgFile.arrayBuffer();
        if (buf.byteLength > 0) {
          imageBytes = new Uint8Array(buf);
          imageMime = mime;
        }
      }

      if (!rawText.trim() && !imageBytes) {
        return jsonResponse(
          { status: "error", error: "请输入文字内容或粘贴截图图片" },
          400,
          corsHeaders,
        );
      }

      const ttlMinutes = normalizeTtlMinutes(readText("ttlMinutes"));
      const burnAfterRead =
        readText("burn_after_read") === "1" || readText("burn_after_read") === "true" ? 1 : 0;
      const kind: PanClipKind =
        rawText.trim() && imageBytes ? "mixed" : imageBytes ? "image" : "text";
      const id = generateClipId();
      const expiresAt = now + ttlMinutes * 60_000;

      await db
        .prepare(`
          INSERT INTO pan_clips
            (id, kind, content, image_data, image_mime, image_size, visibility, burn_after_read, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          kind,
          rawText,
          imageBytes,
          imageMime,
          imageBytes ? imageBytes.byteLength : 0,
          visibility,
          burnAfterRead,
          expiresAt,
          now,
        )
        .run();

      const clip = rowToClipItem({
        id,
        kind,
        content: rawText,
        image_mime: imageMime,
        image_size: imageBytes ? imageBytes.byteLength : 0,
        visibility,
        burn_after_read: burnAfterRead,
        expires_at: expiresAt,
        created_at: now,
      });

      return jsonResponse({ status: "ok", clip } satisfies PanClipCreateResponse, 201, corsHeaders);
    }

    const parsed = await readJsonBody<{
      action?: string;
      id?: string;
      content?: string;
      image_data_url?: string;
      ttlMinutes?: number;
      burn_after_read?: boolean;
      visibility?: string;
      password?: string;
    }>(context.request);

    if (!parsed.ok) {
      return jsonResponse({ status: "error", error: "请求体必须为 JSON 或 FormData" }, 400);
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

    const effectiveAction = (action || body.action || "").toLowerCase();

    if (effectiveAction === "consume") {
      if (authCtx.authenticated && authCtx.keyRecord && !authCtx.canRead) {
        return jsonResponse({ status: "error", error: "该 API Key 无读取权限" }, 403, corsHeaders);
      }

      const id = (body.id || url.searchParams.get("id") || "").trim();
      if (!id) {
        return jsonResponse({ status: "error", error: "缺少剪切板 id" }, 400, corsHeaders);
      }

      const row = await db
        .prepare("SELECT * FROM pan_clips WHERE id = ? AND expires_at > ?")
        .bind(id, now)
        .first<PanClipRow>();

      if (!row) {
        return jsonResponse(
          { status: "error", error: "剪切板内容不存在、已过期或已被销毁" },
          404,
          corsHeaders,
        );
      }

      if (row.visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
        return jsonResponse(
          { status: "error", error: "查看私密剪切板需要管理员权限" },
          authCtx.authenticated ? 403 : 401,
          corsHeaders,
        );
      }

      const burn = Number(row.burn_after_read) === 1;
      if (burn) {
        await db.prepare("DELETE FROM pan_clips WHERE id = ?").bind(id).run();
      }

      let imageDataUrl: string | undefined;
      if (Number(row.image_size) > 0 && row.image_data) {
        const bytes = toUint8Array(row.image_data);
        if (bytes.byteLength > 0) {
          imageDataUrl = `data:${row.image_mime || "image/png"};base64,${bytesToBase64(bytes)}`;
        }
      }

      const resp: PanClipConsumeResponse = {
        status: "ok",
        clip: rowToClipItem(row, true),
        image_data_url: imageDataUrl,
        burned: burn,
      };
      return noStoreJsonResponse(resp, 200, corsHeaders);
    }

    if (authCtx.authenticated && authCtx.keyRecord && !authCtx.canWrite) {
      return jsonResponse({ status: "error", error: "该 API Key 无写入权限" }, 403, corsHeaders);
    }

    const visibility = normalizeVisibility(body.visibility);
    if (visibility === "private" && !(authCtx.authenticated && authCtx.canPrivate)) {
      return jsonResponse(
        { status: "error", error: "发布私密剪切板需要管理密码或私密权限 API Key" },
        authCtx.authenticated ? 403 : 401,
        corsHeaders,
      );
    }

    const rawText = typeof body.content === "string" ? body.content.replace(/\r\n/g, "\n") : "";
    if (rawText.length > MAX_CLIP_TEXT_LEN) {
      return jsonResponse(
        { status: "error", error: "文本内容过长，单条上限 100,000 字符" },
        413,
        corsHeaders,
      );
    }

    let imageBytes: Uint8Array | null = null;
    let imageMime = "";
    if (typeof body.image_data_url === "string" && body.image_data_url.trim()) {
      const parsedImg = parseDataUrlImage(body.image_data_url);
      if (!parsedImg) {
        return jsonResponse({ status: "error", error: "图片数据格式无效" }, 400, corsHeaders);
      }
      if (parsedImg.bytes.byteLength > MAX_CLIP_IMAGE_BYTES) {
        return jsonResponse({ status: "error", error: "截图体积不能超过 5 MB" }, 413, corsHeaders);
      }
      imageBytes = parsedImg.bytes;
      imageMime = parsedImg.mime;
    }

    if (!rawText.trim() && !imageBytes) {
      return jsonResponse(
        { status: "error", error: "请输入文字内容或粘贴截图图片" },
        400,
        corsHeaders,
      );
    }

    const ttlMinutes = normalizeTtlMinutes(body.ttlMinutes);
    const burnAfterRead = body.burn_after_read ? 1 : 0;
    const kind: PanClipKind =
      rawText.trim() && imageBytes ? "mixed" : imageBytes ? "image" : "text";
    const id = generateClipId();
    const expiresAt = now + ttlMinutes * 60_000;

    await db
      .prepare(`
        INSERT INTO pan_clips
          (id, kind, content, image_data, image_mime, image_size, visibility, burn_after_read, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        kind,
        rawText,
        imageBytes,
        imageMime,
        imageBytes ? imageBytes.byteLength : 0,
        visibility,
        burnAfterRead,
        expiresAt,
        now,
      )
      .run();

    const clip = rowToClipItem({
      id,
      kind,
      content: rawText,
      image_mime: imageMime,
      image_size: imageBytes ? imageBytes.byteLength : 0,
      visibility,
      burn_after_read: burnAfterRead,
      expires_at: expiresAt,
      created_at: now,
    });

    return jsonResponse({ status: "ok", clip } satisfies PanClipCreateResponse, 201, corsHeaders);
  } catch (err) {
    return jsonResponse({ status: "error", error: getErrorMessage(err) }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }
  await ensurePanClipsTable(db);

  const authCtx = await resolvePanAuth(context.env, context.request);
  const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

  if (!authCtx.authenticated) {
    return jsonResponse(
      { status: "error", error: authCtx.authError || "删除剪切板需要管理密码或 API Key" },
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
    return jsonResponse({ status: "error", error: "缺少剪切板 id" }, 400, corsHeaders);
  }

  await db.prepare("DELETE FROM pan_clips WHERE id = ?").bind(id).run();
  return jsonResponse({ status: "ok" }, 200, corsHeaders);
};
