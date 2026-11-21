import type { ReciteSyncPayload, ReciteSyncResponse } from "../../shared/types";
import { ensureReciteSyncTable } from "../_lib/db";
import type { Env } from "../_lib/env";
import {
  getErrorMessage,
  jsonResponse,
  noContentOptions,
  noStoreJsonResponse,
  readJsonBody,
} from "../_lib/http";

function isValidSyncKey(key: string): boolean {
  if (!key || key.length > 50) return false;
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const rawKey = (url.searchParams.get("key") || "").trim();

  if (!isValidSyncKey(rawKey)) {
    return jsonResponse({ status: "error", message: "无效的同步码 (请使用1-50位字符)" }, 400);
  }

  const db = context.env.DB;
  if (!db) {
    return jsonResponse({
      status: "fallback",
      message: "Database not bound. Local storage mode active.",
      key: rawKey,
    });
  }

  try {
    await ensureReciteSyncTable(db);
    const row = await db
      .prepare("SELECT data, updated_at FROM recite_sync WHERE key = ?")
      .bind(rawKey)
      .first<{ data?: string; updated_at?: number }>();

    if (!row?.data) {
      return noStoreJsonResponse({
        status: "empty",
        key: rawKey,
        message: "No existing cloud progress found for this key.",
      });
    }

    const parsed = JSON.parse(row.data) as ReciteSyncPayload;
    const resp: ReciteSyncResponse = {
      status: "ok",
      key: rawKey,
      data: parsed,
    };
    return noStoreJsonResponse(resp);
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

interface ReciteSyncPostBody extends Record<string, unknown> {
  key?: string;
  marks?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  updatedAt?: number;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await readJsonBody<ReciteSyncPostBody>(context.request);
  if (!parsed.ok) {
    return jsonResponse({ status: "error", message: "Malformed JSON body" }, 400);
  }

  const body = parsed.data;
  let key = typeof body.key === "string" ? body.key.trim() : "";
  if (!isValidSyncKey(key)) {
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    key = `GK-${randomHex}`;
  }

  const marks = body.marks && typeof body.marks === "object" ? body.marks : {};
  const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
  const updatedAt = typeof body.updatedAt === "number" ? body.updatedAt : Date.now();

  const payload: ReciteSyncPayload = {
    key,
    updatedAt,
    marksCount: Object.keys(marks).length,
    marks,
    settings,
  };

  const db = context.env.DB;
  if (!db) {
    return jsonResponse({
      status: "local_only",
      key,
      updatedAt,
      message: "Database not bound, progress saved in local memory.",
    });
  }

  try {
    await ensureReciteSyncTable(db);
    const existing = await db
      .prepare("SELECT data, updated_at FROM recite_sync WHERE key = ?")
      .bind(key)
      .first<{ data?: string; updated_at?: number }>();

    if (existing?.updated_at && existing.updated_at > updatedAt + 2000 && existing.data) {
      try {
        const cloudData = JSON.parse(existing.data) as ReciteSyncPayload;
        return jsonResponse({
          status: "conflict",
          key,
          message: "Cloud version is newer than client version",
          cloudData,
        });
      } catch {
        // continue overwrite if cloud json is corrupt
      }
    }

    await db
      .prepare(`
        INSERT INTO recite_sync (key, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      `)
      .bind(key, JSON.stringify(payload), updatedAt)
      .run();

    return jsonResponse({
      status: "ok",
      key,
      updatedAt,
      marksCount: payload.marksCount,
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, OPTIONS");
};
