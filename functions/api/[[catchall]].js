// Cloudflare Pages Edge Gateway: Reverse Proxies /api/* to Vercel Serverless Python Backend
export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Upstream Vercel endpoint: Read from CF Pages env var or fallback to default
  const upstreamBase = context.env.VERCEL_UPSTREAM_URL || "https://web-cenj-cgqh.vercel.app";
  const upstreamUrl = new URL(url.pathname + url.search, upstreamBase);

  // Handle preflight OPTIONS
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const reqHeaders = new Headers(context.request.headers);
  reqHeaders.set("Host", upstreamUrl.host);

  const reqInit = {
    method: context.request.method,
    headers: reqHeaders,
    redirect: "follow",
  };

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    reqInit.body = context.request.body;
  }

  try {
    const upstreamResp = await fetch(upstreamUrl.toString(), reqInit);
    const respHeaders = new Headers(upstreamResp.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    respHeaders.set("Access-Control-Allow-Headers", "*");

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Cloudflare Edge Gateway: 无法连接到上游 Python 服务",
      detail: err.message,
      upstream: upstreamUrl.toString()
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
