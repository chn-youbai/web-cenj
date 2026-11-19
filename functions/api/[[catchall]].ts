import type { Env } from "../_lib/env";
import { jsonResponse, noContentOptions } from "../_lib/http";

/**
 * 未匹配 API 路由兜底：返回标准 404 JSON，已彻底移除旧版 Vercel 反向代理
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === "OPTIONS") {
    return noContentOptions();
  }

  const url = new URL(context.request.url);
  return jsonResponse(
    {
      status: "error",
      error: "Not Found",
      message: `API endpoint not found: ${url.pathname}`,
      path: url.pathname,
    },
    404,
  );
};
