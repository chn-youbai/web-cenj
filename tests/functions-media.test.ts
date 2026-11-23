import type { MediaListResponse, MediaUploadResponse } from "@shared/types";
import { describe, expect, it } from "vitest";
import type { Env } from "../functions/_lib/env";
import {
  onRequestDelete as deleteMedia,
  onRequestGet as getMediaList,
  onRequestPatch as patchMedia,
  onRequestPost as postMedia,
} from "../functions/api/media";
import { onRequestGet as getMediaFile } from "../functions/api/media-file";

interface MediaRow {
  id: string;
  kind: string;
  title: string;
  album: string;
  description: string;
  visibility: string;
  storage_tier: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  duration: number;
  asset_url: string;
  asset_id: number | null;
  chunks_json: string;
  has_thumb: number;
  poster_url: string;
  downloads: number;
  created_at: number;
  updated_at: number;
}

function createMockGalleryDb() {
  const items = new Map<string, MediaRow>();
  const blobs = new Map<string, Uint8Array>();
  const thumbs = new Map<string, { mime_type: string; data: Uint8Array }>();
  const meta = new Map<string, string>();

  const makeStmt = (sql: string, args: unknown[] = []): D1PreparedStatement => {
    const s = sql.trim().replace(/\s+/g, " ");
    const stmt = {
      bind(...nextArgs: unknown[]) {
        return makeStmt(sql, nextArgs);
      },
      async first<T>() {
        if (s.startsWith("SELECT value FROM media_meta WHERE key = ?")) {
          const val = meta.get(String(args[0]));
          return (val !== undefined ? { value: val } : null) as T | null;
        }
        if (s.startsWith("SELECT visibility FROM media_items WHERE id = ?")) {
          const row = items.get(String(args[0]));
          return (row ? { visibility: row.visibility } : null) as T | null;
        }
        if (s.includes("FROM media_items WHERE id = ?")) {
          return (items.get(String(args[0])) ?? null) as T | null;
        }
        if (s.startsWith("SELECT mime_type, data FROM media_thumbs WHERE media_id = ?")) {
          return (thumbs.get(String(args[0])) ?? null) as T | null;
        }
        if (s.startsWith("SELECT data FROM media_blobs WHERE media_id = ? AND chunk_index = ?")) {
          const data = blobs.get(`${String(args[0])}:${Number(args[1])}`);
          return (data ? { data } : null) as T | null;
        }
        return null;
      },
      async all<T>() {
        if (s.includes("FROM videos ORDER BY")) {
          return { results: [] as T[], success: true, meta: {} };
        }
        if (s.startsWith("SELECT * FROM media_items WHERE visibility = 'public'")) {
          const list = Array.from(items.values())
            .filter((i) => i.visibility === "public")
            .sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        if (s.startsWith("SELECT * FROM media_items ORDER BY")) {
          const list = Array.from(items.values()).sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        return { results: [] as T[], success: true, meta: {} };
      },
      async run() {
        if (s.startsWith("INSERT OR REPLACE INTO media_meta")) {
          meta.set(String(args[0]), String(args[1]));
        } else if (s.startsWith("INSERT INTO media_items")) {
          const id = String(args[0]);
          if (s.includes("'cf_d1'")) {
            items.set(id, {
              id,
              kind: String(args[1]),
              title: String(args[2]),
              album: String(args[3]),
              description: String(args[4]),
              visibility: String(args[5]),
              storage_tier: "cf_d1",
              mime_type: String(args[6]),
              file_size: Number(args[7]),
              width: Number(args[8]),
              height: Number(args[9]),
              duration: Number(args[10]),
              asset_url: "",
              asset_id: null,
              chunks_json: "[]",
              has_thumb: 0,
              poster_url: "",
              downloads: 0,
              created_at: Number(args[11]),
              updated_at: Number(args[12]),
            });
          }
        } else if (s.startsWith("INSERT INTO media_blobs")) {
          blobs.set(`${String(args[0])}:${Number(args[1])}`, args[2] as Uint8Array);
        } else if (s.startsWith("INSERT OR REPLACE INTO media_thumbs")) {
          thumbs.set(String(args[0]), {
            mime_type: String(args[1]),
            data: args[2] as Uint8Array,
          });
        } else if (s.startsWith("UPDATE media_items SET has_thumb = 1")) {
          const row = items.get(String(args[0]));
          if (row) row.has_thumb = 1;
        } else if (s.startsWith("UPDATE media_items SET downloads = downloads + 1")) {
          const row = items.get(String(args[0]));
          if (row) row.downloads += 1;
        } else if (s.startsWith("UPDATE media_items SET title = ?")) {
          const row = items.get(String(args[5]));
          if (row) {
            row.title = String(args[0]);
            row.album = String(args[1]);
            row.description = String(args[2]);
            row.visibility = String(args[3]);
            row.updated_at = Number(args[4]);
          }
        } else if (s.startsWith("DELETE FROM media_blobs")) {
          const prefix = `${String(args[0])}:`;
          for (const key of Array.from(blobs.keys())) {
            if (key.startsWith(prefix)) blobs.delete(key);
          }
        } else if (s.startsWith("DELETE FROM media_thumbs")) {
          thumbs.delete(String(args[0]));
        } else if (s.startsWith("DELETE FROM media_items")) {
          items.delete(String(args[0]));
        }
        return { success: true, meta: {} };
      },
    };
    return stmt as unknown as D1PreparedStatement;
  };

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch(stmts: D1PreparedStatement[]) {
      const res = [];
      for (const st of stmts) res.push(await st.run());
      return res;
    },
  } as unknown as D1Database;
}

function makeCtx(request: Request, env: Env) {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      request,
      env,
      params: {},
      waitUntil(p: Promise<unknown>) {
        pending.push(p);
      },
      passThroughOnException() {},
      next: async () => new Response(),
      data: {},
      functionPath: "/api/media",
    } as unknown as EventContext<Env, string, Record<string, unknown>>,
    flush: () => Promise.all(pending),
  };
}

