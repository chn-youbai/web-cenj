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
    // 1. GET 请求：获取状态、心跳、所有订阅、节点、常用地区测速数据
    if (request.method === "GET") {
      const pwd = url.searchParams.get("pwd") || "";

      if (pwd !== AUTH_PASSWORD) {
        return new Response(JSON.stringify({ status: "error", message: "密码错误" }), { status: 401, headers: corsHeaders });
      }

      const records = await db.prepare("SELECT * FROM clash_control WHERE id IN ('latest', 'heartbeat', 'profiles', 'nodes', 'speed_data')").all();
      const map = {};
      for (const row of records.results || []) {
        map[row.id] = row;
      }

      let parsedProfiles = null;
      let parsedNodes = null;
      let parsedSpeed = null;

      try {
        if (map['profiles'] && map['profiles'].payload) {
          parsedProfiles = JSON.parse(map['profiles'].payload);
        }
      } catch (e) {}

      try {
        if (map['nodes'] && map['nodes'].payload) {
          parsedNodes = JSON.parse(map['nodes'].payload);
        }
      } catch (e) {}

      try {
        if (map['speed_data'] && map['speed_data'].payload) {
          parsedSpeed = JSON.parse(map['speed_data'].payload);
        }
      } catch (e) {}


      // 计算心跳距离当前时间的秒数差距 (判断电脑是否在线)
      let heartbeatObj = null;
      if (map['heartbeat']) {
        const hbTime = new Date(map['heartbeat'].updated_at + " UTC").getTime();
        const nowTime = Date.now();
        const diffSec = Math.max(0, Math.round((nowTime - hbTime) / 1000));
        const isOnline = diffSec <= 45; // 45秒内有心跳则在线，否则关机/离线

        heartbeatObj = {
          status: isOnline ? "online" : "offline",
          diff_sec: diffSec,
          result: map['heartbeat'].result,
          updated_at: map['heartbeat'].updated_at
        };
      }

      return new Response(JSON.stringify({
        status: "ok",
        server_time: new Date().toISOString(),
        latest_command: map['latest'] ? {
          command: map['latest'].command,
          payload: map['latest'].payload,
          status: map['latest'].status,
          result: map['latest'].result,
          updated_at: map['latest'].updated_at
        } : null,
        heartbeat: heartbeatObj,
        profiles_data: parsedProfiles,
        nodes_data: parsedNodes,
        speed_data: parsedSpeed
      }), { headers: corsHeaders });
    }

    // 2. POST 请求：下发指令 (Web端) 或上报状态/数据 (PC端)
    if (request.method === "POST") {
      const data = await request.json().catch(() => ({}));
      if (data.pwd !== AUTH_PASSWORD) {
        return new Response(JSON.stringify({ status: "error", message: "密码错误" }), { status: 401, headers: corsHeaders });
      }

      const action = data.action; 

      // Web 端：下发指令
      if (action === "dispatch_command") {
        const cmd = data.command; // 'update_sub', 'switch_node', 'switch_profile', 'check_delay', 'restart'
        const payload = data.payload || "";

        await db.prepare(
          "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
          "VALUES ('latest', ?, ?, 'pending', '等待电脑执行...', datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET command = excluded.command, payload = excluded.payload, status = excluded.status, result = excluded.result, updated_at = excluded.updated_at"
        ).bind(cmd, payload).run();

        return new Response(JSON.stringify({ status: "ok", message: "指令已下发" }), { headers: corsHeaders });
      }

      // PC 端：上报心跳
      if (action === "report_heartbeat") {
        const info = data.info || "在线";
        await db.prepare(
          "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
          "VALUES ('heartbeat', 'heartbeat', '', 'online', ?, datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET status = 'online', result = excluded.result, updated_at = excluded.updated_at"
        ).bind(info).run();

        return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
      }

      // PC 端：上报指令执行结果
      if (action === "report_result") {
        const cmd = data.command;
        const result = data.result || "";
        const status = data.exec_status || "done";

        await db.prepare(
          "UPDATE clash_control SET status = ?, result = ?, updated_at = datetime('now') WHERE id = 'latest'"
        ).bind(status, result).run();

        return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
      }

      // PC 端：同步订阅列表详情
      if (action === "sync_profiles") {
        const profilesJson = JSON.stringify(data.profiles || []);
        await db.prepare(
          "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
          "VALUES ('profiles', 'profiles', ?, 'ok', '已同步', datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
        ).bind(profilesJson).run();

        return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
      }

      // PC 端：同步常用地区测速数据及全量节点
      if (action === "sync_speed_data") {
        const speedJson = JSON.stringify(data.speed_data || {});
        const nodesJson = JSON.stringify(data.nodes_data || {});

        await db.prepare(
          "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
          "VALUES ('speed_data', 'speed_data', ?, 'ok', '已同步', datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
        ).bind(speedJson).run();

        await db.prepare(
          "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
          "VALUES ('nodes', 'nodes', ?, 'ok', '已同步', datetime('now')) " +
          "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
        ).bind(nodesJson).run();

        return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ status: "error", message: "未知动作" }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ status: "error", message: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), { status: 500, headers: corsHeaders });
  }
}
