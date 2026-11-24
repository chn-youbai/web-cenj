import type {
  ClashCommandRecord,
  ClashHeartbeat,
  ClashNodesData,
  ClashProfilesData,
  ClashSpeedData,
  ClashStatusResponse,
} from "../../shared/types";
import type { Env } from "../_lib/env";
import { getErrorMessage, jsonResponse, noContentOptions, readJsonBody } from "../_lib/http";

interface ClashControlRow {
  id: string;
  command: string;
  payload: string;
  status: string;
  result: string;
  dispatched_at: string | null;
  responded_at: string | null;
  updated_at: string;
}

function safeJsonParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface ClashPostBody extends Record<string, unknown> {
  pwd?: string;
  password?: string;
  old_pwd?: string;
  new_pwd?: string;
  action?: string;
  command?: string;
  payload?: string;
  info?: string;
  result?: string;
  exec_status?: string;
  profiles?: unknown;
  speed_data?: unknown;
  nodes_data?: unknown;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "OPTIONS") {
    return noContentOptions("GET, POST, OPTIONS");
  }

  if (!db) {
    return jsonResponse({ status: "error", message: "D1 database (DB) not bound" }, 500);
  }

  try {
    if (request.method === "GET") {
      const records = await db
        .prepare(
          "SELECT * FROM clash_control WHERE id IN ('latest', 'heartbeat', 'profiles', 'nodes', 'speed_data')",
        )
        .all<ClashControlRow>();

      const map: Record<string, ClashControlRow> = {};
      for (const row of records.results || []) {
        map[row.id] = row;
      }

      const parsedProfiles = safeJsonParse<ClashProfilesData>(map.profiles?.payload);
      const parsedNodes = safeJsonParse<ClashNodesData>(map.nodes?.payload);
      const parsedSpeed = safeJsonParse<ClashSpeedData>(map.speed_data?.payload);

      let heartbeatObj: ClashHeartbeat | null = null;
      const hbRow = map.heartbeat;
      if (hbRow) {
        const hbTime = new Date(`${hbRow.updated_at} UTC`).getTime();
        const nowTime = Date.now();
        const diffSec = Number.isNaN(hbTime)
          ? 9999
          : Math.max(0, Math.round((nowTime - hbTime) / 1000));
        const isOnline = diffSec <= 75;

        heartbeatObj = {
          status: isOnline ? "online" : "offline",
          diff_sec: diffSec,
          result: hbRow.result,
          updated_at: hbRow.updated_at,
        };
      }

      const latestRow = map.latest;
      const latestCommand: ClashCommandRecord | null = latestRow
        ? {
            command: latestRow.command,
            payload: latestRow.payload,
            status: latestRow.status,
            result: latestRow.result,
            dispatched_at: latestRow.dispatched_at || null,
            responded_at: latestRow.responded_at || null,
            updated_at: latestRow.updated_at,
          }
        : null;

      const resp: ClashStatusResponse = {
        status: "ok",
        server_time: new Date().toISOString(),
        latest_command: latestCommand,
        heartbeat: heartbeatObj,
        profiles_data: parsedProfiles,
        nodes_data: parsedNodes,
        speed_data: parsedSpeed,
      };
      return jsonResponse(resp);
    }

    if (request.method === "POST") {
      const parsed = await readJsonBody<ClashPostBody>(request);
      const data: ClashPostBody = parsed.ok ? parsed.data : {};
      const action = typeof data.action === "string" ? data.action : "";

      if (action === "dispatch_command") {
        const cmd = typeof data.command === "string" ? data.command : "";
        const payload = typeof data.payload === "string" ? data.payload : "";
        if (!cmd) {
          return jsonResponse({ status: "error", message: "缺少指令名称" }, 400);
        }
        const nowIso = new Date().toISOString();

        await db
          .prepare(
            "INSERT INTO clash_control (id, command, payload, status, result, dispatched_at, responded_at, updated_at) " +
              "VALUES ('latest', ?, ?, 'pending', '等待电脑执行...', ?, NULL, datetime('now')) " +
              "ON CONFLICT(id) DO UPDATE SET command = excluded.command, payload = excluded.payload, status = excluded.status, result = excluded.result, dispatched_at = excluded.dispatched_at, responded_at = NULL, updated_at = excluded.updated_at",
          )
          .bind(cmd, payload, nowIso)
          .run();

        return jsonResponse({ status: "ok", message: "指令已下发", dispatched_at: nowIso });
      }

      if (action === "report_heartbeat") {
        const info = typeof data.info === "string" && data.info ? data.info : "在线";
        await db
          .prepare(
            "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
              "VALUES ('heartbeat', 'heartbeat', '', 'online', ?, datetime('now')) " +
              "ON CONFLICT(id) DO UPDATE SET status = 'online', result = excluded.result, updated_at = excluded.updated_at",
          )
          .bind(info)
          .run();

        return jsonResponse({ status: "ok" });
      }

      if (action === "report_result") {
        const result = typeof data.result === "string" ? data.result : "";
        const status =
          typeof data.exec_status === "string" && data.exec_status ? data.exec_status : "done";
        const nowIso = new Date().toISOString();

        await db
          .prepare(
            "UPDATE clash_control SET status = ?, result = ?, responded_at = ?, updated_at = datetime('now') WHERE id = 'latest'",
          )
          .bind(status, result, nowIso)
          .run();

        return jsonResponse({ status: "ok", responded_at: nowIso });
      }

      if (action === "sync_profiles") {
        const profilesJson = JSON.stringify(data.profiles || []);
        await db
          .prepare(
            "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
              "VALUES ('profiles', 'profiles', ?, 'ok', '已同步', datetime('now')) " +
              "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
          )
          .bind(profilesJson)
          .run();

        return jsonResponse({ status: "ok" });
      }

      if (action === "sync_speed_data") {
        const speedJson = JSON.stringify(data.speed_data || {});
        const nodesJson = JSON.stringify(data.nodes_data || {});

        await db
          .prepare(
            "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
              "VALUES ('speed_data', 'speed_data', ?, 'ok', '已同步', datetime('now')) " +
              "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
          )
          .bind(speedJson)
          .run();

        await db
          .prepare(
            "INSERT INTO clash_control (id, command, payload, status, result, updated_at) " +
              "VALUES ('nodes', 'nodes', ?, 'ok', '已同步', datetime('now')) " +
              "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
          )
          .bind(nodesJson)
          .run();

        return jsonResponse({ status: "ok" });
      }

      return jsonResponse({ status: "error", message: "未知动作" }, 400);
    }

    return jsonResponse({ status: "error", message: "Method Not Allowed" }, 405);
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};
