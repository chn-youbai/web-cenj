// Cloudflare Pages Function: /api/video
// 视频流式传输与原画下载中继代理
// 支持 HTTP Range 206 断点续传、在线拖拽秒播与直接下载
// 支持 GET / HEAD / OPTIONS，针对 iOS Safari 与现代浏览器深度适配

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

export async function onRequestHead(context) {
  return handleVideoRequest(context, true);
}

export async function onRequestGet(context) {
  return handleVideoRequest(context, false);
}

async function handleVideoRequest(context, isHead = false) {
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
          const ext = (row.asset_url || "").toLowerCase().endsWith(".mov") ? ".mov" : ".mp4";
          videoTitle = row.title.endsWith(".mp4") || row.title.endsWith(".mov") ? row.title : `${row.title}${ext}`;
        }
        // 如果是下载请求且不是 HEAD，异步更新下载计次
        if (isDownload && !isHead) {
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
    // 3. 从源站（如 GitHub Releases / S3 / Azure）流式拉取
    const upstreamResp = await fetch(targetUrl, {
      method: isHead ? "HEAD" : "GET",
      headers: forwardHeaders,
      redirect: "follow"
    });

    // 4. 构建返回给浏览器的响应头
    const respHeaders = new Headers();
    respHeaders.set("Accept-Ranges", "bytes");
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    respHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");

    // 纠正 Content-Type：绝不能回传 GitHub 的 application/octet-stream，否则 Safari/Chrome 播放器无法解码
    let mimeType = "video/mp4";
    const rawType = (upstreamResp.headers.get("Content-Type") || "").toLowerCase();
    if (rawType.startsWith("video/")) {
      mimeType = rawType;
    } else {
      const lower = (targetUrl + " " + videoTitle).toLowerCase();
      const userAgent = context.request.headers.get("User-Agent") || "";
      const isApple = /iPhone|iPad|iPod|Macintosh|Mac OS/i.test(userAgent);
      if (lower.includes(".mov")) {
        mimeType = isApple ? "video/quicktime" : "video/mp4";
      } else if (lower.includes(".webm")) {
        mimeType = "video/webm";
      } else {
        mimeType = "video/mp4";
      }
    }
    respHeaders.set("Content-Type", mimeType);

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
      // 视频流绝对不可在边缘做静态强缓存，否则会引发分片 Range 错乱
      respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      respHeaders.set("Pragma", "no-cache");
    }

    if (isHead) {
      return new Response(null, {
        status: upstreamResp.status,
        headers: respHeaders
      });
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
