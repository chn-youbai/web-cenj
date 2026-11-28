import { ensurePanTables } from "../_lib/db";
import { type Env, getEnvString } from "../_lib/env";
import { jsonResponse, noContentOptions } from "../_lib/http";
import { buildPanCorsHeaders, recordPanApiKeyUsage, resolvePanAuth } from "../_lib/pan-auth";
import { type PanFileRow, streamPanFileResponse } from "../_lib/pan-storage";

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
      "SELECT id, name, size, mime_type, visibility, storage_tier, folder_path, asset_url, chunks_json, updated_at FROM pan_files WHERE id = ?",
    )
    .bind(id)
    .first<PanFileRow>();

  if (!file) {
    return jsonResponse({ status: "error", error: "文件不存在" }, 404);
  }

  const authCtx = await resolvePanAuth(context.env, context.request);
  const corsHeaders = buildPanCorsHeaders(context.request, authCtx);

  if (file.visibility === "private") {
    if (!authCtx.authenticated) {
      if (!authCtx.providedCredentials && !getEnvString(context.env, "ADMIN_PASSWORD")) {
        return jsonResponse(
          { status: "error", error: "服务端未配置 ADMIN_PASSWORD" },
          503,
          corsHeaders,
        );
      }
      return jsonResponse(
        {
          status: "error",
          error: authCtx.authError || "无权访问私密文件，请先解锁管理权限或携带有效 API Key",
        },
        authCtx.authStatus || 401,
        corsHeaders,
      );
    }
    if (!authCtx.canRead || !authCtx.canPrivate) {
      return jsonResponse(
        { status: "error", error: "该 API Key 无权访问私密文件" },
        403,
        corsHeaders,
      );
    }
    recordPanApiKeyUsage(context, authCtx);
  }

  return streamPanFileResponse(context, file, {
    isHead,
    inline,
    corsHeaders,
    redirectExternalFallback: true,
  });
}
