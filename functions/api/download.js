// Cloudflare Pages Function: /api/download
// 资源网盘全球高速直连下载代理
// 支持 HEAD、GET、Range 断点续传与多线程下载工具 (如 IDM / 浏览器原生下载器)

const PRESET_FILES = {
  cfma: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/cfma_latest.apk",
    name: "cfma_latest.apk",
    type: "application/vnd.android.package-archive"
  },
  android: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/cfma_latest.apk",
    name: "cfma_latest.apk",
    type: "application/vnd.android.package-archive"
  },
  clashverge: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/Clash.Verge_x64_setup.exe",
    name: "Clash.Verge_x64_setup.exe",
    type: "application/octet-stream"
  },
  pc: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/Clash.Verge_x64_setup.exe",
    name: "Clash.Verge_x64_setup.exe",
    type: "application/octet-stream"
  },
  windows: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/Clash.Verge_x64_setup.exe",
    name: "Clash.Verge_x64_setup.exe",
    type: "application/octet-stream"
  }
};

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
  return handleDownload(context, true);
}

export async function onRequestGet(context) {
  return handleDownload(context, false);
}

async function handleDownload(context, isHead = false) {
  const url = new URL(context.request.url);
  const fileKey = (url.searchParams.get("file") || "").toLowerCase().trim();
  let targetUrl = url.searchParams.get("url");
  let fileName = url.searchParams.get("name") || "download";
  let contentType = "application/octet-stream";

  if (fileKey && PRESET_FILES[fileKey]) {
    targetUrl = PRESET_FILES[fileKey].url;
    fileName = PRESET_FILES[fileKey].name;
    contentType = PRESET_FILES[fileKey].type;
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing file key or url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const forwardHeaders = new Headers();
  forwardHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

  const rangeHeader = context.request.headers.get("Range");
  if (rangeHeader) {
    forwardHeaders.set("Range", rangeHeader);
  }

  try {
    const upstreamResp = await fetch(targetUrl, {
      method: isHead ? "HEAD" : "GET",
      headers: forwardHeaders,
      redirect: "follow"
    });

    const respHeaders = new Headers();
    respHeaders.set("Accept-Ranges", "bytes");
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    respHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Disposition");
    respHeaders.set("Content-Type", contentType);

    const encodedFileName = encodeURIComponent(fileName);
    respHeaders.set("Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`);
    respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    if (upstreamResp.headers.has("Content-Length")) {
      respHeaders.set("Content-Length", upstreamResp.headers.get("Content-Length"));
    }
    if (upstreamResp.headers.has("Content-Range")) {
      respHeaders.set("Content-Range", upstreamResp.headers.get("Content-Range"));
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
    console.error("Download proxy error:", err);
    return Response.redirect(targetUrl, 302);
  }
}
