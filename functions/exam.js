// Cloudflare Pages Functions: /exam 路由直接分流处理器

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const ua = context.request.headers.get("user-agent") || "";
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const view = url.searchParams.get("view");

  if (view === "desktop") {
    url.pathname = "/exam.html";
    return Response.redirect(url.toString(), 302);
  }

  if (view === "mobile" || isMobile) {
    url.pathname = "/exam-mobile.html";
    return Response.redirect(url.toString(), 302);
  }

  // 电脑端默认重定向到 /exam.html
  url.pathname = "/exam.html";
  return Response.redirect(url.toString(), 302);
}
