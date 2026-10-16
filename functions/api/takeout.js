// Cloudflare Pages Functions: 沙县外卖记账助手云端存储 API
// 路由：/api/takeout

export async function onRequestGet(context) {
  const kv = context.env.CLICKS_KV || context.env.TAKEOUT_KV;
  if (!kv) {
    return new Response(JSON.stringify({ status: "local_only", message: "KV not bound, local mode active", data: null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    const rawData = await kv.get("takeout_backup_data");
    if (!rawData) {
      return new Response(JSON.stringify({ status: "empty", data: null }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response(rawData, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

export async function onRequestPost(context) {
  const kv = context.env.CLICKS_KV || context.env.TAKEOUT_KV;
  if (!kv) {
    return new Response(JSON.stringify({ status: "local_only", message: "KV not bound" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    const body = await context.request.json();
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 保存最新云端备份
    const serialized = JSON.stringify(body);
    await kv.put("takeout_backup_data", serialized);

    return new Response(JSON.stringify({ status: "ok", updateTime: body.updateTime || new Date().toISOString() }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
