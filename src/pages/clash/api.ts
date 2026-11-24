import { postJson, requestJson } from "@/core/api";
import { escapeHtml } from "@/core/dom";
import type { ClashStatusResponse } from "@shared/types";
import {
  renderCommandFeedback,
  renderHeartbeat,
  renderNodes,
  renderSpeed,
  renderSubs,
} from "./renderers";

let autoRefreshTimer: number | undefined;
let isStatusRefreshing = false;
let isLastPCOnline = true;

export function stopAutoRefresh(): void {
  if (autoRefreshTimer !== undefined) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
}

export function startAutoRefresh(): void {
  stopAutoRefresh();
  autoRefreshTimer = window.setInterval(() => {
    if (!document.hidden) {
      void refreshStatus(true);
    }
  }, 6000);
}

export async function refreshStatus(isBackground = false): Promise<void> {
  if (isStatusRefreshing && isBackground) return;
  isStatusRefreshing = true;

  const statusEl = document.getElementById("clashStatusText");

  if (!isBackground && statusEl) {
    statusEl.textContent = "🔄 同步中...";
  }

  try {
    const data = await requestJson<ClashStatusResponse>("/api/clash");

    if (data.status === "ok") {
      const isOnline = Boolean(data.heartbeat && data.heartbeat.status === "online");
      isLastPCOnline = isOnline;

      if (
        statusEl &&
        (isBackground || (!statusEl.innerHTML.includes("🚀") && !statusEl.innerHTML.includes("⚠️")))
      ) {
        statusEl.innerHTML =
          '<span style="color:#10b981;">● 已连接云端中继 (秒级自动同步中)</span>';
      }

      renderHeartbeat(data.heartbeat);
      renderCommandFeedback(data.latest_command, isOnline);
      renderSpeed(data.speed_data);
      renderSubs(data.profiles_data);
      renderNodes(data.nodes_data);
    } else if (statusEl) {
      statusEl.innerHTML = `<span style="color:#ef4444;">❌ ${escapeHtml(data.message || "状态获取失败")}</span>`;
    }
  } catch {
    if (!isBackground && statusEl) {
      statusEl.innerHTML = '<span style="color:#ef4444;">❌ 网络请求异常</span>';
    }
  } finally {
    isStatusRefreshing = false;
  }
}

export async function sendCommand(command: string, payload = ""): Promise<void> {
  const statusEl = document.getElementById("clashStatusText");

  if (statusEl) {
    statusEl.innerHTML = "⚡ 正在下发指令并触发电脑秒级响应...";
  }

  try {
    const data = await postJson<{ status?: string; message?: string }>("/api/clash", {
      action: "dispatch_command",
      command,
      payload,
    });

    if (data.status === "ok") {
      if (statusEl) {
        statusEl.innerHTML = !isLastPCOnline
          ? '<span style="color:#f59e0b;">⚠️ 指令已提交云端！电脑当前离线/已关机，待电脑开机联网后将自动秒级执行。</span>'
          : '<span style="color:#10b981;">🚀 指令已直达云端！电脑秒级执行中...</span>';
      }
      void refreshStatus(true);
      for (const delay of [1200, 2500, 4500, 7000]) {
        window.setTimeout(() => void refreshStatus(true), delay);
      }
    } else if (statusEl) {
      statusEl.innerHTML = `<span style="color:#ef4444;">❌ 失败: ${escapeHtml(data.message || "未知错误")}</span>`;
    }
  } catch {
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#ef4444;">❌ 网络请求失败</span>';
    }
  }
}

export function submitNewSub(inputId = "newSubUrlInput"): void {
  const el = document.getElementById(inputId) as HTMLInputElement | null;
  const url = el?.value.trim() || "";
  if (!url || !url.startsWith("http")) {
    window.alert("请输入有效的 http/https 订阅链接");
    return;
  }
  void sendCommand("update_sub", url);
  if (el) el.value = "";
  const otherId = inputId === "newSubUrlInput" ? "newSubUrlInput2" : "newSubUrlInput";
  const otherEl = document.getElementById(otherId) as HTMLInputElement | null;
  if (otherEl) otherEl.value = "";
}
