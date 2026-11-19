import type { Env } from "../_lib/env";
import {
  DEFAULT_CORS_HEADERS,
  getErrorMessage,
  jsonResponse,
  noContentOptions,
  noStoreJsonResponse,
  readJsonBody,
} from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const kv = context.env.CLICKS_KV || context.env.TAKEOUT_KV;
  if (!kv) {
    return noStoreJsonResponse({
      status: "local_only",
      message: "KV not bound, local mode active",
      data: null,
    });
  }

  try {
    const rawData = await kv.get("takeout_backup_data");
    if (!rawData) {
      return noStoreJsonResponse({ status: "empty", data: null });
    }

    return new Response(rawData, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        ...DEFAULT_CORS_HEADERS,
      },
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const kv = context.env.CLICKS_KV || context.env.TAKEOUT_KV;
  if (!kv) {
    return jsonResponse({ status: "local_only", message: "KV not bound" });
  }

  try {
    const parsed = await readJsonBody<Record<string, unknown>>(context.request);
    if (!parsed.ok) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const body = parsed.data;
    await kv.put("takeout_backup_data", JSON.stringify(body));

    return jsonResponse({
      status: "ok",
      updateTime: typeof body.updateTime === "string" ? body.updateTime : new Date().toISOString(),
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, OPTIONS");
};
