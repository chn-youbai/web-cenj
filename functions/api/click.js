// Cloudflare Pages Functions 原生后端接口
// 访问路由：/api/click

export async function onRequestGet(context) {
  const kv = context.env.CLICKS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: "KV not bound", value: 0 }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  const countStr = await kv.get("likes_count");
  const value = parseInt(countStr || "0", 10);

  return new Response(JSON.stringify({ value }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

export async function onRequestPost(context) {
  const kv = context.env.CLICKS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: "KV not bound", value: 0 }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  let add = 1;
  try {
    const body = await context.request.json();
    if (body && typeof body.amount === "number" && body.amount > 0) {
      add = Math.min(Math.floor(body.amount), 500); // 批量加点，单次上限 500
    }
  } catch (e) {
    // 若请求无 json body，默认加 1
  }

  const countStr = await kv.get("likes_count");
  let value = parseInt(countStr || "0", 10);
  value += add;

  await kv.put("likes_count", value.toString());

  return new Response(JSON.stringify({ value }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}
