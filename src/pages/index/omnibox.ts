import { requestJson } from "@/core/api";
import { escapeHtml } from "@/core/dom";
import { filterNavItems } from "@/core/nav-config";
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

export function initGreetingTitle(): void {
  const greetingEl = document.getElementById("greetingTitle");
  if (!greetingEl) return;

  const hour = new Date().getHours();
  let prefix = "你好";
  if (hour >= 5 && hour < 12) {
    prefix = "早安";
  } else if (hour >= 12 && hour < 18) {
    prefix = "午安";
  } else {
    prefix = "晚安";
  }
  greetingEl.textContent = `${prefix}，岑靖`;
}

export function initHomeOmnibox(): void {
  const form = document.getElementById("omniboxForm") as HTMLFormElement | null;
  const input = document.getElementById("omniboxInput") as HTMLInputElement | null;
  const clearBtn = document.getElementById("omniboxClearBtn") as HTMLButtonElement | null;
  const resultsEl = document.getElementById("omniboxResults");

  if (!input || !resultsEl) return;

  let debounceTimer: number | undefined;
  let requestSeq = 0;

  function hideResults(): void {
    if (!resultsEl) return;
    resultsEl.classList.remove("open");
    resultsEl.innerHTML = "";
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
    const isEnglishQuery = !isSlashCommand && /^[a-zA-Z\s-]{2,36}$/.test(raw);
    const pageMatchesHtml = renderPageMatches(raw);

    if (!isEnglishQuery) {
      if (pageMatchesHtml) {
        resultsEl.innerHTML = pageMatchesHtml;
        resultsEl.classList.add("open");
      } else {
        // Might be Chinese meaning lookup in vocab
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
      ${pageMatchesHtml}
    `;
    resultsEl.classList.add("open");

    const words = await queryVocabWords(raw);
    if (seq !== requestSeq) return;

    resultsEl.innerHTML = `${renderVocabCards(raw, words)}${pageMatchesHtml}`;
    resultsEl.classList.add("open");
  }

  input.addEventListener("input", () => {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      void handleInput();
    }, 180);
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

    const firstPage = filterNavItems(raw).find((item) => item.id !== "index");
    if (raw.startsWith("/") && firstPage) {
      window.location.href = firstPage.href;
      return;
    }

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
