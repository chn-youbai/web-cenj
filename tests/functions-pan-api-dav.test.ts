/**
 * @vitest-environment node
 */
import type {
  PanApiKeyCreateResponse,
  PanApiKeysListResponse,
  PanListResponse,
  PanUploadResponse,
} from "@shared/types";
import { describe, expect, it } from "vitest";
import type { Env } from "../functions/_lib/env";
import {
  onRequestDelete as deletePan,
  onRequestGet as getPanList,
  onRequestPost as postPan,
} from "../functions/api/pan";
import {
  onRequestPost as createPanKey,
  onRequestDelete as deletePanKey,
  onRequestGet as listPanKeys,
  onRequestPatch as patchPanKey,
} from "../functions/api/pan-keys";
import { onRequestGet as getPanRaw } from "../functions/api/pan-raw/[[path]]";
import { onRequest as handleDav } from "../functions/dav/[[path]]";

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

interface KeyRow {
  id: string;
  label: string;
  key_prefix: string;
  key_hash: string;
  can_read: number;
  can_write: number;
  can_delete: number;
  can_private: number;
  allowed_origins: string;
  expires_at: number | null;
  revoked: number;
  use_count: number;
  last_used_at: number | null;
  created_at: number;
}

function createFullMockPanDb() {
  const files = new Map<string, FileRow>();
  const blobs = new Map<string, Uint8Array>();
  const meta = new Map<string, string>();
  const folders = new Map<string, { visibility: string; path: string; created_at: number }>();
  const keys = new Map<string, KeyRow>();

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
        if (s.startsWith("SELECT * FROM pan_api_keys WHERE key_hash = ?")) {
          for (const k of keys.values()) {
            if (k.key_hash === String(args[0])) return k as T;
          }
          return null;
        }
        if (s.startsWith("SELECT * FROM pan_api_keys WHERE id = ?")) {
          return (keys.get(String(args[0])) ?? null) as T | null;
        }
        if (s.startsWith("SELECT path FROM pan_folders WHERE visibility = ? AND path = ?")) {
          const f = folders.get(`${String(args[0])}:${String(args[1])}`);
          return (f ? { path: f.path } : null) as T | null;
        }
        if (
          s.startsWith("SELECT id FROM pan_files WHERE visibility = ? AND folder_path = ? LIMIT 1")
        ) {
          for (const f of files.values()) {
            if (f.visibility === String(args[0]) && f.folder_path === String(args[1])) {
              return { id: f.id } as T;
            }
          }
          return null;
        }
        if (
          s.startsWith(
            "SELECT id FROM pan_files WHERE visibility = ? AND folder_path LIKE ? LIMIT 1",
          )
        ) {
          const prefix = String(args[1]).slice(0, -1);
          for (const f of files.values()) {
            if (f.visibility === String(args[0]) && f.folder_path.startsWith(prefix)) {
              return { id: f.id } as T;
            }
          }
          return null;
        }
        if (
          s.startsWith(
            "SELECT id FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?",
          )
        ) {
          for (const f of files.values()) {
            if (
              f.visibility === String(args[0]) &&
              f.folder_path === String(args[1]) &&
              f.name === String(args[2])
            ) {
              return { id: f.id } as T;
            }
          }
          return null;
        }
        if (
          s.startsWith(
            "SELECT * FROM pan_files WHERE visibility = ? AND folder_path = ? AND name = ?",
          )
        ) {
          for (const f of files.values()) {
            if (
              f.visibility === String(args[0]) &&
              f.folder_path === String(args[1]) &&
              f.name === String(args[2])
            ) {
              return f as T;
            }
          }
          return null;
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
        if (s.startsWith("SELECT * FROM pan_api_keys ORDER BY")) {
          const list = Array.from(keys.values()).sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        if (s.startsWith("SELECT path, created_at FROM pan_folders WHERE visibility = ?")) {
          const list = Array.from(folders.values()).filter((f) => f.visibility === String(args[0]));
          return { results: list as T[], success: true, meta: {} };
        }
        if (
          s.startsWith(
            "SELECT path FROM pan_folders WHERE visibility = ? AND (path = ? OR path LIKE ?)",
          )
        ) {
          const vis = String(args[0]);
          const exact = String(args[1]);
          const prefix = String(args[2]).slice(0, -1);
          const list = Array.from(folders.values())
            .filter((f) => f.visibility === vis && (f.path === exact || f.path.startsWith(prefix)))
            .map((f) => ({ path: f.path }));
          return { results: list as T[], success: true, meta: {} };
        }
        if (
          s.startsWith(
            "SELECT * FROM pan_files WHERE visibility = ? AND (folder_path = ? OR folder_path LIKE ?)",
          )
        ) {
          const vis = String(args[0]);
          const exact = String(args[1]);
          const prefix = String(args[2]).slice(0, -1);
          const list = Array.from(files.values()).filter(
            (f) =>
              f.visibility === vis && (f.folder_path === exact || f.folder_path.startsWith(prefix)),
          );
          return { results: list as T[], success: true, meta: {} };
        }
        if (s.startsWith("SELECT * FROM pan_files WHERE visibility = ?")) {
          const list = Array.from(files.values())
            .filter((f) => f.visibility === String(args[0]))
            .sort((a, b) => a.name.localeCompare(b.name));
          return { results: list as T[], success: true, meta: {} };
        }
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
        if (s.startsWith("SELECT chunk_index, data FROM pan_blobs WHERE file_id = ?")) {
          const fid = String(args[0]);
          const list = Array.from(blobs.entries())
            .filter(([k]) => k.startsWith(`${fid}:`))
            .map(([k, data]) => ({ chunk_index: Number(k.split(":")[1]), data }))
            .sort((a, b) => a.chunk_index - b.chunk_index);
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
        } else if (s.startsWith("INSERT INTO pan_api_keys")) {
          const id = String(args[0]);
          keys.set(id, {
            id,
            label: String(args[1]),
            key_prefix: String(args[2]),
            key_hash: String(args[3]),
            can_read: Number(args[4]),
            can_write: Number(args[5]),
            can_delete: Number(args[6]),
            can_private: Number(args[7]),
            allowed_origins: String(args[8]),
            expires_at: args[9] !== null ? Number(args[9]) : null,
            revoked: 0,
            use_count: 0,
            last_used_at: null,
            created_at: Number(args[10]),
          });
        } else if (s.startsWith("UPDATE pan_api_keys SET use_count")) {
          const row = keys.get(String(args[1]));
          if (row) {
            row.use_count += 1;
            row.last_used_at = Number(args[0]);
          }
        } else if (s.startsWith("UPDATE pan_api_keys SET label = ?")) {
          const row = keys.get(String(args[7]));
          if (row) {
            row.label = String(args[0]);
            row.can_read = Number(args[1]);
            row.can_write = Number(args[2]);
            row.can_delete = Number(args[3]);
            row.can_private = Number(args[4]);
            row.allowed_origins = String(args[5]);
            row.revoked = Number(args[6]);
          }
        } else if (s.startsWith("DELETE FROM pan_api_keys WHERE id = ?")) {
          keys.delete(String(args[0]));
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
          if (s.includes("'cf_d1'")) {
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
          } else {
            // copy INSERT INTO pan_files
            files.set(id, {
              id,
              name: String(args[1]),
              size: Number(args[2]),
              mime_type: String(args[3]),
              category: String(args[4]),
              visibility: String(args[5]),
              storage_tier: String(args[6]),
              folder_path: String(args[7]),
              asset_url: String(args[8]),
              asset_id: null,
              chunks_json: String(args[9]),
              note: String(args[10]),
              downloads: 0,
              created_at: Number(args[11]),
              updated_at: Number(args[12]),
            });
          }
        } else if (s.startsWith("INSERT INTO pan_blobs")) {
          blobs.set(`${String(args[0])}:${Number(args[1])}`, args[2] as Uint8Array);
        } else if (s.startsWith("UPDATE pan_files SET downloads = downloads + 1")) {
          const row = files.get(String(args[0]));
          if (row) row.downloads += 1;
        } else if (s.startsWith("UPDATE pan_files SET visibility = ?, folder_path = ?, name = ?")) {
          const row = files.get(String(args[4]));
          if (row) {
            row.visibility = String(args[0]);
            row.folder_path = String(args[1]);
            row.name = String(args[2]);
            row.updated_at = Number(args[3]);
          }
        } else if (
          s.startsWith("UPDATE pan_files SET visibility = ?, folder_path = ?, updated_at = ?")
        ) {
          const row = files.get(String(args[3]));
          if (row) {
            row.visibility = String(args[0]);
            row.folder_path = String(args[1]);
            row.updated_at = Number(args[2]);
          }
        } else if (s.startsWith("DELETE FROM pan_blobs")) {
          const prefix = `${String(args[0])}:`;
          for (const key of Array.from(blobs.keys())) {
            if (key.startsWith(prefix)) blobs.delete(key);
          }
        } else if (s.startsWith("DELETE FROM pan_files")) {
          files.delete(String(args[0]));
        } else if (s.startsWith("DELETE FROM pan_folders")) {
          const vis = String(args[0]);
          const exact = String(args[1]);
          const prefix = String(args[2]).slice(0, -1);
          for (const [k, v] of Array.from(folders.entries())) {
            if (v.visibility === vis && (v.path === exact || v.path.startsWith(prefix))) {
              folders.delete(k);
            }
          }
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

describe("Pan API Keys, Cross-Origin Hosting & WebDAV", () => {
  it("manages API keys with ADMIN_PASSWORD and enforces origin whitelist + permissions", async () => {
    const db = createFullMockPanDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "admin-secret" };

    // Unauthenticated key listing fails
    const unauthList = await listPanKeys(
      makeCtx(new Request("https://example.com/api/pan-keys"), env).ctx,
    );
    expect(unauthList.status).toBe(401);

    // Create a key restricted to https://blog.example.com with read+write+private (no delete)
    const createCtx = makeCtx(
      new Request("https://example.com/api/pan-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": "admin-secret",
        },
        body: JSON.stringify({
          label: "Blog Hosting",
          can_read: true,
          can_write: true,
          can_delete: false,
          can_private: true,
          allowed_origins: ["https://blog.example.com"],
          ttlDays: 30,
        }),
      }),
      env,
    );
    const createResp = await createPanKey(createCtx.ctx);
    const createData = (await createResp.json()) as PanApiKeyCreateResponse;
    expect(createResp.status).toBe(201);
    expect(createData.secret?.startsWith("cjp_")).toBe(true);
    const secret = createData.secret ?? "";
    const keyId = createData.key?.id ?? "";

    // Disallowed origin gets 403
    const badOriginResp = await getPanList(
      makeCtx(
        new Request("https://example.com/api/pan", {
          headers: {
            Authorization: `Bearer ${secret}`,
            Origin: "https://evil.example.net",
          },
        }),
        env,
      ).ctx,
    );
    expect(badOriginResp.status).toBe(403);

    // Allowed origin succeeds with multipart upload into folder_path and private visibility
    const form = new FormData();
    form.append("file", new File(["hello-cors-image"], "avatar.txt", { type: "text/plain" }));
    form.append("folder_path", "blog/2026");
    form.append("visibility", "private");

    const uploadCtx = makeCtx(
      new Request("https://example.com/api/pan?action=upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          Origin: "https://blog.example.com",
        },
        body: form,
      }),
      env,
    );
    const uploadResp = await postPan(uploadCtx.ctx);
    const uploadData = (await uploadResp.json()) as PanUploadResponse;
    expect(uploadResp.status).toBe(201);
    expect(uploadResp.headers.get("Access-Control-Allow-Origin")).toBe("https://blog.example.com");
    expect(uploadData.file?.folder_path).toBe("blog/2026");
    expect(uploadData.file?.direct_url).toContain(`/api/pan-raw/${uploadData.file?.id}/avatar.txt`);
    await uploadCtx.flush();

    const fileId = uploadData.file?.id ?? "";

    // Friendly direct link blocks anonymous access for private file, allows with Bearer key
    const rawAnon = await getPanRaw(
      makeCtx(new Request(`https://example.com/api/pan-raw/${fileId}/avatar.txt`), env).ctx,
    );
    expect(rawAnon.status).toBe(401);

    const rawAuthCtx = makeCtx(
      new Request(`https://example.com/api/pan-raw/${fileId}/avatar.txt`, {
        headers: {
          Authorization: `Bearer ${secret}`,
          Origin: "https://blog.example.com",
        },
      }),
      env,
    );
    const rawAuth = await getPanRaw(rawAuthCtx.ctx);
    expect(rawAuth.status).toBe(200);
    expect(rawAuth.headers.get("Content-Disposition")).toContain("inline");
    expect(await rawAuth.text()).toBe("hello-cors-image");
    await rawAuthCtx.flush();

    // Key without delete permission cannot DELETE
    const delForbidden = await deletePan(
      makeCtx(
        new Request(`https://example.com/api/pan?id=${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${secret}` },
        }),
        env,
      ).ctx,
    );
    expect(delForbidden.status).toBe(403);

    // Revoking key immediately blocks further usage
    const revokeResp = await patchPanKey(
      makeCtx(
        new Request("https://example.com/api/pan-keys", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": "admin-secret",
          },
          body: JSON.stringify({ id: keyId, revoked: true }),
        }),
        env,
      ).ctx,
    );
    expect(revokeResp.status).toBe(200);

    const afterRevoke = await getPanList(
      makeCtx(
        new Request("https://example.com/api/pan", {
          headers: { Authorization: `Bearer ${secret}` },
        }),
        env,
      ).ctx,
    );
    expect(afterRevoke.status).toBe(401);

    const listResp = await listPanKeys(
      makeCtx(
        new Request("https://example.com/api/pan-keys", {
          headers: { "X-Admin-Password": "admin-secret" },
        }),
        env,
      ).ctx,
    );
    const listData = (await listResp.json()) as PanApiKeysListResponse;
    expect(listData.keys[0]?.status).toBe("revoked");

    const delKeyResp = await deletePanKey(
      makeCtx(
        new Request(`https://example.com/api/pan-keys?id=${keyId}`, {
          method: "DELETE",
          headers: { "X-Admin-Password": "admin-secret" },
        }),
        env,
      ).ctx,
    );
    expect(delKeyResp.status).toBe(200);
  });

  it("supports public passwordless multipart upload and /api/pan-raw direct links", async () => {
    const db = createFullMockPanDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "admin-secret" };

    const form = new FormData();
    form.append("file", new File(["public-content"], "readme.md", { type: "text/markdown" }));
    const upResp = await postPan(
      makeCtx(
        new Request("https://example.com/api/pan?action=upload", {
          method: "POST",
          body: form,
        }),
        env,
      ).ctx,
    );
    const upData = (await upResp.json()) as PanUploadResponse;
    expect(upResp.status).toBe(201);
    const directUrl = upData.file?.direct_url ?? "";

    const rawResp = await getPanRaw(
      makeCtx(new Request(`https://example.com${directUrl}`), env).ctx,
    );
    expect(rawResp.status).toBe(200);
    expect(rawResp.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await rawResp.text()).toBe("public-content");

    const dlResp = await getPanRaw(
      makeCtx(new Request(`https://example.com${directUrl}?download=1`), env).ctx,
    );
    expect(dlResp.status).toBe(200);
    expect(dlResp.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("implements WebDAV PROPFIND, MKCOL, PUT, GET, COPY, MOVE, DELETE with Basic Auth", async () => {
    const db = createFullMockPanDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "admin-secret" };

    // Create full-access public+private API key
    const keyResp = await createPanKey(
      makeCtx(
        new Request("https://example.com/api/pan-keys", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": "admin-secret",
          },
          body: JSON.stringify({
            label: "Mac Finder",
            can_read: true,
            can_write: true,
            can_delete: true,
            can_private: false,
          }),
        }),
        env,
      ).ctx,
    );
    const keySecret = ((await keyResp.json()) as PanApiKeyCreateResponse).secret ?? "";
    const basicAuth = `Basic ${btoa(`cenj:${keySecret}`)}`;

    // 1. Unauthenticated PROPFIND returns 401 + WWW-Authenticate
    const unauthDav = await handleDav(
      makeCtx(new Request("https://example.com/dav/", { method: "PROPFIND" }), env).ctx,
    );
    expect(unauthDav.status).toBe(401);
    expect(unauthDav.headers.get("WWW-Authenticate")).toContain("Basic");

    // 2. OPTIONS returns DAV capabilities
    const optDav = await handleDav(
      makeCtx(new Request("https://example.com/dav/", { method: "OPTIONS" }), env).ctx,
    );
    expect(optDav.status).toBe(204);
    expect(optDav.headers.get("DAV")).toContain("1");

    // 3. PROPFIND /dav/ shows public/ but hides private/ for non-private key
    const rootProp = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/", {
          method: "PROPFIND",
          headers: { Authorization: basicAuth, Depth: "1" },
        }),
        env,
      ).ctx,
    );
    expect(rootProp.status).toBe(207);
    const rootXml = await rootProp.text();
    expect(rootXml).toContain("/dav/public/");
    expect(rootXml).not.toContain("/dav/private/");

    // Private access rejected with 403
    const privProp = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/private/", {
          method: "PROPFIND",
          headers: { Authorization: basicAuth },
        }),
        env,
      ).ctx,
    );
    expect(privProp.status).toBe(403);

    // 4. MKCOL creates nested folder
    const mkcolResp = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/2026", {
          method: "MKCOL",
          headers: { Authorization: basicAuth },
        }),
        env,
      ).ctx,
    );
    expect(mkcolResp.status).toBe(201);

    // 5. PUT creates and overwrites file
    const put1 = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/2026/hello.md", {
          method: "PUT",
          headers: {
            Authorization: basicAuth,
            "Content-Type": "text/markdown",
            "Content-Length": "7",
          },
          body: "version",
        }),
        env,
      ).ctx,
    );
    expect(put1.status).toBe(201);

    const put2 = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/2026/hello.md", {
          method: "PUT",
          headers: {
            Authorization: basicAuth,
            "Content-Type": "text/markdown",
            "Content-Length": "9",
          },
          body: "version-2",
        }),
        env,
      ).ctx,
    );
    expect(put2.status).toBe(204);

    // 6. PROPFIND folder lists hello.md
    const folderProp = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/2026/", {
          method: "PROPFIND",
          headers: { Authorization: basicAuth, Depth: "1" },
        }),
        env,
      ).ctx,
    );
    expect(folderProp.status).toBe(207);
    const folderXml = await folderProp.text();
    expect(folderXml).toContain("/dav/public/notes/2026/hello.md");

    // 7. GET & MOVE & COPY & DELETE
    const getResp = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/2026/hello.md", {
          method: "GET",
          headers: { Authorization: basicAuth },
        }),
        env,
      ).ctx,
    );
    expect(getResp.status).toBe(200);
    expect(await getResp.text()).toBe("version-2");

    const copyResp = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/2026/hello.md", {
          method: "COPY",
          headers: {
            Authorization: basicAuth,
            Destination: "https://example.com/dav/public/notes/2026/copy.md",
          },
        }),
        env,
      ).ctx,
    );
    expect(copyResp.status).toBe(201);

    const moveResp = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/2026/copy.md", {
          method: "MOVE",
          headers: {
            Authorization: basicAuth,
            Destination: "/dav/public/notes/moved.md",
          },
        }),
        env,
      ).ctx,
    );
    expect(moveResp.status).toBe(201);

    const getMoved = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes/moved.md", {
          method: "GET",
          headers: { Authorization: basicAuth },
        }),
        env,
      ).ctx,
    );
    expect(getMoved.status).toBe(200);
    expect(await getMoved.text()).toBe("version-2");

    const delFolder = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/notes", {
          method: "DELETE",
          headers: { Authorization: basicAuth },
        }),
        env,
      ).ctx,
    );
    expect(delFolder.status).toBe(204);

    // Path traversal is blocked (URL-normalized -> 404, double-encoded -> 400)
    const badPathNormalized = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/%2e%2e/secret", {
          method: "PROPFIND",
          headers: { Authorization: basicAuth },
        }),
        env,
      ).ctx,
    );
    expect(badPathNormalized.status).toBe(404);

    const badPathEncoded = await handleDav(
      makeCtx(
        new Request("https://example.com/dav/public/%2e%2e%2fsecret", {
          method: "PROPFIND",
          headers: { Authorization: basicAuth },
        }),
        env,
      ).ctx,
    );
    expect(badPathEncoded.status).toBe(400);

    // Verify REST list reflects clean state
    const finalList = (await (
      await getPanList(makeCtx(new Request("https://example.com/api/pan"), env).ctx)
    ).json()) as PanListResponse;
    expect(finalList.files.some((f) => f.name === "hello.md" || f.name === "moved.md")).toBe(false);
  });
});
