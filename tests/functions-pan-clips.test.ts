/**
 * @vitest-environment node
 */
import type {
  PanClipConsumeResponse,
  PanClipCreateResponse,
  PanClipsListResponse,
} from "@shared/types";
import { describe, expect, it } from "vitest";
import type { Env } from "../functions/_lib/env";
import {
  onRequestDelete as deletePanClip,
  onRequestGet as getPanClips,
  onRequestPost as postPanClip,
} from "../functions/api/pan-clips";

interface ClipRow {
  id: string;
  kind: string;
  content: string;
  image_data: Uint8Array | null;
  image_mime: string;
  image_size: number;
  visibility: string;
  burn_after_read: number;
  expires_at: number;
  created_at: number;
}

function createMockClipsDb() {
  const clips = new Map<string, ClipRow>();

  const makeStmt = (sql: string, args: unknown[] = []): D1PreparedStatement => {
    const s = sql.trim().replace(/\s+/g, " ");
    const stmt = {
      bind(...nextArgs: unknown[]) {
        return makeStmt(sql, nextArgs);
      },
      async first<T>() {
        if (s.includes("FROM pan_clips WHERE id = ? AND expires_at > ?")) {
          const row = clips.get(String(args[0]));
          if (!row || row.expires_at <= Number(args[1])) return null as T | null;
          return row as T;
        }
        return null as T | null;
      },
      async all<T>() {
        if (s.includes("FROM pan_clips WHERE expires_at > ? AND visibility = 'public'")) {
          const now = Number(args[0]);
          const list = Array.from(clips.values())
            .filter((r) => r.expires_at > now && r.visibility === "public")
            .sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        if (s.includes("FROM pan_clips WHERE expires_at > ? ORDER BY")) {
          const now = Number(args[0]);
          const list = Array.from(clips.values())
            .filter((r) => r.expires_at > now)
            .sort((a, b) => b.created_at - a.created_at);
          return { results: list as T[], success: true, meta: {} };
        }
        return { results: [] as T[], success: true, meta: {} };
      },
      async run() {
        if (s.startsWith("DELETE FROM pan_clips WHERE expires_at <= ?")) {
          const cutoff = Number(args[0]);
          for (const [k, v] of Array.from(clips.entries())) {
            if (v.expires_at <= cutoff) clips.delete(k);
          }
        } else if (s.startsWith("DELETE FROM pan_clips WHERE id = ?")) {
          clips.delete(String(args[0]));
        } else if (s.startsWith("INSERT INTO pan_clips")) {
          const id = String(args[0]);
          const rawImg = args[3];
          clips.set(id, {
            id,
            kind: String(args[1]),
            content: String(args[2]),
            image_data: rawImg instanceof Uint8Array ? rawImg : null,
            image_mime: String(args[4]),
            image_size: Number(args[5]),
            visibility: String(args[6]),
            burn_after_read: Number(args[7]),
            expires_at: Number(args[8]),
            created_at: Number(args[9]),
          });
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
    _clips: clips,
  } as unknown as D1Database & { _clips: Map<string, ClipRow> };
}

function makeCtx(request: Request, env: Env) {
  return {
    request,
    env,
    params: {},
    waitUntil() {},
    passThroughOnException() {},
    next: async () => new Response(),
    data: {},
    functionPath: "/api/pan-clips",
  } as unknown as EventContext<Env, string, Record<string, unknown>>;
}

describe("functions /api/pan-clips temporary shared clipboard", () => {
  it("supports public text/image clips, masks & destroys burn-after-read clips, and enforces admin privacy/delete", async () => {
    const db = createMockClipsDb();
    const env: Env = { DB: db, ADMIN_PASSWORD: "secret-admin-pass" };

    // 1. Anonymous user creates a public text clip
    const createPub = await postPanClip(
      makeCtx(
        new Request("https://example.com/api/pan-clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "https://example.com/hello",
            ttlMinutes: 60,
          }),
        }),
        env,
      ),
    );
    expect(createPub.status).toBe(201);
    const pubJson = (await createPub.json()) as PanClipCreateResponse;
    expect(pubJson.clip?.kind).toBe("text");
    expect(pubJson.clip?.visibility).toBe("public");
    const pubId = pubJson.clip?.id ?? "";

    // 2. Anonymous user creates a burn-after-read image + text clip via JSON data URL
    const samplePng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const createBurn = await postPanClip(
      makeCtx(
        new Request("https://example.com/api/pan-clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "one-time secret code",
            image_data_url: samplePng,
            burn_after_read: true,
            ttlMinutes: 10,
          }),
        }),
        env,
      ),
    );
    expect(createBurn.status).toBe(201);
    const burnJson = (await createBurn.json()) as PanClipCreateResponse;
    const burnId = burnJson.clip?.id ?? "";

    // 3. Listing masks burn-after-read content and blocks passive image GET
    const listAnon = (await (
      await getPanClips(makeCtx(new Request("https://example.com/api/pan-clips"), env))
    ).json()) as PanClipsListResponse;
    expect(listAnon.clips.length).toBe(2);
    const listedBurn = listAnon.clips.find((c) => c.id === burnId);
    expect(listedBurn?.content).toBe("");
    expect(listedBurn?.image_url).toBeUndefined();

    const blockedBurnImg = await getPanClips(
      makeCtx(new Request(`https://example.com/api/pan-clips?action=image&id=${burnId}`), env),
    );
    expect(blockedBurnImg.status).toBe(403);

    // 4. Consume action reveals full text + image once and immediately deletes the row
    const consumeResp = await postPanClip(
      makeCtx(
        new Request("https://example.com/api/pan-clips?action=consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: burnId }),
        }),
        env,
      ),
    );
    expect(consumeResp.status).toBe(200);
    const consumed = (await consumeResp.json()) as PanClipConsumeResponse;
    expect(consumed.burned).toBe(true);
    expect(consumed.clip?.content).toBe("one-time secret code");
    expect(consumed.image_data_url).toContain("data:image/png;base64,");

    const consumeAgain = await postPanClip(
      makeCtx(
        new Request("https://example.com/api/pan-clips?action=consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: burnId }),
        }),
        env,
      ),
    );
    expect(consumeAgain.status).toBe(404);

    // 5. Private clip creation rejected without admin password, allowed with admin password
    const privReject = await postPanClip(
      makeCtx(
        new Request("https://example.com/api/pan-clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "secret", visibility: "private" }),
        }),
        env,
      ),
    );
    expect(privReject.status).toBe(401);

    const privOk = await postPanClip(
      makeCtx(
        new Request("https://example.com/api/pan-clips", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": "secret-admin-pass",
          },
          body: JSON.stringify({ content: "admin note", visibility: "private" }),
        }),
        env,
      ),
    );
    expect(privOk.status).toBe(201);

    // Anonymous list sees only public, admin sees both
    const pubList = (await (
      await getPanClips(makeCtx(new Request("https://example.com/api/pan-clips"), env))
    ).json()) as PanClipsListResponse;
    expect(pubList.clips.some((c) => c.visibility === "private")).toBe(false);

    const adminList = (await (
      await getPanClips(
        makeCtx(
          new Request("https://example.com/api/pan-clips", {
            headers: { "X-Admin-Password": "secret-admin-pass" },
          }),
          env,
        ),
      )
    ).json()) as PanClipsListResponse;
    expect(adminList.isAdmin).toBe(true);
    expect(adminList.clips.some((c) => c.visibility === "private")).toBe(true);

    // 6. Delete requires admin password
    const delUnauth = await deletePanClip(
      makeCtx(
        new Request(`https://example.com/api/pan-clips?id=${pubId}`, { method: "DELETE" }),
        env,
      ),
    );
    expect(delUnauth.status).toBe(401);

    const delOk = await deletePanClip(
      makeCtx(
        new Request(`https://example.com/api/pan-clips?id=${pubId}`, {
          method: "DELETE",
          headers: { "X-Admin-Password": "secret-admin-pass" },
        }),
        env,
      ),
    );
    expect(delOk.status).toBe(200);
  });
});
