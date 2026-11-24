import type { AppleIdGuideCredentials, SubscriptionResponse } from "../../shared/types";
import { getClashPayloadJson, setClashPayloadJson } from "../_lib/db";
import { type Env, getEnvString } from "../_lib/env";
import { getErrorMessage, jsonResponse, noContentOptions, readJsonBody } from "../_lib/http";

const DJJC_DOMAINS = ["dash.djjc.cfd", "sub.djjc.cfd", "api.djjc.cfd", "djjc.cfd"];
const SUB_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours auto-refresh

function isSubCacheFresh(cached: { data: SubscriptionResponse; updatedAt?: string }): boolean {
  let syncedMs = typeof cached.data.synced_at === "number" ? cached.data.synced_at : 0;
  if (!syncedMs && cached.updatedAt) {
    const iso = cached.updatedAt.includes("T")
      ? cached.updatedAt
      : `${cached.updatedAt.replace(" ", "T")}Z`;
    const parsed = Date.parse(iso);
    if (Number.isFinite(parsed)) syncedMs = parsed;
  }
  if (!syncedMs) return false;
  return Date.now() - syncedMs < SUB_CACHE_TTL_MS;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, OPTIONS");
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0.00 GB";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "长期有效";
  const d = new Date(timestamp * 1000);
  if (Number.isNaN(d.getTime())) return "长期有效";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseUserInfoHeader(header: string | null): Record<string, number> {
  const parts: Record<string, number> = {};
  if (!header) return parts;
  for (const item of header.split(";")) {
    const [k, v] = item.trim().split("=");
    if (k && v) {
      const parsed = Number.parseInt(v, 10);
      if (!Number.isNaN(parsed)) {
        parts[k.toLowerCase()] = parsed;
      }
    }
  }
  return parts;
}

function getAppleIdCredentials(env: Env): AppleIdGuideCredentials | null {
  const email = getEnvString(env, "APPLE_ID_EMAIL");
  const password = getEnvString(env, "APPLE_ID_PASSWORD");
  if (!email || !password) return null;
  return { email, password };
}

async function getDjjcToken(env: Env): Promise<string> {
  const d1Config = await getClashPayloadJson<{ token?: string }>(env.DB, "djjc_config");
  return d1Config?.data.token?.trim() || getEnvString(env, "DJJC_TOKEN");
}

async function getVpn07Credentials(env: Env): Promise<{ email: string; password: string }> {
  let email = getEnvString(env, "VPN07_EMAIL");
  let password = getEnvString(env, "VPN07_PASSWORD");

  if ((!email || !password) && env.DB) {
    const cached = await getClashPayloadJson<{ email?: string; password?: string }>(
      env.DB,
      "vpn07_credentials",
    );
    if (cached?.data.email && cached?.data.password) {
      email = cached.data.email;
      password = cached.data.password;
    }
  }

  return { email, password };
}

interface Vpn07LoginResp {
  message?: string;
  data?: {
    auth_data?: string;
    token?: string;
  };
}

interface Vpn07SubResp {
  message?: string;
  data?: {
    subscribe_url?: string;
    transfer_enable?: number;
    u?: number;
    d?: number;
    expired_at?: number;
    plan_name?: string;
    plan?: { name?: string };
    reset_day?: number;
  };
}

async function fetchFromVpn07(email: string, password: string): Promise<SubscriptionResponse> {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const loginRes = await fetch("https://vpn07.com/api/v1/passport/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ua,
    },
    body: JSON.stringify({ email, password }),
  });

  const loginJson = (await loginRes.json()) as Vpn07LoginResp;
  if (!loginRes.ok || !loginJson?.data) {
    throw new Error(loginJson?.message || `登录失败 (HTTP ${loginRes.status})`);
  }

  const token = loginJson.data.auth_data || loginJson.data.token;
  if (!token) {
    throw new Error("登录成功但未返回有效认证 Token");
  }

  const authHeaders = {
    "User-Agent": ua,
    Authorization: token,
  };

  const [subRes, infoRes] = await Promise.all([
    fetch("https://vpn07.com/api/v1/user/getSubscribe", { headers: authHeaders })
      .then((r) => r.json() as Promise<Vpn07SubResp>)
      .catch(() => null),
    fetch("https://vpn07.com/api/v1/user/info", { headers: authHeaders })
      .then((r) => r.json() as Promise<Vpn07SubResp>)
      .catch(() => null),
  ]);

  let subUrl = subRes?.data?.subscribe_url;
  if (!subUrl && loginJson.data.token) {
    subUrl = `https://vpn07.vip/cdn/baidu?token=${loginJson.data.token}`;
  }

  if (!subUrl) {
    throw new Error(subRes?.message || "未能获取到订阅直链");
  }

  const info = { ...(infoRes?.data || {}), ...(subRes?.data || {}) };
  let transferEnable = info.transfer_enable || 0;
  let used = (info.u || 0) + (info.d || 0);
  let remaining = Math.max(0, transferEnable - used);
  let expiredAt = info.expired_at || 0;

  try {
    const headRes = await fetch(subUrl, {
      method: "HEAD",
      headers: { "User-Agent": "ClashMetaForAndroid/v2.11.36" },
    });
    const parts = parseUserInfoHeader(headRes.headers.get("subscription-userinfo"));
    if (parts.total && parts.total > 0) transferEnable = parts.total;
    if (parts.upload !== undefined && parts.download !== undefined) {
      used = parts.upload + parts.download;
      remaining = Math.max(0, transferEnable - used);
    }
    if (parts.expire) expiredAt = parts.expire;
  } catch (err) {
    console.warn("读取 subscription-userinfo 标头失败:", err);
  }

  return {
    success: true,
    airport_type: "vpn07",
    airport_name: "VPN07",
    subscribe_url: subUrl,
    relay_url: "/api/sub?type=vpn07",
    plan_name:
      info.plan_name || info.plan?.name || (transferEnable > 0 ? "VIP 正式套餐" : "已订阅套餐"),
    expired_at: expiredAt,
    expired_date_str: formatDate(expiredAt),
    traffic: {
      total: formatBytes(transferEnable),
      used: formatBytes(used),
      remaining: formatBytes(remaining),
      percent: transferEnable > 0 ? Math.min(100, Math.round((used / transferEnable) * 100)) : 0,
    },
    reset_day: info.reset_day || null,
    account_email: email,
    synced_at: Date.now(),
  };
}