describe("functions /api/media and /api/media-file", () => {
  it("supports public photo upload with WebP thumb, cf_d1 Range stream, private isolation, and admin-only edit/delete", async () => {
    const db = createMockGalleryDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "gallery-secret-pass" };

    // 1. Public photo upload (<=20MB -> cf_d1)
    const imgBytes = new TextEncoder().encode("RAW-PHOTO-BYTES-XYZ");
    const uploadResp = await postMedia(
      makeCtx(
        new Request("https://example.com/api/media?action=upload", {
          method: "POST",
          headers: {
            "Content-Type": "image/jpeg",
            "X-File-Name": encodeURIComponent("coast.jpg"),
            "X-Title": encodeURIComponent("海岸航拍"),
            "X-Media-Kind": "photo",
            "X-Media-Album": encodeURIComponent("旅行记忆"),
            "X-Media-Visibility": "public",
            "X-Media-Width": "1920",
            "X-Media-Height": "1080",
            "X-Media-Size": String(imgBytes.byteLength),
          },
          body: imgBytes,
        }),
        env,
      ).ctx,
    );
    const uploadData = (await uploadResp.json()) as MediaUploadResponse;
    expect(uploadResp.status).toBe(201);
    expect(uploadData.item?.storage_tier).toBe("cf_d1");
    expect(uploadData.item?.album).toBe("旅行记忆");
    const pubId = uploadData.item?.id ?? "";

    // 2. Upload & fetch WebP thumbnail
    const thumbBytes = new TextEncoder().encode("WEBP-THUMB");
    const thumbPost = await postMedia(
      makeCtx(
        new Request(`https://example.com/api/media?action=thumb&id=${pubId}`, {
          method: "POST",
          headers: { "Content-Type": "image/webp" },
          body: thumbBytes,
        }),
        env,
      ).ctx,
    );
    expect(thumbPost.status).toBe(200);

    const thumbGet = await getMediaFile(
      makeCtx(new Request(`https://example.com/api/media-file?id=${pubId}&thumb=1`), env).ctx,
    );
    expect(thumbGet.status).toBe(200);
    expect(await thumbGet.text()).toBe("WEBP-THUMB");

    // 3. Original file Range 206 read
    const rangeCtx = makeCtx(
      new Request(`https://example.com/api/media-file?id=${pubId}&download=1`, {
        headers: { Range: "bytes=4-8" },
      }),
      env,
    );
    const rangeResp = await getMediaFile(rangeCtx.ctx);
    expect(rangeResp.status).toBe(206);
    expect(await rangeResp.text()).toBe("PHOTO");
    await rangeCtx.flush();

    // 4. Private upload denied without password, succeeds with password
    const privDeny = await postMedia(
      makeCtx(
        new Request("https://example.com/api/media?action=upload", {
          method: "POST",
          headers: {
            "X-File-Name": "secret.mp4",
            "X-Media-Kind": "video",
            "X-Media-Visibility": "private",
            "X-Media-Size": "5",
          },
          body: new TextEncoder().encode("12345"),
        }),
        env,
      ).ctx,
    );
    expect(privDeny.status).toBe(401);

    const privOk = await postMedia(
      makeCtx(
        new Request("https://example.com/api/media?action=upload", {
          method: "POST",
          headers: {
            "X-Admin-Password": "gallery-secret-pass",
            "X-File-Name": "secret.mp4",
            "X-Media-Kind": "video",
            "X-Media-Visibility": "private",
            "X-Media-Size": "5",
          },
          body: new TextEncoder().encode("12345"),
        }),
        env,
      ).ctx,
    );
    const privData = (await privOk.json()) as MediaUploadResponse;
    expect(privOk.status).toBe(201);
    const privId = privData.item?.id ?? "";

    // 5. Private media hidden from unauthenticated list & blocked on download
    const pubList = (await (
      await getMediaList(makeCtx(new Request("https://example.com/api/media"), env).ctx)
    ).json()) as MediaListResponse;
    expect(pubList.items.map((i) => i.id)).toEqual([pubId]);

    const adminList = (await (
      await getMediaList(
        makeCtx(
          new Request("https://example.com/api/media", {
            headers: { "X-Admin-Password": "gallery-secret-pass" },
          }),
          env,
        ).ctx,
      )
    ).json()) as MediaListResponse;
    expect(adminList.isAdmin).toBe(true);
    expect(adminList.items.length).toBe(2);

    const privDlBlocked = await getMediaFile(
      makeCtx(new Request(`https://example.com/api/media-file?id=${privId}`), env).ctx,
    );
    expect(privDlBlocked.status).toBe(401);

    // 6. Edit & delete require admin password
    const patchOk = await patchMedia(
      makeCtx(
        new Request("https://example.com/api/media", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": "gallery-secret-pass",
          },
          body: JSON.stringify({ id: pubId, album: "精选风光", visibility: "private" }),
        }),
        env,
      ).ctx,
    );
    const patchData = (await patchOk.json()) as MediaUploadResponse;
    expect(patchOk.status).toBe(200);
    expect(patchData.item?.album).toBe("精选风光");
    expect(patchData.item?.visibility).toBe("private");

    const delDenied = await deleteMedia(
      makeCtx(new Request(`https://example.com/api/media?id=${pubId}`, { method: "DELETE" }), env)
        .ctx,
    );
    expect(delDenied.status).toBe(401);

    const delOk = await deleteMedia(
      makeCtx(
        new Request(`https://example.com/api/media?id=${pubId}`, {
          method: "DELETE",
          headers: { "X-Admin-Password": "gallery-secret-pass" },
        }),
        env,
      ).ctx,
    );
    expect(delOk.status).toBe(200);
  });
});
