import "@/core/fonts";
import { byId, copyToClipboard, escapeHtml, optById } from "@/core/dom";
import { initAppShell } from "@/core/shell";
import { getStorageItem, removeStorageItem, setStorageItem } from "@/core/storage";
import {
  buildBatchExportCSV,
  buildBatchExportTSV,
  extractWordsFromBatchCSV,
  parseUploadedCSVContent,
  readCsvFileSmart,
} from "./csv";
import {
  extractCoreBaseWord,
  fetchCloudDerivativesIfNeeded,
  generateWordDetailData,
} from "./derivatives";
import {
  STORAGE_KEY_BASELINE_CACHE,
  STORAGE_KEY_CUSTOM_VOCAB,
  STORAGE_KEY_HISTORY,
  fetchBaselineVocabData,
  getIdbCachedVocab,
} from "./idb";
import { renderAggregatedWordRowHtml, renderBatchTableRowsHtml } from "./render";
import {
  aggregateLookupEntries,
  extractWordsFromFreeText,
  formatShortUnitBadge,
  formatUnitLabel,
  getShortBookName,
  getUniqueBooks,
  indexAllEntries,
  judgeWordByTextbookStandard,
  lookupWordInTextbook,
  normalizeWordStr,
} from "./search";
import type {
  AggregatedVocabItem,
  BatchCheckResult,
  BatchFilterMode,
  ScoredVocabEntry,
  VocabEntry,
} from "./types";
import { COMPLETE_ROOT_FAMILIES } from "./word-knowledge";

const ACCENT_STORAGE_KEY = "cenj_vocab_accent_v1";

let builtinVocab: VocabEntry[] = [];
let vocabList: VocabEntry[] = [];
let selectedBookScope = "ALL";
let searchHistory: string[] = [];
let listRenderLimit = 60;
let batchCheckResults: BatchCheckResult[] = [];
let batchCurrentFilter: BatchFilterMode = "ALL";
let batchCurrentFileName = "导入词表.csv";
let currentDisplayedItems: AggregatedVocabItem[] = [];
let selectedRowIndex = -1;
let detailStack: VocabEntry[] = [];
let accentMode: "us" | "uk" = getStorageItem(ACCENT_STORAGE_KEY) === "uk" ? "uk" : "us";
let audioPlayer: HTMLAudioElement | null = null;
let toastTimer: number | null = null;

function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= 960;
}

function showToast(msg: string): void {
  const banner = optById("toastBanner");
  const textEl = optById("toastText");
  if (!banner || !textEl) return;
  textEl.textContent = msg;
  banner.classList.add("show");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    banner.classList.remove("show");
  }, 2200);
}

function cleanSpeechWord(wordText: string): string {
  const cleaned = String(wordText || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\/.*$/, "")
    .replace(/\.\.\.|…/g, "")
    .trim();
  return cleaned || String(wordText || "").trim();
}

function speakWithBrowserTts(text: string): void {
  if (!("speechSynthesis" in window)) {
    showToast("当前浏览器不支持语音朗读");
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = accentMode === "uk" ? "en-GB" : "en-US";
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  } catch {
    showToast("语音播放失败");
  }
}

