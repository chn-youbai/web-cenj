import { requestJson } from "@/core/api";
import { escapeHtml } from "@/core/dom";
import { filterNavItems, matchSlashCommands } from "@/core/nav-config";

interface VocabHit {
  word: string;
  phonetic?: string;
  meaning?: string;
  zh?: string;
  pos?: string;
}

export interface SunTimes {
  sunriseMinutes: number;
  sunsetMinutes: number;
}

export function getApproxSunTimes(date = new Date(), latDeg = 31.2): SunTimes {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);

  const rad = Math.PI / 180;
  const declination = 23.44 * Math.sin(rad * ((360 / 365) * (dayOfYear - 81)));
  const cosHourAngle = Math.max(
    -1,
    Math.min(1, -Math.tan(rad * latDeg) * Math.tan(rad * declination)),
  );
  const hourAngleDeg = Math.acos(cosHourAngle) / rad;
  const daylightMinutes = (hourAngleDeg * 2 * 60) / 15;
  const solarNoonMinutes = 12 * 60;

  return {
    sunriseMinutes: Math.round(solarNoonMinutes - daylightMinutes / 2),
    sunsetMinutes: Math.round(solarNoonMinutes + daylightMinutes / 2),
  };
}

export function getTimeGreeting(date = new Date(), latDeg = 31.2): string {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const { sunriseMinutes, sunsetMinutes } = getApproxSunTimes(date, latDeg);

  if (minutes >= sunriseMinutes && minutes < 8 * 60) {
    return "早安";
  }
  if (minutes >= 8 * 60 && minutes < 12 * 60) {
    return "早上好";
  }
  if (minutes >= 12 * 60 && minutes < 14 * 60) {
    return "中午好";
  }
  if (minutes >= 14 * 60 && minutes < sunsetMinutes) {
    return "下午好";
  }
  if (minutes >= sunsetMinutes && minutes < 22 * 60) {
    return "晚上好";
  }
  return "晚安";
}

export function initGreetingTitle(): void {
  const titleEl = document.getElementById("greetingTitle");
  if (!titleEl) return;
  titleEl.textContent = getTimeGreeting();
}

let cachedFallbackVocab: VocabHit[] | null = null;

async function queryVocab(q: string): Promise<VocabHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  try {
    const data = await requestJson<{ results?: VocabHit[]; items?: VocabHit[] } | VocabHit[]>(
      `/api/vocab?q=${encodeURIComponent(trimmed)}`,
    );
    if (Array.isArray(data)) return data.slice(0, 6);
    if (Array.isArray(data.results)) return data.results.slice(0, 6);
    if (Array.isArray(data.items)) return data.items.slice(0, 6);
  } catch {
    // Fallback to static vocab dataset
  }

  try {
    if (!cachedFallbackVocab) {
      const staticData = await requestJson<VocabHit[] | { words?: VocabHit[] }>(
        "./data/vocab.json",
      );
      cachedFallbackVocab = Array.isArray(staticData)
        ? staticData
        : Array.isArray(staticData.words)
          ? staticData.words
          : [];
    }
    const lower = trimmed.toLowerCase();
    const hits: VocabHit[] = [];
    for (const item of cachedFallbackVocab) {
      const wordMatch = item.word?.toLowerCase().includes(lower);
      const meaningText = item.meaning || item.zh || "";
      const meaningMatch = meaningText.toLowerCase().includes(lower);
      if (wordMatch || meaningMatch) {
        hits.push(item);
        if (hits.length >= 6) break;
      }
    }
    return hits;
  } catch {
    return [];
  }
}

