// Cloudflare Pages Function: /api/vocab
// 提供高中英语课本词汇的 D1 数据库查询与同步接口

export async function onRequestGet(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const book = (url.searchParams.get("book") || "").trim();
  const mode = url.searchParams.get("mode") || "";

  if (!db) {
    return new Response(JSON.stringify({
      status: "error",
      message: "D1 database (DB) not bound. Running in fallback mode.",
      words: []
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    // 1. 如果带有具体搜索词 q，执行前缀或模糊查询
    if (q) {
      const sql = `
        SELECT book, unit, word, pos, meaning, font, note
        FROM textbook_words
        WHERE head_lower = ? OR word LIKE ? OR meaning LIKE ?
        ORDER BY id ASC
        LIMIT 100
      `;
      const { results } = await db.prepare(sql).bind(q, `%${q}%`, `%${q}%`).all();
      return new Response(JSON.stringify({
        status: "ok",
        total: results ? results.length : 0,
        words: (results || []).map(r => ({
          b: r.book,
          u: r.unit,
          w: r.word,
          p: r.pos,
          m: r.meaning,
          f: r.font,
          n: r.note
        }))
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 2. 如果指定了某本书 book
    if (book) {
      const sql = `
        SELECT book, unit, word, pos, meaning, font, note
        FROM textbook_words
        WHERE book = ?
        ORDER BY id ASC
      `;
      const { results } = await db.prepare(sql).bind(book).all();
      return new Response(JSON.stringify({
        status: "ok",
        book: book,
        total: results ? results.length : 0,
        words: (results || []).map(r => ({
          b: r.book,
          u: r.unit,
          w: r.word,
          p: r.pos,
          m: r.meaning,
          f: r.font,
          n: r.note
        }))
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=7200",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 3. 默认模式：返回全量词库快照（供前端本地 IndexedDB / localStorage 缓存）
    const sql = `
      SELECT book, unit, word, pos, meaning, font, note
      FROM textbook_words
      ORDER BY id ASC
    `;
    const { results } = await db.prepare(sql).all();
    const words = (results || []).map(r => ({
      b: r.book,
      u: r.unit,
      w: r.word,
      p: r.pos,
      m: r.meaning,
      f: r.font,
      n: r.note
    }));

    return new Response(JSON.stringify({
      version: "1.0.0",
      source: "cloudflare-d1",
      updatedAt: new Date().toISOString().split("T")[0],
      total: words.length,
      words: words
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      status: "error",
      message: err.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "DB not bound" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const authHeader = context.request.headers.get("Authorization") || "";
    const adminKey = context.request.headers.get("x-admin-key") || "";
    let body;
    try {
      body = await context.request.json();
    } catch (e) {
      body = {};
    }

    const providedPassword = (body && body.password) || adminKey || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "");
    if (providedPassword !== "8888") {
      return new Response(JSON.stringify({ error: "Unauthorized. Password required (8888)." }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const words = Array.isArray(body.words) ? body.words : [];
    if (words.length === 0) {
      return new Response(JSON.stringify({ error: "Empty words array" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 批量导入
    const statements = [];
    const insertSql = `
      INSERT INTO textbook_words (book, unit, word, pos, meaning, font, note, head_lower)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const w of words) {
      const book = (w.b || w.book || "").trim();
      const unit = (w.u || w.unit || "").trim();
      const word = (w.w || w.word || "").trim();
      const pos = (w.p || w.pos || "").trim();
      const meaning = (w.m || w.meaning || "").trim();
      const font = (w.f || w.font || "白体").trim();
      const note = (w.n || w.note || "").trim();
      const headLower = word.toLowerCase().replace(/[^a-z\-]/g, "");

      if (word) {
        statements.push(db.prepare(insertSql).bind(book, unit, word, pos, meaning, font, note, headLower));
      }
    }

    if (body.clearBeforeImport === true) {
      await db.prepare("DELETE FROM textbook_words").run();
    }

    // 分批次执行（每批次最多 100 条）
    let inserted = 0;
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const chunk = statements.slice(i, i + batchSize);
      await db.batch(chunk);
      inserted += chunk.length;
    }

    return new Response(JSON.stringify({
      status: "ok",
      inserted: inserted,
      message: `Successfully imported ${inserted} words into D1`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      status: "error",
      message: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key"
    }
  });
}
