import { escapeHtml, optById } from "@/core/dom";
import { calculateMasteryStats, filterWordList, getFontWeightLabel, getStatusInfo } from "./engine";
import { GAOKAO_PHRASES_DICT } from "./phrases-dict";
import { LAST_SYNC_STORAGE, getOrCreateSyncKey } from "./sync";
import type { ReciteState, ReciteWord } from "./types";

export interface ReciteModalOptions {
  title: string;
  body: string;
  showInput?: boolean;
  inputValue?: string;
  onConfirm: (() => void) | null;
}

let toastTimer: number | null = null;
let modalConfirmCallback: (() => void) | null = null;

export function showToast(msg: string): void {
  const toast = optById("appToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove("opacity-0");
  toast.classList.add("opacity-100");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("opacity-100");
    toast.classList.add("opacity-0");
  }, 1800);
}

export function openModal(opts: ReciteModalOptions): void {
  const titleEl = optById("modalTitle");
  const bodyEl = optById("modalBody");
  const input = optById<HTMLInputElement>("modalInput");
  const modal = optById("appModal");
  if (titleEl) titleEl.textContent = opts.title;
  if (bodyEl) bodyEl.innerHTML = opts.body;
  if (input) {
    if (opts.showInput) {
      input.classList.remove("hidden");
      input.value = opts.inputValue ?? "";
      window.setTimeout(() => input.focus(), 50);
    } else {
      input.classList.add("hidden");
    }
  }
  modalConfirmCallback = opts.onConfirm;
  modal?.classList.remove("hidden");
}

export function closeModal(): void {
  optById("appModal")?.classList.add("hidden");
  modalConfirmCallback = null;
}

export function isModalOpen(): boolean {
  const modal = optById("appModal");
  return Boolean(modal && !modal.classList.contains("hidden"));
}

export function triggerModalConfirm(): void {
  if (modalConfirmCallback) modalConfirmCallback();
  else closeModal();
}

export function populateGroupSelector(currentGroup: string): void {
  const sel = optById<HTMLSelectElement>("selectGroup");
  if (!sel) return;
  let html = `
    <option value="all">📚 全部词汇 (1-2050)</option>
    <option value="tier_high">🔥 超高频核心词 (考频≥15 · 304词)</option>
    <option value="tier_mid">⭐ 中高频常考词 (考频5-14 · 522词)</option>
    <option value="tier_low">📌 基础必备词 (考频1-4 · 859词)</option>
    <option value="tier_zero">🆕 近年新增认知词 (考频0 · 365词)</option>
  `;
  for (let g = 1; g <= 41; g += 1) {
    const start = (g - 1) * 50 + 1;
    const end = Math.min(g * 50, 2050);
    html += `<option value="g_${g}">第 ${g} 组 (${start}-${end})</option>`;
  }
  sel.innerHTML = html;
  sel.value = currentGroup;
}

export function updateSyncUI(): void {
  const key = getOrCreateSyncKey();
  const headerKeyEl = optById("headerSyncKey");
  if (headerKeyEl) headerKeyEl.textContent = key;
  const displayEl = optById("displaySyncKey");
  if (displayEl) displayEl.textContent = key;

  const customInput = optById<HTMLInputElement>("inputCustomSyncKey");
  if (customInput && !customInput.value) {
    customInput.placeholder = `当前同步码: ${key} (可输入新同步码)`;
  }

  let lastSyncStr: string | null = null;
  try {
    lastSyncStr = localStorage.getItem(LAST_SYNC_STORAGE);
  } catch {
    lastSyncStr = null;
  }

  const timeEl = optById("lastSyncTimeText");
  if (timeEl) {
    timeEl.textContent = lastSyncStr ? `上次同步：${lastSyncStr}` : "上次同步：尚未进行云端同步";
  }
  const badge = optById("syncStatusBadge");
  if (badge) {
    badge.textContent = `云端就绪 · ${key}`;
  }
}

