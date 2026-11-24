import "@/core/fonts";
import { copyToClipboard, escapeHtml, optById } from "@/core/dom";
import { initAppShell } from "@/core/shell";
import { showToast } from "@/core/toast";
import type {
  AirportType,
  AppleIdGuideCredentials,
  SubLinksListResponse,
  SubscriptionResponse,
  TempSubLinkItem,
} from "@shared/types";

initAppShell({ activePage: "key" });

const state = {
  currentAirport: "djjc" as AirportType,
  rawUrls: { djjc: "", vpn07: "" } as Record<AirportType, string>,
  appleId: null as AppleIdGuideCredentials | null,
  tempLinks: [] as TempSubLinkItem[],
};

function permanentUrlFor(airport: AirportType): string {
  return `${window.location.origin}/api/sub?type=${airport}`;
}

function tempUrlFor(token: string): string {
  return `${window.location.origin}/api/sub?token=${encodeURIComponent(token)}`;
}

function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "不限时";
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "已过期";
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `剩余 ${mins} 分钟`;
  const hours = Math.ceil(mins / 60);
  if (hours < 48) return `剩余 ${hours} 小时`;
  const days = Math.ceil(hours / 24);
  return `剩余 ${days} 天`;
}

function renderAppleId(): void {
  const userEl = optById("appleIdUserText");
  const pwdEl = optById("appleIdPwdText");
  if (!userEl || !pwdEl) return;
  if (state.appleId?.email && state.appleId?.password) {
    userEl.textContent = state.appleId.email;
    pwdEl.textContent = state.appleId.password;
  } else {
    userEl.textContent = "未配置 (APPLE_ID_EMAIL)";
    pwdEl.textContent = "未配置 (APPLE_ID_PASSWORD)";
  }
}

function renderTempLinks(): void {
  const listEl = optById("tempLinkList");
  if (!listEl) return;

  if (state.tempLinks.length === 0) {
    listEl.innerHTML =
      '<div class="key-temp-empty">暂无临时链接，可在上方按有效期与次数按需生成</div>';
    return;
  }

  const statusLabel: Record<TempSubLinkItem["status"], string> = {
    active: "有效",
    expired: "已过期",
    exhausted: "次数已用尽",
    revoked: "已吊销",
  };

  listEl.innerHTML = state.tempLinks
    .map((item) => {
      const fullUrl = tempUrlFor(item.token);
      const isDead = item.status !== "active";
      const airportLabel = item.airport === "vpn07" ? "VPN07" : "顶级机场";
      const usesText = item.max_uses
        ? `${item.used_count} / ${item.max_uses} 次`
        : `已用 ${item.used_count} 次（不限）`;
      const titleText = item.label || `${airportLabel} 临时直链`;

      return `
        <div class="key-temp-row" data-token="${escapeHtml(item.token)}">
          <div class="key-temp-info">
            <div class="key-temp-top">
              <span class="key-temp-title">${escapeHtml(titleText)}</span>
              <span class="key-pill">${escapeHtml(airportLabel)}</span>
              <span class="key-pill ${isDead ? "is-dead" : "is-active"}">${escapeHtml(statusLabel[item.status])}</span>
            </div>
            <div class="key-temp-url">${escapeHtml(fullUrl)}</div>
            <div class="key-temp-meta">${escapeHtml(usesText)} · ${escapeHtml(formatExpiry(item.expires_at))}</div>
          </div>
          <div class="key-temp-actions">
            <button type="button" class="key-btn key-btn-ghost key-btn-sm" data-act="copy" data-token="${escapeHtml(item.token)}">复制</button>
            ${
              item.status === "active"
                ? `<button type="button" class="key-btn key-btn-ghost key-btn-sm" data-act="revoke" data-token="${escapeHtml(item.token)}">吊销</button>`
                : ""
            }
            <button type="button" class="key-btn key-btn-ghost key-btn-sm key-btn-danger" data-act="delete" data-token="${escapeHtml(item.token)}">删除</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function fetchSubscription(airport: AirportType, forceRefresh = false): Promise<void> {
  const permEl = optById("permSubUrl");
  if (permEl) permEl.textContent = permanentUrlFor(airport);

  try {
    const resp = await fetch(
      `/api/subscription?type=${airport}${forceRefresh ? "&refresh=true" : ""}`,
      { cache: "no-store" },
    );
    const data = (await resp.json()) as SubscriptionResponse;

    if (data.apple_id !== undefined) {
      state.appleId = data.apple_id;
      renderAppleId();
    }

    const planEl = optById("metricPlan");
    const remEl = optById("metricRemaining");
    const usedEl = optById("metricUsedTotal");
    const expEl = optById("metricExpire");
    const syncEl = optById("subSyncTime");

    if (data.subscribe_url) {
      state.rawUrls[airport] = data.subscribe_url;
    }
    if (planEl)
      planEl.textContent = data.plan_name || (data.need_credentials ? "需绑定账号" : "--");
    if (remEl) remEl.textContent = data.traffic?.remaining || "--";
    if (usedEl) {
      usedEl.textContent = data.traffic ? `${data.traffic.used} / ${data.traffic.total}` : "--";
    }
    if (expEl) expEl.textContent = data.expired_date_str || "--";
    if (syncEl) {
      syncEl.textContent = data.warning
        ? `提示：${data.warning}`
        : `最近同步：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
    }
  } catch {
    showToast("订阅信息拉取失败");
  }
}

