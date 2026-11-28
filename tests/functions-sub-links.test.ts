import type { SubLinksListResponse, TempSubLinkItem } from "@shared/types";
import { describe, expect, it } from "vitest";
import type { Env } from "../functions/_lib/env";
import { onRequest as handleSub } from "../functions/api/sub";
import {
  onRequestDelete as deleteSubLinks,
  onRequestGet as getSubLinks,
  onRequestPatch as patchSubLinks,
  onRequestPost as postSubLinks,
} from "../functions/api/sub-links";

interface TempRow {
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

function createMockSubDb() {
  const rows = new Map<string, TempRow>();

  const makeStmt = (sql: string, args: unknown[] = []): D1PreparedStatement => {
    const s = sql.trim().replace(/\s+/g, " ");
    const stmt = {
      bind(...nextArgs: unknown[]) {
        return makeStmt(sql, nextArgs);
      },
      async first<T>() {
        if (s.includes("FROM sub_temp_links WHERE token = ?")) {
          return (rows.get(String(args[0])) ?? null) as T | null;
        }
        return null;
      },
      async all<T>() {
        if (s.startsWith("SELECT * FROM sub_temp_links ORDER BY")) {
          const list = Array.from(rows.values()).sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        return { results: [] as T[], success: true, meta: {} };
      },
      async run() {
        if (s.startsWith("INSERT INTO sub_temp_links")) {
          const token = String(args[0]);
          rows.set(token, {
            token,
            airport: String(args[1]),
            label: String(args[2]),
            expires_at: args[3] !== null ? Number(args[3]) : null,
            max_uses: args[4] !== null ? Number(args[4]) : null,
            used_count: 0,
            revoked: 0,
            created_at: Number(args[5]),
            last_used_at: null,
          });
        } else if (s.startsWith("UPDATE sub_temp_links SET used_count = used_count + 1")) {
          const row = rows.get(String(args[1]));
          if (row) {
            row.used_count += 1;
            row.last_used_at = Number(args[0]);
          }
        } else if (s.startsWith("UPDATE sub_temp_links SET revoked = ?")) {
          const row = rows.get(String(args[1]));
          if (row) row.revoked = Number(args[0]);
        } else if (s.startsWith("DELETE FROM sub_temp_links WHERE token = ?")) {
          rows.delete(String(args[0]));
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
    _rows: rows,
  } as unknown as D1Database & { _rows: Map<string, TempRow> };
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
      functionPath: "/api/sub-links",
    } as unknown as EventContext<Env, string, Record<string, unknown>>,
    flush: () => Promise.all(pending),
  };
}

describe("functions /api/sub-links and /api/sub temporary links", () => {
  it("lists/creates/revokes/deletes links and enforces maxUses/TTL/revoke on /api/sub?token=", async () => {
    const db = createMockSubDb();
    const env: Env = { DB: db };

    // 1. Direct access succeeds without password
    const initList = await getSubLinks(
      makeCtx(new Request("https://example.com/api/sub-links"), env).ctx,
    );
    expect(initList.status).toBe(200);

    // 2. Create temp link with maxUses = 1
    const createResp = await postSubLinks(
      makeCtx(
        new Request("https://example.com/api/sub-links", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            airport: "djjc",
            label: "借给张三",
            ttlMinutes: 60,
            maxUses: 1,
          }),
        }),
        env,
      ).ctx,
    );
    expect(createResp.status).toBe(201);
    const created = (await createResp.json()) as { status: string; link: TempSubLinkItem };
    const token = created.link.token;
    expect(token.startsWith("tmp_")).toBe(true);

    // 3. First fetch with valid token passes token validation (reaches DJJC upstream check -> 503 since DJJC_TOKEN unset in mock env) and increments used_count
    const subCtx1 = makeCtx(new Request(`https://example.com/api/sub?token=${token}`), env);
    const subResp1 = await handleSub(subCtx1.ctx);
    expect(subResp1.status).toBe(503);
    await subCtx1.flush();

    // 4. Second fetch exceeds maxUses = 1 -> 403
    const subResp2 = await handleSub(
      makeCtx(new Request(`https://example.com/api/sub?token=${token}`), env).ctx,
    );
    expect(subResp2.status).toBe(403);

    // 5. Unknown token -> 403
    const subUnknown = await handleSub(
      makeCtx(new Request("https://example.com/api/sub?token=tmp_nonexistent"), env).ctx,
    );
    expect(subUnknown.status).toBe(403);

    // 6. List shows exhausted status, revoke & delete work
    const listResp = await getSubLinks(
      makeCtx(new Request("https://example.com/api/sub-links"), env).ctx,
    );
    const listData = (await listResp.json()) as SubLinksListResponse;
    expect(listData.links[0]?.status).toBe("exhausted");

    const revokeResp = await patchSubLinks(
      makeCtx(
        new Request("https://example.com/api/sub-links", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token, revoked: true }),
        }),
        env,
      ).ctx,
    );
    expect(revokeResp.status).toBe(200);

    const delResp = await deleteSubLinks(
      makeCtx(
        new Request(`https://example.com/api/sub-links?token=${token}`, {
          method: "DELETE",
        }),
        env,
      ).ctx,
    );
    expect(delResp.status).toBe(200);
  });

  it("forwards v2rayN User-Agent and format=v2ray without forcing Clash YAML", async () => {
    const { vi } = await import("vitest");
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async first<T>() {
            if (sql.includes("FROM clash_control")) {
              return {
                payload: JSON.stringify({ subscribe_url: "https://upstream.example.com/sub" }),
                updated_at: "2026-11-28T00:00:00Z",
              } as T;
            }
            return null;
          },
        };
      },
    } as unknown as D1Database;
    const env: Env = { DB: db };

    const seenUAs: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const ua = new Headers(init?.headers).get("User-Agent") || "";
      seenUAs.push(ua);
      if (ua.includes("v2rayN")) {
        return new Response("dm1lc3M6Ly9ub2RlMQ==", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return new Response("proxies: []", {
        status: 200,
        headers: { "Content-Type": "text/yaml; charset=utf-8" },
      });
    });

    try {
      const v2Resp = await handleSub(
        makeCtx(
          new Request("https://example.com/api/sub?type=vpn07", {
            headers: { "User-Agent": "v2rayN/7.25.6" },
          }),
          env,
        ).ctx,
      );
      expect(v2Resp.status).toBe(200);
      expect(v2Resp.headers.get("Content-Type")).toContain("text/plain");
      expect(await v2Resp.text()).toBe("dm1lc3M6Ly9ub2RlMQ==");

      const formatResp = await handleSub(
        makeCtx(
          new Request("https://example.com/api/sub?type=vpn07&format=v2ray", {
            headers: { "User-Agent": "Mozilla/5.0" },
          }),
          env,
        ).ctx,
      );
      expect(formatResp.status).toBe(200);
      expect(await formatResp.text()).toBe("dm1lc3M6Ly9ub2RlMQ==");

      const clashResp = await handleSub(
        makeCtx(new Request("https://example.com/api/sub?type=vpn07"), env).ctx,
      );
      expect(clashResp.status).toBe(200);
      expect(clashResp.headers.get("Content-Type")).toContain("text/yaml");
      expect(await clashResp.text()).toBe("proxies: []");

      expect(seenUAs).toEqual(["v2rayN/7.25.6", "v2rayN/7.25.6", "ClashMetaForAndroid/v2.11.36"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
