import { postJson, requestJson } from "@/core/api";
import { escapeHtml } from "@/core/dom";
import { showToast } from "@/core/toast";
import type { BoardListResponse, BoardPostResponse, GuestbookThread } from "@shared/types";
import { getCurrentIdentity, saveUserIdentity } from "./identity";

const API_URL = "/api/board";
let isSubmitting = false;
let lastPostTime = 0;

export function formatTime(timestamp: number): string {
  if (!timestamp) return "未知时间";
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function updateCharCounter(): void {
  const input = document.getElementById("contentInput") as HTMLTextAreaElement | null;
  const counter = document.getElementById("charCounter");
  if (counter) {
    counter.textContent = `${input?.value.length || 0} / 500`;
  }
}

export function appendEmoji(emoji: string): void {
  const textarea = document.getElementById("contentInput") as HTMLTextAreaElement | null;
  if (!textarea) return;
  textarea.value += emoji;
  textarea.focus();
  updateCharCounter();
}

export function renderThreads(threads: GuestbookThread[]): void {
  const container = document.getElementById("threadsContainer");
  if (!container) return;

  if (!threads || threads.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span style="font-size: 2.2rem;">📭</span>
        <strong>这里空空如也，静候第一位有缘人</strong>
        <span style="font-size: 0.8rem;">在上方写下你的第一句留言吧！</span>
      </div>
    `;
    return;
  }

  container.innerHTML = threads
    .map((thread, idx) => {
      const floorNum = threads.length - idx;
      const replies = thread.replies || [];

      const repliesHtml =
        replies.length > 0
          ? `
            <div class="nested-replies-wrapper" id="replies-wrapper-${thread.id}">
              ${replies
                .map(
                  (rep) => `
                <div class="reply-item">
                  <div class="reply-header">
                    <div class="reply-user">
                      <span>${escapeHtml(rep.avatar || "💬")}</span>
                      <span>${escapeHtml(rep.nickname)}</span>
                    </div>
                    <span class="msg-time">${formatTime(rep.created_at)}</span>
                  </div>
                  <div class="reply-content">${escapeHtml(rep.content)}</div>
                  <div class="reply-actions">
                    <button type="button" class="btn-action" data-action="like" data-id="${rep.id}">
                      <span>❤️</span>
                      <span class="like-count">${rep.likes || 0}</span>
                    </button>
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          `
          : `<div class="nested-replies-wrapper" id="replies-wrapper-${thread.id}" style="display: none;"></div>`;

      return `
        <article class="thread-card" id="thread-${thread.id}">
          <div class="msg-header">
            <div class="msg-user-info">
              <div class="msg-avatar">${escapeHtml(thread.avatar || "🚀")}</div>
              <div>
                <div class="msg-nickname">${escapeHtml(thread.nickname)}</div>
                <div class="msg-time">${formatTime(thread.created_at)}</div>
              </div>
            </div>
            <span class="msg-floor-badge">#${floorNum}F</span>
          </div>

          <div class="msg-content">${escapeHtml(thread.content)}</div>

          <div class="msg-actions">
            <button type="button" class="btn-action" data-action="reply" data-id="${thread.id}" data-nick="${escapeHtml(thread.nickname)}">
              <span>💬</span>
              <span>回复 (${replies.length})</span>
            </button>
            <button type="button" class="btn-action" data-action="like" data-id="${thread.id}">
              <span>❤️</span>
              <span class="like-count">${thread.likes || 0}</span>
            </button>
          </div>

          ${repliesHtml}

          <div id="reply-box-container-${thread.id}" style="display: none;"></div>
        </article>
      `;
    })
    .join("");
}

export async function fetchMessages(showFeedback = false): Promise<void> {
  const container = document.getElementById("threadsContainer");
  const totalBadge = document.getElementById("totalBadge");
  if (showFeedback) {
    showToast("🔄 正在刷新留言...");
  }

  try {
    const res = await requestJson<BoardListResponse>(API_URL);
    if (res.status === "ok") {
      if (totalBadge) {
        totalBadge.textContent = `💭 共 ${res.total || 0} 条温暖足迹 · 实时同步`;
      }
      renderThreads(res.threads || []);
      if (showFeedback) showToast("✅ 留言已更新至最新！");
    } else {
      showToast(`⚠️ 加载失败：${res.message || "服务异常"}`);
    }
  } catch {
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <span>❌ 网络连接中断</span>
          <span style="font-size: 0.8rem;">无法拉取云端留言，请检查网络后刷新重试</span>
        </div>
      `;
    }
  }
}

export function toggleReplyBox(parentId: number, parentNick: string): void {
  const boxContainer = document.getElementById(`reply-box-container-${parentId}`);
  if (!boxContainer) return;

  if (boxContainer.style.display !== "none" && boxContainer.innerHTML.trim() !== "") {
    boxContainer.style.display = "none";
    boxContainer.innerHTML = "";
    return;
  }

  boxContainer.innerHTML = `
    <div class="inline-reply-box">
      <textarea id="reply-input-${parentId}" class="inline-reply-textarea" placeholder="回复 @${escapeHtml(parentNick)}：发表你的看法..." maxlength="300"></textarea>
      <div class="inline-reply-btns">
        <button type="button" class="btn-action" data-action="cancel-reply" data-id="${parentId}">取消</button>
        <button type="button" class="btn-submit" style="padding: 0.35rem 0.9rem; font-size: 0.78rem;" data-action="submit-reply" data-id="${parentId}">
          <span>🚀 发送回复</span>
        </button>
      </div>
    </div>
  `;
  boxContainer.style.display = "block";
  const textarea = document.getElementById(`reply-input-${parentId}`) as HTMLTextAreaElement | null;
  textarea?.focus();
}

export function cancelReplyBox(parentId: number): void {
  const boxContainer = document.getElementById(`reply-box-container-${parentId}`);
  if (boxContainer) {
    boxContainer.style.display = "none";
    boxContainer.innerHTML = "";
  }
}

export async function submitReply(parentId: number): Promise<void> {
  const now = Date.now();
  if (now - lastPostTime < 4000) {
    showToast("⏳ 发言太快啦，请稍候 4 秒后再试");
    return;
  }

  const input = document.getElementById(`reply-input-${parentId}`) as HTMLTextAreaElement | null;
  const content = input?.value.trim() || "";
  if (!content) {
    showToast("⚠️ 回复内容不能为空");
    return;
  }

  saveUserIdentity();
  const { nickname, avatar } = getCurrentIdentity();

  try {
    const res = await postJson<BoardPostResponse>(API_URL, {
      parent_id: parentId,
      nickname,
      avatar,
      content,
    });
    if (res.status === "ok") {
      lastPostTime = Date.now();
      showToast("🎉 回复成功！");
      cancelReplyBox(parentId);
      await fetchMessages(false);
    } else {
      showToast(`❌ 提交失败：${res.message || "未知错误"}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "网络连接失败，请重试";
    showToast(`❌ ${msg}`);
  }
}

export async function submitMainMessage(): Promise<void> {
  if (isSubmitting) return;

  const now = Date.now();
  if (now - lastPostTime < 4000) {
    showToast("⏳ 发帖太频繁啦，请休息 4 秒再发");
    return;
  }

  const contentInput = document.getElementById("contentInput") as HTMLTextAreaElement | null;
  const content = contentInput?.value.trim() || "";
  if (!content) {
    showToast("⚠️ 请写点什么再发布吧！");
    contentInput?.focus();
    return;
  }

  saveUserIdentity();
  const { nickname, avatar } = getCurrentIdentity();

  isSubmitting = true;
  const submitBtn = document.getElementById("btnSubmitMsg") as HTMLButtonElement | null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<span>⏳</span><span>发布中...</span>";
  }

  try {
    const res = await postJson<BoardPostResponse>(API_URL, {
      parent_id: null,
      nickname,
      avatar,
      content,
    });
    if (res.status === "ok") {
      lastPostTime = Date.now();
      if (contentInput) contentInput.value = "";
      updateCharCounter();
      showToast("🎉 留言发布成功！");
      await fetchMessages(false);
    } else {
      showToast(`❌ 发布失败：${res.message || "服务异常"}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "发送网络异常，请稍候重试";
    showToast(`❌ ${msg}`);
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "<span>🚀</span><span>发布留言</span>";
    }
  }
}

export async function handleLike(messageId: number, btnEl: HTMLElement): Promise<void> {
  if (btnEl.classList.contains("liked")) {
    showToast("❤️ 您已经点过赞啦");
    return;
  }

  btnEl.classList.add("liked");
  const countEl = btnEl.querySelector(".like-count");
  if (countEl) {
    countEl.textContent = String(Number.parseInt(countEl.textContent || "0", 10) + 1);
  }

  try {
    await postJson<BoardPostResponse>(API_URL, {
      action: "like",
      message_id: messageId,
    });
  } catch {
    // keep optimistic feedback
  }
}
