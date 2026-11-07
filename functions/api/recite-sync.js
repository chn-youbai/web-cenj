// Cloudflare Pages Function: /api/recite-sync
// 高考英语 2050 智能过词系统：匿名配对短码跨端漫游同步接口
// 支持通过 6-8 位短码（如 GK-8823）在手机、平板与电脑间无密码漫游同步进度与笔记

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = (url.searchParams.get("key") || "").trim().toUpperCase();

  if (!key || key.length < 4 || key.length > 32 || !/^[A-Z0-9_\-]+$/.test(key)) {
    return new Response(JSON.stringify({
      status: "error",
      message: "Invalid or missing sync key. Format example: GK-8823"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
    });
  }

  const kv = context.env.CLICKS_KV || context.env.TAKEOUT_KV;
  if (!kv) {
    return new Response(JSON.stringify({
      status: "fallback",
      message: "Cloud KV storage not bound. Local storage mode active.",
      key: key
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const raw = await kv.get(`recite_sync_${key}`);
    if (!raw) {
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

    const parsed = JSON.parse(raw);
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

  let key = (body.key || "").trim().toUpperCase();
  // 若未携带或不符合规范，自动生成规范密钥 GK-XXXX
  if (!key || key.length < 4 || !/^[A-Z0-9_\-]+$/.test(key)) {
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    key = `GK-${randomHex}`;
  }

  const marks = body.marks || {};
  const memos = body.memos || {};
  const updatedAt = typeof body.updatedAt === "number" ? body.updatedAt : Date.now();

  const payload = {
    key: key,
    updatedAt: updatedAt,
    marksCount: Object.keys(marks).length,
    memosCount: Object.keys(memos).length,
    marks: marks,
    memos: memos
  };

  const kv = context.env.CLICKS_KV || context.env.TAKEOUT_KV;
  if (!kv) {
    return new Response(JSON.stringify({
      status: "local_only",
      key: key,
      updatedAt: updatedAt,
      message: "KV not bound, progress saved in local memory."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    // 乐观并发锁检查：如果云端已有更新的时间戳，避免旧客户端覆盖
    const existingRaw = await kv.get(`recite_sync_${key}`);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        if (existing.updatedAt && existing.updatedAt > updatedAt + 2000) {
          // 云端版本比客户端新，返回 conflict 提示并下发云端数据以便前端合并
          return new Response(JSON.stringify({
            status: "conflict",
            key: key,
            message: "Cloud version is newer than client version",
            cloudData: existing
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }
      } catch (parseErr) {
        // ignore parse error, continue writing
      }
    }

    await kv.put(`recite_sync_${key}`, JSON.stringify(payload), {
      // 保留 365 天过期（持续续期）
      expirationTtl: 31536000
    });

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
