import type { Env } from "../_lib/env";
import { jsonResponse, noContentOptions } from "../_lib/http";

interface PresetFile {
  url: string;
  name: string;
  type: string;
}

const PRESET_FILES: Record<string, PresetFile> = {
  cmfa: {
    url: "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/download/v2.11.36/cmfa-2.11.36-meta-arm64-v8a-release.apk",
    name: "cmfa-2.11.36-meta-arm64-v8a-release.apk",
    type: "application/vnd.android.package-archive",
  },
  "cmfa-arm64": {
    url: "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/download/v2.11.36/cmfa-2.11.36-meta-arm64-v8a-release.apk",
    name: "cmfa-2.11.36-meta-arm64-v8a-release.apk",
    type: "application/vnd.android.package-archive",
  },
  cmfa_arm64: {
    url: "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/download/v2.11.36/cmfa-2.11.36-meta-arm64-v8a-release.apk",
    name: "cmfa-2.11.36-meta-arm64-v8a-release.apk",
    type: "application/vnd.android.package-archive",
  },
  "cmfa-2.11.36": {
    url: "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/download/v2.11.36/cmfa-2.11.36-meta-arm64-v8a-release.apk",
    name: "cmfa-2.11.36-meta-arm64-v8a-release.apk",
    type: "application/vnd.android.package-archive",
  },
  cmfa_2_11_36: {
    url: "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/download/v2.11.36/cmfa-2.11.36-meta-arm64-v8a-release.apk",
    name: "cmfa-2.11.36-meta-arm64-v8a-release.apk",
    type: "application/vnd.android.package-archive",
  },
  cfma: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/cfma_latest.apk",
    name: "cfma_latest.apk",
    type: "application/vnd.android.package-archive",
  },
  android: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/cfma_latest.apk",
    name: "cfma_latest.apk",
    type: "application/vnd.android.package-archive",
  },
  clashverge: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/Clash.Verge_x64_setup.exe",
    name: "Clash.Verge_x64_setup.exe",
    type: "application/octet-stream",
  },
  pc: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/Clash.Verge_x64_setup.exe",
    name: "Clash.Verge_x64_setup.exe",
    type: "application/octet-stream",
  },
  windows: {
    url: "https://github.com/chn-youbai/web-cenj/releases/download/v_media/Clash.Verge_x64_setup.exe",
    name: "Clash.Verge_x64_setup.exe",
    type: "application/octet-stream",
  },
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, HEAD, OPTIONS");
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
  return handleDownload(context, true);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleDownload(context, false);
};

async function handleDownload(
  context: EventContext<Env, string, unknown>,
  isHead: boolean,
): Promise<Response> {
  const url = new URL(context.request.url);
  const fileKey = (url.searchParams.get("file") || "").toLowerCase().trim();
  let targetUrl = url.searchParams.get("url");
  let fileName = url.searchParams.get("name") || "download";
  let contentType = "application/octet-stream";

  const preset = fileKey ? PRESET_FILES[fileKey] : undefined;
  if (preset) {
    targetUrl = preset.url;
    fileName = preset.name;
    contentType = preset.type;
  }

  if (!targetUrl) {
    return jsonResponse({ error: "Missing file key or url parameter" }, 400);
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
      redirect: "follow",
    });

    const respHeaders = new Headers();
    respHeaders.set("Accept-Ranges", "bytes");
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    respHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Range, Content-Length, Accept-Ranges, Content-Disposition",
    );
    respHeaders.set("Content-Type", contentType);

    const encodedFileName = encodeURIComponent(fileName);
    respHeaders.set(
      "Content-Disposition",
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`,
    );
    respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    const contentLen = upstreamResp.headers.get("Content-Length");
    if (contentLen) respHeaders.set("Content-Length", contentLen);

    const contentRange = upstreamResp.headers.get("Content-Range");
    if (contentRange) respHeaders.set("Content-Range", contentRange);

    if (isHead) {
      return new Response(null, { status: upstreamResp.status, headers: respHeaders });
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  } catch (err) {
    console.error("Download proxy error:", err);
    return Response.redirect(targetUrl, 302);
  }
}