export function renderHeaderAndMiniStats(
  state: ReciteState,
  vocabList: ReciteWord[],
  filteredDeck: ReciteWord[],
): void {
  const stats = calculateMasteryStats(vocabList, state.marks);
  const progressSub = optById("headerProgressSub");
  if (progressSub) {
    progressSub.textContent = `已刷 ${stats.marked} / 2050 词 · 熟词率 ${stats.masteryPct}%`;
  }

  const groupSelect = optById<HTMLSelectElement>("selectGroup");
  const selectedText = groupSelect?.options[groupSelect.selectedIndex]?.text || "全词库";
  const groupBadge = optById("headerGroupBadge");
  if (groupBadge) groupBadge.textContent = selectedText.split(" ")[1] || "全词库";

  const miniPool = optById("miniPoolCount");
  if (miniPool) miniPool.textContent = String(filteredDeck.length);
  const miniKnown = optById("miniKnownCount");
  if (miniKnown) miniKnown.textContent = String(stats.known);
  const miniFuzzy = optById("miniFuzzyCount");
  if (miniFuzzy) miniFuzzy.textContent = String(stats.fuzzy);
  const miniUnknown = optById("miniUnknownCount");
  if (miniUnknown) miniUnknown.textContent = String(stats.unknown);

  const accentLabel = optById("accentLabel");
  if (accentLabel) accentLabel.textContent = state.accent === "en-US" ? "美音" : "英音";
  const themeIcon = optById("themeIcon");
  if (themeIcon) themeIcon.textContent = state.darkMode ? "☀️" : "🌙";
  const shuffleIcon = optById("shuffleIcon");
  if (shuffleIcon) shuffleIcon.textContent = state.isShuffled ? "🔀" : "➡️";
  const shuffleLabel = optById("shuffleLabel");
  if (shuffleLabel) shuffleLabel.textContent = state.isShuffled ? "随机乱序" : "顺序播放";
  const autoAudioIcon = optById("autoAudioIcon");
  if (autoAudioIcon) autoAudioIcon.textContent = state.autoSpeak ? "🔔" : "🔕";
  const autoAudioLabel = optById("autoAudioLabel");
  if (autoAudioLabel)
    autoAudioLabel.textContent = state.autoSpeak ? "切词发音: 开" : "切词发音: 关";
  const drawerAccentLabel = optById("drawerAccentLabel");
  if (drawerAccentLabel) {
    drawerAccentLabel.textContent =
      state.accent === "en-US" ? "口音: 美音 (US)" : "口音: 英式 (UK)";
  }
  const drawerSpeedLabel = optById("drawerSpeedLabel");
  if (drawerSpeedLabel) {
    drawerSpeedLabel.textContent =
      state.speechRate === 0.7 ? "语速: 慢速 (0.7x)" : "语速: 正常 (1.0x)";
  }
  const drawerSpeedIcon = optById("drawerSpeedIcon");
  if (drawerSpeedIcon) drawerSpeedIcon.textContent = state.speechRate === 0.7 ? "🐢" : "⚡";

  const sliderEn = optById<HTMLInputElement>("sliderEnFontSize");
  const valEn = optById("valEnFontSize");
  if (sliderEn && valEn) {
    sliderEn.value = String(state.enFontSize || 58);
    valEn.textContent = `${state.enFontSize || 58}px`;
  }
  const sliderCn = optById<HTMLInputElement>("sliderCnFontSize");
  const valCn = optById("valCnFontSize");
  if (sliderCn && valCn) {
    sliderCn.value = String(state.cnFontSize || 34);
    valCn.textContent = `${state.cnFontSize || 34}px`;
  }
  const sliderEnWeight = optById<HTMLInputElement>("sliderEnFontWeight");
  const valEnWeight = optById("valEnFontWeight");
  if (sliderEnWeight && valEnWeight) {
    sliderEnWeight.value = String(state.enFontWeight || 700);
    valEnWeight.textContent = getFontWeightLabel(state.enFontWeight || 700);
  }
  const sliderCnWeight = optById<HTMLInputElement>("sliderCnFontWeight");
  const valCnWeight = optById("valCnFontWeight");
  if (sliderCnWeight && valCnWeight) {
    sliderCnWeight.value = String(state.cnFontWeight || 700);
    valCnWeight.textContent = getFontWeightLabel(state.cnFontWeight || 700);
  }
}

