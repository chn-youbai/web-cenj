import type { ClickStatsResponse } from "../../shared/types";
import type { Env } from "../_lib/env";
import { noContentOptions, noStoreJsonResponse, readJsonBody } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const kv = context.env.CLICKS_KV;

  if (db) {
    try {
      const row = await db
        .prepare("SELECT value FROM site_stats WHERE key = 'likes_count'")
        .first<{ value: number }>();
      const value = row ? Number(row.value) : 0;
      const body: ClickStatsResponse = { value };
      return noStoreJsonResponse(body);
    } catch (err) {
      console.error("D1 get likes error:", err);
    }
  }

  if (kv) {
    try {
      const countStr = await kv.get("likes_count");
      const value = Number.parseInt(countStr || "0", 10) || 0;
      const body: ClickStatsResponse = { value };
      return noStoreJsonResponse(body);
    } catch (err) {
      console.error("KV get likes error:", err);
    }
  }

  const fallbackBody: ClickStatsResponse = { error: "Storage not bound", value: 0 };
  return noStoreJsonResponse(fallbackBody);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const kv = context.env.CLICKS_KV;

  let add = 1;
  const parsed = await readJsonBody<{ amount?: unknown }>(context.request);
  if (parsed.ok && typeof parsed.data.amount === "number" && parsed.data.amount > 0) {
    add = Math.min(Math.floor(parsed.data.amount), 500);
  }

  if (db) {
    try {
      await db
        .prepare(
          "INSERT INTO site_stats (key, value) VALUES ('likes_count', ?) ON CONFLICT(key) DO UPDATE SET value = value + ?",
        )
        .bind(add, add)
        .run();

      const row = await db
        .prepare("SELECT value FROM site_stats WHERE key = 'likes_count'")
        .first<{ value: number }>();
      const value = row ? Number(row.value) : add;
      const body: ClickStatsResponse = { value };
      return noStoreJsonResponse(body);
    } catch (err) {
      console.error("D1 update likes error:", err);
    }
  }

  if (kv) {
    try {
      const countStr = await kv.get("likes_count");
      const current = Number.parseInt(countStr || "0", 10) || 0;
      const value = current + add;
      await kv.put("likes_count", value.toString());
      const body: ClickStatsResponse = { value };
      return noStoreJsonResponse(body);
    } catch (err) {
      console.error("KV update likes error:", err);
    }
  }

  const fallbackBody: ClickStatsResponse = { error: "Storage not bound", value: 0 };
  return noStoreJsonResponse(fallbackBody);
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, OPTIONS");
};
