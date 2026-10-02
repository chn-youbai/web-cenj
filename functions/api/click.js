// Cloudflare Pages Functions 原生后端接口
// 访问路由：/api/click

export async function onRequestGet(context) {
  // 从环境变量中读取绑定的 CLICKS_KV 数据库
  const kv = context.env.CLICKS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: "KV not bound", value: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const countStr = await kv.get("likes_count");
  const value = parseInt(countStr || "0", 10);

  return new Response(JSON.stringify({ value }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestPost(context) {
  const kv = context.env.CLICKS_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: "KV not bound", value: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const countStr = await kv.get("likes_count");
  let value = parseInt(countStr || "0", 10);
  value += 1;

  await kv.put("likes_count", value.toString());

  return new Response(JSON.stringify({ value }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