async function fetchTempLinks(): Promise<void> {
  try {
    const resp = await fetch("/api/sub-links", { cache: "no-store" });
    const data = (await resp.json()) as SubLinksListResponse;
    if (data.status === "ok") {
      state.tempLinks = data.links || [];
      renderTempLinks();
    }
  } catch {
    // ignore
  }
}

function switchAirport(airport: AirportType): void {
  state.currentAirport = airport;
  optById("tabDjjc")?.classList.toggle("active", airport === "djjc");
  optById("tabVpn07")?.classList.toggle("active", airport === "vpn07");
  void fetchSubscription(airport, false);
}

function openBindModal(): void {
  const modal = optById("bindModal");
  const djjcBox = optById("formDjjc");
  const vpnBox = optById("formVpn07");
  const titleEl = optById("bindModalTitle");
  if (djjcBox) djjcBox.hidden = state.currentAirport !== "djjc";
  if (vpnBox) vpnBox.hidden = state.currentAirport !== "vpn07";
  if (titleEl) {
    titleEl.textContent =
      state.currentAirport === "djjc" ? "绑定顶级机场 Token" : "绑定 VPN07 登录凭据";
  }
  if (modal) modal.hidden = false;
}

function closeBindModal(): void {
  const modal = optById("bindModal");
  if (modal) modal.hidden = true;
}

