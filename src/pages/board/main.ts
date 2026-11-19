import "@/styles/board.css";
import {
  changeRandomIdentity,
  cycleRandomAvatar,
  initUserIdentity,
  saveUserIdentity,
} from "./identity";
import {
  appendEmoji,
  cancelReplyBox,
  fetchMessages,
  handleLike,
  submitMainMessage,
  submitReply,
  toggleReplyBox,
  updateCharCounter,
} from "./messages";

document.addEventListener("DOMContentLoaded", () => {
  initUserIdentity();
  void fetchMessages(false);

  document.getElementById("btnRandomNick")?.addEventListener("click", changeRandomIdentity);
  document.getElementById("avatarBadge")?.addEventListener("click", cycleRandomAvatar);
  document.getElementById("nicknameInput")?.addEventListener("blur", saveUserIdentity);
  document.getElementById("contentInput")?.addEventListener("input", updateCharCounter);
  document.getElementById("btnSubmitMsg")?.addEventListener("click", () => {
    void submitMainMessage();
  });
  document.getElementById("btnRefresh")?.addEventListener("click", () => {
    void fetchMessages(true);
  });

  for (const pill of document.querySelectorAll<HTMLElement>(".emoji-pill[data-emoji]")) {
    pill.addEventListener("click", () => {
      const emoji = pill.dataset.emoji;
      if (emoji) appendEmoji(emoji);
    });
  }

  document.getElementById("contentInput")?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void submitMainMessage();
    }
  });

  document.getElementById("threadsContainer")?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    const id = Number.parseInt(target.dataset.id || "", 10);
    if (Number.isNaN(id)) return;

    if (action === "reply") {
      toggleReplyBox(id, target.dataset.nick || "");
    } else if (action === "cancel-reply") {
      cancelReplyBox(id);
    } else if (action === "submit-reply") {
      void submitReply(id);
    } else if (action === "like") {
      void handleLike(id, target);
    }
  });
});
