import { showToast } from "@/core/toast";
import type { AirportType } from "@shared/types";
import { initBindModal } from "./bind-modal";
import {
  copyWithToast,
  createPanState,
  fetchSubscriptionData,
  persistVerifiedSession,
} from "./subscription";

const state = createPanState();

const lockedSection = document.getElementById("subLockedSection");
const unlockedSection = document.getElementById("subUnlockedSection");
const unlockForm = document.getElementById("subUnlockForm") as HTMLFormElement | null;
const unlockInput = document.getElementById("unlockInput") as HTMLInputElement | null;
const unlockSubmitBtn = document.getElementById("unlockSubmitBtn") as HTMLButtonElement | null;
const tabDjjc = document.getElementById("tabDjjc");
const tabVpn07 = document.getElementById("tabVpn07");
const subscribeText = document.getElementById("subscribeText");

function showLockedUI(): void {
  if (lockedSection) lockedSection.style.display = "flex";
  if (unlockedSection) unlockedSection.style.display = "none";
  if (subscribeText) subscribeText.textContent = "";
}

function showUnlockedUI(): void {
  if (lockedSection) lockedSection.style.display = "none";
  if (unlockedSection) unlockedSection.style.display = "flex";
  switchAirportTab(state.currentAirport);
}

function switchAirportTab(type: AirportType): void {
  state.currentAirport = type;
  try {
    window.localStorage.setItem("selected_airport", type);
  } catch {
    // ignore
  }

  if (type === "djjc") {
    tabDjjc?.classList.add("active");
    tabVpn07?.classList.remove("active");
  } else {
    tabDjjc?.classList.remove("active");
    tabVpn07?.classList.add("active");
  }

  const activeData = state.airportCache[type];
  if (subscribeText) {
    subscribeText.textContent = `${window.location.origin}${activeData.relayUrl}`;
  }
  void fetchSubscriptionData(state, type, false, showLockedUI);
}

const { openBindModal } = initBindModal(state, showLockedUI);

unlockForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pwd = unlockInput?.value.trim() || "";
  if (!pwd) {
    showToast("⚠️ 请输入访问密码");
    unlockInput?.focus();
    return;
  }

  if (unlockSubmitBtn) {
    unlockSubmitBtn.disabled = true;
    unlockSubmitBtn.textContent = "验证中...";
  }

  state.verifiedPassword = pwd;
  const ok = await fetchSubscriptionData(state, state.currentAirport, false, () => {
    showLockedUI();
    if (unlockInput) {
      unlockInput.value = "";
      unlockInput.focus();
    }
  });

  if (unlockSubmitBtn) {
    unlockSubmitBtn.disabled = false;
    unlockSubmitBtn.textContent = "🔓 解锁访问";
  }

  if (ok) {
    persistVerifiedSession(pwd);
    showUnlockedUI();
    showToast("🎉 密码正确！已解锁双机场订阅中枢（5分钟内免输）");
  }
});

tabDjjc?.addEventListener("click", () => switchAirportTab("djjc"));
tabVpn07?.addEventListener("click", () => switchAirportTab("vpn07"));

document.getElementById("copyLanzouPassBtn")?.addEventListener("click", () => {
  void copyWithToast("pass", "备用网盘密码 pass");
});

document.getElementById("copyRelayBtn")?.addEventListener("click", () => {
  const relayFullUrl = `${window.location.origin}${state.airportCache[state.currentAirport].relayUrl}`;
  void copyWithToast(relayFullUrl, "私人永久固定直链");
});

document.getElementById("copyRawBtn")?.addEventListener("click", () => {
  void copyWithToast(state.airportCache[state.currentAirport].rawUrl, "官方原生订阅直链");
});

document.getElementById("btnRefreshSub")?.addEventListener("click", () => {
  void fetchSubscriptionData(state, state.currentAirport, true, showLockedUI);
});

document.getElementById("bindAccountLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  openBindModal();
});

document.getElementById("copyAppleIdUserBtn")?.addEventListener("click", () => {
  void copyWithToast(state.appleId?.email || "", "美区 Apple ID 账号");
});

document.getElementById("copyAppleIdPwdBtn")?.addEventListener("click", () => {
  void copyWithToast(state.appleId?.password || "", "Apple ID 密码");
});

if (state.verifiedPassword) {
  showUnlockedUI();
} else {
  showLockedUI();
}
