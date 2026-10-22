// Cloudflare Pages Function: /api/derivatives
// 提供同根词、派生词的 D1 高性能边缘查询接口

export async function onRequestGet(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const root = (url.searchParams.get("root") || "").trim();

  if (!db) {
    return new Response(JSON.stringify({
      status: "error",
      message: "D1 database (DB) not bound.",
      derivatives: []
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  if (!q && !root) {
    return new Response(JSON.stringify({
      status: "ok",
      message: "Please specify ?q=word or ?root=name",
      derivatives: []
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    let sql = "";
    let params = [];

    if (root) {
      sql = `
        SELECT DISTINCT word, pos, meaning, level, root_group
        FROM word_derivatives
        WHERE root_group = ?
        ORDER BY id ASC
      `;
      params = [root];
    } else {
      // 1. 先查找匹配该触发词的 root_group
      const findRootSql = `
        SELECT root_group FROM word_derivatives
        WHERE trigger_word = ? COLLATE NOCASE OR word = ? COLLATE NOCASE
        LIMIT 1
      `;
      const rootMatch = await db.prepare(findRootSql).bind(q, q).first();

      if (rootMatch && rootMatch.root_group) {
        // 如果找到了对应的词根族，获取整族所有真实派生词
        sql = `
          SELECT DISTINCT word, pos, meaning, level, root_group
          FROM word_derivatives
          WHERE root_group = ?
          ORDER BY id ASC
        `;
        params = [rootMatch.root_group];
      } else {
        // 直接按触发词或单词精确查找
        sql = `
          SELECT DISTINCT word, pos, meaning, level, root_group
          FROM word_derivatives
          WHERE trigger_word = ? COLLATE NOCASE OR word = ? COLLATE NOCASE
          ORDER BY id ASC
        `;
        params = [q, q];
      }
    }

    const { results } = await db.prepare(sql).bind(...params).all();
    const rows = results || [];
    const rootName = rows.length > 0 ? rows[0].root_group : "";

    return new Response(JSON.stringify({
      status: "ok",
      query: q || root,
      rootGroup: rootName,
      total: rows.length,
      derivatives: rows.map(r => ({
        word: r.word,
        pos: r.pos,
        meaning: r.meaning,
        level: r.level || "高考拓展"
      }))
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      status: "error",
      message: err.message,
      derivatives: []
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

    // 支持导入完整的词根族 { rootName, triggers: [...], members: [{ w, p, m }] }
    // 或单条记录 { trigger_word, word, pos, meaning, root_group, level }
    const statements = [];
    const insertSql = `
      INSERT INTO word_derivatives (root_group, trigger_word, word, pos, meaning, level)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    if (body.families && Array.isArray(body.families)) {
      for (const fam of body.families) {
        const rootName = fam.rootName || "";
        const triggers = fam.triggers || [];
        const members = fam.members || [];
        for (const trg of triggers) {
          const tClean = String(trg).trim().toLowerCase();
          if (!tClean) continue;
          for (const m of members) {
            statements.push(db.prepare(insertSql).bind(
              rootName,
              tClean,
              m.w || m.word || "",
              m.p || m.pos || "",
              m.m || m.meaning || "",
              m.level || "高考拓展"
            ));
          }
        }
      }
    } else if (body.entries && Array.isArray(body.entries)) {
      for (const e of body.entries) {
        statements.push(db.prepare(insertSql).bind(
          e.root_group || "",
          (e.trigger_word || "").trim().toLowerCase(),
          e.word || "",
          e.pos || "",
          e.meaning || "",
          e.level || "高考拓展"
        ));
      }
    }

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
      message: `Successfully added ${inserted} derivative records into D1`
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
