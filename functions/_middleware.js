// Cloudflare Pages Functions 全局路由中间件
// 自动根据 User-Agent 智能分流手机版与电脑版页面 (适配 Cloudflare Pages Clean URLs 规范)

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const ua = context.request.headers.get("user-agent") || "";
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const view = url.searchParams.get("view");

  // 规范化路径：去除末尾的 / （但保留纯根路径 /）
  const cleanPath = (url.pathname.length > 1 && url.pathname.endsWith("/")) 
    ? url.pathname.slice(0, -1) 
    : url.pathname;

  // 1. 访问 /exam 或 /exam.html
  if (cleanPath === "/exam" || cleanPath === "/exam.html") {
    // 若显式指定电脑版视图
    if (view === "desktop") {
      if (cleanPath === "/exam.html") {
        url.pathname = "/exam";
        return Response.redirect(url.toString(), 308);
      }
      return context.next();
    }
    // 移动端或显式指定手机版，重定向至手机版规范路由 /exam-mobile
    if (view === "mobile" || isMobile) {
      url.pathname = "/exam-mobile";
      return Response.redirect(url.toString(), 302);
    }
    // 电脑端默认：若请求带 .html，规范化为 /exam
    if (cleanPath === "/exam.html") {
      url.pathname = "/exam";
      return Response.redirect(url.toString(), 308);
    }
    return context.next();
  }

  // 2. 访问 /exam-mobile 或 /exam-mobile.html
  if (cleanPath === "/exam-mobile" || cleanPath === "/exam-mobile.html") {
    // 若显式指定电脑版，或在电脑端访问且未显式指定 view=mobile，则重定向至电脑版 /exam
    if (view === "desktop" || (!isMobile && view !== "mobile")) {
      url.pathname = "/exam";
      return Response.redirect(url.toString(), 302);
    }
    // 若请求带 .html，规范化为 /exam-mobile
    if (cleanPath === "/exam-mobile.html") {
      url.pathname = "/exam-mobile";
      return Response.redirect(url.toString(), 308);
    }
    return context.next();
  }

  return context.next();
}
