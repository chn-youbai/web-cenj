import type { PanApiKeyItem, PanApiKeyStatus } from "../../shared/types";
import { safeEqual, verifyAdminPassword } from "./auth";
import { ensurePanTables } from "./db";
import { type Env, getEnvString } from "./env";
import { DEFAULT_CORS_HEADERS } from "./http";

export interface PanApiKeyRow {
  id: string;
  label: string;
  key_prefix: string;
  key_hash: string;
  can_read: number;
  can_write: number;
  can_delete: number;
  can_private: number;
  allowed_origins: string;
  expires_at: number | null;
  revoked: number;
  use_count: number;
  last_used_at: number | null;
  created_at: number;
}

export interface PanAuthContext {
  providedCredentials: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  keyRecord: PanApiKeyRow | null;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canPrivate: boolean;
  allowedOrigins: string[];
  originAllowed: boolean;
  authError?: string;
  authStatus?: 401 | 403 | 503;
}

export function computePanKeyStatus(row: PanApiKeyRow, now = Date.now()): PanApiKeyStatus {
  if (row.revoked) return "revoked";
  if (row.expires_at !== null && now > Number(row.expires_at)) return "expired";
  return "active";
}

export function parseAllowedOrigins(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 32);
  }
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 32);
}

export function panKeyRowToItem(row: PanApiKeyRow, now = Date.now()): PanApiKeyItem {
  return {
    id: row.id,
    label: row.label || "",
    key_prefix: row.key_prefix,
    can_read: Boolean(row.can_read),
    can_write: Boolean(row.can_write),
    can_delete: Boolean(row.can_delete),
    can_private: Boolean(row.can_private),
    allowed_origins: parseAllowedOrigins(row.allowed_origins),
    expires_at: row.expires_at !== null ? Number(row.expires_at) : null,
    revoked: Boolean(row.revoked),
    status: computePanKeyStatus(row, now),
    use_count: Number(row.use_count) || 0,
    last_used_at: row.last_used_at !== null ? Number(row.last_used_at) : null,
    created_at: Number(row.created_at) || 0,
  };
}

export async function hashPanApiKey(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generatePanApiKeySecret(): { secret: string; prefix: string } {
  const randomHex = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const secret = `cjp_${randomHex}`;
  return {
    secret,
    prefix: secret.slice(0, 12),
  };
}

export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
    return true;
  }
  if (!origin) {
    // Non-browser clients (curl / WebDAV / server scripts) do not send Origin
    return true;
  }
  const normalizedOrigin = origin.trim().toLowerCase().replace(/\/+$/, "");
  for (const rawPattern of allowedOrigins) {
    const pattern = rawPattern.trim().toLowerCase().replace(/\/+$/, "");
    if (!pattern) continue;
    if (pattern === "*" || pattern === normalizedOrigin) {
      return true;
    }
    if (pattern.includes("://*.")) {
      const [scheme, hostPattern] = pattern.split("://*.");
      const [originScheme, originHost] = normalizedOrigin.split("://");
      if (
        scheme &&
        hostPattern &&
        originScheme === scheme &&
        originHost &&
        (originHost === hostPattern || originHost.endsWith(`.${hostPattern}`))
      ) {
        return true;
      }
    }
  }
  return false;
}

export function extractBasicAuthCredentials(
  request: Request,
): { username: string; password: string } | null {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("basic ")) return null;
  const encoded = auth.slice(6).trim();
  if (!encoded) return null;
  try {
    const decoded = atob(encoded);
    const colonIdx = decoded.indexOf(":");
    if (colonIdx < 0) {
      return { username: decoded.trim(), password: "" };
    }
    return {
      username: decoded.slice(0, colonIdx).trim(),
      password: decoded.slice(colonIdx + 1).trim(),
    };
  } catch {
    return null;
  }
}

export function extractPanApiKey(request: Request): string {
  const headerKey = (request.headers.get("X-API-Key") || "").trim();
  if (headerKey) return headerKey;

  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const basic = extractBasicAuthCredentials(request);
  if (basic) {
    if (basic.password) return basic.password;
    if (basic.username) return basic.username;
  }

  const url = new URL(request.url);
  const queryKey = (url.searchParams.get("api_key") || "").trim();
  if (queryKey) return queryKey;

  return "";
}

