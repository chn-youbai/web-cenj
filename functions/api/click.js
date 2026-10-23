// Cloudflare Pages Functions 原生后端接口
// 访问路由：/api/click
// 数据持久化：支持 Cloudflare D1 边缘数据库 (site_stats 表) 与 KV (CLICKS_KV) 双模式

export async function onRequestGet(context) {
  const db = context.env.DB;
  const kv = context.env.CLICKS_KV;

  // 1. 优先使用已绑定的 Cloudflare D1 数据库持久化存储
  if (db) {
    try {
      const row = await db.prepare("SELECT value FROM site_stats WHERE key = 'likes_count'").first();
      const value = row ? Number(row.value) : 0;
      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error("D1 get likes error:", e);
    }
  }

  // 2. 备选方案：Cloudflare KV 命名空间
  if (kv) {
    try {
      const countStr = await kv.get("likes_count");
      const value = parseInt(countStr || "0", 10);
      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error("KV get likes error:", e);
    }
  }

  // 3. 降级模式
  return new Response(JSON.stringify({ error: "Storage not bound", value: 0 }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const kv = context.env.CLICKS_KV;

  let add = 1;
  try {
    const body = await context.request.json();
    if (body && typeof body.amount === "number" && body.amount > 0) {
      add = Math.min(Math.floor(body.amount), 500); // 批量点赞，单次上限 500
    }
  } catch (e) {
    // 默认加 1
  }

  // 1. D1 数据库原子并发自增
  if (db) {
    try {
      await db.prepare(
        "INSERT INTO site_stats (key, value) VALUES ('likes_count', ?) ON CONFLICT(key) DO UPDATE SET value = value + ?"
      ).bind(add, add).run();

      const row = await db.prepare("SELECT value FROM site_stats WHERE key = 'likes_count'").first();
      const value = row ? Number(row.value) : add;

      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error("D1 update likes error:", e);
    }
  }

  // 2. KV 自增
  if (kv) {
    try {
      const countStr = await kv.get("likes_count");
      let value = parseInt(countStr || "0", 10);
      value += add;
      await kv.put("likes_count", value.toString());

      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      console.error("KV update likes error:", e);
    }
  }

  return new Response(JSON.stringify({ error: "Storage not bound", value: 0 }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