function speakWord(wordText: string): void {
  const target = cleanSpeechWord(wordText);
  if (!target) return;

  if (typeof Audio === "undefined") {
    speakWithBrowserTts(target);
    return;
  }

  try {
    if (!audioPlayer) audioPlayer = new Audio();
    audioPlayer.pause();
    const type = accentMode === "uk" ? 1 : 2;
    audioPlayer.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(target)}&type=${type}`;
    audioPlayer.onerror = () => speakWithBrowserTts(target);
    const playPromise = audioPlayer.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => speakWithBrowserTts(target));
    }
  } catch {
    speakWithBrowserTts(target);
  }
}

function syncAccentUI(): void {
  const label = optById("accentLabel");
  if (label) {
    label.textContent = accentMode === "uk" ? "英音 UK" : "美音 US";
  }
  const detailSpeakLabel = optById("detailSpeakLabel");
  if (detailSpeakLabel) {
    detailSpeakLabel.textContent = accentMode === "uk" ? "英音" : "美音";
  }
}

async function copyEntryInfo(entry: VocabEntry): Promise<void> {
  const text = `${entry.w} ${entry.p ? `[${entry.p}] ` : ""}${entry.m} —— ${entry.b} · ${formatShortUnitBadge(entry.u)}`;
  const ok = await copyToClipboard(text);
  showToast(ok ? "已复制课本词条信息" : "复制失败");
}

function openModal(id: string): void {
  const el = optById(id);
  if (el) el.hidden = false;
}

function closeModal(id: string): void {
  const el = optById(id);
  if (el) el.hidden = true;
}

function renderBreadcrumb(): void {
  const bar = optById("detailBreadcrumbBar");
  const trail = optById("detailBreadcrumbTrail");
  if (!bar || !trail) return;

  if (detailStack.length <= 1) {
    bar.hidden = true;
    trail.textContent = "";
    return;
  }

  bar.hidden = false;
  trail.textContent = detailStack.map((item) => item.w).join(" › ");
}

function renderDetailEntry(entry: VocabEntry, openMobileSheet: boolean): void {
  const placeholder = optById("detailPlaceholder");
  const card = optById("detailCard");
  const pane = optById("detailPane");
  const titleEl = optById("detailWordTitle");
  const posEl = optById("detailWordPos");
  const badgesEl = optById("detailWordBadges");
  const bodyEl = optById("detailBodyContent");
  const speakBtn = optById<HTMLButtonElement>("detailSpeakBtn");
  const copyBtn = optById<HTMLButtonElement>("detailCopyBtn");

  const data = generateWordDetailData(vocabList, entry);
  if (!data || !card || !placeholder) return;

  placeholder.hidden = true;
  card.hidden = false;
  renderBreadcrumb();

  if (titleEl) titleEl.textContent = data.word;
  if (posEl) {
    if (data.pos) {
      posEl.textContent = data.pos;
      posEl.hidden = false;
    } else {
      posEl.hidden = true;
    }
  }
  if (badgesEl) badgesEl.innerHTML = data.badgesHtml;
  if (bodyEl) {
    bodyEl.innerHTML = data.bodyHtml;
    bodyEl.scrollTop = 0;
  }
  if (speakBtn) speakBtn.onclick = () => speakWord(entry.w);
  if (copyBtn) copyBtn.onclick = () => void copyEntryInfo(entry);

  if (openMobileSheet && !isDesktopViewport() && pane) {
    pane.classList.add("is-mobile-open");
  }

  const coreWord = extractCoreBaseWord(entry);
  void fetchCloudDerivativesIfNeeded(coreWord, (cleanW) => {
    const active = detailStack[detailStack.length - 1];
    if (!active) return;
    const curCore = extractCoreBaseWord(active);
    if (curCore === cleanW || normalizeWordStr(active.w) === cleanW) {
      const updated = generateWordDetailData(vocabList, active);
      if (updated && bodyEl) {
        bodyEl.innerHTML = updated.bodyHtml;
      }
    }
  });
}

function openWordDetail(entry: VocabEntry, mode: "reset" | "push", openMobileSheet: boolean): void {
  if (mode === "push") {
    const top = detailStack[detailStack.length - 1];
    if (!top || normalizeWordStr(top.w) !== normalizeWordStr(entry.w)) {
      detailStack.push(entry);
    }
  } else {
    detailStack = [entry];
  }
  renderDetailEntry(entry, openMobileSheet);
}

function clearDetailPane(): void {
  const placeholder = optById("detailPlaceholder");
  const card = optById("detailCard");
  const pane = optById("detailPane");
  detailStack = [];
  if (placeholder) placeholder.hidden = false;
  if (card) card.hidden = true;
  if (pane) pane.classList.remove("is-mobile-open");
}

function closeMobileDetailSheet(): void {
  optById("detailPane")?.classList.remove("is-mobile-open");
}

function buildFallbackEntry(word: string, pos = "", mean = ""): VocabEntry {
  const normW = normalizeWordStr(word);
  let famMember: { p: string; m: string } | null = null;
  for (const fam of COMPLETE_ROOT_FAMILIES) {
    const m = fam.members.find((x) => normalizeWordStr(x.w) === normW);
    if (m) {
      famMember = m;
      break;
    }
  }
  return {
    w: word,
    p: pos || famMember?.p || "",
    m: mean || famMember?.m || "（课外拓展词 · 查看下方全形态变形与同根词家族）",
    b: "拓展同根词库",
    u: "非CSV",
    f: "拓展",
    n: "",
    inCsv: false,
  };
}

function openWordByName(
  rawWord: string,
  bookHint = "",
  posHint = "",
  meanHint = "",
  mode: "reset" | "push" = "push",
  openMobile = true,
): void {
  const norm = normalizeWordStr(rawWord);
  const found =
    (bookHint && vocabList.find((item) => item.w === rawWord && item.b === bookHint)) ||
    vocabList.find((item) => (item._headLower || normalizeWordStr(item.w)) === norm) ||
    vocabList.find((item) => normalizeWordStr(item.w) === norm);

  openWordDetail(found ?? buildFallbackEntry(rawWord, posHint, meanHint), mode, openMobile);
}

function renderHistoryChips(): void {
  const sec = optById("historySection");
  const wrap = optById("historyChips");
  if (!sec || !wrap) return;
  if (!searchHistory || searchHistory.length === 0) {
    sec.hidden = true;
    return;
  }
  sec.hidden = false;
  wrap.innerHTML = searchHistory
    .map(
      (w) =>
        `<button type="button" data-quick-word="${escapeHtml(w)}" class="quick-word-chip vc-quick-chip">${escapeHtml(w)}</button>`,
    )
    .join("");
}

function addSearchHistory(word: string): void {
  const clean = String(word || "").trim();
  if (!clean) return;
  searchHistory = [
    clean,
    ...searchHistory.filter((w) => w.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, 10);
  setStorageItem(STORAGE_KEY_HISTORY, JSON.stringify(searchHistory));
  renderHistoryChips();
}

function updateSubFilterVisibilityAndOptions(): void {
  const row = optById("subFilterRow");
  const unitSelect = optById<HTMLSelectElement>("browseUnitSelect");
  const fontSelect = optById<HTMLSelectElement>("browseFontSelect");
  if (!row || !unitSelect) return;

  if (selectedBookScope === "ALL") {
    row.hidden = true;
    unitSelect.value = "ALL";
    if (fontSelect) fontSelect.value = "ALL";
    return;
  }

  row.hidden = false;
  const prevU = unitSelect.value || "ALL";
  const unitsSet = new Set<string>();
  for (const e of vocabList) {
    if (e.b === selectedBookScope && e.u) {
      unitsSet.add(String(e.u).trim());
    }
  }
  const unitsArr = Array.from(unitsSet).sort((a, b) => {
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number.parseInt(a, 10) - Number.parseInt(b, 10);
    return a.localeCompare(b);
  });

  const isCet =
    selectedBookScope.includes("四级") ||
    selectedBookScope.includes("六级") ||
    selectedBookScope.includes("CET");
  let opts = `<option value="ALL">全部${isCet ? "字母组" : "单元"}</option>`;
  for (const u of unitsArr) {
    opts += `<option value="${escapeHtml(u)}">${escapeHtml(formatUnitLabel(u))}</option>`;
  }
  unitSelect.innerHTML = opts;
  unitSelect.value = Array.from(unitSelect.options).some((o) => o.value === prevU) ? prevU : "ALL";
}

function renderBookFilterBarAndManager(): void {
  const books = getUniqueBooks(vocabList);
  const totalCount = vocabList.length;

  byId("headerStats").textContent =
    `已加载 ${books.length} 册词库 · ${totalCount.toLocaleString()} 词条`;
  const summaryEl = optById("loadedSummaryText");
  if (summaryEl) {
    summaryEl.textContent = `共 ${books.length} 册 · ${totalCount.toLocaleString()} 个词条`;
  }

  const pillBar = byId("lookupBookFilterBar");
  let pillsHtml = `
    <button type="button" data-book-scope="ALL" class="vc-scope-pill${selectedBookScope === "ALL" ? " active" : ""}">
      全部 (${totalCount.toLocaleString()})
    </button>
  `;
  for (const [bName, count] of books) {
    const active = selectedBookScope === bName;
    pillsHtml += `
      <button type="button" data-book-scope="${escapeHtml(bName)}" class="vc-scope-pill${active ? " active" : ""}">
        ${escapeHtml(getShortBookName(bName))} (${count.toLocaleString()})
      </button>
    `;
  }
  pillBar.innerHTML = pillsHtml;

  updateSubFilterVisibilityAndOptions();

  const booksListEl = optById("loadedBooksList");
  if (booksListEl) {
    booksListEl.innerHTML = books
      .map(
        ([bName, count]) => `
        <div class="vc-book-row">
          <span>${escapeHtml(bName)}</span>
          <span class="vc-book-count">${count.toLocaleString()} 词</span>
        </div>
      `,
      )
      .join("");
  }
}

function updateActiveRowSelection(nextIdx: number, openMobileSheet: boolean): void {
  if (currentDisplayedItems.length === 0) {
    selectedRowIndex = -1;
    clearDetailPane();
    return;
  }

  const clamped = Math.max(0, Math.min(currentDisplayedItems.length - 1, nextIdx));
  selectedRowIndex = clamped;

  const listEl = optById("wordListContainer");
  if (listEl) {
    for (const row of listEl.querySelectorAll<HTMLElement>(".vc-word-row")) {
      const idx = Number(row.dataset.rowIdx);
      const isSelected = idx === clamped;
      row.classList.toggle("is-active", isSelected);
      row.setAttribute("aria-selected", isSelected ? "true" : "false");
      if (isSelected) {
        row.scrollIntoView({ block: "nearest" });
      }
    }
  }

  const item = currentDisplayedItems[clamped];
  if (item) {
    openWordDetail(item.primary, "reset", openMobileSheet);
  }
}

function applySubFiltersToEntries(entries: ScoredVocabEntry[]): ScoredVocabEntry[] {
  if (selectedBookScope === "ALL") return entries;
  const uVal = optById<HTMLSelectElement>("browseUnitSelect")?.value || "ALL";
  const fVal = optById<HTMLSelectElement>("browseFontSelect")?.value || "ALL";
  return entries.filter((e) => {
    if (uVal !== "ALL" && String(e.u).toLowerCase() !== uVal.toLowerCase()) return false;
    if (fVal === "黑体" && e.f !== "黑体") return false;
    if (fVal === "白体" && e.f !== "白体") return false;
    if (fVal === "专有名词" && (!e.n || !e.n.includes("专有名词"))) return false;
    return true;
  });
}

function renderListSlice(queryHighlight: string, autoSelectFirst: boolean): void {
  const listEl = byId("wordListContainer");
  const loadMoreWrap = byId("listLoadMoreWrap");
  const loadMoreBtn = byId("listLoadMoreBtn");

  const slice = currentDisplayedItems.slice(0, listRenderLimit);
  if (autoSelectFirst && slice.length > 0 && isDesktopViewport()) {
    selectedRowIndex = 0;
  } else if (selectedRowIndex >= slice.length) {
    selectedRowIndex = slice.length > 0 && isDesktopViewport() ? 0 : -1;
  }

  listEl.innerHTML = slice
    .map((item, idx) =>
      renderAggregatedWordRowHtml(item, idx, idx === selectedRowIndex, queryHighlight),
    )
    .join("");

  if (currentDisplayedItems.length > listRenderLimit) {
    loadMoreWrap.hidden = false;
    loadMoreBtn.textContent = `加载更多（剩余 ${currentDisplayedItems.length - listRenderLimit} 词）`;
  } else {
    loadMoreWrap.hidden = true;
  }

  if (autoSelectFirst && selectedRowIndex >= 0) {
    const firstItem = currentDisplayedItems[selectedRowIndex];
    if (firstItem) {
      openWordDetail(firstItem.primary, "reset", false);
    }
  }
}

function renderMainWorkspace(rawQuery: string, saveToHistory = false, resetLimit = true): void {
  const idlePanel = byId("idleHelperPanel");
  const clearBtn = byId("clearInputBtn");
  const lemmaBanner = byId("lemmaBanner");
  const lemmaBannerText = byId("lemmaBannerText");
  const directBannerBtn = byId("btnOpenDirectFromBanner");
  const listMetaBar = byId("listMetaBar");
  const listMetaText = byId("listMetaText");
  const listEl = byId("wordListContainer");
  const loadMoreWrap = byId("listLoadMoreWrap");
  const emptyBox = byId("emptyResultBox");
  const subStats = optById("subFilterStats");

  if (resetLimit) {
    listRenderLimit = 60;
  }

  const trimmed = rawQuery.trim();
  clearBtn.hidden = !trimmed;

  // Case 1: Empty input + ALL books -> idle screen
  if (!trimmed && selectedBookScope === "ALL") {
    idlePanel.hidden = false;
    lemmaBanner.hidden = true;
    listMetaBar.hidden = true;
    listEl.innerHTML = "";
    loadMoreWrap.hidden = true;
    emptyBox.hidden = true;
    currentDisplayedItems = [];
    selectedRowIndex = -1;
    if (subStats) subStats.textContent = "";
    if (detailStack.length === 0) {
      clearDetailPane();
    }
    return;
  }

  idlePanel.hidden = true;

  // Case 2: Empty input + specific book -> browse book entries directly in dual-pane
  if (!trimmed && selectedBookScope !== "ALL") {
    lemmaBanner.hidden = true;
    emptyBox.hidden = true;
    const bookEntries: ScoredVocabEntry[] = vocabList
      .filter((e) => e.b === selectedBookScope)
      .map((e) => ({
        ...e,
        _matchType: "浏览",
        _matchRank: 1,
        _hlTerm: "",
      }));
    const filtered = applySubFiltersToEntries(bookEntries);
    currentDisplayedItems = aggregateLookupEntries(filtered);

    if (subStats) {
      subStats.textContent = `当前筛选 ${currentDisplayedItems.length} 词`;
    }
    listMetaBar.hidden = false;
    listMetaText.textContent = `${getShortBookName(selectedBookScope)} · 共 ${currentDisplayedItems.length} 词`;

    if (currentDisplayedItems.length === 0) {
      listEl.innerHTML = "";
      loadMoreWrap.hidden = true;
      emptyBox.hidden = false;
      emptyBox.innerHTML = `
        <div class="vc-empty-title">当前筛选条件下暂无词条</div>
        <p class="vc-empty-desc">尝试切换单元或级别筛选查看本册其余词汇。</p>
      `;
      clearDetailPane();
      return;
    }

    renderListSlice("", true);
    return;
  }

  // Case 3: Query lookup (English + Lemma + Substring + Chinese reverse)
  const res = lookupWordInTextbook(vocabList, trimmed, selectedBookScope);
  if (!res) return;

  if (saveToHistory) {
    addSearchHistory(res.rawQuery);
  }

  const filteredMatches = applySubFiltersToEntries(res.fragmentMatches);
  currentDisplayedItems = aggregateLookupEntries(filteredMatches);

  if (subStats) {
    subStats.textContent =
      selectedBookScope !== "ALL" ? `本册命中 ${currentDisplayedItems.length} 词` : "";
  }

  if (res.recognizedLemmas.length > 0) {
    const primaryLemma = res.recognizedLemmas[0] ?? res.normalizedQuery;
    lemmaBanner.hidden = false;
    lemmaBannerText.innerHTML = `识别词形 <strong>“${escapeHtml(res.rawQuery)}”</strong> → 原形 <strong>${escapeHtml(res.recognizedLemmas.join(" / "))}</strong>`;
    directBannerBtn.dataset.directWord = primaryLemma;
  } else {
    lemmaBanner.hidden = true;
  }

  if (currentDisplayedItems.length > 0) {
    emptyBox.hidden = true;
    listMetaBar.hidden = false;
    listMetaText.textContent = `命中 ${currentDisplayedItems.length} 个独立词条${selectedBookScope !== "ALL" ? ` · ${getShortBookName(selectedBookScope)}` : ""}`;
    renderListSlice(res.normalizedQuery, true);
    return;
  }

  // Empty lookup result + typo & other-book suggestions
  listEl.innerHTML = "";
  loadMoreWrap.hidden = true;
  listMetaBar.hidden = true;
  emptyBox.hidden = false;
  selectedRowIndex = -1;

  const isAsciiWord = /^[a-zA-Z-]+$/.test(res.normalizedQuery) && res.normalizedQuery.length >= 2;
  const directTarget = res.recognizedLemmas[0] ?? res.normalizedQuery;

  let emptyHtml = `
    <div class="vc-empty-title">不在当前词库范围中</div>
    <p class="vc-empty-desc">未收录 <strong>“${escapeHtml(res.rawQuery)}”</strong>${res.queryLemmas.length > 0 ? `（原形候选：${escapeHtml(res.queryLemmas.slice(0, 3).join(" / "))}）` : ""}。</p>
    <div class="vc-batch-input-actions">
      ${
        res.matchesInOtherBooks.length > 0
          ? `<button type="button" id="switchAllBooksBtn" class="vc-btn vc-btn-primary">在其他册别命中 ${res.matchesInOtherBooks.length} 条 · 切回全部词库</button>`
          : ""
      }
      ${
        isAsciiWord
          ? `<button type="button" data-open-direct-word="${escapeHtml(directTarget)}" class="open-direct-card-btn vc-btn vc-btn-ghost">查看全形态变形与同根词拓展 ›</button>`
          : ""
      }
    </div>
  `;

  if (res.typoMatches.length > 0) {
    emptyHtml += `
      <div class="vc-sec-head"><span class="vc-sec-title">拼写相近建议</span></div>
      <div class="vc-typo-list">
        ${res.typoMatches
          .slice(0, 6)
          .map(
            (p) => `
          <button type="button" data-quick-word="${escapeHtml(p._headLower || p.w)}" class="quick-word-chip vc-typo-btn">
            <span><strong>${escapeHtml(p.w)}</strong> <span class="vc-pos-inline">${escapeHtml(p.p)}</span> ${escapeHtml(p.m)}</span>
            <span class="vc-source-pill">${escapeHtml(getShortBookName(p.b))} · ${escapeHtml(formatShortUnitBadge(p.u))}</span>
          </button>
        `,
          )
          .join("")}
      </div>
    `;
  }

  emptyBox.innerHTML = emptyHtml;
  if (isAsciiWord && isDesktopViewport()) {
    openWordByName(directTarget, "", "", "", "reset", false);
  }
}

function renderBatchCheckTable(): void {
  const total = batchCheckResults.length;
  const yesCount = batchCheckResults.filter((r) => r.isInTextbook).length;
  const noCount = total - yesCount;
  const scopeName =
    selectedBookScope === "ALL" ? "全部词库 (含四六级)" : getShortBookName(selectedBookScope);

  byId("batchFileNameBadge").textContent = `${batchCurrentFileName} · ${scopeName}`;
  byId("batchSummaryStats").innerHTML =
    `共 <strong>${total}</strong> 词：收录 <strong>${yesCount}</strong> ｜ 未收录 <strong>${noCount}</strong>`;

  for (const btn of document.querySelectorAll(".batch-filter-pill")) {
    const f = btn.getAttribute("data-batch-filter");
    btn.classList.toggle("active", f === batchCurrentFilter);
    if (f === "ALL") btn.textContent = `全部 (${total})`;
    if (f === "YES") btn.textContent = `收录 (${yesCount})`;
    if (f === "NO") btn.textContent = `未收录 (${noCount})`;
  }

  const filtered = batchCheckResults.filter((r) => {
    if (batchCurrentFilter === "YES") return r.isInTextbook;
    if (batchCurrentFilter === "NO") return !r.isInTextbook;
    return true;
  });

  byId("batchTableBody").innerHTML = renderBatchTableRowsHtml(batchCheckResults, filtered);
}

function runBatchWordCheck(wordArray: string[], sourceLabel = "文本判定"): void {
  if (!wordArray || wordArray.length === 0) {
    showToast("未识别到有效英文单词");
    return;
  }
  batchCurrentFileName = sourceLabel;
  batchCheckResults = wordArray
    .map((w) => judgeWordByTextbookStandard(vocabList, w, selectedBookScope))
    .filter((item): item is BatchCheckResult => item !== null);

  batchCurrentFilter = "ALL";
  renderBatchCheckTable();
  byId("batchCheckResultSection").hidden = false;
}

function exportBatchCheckResultsAsCSV(): void {
  if (batchCheckResults.length === 0) return;
  const csvContent = buildBatchExportCSV(batchCheckResults);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `课本单词批量判定结果_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("已导出判定结果 CSV");
}

