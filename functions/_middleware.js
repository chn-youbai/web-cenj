// Cloudflare Pages Functions 全局路由中间件
// 自动根据 User-Agent 智能分流手机版与电脑版页面

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const ua = context.request.headers.get("user-agent") || "";
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const view = url.searchParams.get("view");

  // 对 /exam 和 /exam.html 进行智能分流
  if (url.pathname === "/exam" || url.pathname === "/exam.html") {
    // 若显式指定电脑版视图，放行至 exam.html
    if (view === "desktop") {
      return context.next();
    }
    // 移动端或显式指定手机版，重定向至手机版
    if (view === "mobile" || isMobile) {
      url.pathname = "/exam-mobile.html";
      return Response.redirect(url.toString(), 302);
    }
  }

  // 对 /exam-mobile 和 /exam-mobile.html
  if (url.pathname === "/exam-mobile" || url.pathname === "/exam-mobile.html") {
    // 若显式指定电脑版视图，重定向至 exam.html
    if (view === "desktop") {
      url.pathname = "/exam.html";
      return Response.redirect(url.toString(), 302);
    }
  }

  return context.next();
}
