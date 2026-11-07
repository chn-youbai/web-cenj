// Cloudflare Pages Function: /api/recite-sync
// 高考英语 2050 智能过词系统：匿名配对短码跨端漫游同步接口
// 基于 Cloudflare D1 分布式关系型数据库持久化存储 (支持 KV 兼容)

async function ensureTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS recite_sync (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
  } catch (e) {
    // ignore if table exists
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const rawKey = (url.searchParams.get("key") || "").trim();

  if (!rawKey || rawKey.length > 50 || /[\x00-\x1F\x7F]/.test(rawKey)) {
    return new Response(JSON.stringify({
      status: "error",
      message: "无效的同步码 (请使用1-50位字符)"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
    });
  }
  const key = rawKey;

  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({
      status: "fallback",
      message: "Database not bound. Local storage mode active.",
      key: key
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    await ensureTable(db);
    const row = await db.prepare("SELECT data, updated_at FROM recite_sync WHERE key = ?").bind(key).first();
    if (!row || !row.data) {
      return new Response(JSON.stringify({
        status: "empty",
        key: key,
        message: "No existing cloud progress found for this key."
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const parsed = JSON.parse(row.data);
    return new Response(JSON.stringify({
      status: "ok",
      key: key,
      data: parsed
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      status: "error",
      message: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ status: "error", message: "Malformed JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  let rawKey = (body.key || "").trim();
  if (!rawKey || rawKey.length > 50 || /[\x00-\x1F\x7F]/.test(rawKey)) {
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    rawKey = `GK-${randomHex}`;
  }
  const key = rawKey;

  const marks = body.marks || {};
  const memos = body.memos || {};
  const settings = body.settings || {};
  const updatedAt = typeof body.updatedAt === "number" ? body.updatedAt : Date.now();

  const payload = {
    key: key,
    updatedAt: updatedAt,
    marksCount: Object.keys(marks).length,
    memosCount: Object.keys(memos).length,
    marks: marks,
    memos: memos,
    settings: settings
  };

  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({
      status: "local_only",
      key: key,
      updatedAt: updatedAt,
      message: "Database not bound, progress saved in local memory."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    await ensureTable(db);
    // 乐观并发锁检查：如果云端已有更新的时间戳，避免旧客户端覆盖
    const existing = await db.prepare("SELECT data, updated_at FROM recite_sync WHERE key = ?").bind(key).first();
    if (existing && existing.updated_at && existing.updated_at > updatedAt + 2000) {
      try {
        const cloudData = JSON.parse(existing.data);
        return new Response(JSON.stringify({
          status: "conflict",
          key: key,
          message: "Cloud version is newer than client version",
          cloudData: cloudData
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {}
    }

    const dataJson = JSON.stringify(payload);
    await db.prepare(`
      INSERT INTO recite_sync (key, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).bind(key, dataJson, updatedAt).run();

    return new Response(JSON.stringify({
      status: "ok",
      key: key,
      updatedAt: updatedAt,
      marksCount: payload.marksCount,
      memosCount: payload.memosCount
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      status: "error",
      message: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
