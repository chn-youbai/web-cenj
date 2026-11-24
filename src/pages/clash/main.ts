import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import { refreshStatus, sendCommand, startAutoRefresh, submitNewSub } from "./api";

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

function initClashPage(): void {
  initAppShell({ activePage: "clash" });
  for (const btn of document.querySelectorAll<HTMLElement>(".tab-btn[data-tab]")) {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  }

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
    if (!document.hidden) {
      void refreshStatus(true);
    }
  });

  void refreshStatus();
  startAutoRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClashPage);
} else {
  initClashPage();
}
