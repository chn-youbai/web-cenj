// Cloudflare Pages Function: /api/videos
// 提供视频元数据的增删查接口（基于 Cloudflare D1 数据库）

const ADMIN_PASSWORD = "8888"; // 默认管理密码，与外卖助手一致

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Password, X-GitHub-Token",
    "Access-Control-Max-Age": "86400"
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET: 获取视频列表（支持 ?sync=1 从 GitHub Releases 自动补充未登记资产）
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ status: "error", message: "D1 database not bound", videos: [] }), {
      status: 200,
      headers: corsHeaders()
    });
  }

  const url = new URL(context.request.url);

  // 1. 如果请求 ?sync=1 且携带 Token，自动同步 GitHub Release 中的所有视频资产
  if (url.searchParams.get("sync") === "1") {
    const ghToken = context.request.headers.get("X-GitHub-Token") || url.searchParams.get("token");
    if (ghToken) {
      try {
        const ghRes = await fetch("https://api.github.com/repos/chn-youbai/web-cenj/releases/tags/v_media", {
          headers: {
            "Authorization": `token ${ghToken}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Cenj-Pages-Proxy"
          }
        });
        if (ghRes.ok) {
          const relData = await ghRes.json();
          const assets = relData.assets || [];
          for (const a of assets) {
            const existing = await db.prepare("SELECT id FROM videos WHERE asset_url = ?").bind(a.browser_download_url).first();
            if (!existing) {
              const vidId = "vid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
              const title = a.name.replace(/^[a-z0-9]+_/, "").replace(/\.[^/.]+$/, "");
              await db.prepare(`
                INSERT INTO videos (id, title, description, duration, file_size, poster_url, asset_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).bind(vidId, title, "从 GitHub Releases 自动同步", 0, a.size || 0, "", a.browser_download_url).run();
            }
          }
        }
      } catch (syncErr) {
        console.error("Auto-sync error:", syncErr);
      }
    }
  }

  try {
    const { results } = await db.prepare(`
      SELECT id, title, description, duration, file_size, poster_url, asset_url, download_count, created_at
      FROM videos
      ORDER BY created_at DESC
    `).all();

    return new Response(JSON.stringify({
      status: "ok",
      total: results ? results.length : 0,
      videos: results || []
    }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message, videos: [] }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// POST: 添加新视频（需校验密码）
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ status: "error", message: "D1 database not bound" }), {
      status: 500,
      headers: corsHeaders()
    });
  }

  let body = {};
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ status: "error", message: "Invalid JSON body" }), {
      status: 400,
      headers: corsHeaders()
    });
  }

  const password = body.password || context.request.headers.get("X-Admin-Password");
  if (password !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ status: "error", message: "密码错误，无权操作" }), {
      status: 403,
      headers: corsHeaders()
    });
  }

  const title = (body.title || "").trim();
  const asset_url = (body.asset_url || "").trim();
  const poster_url = (body.poster_url || "").trim();
  const duration = parseInt(body.duration || 0, 10);
  const file_size = parseInt(body.file_size || 0, 10);
  const description = (body.description || "").trim();

  if (!title || !asset_url) {
    return new Response(JSON.stringify({ status: "error", message: "标题和视频链接不能为空" }), {
      status: 400,
      headers: corsHeaders()
    });
  }

  const id = body.id || ("vid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6));

  try {
    await db.prepare(`
      INSERT INTO videos (id, title, description, duration, file_size, poster_url, asset_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, title, description, duration, file_size, poster_url, asset_url).run();

    return new Response(JSON.stringify({
      status: "ok",
      message: "视频添加成功",
      video: { id, title, description, duration, file_size, poster_url, asset_url }
    }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// DELETE: 删除指定视频（需校验密码）
export async function onRequestDelete(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const password = url.searchParams.get("password") || context.request.headers.get("X-Admin-Password");

  if (password !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ status: "error", message: "密码错误，无权删除" }), {
      status: 403,
      headers: corsHeaders()
    });
  }

  if (!id) {
    return new Response(JSON.stringify({ status: "error", message: "缺少视频 id" }), {
      status: 400,
      headers: corsHeaders()
    });
  }

  try {
    await db.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ status: "ok", message: "视频删除成功" }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
