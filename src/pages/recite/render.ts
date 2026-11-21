import { escapeHtml, optById } from "@/core/dom";
import { showToast as showGlobalToast } from "@/core/toast";
import {
  TYPOGRAPHY_PRESETS,
  calculateMasteryStats,
  cleanWordForSpeech,
  filterWordList,
  getFontWeightLabel,
  getStatusInfo,
} from "./engine";
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

let modalConfirmCallback: (() => void) | null = null;

export function showToast(msg: string): void {
  showGlobalToast(msg, 2400);
}

export function openModal(opts: ReciteModalOptions): void {
  const titleEl = optById("modalTitle");
  const bodyEl = optById("modalBody");
  const input = optById<HTMLInputElement>("modalInput");
  const modal = optById("appModal");
  if (titleEl) titleEl.textContent = opts.title;
  if (bodyEl) bodyEl.innerHTML = opts.body;
  if (input) {
    input.hidden = !opts.showInput;
    if (opts.showInput) {
      input.value = opts.inputValue ?? "";
      window.setTimeout(() => input.focus(), 50);
    }
  }
  modalConfirmCallback = opts.onConfirm;
  if (modal) modal.hidden = false;
}

export function closeModal(): void {
  const modal = optById("appModal");
  if (modal) modal.hidden = true;
  modalConfirmCallback = null;
}

export function isModalOpen(): boolean {
  const modal = optById("appModal");
  return Boolean(modal && !modal.hidden);
}

export function triggerModalConfirm(): void {
  if (modalConfirmCallback) modalConfirmCallback();
  else closeModal();
}

export function populateGroupSelector(vocabList: ReciteWord[], currentGroup: string): void {
  const sel = optById<HTMLSelectElement>("selectGroup");
  if (!sel) return;
  const totalGroups = Math.ceil(vocabList.length / 50);
  const cHigh = vocabList.filter((w) => w.freq >= 15).length;
  const cMid = vocabList.filter((w) => w.freq >= 5 && w.freq <= 14).length;
  const cLow = vocabList.filter((w) => w.freq >= 1 && w.freq <= 4).length;
  const cZero = vocabList.filter((w) => w.freq === 0).length;

  const opts: string[] = [
    `<option value="all">🌐 全部词汇 (${vocabList.length} 词)</option>`,
    `<option value="tier_high">🔥 超高频核心词 · 考频 ≥ 15 (${cHigh} 词)</option>`,
    `<option value="tier_mid">⭐ 中高频常考词 · 考频 5–14 (${cMid} 词)</option>`,
    `<option value="tier_low">📌 基础必备词 · 考频 1–4 (${cLow} 词)</option>`,
    `<option value="tier_zero">🆕 近年新增词 · 考频 0 (${cZero} 词)</option>`,
  ];
  for (let g = 1; g <= totalGroups; g += 1) {
    const startId = (g - 1) * 50 + 1;
    const endId = Math.min(g * 50, vocabList.length);
    opts.push(`<option value="g_${g}">第 ${g} 组 (#${startId}–#${endId})</option>`);
  }
  sel.innerHTML = opts.join("");
  sel.value = currentGroup;
}

export function updateSyncUI(): void {
  const key = getOrCreateSyncKey();
  const hKey = optById("headerSyncKey");
  const dKey = optById("displaySyncKey");
  if (hKey) hKey.textContent = key;
  if (dKey) dKey.textContent = key;

  try {
    const lastTime = localStorage.getItem(LAST_SYNC_STORAGE);
    const timeEl = optById("lastSyncTimeText");
    if (timeEl && lastTime) {
      timeEl.textContent = `上次云端同步：${lastTime}`;
    }
  } catch {
    // ignore storage errors
  }
}

