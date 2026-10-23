// Cloudflare Pages Functions - Clash Verge Remote Control API
const AUTH_PASSWORD = "8888";

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);

  // 跨域处理
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    // 1. GET 请求：获取当前控制状态和电脑最新心跳
    if (request.method === "GET") {
      const mode = url.searchParams.get("mode") || "web"; // web 或 pc
      const pwd = url.searchParams.get("pwd") || "";

      // 简单密码鉴权 (PC 端也携带 pwd 或预设 secret)
      if (pwd !== AUTH_PASSWORD) {
        return new Response(JSON.stringify({ status: "error", message: "密码错误" }), { status: 401, headers: corsHeaders });
      }

      // 获取指令记录 (id: 'latest') 和心跳记录 (id: 'heartbeat')
      const records = await db.prepare("SELECT * FROM clash_control WHERE id IN ('latest', 'heartbeat')").all();
      const map = {};
      for (const row of records.results || []) {
        map[row.id] = row;
      }

      return new Response(JSON.stringify({
        status: "ok",
        latest_command: map['latest'] ? {
          command: map['latest'].command,
          payload: map['latest'].payload,
          status: map['latest'].status,
          result: map['latest'].result,
          updated_at: map['latest'].updated_at
        } : null,
        heartbeat: map['heartbeat'] ? {
          status: map['heartbeat'].status,
          result: map['heartbeat'].result,
          updated_at: map['heartbeat'].updated_at
        } : null
      }), { headers: corsHeaders });
    }

    // 2. POST 请求：下发指令 (Web端) 或上报状态 (PC端)
    if (request.method === "POST") {
      const data = await request.json().catch(() => ({}));
      if (data.pwd !== AUTH_PASSWORD) {
        return new Response(JSON.stringify({ status: "error", message: "密码错误" }), { status: 401, headers: corsHeaders });
      }

      const action = data.action; // 'dispatch_command' (来自Web) 或 'report_heartbeat' (来自PC) 或 'report_result' (来自PC)

      if (action === "dispatch_command") {
        const cmd = data.command; // 'update_sub', 'switch_node', 'check_delay', 'restart'
        const payload = data.payload || "";

        await db.prepare(
          "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
          "VALUES ('latest', ?, ?, 'pending', '等待电脑执行...', datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET command = excluded.command, payload = excluded.payload, status = excluded.status, result = excluded.result, updated_at = excluded.updated_at"
        ).bind(cmd, payload).run();

        return new Response(JSON.stringify({ status: "ok", message: "指令已下发" }), { headers: corsHeaders });
      }

      if (action === "report_heartbeat") {
        const info = data.info || "在线";
        await db.prepare(
          "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
          "VALUES ('heartbeat', 'heartbeat', '', 'online', ?, datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET status = 'online', result = excluded.result, updated_at = excluded.updated_at"
        ).bind(info).run();

        return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
      }

      if (action === "report_result") {
        const cmd = data.command;
        const result = data.result || "";
        const status = data.exec_status || "done";

        await db.prepare(
          "UPDATE clash_control SET status = ?, result = ?, updated_at = datetime('now') WHERE id = 'latest'"
        ).bind(status, result).run();

        return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ status: "error", message: "未知动作" }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ status: "error", message: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), { status: 500, headers: corsHeaders });
  }
}
