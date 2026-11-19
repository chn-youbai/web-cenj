import { getClashPayloadJson } from "../_lib/db";
import { type Env, getEnvString } from "../_lib/env";
import { getErrorMessage, noContentOptions } from "../_lib/http";

const DJJC_DOMAINS = ["dash.djjc.cfd", "sub.djjc.cfd", "api.djjc.cfd", "djjc.cfd"];
const CLASH_UA = "ClashMetaForAndroid/v2.11.36";

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const airportType = (
    url.searchParams.get("type") ||
    url.searchParams.get("airport") ||
    "djjc"
  ).toLowerCase();

  if (request.method === "OPTIONS") {
    return noContentOptions("GET, HEAD, OPTIONS");
  }

  const clientUA = request.headers.get("User-Agent") || "";
  const upstreamUA = clientUA.toLowerCase().includes("clash") ? clientUA : CLASH_UA;

  if (airportType === "djjc" || airportType === "dingji") {
    const d1Config = await getClashPayloadJson<{ token?: string }>(env.DB, "djjc_config");
    const token = d1Config?.data.token?.trim() || getEnvString(env, "DJJC_TOKEN");

    if (!token) {
      return new Response("# 顶级机场 DJJC_TOKEN 尚未配置\nproxies: []", {
        status: 503,
        headers: { "Content-Type": "text/yaml; charset=utf-8" },
      });
    }

    let upstreamRes: Response | null = null;
    for (const domain of DJJC_DOMAINS) {
      try {
        const upstreamUrl = `https://${domain}/api/v1/client/subscribe?token=${encodeURIComponent(token)}`;
        const res = await fetch(upstreamUrl, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: {
            "User-Agent": upstreamUA,
            Accept: "*/*",
          },
        });
        if (res.ok) {
          upstreamRes = res;
          break;
        }
      } catch {
        console.warn(`顶级机场域名 ${domain} 探活失败，尝试备用域名...`);
      }
    }

    if (!upstreamRes) {
      return new Response("# 顶级机场所有备选域名暂时均不可达，请稍后重试\nproxies: []", {
        status: 502,
        headers: { "Content-Type": "text/yaml; charset=utf-8" },
      });
    }

    const forwardHeaders = new Headers();
    forwardHeaders.set("Content-Type", "text/yaml; charset=utf-8");
    forwardHeaders.set("Access-Control-Allow-Origin", "*");
    forwardHeaders.set("Cache-Control", "no-cache, private");

    const userInfoHeader = upstreamRes.headers.get("subscription-userinfo");
    if (userInfoHeader) forwardHeaders.set("subscription-userinfo", userInfoHeader);

    const disposition = upstreamRes.headers.get("content-disposition");
    if (disposition) {
      forwardHeaders.set("content-disposition", disposition);
    } else {
      forwardHeaders.set(
        "content-disposition",
        "attachment;filename*=UTF-8''%E9%A1%B6%E7%BA%A7%E6%9C%BA%E5%9C%BA",
      );
    }

    const updateInterval = upstreamRes.headers.get("profile-update-interval");
    if (updateInterval) forwardHeaders.set("profile-update-interval", updateInterval);

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: forwardHeaders });
    }

    const yamlBody = await upstreamRes.text();
    return new Response(yamlBody, { status: 200, headers: forwardHeaders });
  }

  if (airportType === "vpn07") {
    const vpn07Config = await getClashPayloadJson<{ subscribe_url?: string }>(env.DB, "vpn07_sub");
    const vpn07SubUrl = vpn07Config?.data.subscribe_url?.trim() || "";

    if (!vpn07SubUrl) {
      return new Response(
        "# VPN07 订阅链接尚未初始化，请先在 pan.html 绑定账号并同步\nproxies: []",
        {
          status: 404,
          headers: { "Content-Type": "text/yaml; charset=utf-8" },
        },
      );
    }

    try {
      const res = await fetch(vpn07SubUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: {
          "User-Agent": upstreamUA,
          Accept: "*/*",
        },
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
    } catch (err) {
      return new Response(`# VPN07 拉取节点异常: ${getErrorMessage(err)}\nproxies: []`, {
        status: 502,
        headers: { "Content-Type": "text/yaml; charset=utf-8" },
      });
    }
  }

  return new Response("Unknown airport type", { status: 400 });
};
