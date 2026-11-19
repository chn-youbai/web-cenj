import type { VocabCompactWord } from "../../shared/types";
import { verifyAdminPassword } from "../_lib/auth";
import type { Env } from "../_lib/env";
import { getErrorMessage, jsonResponse, noContentOptions, readJsonBody } from "../_lib/http";

interface TextbookWordRow {
  book: string;
  unit: string;
  word: string;
  pos: string;
  meaning: string;
  font: string;
  note: string;
}

function mapRows(rows: TextbookWordRow[]): VocabCompactWord[] {
  return rows.map((r) => ({
    b: r.book,
    u: r.unit,
    w: r.word,
    p: r.pos,
    m: r.meaning,
    f: r.font,
    n: r.note,
  }));
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const book = (url.searchParams.get("book") || "").trim();

  if (!db) {
    return jsonResponse({
      status: "error",
      message: "D1 database (DB) not bound. Running in fallback mode.",
      words: [],
    });
  }

  try {
    if (q) {
      const sql = `
        SELECT book, unit, word, pos, meaning, font, note
        FROM textbook_words
        WHERE head_lower = ? OR word LIKE ? OR meaning LIKE ?
        ORDER BY id ASC
        LIMIT 100
      `;
      const { results } = await db.prepare(sql).bind(q, `%${q}%`, `%${q}%`).all<TextbookWordRow>();
      const rows = results || [];
      return jsonResponse(
        {
          status: "ok",
          total: rows.length,
          words: mapRows(rows),
        },
        200,
        { "Cache-Control": "public, max-age=3600" },
      );
    }

    if (book) {
      const sql = `
        SELECT book, unit, word, pos, meaning, font, note
        FROM textbook_words
        WHERE book = ?
        ORDER BY id ASC
      `;
      const { results } = await db.prepare(sql).bind(book).all<TextbookWordRow>();
      const rows = results || [];
      return jsonResponse(
        {
          status: "ok",
          book,
          total: rows.length,
          words: mapRows(rows),
        },
        200,
        { "Cache-Control": "public, max-age=7200" },
      );
    }

    const sql = `
      SELECT book, unit, word, pos, meaning, font, note
      FROM textbook_words
      ORDER BY id ASC
    `;
    const { results } = await db.prepare(sql).all<TextbookWordRow>();
    const words = mapRows(results || []);

    return jsonResponse(
      {
        version: "1.0.0",
        source: "cloudflare-d1",
        updatedAt: new Date().toISOString().split("T")[0],
        total: words.length,
        words,
      },
      200,
      { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    );
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

interface ImportWordInput {
  b?: string;
  book?: string;
  u?: string;
  unit?: string;
  w?: string;
  word?: string;
  p?: string;
  pos?: string;
  m?: string;
  meaning?: string;
  f?: string;
  font?: string;
  n?: string;
  note?: string;
}

interface VocabPostBody extends Record<string, unknown> {
  password?: string;
  words?: ImportWordInput[];
  clearBeforeImport?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ error: "DB not bound" }, 500);
  }

  try {
    const parsed = await readJsonBody<VocabPostBody>(context.request);
    const body: VocabPostBody = parsed.ok ? parsed.data : {};

    const auth = verifyAdminPassword(context.env, context.request, body);
    if (!auth.configured) {
      return jsonResponse({ error: "Server ADMIN_PASSWORD is not configured." }, 503);
    }
    if (!auth.valid) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const words = Array.isArray(body.words) ? body.words : [];
    if (words.length === 0) {
      return jsonResponse({ error: "Empty words array" }, 400);
    }

    const statements: D1PreparedStatement[] = [];
    const insertSql = `
      INSERT INTO textbook_words (book, unit, word, pos, meaning, font, note, head_lower)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const w of words) {
      const book = String(w.b || w.book || "").trim();
      const unit = String(w.u || w.unit || "").trim();
      const word = String(w.w || w.word || "").trim();
      const pos = String(w.p || w.pos || "").trim();
      const meaning = String(w.m || w.meaning || "").trim();
      const font = String(w.f || w.font || "白体").trim();
      const note = String(w.n || w.note || "").trim();
      const headLower = word.toLowerCase().replace(/[^a-z-]/g, "");

      if (word) {
        statements.push(
          db.prepare(insertSql).bind(book, unit, word, pos, meaning, font, note, headLower),
        );
      }
    }

    if (body.clearBeforeImport === true) {
      await db.prepare("DELETE FROM textbook_words").run();
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
      message: `Successfully imported ${inserted} words into D1`,
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, OPTIONS");
};