export function renderHeaderAndControls(state: ReciteState, vocabList: ReciteWord[]): void {
  const stats = calculateMasteryStats(vocabList, state.marks);
  const hSub = optById("headerProgressSub");
  if (hSub) {
    hSub.textContent = `已刷 ${stats.marked} / ${stats.total} · 掌握 ${stats.masteryPct}%`;
  }

  const accLabel = state.accent === "en-US" ? "美音" : "英音";
  const hAcc = optById("accentLabel");
  if (hAcc) hAcc.textContent = accLabel;

  const dAcc = optById("drawerAccentLabel");
  if (dAcc) {
    dAcc.textContent = state.accent === "en-US" ? "口音: 美音 (US)" : "口音: 英音 (UK)";
  }

  const dSpeed = optById("drawerSpeedLabel");
  if (dSpeed) dSpeed.textContent = `语速: ${state.speechRate}x`;

  const autoLabel = optById("autoAudioLabel");
  if (autoLabel) autoLabel.textContent = `切词自动发音: ${state.autoSpeak ? "开" : "关"}`;

  const maskMap: Record<ReciteState["maskMode"], string> = {
    none: "全显",
    hide_cn: "遮中文",
    hide_en: "遮英文",
  };
  const maskLabel = optById("maskModeLabel");
  if (maskLabel) maskLabel.textContent = maskMap[state.maskMode];
  optById("btnMaskToggle")?.classList.toggle("active", state.maskMode !== "none");

  const shufLabel = optById("shuffleLabel");
  if (shufLabel) shufLabel.textContent = state.isShuffled ? "乱序" : "顺序";
  optById("btnShuffleDeck")?.classList.toggle("active", state.isShuffled);

  optById("btnZenToggle")?.classList.toggle("active", state.zenMode);

  for (const chip of document.querySelectorAll<HTMLButtonElement>("[data-status-filter]")) {
    chip.classList.toggle("active", chip.dataset.statusFilter === state.statusFilter);
  }

  // Preference sliders & presets sync
  const sEn = optById<HTMLInputElement>("sliderEnFontSize");
  const sCn = optById<HTMLInputElement>("sliderCnFontSize");
  const sEnW = optById<HTMLInputElement>("sliderEnFontWeight");
  const sCnW = optById<HTMLInputElement>("sliderCnFontWeight");
  if (sEn) sEn.value = String(state.enFontSize);
  if (sCn) sCn.value = String(state.cnFontSize);
  if (sEnW) sEnW.value = String(state.enFontWeight);
  if (sCnW) sCnW.value = String(state.cnFontWeight);

  const vEn = optById("valEnFontSize");
  const vCn = optById("valCnFontSize");
  const vEnW = optById("valEnFontWeight");
  const vCnW = optById("valCnFontWeight");
  if (vEn) vEn.textContent = `${state.enFontSize}px`;
  if (vCn) vCn.textContent = `${state.cnFontSize}px`;
  if (vEnW) vEnW.textContent = getFontWeightLabel(state.enFontWeight);
  if (vCnW) vCnW.textContent = getFontWeightLabel(state.cnFontWeight);

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-typo-preset]")) {
    const preset = TYPOGRAPHY_PRESETS.find((p) => p.id === btn.dataset.typoPreset);
    const isMatch =
      preset !== undefined &&
      preset.enFontSize === state.enFontSize &&
      preset.cnFontSize === state.cnFontSize;
    btn.classList.toggle("active", isMatch);
  }
}

