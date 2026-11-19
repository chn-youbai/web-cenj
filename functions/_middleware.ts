import type { Env } from "./_lib/env";
import { getErrorMessage, jsonResponse, noContentOptions } from "./_lib/http";

/**
 * Cloudflare Pages 全局中间件
 * 统一处理 /api/* 的 CORS 预检、安全异常兜底，并移除已废弃的 /exam 重定向规则
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const isApi = url.pathname.startsWith("/api/");

  if (isApi && context.request.method === "OPTIONS") {
    return noContentOptions();
  }

  try {
    return await context.next();
  } catch (err) {
    if (isApi) {
      return jsonResponse(
        {
          status: "error",
          message: getErrorMessage(err),
        },
        500,
      );
    }
    throw err;
  }
};
