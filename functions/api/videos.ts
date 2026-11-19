import type { VideoItem, VideosListResponse } from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import { type Env, getEnvString } from "../_lib/env";
import { getErrorMessage, jsonResponse, noContentOptions, readJsonBody } from "../_lib/http";

interface GitHubReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, PATCH, DELETE, OPTIONS");
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", message: "D1 database not bound", videos: [] });
  }

  const url = new URL(context.request.url);
  if (url.searchParams.get("sync") === "1") {
    const ghToken =
      context.request.headers.get("X-GitHub-Token") ||
      url.searchParams.get("token") ||
      getEnvString(context.env, "GITHUB_MEDIA_TOKEN");

    if (ghToken) {
      try {
        const ghRes = await fetch(
          "https://api.github.com/repos/chn-youbai/web-cenj/releases/tags/v_media",
          {
            headers: {
              Authorization: `token ${ghToken}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "Cenj-Pages-Proxy",
            },
          },
        );
        if (ghRes.ok) {
          const relData = (await ghRes.json()) as { assets?: GitHubReleaseAsset[] };
          const assets = relData.assets || [];
          for (const a of assets) {
            const existing = await db
              .prepare("SELECT id FROM videos WHERE asset_url = ?")
              .bind(a.browser_download_url)
              .first();
            if (!existing) {
              const vidId = `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
              const title = a.name.replace(/^[a-z0-9]+_/, "").replace(/\.[^/.]+$/, "");
              await db
                .prepare(`
                  INSERT INTO videos (id, title, description, duration, file_size, poster_url, asset_url)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `)
                .bind(
                  vidId,
                  title,
                  "从 GitHub Releases 自动同步",
                  0,
                  a.size || 0,
                  "",
                  a.browser_download_url,
                )
                .run();
            }
          }
        }
      } catch (syncErr) {
        console.error("Auto-sync error:", syncErr);
      }
    }
  }

  try {
    const { results } = await db
      .prepare(`
        SELECT id, title, description, duration, file_size, poster_url, asset_url, download_count, created_at
        FROM videos
        ORDER BY created_at DESC
      `)
      .all<VideoItem>();

    const videos = results || [];
    const resp: VideosListResponse = {
      status: "ok",
      total: videos.length,
      videos,
    };
    return jsonResponse(resp);
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err), videos: [] }, 500);
  }
};

interface VideosPostBody extends Record<string, unknown> {
  password?: string;
  id?: string;
  title?: string;
  description?: string;
  duration?: number | string;
  file_size?: number | string;
  poster_url?: string;
  asset_url?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", message: "D1 database not bound" }, 500);
  }

  const parsed = await readJsonBody<VideosPostBody>(context.request);
  if (!parsed.ok) {
    return jsonResponse({ status: "error", message: "Invalid JSON body" }, 400);
  }

  const body = parsed.data;
  const auth = verifyAdminPassword(context.env, context.request, body);
  if (!auth.configured) {
    return jsonResponse({ status: "error", message: "服务端尚未配置 ADMIN_PASSWORD" }, 503);
  }
  if (!auth.valid) {
    return jsonResponse({ status: "error", message: "密码错误，无权操作" }, 403);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const assetUrl = typeof body.asset_url === "string" ? body.asset_url.trim() : "";
  const posterUrl = typeof body.poster_url === "string" ? body.poster_url.trim() : "";
  const duration = Number.parseInt(String(body.duration ?? 0), 10) || 0;
  const fileSize = Number.parseInt(String(body.file_size ?? 0), 10) || 0;
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!title || !assetUrl) {
    return jsonResponse({ status: "error", message: "标题和视频链接不能为空" }, 400);
  }

  const id =
    typeof body.id === "string" && body.id.trim()
      ? body.id.trim()
      : `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    await db
      .prepare(`
        INSERT INTO videos (id, title, description, duration, file_size, poster_url, asset_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, title, description, duration, fileSize, posterUrl, assetUrl)
      .run();

    return jsonResponse({
      status: "ok",
      message: "视频添加成功",
      video: {
        id,
        title,
        description,
        duration,
        file_size: fileSize,
        poster_url: posterUrl,
        asset_url: assetUrl,
      },
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", message: "D1 database not bound" }, 500);
  }

  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");

  const auth = verifyAdminPassword(context.env, context.request, null);
  if (!auth.configured) {
    return jsonResponse({ status: "error", message: "服务端尚未配置 ADMIN_PASSWORD" }, 503);
  }
  if (!auth.valid) {
    return jsonResponse({ status: "error", message: "密码错误，无权删除" }, 403);
  }

  if (!id) {
    return jsonResponse({ status: "error", message: "缺少视频 id" }, 400);
  }

  try {
    await db.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
    return jsonResponse({ status: "ok", message: "视频删除成功" });
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};
