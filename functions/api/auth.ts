import { verifyAdminPassword } from "../_lib/auth";
import type { Env } from "../_lib/env";
import { jsonResponse, noContentOptions, readJsonBody } from "../_lib/http";

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("POST, OPTIONS");
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await readJsonBody<{ password?: string; pwd?: string }>(context.request);
  const body = parsed.ok ? parsed.data : {};

  const auth = verifyAdminPassword(context.env, context.request, body);
  if (!auth.configured) {
    return jsonResponse(
      { status: "error", ok: false, message: "服务端尚未配置 ADMIN_PASSWORD 环境变量" },
      503,
    );
  }
  if (!auth.valid) {
    return jsonResponse({ status: "error", ok: false, message: "访问密码错误" }, 401);
  }

  return jsonResponse({ status: "ok", ok: true });
};
