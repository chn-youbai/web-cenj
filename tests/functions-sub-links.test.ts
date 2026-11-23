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
  it("enforces ADMIN_PASSWORD, enforces maxUses/TTL/revoke on /api/sub?token=, and deletes cleanly", async () => {
    const db = createMockSubDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "key-admin-pass" };

    // 1. Unauthorized access blocked
    const unauth = await getSubLinks(
      makeCtx(new Request("https://example.com/api/sub-links"), env).ctx,
    );
    expect(unauth.status).toBe(401);

    // 2. Create temp link with maxUses = 1
    const createResp = await postSubLinks(
      makeCtx(
        new Request("https://example.com/api/sub-links", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": "key-admin-pass",
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
      makeCtx(
        new Request("https://example.com/api/sub-links", {
          headers: { "X-Admin-Password": "key-admin-pass" },
        }),
        env,
      ).ctx,
    );
    const listData = (await listResp.json()) as SubLinksListResponse;
    expect(listData.links[0]?.status).toBe("exhausted");

    const revokeResp = await patchSubLinks(
      makeCtx(
        new Request("https://example.com/api/sub-links", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": "key-admin-pass",
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
          headers: { "X-Admin-Password": "key-admin-pass" },
        }),
        env,
      ).ctx,
    );
    expect(delResp.status).toBe(200);
  });
});
