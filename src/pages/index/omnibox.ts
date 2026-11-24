import { requestJson } from "@/core/api";
import { escapeHtml } from "@/core/dom";
import { filterNavItems, getNavSlashCommand, matchSlashCommands } from "@/core/nav-config";
import type { VocabApiResponse, VocabCompactWord } from "@shared/types";

let localWordsCache: VocabCompactWord[] | null = null;
let loadingLocalPromise: Promise<VocabCompactWord[]> | null = null;

async function loadLocalFallbackWords(): Promise<VocabCompactWord[]> {
  if (localWordsCache) return localWordsCache;
  if (loadingLocalPromise) return loadingLocalPromise;

  loadingLocalPromise = fetch("./data/vocab.json")
    .then((r) => (r.ok ? (r.json() as Promise<VocabApiResponse>) : { words: [] }))
    .then((data) => {
      localWordsCache = Array.isArray(data.words) ? data.words : [];
      return localWordsCache;
    })
    .catch(() => []);

  return loadingLocalPromise;
}

async function queryVocabWords(query: string): Promise<VocabCompactWord[]> {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  try {
    const resp = await requestJson<VocabApiResponse>(`/api/vocab?q=${encodeURIComponent(clean)}`);
    if (Array.isArray(resp.words) && resp.words.length > 0) {
      return resp.words.slice(0, 6);
    }
  } catch {
    // Fallback to static data/vocab.json
  }

  const all = await loadLocalFallbackWords();
  const exact: VocabCompactWord[] = [];
  const partial: VocabCompactWord[] = [];

  for (const item of all) {
    const wLower = (item.w || "").toLowerCase();
    const mLower = (item.m || "").toLowerCase();
    if (wLower === clean) {
      exact.push(item);
    } else if (wLower.startsWith(clean) || mLower.includes(clean)) {
      partial.push(item);
    }
    if (exact.length + partial.length >= 12) break;
  }

  return [...exact, ...partial].slice(0, 6);
}

export function getApproxSunTimes(
  date = new Date(),
  latDeg = 30,
): { sunrise: number; sunset: number } {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const decl = 0.4093 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latRad = (latDeg * Math.PI) / 180;
  const cosH = Math.max(-0.99, Math.min(0.99, -Math.tan(latRad) * Math.tan(decl)));
  const halfDayHours = (Math.acos(cosH) * 180) / Math.PI / 15;
  return {
    sunrise: 12 - halfDayHours,
    sunset: 12 + halfDayHours,
  };
}

export function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours() + date.getMinutes() / 60;
  const { sunrise, sunset } = getApproxSunTimes(date);

  if (hour >= sunrise && hour < 8) return "早安";
  if (hour >= 8 && hour < 12) return "早上好";
  if (hour >= 12 && hour < 14) return "中午好";
  if (hour >= 14 && hour < sunset) return "下午好";
  if (hour >= sunset && hour < 22) return "晚上好";
  return "晚安";
}

export function initGreetingTitle(): void {
  const greetingEl = document.getElementById("greetingTitle");
  if (!greetingEl) return;
  greetingEl.textContent = getTimeGreeting(new Date());
}