async function fetchFromDjjc(token: string): Promise<SubscriptionResponse> {
  let subUrl = `https://${DJJC_DOMAINS[0]}/api/v1/client/subscribe?token=${encodeURIComponent(token)}`;
  let transferEnable = 214748364800; // 200 GB 默认基线
  let used = 0;
  let remaining = transferEnable;
  let expiredAt = 0;

  for (const domain of DJJC_DOMAINS) {
    try {
      const testUrl = `https://${domain}/api/v1/client/subscribe?token=${encodeURIComponent(token)}`;
      const headRes = await fetch(testUrl, {
        method: "HEAD",
        headers: { "User-Agent": "ClashMetaForAndroid/v2.11.36" },
      });
      if (headRes.ok) {
        subUrl = testUrl;
        const parts = parseUserInfoHeader(headRes.headers.get("subscription-userinfo"));
        if (parts.total && parts.total > 0) transferEnable = parts.total;
        if (parts.upload !== undefined && parts.download !== undefined) {
          used = parts.upload + parts.download;
          remaining = Math.max(0, transferEnable - used);
        }
        if (parts.expire) expiredAt = parts.expire;
        break;
      }
    } catch {
      console.warn(`顶级机场域名 ${domain} 探活失败`);
    }
  }

  return {
    success: true,
    airport_type: "djjc",
    airport_name: "顶级机场",
    subscribe_url: subUrl,
    relay_url: "/api/sub?type=djjc",
    plan_name: "长期有效畅游套餐",
    expired_at: expiredAt,
    expired_date_str: formatDate(expiredAt),
    traffic: {
      total: formatBytes(transferEnable),
      used: formatBytes(used),
      remaining: formatBytes(remaining),
      percent: transferEnable > 0 ? Math.min(100, Math.round((used / transferEnable) * 100)) : 0,
    },
    reset_day: null,
    synced_at: Date.now(),
  };
}