export function renderStudyCard(state: ReciteState, filteredDeck: ReciteWord[]): void {
  const cardWordText = optById("cardWordText");
  const cardMeaningText = optById("cardMeaningText");
  const cardWordId = optById("cardWordId");
  const cardFreqBadge = optById("cardFreqBadge");
  const cardStatusBadge = optById("cardStatusBadge");
  const cardFormsSection = optById("cardFormsSection");
  const deckPositionText = optById("deckPositionText");
  const deckProgressBar = optById("deckProgressBar");
  const maskHintText = optById("maskHintText");
  const memoBar = optById("memoDisplayBar");
  const memoText = optById("memoDisplayText");

  if (filteredDeck.length === 0) {
    if (cardWordId) cardWordId.textContent = "#-";
    if (cardFreqBadge) cardFreqBadge.textContent = "🎉 筛选范围内无单词";
    if (cardStatusBadge) {
      cardStatusBadge.textContent = "已完成";
      cardStatusBadge.className =
        "px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600";
    }
    if (cardWordText) {
      cardWordText.textContent = "当前列表已刷完！";
      cardWordText.className = "text-2xl font-extrabold text-teal-600 dark:text-teal-400";
      cardWordText.style.fontSize = "";
      cardWordText.style.fontWeight = "";
    }
    if (cardMeaningText) {
      cardMeaningText.textContent =
        "你可以切换上方的「分组」或「状态筛选」，或者前往「统计导出」查看成果并下载 CSV。";
      cardMeaningText.className = "text-sm sub-text leading-relaxed";
      cardMeaningText.style.fontSize = "";
      cardMeaningText.style.fontWeight = "";
    }
    cardFormsSection?.classList.add("hidden");
    optById("cardExamExpandedSection")?.classList.add("hidden");
    memoBar?.classList.add("hidden");
    if (deckPositionText) deckPositionText.textContent = "0 / 0 词";
    if (deckProgressBar) deckProgressBar.style.width = "100%";
    return;
  }

  const item = filteredDeck[state.currentIndex];
  if (!item) return;

  const mark = state.marks[item.id];
  const statusInfo = getStatusInfo(mark);

  if (cardWordId) cardWordId.textContent = `#${item.id}`;
  if (cardFreqBadge) {
    cardFreqBadge.textContent =
      item.freq > 0 ? `🔥 真题考频 ${item.freq}次` : "🆕 新增核心词 (0频)";
  }
  if (cardStatusBadge) {
    cardStatusBadge.textContent = statusInfo.label;
    cardStatusBadge.className = `px-2.5 py-0.5 rounded-full text-[10px] font-semibold shadow-2xs ${statusInfo.cls}`;
  }

  const hideCn = state.maskMode === "hide_cn" && !state.cardRevealed;
  const hideEn = state.maskMode === "hide_en" && !state.cardRevealed;

  if (cardWordText) {
    cardWordText.textContent = item.word;
    cardWordText.className = `leading-tight tracking-tight select-none sm:select-text break-words max-w-full px-1 cursor-pointer transition hover:opacity-90 active:scale-95 ${hideEn ? "meaning-masked" : "meaning-revealed"}`;
    cardWordText.style.fontSize = `${state.enFontSize || 58}px`;
    cardWordText.style.fontWeight = String(state.enFontWeight || 700);
    cardWordText.style.lineHeight = "1.1";
    cardWordText.style.wordBreak = "break-word";
  }

  if (cardMeaningText) {
    cardMeaningText.textContent = item.meaning;
    cardMeaningText.className = `leading-tight select-text break-words max-w-full ${hideCn ? "meaning-masked" : "meaning-revealed"}`;
    cardMeaningText.style.fontSize = `${state.cnFontSize || 34}px`;
    cardMeaningText.style.fontWeight = String(state.cnFontWeight || 700);
    cardMeaningText.style.lineHeight = "1.2";
    cardMeaningText.style.wordBreak = "break-word";
  }

  if (hideCn || hideEn) {
    maskHintText?.classList.remove("hidden");
  } else {
    maskHintText?.classList.add("hidden");
  }

  const examExpandedSection = optById("cardExamExpandedSection");
  const formsContainer = optById("cardFormsContainer");
  const formsList = optById("cardFormsList");
  const phrasesContainer = optById("cardPhrasesContainer");
  const phrasesList = optById("cardPhrasesList");

  let hasForms = false;
  if (item.forms && item.forms.length > 0) {
    hasForms = true;
    formsContainer?.classList.remove("hidden");
    if (formsList) {
      formsList.innerHTML = item.forms
        .map(
          (f) =>
            `<button type="button" data-speak-form="${escapeHtml(f)}" class="form-chip px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-teal-500/20 text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-500 hover:text-white transition">${escapeHtml(f)}</button>`,
        )
        .join("");
    }
  } else {
    formsContainer?.classList.add("hidden");
  }

  let hasPhrases = false;
  const lowerW = (item.word || "").toLowerCase();
  const foundPhrases = GAOKAO_PHRASES_DICT[lowerW];
  if (foundPhrases && foundPhrases.length > 0) {
    hasPhrases = true;
    phrasesContainer?.classList.remove("hidden");
    if (phrasesList) {
      phrasesList.innerHTML = foundPhrases
        .slice(0, 4)
        .map(
          (p) =>
            `<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span><span class="font-medium">${escapeHtml(p)}</span></div>`,
        )
        .join("");
    }
  } else {
    phrasesContainer?.classList.add("hidden");
  }

  if (examExpandedSection) {
    if (hasForms || hasPhrases) examExpandedSection.classList.remove("hidden");
    else examExpandedSection.classList.add("hidden");
  }

  const filterPill = optById("activeFilterPill");
  if (filterPill) {
    if (state.statusFilter !== "all") {
      const filterLabels: Record<string, string> = {
        unmarked: "⚪未标",
        review: "🔥重难点",
        unknown: "🔴不会",
        fuzzy: "🟡模糊",
        known: "🟢熟词",
      };
      filterPill.textContent = filterLabels[state.statusFilter] ?? "筛选中";
      filterPill.classList.remove("hidden");
    } else {
      filterPill.classList.add("hidden");
    }
  }

  const memo = state.memos[item.id];
  if (memo && memoBar && memoText) {
    memoBar.classList.remove("hidden");
    memoText.textContent = `💡 笔记：${memo}`;
  } else {
    memoBar?.classList.add("hidden");
  }

  const pos = state.currentIndex + 1;
  const total = filteredDeck.length;
  if (deckPositionText) deckPositionText.textContent = `当前进度 ${pos} / ${total} 词`;
  if (deckProgressBar) deckProgressBar.style.width = `${((pos / total) * 100).toFixed(1)}%`;
}

