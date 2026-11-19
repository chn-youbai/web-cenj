import { type Env, getEnvString } from "./env";

/**
 * 常量时间字符串比对，避免基础时序侧信道差异
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}

/**
 * 从常见请求头 / Query / Body 中提取密码字段
 */
export function extractProvidedSecret(
  request: Request,
  body?: Record<string, unknown> | null,
  queryKeys: string[] = ["pwd", "password"],
): string {
  const url = new URL(request.url);
  const authHeader = request.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const headerPwd =
    request.headers.get("X-Admin-Password") ||
    request.headers.get("x-admin-key") ||
    request.headers.get("X-Access-Pwd") ||
    bearer;

  if (headerPwd) return headerPwd.trim();

  if (body) {
    const bodyPwd = body.password ?? body.pwd ?? body.old_pwd;
    if (typeof bodyPwd === "string" && bodyPwd.trim()) {
      return bodyPwd.trim();
    }
  }

  for (const key of queryKeys) {
    const q = url.searchParams.get(key);
    if (q?.trim()) return q.trim();
  }

  return "";
}

/**
 * 校验管理密码（完全依赖 env.ADMIN_PASSWORD，未配置则默认拒绝）
 */
export function verifyAdminPassword(
  env: Env,
  request: Request,
  body?: Record<string, unknown> | null,
): { valid: boolean; configured: boolean } {
  const expected = getEnvString(env, "ADMIN_PASSWORD");
  if (!expected) {
    return { valid: false, configured: false };
  }
  const provided = extractProvidedSecret(request, body);
  return { valid: safeEqual(provided, expected), configured: true };
}

/**
 * 校验资源网盘订阅访问密码（完全依赖 env.ACCESS_PASSWORD）
 */
export function verifyAccessPassword(
  env: Env,
  request: Request,
  body?: Record<string, unknown> | null,
): { valid: boolean; configured: boolean } {
  const expected = getEnvString(env, "ACCESS_PASSWORD");
  if (!expected) {
    return { valid: false, configured: false };
  }
  const provided = extractProvidedSecret(request, body, ["pwd", "password"]);
  return { valid: safeEqual(provided, expected), configured: true };
}

/**
 * 读取 Clash 云控系统密码：
 * 优先使用 D1 中用户自定义修改的 auth_pwd；仅当未设置时回退到 env.ADMIN_PASSWORD
 * （已移除旧版默认后门密码绕过漏洞）
 */
export async function getClashSystemPassword(
  db: D1Database | undefined,
  env: Env,
): Promise<string> {
  if (db) {
    try {
      const row = await db
        .prepare("SELECT result FROM clash_control WHERE id = 'auth_pwd'")
        .first<{ result?: string }>();
      if (row?.result?.trim()) {
        return row.result.trim();
      }
    } catch {
      // ignore D1 lookup failure and fallback to env
    }
  }
  return getEnvString(env, "ADMIN_PASSWORD");
}

/**
 * 校验 Clash 云控权限（守护进程密钥 或 系统密码）
 */
export async function verifyClashAuth(
  request: Request,
  env: Env,
  providedPwd: string,
): Promise<boolean> {
  const expectedDaemonSecret = getEnvString(env, "CLASH_DAEMON_SECRET");
  const daemonSecret = (request.headers.get("X-Clash-Daemon-Secret") || "").trim();
  if (expectedDaemonSecret && safeEqual(daemonSecret, expectedDaemonSecret)) {
    return true;
  }

  const systemPwd = await getClashSystemPassword(env.DB, env);
  if (!systemPwd) return false;
  return safeEqual(providedPwd.trim(), systemPwd);
}
