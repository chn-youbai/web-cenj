import { requestJson } from "@/core/api";
import { copyToClipboard } from "@/core/dom";
import { showToast } from "@/core/toast";
import type { AirportType, AppleIdGuideCredentials, SubscriptionResponse } from "@shared/types";

export const MEMORY_MS = 5 * 60 * 1000;
const EXPIRE_KEY = "sub_unlock_expire";
const PWD_SESSION_KEY = "sub_unlock_pwd";
const AIRPORT_STORAGE_KEY = "selected_airport";

export interface AirportUrls {
  rawUrl: string;
  relayUrl: string;
}

export interface PanState {
  currentAirport: AirportType;
  verifiedPassword: string;
  airportCache: Record<AirportType, AirportUrls>;
  appleId: AppleIdGuideCredentials | null;
  isFetchingSub: boolean;
}

export function createPanState(): PanState {
  let savedAirport: AirportType = "djjc";
  try {
    const raw = window.localStorage.getItem(AIRPORT_STORAGE_KEY);
    if (raw === "djjc" || raw === "vpn07") savedAirport = raw;
  } catch {
    // ignore
  }

  let verifiedPassword = "";
  try {
    const expire = window.sessionStorage.getItem(EXPIRE_KEY);
    const pwd = window.sessionStorage.getItem(PWD_SESSION_KEY);
    if (expire && pwd && Date.now() < Number.parseInt(expire, 10)) {
      verifiedPassword = pwd;
    } else {
      window.sessionStorage.removeItem(EXPIRE_KEY);
      window.sessionStorage.removeItem(PWD_SESSION_KEY);
    }
  } catch {
    // ignore
  }

  return {
    currentAirport: savedAirport,
    verifiedPassword,
    airportCache: {
      djjc: { rawUrl: "", relayUrl: "/api/sub?type=djjc" },
      vpn07: { rawUrl: "", relayUrl: "/api/sub?type=vpn07" },
    },
    appleId: null,
    isFetchingSub: false,
  };
}

export function persistVerifiedSession(pwd: string): void {
  try {
    window.sessionStorage.setItem(EXPIRE_KEY, String(Date.now() + MEMORY_MS));
    window.sessionStorage.setItem(PWD_SESSION_KEY, pwd);
  } catch {
    // ignore
  }
}

export function clearVerifiedSession(): void {
  try {
    window.sessionStorage.removeItem(EXPIRE_KEY);
    window.sessionStorage.removeItem(PWD_SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function copyWithToast(text: string, label: string): Promise<void> {
  if (!text) {
    showToast(`⚠️ 暂无可复制的 ${label}`);
    return;
  }
  const ok = await copyToClipboard(text);
  showToast(ok ? `✅ ${label} 已复制到剪贴板！` : "❌ 复制失败，请手动长按复制");
}

function renderAppleId(appleId: AppleIdGuideCredentials | null | undefined): void {
  const userEl = document.getElementById("appleIdUserText");
  const pwdEl = document.getElementById("appleIdPwdText");
  if (!userEl || !pwdEl) return;

  if (appleId?.email && appleId?.password) {
    userEl.textContent = appleId.email;
    pwdEl.textContent = appleId.password;
  } else {
    userEl.textContent = "暂未配置（请设置 Cloudflare 环境变量 APPLE_ID_EMAIL）";
    pwdEl.textContent = "暂未配置（请设置 APPLE_ID_PASSWORD）";
  }
}

export async function fetchSubscriptionData(
  state: PanState,
  type: AirportType,
  forceRefresh = false,
  onUnauthorized?: () => void,
): Promise<boolean> {
  if (state.isFetchingSub || !state.verifiedPassword) return false;
  state.isFetchingSub = true;

  const refreshBtn = document.getElementById("btnRefreshSub") as HTMLButtonElement | null;
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "⏳ 同步中...";
  }

  try {
    const url = `/api/subscription?type=${type}&pwd=${encodeURIComponent(state.verifiedPassword)}${forceRefresh ? "&refresh=true" : ""}`;
    const data = await requestJson<SubscriptionResponse>(url);

    if (data.subscribe_url) {
      state.airportCache[type].rawUrl = data.subscribe_url;
    }
    if (data.relay_url) {
      state.airportCache[type].relayUrl = data.relay_url;
    }
    if (data.apple_id !== undefined) {
      state.appleId = data.apple_id;
      renderAppleId(data.apple_id);
    }

    if (state.currentAirport === type) {
      const relayFullUrl = `${window.location.origin}${state.airportCache[type].relayUrl}`;
      const subTextEl = document.getElementById("subscribeText");
      if (subTextEl) subTextEl.textContent = relayFullUrl;

      const planEl = document.getElementById("metricPlan");
      const remEl = document.getElementById("metricRemaining");
      const usedEl = document.getElementById("metricUsedTotal");
      const expEl = document.getElementById("metricExpire");
      const syncTimeEl = document.getElementById("subSyncTime");

      if (planEl && data.plan_name) planEl.textContent = data.plan_name;
      if (data.traffic) {
        if (remEl) remEl.textContent = data.traffic.remaining || "--";
        if (usedEl) {
          usedEl.textContent = `${data.traffic.used || "0.00 GB"} / ${data.traffic.total || "--"}`;
        }
      }
      if (expEl && data.expired_date_str) expEl.textContent = data.expired_date_str;

      if (syncTimeEl) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        syncTimeEl.textContent = `⏱️ 同步时间：${timeStr} (${data.from_cache ? "云端缓存" : "实时探活"})`;
      }
    }

    if (forceRefresh) {
      showToast(data.warning || `🎉 已成功同步 ${data.airport_name || ""} 最新配置与流量！`);
    }
    return true;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      clearVerifiedSession();
      state.verifiedPassword = "";
      onUnauthorized?.();
      showToast("❌ 访问密码错误，请重新输入");
      return false;
    }
    const message = err instanceof Error ? err.message : "网络波动";
    if (status === 503) {
      showToast(`⚠️ ${message}`);
    } else if (forceRefresh) {
      showToast("⚠️ 网络轻微波动，已为您保留当前可用订阅");
    }
    return false;
  } finally {
    state.isFetchingSub = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "🔄 强制刷新最新订阅";
    }
  }
}