export function initHomeOmnibox(): void {
  const form = document.getElementById("omniboxForm") as HTMLFormElement | null;
  const input = document.getElementById("omniboxInput") as HTMLInputElement | null;
  const clearBtn = document.getElementById("omniboxClearBtn") as HTMLButtonElement | null;
  const resultsEl = document.getElementById("omniboxResults");

  if (!input || !resultsEl) return;

  let debounceTimer: number | undefined;
  let requestSeq = 0;
  let slashCandidates: Array<{ command: string; href: string }> = [];
  let activeSlashIndex = 0;

  function hideResults(): void {
    if (!resultsEl) return;
    resultsEl.classList.remove("open");
    resultsEl.innerHTML = "";
    slashCandidates = [];
    activeSlashIndex = 0;
  }

  function updateSlashHighlight(): void {
    if (!resultsEl) return;
    const rows = resultsEl.querySelectorAll<HTMLElement>("[data-slash-idx]");
    for (const row of rows) {
      const idx = Number.parseInt(row.dataset.slashIdx ?? "0", 10);
      const isActive = idx === activeSlashIndex;
      row.classList.toggle("is-active", isActive);
      if (isActive && typeof row.scrollIntoView === "function") {
        row.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function renderSlashMatches(rawQuery: string): string {
    const exactHidden = matchSlashCommands(rawQuery);
    const publicPages = rawQuery.trim().startsWith("/")
      ? filterNavItems(rawQuery).filter((item) => item.id !== "index")
      : [];

    const entries = [
      ...exactHidden.map((cmd) => ({
        command: cmd.command,
        label: cmd.label,
        subtitle: cmd.subtitle,
        href: cmd.href,
        iconSvg: cmd.iconSvg,
        tag: "直达",
      })),
      ...publicPages.map((item) => ({
        command: getNavSlashCommand(item),
        label: item.label,
        subtitle: item.subtitle,
        href: item.href,
        iconSvg: item.iconSvg,
        tag: item.shortLabel,
      })),
    ];

    slashCandidates = entries.map((e) => ({ command: e.command, href: e.href }));
    activeSlashIndex = 0;

    if (entries.length === 0) return "";

    return `
      <div class="omni-section">
        <div class="omni-section-header">快捷跳转指令（↑↓ 选择 · Tab 补全 · Enter 跳转）</div>
        <div class="omni-page-list">
          ${entries
            .map(
              (entry, idx) => `
            <a href="${escapeHtml(entry.href)}" class="omni-page-row${idx === activeSlashIndex ? " is-active" : ""}" data-slash-idx="${idx}">
              <span class="omni-page-icon">${entry.iconSvg}</span>
              <span class="omni-page-body">
                <span class="omni-page-title">${escapeHtml(entry.command)} · ${escapeHtml(entry.label)}</span>
                <span class="omni-page-sub">${escapeHtml(entry.subtitle)}</span>
              </span>
              <span class="omni-page-tag">${escapeHtml(entry.tag)}</span>
            </a>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderPageMatches(rawQuery: string): string {
    const matches = filterNavItems(rawQuery).filter((item) => item.id !== "index");
    if (matches.length === 0) return "";

    return `
      <div class="omni-section">
        <div class="omni-section-header">功能与页面直达</div>
        <div class="omni-page-list">
          ${matches
            .slice(0, 5)
            .map(
              (item) => `
            <a href="${item.href}" class="omni-page-row">
              <span class="omni-page-icon">${item.iconSvg}</span>
              <span class="omni-page-body">
                <span class="omni-page-title">${escapeHtml(item.label)}</span>
                <span class="omni-page-sub">${escapeHtml(item.subtitle)}</span>
              </span>
              <span class="omni-page-tag">${item.requiresAuth ? "受保护" : escapeHtml(item.shortLabel)}</span>
            </a>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderVocabCards(query: string, words: VocabCompactWord[]): string {
    if (words.length === 0) {
      return `
        <div class="omni-section">
          <div class="omni-empty">
            未在教材/四六级词库中找到 “<strong>${escapeHtml(query)}</strong>”
            <a href="./vocab.html?q=${encodeURIComponent(query)}" class="omni-more-link">前往查词系统深度检索 →</a>
          </div>
        </div>
      `;
    }

    return `
      <div class="omni-section">
        <div class="omni-section-header">
          <span>即时词典释义 (${words.length})</span>
          <a href="./vocab.html?q=${encodeURIComponent(query)}" class="omni-more-link">在查词页展开完整词根与衍生 →</a>
        </div>
        <div class="omni-vocab-list">
          ${words
            .map(
              (w) => `
            <a href="./vocab.html?q=${encodeURIComponent(w.w)}" class="omni-vocab-card">
              <div class="omni-vocab-top">
                <strong class="omni-vocab-word">${escapeHtml(w.w)}</strong>
                ${w.p ? `<span class="omni-vocab-pos">${escapeHtml(w.p)}</span>` : ""}
                <span class="omni-vocab-book">${escapeHtml(w.b)}${w.u ? ` · ${escapeHtml(w.u)}` : ""}</span>
              </div>
              <div class="omni-vocab-meaning">${escapeHtml(w.m)}</div>
            </a>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  async function handleInput(): Promise<void> {
    if (!input || !resultsEl) return;
    const raw = input.value.trim();
    if (clearBtn) {
      clearBtn.style.display = raw ? "inline-flex" : "none";
    }

    if (!raw) {
      hideResults();
      return;
    }

    const isSlashCommand = raw.startsWith("/");
    const slashHtml = renderSlashMatches(raw);
    const pageMatchesHtml = isSlashCommand ? "" : renderPageMatches(raw);
    const isEnglishQuery = !isSlashCommand && /^[a-zA-Z\s-]{2,36}$/.test(raw);

    if (!isEnglishQuery) {
      const combined = `${slashHtml}${pageMatchesHtml}`;
      if (combined) {
        resultsEl.innerHTML = combined;
        resultsEl.classList.add("open");
      } else if (isSlashCommand) {
        resultsEl.innerHTML = `<div class="omni-section"><div class="omni-empty">未匹配到对应指令或页面</div></div>`;
        resultsEl.classList.add("open");
      } else {
        const seq = ++requestSeq;
        resultsEl.innerHTML = `<div class="omni-loading"><span class="ui-spinner"></span><span>正在检索词库 “${escapeHtml(raw)}”...</span></div>`;
        resultsEl.classList.add("open");
        const words = await queryVocabWords(raw);
        if (seq !== requestSeq) return;
        resultsEl.innerHTML = renderVocabCards(raw, words);
      }
      return;
    }

    const seq = ++requestSeq;
    resultsEl.innerHTML = `
      <div class="omni-loading">
        <span class="ui-spinner"></span>
        <span>正在即时查词 “${escapeHtml(raw)}”...</span>
      </div>
      ${slashHtml}${pageMatchesHtml}
    `;
    resultsEl.classList.add("open");

    const words = await queryVocabWords(raw);
    if (seq !== requestSeq) return;

    resultsEl.innerHTML = `${renderVocabCards(raw, words)}${slashHtml}${pageMatchesHtml}`;
    resultsEl.classList.add("open");
  }

  input.addEventListener("input", () => {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    if (input.value.trim().startsWith("/")) {
      void handleInput();
      return;
    }
    debounceTimer = window.setTimeout(() => {
      void handleInput();
    }, 180);
  });

  input.addEventListener("keydown", (e) => {
    const raw = input.value.trim();
    if (!raw.startsWith("/") || slashCandidates.length === 0) {
      if (e.key === "Escape") {
        hideResults();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeSlashIndex = (activeSlashIndex + 1) % slashCandidates.length;
      updateSlashHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeSlashIndex = (activeSlashIndex - 1 + slashCandidates.length) % slashCandidates.length;
      updateSlashHighlight();
    } else if (e.key === "Tab") {
      const selected = slashCandidates[activeSlashIndex];
      if (selected) {
        e.preventDefault();
        input.value = selected.command;
        input.setSelectionRange(selected.command.length, selected.command.length);
        void handleInput();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      hideResults();
    }
  });

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    hideResults();
    input.focus();
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;

    if (raw.startsWith("/")) {
      const activeCandidate = slashCandidates[activeSlashIndex];
      if (activeCandidate) {
        window.location.href = activeCandidate.href;
        return;
      }
      const slashMatches = matchSlashCommands(raw);
      const exact = slashMatches.find((cmd) => cmd.command.toLowerCase() === raw.toLowerCase());
      const target = exact ?? slashMatches[0];
      if (target) {
        window.location.href = target.href;
        return;
      }
    }

    const firstPage = filterNavItems(raw).find((item) => item.id !== "index");
    if (/^[a-zA-Z\s-]{1,36}$/.test(raw)) {
      window.location.href = `./vocab.html?q=${encodeURIComponent(raw)}`;
      return;
    }

    if (firstPage) {
      window.location.href = firstPage.href;
      return;
    }

    window.location.href = `./vocab.html?q=${encodeURIComponent(raw)}`;
  });

  for (const sampleBtn of document.querySelectorAll<HTMLButtonElement>("[data-omni-sample]")) {
    sampleBtn.addEventListener("click", () => {
      const sample = sampleBtn.dataset.omniSample ?? "";
      input.value = sample;
      input.focus();
      void handleInput();
    });
  }
}
