// Cloudflare Pages Function: /api/video
// 视频流式传输与原画下载中继代理
// 支持 HTTP Range 206 断点续传、在线拖拽秒播与直接下载

export async function onRequestGet(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  let targetUrl = url.searchParams.get("url");
  const isDownload = url.searchParams.get("download") === "1";

  let videoTitle = "video.mp4";

  // 1. 如果传了 id，从 D1 数据库查询真实资产直链
  if (id && db) {
    try {
      const row = await db.prepare("SELECT title, asset_url FROM videos WHERE id = ?").bind(id).first();
      if (row) {
        targetUrl = row.asset_url;
        if (row.title) {
          videoTitle = row.title.endsWith(".mp4") ? row.title : `${row.title}.mp4`;
        }
        // 如果是下载请求，更新下载计次
        if (isDownload) {
          context.waitUntil(
            db.prepare("UPDATE videos SET download_count = download_count + 1 WHERE id = ?").bind(id).run()
          );
        }
      }
    } catch (e) {
      console.error("D1 lookup error:", e);
    }
  }

  if (!targetUrl) {
    return new Response("Missing video target URL or ID", { status: 400 });
  }

  // 2. 准备转发给源站的请求头（特别是 Range 头）
  const forwardHeaders = new Headers();
  forwardHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

  const rangeHeader = context.request.headers.get("Range");
  if (rangeHeader) {
    forwardHeaders.set("Range", rangeHeader);
  }

  try {
    // 3. 从源站（如 GitHub Releases / S3 / 直链）流式拉取
    const upstreamResp = await fetch(targetUrl, {
      method: "GET",
      headers: forwardHeaders,
      redirect: "follow"
    });

    // 4. 构建返回给浏览器的响应头
    const respHeaders = new Headers();
    respHeaders.set("Content-Type", upstreamResp.headers.get("Content-Type") || "video/mp4");
    respHeaders.set("Accept-Ranges", "bytes");
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    respHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");

    if (upstreamResp.headers.has("Content-Length")) {
      respHeaders.set("Content-Length", upstreamResp.headers.get("Content-Length"));
    }
    if (upstreamResp.headers.has("Content-Range")) {
      respHeaders.set("Content-Range", upstreamResp.headers.get("Content-Range"));
    }

    if (isDownload) {
      const encodedTitle = encodeURIComponent(videoTitle);
      respHeaders.set("Content-Disposition", `attachment; filename="${videoTitle}"; filename*=UTF-8''${encodedTitle}`);
    } else {
      respHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders
    });
  } catch (err) {
    console.error("Stream proxy error:", err);
    // 出错时重定向到源站作为降级
    return Response.redirect(targetUrl, 302);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
}
