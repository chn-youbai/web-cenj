import type { PanApiKeyCreateResponse, PanApiKeysListResponse } from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import { ensurePanTables } from "../_lib/db";
import type { Env } from "../_lib/env";
import { jsonResponse, noContentOptions, noStoreJsonResponse, readJsonBody } from "../_lib/http";
import {
  type PanApiKeyRow,
  generatePanApiKeySecret,
  hashPanApiKey,
  panKeyRowToItem,
  parseAllowedOrigins,
} from "../_lib/pan-auth";

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, PATCH, DELETE, OPTIONS");
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = verifyAdminPassword(context.env, context.request);
  if (!auth.configured) {
    return noStoreJsonResponse(
      {
        status: "error",
        keys: [],
        error: "服务端未配置 ADMIN_PASSWORD",
      } satisfies PanApiKeysListResponse,
      503,
    );
  }
  if (!auth.valid) {
    return noStoreJsonResponse(
      { status: "error", keys: [], error: "管理密码错误" } satisfies PanApiKeysListResponse,
      401,
    );
  }

  const db = context.env.DB;
  if (!db) {
    return noStoreJsonResponse(
      {
        status: "error",
        keys: [],
        error: "Cloudflare D1 数据库未绑定",
      } satisfies PanApiKeysListResponse,
      503,
    );
  }

  await ensurePanTables(db);
  const { results } = await db
    .prepare("SELECT * FROM pan_api_keys ORDER BY created_at DESC")
    .all<PanApiKeyRow>();

  const now = Date.now();
  const keys = (results || []).map((r) => panKeyRowToItem(r, now));
  return noStoreJsonResponse({ status: "ok", keys } satisfies PanApiKeysListResponse);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await readJsonBody<{
    label?: string;
    can_read?: boolean;
    can_write?: boolean;
    can_delete?: boolean;
    can_private?: boolean;
    allowed_origins?: string[] | string;
    ttlDays?: number | null;
    expires_at?: number | null;
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

  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }

  await ensurePanTables(db);

  const label = (body.label || "").trim().slice(0, 80) || "外部接入密钥";
  const canRead = body.can_read !== false ? 1 : 0;
  const canWrite = body.can_write !== false ? 1 : 0;
  const canDelete = body.can_delete === true ? 1 : 0;
  const canPrivate = body.can_private === true ? 1 : 0;
  const originsList = parseAllowedOrigins(body.allowed_origins);
  const originsRaw = originsList.join(",");

  const now = Date.now();
  let expiresAt: number | null = null;
  if (
    typeof body.expires_at === "number" &&
    Number.isFinite(body.expires_at) &&
    body.expires_at > now
  ) {
    expiresAt = Math.floor(body.expires_at);
  } else if (
    typeof body.ttlDays === "number" &&
    Number.isFinite(body.ttlDays) &&
    body.ttlDays > 0
  ) {
    expiresAt = now + Math.round(body.ttlDays * 24 * 60 * 60 * 1000);
  }

  const id = `key_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const { secret, prefix } = generatePanApiKeySecret();
  const keyHash = await hashPanApiKey(secret);

  await db
    .prepare(`
      INSERT INTO pan_api_keys
        (id, label, key_prefix, key_hash, can_read, can_write, can_delete, can_private, allowed_origins, expires_at, revoked, use_count, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?)
    `)
    .bind(
      id,
      label,
      prefix,
      keyHash,
      canRead,
      canWrite,
      canDelete,
      canPrivate,
      originsRaw,
      expiresAt,
      now,
    )
    .run();

  const keyItem = panKeyRowToItem(
    {
      id,
      label,
      key_prefix: prefix,
      key_hash: keyHash,
      can_read: canRead,
      can_write: canWrite,
      can_delete: canDelete,
      can_private: canPrivate,
      allowed_origins: originsRaw,
      expires_at: expiresAt,
      revoked: 0,
      use_count: 0,
      last_used_at: null,
      created_at: now,
    },
    now,
  );

  return noStoreJsonResponse(
    { status: "ok", key: keyItem, secret } satisfies PanApiKeyCreateResponse,
    201,
  );
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const parsed = await readJsonBody<{
    id?: string;
    revoked?: boolean;
    label?: string;
    can_read?: boolean;
    can_write?: boolean;
    can_delete?: boolean;
    can_private?: boolean;
    allowed_origins?: string[] | string;
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

  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }

  await ensurePanTables(db);
  const id = (body.id || "").trim();
  if (!id) {
    return jsonResponse({ status: "error", error: "缺少密钥 id" }, 400);
  }

  const existing = await db
    .prepare("SELECT * FROM pan_api_keys WHERE id = ?")
    .bind(id)
    .first<PanApiKeyRow>();
  if (!existing) {
    return jsonResponse({ status: "error", error: "API Key 不存在" }, 404);
  }

  const nextLabel =
    typeof body.label === "string"
      ? body.label.trim().slice(0, 80) || existing.label
      : existing.label;
  const nextRead = typeof body.can_read === "boolean" ? (body.can_read ? 1 : 0) : existing.can_read;
  const nextWrite =
    typeof body.can_write === "boolean" ? (body.can_write ? 1 : 0) : existing.can_write;
  const nextDelete =
    typeof body.can_delete === "boolean" ? (body.can_delete ? 1 : 0) : existing.can_delete;
  const nextPrivate =
    typeof body.can_private === "boolean" ? (body.can_private ? 1 : 0) : existing.can_private;
  const nextRevoked = typeof body.revoked === "boolean" ? (body.revoked ? 1 : 0) : existing.revoked;
  const nextOrigins =
    body.allowed_origins !== undefined
      ? parseAllowedOrigins(body.allowed_origins).join(",")
      : existing.allowed_origins;

  await db
    .prepare(`
      UPDATE pan_api_keys
      SET label = ?, can_read = ?, can_write = ?, can_delete = ?, can_private = ?, allowed_origins = ?, revoked = ?
      WHERE id = ?
    `)
    .bind(nextLabel, nextRead, nextWrite, nextDelete, nextPrivate, nextOrigins, nextRevoked, id)
    .run();

  const updated = panKeyRowToItem({
    ...existing,
    label: nextLabel,
    can_read: nextRead,
    can_write: nextWrite,
    can_delete: nextDelete,
    can_private: nextPrivate,
    allowed_origins: nextOrigins,
    revoked: nextRevoked,
  });
  return noStoreJsonResponse({ status: "ok", key: updated });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = verifyAdminPassword(context.env, context.request);
  if (!auth.configured) {
    return jsonResponse({ status: "error", error: "服务端未配置 ADMIN_PASSWORD" }, 503);
  }
  if (!auth.valid) {
    return jsonResponse({ status: "error", error: "管理密码错误" }, 401);
  }

  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "Cloudflare D1 数据库未绑定" }, 503);
  }

  await ensurePanTables(db);
  const url = new URL(context.request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    return jsonResponse({ status: "error", error: "缺少密钥 id" }, 400);
  }

  await db.prepare("DELETE FROM pan_api_keys WHERE id = ?").bind(id).run();
  return noStoreJsonResponse({ status: "ok", id });
};
