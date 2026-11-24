import type {
  AirportType,
  SubLinksListResponse,
  TempSubLinkItem,
  TempSubLinkStatus,
} from "../../shared/types";
import { ensureSubLinksTable } from "../_lib/db";
import type { Env } from "../_lib/env";
import { jsonResponse, noContentOptions, noStoreJsonResponse, readJsonBody } from "../_lib/http";

interface TempLinkRow {
  token: string;
  airport: string;
  label: string;
  expires_at: number | null;
  max_uses: number | null;
  used_count: number;
  revoked: number;
  created_at: number;
  last_used_at: number | null;
}

function computeStatus(row: TempLinkRow, now = Date.now()): TempSubLinkStatus {
  if (row.revoked) return "revoked";
  if (row.expires_at !== null && now > Number(row.expires_at)) return "expired";
  if (row.max_uses !== null && Number(row.used_count) >= Number(row.max_uses)) return "exhausted";
  return "active";
}

function rowToItem(row: TempLinkRow, now = Date.now()): TempSubLinkItem {
  return {
    token: row.token,
    airport: row.airport === "vpn07" ? "vpn07" : "djjc",
    label: row.label || "",
    expires_at: row.expires_at !== null ? Number(row.expires_at) : null,
    max_uses: row.max_uses !== null ? Number(row.max_uses) : null,
    used_count: Number(row.used_count) || 0,
    revoked: Boolean(row.revoked),
    status: computeStatus(row, now),
    created_at: Number(row.created_at) || 0,
    last_used_at: row.last_used_at !== null ? Number(row.last_used_at) : null,
  };
}

function generateTempToken(): string {
  const raw = crypto.randomUUID().replace(/-/g, "");
  return `tmp_${raw.slice(0, 14)}`;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, PATCH, DELETE, OPTIONS");
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return noStoreJsonResponse(
      { status: "error", links: [], error: "D1 数据库未绑定" } satisfies SubLinksListResponse,
      503,
    );
  }

  await ensureSubLinksTable(db);
  const { results } = await db
    .prepare("SELECT * FROM sub_temp_links ORDER BY created_at DESC")
    .all<TempLinkRow>();

  const now = Date.now();
  const links = (results || []).map((r) => rowToItem(r, now));
  return noStoreJsonResponse({ status: "ok", links } satisfies SubLinksListResponse);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await readJsonBody<{
    airport?: string;
    label?: string;
    ttlMinutes?: number | null;
    maxUses?: number | null;
    password?: string;
  }>(context.request);
  if (!parsed.ok) {
    return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
  }

  const body = parsed.data;
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "D1 数据库未绑定" }, 503);
  }

  await ensureSubLinksTable(db);
  const now = Date.now();
  const airport: AirportType = body.airport === "vpn07" ? "vpn07" : "djjc";
  const label = (body.label || "").trim().slice(0, 80);

  const ttlMin = Number(body.ttlMinutes);
  const expiresAt =
    Number.isFinite(ttlMin) && ttlMin > 0 ? now + Math.round(ttlMin * 60 * 1000) : null;

  const maxUsesRaw = Number(body.maxUses);
  const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw > 0 ? Math.floor(maxUsesRaw) : null;

  const token = generateTempToken();
  await db
    .prepare(`
      INSERT INTO sub_temp_links
        (token, airport, label, expires_at, max_uses, used_count, revoked, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, NULL)
    `)
    .bind(token, airport, label, expiresAt, maxUses, now)
    .run();

  const item: TempSubLinkItem = {
    token,
    airport,
    label,
    expires_at: expiresAt,
    max_uses: maxUses,
    used_count: 0,
    revoked: false,
    status: "active",
    created_at: now,
    last_used_at: null,
  };

  return jsonResponse({ status: "ok", link: item }, 201);
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const parsed = await readJsonBody<{
    token?: string;
    revoked?: boolean;
    password?: string;
  }>(context.request);
  if (!parsed.ok) {
    return jsonResponse({ status: "error", error: "请求体必须为 JSON" }, 400);
  }

  const body = parsed.data;
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "D1 数据库未绑定" }, 503);
  }
  await ensureSubLinksTable(db);

  const token = (body.token || "").trim();
  if (!token) {
    return jsonResponse({ status: "error", error: "缺少 token" }, 400);
  }

  const revoked = body.revoked === false ? 0 : 1;
  await db
    .prepare("UPDATE sub_temp_links SET revoked = ? WHERE token = ?")
    .bind(revoked, token)
    .run();

  return jsonResponse({ status: "ok", token, revoked: Boolean(revoked) });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ status: "error", error: "D1 数据库未绑定" }, 503);
  }
  await ensureSubLinksTable(db);

  const url = new URL(context.request.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!token) {
    return jsonResponse({ status: "error", error: "缺少 token" }, 400);
  }

  await db.prepare("DELETE FROM sub_temp_links WHERE token = ?").bind(token).run();
  return jsonResponse({ status: "ok", token });
};
