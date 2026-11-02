// Cloudflare Pages Function: /api/subscription
// 自动化获取与同步 vpn07.com 订阅链接及流量套餐信息
// 支持 D1 毫秒级缓存读取、账号凭证云端托管、强制刷新与平滑降级

const DEFAULT_ACCESS_PASSWORD = "227929";
const FALLBACK_SUBSCRIBE_URL = "https://dash.djjc.cfd/api/v1/client/subscribe?token=4bc2e53e3df5a9a50e1cd626e72f0c06";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Access-Pwd",
  "Content-Type": "application/json; charset=utf-8"
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0.00 GB";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

function formatDate(timestamp) {
  if (!timestamp) return "长期有效";
  const d = new Date(timestamp * 1000);
  if (isNaN(d.getTime())) return "长期有效";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 获取存储的凭证 (优先环境变量，次选 D1 存储)
async function getCredentials(env) {
  let email = env.VPN07_EMAIL || "";
  let password = env.VPN07_PASSWORD || "";

  if ((!email || !password) && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT payload FROM clash_control WHERE id = 'vpn07_credentials'").first();
      if (row && row.payload) {
        const creds = JSON.parse(row.payload);
        if (creds.email && creds.password) {
          email = creds.email;
          password = creds.password;
        }
      }
    } catch (e) {
      console.error("读取 D1 凭证失败:", e);
    }
  }

  return { email, password };
}