async function copyBatchCheckResultsAsTSV(): Promise<void> {
  if (batchCheckResults.length === 0) return;
  const ok = await copyToClipboard(buildBatchExportTSV(batchCheckResults));
  showToast(ok ? "已复制表格内容" : "复制失败");
}

async function handleCsvFilesSelected(fileList: FileList | null): Promise<void> {
  if (!fileList || fileList.length === 0) return;
  const modeEl = document.querySelector<HTMLInputElement>('input[name="importMode"]:checked');
  const mode = modeEl ? modeEl.value : "merge";

  let importedEntries: VocabEntry[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file) continue;
    try {
      const text = await readCsvFileSmart(file);
      const parsed = parseUploadedCSVContent(text, file.name);
      importedEntries = importedEntries.concat(parsed);
    } catch {
      // skip invalid file
    }
  }

  if (importedEntries.length === 0) {
    showToast("未在所选 CSV 中解析到有效词条");
    return;
  }

  if (mode === "replace") {
    vocabList = importedEntries;
  } else {
    const existingSet = new Set(vocabList.map((e) => `${e.b}||${e.u}||${e.w}`));
    for (const e of importedEntries) {
      const key = `${e.b}||${e.u}||${e.w}`;
      if (!existingSet.has(key)) {
        existingSet.add(key);
        vocabList.push(e);
      }
    }
  }

  indexAllEntries(vocabList);
  selectedBookScope = "ALL";
  setStorageItem(STORAGE_KEY_CUSTOM_VOCAB, JSON.stringify(vocabList));
  renderBookFilterBarAndManager();
  renderMainWorkspace(byId<HTMLInputElement>("wordInput").value, false);
  showToast(`已导入 ${fileList.length} 个文件（共 ${vocabList.length.toLocaleString()} 词）`);

  const syncCheckbox = optById<HTMLInputElement>("syncToD1Checkbox");
  if (syncCheckbox?.checked) {
    const pwd = window.prompt("请输入管理员密码以同步至 Cloudflare D1 云端数据库:", "");
    if (pwd) {
      try {
        showToast("正在同步至 Cloudflare D1...");
        const res = await fetch("/api/vocab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: pwd,
            clearBeforeImport: mode === "replace",
            words: importedEntries,
          }),
        });
        const resData = (await res.json()) as {
          status?: string;
          inserted?: number;
          error?: string;
          message?: string;
        };
        if (res.ok && resData.status === "ok") {
          showToast(`D1 云端同步完成（写入 ${resData.inserted ?? importedEntries.length} 词）`);
        } else {
          showToast(`云端同步未成功: ${resData.error || resData.message || "密码或网络错误"}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "网络错误";
        showToast(`云端请求失败: ${msg}`);
      }
    }
  }

  closeModal("managerModal");
}

async function initApp(): Promise<void> {
  initAppShell({ activePage: "vocab" });
  syncAccentUI();

  const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() || "";
  try {
    if (getStorageItem("pep_vocab_baseline_cache_v1")) {
      removeStorageItem("pep_vocab_baseline_cache_v1");
    }
    const oldCustomV1 = getStorageItem("pep_iphone_vocab_custom_v1");
    if (oldCustomV1) {
      const parsed = JSON.parse(oldCustomV1) as unknown;
      if (Array.isArray(parsed) && parsed.length <= 2625) {
        removeStorageItem("pep_iphone_vocab_custom_v1");
      }
    }
  } catch {
    // ignore
  }

  let loadedCustom: VocabEntry[] | null = null;
  try {
    const raw = getStorageItem(STORAGE_KEY_CUSTOM_VOCAB);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        loadedCustom = parsed as VocabEntry[];
      }
    }
  } catch {
    // ignore
  }

  let cachedBaseline: VocabEntry[] | null = null;
  try {
    const idbWords = await getIdbCachedVocab();
    if (Array.isArray(idbWords) && idbWords.length >= 10000) {
      cachedBaseline = idbWords;
    }
  } catch {
    // ignore
  }

  if (!cachedBaseline) {
    try {
      const rawCache = getStorageItem(STORAGE_KEY_BASELINE_CACHE);
      if (rawCache) {
        const parsedCache = JSON.parse(rawCache) as unknown;
        if (Array.isArray(parsedCache) && parsedCache.length >= 10000) {
          cachedBaseline = parsedCache as VocabEntry[];
        }
      }
    } catch {
      // ignore
    }
  }

  if (cachedBaseline) {
    builtinVocab = cachedBaseline;
  }

  if (loadedCustom) {
    vocabList = loadedCustom;
    indexAllEntries(vocabList);
  } else if (cachedBaseline) {
    vocabList = cachedBaseline.map((e) => ({ ...e }));
    indexAllEntries(vocabList);
  } else {
    byId("headerStats").textContent = "正在加载词库数据 (11,160+ 词)...";
  }

  const isForeground = !cachedBaseline && !loadedCustom;
  void fetchBaselineVocabData()
    .then((result) => {
      if (!result) return;
      builtinVocab = result.words;
      if (!getStorageItem(STORAGE_KEY_CUSTOM_VOCAB)) {
        vocabList = builtinVocab.map((e) => ({ ...e }));
        indexAllEntries(vocabList);
        renderBookFilterBarAndManager();
        const currentQ = optById<HTMLInputElement>("wordInput")?.value.trim() || "";
        if (currentQ || selectedBookScope !== "ALL") {
          renderMainWorkspace(currentQ, false);
        }
        if (isForeground) {
          showToast(
            `词库加载完成 (${vocabList.length.toLocaleString()} 词${result.fromD1 ? " · D1云端" : ""})`,
          );
        }
      }
    })
    .catch((err) => {
      console.warn("Failed to fetch baseline vocab:", err);
      if (isForeground && vocabList.length === 0) {
        byId("headerStats").textContent = "词库加载失败，请检查网络后刷新";
        showToast("词库网络加载失败");
      }
    });

  try {
    const rawHist = getStorageItem(STORAGE_KEY_HISTORY);
    if (rawHist) {
      const parsedHist = JSON.parse(rawHist) as unknown;
      if (Array.isArray(parsedHist)) searchHistory = parsedHist as string[];
    }
  } catch {
    // ignore
  }

  renderBookFilterBarAndManager();
  renderHistoryChips();

  const wordInput = byId<HTMLInputElement>("wordInput");
  const searchForm = byId<HTMLFormElement>("searchForm");
  const clearInputBtn = byId<HTMLButtonElement>("clearInputBtn");

  if (initialQuery) {
    wordInput.value = initialQuery;
    renderMainWorkspace(initialQuery, true);
  } else if (isDesktopViewport()) {
    window.setTimeout(() => wordInput.focus({ preventScroll: true }), 40);
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = wordInput.value.trim();
    if (!val) return;
    renderMainWorkspace(val, true);
    const activeItem = currentDisplayedItems[selectedRowIndex] ?? currentDisplayedItems[0];
    if (activeItem) {
      speakWord(activeItem.primary.w);
    }
  });

  wordInput.addEventListener("input", () => {
    renderMainWorkspace(wordInput.value, false);
  });

  clearInputBtn.addEventListener("click", () => {
    wordInput.value = "";
    renderMainWorkspace("", false);
    wordInput.focus();
  });

  optById("btnAccentToggle")?.addEventListener("click", () => {
    accentMode = accentMode === "us" ? "uk" : "us";
    setStorageItem(ACCENT_STORAGE_KEY, accentMode);
    syncAccentUI();
    showToast(accentMode === "uk" ? "已切换为英音 (UK)" : "已切换为美音 (US)");
    const active = detailStack[detailStack.length - 1];
    if (active) speakWord(active.w);
  });

  optById("randomWordBtn")?.addEventListener("click", () => {
    if (vocabList.length === 0) return;
    const rand = vocabList[Math.floor(Math.random() * vocabList.length)];
    if (!rand) return;
    wordInput.value = rand._headLower || rand.w;
    renderMainWorkspace(wordInput.value, true);
    if (!isDesktopViewport()) {
      const first = currentDisplayedItems[0];
      if (first) openWordDetail(first.primary, "reset", true);
    }
  });

  optById("clearHistoryBtn")?.addEventListener("click", () => {
    searchHistory = [];
    removeStorageItem(STORAGE_KEY_HISTORY);
    renderHistoryChips();
  });

  optById("btnDetailBack")?.addEventListener("click", () => {
    if (detailStack.length <= 1) return;
    detailStack.pop();
    const prev = detailStack[detailStack.length - 1];
    if (prev) renderDetailEntry(prev, false);
  });

  optById("mobileDetailCloseBtn")?.addEventListener("click", closeMobileDetailSheet);

  optById("btnOpenBatchModal")?.addEventListener("click", () => openModal("batchModal"));
  optById("btnOpenManagerModal")?.addEventListener("click", () => openModal("managerModal"));

  optById("btnRunBatchText")?.addEventListener("click", () => {
    const raw = optById<HTMLTextAreaElement>("batchTextInput")?.value || "";
    const words = extractWordsFromFreeText(raw);
    runBatchWordCheck(words, "文本批量判定");
  });

  for (const id of ["browseUnitSelect", "browseFontSelect"]) {
    optById(id)?.addEventListener("change", () => {
      renderMainWorkspace(wordInput.value, false);
    });
  }

  optById("listLoadMoreBtn")?.addEventListener("click", () => {
    listRenderLimit += 60;
    const res = lookupWordInTextbook(vocabList, wordInput.value, selectedBookScope);
    renderListSlice(res?.normalizedQuery || "", false);
  });

  const csvInput = byId<HTMLInputElement>("csvFileInput");
  byId("selectCsvFilesBtn").addEventListener("click", () => {
    csvInput.value = "";
    csvInput.click();
  });
  csvInput.addEventListener("change", () => {
    void handleCsvFilesSelected(csvInput.files);
  });

  const batchWordCsvInput = byId<HTMLInputElement>("batchWordCsvInput");
  byId("importBatchWordCsvBtn").addEventListener("click", () => {
    batchWordCsvInput.value = "";
    batchWordCsvInput.click();
  });
  batchWordCsvInput.addEventListener("change", async () => {
    const files = batchWordCsvInput.files;
    if (!files || files.length === 0) return;
    let allWords: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f) continue;
      try {
        const text = await readCsvFileSmart(f);
        allWords = allWords.concat(extractWordsFromBatchCSV(text));
      } catch {
        // skip
      }
    }
    const label =
      files.length === 1 ? (files[0]?.name ?? "导入词表.csv") : `${files.length}个文件合并`;
    runBatchWordCheck(allWords, label);
  });

  byId("demoBatchWordCsvBtn").addEventListener("click", () => {
    const sampleWords = [
      "abandon",
      "looking",
      "applied",
      "arose",
      "recognise",
      "sign",
      "adaptations",
      "serendipity",
      "strengthened",
      "ephemeral",
      "volcanoes",
      "take notes",
    ];
    const textarea = optById<HTMLTextAreaElement>("batchTextInput");
    if (textarea) textarea.value = sampleWords.join(", ");
    runBatchWordCheck(sampleWords, "示例词表");
  });

  byId("exportBatchCsvBtn").addEventListener("click", exportBatchCheckResultsAsCSV);
  byId("copyBatchTableBtn").addEventListener("click", () => void copyBatchCheckResultsAsTSV());

  byId("resetDefaultDbBtn").addEventListener("click", () => {
    vocabList = builtinVocab.map((e) => ({ ...e }));
    indexAllEntries(vocabList);
    selectedBookScope = "ALL";
    removeStorageItem(STORAGE_KEY_CUSTOM_VOCAB);
    removeStorageItem("pep_iphone_vocab_custom_v1");
    renderBookFilterBarAndManager();
    renderMainWorkspace(wordInput.value, false);
    showToast(`已恢复默认全量词库 (${vocabList.length.toLocaleString()} 词)`);
  });

  // Delegated click handlers
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const closeBtn = target.closest<HTMLElement>("[data-close-modal]");
    if (closeBtn) {
      const modalId = closeBtn.getAttribute("data-close-modal");
      if (modalId) closeModal(modalId);
      return;
    }

    if (target.classList.contains("vc-modal-backdrop") && target.id) {
      closeModal(target.id);
      return;
    }

    const speakBtn = target.closest<HTMLElement>(".speak-btn");
    if (speakBtn) {
      e.stopPropagation();
      speakWord(speakBtn.getAttribute("data-speak-word") || "");
      return;
    }

    const wordRow = target.closest<HTMLElement>(".vc-word-row[data-row-idx]");
    if (wordRow) {
      const idx = Number(wordRow.dataset.rowIdx);
      updateActiveRowSelection(idx, true);
      return;
    }

    const quickChip = target.closest<HTMLElement>(".quick-word-chip");
    if (quickChip) {
      const w = quickChip.getAttribute("data-quick-word");
      if (w) {
        wordInput.value = w;
        renderMainWorkspace(w, true);
        if (!isDesktopViewport()) {
          const first = currentDisplayedItems[0];
          if (first) openWordDetail(first.primary, "reset", true);
        }
      }
      return;
    }

    const scopePill = target.closest<HTMLElement>(".vc-scope-pill");
    if (scopePill) {
      selectedBookScope = scopePill.getAttribute("data-book-scope") || "ALL";
      renderBookFilterBarAndManager();
      renderMainWorkspace(wordInput.value, false);
      const batchSec = optById("batchCheckResultSection");
      if (batchCheckResults.length > 0 && batchSec && !batchSec.hidden) {
        runBatchWordCheck(
          batchCheckResults.map((r) => r.inputWord),
          batchCurrentFileName,
        );
      }
      return;
    }

    if (target.closest("#btnOpenDirectFromBanner")) {
      const w = optById("btnOpenDirectFromBanner")?.dataset.directWord || wordInput.value.trim();
      if (w) openWordByName(w, "", "", "", "reset", true);
      return;
    }

    if (target.closest("#switchAllBooksBtn")) {
      selectedBookScope = "ALL";
      renderBookFilterBarAndManager();
      renderMainWorkspace(wordInput.value, false);
      return;
    }

    const directBtn = target.closest<HTMLElement>(".open-direct-card-btn");
    if (directBtn) {
      const dw = directBtn.getAttribute("data-open-direct-word") || "";
      if (dw) openWordByName(dw, "", "", "", "reset", true);
      return;
    }

    const jumpBtn = target.closest<HTMLElement>(".modal-jump-word-btn");
    if (jumpBtn) {
      const targetW = jumpBtn.getAttribute("data-open-word") || "";
      const targetB = jumpBtn.getAttribute("data-open-book") || "";
      const targetPos = jumpBtn.getAttribute("data-open-pos") || "";
      const targetMean = jumpBtn.getAttribute("data-open-mean") || "";
      if (targetW) openWordByName(targetW, targetB, targetPos, targetMean, "push", true);
      return;
    }

    const batchPill = target.closest<HTMLElement>(".batch-filter-pill");
    if (batchPill) {
      batchCurrentFilter =
        (batchPill.getAttribute("data-batch-filter") as BatchFilterMode | null) ?? "ALL";
      renderBatchCheckTable();
      return;
    }

    const batchRow = target.closest<HTMLElement>("[data-batch-card-idx], [data-batch-row-idx]");
    if (batchRow) {
      const idxStr =
        batchRow.getAttribute("data-batch-card-idx") ?? batchRow.getAttribute("data-batch-row-idx");
      const rItem = batchCheckResults[Number(idxStr)];
      if (rItem) {
        closeModal("batchModal");
        const firstMatch = rItem.matches[0];
        if (rItem.isInTextbook && firstMatch) {
          openWordDetail(firstMatch, "reset", true);
        } else {
          openWordByName(
            rItem.matchedLemma || rItem.normalized || rItem.inputWord,
            "",
            "",
            "",
            "reset",
            true,
          );
        }
      }
    }
  });

  // Keyboard navigation (/, ArrowUp, ArrowDown, Enter, Escape)
  window.addEventListener("keydown", (e) => {
    const batchOpen = !byId("batchModal").hidden;
    const managerOpen = !byId("managerModal").hidden;

    if (e.key === "Escape") {
      if (batchOpen) {
        closeModal("batchModal");
        return;
      }
      if (managerOpen) {
        closeModal("managerModal");
        return;
      }
      const pane = optById("detailPane");
      if (pane?.classList.contains("is-mobile-open")) {
        closeMobileDetailSheet();
        return;
      }
      if (wordInput.value) {
        wordInput.value = "";
        renderMainWorkspace("", false);
        wordInput.focus();
      }
      return;
    }

    if (batchOpen || managerOpen) return;
    if (document.getElementById("cmdPaletteBackdrop")?.classList.contains("open")) return;

    const activeTag = document.activeElement?.tagName || "";
    const inTextControl =
      activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";

    if (e.key === "/" && !inTextControl && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      wordInput.focus();
      wordInput.select();
      return;
    }

    if (e.key === "ArrowDown" && currentDisplayedItems.length > 0 && activeTag !== "SELECT") {
      e.preventDefault();
      const next =
        selectedRowIndex < 0 ? 0 : Math.min(currentDisplayedItems.length - 1, selectedRowIndex + 1);
      if (next >= listRenderLimit) {
        listRenderLimit = Math.min(currentDisplayedItems.length, next + 40);
        const res = lookupWordInTextbook(vocabList, wordInput.value, selectedBookScope);
        renderListSlice(res?.normalizedQuery || "", false);
      }
      updateActiveRowSelection(next, false);
      return;
    }

    if (e.key === "ArrowUp" && currentDisplayedItems.length > 0 && activeTag !== "SELECT") {
      e.preventDefault();
      const prev = selectedRowIndex <= 0 ? 0 : selectedRowIndex - 1;
      updateActiveRowSelection(prev, false);
      return;
    }

    if (e.key === "Enter" && !inTextControl) {
      const current = detailStack[detailStack.length - 1];
      if (current) {
        e.preventDefault();
        speakWord(current.w);
      }
    }
  });
}

if (document.readyState !== "loading") {
  void initApp();
} else {
  window.addEventListener("DOMContentLoaded", () => {
    void initApp();
  });
}