export function renderWordList(state: ReciteState, vocabList: ReciteWord[]): void {
  const filtered = filterWordList(vocabList, state.marks, state.listSearch, state.listTab);

  const countEl = optById("listResultCount");
  if (countEl) countEl.textContent = `共 ${filtered.length} 词`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / state.listPageSize));
  if (state.listPage > totalPages) state.listPage = totalPages;

  const start = (state.listPage - 1) * state.listPageSize;
  const pageItems = filtered.slice(start, start + state.listPageSize);

  const indicator = optById("listPageIndicator");
  if (indicator) indicator.textContent = `第 ${state.listPage} / ${totalPages} 页`;

  const prevBtn = optById<HTMLButtonElement>("btnListPrevPage");
  const nextBtn = optById<HTMLButtonElement>("btnListNextPage");
  if (prevBtn) prevBtn.disabled = state.listPage <= 1;
  if (nextBtn) nextBtn.disabled = state.listPage >= totalPages;

  const container = optById("wordListScroll");
  if (!container) return;

  if (pageItems.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-xs sub-text">未找到匹配的单词</div>`;
    return;
  }

  container.innerHTML = pageItems
    .map((w) => {
      const m = state.marks[w.id];
      return `
        <div class="card-surface border rounded-2xl p-2.5 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-bold sub-text">#${w.id}</span>
              <button type="button" data-list-speak="${escapeHtml(w.word)}" class="text-sm font-extrabold hover:text-teal-500 truncate flex items-center gap-1">
                <span>${escapeHtml(w.word)}</span>
                <span class="text-[11px] text-teal-500">🔊</span>
              </button>
              <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 sub-text">频:${w.freq}</span>
            </div>
            <div class="text-xs sub-text truncate mt-0.5">${escapeHtml(w.meaning)}</div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button type="button" data-list-mark="${w.id}:known" class="w-7 h-7 rounded-xl text-xs font-bold border transition ${m === "known" ? "bg-emerald-500 text-white border-emerald-500" : "card-surface opacity-60 hover:opacity-100"}" title="标为很熟">熟</button>
            <button type="button" data-list-mark="${w.id}:fuzzy" class="w-7 h-7 rounded-xl text-xs font-bold border transition ${m === "fuzzy" ? "bg-amber-500 text-white border-amber-500" : "card-surface opacity-60 hover:opacity-100"}" title="标为有点模糊">模</button>
            <button type="button" data-list-mark="${w.id}:unknown" class="w-7 h-7 rounded-xl text-xs font-bold border transition ${m === "unknown" ? "bg-rose-500 text-white border-rose-500" : "card-surface opacity-60 hover:opacity-100"}" title="标为完全不会">生</button>
          </div>
        </div>
      `;
    })
    .join("");
}

