/**
 * HTTP 响应、CORS 与输入清理工具
 */

export const DEFAULT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Range, X-API-Key, X-Admin-Password, x-admin-key, X-Access-Pwd, X-Clash-Daemon-Secret, X-GitHub-Token, X-File-Name, X-Title, X-Duration, X-Poster-Url, X-Pan-Visibility, X-Pan-Category, X-Pan-Note, X-Pan-Mime, X-Pan-Size, X-Pan-Folder, X-Pan-Overwrite, X-Pan-Storage-Tier, X-Media-Kind, X-Media-Album, X-Media-Visibility, X-Media-Width, X-Media-Height, X-Media-Size, X-Media-Desc, X-Media-Mime",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...DEFAULT_CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function noStoreJsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(data, status, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    ...extraHeaders,
  });
}

export function noContentOptions(methods = "GET, POST, PATCH, DELETE, HEAD, OPTIONS"): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...DEFAULT_CORS_HEADERS,
      "Access-Control-Allow-Methods": methods,
    },
  });
}

export async function readJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const data = (await request.json()) as T;
    if (!data || typeof data !== "object") {
      return { ok: false };
    }
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown server error";
}