export function renderStudyCard(state: ReciteState, filteredDeck: ReciteWord[]): void {
  const posText = optById("deckPositionText");
  const bar = optById("deckProgressBar");
  const total = filteredDeck.length;

  const wordText = optById("cardWordText");
  const meaningText = optById("cardMeaningText");
  const maskHint = optById("maskHintText");
  const lookupLink = optById<HTMLAnchorElement>("btnLookupVocab");

  const zenOverlay = optById("zenFullscreen");
  const zenWordText = optById("zenWordText");
  const zenMeaningText = optById("zenMeaningText");
  if (zenOverlay) {
    zenOverlay.hidden = !state.zenMode;
  }

  if (total === 0) {
    if (posText) posText.textContent = "0 / 0";
    if (bar) bar.style.width = "0%";
    if (wordText) wordText.textContent = "🎉 已完成当前筛选";
    if (meaningText)
      meaningText.textContent = "当前分组与筛选条件下暂无待刷单词，可切换顶部筛选或分组";
    if (maskHint) maskHint.hidden = true;
    if (zenWordText) zenWordText.textContent = "🎉 已完成当前筛选";
    if (zenMeaningText) zenMeaningText.textContent = "点击右上角退出专注模式";
    return;
  }

  if (state.currentIndex >= total) state.currentIndex = 0;
  if (state.currentIndex < 0) state.currentIndex = total - 1;

  const item = filteredDeck[state.currentIndex];
  if (!item) return;

  if (posText) posText.textContent = `${state.currentIndex + 1} / ${total}`;
  if (bar) bar.style.width = `${(((state.currentIndex + 1) / total) * 100).toFixed(1)}%`;

  const wIdEl = optById("cardWordId");
  const freqEl = optById("cardFreqBadge");
  if (wIdEl) wIdEl.textContent = `#${item.id}`;
  if (freqEl) freqEl.textContent = item.freq > 0 ? `考频 ${item.freq} 次` : "近年新增";

  const stInfo = getStatusInfo(state.marks[item.id]);
  const stBadge = optById("cardStatusBadge");
  if (stBadge) {
    stBadge.textContent = stInfo.label;
    stBadge.className = stInfo.cls;
  }

  const cleanHead = cleanWordForSpeech(item.word) || item.word;
  if (lookupLink) {
    lookupLink.href = `./vocab.html?q=${encodeURIComponent(cleanHead)}`;
  }

  const maskEn = state.maskMode === "hide_en" && !state.cardRevealed;
  const maskCn = state.maskMode === "hide_cn" && !state.cardRevealed;

  if (wordText) {
    wordText.textContent = item.word;
    wordText.style.fontSize = `${state.enFontSize}px`;
    wordText.style.fontWeight = String(state.enFontWeight);
    wordText.classList.toggle("is-masked", maskEn);
  }

  if (meaningText) {
    meaningText.textContent = item.meaning;
    meaningText.style.fontSize = `${state.cnFontSize}px`;
    meaningText.style.fontWeight = String(state.cnFontWeight);
    meaningText.classList.toggle("is-masked", maskCn);
  }

  if (zenWordText) {
    zenWordText.textContent = item.word;
    zenWordText.style.fontSize = `${state.enFontSize}px`;
    zenWordText.style.fontWeight = String(state.enFontWeight);
    zenWordText.classList.toggle("is-masked", maskEn);
  }

  if (zenMeaningText) {
    zenMeaningText.textContent = item.meaning;
    zenMeaningText.style.fontSize = `${state.cnFontSize}px`;
    zenMeaningText.style.fontWeight = String(state.cnFontWeight);
    zenMeaningText.classList.toggle("is-masked", maskCn);
  }

  if (maskHint) {
    maskHint.hidden = state.maskMode === "none" || state.cardRevealed;
  }
}

export function renderQuizScoreUI(state: ReciteState): void {
  const totEl = optById("quizTotalCount");
  const accEl = optById("quizAccuracy");
  const strEl = optById("quizStreak");
  if (totEl) totEl.textContent = String(state.quizTotal);
  const acc =
    state.quizTotal > 0 ? `${Math.round((state.quizCorrect / state.quizTotal) * 100)}%` : "100%";
  if (accEl) accEl.textContent = acc;
  if (strEl) strEl.textContent = `🔥 ${state.quizStreak}`;
}

export function renderWordList(state: ReciteState, vocabList: ReciteWord[]): void {
  const list = filterWordList(vocabList, state.marks, state.listSearch, state.listTab);
  const resCount = optById("listResultCount");
  if (resCount) resCount.textContent = `${list.length} 词`;

  const totalPages = Math.max(1, Math.ceil(list.length / state.listPageSize));
  if (state.listPage > totalPages) state.listPage = totalPages;
  if (state.listPage < 1) state.listPage = 1;

  const start = (state.listPage - 1) * state.listPageSize;
  const pageItems = list.slice(start, start + state.listPageSize);

  const pageInd = optById("listPageIndicator");
  if (pageInd) pageInd.textContent = `第 ${state.listPage} / ${totalPages} 页`;

  const prevBtn = optById<HTMLButtonElement>("btnListPrevPage");
  const nextBtn = optById<HTMLButtonElement>("btnListNextPage");
  if (prevBtn) prevBtn.disabled = state.listPage <= 1;
  if (nextBtn) nextBtn.disabled = state.listPage >= totalPages;

  const container = optById("wordListScroll");
  if (!container) return;

  if (pageItems.length === 0) {
    container.innerHTML = '<div class="empty-state">未找到匹配单词，可调整搜索词或状态筛选</div>';
    return;
  }

  container.innerHTML = pageItems
    .map((w) => {
      const m = state.marks[w.id];
      return `
        <div class="word-list-row" data-list-word="${w.id}">
          <div class="word-row-main">
            <div class="word-row-title">
              <span class="word-row-id">#${w.id}</span>
              <span class="word-row-en">${escapeHtml(w.word)}</span>
              ${w.freq > 0 ? `<span class="word-row-freq">考频 ${w.freq}</span>` : ""}
            </div>
            <div class="word-row-cn">${escapeHtml(w.meaning)}</div>
          </div>
          <div class="word-row-actions">
            <button type="button" class="row-mini-btn" data-list-speak="${w.id}" title="朗读单词">🔊</button>
            <button type="button" class="row-mini-btn${m === "known" ? " active-known" : ""}" data-list-mark="${w.id}:known" title="标记为很熟">熟</button>
            <button type="button" class="row-mini-btn${m === "fuzzy" ? " active-fuzzy" : ""}" data-list-mark="${w.id}:fuzzy" title="标记为有点模糊">模</button>
            <button type="button" class="row-mini-btn${m === "unknown" ? " active-unknown" : ""}" data-list-mark="${w.id}:unknown" title="标记为完全不会">生</button>
            <button type="button" class="row-mini-btn" data-list-jump="${w.id}" title="定位到记忆闪卡">🎯 闪卡</button>
          </div>
        </div>
      `;
    })
    .join("");
}

