import type { Env } from "../_lib/env";
import { noContentOptions } from "../_lib/http";

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, HEAD, OPTIONS");
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
  return handleVideoRequest(context, true);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleVideoRequest(context, false);
};

async function handleVideoRequest(
  context: EventContext<Env, string, unknown>,
  isHead: boolean,
): Promise<Response> {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  let targetUrl = url.searchParams.get("url");
  const isDownload = url.searchParams.get("download") === "1";

  let videoTitle = "video.mp4";

  if (id && db) {
    try {
      const row = await db
        .prepare("SELECT title, asset_url FROM videos WHERE id = ?")
        .bind(id)
        .first<{ title?: string; asset_url?: string }>();
      if (row) {
        if (row.asset_url) targetUrl = row.asset_url;
        if (row.title) {
          const ext = (row.asset_url || "").toLowerCase().endsWith(".mov") ? ".mov" : ".mp4";
          videoTitle =
            row.title.endsWith(".mp4") || row.title.endsWith(".mov")
              ? row.title
              : `${row.title}${ext}`;
        }
        if (isDownload && !isHead) {
          context.waitUntil(
            db
              .prepare("UPDATE videos SET download_count = download_count + 1 WHERE id = ?")
              .bind(id)
              .run(),
          );
        }
      }
    } catch (err) {
      console.error("D1 lookup error:", err);
    }
  }

  if (!targetUrl) {
    return new Response("Missing video target URL or ID", { status: 400 });
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
      "Content-Range, Content-Length, Accept-Ranges, Content-Type",
    );

    let mimeType = "video/mp4";
    const rawType = (upstreamResp.headers.get("Content-Type") || "").toLowerCase();
    if (rawType.startsWith("video/")) {
      mimeType = rawType;
    } else {
      const lower = `${targetUrl} ${videoTitle}`.toLowerCase();
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

    const contentLength = upstreamResp.headers.get("Content-Length");
    if (contentLength) respHeaders.set("Content-Length", contentLength);

    const contentRange = upstreamResp.headers.get("Content-Range");
    if (contentRange) respHeaders.set("Content-Range", contentRange);

    if (isDownload) {
      const encodedTitle = encodeURIComponent(videoTitle);
      respHeaders.set(
        "Content-Disposition",
        `attachment; filename="${videoTitle}"; filename*=UTF-8''${encodedTitle}`,
      );
    } else {
      respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      respHeaders.set("Pragma", "no-cache");
    }

    if (isHead) {
      return new Response(null, { status: upstreamResp.status, headers: respHeaders });
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  } catch (err) {
    console.error("Stream proxy error:", err);
    return Response.redirect(targetUrl, 302);
  }
}
