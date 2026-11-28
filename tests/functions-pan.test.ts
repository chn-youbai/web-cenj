import type { PanListResponse, PanUploadResponse } from "@shared/types";
import { describe, expect, it } from "vitest";
import type { Env } from "../functions/_lib/env";
import {
  onRequestDelete as deletePan,
  onRequestGet as getPanList,
  onRequestPatch as patchPan,
  onRequestPost as postPan,
} from "../functions/api/pan";
import { onRequestGet as getPanFile } from "../functions/api/pan-file";

interface FileRow {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  category: string;
  visibility: string;
  storage_tier: string;
  folder_path: string;
  asset_url: string;
  asset_id: number | null;
  chunks_json: string;
  note: string;
  downloads: number;
  created_at: number;
  updated_at: number;
}

function createMockPanDb() {
  const files = new Map<string, FileRow>();
  const blobs = new Map<string, Uint8Array>();
  const meta = new Map<string, string>();
  const folders = new Map<string, { visibility: string; path: string; created_at: number }>();

  const makeStmt = (sql: string, args: unknown[] = []): D1PreparedStatement => {
    const s = sql.trim().replace(/\s+/g, " ");
    const stmt = {
      bind(...nextArgs: unknown[]) {
        return makeStmt(sql, nextArgs);
      },
      async first<T>() {
        if (s.startsWith("SELECT value FROM pan_meta WHERE key = ?")) {
          const val = meta.get(String(args[0]));
          return (val !== undefined ? { value: val } : null) as T | null;
        }
        if (s.includes("FROM pan_files WHERE id = ?")) {
          return (files.get(String(args[0])) ?? null) as T | null;
        }
        if (s.startsWith("SELECT data FROM pan_blobs WHERE file_id = ? AND chunk_index = ?")) {
          const data = blobs.get(`${String(args[0])}:${Number(args[1])}`);
          return (data ? { data } : null) as T | null;
        }
        return null;
      },
      async all<T>() {
        if (s.startsWith("SELECT * FROM pan_files WHERE visibility = 'public'")) {
          const list = Array.from(files.values())
            .filter((f) => f.visibility === "public")
            .sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        if (s.startsWith("SELECT * FROM pan_files ORDER BY")) {
          const list = Array.from(files.values()).sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        return { results: [] as T[], success: true, meta: {} };
      },
      async run() {
        if (s.startsWith("INSERT OR REPLACE INTO pan_meta")) {
          meta.set(String(args[0]), String(args[1]));
        } else if (s.startsWith("INSERT OR IGNORE INTO pan_folders")) {
          const vis = String(args[0]);
          const path = String(args[1]);
          const key = `${vis}:${path}`;
          if (!folders.has(key)) {
            folders.set(key, { visibility: vis, path, created_at: Number(args[2]) });
          }
        } else if (s.startsWith("INSERT OR IGNORE INTO pan_files")) {
          const id = String(args[0]);
          if (!files.has(id)) {
            files.set(id, {
              id,
              name: String(args[1]),
              size: Number(args[2]),
              mime_type: String(args[3]),
              category: String(args[4]),
              visibility: String(args[5]),
              storage_tier: String(args[6]),
              folder_path: "",
              asset_url: String(args[7]),
              asset_id: null,
              chunks_json: "[]",
              note: String(args[8]),
              downloads: 0,
              created_at: Number(args[9]),
              updated_at: Number(args[10]),
            });
          }
        } else if (s.startsWith("INSERT INTO pan_files")) {
          const id = String(args[0]);
          const isCfD1 = s.includes("'cf_d1'");
          const isLink = s.includes("'external_link'");
          if (isCfD1) {
            files.set(id, {
              id,
              name: String(args[1]),
              size: Number(args[2]),
              mime_type: String(args[3]),
              category: String(args[4]),
              visibility: String(args[5]),
              storage_tier: "cf_d1",
              folder_path: String(args[6]),
              asset_url: "",
              asset_id: null,
              chunks_json: "[]",
              note: String(args[7]),
              downloads: 0,
              created_at: Number(args[8]),
              updated_at: Number(args[9]),
            });
          } else if (isLink) {
            files.set(id, {
              id,
              name: String(args[1]),
              size: Number(args[2]),
              mime_type: String(args[3]),
              category: String(args[4]),
              visibility: String(args[5]),
              storage_tier: "external_link",
              folder_path: String(args[6]),
              asset_url: String(args[7]),
              asset_id: null,
              chunks_json: "[]",
              note: String(args[8]),
              downloads: 0,
              created_at: Number(args[9]),
              updated_at: Number(args[10]),
            });
          }
        } else if (s.startsWith("INSERT INTO pan_blobs")) {
          blobs.set(`${String(args[0])}:${Number(args[1])}`, args[2] as Uint8Array);
        } else if (s.startsWith("UPDATE pan_files SET downloads = downloads + 1")) {
          const row = files.get(String(args[0]));
          if (row) row.downloads += 1;
        } else if (s.startsWith("UPDATE pan_files SET name = ?")) {
          const row = files.get(String(args[6]));
          if (row) {
            row.name = String(args[0]);
            row.category = String(args[1]);
            row.visibility = String(args[2]);
            row.folder_path = String(args[3]);
            row.note = String(args[4]);
            row.updated_at = Number(args[5]);
          }
        } else if (s.startsWith("DELETE FROM pan_blobs")) {
          const prefix = `${String(args[0])}:`;
          for (const key of Array.from(blobs.keys())) {
            if (key.startsWith(prefix)) blobs.delete(key);
          }
        } else if (s.startsWith("DELETE FROM pan_files")) {
          files.delete(String(args[0]));
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
      const results = [];
      for (const st of stmts) {
        results.push(await st.run());
      }
      return results;
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
      functionPath: "/api/pan",
    } as unknown as EventContext<Env, string, Record<string, unknown>>,
    flush: () => Promise.all(pending),
  };
}

describe("functions /api/pan and /api/pan-file", () => {
  it("seeds 3 presets once, supports public cf_d1 upload/range download, isolates private files, and enforces password on delete", async () => {
    const db = createMockPanDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "secret-admin-pass" };

    // 1. Unauthenticated GET returns 3 seeded public presets
    const list1 = await getPanList(makeCtx(new Request("https://example.com/api/pan"), env).ctx);
    const list1Data = (await list1.json()) as PanListResponse;
    expect(list1.status).toBe(200);
    expect(list1Data.isAdmin).toBe(false);
    expect(list1Data.files.length).toBe(3);

    // 2. Anyone can upload a public file <= 20MB (stored in cf_d1)
    const payload = new TextEncoder().encode("Hello Cloudflare D1 Pan!");
    const uploadResp = await postPan(
      makeCtx(
        new Request("https://example.com/api/pan?action=upload", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "X-File-Name": encodeURIComponent("hello.txt"),
            "X-Pan-Visibility": "public",
            "X-Pan-Size": String(payload.byteLength),
          },
          body: payload,
        }),
        env,
      ).ctx,
    );
    const uploadData = (await uploadResp.json()) as PanUploadResponse;
    expect(uploadResp.status).toBe(201);
    expect(uploadData.file?.storage_tier).toBe("cf_d1");
    const pubId = uploadData.file?.id ?? "";

    // 3. Download with Range header works cleanly
    const dlCtx = makeCtx(
      new Request(`https://example.com/api/pan-file?id=${pubId}`, {
        headers: { Range: "bytes=0-4" },
      }),
      env,
    );
    const dlResp = await getPanFile(dlCtx.ctx);
    expect(dlResp.status).toBe(206);
    expect(await dlResp.text()).toBe("Hello");
    await dlCtx.flush();

    // 4. Private upload rejected without admin password, succeeds with password
    const privReject = await postPan(
      makeCtx(
        new Request("https://example.com/api/pan?action=upload", {
          method: "POST",
          headers: {
            "X-File-Name": "secret.txt",
            "X-Pan-Visibility": "private",
            "X-Pan-Size": "5",
          },
          body: new TextEncoder().encode("12345"),
        }),
        env,
      ).ctx,
    );
    expect(privReject.status).toBe(401);

    const privOk = await postPan(
      makeCtx(
        new Request("https://example.com/api/pan?action=upload", {
          method: "POST",
          headers: {
            "X-Admin-Password": "secret-admin-pass",
            "X-File-Name": "secret.txt",
            "X-Pan-Visibility": "private",
            "X-Pan-Size": "5",
          },
          body: new TextEncoder().encode("12345"),
        }),
        env,
      ).ctx,
    );
    const privData = (await privOk.json()) as PanUploadResponse;
    expect(privOk.status).toBe(201);
    const privId = privData.file?.id ?? "";

    // 5. Private file hidden from public list & blocked from public download
    const pubListAfter = (await (
      await getPanList(makeCtx(new Request("https://example.com/api/pan"), env).ctx)
    ).json()) as PanListResponse;
    expect(pubListAfter.files.some((f) => f.id === privId)).toBe(false);

    const privDlBlocked = await getPanFile(
      makeCtx(new Request(`https://example.com/api/pan-file?id=${privId}`), env).ctx,
    );
    expect(privDlBlocked.status).toBe(401);

    const privDlAllowed = await getPanFile(
      makeCtx(
        new Request(`https://example.com/api/pan-file?id=${privId}&pwd=secret-admin-pass`),
        env,
      ).ctx,
    );
    expect(privDlAllowed.status).toBe(200);
    expect(await privDlAllowed.text()).toBe("12345");

    // 6. Patch visibility & delete require admin password
    const delUnauth = await deletePan(
      makeCtx(new Request(`https://example.com/api/pan?id=${pubId}`, { method: "DELETE" }), env)
        .ctx,
    );
    expect(delUnauth.status).toBe(401);

    const patchResp = await patchPan(
      makeCtx(
        new Request("https://example.com/api/pan", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": "secret-admin-pass",
          },
          body: JSON.stringify({ id: pubId, name: "renamed.txt", visibility: "private" }),
        }),
        env,
      ).ctx,
    );
    const patchData = (await patchResp.json()) as PanUploadResponse;
    expect(patchResp.status).toBe(200);
    expect(patchData.file?.name).toBe("renamed.txt");
    expect(patchData.file?.visibility).toBe("private");

    const delOk = await deletePan(
      makeCtx(
        new Request(`https://example.com/api/pan?id=${pubId}`, {
          method: "DELETE",
          headers: { "X-Admin-Password": "secret-admin-pass" },
        }),
        env,
      ).ctx,
    );
    expect(delOk.status).toBe(200);
  });

  it("recovers gh_chunked stream cleanly via Range retry when upstream drops mid-chunk", async () => {
    const { vi } = await import("vitest");
    const { streamPanFileResponse } = await import("../functions/_lib/pan-storage");
    const db = createMockPanDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "secret-admin-pass" };
    const fullBytes = new TextEncoder().encode("ABCDEFGHIJKL"); // 12 bytes across 2 chunks (7 + 5)

    let firstChunkCalls = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const rangeHdr = new Headers(init?.headers).get("Range") || "";
      const m = /^bytes=(\d+)-(\d+)$/.exec(rangeHdr);
      const start = m ? Number(m[1]) : 0;
      const end = m ? Number(m[2]) : undefined;

      if (url.endsWith("part0")) {
        firstChunkCalls++;
        if (firstChunkCalls === 1) {
          // Simulate upstream dropping after 4 bytes ("ABCD") before closing prematurely
          return new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(fullBytes.slice(0, 4));
                c.close();
              },
            }),
            { status: 206 },
          );
        }
        return new Response(fullBytes.slice(start, (end ?? 6) + 1), { status: 206 });
      }
      return new Response(fullBytes.slice(7 + start, 7 + (end ?? 4) + 1), { status: 206 });
    });

    try {
      const dlCtx = makeCtx(new Request("https://example.com/api/pan-file?id=chunked_1"), env);
      const resp = await streamPanFileResponse(
        dlCtx.ctx,
        {
          id: "chunked_1",
          name: "recover.bin",
          size: 12,
          mime_type: "application/octet-stream",
          category: "other",
          visibility: "public",
          storage_tier: "gh_chunked",
          folder_path: "",
          asset_url: "",
          asset_id: null,
          chunks_json: JSON.stringify([
            { index: 0, url: "https://example.com/part0", size: 7 },
            { index: 1, url: "https://example.com/part1", size: 5 },
          ]),
          note: "",
          downloads: 0,
          created_at: 1,
          updated_at: 1,
        },
        { isHead: false, inline: false },
      );

      expect(resp.status).toBe(200);
      expect(resp.headers.get("Content-Length")).toBe("12");
      expect(await resp.text()).toBe("ABCDEFGHIJKL");
      expect(firstChunkCalls).toBe(2);
      await dlCtx.flush();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
