import type {
  BoardListResponse,
  BoardPostResponse,
  GuestbookReply,
  GuestbookThread,
} from "../../shared/types";
import { ensureGuestbookTable } from "../_lib/db";
import type { Env } from "../_lib/env";
import {
  escapeHtml,
  getErrorMessage,
  jsonResponse,
  noContentOptions,
  noStoreJsonResponse,
  readJsonBody,
} from "../_lib/http";

const memoryStore: GuestbookThread[] = [
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
        created_at: Date.now() - 3600000,
      },
    ],
  },
];
let memoryIdCounter = 10;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  if (db) {
    try {
      await ensureGuestbookTable(db);
      const rows = await db
        .prepare(
          "SELECT id, parent_id, nickname, content, avatar, likes, created_at FROM guestbook_messages ORDER BY created_at ASC LIMIT 500",
        )
        .all<GuestbookReply>();

      const messages = rows.results || [];
      const rootMap = new Map<number, GuestbookThread>();
      const replyList: GuestbookReply[] = [];

      for (const msg of messages) {
        if (!msg.parent_id) {
          rootMap.set(msg.id, { ...msg, replies: [] });
        } else {
          replyList.push(msg);
        }
      }

      for (const reply of replyList) {
        const parentThread = reply.parent_id ? rootMap.get(reply.parent_id) : undefined;
        if (parentThread) {
          parentThread.replies.push(reply);
        } else {
          rootMap.set(reply.id, { ...reply, replies: [] });
        }
      }

      const threads = Array.from(rootMap.values()).reverse();
      const resp: BoardListResponse = {
        status: "ok",
        total: messages.length,
        threads,
      };
      return noStoreJsonResponse(resp);
    } catch (err) {
      console.error("D1 guestbook read error:", err);
    }
  }

  const total = memoryStore.reduce((acc, m) => acc + 1 + (m.replies?.length ?? 0), 0);
  const resp: BoardListResponse = {
    status: "ok",
    total,
    threads: memoryStore,
    fallback: true,
  };
  return noStoreJsonResponse(resp);
};

interface BoardPostBody extends Record<string, unknown> {
  action?: string;
  message_id?: number | string;
  nickname?: string;
  content?: string;
  parent_id?: number | string | null;
  avatar?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await readJsonBody<BoardPostBody>(context.request);
  if (!parsed.ok) {
    return jsonResponse({ status: "error", message: "Malformed JSON" }, 400);
  }

  const body = parsed.data;
  const db = context.env.DB;
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "like") {
    const messageId = Number.parseInt(String(body.message_id ?? ""), 10);
    if (!messageId || messageId <= 0) {
      return jsonResponse({ status: "error", message: "无效的留言 ID" }, 400);
    }

    if (db) {
      try {
        await ensureGuestbookTable(db);
        await db
          .prepare("UPDATE guestbook_messages SET likes = likes + 1 WHERE id = ?")
          .bind(messageId)
          .run();
        const row = await db
          .prepare("SELECT likes FROM guestbook_messages WHERE id = ?")
          .bind(messageId)
          .first<{ likes: number }>();
        const resp: BoardPostResponse = {
          status: "ok",
          message_id: messageId,
          likes: row ? row.likes : 1,
        };
        return jsonResponse(resp);
      } catch (err) {
        console.error("Like error:", err);
      }
    }

    let foundLikes = 1;
    for (const thread of memoryStore) {
      if (thread.id === messageId) {
        thread.likes = (thread.likes || 0) + 1;
        foundLikes = thread.likes;
        break;
      }
      for (const rep of thread.replies || []) {
        if (rep.id === messageId) {
          rep.likes = (rep.likes || 0) + 1;
          foundLikes = rep.likes;
          break;
        }
      }
    }

    return jsonResponse({ status: "ok", message_id: messageId, likes: foundLikes });
  }

  const rawNickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  const rawContent = typeof body.content === "string" ? body.content.trim() : "";
  const parentIdRaw = body.parent_id ? Number.parseInt(String(body.parent_id), 10) : null;
  const parentId = parentIdRaw && !Number.isNaN(parentIdRaw) ? parentIdRaw : null;
  const avatar = (
    typeof body.avatar === "string" && body.avatar.trim() ? body.avatar.trim() : "💬"
  ).slice(0, 8);

  if (!rawContent || rawContent.length > 500) {
    return jsonResponse({ status: "error", message: "留言内容需在 1 到 500 字之间" }, 400);
  }

  const nickname = escapeHtml(rawNickname ? rawNickname.slice(0, 30) : "神秘探险家");
  const content = escapeHtml(rawContent);
  const createdAt = Date.now();
  const ip = context.request.headers.get("cf-connecting-ip") || "";

  if (db) {
    try {
      await ensureGuestbookTable(db);
      const res = await db
        .prepare(
          "INSERT INTO guestbook_messages (parent_id, nickname, content, avatar, likes, created_at, ip) VALUES (?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(parentId, nickname, content, avatar, createdAt, ip)
        .run();

      const newId = typeof res.meta?.last_row_id === "number" ? res.meta.last_row_id : null;
      const resp: BoardPostResponse = {
        status: "ok",
        id: newId,
        parent_id: parentId,
        nickname,
        content,
        avatar,
        likes: 0,
        created_at: createdAt,
      };
      return jsonResponse(resp);
    } catch (err) {
      console.error("D1 insert message error:", err);
      return jsonResponse({ status: "error", message: getErrorMessage(err) }, 500);
    }
  }

  const newMsg: GuestbookReply = {
    id: ++memoryIdCounter,
    parent_id: parentId,
    nickname,
    content,
    avatar,
    likes: 0,
    created_at: createdAt,
  };

  if (parentId) {
    const parent = memoryStore.find((m) => m.id === parentId);
    if (parent) {
      parent.replies.push(newMsg);
    } else {
      memoryStore.unshift({ ...newMsg, replies: [] });
    }
  } else {
    memoryStore.unshift({ ...newMsg, replies: [] });
  }

  return jsonResponse({ status: "ok", ...newMsg });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return noContentOptions("GET, POST, OPTIONS");
};