function bindEvents(): void {
  optById("tabDjjc")?.addEventListener("click", () => switchAirport("djjc"));
  optById("tabVpn07")?.addEventListener("click", () => switchAirport("vpn07"));

  optById("btnCopyPermUrl")?.addEventListener("click", () => {
    void copyToClipboard(permanentUrlFor(state.currentAirport)).then((ok) => {
      showToast(ok ? "永久私人直链已复制" : "复制失败");
    });
  });

  optById("btnCopyRawUrl")?.addEventListener("click", () => {
    const raw = state.rawUrls[state.currentAirport];
    if (!raw) {
      showToast("暂无官方原生直链");
      return;
    }
    void copyToClipboard(raw).then((ok) => {
      showToast(ok ? "官方原生直链已复制" : "复制失败");
    });
  });

  optById("btnRefreshSub")?.addEventListener("click", () => {
    void fetchSubscription(state.currentAirport, true).then(() => showToast("已刷新最新流量"));
  });

  optById("btnCopyAppleUser")?.addEventListener("click", () => {
    if (!state.appleId?.email) return showToast("暂未配置 Apple ID");
    void copyToClipboard(state.appleId.email).then((ok) => {
      showToast(ok ? "Apple ID 账号已复制" : "复制失败");
    });
  });

  optById("btnCopyApplePwd")?.addEventListener("click", () => {
    if (!state.appleId?.password) return showToast("暂未配置密码");
    void copyToClipboard(state.appleId.password).then((ok) => {
      showToast(ok ? "Apple ID 密码已复制" : "复制失败");
    });
  });

  // Create temp link
  optById<HTMLFormElement>("tempLinkForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const airport = (optById<HTMLSelectElement>("tempAirportSelect")?.value ||
      "djjc") as AirportType;
    const ttlMinutes = Number.parseInt(
      optById<HTMLSelectElement>("tempTtlSelect")?.value || "1440",
      10,
    );
    const maxUses = Number.parseInt(
      optById<HTMLSelectElement>("tempMaxUsesSelect")?.value || "3",
      10,
    );
    const label = (optById<HTMLInputElement>("tempLabelInput")?.value || "").trim();
    const btn = optById<HTMLButtonElement>("btnCreateTempLink");

    if (btn) {
      btn.disabled = true;
      btn.textContent = "生成中...";
    }
    try {
      const resp = await fetch("/api/sub-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          airport,
          label,
          ttlMinutes: ttlMinutes > 0 ? ttlMinutes : null,
          maxUses: maxUses > 0 ? maxUses : null,
        }),
      });
      const data = (await resp.json()) as {
        status?: string;
        link?: TempSubLinkItem;
        error?: string;
      };
      if (!resp.ok || data.status !== "ok" || !data.link) {
        showToast(data.error || "生成失败");
      } else {
        const labelInput = optById<HTMLInputElement>("tempLabelInput");
        if (labelInput) labelInput.value = "";
        await fetchTempLinks();
        const url = tempUrlFor(data.link.token);
        const copied = await copyToClipboard(url);
        showToast(copied ? "临时订阅链接已生成并复制" : "临时订阅链接已生成");
      }
    } catch {
      showToast("网络错误，生成失败");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "生成并复制";
      }
    }
  });

  // Temp list actions
  optById("tempLinkList")?.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const token = btn.dataset.token || "";
    if (!token) return;

    if (act === "copy") {
      const ok = await copyToClipboard(tempUrlFor(token));
      showToast(ok ? "临时订阅链接已复制" : "复制失败");
    } else if (act === "revoke") {
      const resp = await fetch("/api/sub-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, revoked: true }),
      });
      if (resp.ok) {
        showToast("已吊销该临时链接");
        await fetchTempLinks();
      }
    } else if (act === "delete") {
      const resp = await fetch(`/api/sub-links?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (resp.ok) {
        showToast("已删除该临时链接");
        await fetchTempLinks();
      }
    }
  });

  // Bind modal
  optById("btnOpenBindModal")?.addEventListener("click", openBindModal);
  optById("btnCloseBindModal")?.addEventListener("click", closeBindModal);
  optById("btnCancelBind")?.addEventListener("click", closeBindModal);
  optById("bindModal")?.addEventListener("click", (e) => {
    if (e.target === optById("bindModal")) closeBindModal();
  });

  optById<HTMLFormElement>("bindForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = optById<HTMLButtonElement>("btnSaveBind");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "保存中...";
    }

    try {
      const body =
        state.currentAirport === "djjc"
          ? {
              type: "djjc",
              action: "set_djjc_token",
              token: (optById<HTMLInputElement>("bindDjjcToken")?.value || "").trim(),
            }
          : {
              type: "vpn07",
              action: "set_credentials",
              email: (optById<HTMLInputElement>("bindVpnEmail")?.value || "").trim(),
              vpn_password: optById<HTMLInputElement>("bindVpnPwd")?.value || "",
            };

      const resp = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json()) as { success?: boolean; message?: string };
      if (!resp.ok || !data.success) {
        showToast(data.message || "保存失败");
      } else {
        closeBindModal();
        showToast("凭据已保存并同步");
        await fetchSubscription(state.currentAirport, true);
      }
    } catch {
      showToast("网络错误，保存失败");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "保存并同步";
      }
    }
  });
}

bindEvents();
void Promise.all([fetchSubscription(state.currentAirport, false), fetchTempLinks()]);
