/**
 * Cloudflare Pages Functions 环境变量与绑定类型定义
 */

export interface Env {
  DB?: D1Database;
  CLICKS_KV?: KVNamespace;
  TAKEOUT_KV?: KVNamespace;
  ASSETS?: Fetcher;

  // 密钥与账号配置（均通过 Cloudflare Pages Environment Variables / Secrets 注入）
  ADMIN_PASSWORD?: string;
  ACCESS_PASSWORD?: string;
  CLASH_DAEMON_SECRET?: string;
  DJJC_TOKEN?: string;
  VPN07_EMAIL?: string;
  VPN07_PASSWORD?: string;
  APPLE_ID_EMAIL?: string;
  APPLE_ID_PASSWORD?: string;
  GITHUB_MEDIA_TOKEN?: string;
}

export type AppContext<Params extends Record<string, string> = Record<string, string>> =
  EventContext<Env, keyof Params & string, unknown>;

export function getEnvString(env: Env, key: keyof Env): string {
  const val = env[key];
  return typeof val === "string" ? val.trim() : "";
}
