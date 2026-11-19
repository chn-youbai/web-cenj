import type { DerivativesApiResponse } from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import type { Env } from "../_lib/env";
import { getErrorMessage, jsonResponse, noContentOptions, readJsonBody } from "../_lib/http";

interface DerivativeRow {
  word: string;
  pos: string;
  meaning: string;
  level: string;
  root_group: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const root = (url.searchParams.get("root") || "").trim();

  if (!db) {
    return jsonResponse({
      status: "error",
      message: "D1 database (DB) not bound.",
      derivatives: [],
    });
  }

  if (!q && !root) {
    return jsonResponse({
      status: "ok",
      message: "Please specify ?q=word or ?root=name",
      derivatives: [],
    });
  }

  try {
    let sql = "";
    let params: string[] = [];

    if (root) {
      sql = `
        SELECT DISTINCT word, pos, meaning, level, root_group
        FROM word_derivatives
        WHERE root_group = ?
        ORDER BY id ASC
      `;
      params = [root];
    } else {
      const findRootSql = `
        SELECT root_group FROM word_derivatives
        WHERE trigger_word = ? COLLATE NOCASE OR word = ? COLLATE NOCASE
        LIMIT 1
      `;
      const rootMatch = await db.prepare(findRootSql).bind(q, q).first<{ root_group?: string }>();

      if (rootMatch?.root_group) {
        sql = `
          SELECT DISTINCT word, pos, meaning, level, root_group
          FROM word_derivatives
          WHERE root_group = ?
          ORDER BY id ASC
        `;
        params = [rootMatch.root_group];
      } else {
        sql = `
          SELECT DISTINCT word, pos, meaning, level, root_group
          FROM word_derivatives
          WHERE trigger_word = ? COLLATE NOCASE OR word = ? COLLATE NOCASE
          ORDER BY id ASC
        `;
        params = [q, q];
      }
    }

    const { results } = await db
      .prepare(sql)
      .bind(...params)
      .all<DerivativeRow>();
    const rows = results || [];
    const rootName = rows[0]?.root_group || "";

    const resp: DerivativesApiResponse = {
      status: "ok",
      query: q || root,
      rootGroup: rootName,
      total: rows.length,
      derivatives: rows.map((r) => ({
        word: r.word,
        pos: r.pos,
        meaning: r.meaning,
        level: r.level || "高考拓展",
      })),
    };

    return jsonResponse(resp, 200, {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    });
  } catch (err) {
    return jsonResponse(
      {
        status: "error",
        message: getErrorMessage(err),
        derivatives: [],
      },
      500,
    );
  }
};

interface FamilyMemberInput {
  w?: string;
  word?: string;
  p?: string;
  pos?: string;
  m?: string;
  meaning?: string;
  level?: string;
}

interface FamilyInput {
  rootName?: string;
  triggers?: string[];
  members?: FamilyMemberInput[];
}

interface DerivativeEntryInput {
  root_group?: string;
  trigger_word?: string;
  word?: string;
  pos?: string;
  meaning?: string;
  level?: string;
}

interface DerivativesPostBody extends Record<string, unknown> {
  password?: string;
  families?: FamilyInput[];
  entries?: DerivativeEntryInput[];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ error: "DB not bound" }, 500);
  }

  try {
    const parsed = await readJsonBody<DerivativesPostBody>(context.request);
    const body: DerivativesPostBody = parsed.ok ? parsed.data : {};

    const auth = verifyAdminPassword(context.env, context.request, body);
    if (!auth.configured) {
      return jsonResponse({ error: "Server ADMIN_PASSWORD is not configured." }, 503);
    }
    if (!auth.valid) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const statements: D1PreparedStatement[] = [];
    const insertSql = `
      INSERT INTO word_derivatives (root_group, trigger_word, word, pos, meaning, level)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    if (Array.isArray(body.families)) {
      for (const fam of body.families) {
        const rootName = fam.rootName || "";
        const triggers = fam.triggers || [];
        const members = fam.members || [];
        for (const trg of triggers) {
          const tClean = String(trg).trim().toLowerCase();
          if (!tClean) continue;
          for (const m of members) {
            statements.push(
              db
                .prepare(insertSql)
                .bind(
                  rootName,
                  tClean,
                  m.w || m.word || "",
                  m.p || m.pos || "",
                  m.m || m.meaning || "",
                  m.level || "高考拓展",
                ),
            );
          }
        }
      }
    } else if (Array.isArray(body.entries)) {
      for (const e of body.entries) {
        statements.push(
          db
            .prepare(insertSql)
            .bind(
              e.root_group || "",
              (e.trigger_word || "").trim().toLowerCase(),
              e.word || "",
              e.pos || "",
              e.meaning || "",
              e.level || "高考拓展",
            ),
        );
      }
    }

    let inserted = 0;
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const chunk = statements.slice(i, i + batchSize);
      await db.batch(chunk);
      inserted += chunk.length;
    }

    return jsonResponse({
      status: "ok",
      inserted,
      message: `Successfully added ${inserted} derivative records into D1`,
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, OPTIONS");
};