export function initHomeOmnibox(): void {
  const form = document.getElementById("omniboxForm") as HTMLFormElement | null;
  const input = document.getElementById("omniboxInput") as HTMLInputElement | null;
  const resultsEl = document.getElementById("omniboxResults");
  const clearBtn = document.getElementById("omniboxClearBtn");
  if (!form || !input || !resultsEl) return;

  let activeTimer: number | null = null;
  let lastRequestId = 0;

  const setResultsVisible = (visible: boolean): void => {
    resultsEl.hidden = !visible;
    if (clearBtn) {
      clearBtn.hidden = input.value.trim().length === 0;
    }
  };

  const renderEmpty = (): void => {
    resultsEl.innerHTML = "";
    setResultsVisible(false);
  };

  const renderResults = async (rawQuery: string): Promise<void> => {
    const query = rawQuery.trim();
    if (!query) {
      renderEmpty();
      return;
    }

    const requestId = ++lastRequestId;
    const slashMatches = matchSlashCommands(query);
    const navMatches = query.startsWith("/") ? [] : filterNavItems(query);
    const shouldQueryVocab = !query.startsWith("/") && query.length >= 1;
    const vocabHits = shouldQueryVocab ? await queryVocab(query) : [];

    if (requestId !== lastRequestId) return;

    const sections: string[] = [];

    if (slashMatches.length > 0) {
      const itemsHtml = slashMatches
        .map(
          (cmd) => `
          <a class="omni-page-row" href="${escapeHtml(cmd.href)}" data-omni-link>
            <span class="omni-page-icon">${cmd.iconSvg}</span>
            <span class="omni-page-meta">
              <span class="omni-page-title">${escapeHtml(cmd.command)} · ${escapeHtml(cmd.label)}</span>
              <span class="omni-page-sub">${escapeHtml(cmd.subtitle)}</span>
            </span>
            <span class="omni-page-arrow">↵</span>
          </a>`,
        )
        .join("");
      sections.push(
        `<div class="omni-group"><div class="omni-group-label">快捷指令</div>${itemsHtml}</div>`,
      );
    }

    if (vocabHits.length > 0) {
      const vocabHtml = vocabHits
        .map((item) => {
          const meaning = item.meaning || item.zh || "";
          const phonetic = item.phonetic
            ? `<span class="omni-vocab-phonetic">${escapeHtml(item.phonetic)}</span>`
            : "";
          const pos = item.pos ? `<span class="omni-vocab-pos">${escapeHtml(item.pos)}</span>` : "";
          return `
          <a class="omni-vocab-card" href="./vocab.html?q=${encodeURIComponent(item.word)}" data-omni-link>
            <div class="omni-vocab-head">
              <span class="omni-vocab-word">${escapeHtml(item.word)}</span>
              ${phonetic}
              ${pos}
            </div>
            <div class="omni-vocab-meaning">${escapeHtml(meaning)}</div>
          </a>`;
        })
        .join("");
      sections.push(
        `<div class="omni-group"><div class="omni-group-label">词库速查</div>${vocabHtml}</div>`,
      );
    }

    if (navMatches.length > 0) {
      const navHtml = navMatches
        .slice(0, 5)
        .map(
          (item) => `
          <a class="omni-page-row" href="${escapeHtml(item.href)}" data-omni-link>
            <span class="omni-page-icon">${item.iconSvg}</span>
            <span class="omni-page-meta">
              <span class="omni-page-title">${escapeHtml(item.label)}</span>
              <span class="omni-page-sub">${escapeHtml(item.subtitle)}</span>
            </span>
            <span class="omni-page-arrow">→</span>
          </a>`,
        )
        .join("");
      sections.push(
        `<div class="omni-group"><div class="omni-group-label">页面直达</div>${navHtml}</div>`,
      );
    }

    if (sections.length === 0) {
      resultsEl.innerHTML = `<div class="omni-empty">未找到匹配结果，可输入英文单词、页面名称，或使用 <code>/bill</code> · <code>/msg</code> · <code>/clash</code></div>`;
    } else {
      resultsEl.innerHTML = sections.join("");
    }
    setResultsVisible(true);
  };

  input.addEventListener("input", () => {
    if (clearBtn) {
      clearBtn.hidden = input.value.trim().length === 0;
    }
    if (activeTimer !== null) {
      window.clearTimeout(activeTimer);
    }
    const value = input.value;
    if (!value.trim()) {
      renderEmpty();
      return;
    }
    activeTimer = window.setTimeout(() => {
      void renderResults(value);
    }, 120);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      renderEmpty();
      input.focus();
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;

    const slashMatches = matchSlashCommands(raw);
    if (slashMatches.length > 0 && raw.startsWith("/")) {
      const exact = slashMatches.find((cmd) => cmd.command.toLowerCase() === raw.toLowerCase());
      const target = exact ?? slashMatches[0];
      if (target) {
        window.location.href = target.href;
        return;
      }
    }

    const firstLink = resultsEl.querySelector<HTMLAnchorElement>("a[data-omni-link]");
    if (firstLink) {
      window.location.href = firstLink.href;
      return;
    }

    window.location.href = `./vocab.html?q=${encodeURIComponent(raw)}`;
  });

  const chips = document.querySelectorAll<HTMLButtonElement>("[data-omni-chip]");
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const query = chip.dataset.omniChip ?? "";
      input.value = query;
      input.focus();
      void renderResults(query);
    });
  }
}
