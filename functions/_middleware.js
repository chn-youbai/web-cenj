// Cloudflare Pages Functions 全局路由中间件
// 自动根据 User-Agent 智能分流手机版与电脑版页面

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const ua = context.request.headers.get("user-agent") || "";
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const view = url.searchParams.get("view");

  // 规范化路径：去除末尾的 / （但保留纯根路径 /）
  const cleanPath = (url.pathname.length > 1 && url.pathname.endsWith("/")) 
    ? url.pathname.slice(0, -1) 
    : url.pathname;

  // 1. 对 /exam 和 /exam.html 进行智能分流
  if (cleanPath === "/exam" || cleanPath === "/exam.html") {
    // 若显式指定电脑版视图
    if (view === "desktop") {
      if (cleanPath !== "/exam.html") {
        url.pathname = "/exam.html";
        return Response.redirect(url.toString(), 302);
      }
      return context.next();
    }
    // 移动端或显式指定手机版，重定向至手机版
    if (view === "mobile" || isMobile) {
      url.pathname = "/exam-mobile.html";
      return Response.redirect(url.toString(), 302);
    }
    // 电脑端默认：重定向至电脑版 exam.html
    if (cleanPath !== "/exam.html") {
      url.pathname = "/exam.html";
      return Response.redirect(url.toString(), 302);
    }
    return context.next();
  }

  // 2. 对 /exam-mobile 和 /exam-mobile.html 进行智能分流
  if (cleanPath === "/exam-mobile" || cleanPath === "/exam-mobile.html") {
    // 若显式指定电脑版，或在电脑端访问且未显式指定 view=mobile，则重定向至电脑版
    if (view === "desktop" || (!isMobile && view !== "mobile")) {
      url.pathname = "/exam.html";
      return Response.redirect(url.toString(), 302);
    }
    // 移动端访问 /exam-mobile，标准化重定向至 /exam-mobile.html
    if (cleanPath === "/exam-mobile") {
      url.pathname = "/exam-mobile.html";
      return Response.redirect(url.toString(), 302);
    }
    return context.next();
  }

  return context.next();
}

