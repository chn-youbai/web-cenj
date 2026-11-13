// Cloudflare Pages Function: /api/board
// 秘密留言板 (Secret Guestbook) 边缘持久化接口
// 基于 Cloudflare D1 分布式数据库驱动 (支持无数据库内存降级模式)

// 内存降级缓存 (当 D1 数据库未绑定时兜底使用)
let memoryStore = [
  {
    id: 1,
    parent_id: null,
    nickname: "星际漫游者",
    avatar: "🚀",
    content: "欢迎来到秘密留言板！这是一片属于探险家的自由交流空间 ✨",
    likes: 8,
    created_at: Date.now() - 3600000 * 2,
    replies: [
      {
        id: 2,
        parent_id: 1,
        nickname: "吃瓜同学",
        avatar: "🍉",
        content: "哇！居然真的通过连续点击 5 次进来了，好神奇！",
        likes: 3,
        created_at: Date.now() - 3600000
      }
    ]
  }
];
let memoryIdCounter = 10;

async function ensureTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS guestbook_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER DEFAULT NULL,
        nickname TEXT NOT NULL,
        content TEXT NOT NULL,
        avatar TEXT DEFAULT '',
        likes INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        ip TEXT DEFAULT ''
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_guestbook_parent ON guestbook_messages(parent_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook_messages(created_at DESC)`).run();
  } catch (e) {
    // ignore if table/index exists
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function onRequestGet(context) {
  const db = context.env.DB;

  if (db) {
    try {
      await ensureTable(db);
      const rows = await db.prepare(
        "SELECT id, parent_id, nickname, content, avatar, likes, created_at FROM guestbook_messages ORDER BY created_at ASC LIMIT 500"
      ).all();

      const messages = rows.results || [];
      
      // 组织为树状楼中楼结构
      const rootMap = new Map();
      const replyList = [];

      for (const msg of messages) {
        if (!msg.parent_id) {
          rootMap.set(msg.id, {
            ...msg,
            replies: []
          });
        } else {
          replyList.push(msg);
        }
      }

      // 将子回复挂载到对应的父级留言下
      for (const reply of replyList) {
        if (rootMap.has(reply.parent_id)) {
          rootMap.get(reply.parent_id).replies.push(reply);
        } else {
          // 如果父留言不存在，作为顶层展示
          rootMap.set(reply.id, {
            ...reply,
            replies: []
          });
        }
      }

      // 转换为按发布时间倒序（最新的排在最前面）
      const threads = Array.from(rootMap.values()).reverse();

      return new Response(JSON.stringify({
        status: "ok",
        total: messages.length,
        threads
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (err) {
      console.error("D1 guestbook read error:", err);
    }
  }

  // 内存降级返回
  const total = memoryStore.reduce((acc, m) => acc + 1 + (m.replies ? m.replies.length : 0), 0);
  return new Response(JSON.stringify({
    status: "ok",
    total,
    threads: memoryStore,
    fallback: true
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ status: "error", message: "Malformed JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const db = context.env.DB;
  const action = (body.action || "").trim();

  // 1. 点赞操作
  if (action === "like") {
    const messageId = parseInt(body.message_id, 10);
    if (!messageId || messageId <= 0) {
      return new Response(JSON.stringify({ status: "error", message: "无效的留言 ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    if (db) {
      try {
        await ensureTable(db);
        await db.prepare("UPDATE guestbook_messages SET likes = likes + 1 WHERE id = ?").bind(messageId).run();
        const row = await db.prepare("SELECT likes FROM guestbook_messages WHERE id = ?").bind(messageId).first();
        return new Response(JSON.stringify({
          status: "ok",
          message_id: messageId,
          likes: row ? row.likes : 1
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) {
        console.error("Like error:", err);
      }
    }

    // 内存降级点赞
    let foundLikes = 1;
    for (const thread of memoryStore) {
      if (thread.id === messageId) {
        thread.likes = (thread.likes || 0) + 1;
        foundLikes = thread.likes;
        break;
      }
      if (thread.replies) {
        for (const rep of thread.replies) {
          if (rep.id === messageId) {
            rep.likes = (rep.likes || 0) + 1;
            foundLikes = rep.likes;
            break;
          }
        }
      }
    }
    return new Response(JSON.stringify({ status: "ok", message_id: messageId, likes: foundLikes }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // 2. 发送留言 / 回复
  const rawNickname = (body.nickname || "").trim();
  const rawContent = (body.content || "").trim();
  const parentId = body.parent_id ? parseInt(body.parent_id, 10) : null;
  const avatar = (body.avatar || "💬").trim().slice(0, 8);

  if (!rawContent || rawContent.length > 500) {
    return new Response(JSON.stringify({ status: "error", message: "留言内容需在 1 到 500 字之间" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const nickname = escapeHtml(rawNickname ? rawNickname.slice(0, 30) : "神秘探险家");
  const content = escapeHtml(rawContent);
  const createdAt = Date.now();
  const ip = context.request.headers.get("cf-connecting-ip") || "";

  if (db) {
    try {
      await ensureTable(db);
      const res = await db.prepare(
        "INSERT INTO guestbook_messages (parent_id, nickname, content, avatar, likes, created_at, ip) VALUES (?, ?, ?, ?, 0, ?, ?)"
      ).bind(parentId, nickname, content, avatar, createdAt, ip).run();

      const newId = res.meta && res.meta.last_row_id ? res.meta.last_row_id : null;

      return new Response(JSON.stringify({
        status: "ok",
        id: newId,
        parent_id: parentId,
        nickname,
        content,
        avatar,
        likes: 0,
        created_at: createdAt
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (err) {
      console.error("D1 insert message error:", err);
      return new Response(JSON.stringify({ status: "error", message: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }

  // 内存降级新增
  const newMsg = {
    id: ++memoryIdCounter,
    parent_id: parentId,
    nickname,
    content,
    avatar,
    likes: 0,
    created_at: createdAt
  };

  if (parentId) {
    const parent = memoryStore.find(m => m.id === parentId);
    if (parent) {
      if (!parent.replies) parent.replies = [];
      parent.replies.push(newMsg);
    } else {
      memoryStore.unshift({ ...newMsg, replies: [] });
    }
  } else {
    memoryStore.unshift({ ...newMsg, replies: [] });
  }

  return new Response(JSON.stringify({ status: "ok", ...newMsg }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