export function renderStatsView(state: ReciteState, vocabList: ReciteWord[]): void {
  const stats = calculateMasteryStats(vocabList, state.marks);

  const sub = optById("statsSummarySubtitle");
  if (sub) sub.textContent = `已标记 ${stats.marked} 词 · 剩余 ${stats.unmarked} 词待过`;
  const badge = optById("statsMasteryBadge");
  if (badge) badge.textContent = `熟词率 ${stats.masteryPct}%`;

  const barKnown = optById("barKnown");
  const barFuzzy = optById("barFuzzy");
  const barUnknown = optById("barUnknown");
  if (barKnown) barKnown.style.width = `${stats.knownPct}%`;
  if (barFuzzy) barFuzzy.style.width = `${stats.fuzzyPct}%`;
  if (barUnknown) barUnknown.style.width = `${stats.unknownPct}%`;

  const setTxt = (id: string, text: string) => {
    const el = optById(id);
    if (el) el.textContent = text;
  };
  setTxt("statKnownNum", String(stats.known));
  setTxt("statKnownPct", `占比 ${stats.knownPct}%`);
  setTxt("statFuzzyNum", String(stats.fuzzy));
  setTxt("statFuzzyPct", `占比 ${stats.fuzzyPct}%`);
  setTxt("statUnknownNum", String(stats.unknown));
  setTxt("statUnknownPct", `占比 ${stats.unknownPct}%`);
  setTxt("statUnmarkedNum", String(stats.unmarked));
  setTxt("statUnmarkedPct", `占比 ${stats.unmarkedPct}%`);
  setTxt("exportReviewCountBadge", `${stats.fuzzy + stats.unknown} 词`);

  const tierContainer = optById("freqTierStatsContainer");
  if (tierContainer) {
    tierContainer.innerHTML = stats.tiers
      .map(
        (t) => `
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold">${t.name}</span>
            <span class="text-[11px] sub-text">熟 ${t.known} / 模 ${t.fuzzy} / 生 ${t.unknown} (共${t.total})</span>
          </div>
          <div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
            <div class="bg-emerald-500 h-full" style="width:${t.knownPct}%"></div>
            <div class="bg-amber-500 h-full" style="width:${t.fuzzyPct}%"></div>
            <div class="bg-rose-500 h-full" style="width:${t.unknownPct}%"></div>
          </div>
        </div>
      `,
      )
      .join("");
  }
}