export function renderStatsView(state: ReciteState, vocabList: ReciteWord[]): void {
  const stats = calculateMasteryStats(vocabList, state.marks);
  const sub = optById("statsSummarySubtitle");
  const badge = optById("statsMasteryBadge");
  if (sub) sub.textContent = `已标记 ${stats.marked} 词 · 剩余 ${stats.unmarked} 词待过`;
  if (badge) badge.textContent = `${stats.masteryPct}%`;

  const barK = optById("barKnown");
  const barF = optById("barFuzzy");
  const barU = optById("barUnknown");
  if (barK) barK.style.width = `${stats.knownPct}%`;
  if (barF) barF.style.width = `${stats.fuzzyPct}%`;
  if (barU) barU.style.width = `${stats.unknownPct}%`;

  const sKNum = optById("statKnownNum");
  const sFNum = optById("statFuzzyNum");
  const sUNum = optById("statUnknownNum");
  const sUmNum = optById("statUnmarkedNum");
  if (sKNum) sKNum.textContent = String(stats.known);
  if (sFNum) sFNum.textContent = String(stats.fuzzy);
  if (sUNum) sUNum.textContent = String(stats.unknown);
  if (sUmNum) sUmNum.textContent = String(stats.unmarked);

  const sKPct = optById("statKnownPct");
  const sFPct = optById("statFuzzyPct");
  const sUPct = optById("statUnknownPct");
  const sUmPct = optById("statUnmarkedPct");
  if (sKPct) sKPct.textContent = `占比 ${stats.knownPct}%`;
  if (sFPct) sFPct.textContent = `占比 ${stats.fuzzyPct}%`;
  if (sUPct) sUPct.textContent = `占比 ${stats.unknownPct}%`;
  if (sUmPct) sUmPct.textContent = `占比 ${stats.unmarkedPct}%`;

  const revBadge = optById("exportReviewCountBadge");
  if (revBadge) revBadge.textContent = `${stats.fuzzy + stats.unknown} 词`;

  const tierBox = optById("freqTierStatsContainer");
  if (tierBox) {
    tierBox.innerHTML = stats.tiers
      .map(
        (t) => `
        <div class="tier-row">
          <div class="tier-row-top">
            <span>${escapeHtml(t.name)}</span>
            <span class="deck-counter">${t.known}/${t.total} (${t.knownPct}%)</span>
          </div>
          <div class="tier-bar">
            <div class="stacked-known" style="width:${t.knownPct}%"></div>
            <div class="stacked-fuzzy" style="width:${t.fuzzyPct}%"></div>
            <div class="stacked-unknown" style="width:${t.unknownPct}%"></div>
          </div>
        </div>
      `,
      )
      .join("");
  }

  updateSyncUI();
}

export function renderAllViews(
  state: ReciteState,
  vocabList: ReciteWord[],
  filteredDeck: ReciteWord[],
): void {
  renderHeaderAndControls(state, vocabList);
  renderStudyCard(state, filteredDeck);
  renderQuizScoreUI(state);
  if (state.activeTab === "list") {
    renderWordList(state, vocabList);
  }
  if (state.activeTab === "stats") {
    renderStatsView(state, vocabList);
  }
}