// 登录并从 vpn07.com 官方获取最新订阅与账户信息
async function fetchFromVpn07(email, password) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // 1. 登录认证
  const loginRes = await fetch("https://vpn07.com/api/v1/passport/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ua
    },
    body: JSON.stringify({ email, password })
  });

  const loginJson = await loginRes.json();
  if (!loginRes.ok || !loginJson || !loginJson.data) {
    throw new Error(loginJson?.message || `登录失败 (HTTP ${loginRes.status})`);
  }

  // 重要：必须优先使用 auth_data (JWT 格式的用户认证凭证)，而非 token (32位订阅标识码)
  const token = loginJson.data.auth_data || loginJson.data.token;
  if (!token) {
    throw new Error("登录成功但未返回有效认证 Token");
  }

  const authHeaders = {
    "User-Agent": ua,
    "Authorization": token
  };

  // 2. 并行拉取订阅与用户信息
  const [subRes, infoRes] = await Promise.all([
    fetch("https://vpn07.com/api/v1/user/getSubscribe", { headers: authHeaders }).then(r => r.json()).catch(() => null),
    fetch("https://vpn07.com/api/v1/user/info", { headers: authHeaders }).then(r => r.json()).catch(() => null)
  ]);

  let subUrl = subRes?.data?.subscribe_url;
  // 若 getSubscribe 偶尔波动，可基于用户唯一的订阅 token 兜底拼接官网真实订阅直链
  if (!subUrl && loginJson.data.token) {
    subUrl = `https://vpn07.vip/cdn/baidu?token=${loginJson.data.token}`;
  }

  if (!subUrl) {
    throw new Error(subRes?.message || "未能获取到订阅直链");
  }

  // 合并用户信息字段 (部分站点 u/d 存放在 getSubscribe 或 info 之一)
  const info = { ...(infoRes?.data || {}), ...(subRes?.data || {}) };
  let transferEnable = info.transfer_enable || 0;
  let used = (info.u || 0) + (info.d || 0);
  let remaining = Math.max(0, transferEnable - used);
  let expiredAt = info.expired_at || 0;

  // 3. 权威计费流校准：从订阅直链的 Subscription-Userinfo 标头中提取实时精准流量
  try {
    const headRes = await fetch(subUrl, {
      method: "HEAD",
      headers: { "User-Agent": "ClashMetaForAndroid/v2.11.36" }
    });
    const userInfoHeader = headRes.headers.get("subscription-userinfo");
    if (userInfoHeader) {
      // 标头格式: upload=98683552440; download=60472362302; total=268435456000; expire=1794795704
      const parts = {};
      userInfoHeader.split(";").forEach(item => {
        const [k, v] = item.trim().split("=");
        if (k && v) parts[k.toLowerCase()] = parseInt(v, 10);
      });
      if (parts.total && parts.total > 0) {
        transferEnable = parts.total;
      }
      if (parts.upload !== undefined && parts.download !== undefined) {
        used = parts.upload + parts.download;
        remaining = Math.max(0, transferEnable - used);
      }
      if (parts.expire) {
        expiredAt = parts.expire;
      }
    }
  } catch (e) {
    console.warn("读取 subscription-userinfo 标头失败:", e);
  }

  return {
    success: true,
    subscribe_url: subUrl,
    plan_name: info.plan_name || (info.plan && info.plan.name) || (transferEnable > 0 ? "VIP 正式套餐" : "已订阅套餐"),
    expired_at: expiredAt,
    expired_date_str: formatDate(expiredAt),
    traffic: {
      total: formatBytes(transferEnable),
      used: formatBytes(used),
      remaining: formatBytes(remaining),
      percent: transferEnable > 0 ? Math.min(100, Math.round((used / transferEnable) * 100)) : 0
    },
    reset_day: info.reset_day || null,
    account_email: email,
    synced_at: Date.now()
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  let body = {};
  if (request.method === "POST") {
    try {
      body = await request.json();
    } catch (e) {}
  }

  // 1. 验证访问密码
  const reqPwd = url.searchParams.get("pwd") || request.headers.get("X-Access-Pwd") || body.pwd || body.password || "";
  const validPwd = env.ACCESS_PASSWORD || DEFAULT_ACCESS_PASSWORD;

  if (reqPwd !== validPwd) {
    return new Response(JSON.stringify({
      success: false,
      message: "访问密码错误，无权获取订阅信息"
    }), {
      status: 401,
      headers: CORS_HEADERS
    });
  }

  // 2. 检查是否为设置/更新账号凭证请求
  const action = url.searchParams.get("action") || body.action || "";
  if (action === "set_credentials") {
    const newEmail = body.email || url.searchParams.get("email");
    const newPassword = body.vpn_password || body.vpnPassword || body.password_val;
    if (!newEmail || !newPassword) {
      return new Response(JSON.stringify({ success: false, message: "邮箱和密码不能为空" }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    if (env.DB) {
      try {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO clash_control (id, payload, updated_at) VALUES ('vpn07_credentials', ?, datetime('now'))"
        ).bind(JSON.stringify({ email: newEmail, password: newPassword })).run();
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: "数据库写入凭证失败: " + e.message }), {
          status: 500,
          headers: CORS_HEADERS
        });
      }
    }

    return new Response(JSON.stringify({ success: true, message: "账号凭证已安全保存到云端" }), {
      status: 200,
      headers: CORS_HEADERS
    });
  }

  const forceRefresh = url.searchParams.get("refresh") === "true" || body.refresh === true;

  // 3. 非强制刷新：尝试命中 D1 数据库缓存
  if (!forceRefresh && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT payload, updated_at FROM clash_control WHERE id = 'vpn07_sub'").first();
      if (row && row.payload) {
        const cached = JSON.parse(row.payload);
        return new Response(JSON.stringify({
          ...cached,
          from_cache: true,
          cached_at: row.updated_at
        }), {
          status: 200,
          headers: CORS_HEADERS
        });
      }
    } catch (e) {
      console.warn("读取 D1 缓存异常，将继续拉取最新:", e);
    }
  }

  // 4. 读取账号凭证
  const creds = await getCredentials(env);
  if (!creds.email || !creds.password) {
    // 若未配置凭证，返回默认兜底订阅与友好提示
    return new Response(JSON.stringify({
      success: true,
      subscribe_url: FALLBACK_SUBSCRIBE_URL,
      plan_name: "默认通用订阅 (未配置账号)",
      expired_at: 0,
      expired_date_str: "长期有效",
      traffic: {
        total: "不限",
        used: "--",
        remaining: "充足",
        percent: 0
      },
      need_credentials: true,
      from_cache: false,
      message: "未配置 vpn07.com 账号凭证，已回落至默认订阅链接。如需自动同步，请在控制台或前端输入凭证。"
    }), {
      status: 200,
      headers: CORS_HEADERS
    });
  }

  // 5. 调用 vpn07.com 官方接口拉取
  try {
    const data = await fetchFromVpn07(creds.email, creds.password);

    // 写入 D1 缓存
    if (env.DB) {
      try {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO clash_control (id, payload, updated_at) VALUES ('vpn07_sub', ?, datetime('now'))"
        ).bind(JSON.stringify(data)).run();
      } catch (e) {
        console.error("D1 写入缓存失败:", e);
      }
    }

    return new Response(JSON.stringify({
      ...data,
      from_cache: false
    }), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    console.error("拉取 vpn07.com 失败:", err);

    // 失败时若 D1 中有老缓存，先降级返回老缓存
    if (env.DB) {
      try {
        const row = await env.DB.prepare("SELECT payload, updated_at FROM clash_control WHERE id = 'vpn07_sub'").first();
        if (row && row.payload) {
          const cached = JSON.parse(row.payload);
          return new Response(JSON.stringify({
            ...cached,
            from_cache: true,
            warning: "官方刷新失败: " + err.message + "，已降级展示历史缓存"
          }), {
            status: 200,
            headers: CORS_HEADERS
          });
        }
      } catch (e) {}
    }

    // 最终兜底
    return new Response(JSON.stringify({
      success: true,
      subscribe_url: FALLBACK_SUBSCRIBE_URL,
      plan_name: "备用订阅 (官网连接超时)",
      expired_date_str: "长期有效",
      traffic: { total: "不限", used: "--", remaining: "充足", percent: 0 },
      from_cache: false,
      warning: "连接 vpn07 失败: " + err.message
    }), {
      status: 200,
      headers: CORS_HEADERS
    });
  }
}
