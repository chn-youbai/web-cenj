import type { ClickStatsResponse } from "@shared/types";

const LOCAL_API = "/api/click";
const FALLBACK_API_BASE = "https://countapi.mileshilliard.com/api/v1";
const FALLBACK_KEY = "web_cenj_shared_clicks_v1";
const PARTICLE_ICONS = ["✦", "✧", "♥", "✶", "·"];

export function initLikesWidget(): void {
  const countEl = document.getElementById("likeCount");
  const likeBtn = document.getElementById("likeBtn");
  if (!countEl || !likeBtn) return;

  let currentVal = 0;
  let pendingClicks = 0;
  let syncTimer: number | undefined;
  let isSyncing = false;

  const formatCount = (num: number): string => Number(num).toLocaleString();

  async function initCount(): Promise<void> {
    if (!countEl) return;
    try {
      const res = await fetch(`${LOCAL_API}?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as ClickStatsResponse;
        if (typeof data.value === "number") {
          currentVal = data.value;
          countEl.textContent = formatCount(currentVal);
          return;
        }
      }
    } catch {
      // fall through to public counter
    }

    try {
      const res = await fetch(`${FALLBACK_API_BASE}/get/${FALLBACK_KEY}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { value?: number };
        currentVal = data.value || 0;
        countEl.textContent = formatCount(currentVal);
      } else {
        countEl.textContent = "0";
      }
    } catch {
      countEl.textContent = currentVal ? formatCount(currentVal) : "0";
    }
  }

  async function flushClicks(): Promise<void> {
    if (pendingClicks <= 0 || isSyncing || !countEl) return;
    const countToSend = pendingClicks;
    pendingClicks = 0;
    isSyncing = true;

    try {
      const res = await fetch(LOCAL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: countToSend }),
        keepalive: true,
      });
      if (res.ok) {
        const data = (await res.json()) as ClickStatsResponse;
        if (typeof data.value === "number") {
          currentVal = Math.max(currentVal, data.value + pendingClicks);
          countEl.textContent = formatCount(currentVal);
        }
      } else {
        pendingClicks += countToSend;
      }
    } catch {
      pendingClicks += countToSend;
    } finally {
      isSyncing = false;
      if (pendingClicks > 0) {
        syncTimer = window.setTimeout(() => {
          void flushClicks();
        }, 400);
      }
    }
  }

  function flushOnLeave(): void {
    if (pendingClicks <= 0) return;
    const payload = JSON.stringify({ amount: pendingClicks });
    pendingClicks = 0;
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(LOCAL_API, blob);
    } else {
      void fetch(LOCAL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  }

  function spawnParticle(e?: MouseEvent): void {
    if (!likeBtn) return;
    const rect = likeBtn.getBoundingClientRect();
    const p = document.createElement("span");
    p.className = "float-particle";
    const randomEmoji = PARTICLE_ICONS[Math.floor(Math.random() * PARTICLE_ICONS.length)] || "✨";
    p.textContent = randomEmoji;
    p.style.setProperty("--tx", `${Math.random() * 70 - 35}px`);
    p.style.setProperty("--rot", `${Math.random() * 60 - 30}deg`);
    const clickX = e && e.clientX > 0 ? e.clientX - rect.left : rect.width / 2;
    p.style.left = `${clickX}px`;
    p.style.top = "10px";
    likeBtn.appendChild(p);
    window.setTimeout(() => p.remove(), 850);
  }

  likeBtn.addEventListener("click", (e) => {
    currentVal += 1;
    pendingClicks += 1;
    countEl.textContent = formatCount(currentVal);

    likeBtn.classList.remove("burst");
    void likeBtn.offsetWidth;
    likeBtn.classList.add("burst");

    spawnParticle(e);

    if (syncTimer !== undefined) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      void flushClicks();
    }, 350);
  });

  window.addEventListener("pagehide", flushOnLeave);
  window.addEventListener("beforeunload", flushOnLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnLeave();
  });

  void initCount();
}