function fitTextSingleLine(
  el: HTMLElement | null,
  maxPx: number,
  minPx: number,
  fallbackMaxWidth: number,
): void {
  if (!el) return;
  el.style.whiteSpace = "nowrap";
  const parentW =
    el.parentElement && el.parentElement.clientWidth > 40
      ? el.parentElement.clientWidth - 24
      : fallbackMaxWidth;
  let size = maxPx;
  el.style.fontSize = `${size}px`;
  if (el.offsetParent !== null && parentW > 0) {
    while (el.scrollWidth > parentW && size > minPx) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  } else {
    const text = el.textContent || "";
    let estUnits = 0;
    for (let i = 0; i < text.length; i += 1) {
      estUnits += text.charCodeAt(i) > 255 ? 1.02 : 0.58;
    }
    if (estUnits > 0) {
      const calcSize = Math.floor(fallbackMaxWidth / estUnits);
      size = Math.max(minPx, Math.min(maxPx, calcSize));
      el.style.fontSize = `${size}px`;
    }
  }
}

export function renderZenCard(state: ReciteState, filteredDeck: ReciteWord[]): void {
  const wordEl = optById("zenWordText");
  const meaningEl = optById("zenMeaningText");
  if (!wordEl || !meaningEl) return;

  if (filteredDeck.length === 0) {
    wordEl.textContent = "当前筛选无单词";
    meaningEl.textContent = "请切换筛选范围";
    fitTextSingleLine(wordEl, 42, 20, 355);
    fitTextSingleLine(meaningEl, 24, 14, 355);
    return;
  }
  if (
    !Number.isInteger(state.currentIndex) ||
    state.currentIndex < 0 ||
    state.currentIndex >= filteredDeck.length
  ) {
    state.currentIndex = 0;
  }
  const item = filteredDeck[state.currentIndex];
  if (!item) return;
  wordEl.textContent = item.word;
  meaningEl.textContent = item.meaning;
  fitTextSingleLine(wordEl, 62, 24, 358);
  fitTextSingleLine(meaningEl, 34, 16, 358);
}

export function renderQuizScoreUI(state: ReciteState): void {
  const totalEl = optById("quizTotalCount");
  const accEl = optById("quizAccuracy");
  const streakEl = optById("quizStreak");
  if (totalEl) totalEl.textContent = String(state.quizTotal);
  const acc = state.quizTotal > 0 ? Math.round((state.quizCorrect / state.quizTotal) * 100) : 100;
  if (accEl) accEl.textContent = `${acc}%`;
  if (streakEl) streakEl.textContent = `🔥 ${state.quizStreak}`;
}

export function renderAllViews(
  state: ReciteState,
  vocabList: ReciteWord[],
  filteredDeck: ReciteWord[],
): void {
  const frame = optById("deviceFrame");
  if (frame) {
    if (state.darkMode) frame.classList.add("dark-theme", "dark");
    else frame.classList.remove("dark-theme", "dark");
  }
  renderHeaderAndMiniStats(state, vocabList, filteredDeck);
  renderStudyCard(state, filteredDeck);
  renderZenCard(state, filteredDeck);
  if (state.activeTab === "list") renderWordList(state, vocabList);
  if (state.activeTab === "stats") renderStatsView(state, vocabList);
}
