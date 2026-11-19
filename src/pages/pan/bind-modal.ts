import { postJson } from "@/core/api";
import { bindModalDismiss } from "@/core/modal";
import { showToast } from "@/core/toast";
import type { AirportType } from "@shared/types";
import { type PanState, fetchSubscriptionData } from "./subscription";

export function initBindModal(
  state: PanState,
  onUnauthorized: () => void,
): { openBindModal: () => void; closeBindModal: () => void } {
  const modal = document.getElementById("bindModal");
  const titleEl = document.getElementById("bindModalTitle");
  const descEl = document.getElementById("bindModalDesc");
  const formVpn07 = document.getElementById("formVpn07");
  const formDjjc = document.getElementById("formDjjc");
  const bindEmail = document.getElementById("bindEmail") as HTMLInputElement | null;
  const bindPassword = document.getElementById("bindPassword") as HTMLInputElement | null;
  const bindDjjcToken = document.getElementById("bindDjjcToken") as HTMLInputElement | null;
  const cancelBtn = document.getElementById("bindCancelBtn");
  const submitBtn = document.getElementById("bindSubmitBtn");

  function openBindModal(): void {
    const isVpn07 = state.currentAirport === "vpn07";
    if (titleEl) {
      titleEl.textContent = isVpn07 ? "绑定 VPN07 官网账号" : "绑定 / 修改顶级机场 Token";
    }
    if (descEl) {
      descEl.textContent = isVpn07
        ? "凭据将安全保存在 Cloudflare D1 边缘数据库中，云端自动登录并抓取专属节点。"
        : "可直接粘贴完整订阅直链或 32 位 Token，云端中继将自动以此 Token 进行多域名探活自愈。";
    }
    if (formVpn07) formVpn07.style.display = isVpn07 ? "block" : "none";
    if (formDjjc) formDjjc.style.display = isVpn07 ? "none" : "block";
    if (modal) modal.style.display = "flex";
  }

  function closeBindModal(): void {
    if (modal) modal.style.display = "none";
  }

  async function submitBindAccount(): Promise<void> {
    if (!state.verifiedPassword) {
      onUnauthorized();
      return;
    }

    if (state.currentAirport === "vpn07") {
      const email = bindEmail?.value.trim() || "";
      const password = bindPassword?.value.trim() || "";
      if (!email || !password) {
        showToast("请输入官网邮箱和密码");
        return;
      }
      showToast("正在保存并向云端验证...");
      try {
        const json = await postJson<{ success?: boolean; message?: string }>("/api/subscription", {
          pwd: state.verifiedPassword,
          type: "vpn07" satisfies AirportType,
          action: "set_credentials",
          email,
          vpn_password: password,
        });
        if (json.success) {
          closeBindModal();
          showToast("VPN07 凭证保存成功，正在拉取最新订阅...");
          await fetchSubscriptionData(state, "vpn07", true, onUnauthorized);
        } else {
          showToast(json.message || "保存失败");
        }
      } catch (err) {
        showToast(`请求异常：${err instanceof Error ? err.message : "未知错误"}`);
      }
      return;
    }

    const rawInput = bindDjjcToken?.value.trim() || "";
    if (!rawInput) {
      showToast("请输入订阅直链或 Token");
      return;
    }

    let token = rawInput;
    if (rawInput.includes("token=")) {
      const match = rawInput.match(/token=([a-zA-Z0-9_-]+)/);
      if (match?.[1]) token = match[1];
    }

    showToast("正在更新顶级机场 Token...");
    try {
      const json = await postJson<{ success?: boolean; message?: string }>("/api/subscription", {
        pwd: state.verifiedPassword,
        type: "djjc" satisfies AirportType,
        action: "set_djjc_token",
        token,
      });
      if (json.success) {
        closeBindModal();
        showToast("顶级机场 Token 更新成功，正在探活最新节点...");
        await fetchSubscriptionData(state, "djjc", true, onUnauthorized);
      } else {
        showToast(json.message || "保存失败");
      }
    } catch (err) {
      showToast(`请求异常：${err instanceof Error ? err.message : "未知错误"}`);
    }
  }

  cancelBtn?.addEventListener("click", closeBindModal);
  submitBtn?.addEventListener("click", () => {
    void submitBindAccount();
  });
  bindModalDismiss(modal, closeBindModal);

  return { openBindModal, closeBindModal };
}