export async function resolvePanAuth(
  env: Env,
  request: Request,
  body?: Record<string, unknown> | null,
): Promise<PanAuthContext> {
  const adminCheck = verifyAdminPassword(env, request, body);
  if (adminCheck.configured && adminCheck.valid) {
    return {
      providedCredentials: true,
      authenticated: true,
      isAdmin: true,
      keyRecord: null,
      canRead: true,
      canWrite: true,
      canDelete: true,
      canPrivate: true,
      allowedOrigins: [],
      originAllowed: true,
    };
  }

  // Also allow ADMIN_PASSWORD via HTTP Basic Auth (useful for WebDAV admin clients)
  const expectedAdmin = getEnvString(env, "ADMIN_PASSWORD");
  const basic = extractBasicAuthCredentials(request);
  if (
    expectedAdmin &&
    basic &&
    (safeEqual(basic.password, expectedAdmin) ||
      (!basic.password && safeEqual(basic.username, expectedAdmin)))
  ) {
    return {
      providedCredentials: true,
      authenticated: true,
      isAdmin: true,
      keyRecord: null,
      canRead: true,
      canWrite: true,
      canDelete: true,
      canPrivate: true,
      allowedOrigins: [],
      originAllowed: true,
    };
  }

  const candidateKey = extractPanApiKey(request);
  const hasAdminHeader = Boolean(
    request.headers.get("X-Admin-Password") ||
      request.headers.get("x-admin-key") ||
      request.headers.get("X-Access-Pwd") ||
      (body &&
        typeof (body.password ?? body.pwd) === "string" &&
        String(body.password ?? body.pwd).trim()),
  );

  if (!candidateKey) {
    return {
      providedCredentials: hasAdminHeader,
      authenticated: false,
      isAdmin: false,
      keyRecord: null,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canPrivate: false,
      allowedOrigins: [],
      originAllowed: true,
      authError: hasAdminHeader ? "管理密码错误" : undefined,
      authStatus: hasAdminHeader ? 401 : undefined,
    };
  }

  const db = env.DB;
  if (!db) {
    return {
      providedCredentials: true,
      authenticated: false,
      isAdmin: false,
      keyRecord: null,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canPrivate: false,
      allowedOrigins: [],
      originAllowed: true,
      authError: "Cloudflare D1 数据库未绑定",
      authStatus: 503,
    };
  }

  await ensurePanTables(db);
  const keyHash = await hashPanApiKey(candidateKey);
  const row = await db
    .prepare("SELECT * FROM pan_api_keys WHERE key_hash = ?")
    .bind(keyHash)
    .first<PanApiKeyRow>();

  if (!row) {
    return {
      providedCredentials: true,
      authenticated: false,
      isAdmin: false,
      keyRecord: null,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canPrivate: false,
      allowedOrigins: [],
      originAllowed: true,
      authError: "无效的 API Key 或管理密码",
      authStatus: 401,
    };
  }

  const status = computePanKeyStatus(row);
  if (status === "revoked") {
    return {
      providedCredentials: true,
      authenticated: false,
      isAdmin: false,
      keyRecord: row,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canPrivate: false,
      allowedOrigins: [],
      originAllowed: true,
      authError: "API Key 已被吊销",
      authStatus: 401,
    };
  }
  if (status === "expired") {
    return {
      providedCredentials: true,
      authenticated: false,
      isAdmin: false,
      keyRecord: row,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canPrivate: false,
      allowedOrigins: [],
      originAllowed: true,
      authError: "API Key 已过期",
      authStatus: 401,
    };
  }

  const allowedOrigins = parseAllowedOrigins(row.allowed_origins);
  const origin = request.headers.get("Origin");
  const originAllowed = isOriginAllowed(origin, allowedOrigins);
  if (!originAllowed) {
    return {
      providedCredentials: true,
      authenticated: false,
      isAdmin: false,
      keyRecord: row,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canPrivate: false,
      allowedOrigins,
      originAllowed: false,
      authError: "当前来源域名不在 API Key 白名单内",
      authStatus: 403,
    };
  }

  return {
    providedCredentials: true,
    authenticated: true,
    isAdmin: false,
    keyRecord: row,
    canRead: Boolean(row.can_read),
    canWrite: Boolean(row.can_write),
    canDelete: Boolean(row.can_delete),
    canPrivate: Boolean(row.can_private),
    allowedOrigins,
    originAllowed: true,
  };
}

export function buildPanCorsHeaders(
  request: Request,
  authCtx?: PanAuthContext | null,
): Record<string, string> {
  if (
    !authCtx?.keyRecord ||
    authCtx.allowedOrigins.length === 0 ||
    authCtx.allowedOrigins.includes("*")
  ) {
    return {};
  }
  const origin = request.headers.get("Origin");
  if (!origin || !isOriginAllowed(origin, authCtx.allowedOrigins)) {
    return {
      "Access-Control-Allow-Origin": authCtx.allowedOrigins[0] || "*",
      Vary: "Origin",
    };
  }
  return {
    ...DEFAULT_CORS_HEADERS,
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function recordPanApiKeyUsage(
  context: EventContext<Env, string, unknown>,
  authCtx: PanAuthContext,
): void {
  const db = context.env.DB;
  if (!db || !authCtx.authenticated || !authCtx.keyRecord) return;
  const keyId = authCtx.keyRecord.id;
  const now = Date.now();
  context.waitUntil(
    db
      .prepare("UPDATE pan_api_keys SET use_count = use_count + 1, last_used_at = ? WHERE id = ?")
      .bind(now, keyId)
      .run()
      .catch(() => undefined),
  );
}

export function sanitizeFolderPath(raw: string | null | undefined):
  | {
      ok: true;
      path: string;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!raw) return { ok: true, path: "" };
  const replaced = raw.replace(/\\/g, "/").trim();
  if (!replaced || replaced === "/") return { ok: true, path: "" };
  if (replaced.includes("\0")) {
    return { ok: false, error: "目录路径包含非法字符" };
  }
  const segments = replaced.split("/").filter((s) => s.length > 0 && s !== ".");
  for (const seg of segments) {
    if (seg === "..") {
      return { ok: false, error: "目录路径不允许包含 .." };
    }
  }
  return { ok: true, path: segments.join("/") };
}

export async function ensureFolderHierarchy(
  db: D1Database,
  visibility: "public" | "private",
  folderPath: string,
  now = Date.now(),
): Promise<void> {
  if (!folderPath) return;
  const parts = folderPath.split("/").filter(Boolean);
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    await db
      .prepare("INSERT OR IGNORE INTO pan_folders (visibility, path, created_at) VALUES (?, ?, ?)")
      .bind(visibility, acc, now)
      .run();
  }
}