interface SubscriptionPostBody extends Record<string, unknown> {
  pwd?: string;
  password?: string;
  type?: string;
  action?: string;
  refresh?: boolean;
  token?: string;
  email?: string;
  vpn_password?: string;
  vpnPassword?: string;
  password_val?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return noContentOptions("GET, POST, OPTIONS");
  }

  let body: SubscriptionPostBody = {};
  if (request.method === "POST") {
    const parsed = await readJsonBody<SubscriptionPostBody>(request);
    if (parsed.ok) body = parsed.data;
  }

  const appleId = getAppleIdCredentials(env);
  const airportType = (
    url.searchParams.get("type") ||
    url.searchParams.get("airport") ||
    body.type ||
    "vpn07"
  ).toLowerCase();
  const action = url.searchParams.get("action") || body.action || "";
  const forceRefresh = url.searchParams.get("refresh") === "true" || body.refresh === true;

  if (airportType === "djjc" || airportType === "dingji") {
    if (action === "set_djjc_token" || action === "set_token") {
      const newToken = (body.token || url.searchParams.get("token") || "").trim();
      if (!newToken) {
        return jsonResponse({ success: false, message: "Token 不能为空" }, 400);
      }
      try {
        await setClashPayloadJson(env.DB, "djjc_config", { token: newToken });
      } catch (err) {
        return jsonResponse({ success: false, message: getErrorMessage(err) }, 500);
      }
      return jsonResponse({ success: true, message: "顶级机场 Token 更新成功" });
    }

    if (!forceRefresh && env.DB) {
      const cached = await getClashPayloadJson<SubscriptionResponse>(env.DB, "djjc_sub");
      if (cached && isSubCacheFresh(cached)) {
        return jsonResponse({
          ...cached.data,
          apple_id: appleId,
          from_cache: true,
          cached_at: cached.updatedAt,
        });
      }
    }

    const djjcToken = await getDjjcToken(env);
    if (!djjcToken) {
      return jsonResponse({
        success: true,
        airport_type: "djjc",
        airport_name: "顶级机场",
        subscribe_url: "",
        relay_url: "/api/sub?type=djjc",
        plan_name: "未配置 Token",
        expired_date_str: "--",
        traffic: { total: "--", used: "--", remaining: "--", percent: 0 },
        need_credentials: true,
        from_cache: false,
        apple_id: appleId,
        warning: "未配置 DJJC_TOKEN 环境变量且 D1 中无绑定 Token",
      });
    }

    try {
      const data = await fetchFromDjjc(djjcToken);
      if (env.DB) {
        try {
          await setClashPayloadJson(env.DB, "djjc_sub", data);
        } catch {
          // ignore cache write failure
        }
      }
      return jsonResponse({ ...data, apple_id: appleId, from_cache: false });
    } catch (err) {
      return jsonResponse({
        success: true,
        airport_type: "djjc",
        airport_name: "顶级机场",
        subscribe_url: `https://${DJJC_DOMAINS[0]}/api/v1/client/subscribe?token=${encodeURIComponent(djjcToken)}`,
        relay_url: "/api/sub?type=djjc",
        plan_name: "长期有效畅游套餐 (回退)",
        expired_date_str: "长期有效",
        traffic: { total: "200.00 GB", used: "--", remaining: "充足", percent: 0 },
        from_cache: false,
        apple_id: appleId,
        warning: `实时探活超时: ${getErrorMessage(err)}`,
      });
    }
  }

  if (action === "set_credentials") {
    const newEmail = (body.email || url.searchParams.get("email") || "").trim();
    const newPassword = String(
      body.vpn_password || body.vpnPassword || body.password_val || "",
    ).trim();
    if (!newEmail || !newPassword) {
      return jsonResponse({ success: false, message: "邮箱和密码不能为空" }, 400);
    }

    try {
      await setClashPayloadJson(env.DB, "vpn07_credentials", {
        email: newEmail,
        password: newPassword,
      });
    } catch (err) {
      return jsonResponse(
        { success: false, message: `数据库写入凭证失败: ${getErrorMessage(err)}` },
        500,
      );
    }

    return jsonResponse({ success: true, message: "账号凭证已安全保存到云端" });
  }

  if (!forceRefresh && env.DB) {
    const cached = await getClashPayloadJson<SubscriptionResponse>(env.DB, "vpn07_sub");
    if (cached && isSubCacheFresh(cached)) {
      return jsonResponse({
        ...cached.data,
        apple_id: appleId,
        from_cache: true,
        cached_at: cached.updatedAt,
      });
    }
  }

  const creds = await getVpn07Credentials(env);
  if (!creds.email || !creds.password) {
    return jsonResponse({
      success: true,
      airport_type: "vpn07",
      airport_name: "VPN07",
      subscribe_url: "",
      relay_url: "/api/sub?type=vpn07",
      plan_name: "未配置账号凭证",
      expired_at: 0,
      expired_date_str: "--",
      traffic: { total: "--", used: "--", remaining: "--", percent: 0 },
      need_credentials: true,
      from_cache: false,
      apple_id: appleId,
      message: "未配置 vpn07.com 账号凭证，请点击“绑定/修改账号凭据”或配置环境变量。",
    });
  }

  try {
    const data = await fetchFromVpn07(creds.email, creds.password);
    if (env.DB) {
      try {
        await setClashPayloadJson(env.DB, "vpn07_sub", data);
      } catch (err) {
        console.error("D1 写入缓存失败:", err);
      }
    }
    return jsonResponse({ ...data, apple_id: appleId, from_cache: false });
  } catch (err) {
    console.error("拉取 vpn07.com 失败:", err);

    if (env.DB) {
      const cached = await getClashPayloadJson<SubscriptionResponse>(env.DB, "vpn07_sub");
      if (cached) {
        return jsonResponse({
          ...cached.data,
          apple_id: appleId,
          from_cache: true,
          warning: `官方刷新失败: ${getErrorMessage(err)}，已降级展示历史缓存`,
        });
      }
    }

    return jsonResponse({
      success: true,
      airport_type: "vpn07",
      airport_name: "VPN07",
      subscribe_url: "",
      relay_url: "/api/sub?type=vpn07",
      plan_name: "官网连接超时",
      expired_date_str: "--",
      traffic: { total: "--", used: "--", remaining: "--", percent: 0 },
      from_cache: false,
      apple_id: appleId,
      warning: `连接 vpn07 失败: ${getErrorMessage(err)}`,
    });
  }
};
