import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import {
  refreshStatus,
  sendCommand,
  setOnAuthLost,
  startAutoRefresh,
  stopAutoRefresh,
  submitNewSub,
} from "./api";
import {
  clearClashAuth,
  closeChangePwdModal,
  isAuthorized,
  openChangePwdModal,
  saveNewPassword,
  submitClashAuth,
} from "./auth";

function switchTab(tabName: string): void {
  for (const btn of document.querySelectorAll(".tab-btn")) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  }
  const tabIds: Record<string, string> = {
    hub: "tabHub",
    speed: "tabSpeed",
    subs: "tabSubs",
    nodes: "tabNodes",
  };
  for (const [key, id] of Object.entries(tabIds)) {
    const el = document.getElementById(id);
    if (el) el.style.display = key === tabName ? "block" : "none";
  }
}

function checkAccessGate(): void {
  const backdrop = document.getElementById("authModalBackdrop");
  const mainApp = document.getElementById("mainAppContainer");
  const input = document.getElementById("clashAuthInput") as HTMLInputElement | null;
  const err = document.getElementById("authErrorMsg");

  if (isAuthorized()) {
    backdrop?.classList.remove("show");
    if (mainApp) mainApp.style.filter = "";
    void refreshStatus();
    startAutoRefresh();
  } else {
    stopAutoRefresh();
    if (err) {
      err.style.color = "#ef4444";
      err.textContent = "";
    }
    if (input) input.value = "";
    backdrop?.classList.add("show");
    if (mainApp) mainApp.style.filter = "blur(10px)";
    window.setTimeout(() => input?.focus(), 150);
  }
}

setOnAuthLost(checkAccessGate);

function initClashPage(): void {
  initAppShell({ activePage: "clash" });
  for (const btn of document.querySelectorAll<HTMLElement>(".tab-btn[data-tab]")) {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  }

  document.getElementById("btnClashUnlock")?.addEventListener("click", () => {
    void submitClashAuth(checkAccessGate);
  });

  document.getElementById("clashAuthInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      void submitClashAuth(checkAccessGate);
    }
  });

  document.getElementById("btnOpenChangePwd")?.addEventListener("click", openChangePwdModal);
  document.getElementById("btnCloseChangePwd")?.addEventListener("click", closeChangePwdModal);
  document.getElementById("btnSaveChangePwd")?.addEventListener("click", () => {
    void saveNewPassword(() => void refreshStatus());
  });

  document.getElementById("btnLogoutClash")?.addEventListener("click", () => {
    if (window.confirm("确定退出锁定状态吗？退出后再次进入需要重新输入访问密码。")) {
      stopAutoRefresh();
      clearClashAuth();
      checkAccessGate();
    }
  });

  document.getElementById("btnRefreshStatus")?.addEventListener("click", () => {
    void refreshStatus();
  });

  document.getElementById("btnSubmitSub1")?.addEventListener("click", () => {
    submitNewSub("newSubUrlInput");
  });
  document.getElementById("btnSubmitSub2")?.addEventListener("click", () => {
    submitNewSub("newSubUrlInput2");
  });

  document.body.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cmd]");
    if (target) {
      const cmd = target.dataset.cmd;
      const payload = target.dataset.payload || "";
      if (cmd) void sendCommand(cmd, payload);
      return;
    }

    const dynamicTarget = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
    if (!dynamicTarget) return;
    const action = dynamicTarget.dataset.action;
    const payload = dynamicTarget.dataset.payload || "";
    if (action === "switch-node") {
      void sendCommand("switch_node", payload);
    } else if (action === "switch-profile") {
      void sendCommand("switch_profile", payload);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isAuthorized()) {
      void refreshStatus(true);
    }
  });

  checkAccessGate();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClashPage);
} else {
  initClashPage();
}
