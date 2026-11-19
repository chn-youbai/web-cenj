import type { UploadAssetResponse } from "../../shared/types";
import { type Env, getEnvString } from "../_lib/env";
import { getErrorMessage, jsonResponse, noContentOptions } from "../_lib/http";

const GH_REPO = "chn-youbai/web-cenj";
const DEFAULT_TAG = "v_media";

interface GitHubReleaseResponse {
  upload_url?: string;
  message?: string;
}

interface GitHubAssetUploadResponse {
  id?: number;
  browser_download_url?: string;
  size?: number;
  message?: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("POST, OPTIONS");
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const token =
    context.request.headers.get("X-GitHub-Token") ||
    url.searchParams.get("token") ||
    getEnvString(context.env, "GITHUB_MEDIA_TOKEN");

  const fileName =
    context.request.headers.get("X-File-Name") ||
    url.searchParams.get("name") ||
    `video_${Date.now()}.mp4`;

  const encodedTitleHeader = context.request.headers.get("X-Title");
  const rawTitle = encodedTitleHeader
    ? decodeURIComponent(encodedTitleHeader)
    : url.searchParams.get("title") || "";

  const duration =
    Number.parseInt(
      context.request.headers.get("X-Duration") || url.searchParams.get("duration") || "0",
      10,
    ) || 0;
  const posterUrl =
    context.request.headers.get("X-Poster-Url") || url.searchParams.get("poster") || "";
  const contentType = context.request.headers.get("Content-Type") || "video/mp4";

  if (!token) {
    return jsonResponse(
      { error: "Missing GitHub Token (请配置服务端 GITHUB_MEDIA_TOKEN 或在页面提供 Token)" },
      400,
    );
  }

  try {
    const releaseResp = await fetch(
      `https://api.github.com/repos/${GH_REPO}/releases/tags/${DEFAULT_TAG}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Cenj-Pages-Proxy",
        },
      },
    );

    let uploadUrl = "";
    if (releaseResp.status === 404) {
      const createResp = await fetch(`https://api.github.com/repos/${GH_REPO}/releases`, {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Cenj-Pages-Proxy",
        },
        body: JSON.stringify({
          tag_name: DEFAULT_TAG,
          name: "Cenj Video Assets",
          body: "Personal video storage assets",
          draft: false,
          prerelease: false,
        }),
      });
      const createData = (await createResp.json()) as GitHubReleaseResponse;
      if (!createResp.ok || !createData.upload_url) {
        return jsonResponse(
          { error: `Failed to create release: ${createData.message || createResp.statusText}` },
          500,
        );
      }
      uploadUrl = createData.upload_url;
    } else if (releaseResp.ok) {
      const relData = (await releaseResp.json()) as GitHubReleaseResponse;
      uploadUrl = relData.upload_url || "";
    } else {
      const err = (await releaseResp.json().catch(() => ({}))) as GitHubReleaseResponse;
      return jsonResponse(
        { error: `GitHub Auth Failed: ${err.message || releaseResp.statusText}` },
        releaseResp.status,
      );
    }

    if (!uploadUrl) {
      return jsonResponse({ error: "Release upload_url missing" }, 500);
    }

    const cleanName = `${Date.now().toString(36)}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const targetUploadEndpoint = uploadUrl.replace(
      "{?name,label}",
      `?name=${encodeURIComponent(cleanName)}`,
    );

    const ghUploadResp = await fetch(targetUploadEndpoint, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": contentType,
        "User-Agent": "Cenj-Pages-Proxy",
      },
      body: context.request.body,
    });

    const ghRespData = (await ghUploadResp.json().catch(() => ({}))) as GitHubAssetUploadResponse;

    if (ghUploadResp.ok && ghRespData.browser_download_url) {
      const db = context.env.DB;
      const vidId = `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const title = rawTitle || fileName.replace(/\.[^/.]+$/, "");
      const downloadUrl = ghRespData.browser_download_url;
      const fileSize = ghRespData.size || 0;

      if (db) {
        try {
          await db
            .prepare(`
              INSERT INTO videos (id, title, description, duration, file_size, poster_url, asset_url)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(vidId, title, "手机相册直传视频", duration, fileSize, posterUrl, downloadUrl)
            .run();
        } catch (dbErr) {
          console.error("D1 auto insert error:", dbErr);
        }
      }

      const resp: UploadAssetResponse = {
        status: "ok",
        id: vidId,
        title,
        browser_download_url: downloadUrl,
        asset_id: ghRespData.id,
        size: fileSize,
      };
      return jsonResponse(resp);
    }

    return jsonResponse(
      { error: `GitHub Upload Error: ${ghRespData.message || ghUploadResp.statusText}` },
      ghUploadResp.status || 500,
    );
  } catch (err) {
    return jsonResponse({ error: `Internal Proxy Error: ${getErrorMessage(err)}` }, 500);
  }
};
