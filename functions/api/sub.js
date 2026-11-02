// Cloudflare Pages Function: /api/sub
// 方案 B：私人专属固定免密防封订阅中继
// 客户端（Clash / Clash Meta / Shadowrocket）永远只需配置此固定直链
// 后端自带官方分发域名探活与自动伪装客户端请求头，机场换域零感知自愈

const DEFAULT_DJJC_TOKEN = "4bc2e53e3df5a9a50e1cd626e72f0c06";
const DJJC_DOMAINS = [
  "dash.djjc.cfd",
  "sub.djjc.cfd",
  "api.djjc.cfd",
  "djjc.cfd"
];

const CLASH_UA = "ClashMetaForAndroid/v2.11.36";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. 判断机场类型：支持 ?type=djjc 或 ?type=vpn07 (默认 djjc 顶级机场)
  const airportType = (url.searchParams.get("type") || url.searchParams.get("airport") || "djjc").toLowerCase();

  // 跨域预检处理
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, User-Agent",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  // 客户端传入的 User-Agent，如果是 Clash 则透传，否则自动伪装为 ClashMeta
  const clientUA = request.headers.get("User-Agent") || "";
  const upstreamUA = clientUA.toLowerCase().includes("clash") ? clientUA : CLASH_UA;

  // ==========================================
  // 分支 A：顶级机场 (djjc) 固定中继与容灾探活
  // ==========================================
  if (airportType === "djjc" || airportType === "dingji") {
    let token = DEFAULT_DJJC_TOKEN;

    // 优先读取 D1 存储配置中的自定义 token（若有）
    if (env.DB) {
      try {
        const row = await env.DB.prepare("SELECT payload FROM clash_control WHERE id = 'djjc_config'").first();
        if (row && row.payload) {
          const cfg = JSON.parse(row.payload);
          if (cfg.token) token = cfg.token;
        }
      } catch (e) {}
    }

    // 多域名自动探活拉取
    let upstreamRes = null;
    let targetDomain = DJJC_DOMAINS[0];

    for (const domain of DJJC_DOMAINS) {
      try {
        const upstreamUrl = `https://${domain}/api/v1/client/subscribe?token=${encodeURIComponent(token)}`;
        const res = await fetch(upstreamUrl, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: {
            "User-Agent": upstreamUA,
            "Accept": "*/*"
          }
        });

        if (res.ok) {
          upstreamRes = res;
          targetDomain = domain;
          break; // 探测到可用域名，立即退出循环
        }
      } catch (e) {
        console.warn(`顶级机场域名 ${domain} 探活失败，尝试备用域名...`);
      }
    }

    if (!upstreamRes) {
      return new Response("# 顶级机场所有备选域名暂时均不可达，请稍后重试\nproxies: []", {
        status: 502,
        headers: { "Content-Type": "text/yaml; charset=utf-8" }
      });
    }

    // 提取并透传关键响应头 (让 Clash 客户端本地能够直接显示流量指示条与订阅名称)
    const forwardHeaders = new Headers();
    forwardHeaders.set("Content-Type", "text/yaml; charset=utf-8");
    forwardHeaders.set("Access-Control-Allow-Origin", "*");
    forwardHeaders.set("Cache-Control", "no-cache, private");

    const userInfoHeader = upstreamRes.headers.get("subscription-userinfo");
    if (userInfoHeader) {
      forwardHeaders.set("subscription-userinfo", userInfoHeader);
    }

    const disposition = upstreamRes.headers.get("content-disposition");
    if (disposition) {
      forwardHeaders.set("content-disposition", disposition);
    } else {
      forwardHeaders.set("content-disposition", "attachment;filename*=UTF-8''%E9%A1%B6%E7%BA%A7%E6%9C%BA%E5%9C%BA");
    }

    const updateInterval = upstreamRes.headers.get("profile-update-interval");
    if (updateInterval) {
      forwardHeaders.set("profile-update-interval", updateInterval);
    }

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: forwardHeaders });
    }

    const yamlBody = await upstreamRes.text();
    return new Response(yamlBody, {
      status: 200,
      headers: forwardHeaders
    });
  }

  // ==========================================
  // 分支 B：VPN07 固定中继
  // ==========================================
  if (airportType === "vpn07") {
    let vpn07SubUrl = "";

    // 从 D1 读取当前最新的 VPN07 真实订阅直链
    if (env.DB) {
      try {
        const row = await env.DB.prepare("SELECT payload FROM clash_control WHERE id = 'vpn07_sub'").first();
        if (row && row.payload) {
          const data = JSON.parse(row.payload);
          if (data.subscribe_url) vpn07SubUrl = data.subscribe_url;
        }
      } catch (e) {}
    }

    if (!vpn07SubUrl) {
      return new Response("# VPN07 订阅链接尚未初始化，请先在 pan.html 绑定账号并同步\nproxies: []", {
        status: 404,
        headers: { "Content-Type": "text/yaml; charset=utf-8" }
      });
    }

    try {
      const res = await fetch(vpn07SubUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: {
          "User-Agent": upstreamUA,
          "Accept": "*/*"
        }
      });

      const forwardHeaders = new Headers();
      forwardHeaders.set("Content-Type", "text/yaml; charset=utf-8");
      forwardHeaders.set("Access-Control-Allow-Origin", "*");
      forwardHeaders.set("Cache-Control", "no-cache, private");

      const userInfoHeader = res.headers.get("subscription-userinfo");
      if (userInfoHeader) forwardHeaders.set("subscription-userinfo", userInfoHeader);

      const disposition = res.headers.get("content-disposition");
      if (disposition) forwardHeaders.set("content-disposition", disposition);

      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers: forwardHeaders });
      }

      const bodyText = await res.text();
      return new Response(bodyText, { status: 200, headers: forwardHeaders });
    } catch (e) {
      return new Response(`# VPN07 拉取节点异常: ${e.message}\nproxies: []`, {
        status: 502,
        headers: { "Content-Type": "text/yaml; charset=utf-8" }
      });
    }
  }

  return new Response("Unknown airport type", { status: 400 });
}
