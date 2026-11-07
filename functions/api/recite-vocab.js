// Cloudflare Pages Function: /api/recite-vocab
// 高考英语 2050 核心词库云端分发接口
// 支持按需或全量拉取，自带 Anycast 边缘缓存

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const origin = url.origin;

  try {
    // 从同源静态资产库拉取已打包好的 gaokao_2050.json
    const assetUrl = `${origin}/data/gaokao_2050.json`;
    const resp = await context.env.ASSETS ? context.env.ASSETS.fetch(new Request(assetUrl)) : await fetch(assetUrl);

    if (resp && resp.ok) {
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  } catch (e) {
    // 静默降级
  }

  // 兜底重定向到静态资产路径
  return Response.redirect(`${origin}/data/gaokao_2050.json`, 302);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
