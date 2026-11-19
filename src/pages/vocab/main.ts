import "@/core/fonts";
import "@/styles/vocab.css";
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
import { createWordCardHtml, renderBatchTableRowsHtml, renderBrowseCardItemsHtml } from "./render";
import {
  formatShortUnitBadge,
  formatUnitLabel,
  getShortBookName,
  getUniqueBooks,
  indexAllEntries,
  judgeWordByTextbookStandard,
  lookupWordInTextbook,
  normalizeWordStr,
} from "./search";
import type { BatchCheckResult, BatchFilterMode, VocabEntry, VocabTab } from "./types";
import { COMPLETE_ROOT_FAMILIES } from "./word-knowledge";

let builtinVocab: VocabEntry[] = [];
let vocabList: VocabEntry[] = [];
let selectedBookScope = "ALL";
let searchHistory: string[] = [];
let browseRenderLimit = 60;
let lookupRenderLimit = 40;
let batchCheckResults: BatchCheckResult[] = [];
let batchCurrentFilter: BatchFilterMode = "ALL";
let batchCurrentFileName = "导入词表.csv";
let currentDisplayedEntries: VocabEntry[] = [];
let currentDetailEntry: VocabEntry | null = null;
let toastTimer: number | null = null;

function showToast(msg: string): void {
  const banner = optById("toastBanner");
  const textEl = optById("toastText");
  if (!banner || !textEl) return;
  textEl.textContent = msg;
  banner.classList.remove("opacity-0", "-translate-y-2");
  banner.classList.add("opacity-100", "translate-y-0");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    banner.classList.remove("opacity-100", "translate-y-0");
    banner.classList.add("opacity-0", "-translate-y-2");
  }, 2200);
}

function speakWord(wordText: string): void {
  if (!("speechSynthesis" in window)) {
    showToast("当前浏览器不支持语音朗读");
    return;
  }
  let cleanSpeak = String(wordText || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\/.*$/, "")
    .replace(/\.\.\.|…/g, "")
    .trim();
  if (!cleanSpeak) cleanSpeak = wordText;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(cleanSpeak);
    utter.lang = "en-US";
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  } catch {
    showToast("语音播放失败");
  }
}

async function copyEntryInfo(entry: VocabEntry): Promise<void> {
  const text = `${entry.w} ${entry.p ? `[${entry.p}] ` : ""}${entry.m} —— ${entry.b} · ${formatShortUnitBadge(entry.u)}`;
  const ok = await copyToClipboard(text);
  showToast(ok ? "已复制课本词条信息" : "复制失败");
}

function openWordDetailCard(entry: VocabEntry): void {
  if (!entry) return;
  currentDetailEntry = entry;
  const coreWord = extractCoreBaseWord(entry);
  void fetchCloudDerivativesIfNeeded(coreWord, (cleanW) => {
    if (!currentDetailEntry) return;
    const curCore = extractCoreBaseWord(currentDetailEntry);
    if (curCore === cleanW || normalizeWordStr(currentDetailEntry.w) === cleanW) {
      const updatedData = generateWordDetailData(vocabList, currentDetailEntry);
      if (updatedData) {
        const bodyEl = optById("modalBodyContent");
        const dtBody = optById("desktopBodyContent");
        if (bodyEl) bodyEl.innerHTML = updatedData.bodyHtml;
        if (dtBody) dtBody.innerHTML = updatedData.bodyHtml;
      }
    }
  });

  const data = generateWordDetailData(vocabList, entry);
  if (!data) return;

  const modal = optById("wordDetailModal");
  const titleEl = optById("modalWordTitle");
  const posEl = optById("modalWordPos");
  const badgesEl = optById("modalWordBadges");
  const bodyEl = optById("modalBodyContent");
  const speakBtn = optById<HTMLButtonElement>("modalSpeakBtn");

  if (titleEl) titleEl.textContent = data.word;
  if (posEl) {
    if (data.pos) {
      posEl.textContent = data.pos;
      posEl.classList.remove("hidden");
    } else {
      posEl.classList.add("hidden");
    }
  }
  if (badgesEl) badgesEl.innerHTML = data.badgesHtml;
  if (bodyEl) {
    bodyEl.innerHTML = data.bodyHtml;
    bodyEl.scrollTop = 0;
  }
  if (speakBtn) speakBtn.onclick = () => speakWord(entry.w);

  const dtPlaceholder = optById("desktopDetailPlaceholder");
  const dtContent = optById("desktopDetailContent");
  const dtTitle = optById("desktopWordTitle");
  const dtPos = optById("desktopWordPos");
  const dtBadges = optById("desktopWordBadges");
  const dtBody = optById("desktopBodyContent");
  const dtSpeak = optById<HTMLButtonElement>("desktopSpeakBtn");

  if (dtPlaceholder && dtContent) {
    dtPlaceholder.classList.add("hidden");
    dtContent.classList.remove("hidden");
    if (dtTitle) dtTitle.textContent = data.word;
    if (dtPos) {
      if (data.pos) {
        dtPos.textContent = data.pos;
        dtPos.classList.remove("hidden");
      } else {
        dtPos.classList.add("hidden");
      }
    }
    if (dtBadges) dtBadges.innerHTML = data.badgesHtml;
    if (dtBody) dtBody.innerHTML = data.bodyHtml;
    if (dtSpeak) dtSpeak.onclick = () => speakWord(entry.w);
  }

  if (modal) {
    if (window.innerWidth < 900) modal.classList.remove("hidden");
    else modal.classList.add("hidden");
  }
}

function closeWordDetailCard(): void {
  const modal = optById("wordDetailModal");
  if (modal) modal.classList.add("hidden");
}

function renderHistoryChips(): void {
  const sec = byId("historySection");
  const wrap = byId("historyChips");
  if (!searchHistory || searchHistory.length === 0) {
    sec.classList.add("hidden");
    return;
  }
  sec.classList.remove("hidden");
  wrap.innerHTML = searchHistory
    .map(
      (w) => `
    <button type="button" data-quick-word="${escapeHtml(w)}" class="quick-word-chip ios-btn-active px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium">
      ${escapeHtml(w)}
    </button>
  `,
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

function updateBrowseUnitSelectOptions(): void {
  const browseBookSelect = optById<HTMLSelectElement>("browseBookSelect");
  const browseUnitSelect = optById<HTMLSelectElement>("browseUnitSelect");
  if (!browseBookSelect || !browseUnitSelect) return;
  const bVal = browseBookSelect.value;
  const prevU = browseUnitSelect.value || "ALL";

  const unitsSet = new Set<string>();
  for (const e of vocabList) {
    if ((bVal === "ALL" || e.b === bVal) && e.u) {
      unitsSet.add(String(e.u).trim());
    }
  }

  const unitsArr = Array.from(unitsSet);
  unitsArr.sort((a, b) => {
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number.parseInt(a, 10) - Number.parseInt(b, 10);
    return a.localeCompare(b);
  });

  const isCet = bVal.includes("四级") || bVal.includes("六级") || bVal.includes("CET");
  let opts = `<option value="ALL">全部${isCet ? "字母组" : "单元"}</option>`;
  for (const u of unitsArr) {
    opts += `<option value="${escapeHtml(u)}">${escapeHtml(formatUnitLabel(u))}</option>`;
  }
  browseUnitSelect.innerHTML = opts;
  if (Array.from(browseUnitSelect.options).some((o) => o.value === prevU)) {
    browseUnitSelect.value = prevU;
  } else {
    browseUnitSelect.value = "ALL";
  }
}

function renderBookFilterBarAndSelects(): void {
  const books = getUniqueBooks(vocabList);
  const totalCount = vocabList.length;

  byId("headerStats").textContent =
    `已加载 ${books.length} 册词库 · ${totalCount.toLocaleString()} 词条`;
  byId("loadedSummaryText").textContent =
    `共 ${books.length} 册 · ${totalCount.toLocaleString()} 个词条`;

  const pillBar = byId("lookupBookFilterBar");
  let pillsHtml = `
    <button type="button" data-book-scope="ALL" class="book-scope-pill shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition ${
      selectedBookScope === "ALL"
        ? "bg-[#007AFF] text-white shadow-sm"
        : "bg-gray-100 text-gray-600"
    }">
      全部词库 (${totalCount.toLocaleString()})
    </button>
  `;
  for (const [bName, count] of books) {
    const active = selectedBookScope === bName;
    const isCet = bName.includes("四级") || bName.includes("六级") || bName.includes("CET");
    const icon = isCet ? "🎓 " : "";
    pillsHtml += `
      <button type="button" data-book-scope="${escapeHtml(bName)}" class="book-scope-pill shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition ${
        active ? "bg-[#007AFF] text-white shadow-sm" : "bg-gray-100 text-gray-600"
      }">
        ${icon}${escapeHtml(getShortBookName(bName))} (${count.toLocaleString()})
      </button>
    `;
  }
  pillBar.innerHTML = pillsHtml;

  const browseBookSelect = byId<HTMLSelectElement>("browseBookSelect");
  const prevVal = browseBookSelect.value || "ALL";
  let optsHtml = `<option value="ALL">全部词库 (${totalCount.toLocaleString()})</option>`;
  for (const [bName, count] of books) {
    optsHtml += `<option value="${escapeHtml(bName)}">${escapeHtml(getShortBookName(bName))} (${count.toLocaleString()} 词)</option>`;
  }
  browseBookSelect.innerHTML = optsHtml;
  if (Array.from(browseBookSelect.options).some((o) => o.value === prevVal)) {
    browseBookSelect.value = prevVal;
  }

  updateBrowseUnitSelectOptions();

  byId("loadedBooksList").innerHTML = books
    .map(
      ([bName, count]) => `
    <div class="py-2.5 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
        <span class="font-semibold text-gray-800 truncate">${escapeHtml(bName)}</span>
      </div>
      <span class="text-gray-500 font-medium shrink-0 ml-2">${count} 词</span>
    </div>
  `,
    )
    .join("");
}

function renderBatchCheckTable(): void {
  const total = batchCheckResults.length;
  const yesCount = batchCheckResults.filter((r) => r.isInTextbook).length;
  const noCount = total - yesCount;
  const scopeName =
    selectedBookScope === "ALL" ? "全部词库 (含四六级)" : getShortBookName(selectedBookScope);

  byId("batchFileNameBadge").textContent = `${batchCurrentFileName}（标准: ${scopeName}）`;
  byId("batchSummaryStats").innerHTML =
    `共检测 <strong>${total}</strong> 词：<span class="text-emerald-700 font-bold">✅ 在课本中 ${yesCount} 词</span> ｜ <span class="text-red-600 font-bold">❌ 不在课本中 ${noCount} 词</span>`;

  for (const btn of document.querySelectorAll(".batch-filter-pill")) {
    const f = btn.getAttribute("data-batch-filter");
    const active = f === batchCurrentFilter;
    btn.className = `batch-filter-pill px-2.5 py-1 rounded-full text-xs font-semibold transition ${
      active ? "bg-[#007AFF] text-white shadow-sm" : "bg-gray-100 text-gray-600"
    }`;
    if (f === "ALL") btn.textContent = `全部 (${total})`;
    if (f === "YES") btn.textContent = `✅ 在课本中 (${yesCount})`;
    if (f === "NO") btn.textContent = `❌ 不在课本中 (${noCount})`;
  }

  const filtered = batchCheckResults.filter((r) => {
    if (batchCurrentFilter === "YES") return r.isInTextbook;
    if (batchCurrentFilter === "NO") return !r.isInTextbook;
    return true;
  });

  byId("batchTableBody").innerHTML = renderBatchTableRowsHtml(batchCheckResults, filtered);
}

function runBatchWordCheck(wordArray: string[], sourceLabel = "导入词表.csv"): void {
  if (!wordArray || wordArray.length === 0) {
    showToast("未在文件中识别到有效单词");
    return;
  }
  batchCurrentFileName = sourceLabel;
  batchCheckResults = wordArray
    .map((w) => judgeWordByTextbookStandard(vocabList, w, selectedBookScope))
    .filter((item): item is BatchCheckResult => item !== null);

  batchCurrentFilter = "ALL";
  renderBatchCheckTable();

  const sec = byId("batchCheckResultSection");
  sec.classList.remove("hidden");
  sec.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  showToast("已导出判定结果 CSV 表格");
}

async function copyBatchCheckResultsAsTSV(): Promise<void> {
  if (batchCheckResults.length === 0) return;
  const text = buildBatchExportTSV(batchCheckResults);
  const ok = await copyToClipboard(text);
  showToast(ok ? "已复制表格内容，可直接粘贴到Excel/备忘录" : "复制失败");
}

function renderLookupResults(rawQuery: string, saveToHistory = false, resetLimit = true): void {
  const container = byId("searchResultContainer");
  const idlePanel = byId("IdleHelperPanel");
  const clearBtn = byId("clearInputBtn");

  if (resetLimit) {
    lookupRenderLimit = 40;
  }

  if (!rawQuery || !rawQuery.trim()) {
    container.innerHTML = "";
    idlePanel.classList.remove("hidden");
    clearBtn.classList.add("hidden");
    return;
  }

  clearBtn.classList.remove("hidden");
  idlePanel.classList.add("hidden");

  const res = lookupWordInTextbook(vocabList, rawQuery, selectedBookScope);
  if (!res) return;

  if (saveToHistory) {
    addSearchHistory(res.rawQuery);
  }

  currentDisplayedEntries = [];
  let html = "";

  const primaryTargetWord = res.recognizedLemmas[0] ?? res.normalizedQuery;

  if (res.recognizedLemmas.length > 0) {
    html += `
      <div class="ios-card p-3 bg-purple-50/60 border border-purple-200 flex items-center justify-between gap-2 animate-fade-in">
        <div class="text-xs text-purple-900">
          ✨ <strong>多重形式识别：</strong>输入 <span class="font-bold">“${escapeHtml(res.rawQuery)}”</span> 已自动还原原形 <span class="font-bold text-purple-700 bg-white px-1.5 py-0.5 rounded border border-purple-200">${escapeHtml(res.recognizedLemmas.join(" / "))}</span>
        </div>
        <button type="button" data-open-direct-word="${escapeHtml(primaryTargetWord)}" class="open-direct-card-btn ios-btn-active shrink-0 text-xs font-bold text-purple-700 bg-white border border-purple-200 px-2.5 py-1.5 rounded-xl shadow-sm">
          📇 全部同根词/变形 ›
        </button>
      </div>
    `;
  } else if (/^[a-zA-Z-]+$/.test(res.normalizedQuery) && res.normalizedQuery.length >= 2) {
    html += `
      <div class="ios-card p-3 bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-2 animate-fade-in">
        <div class="text-xs text-emerald-900">
          📇 想查看 <strong>“${escapeHtml(res.rawQuery)}”</strong> 的<strong>所有不同形式</strong>与<strong>全部同根词（含非CSV拓展）</strong>？
        </div>
        <button type="button" data-open-direct-word="${escapeHtml(res.normalizedQuery)}" class="open-direct-card-btn ios-btn-active shrink-0 text-xs font-bold text-emerald-700 bg-white border border-emerald-200 px-2.5 py-1.5 rounded-xl shadow-sm">
          打开单词卡片 ›
        </button>
      </div>
    `;
  }

  if (res.fragmentMatches.length > 0) {
    const total = res.fragmentMatches.length;
    const slice = res.fragmentMatches.slice(0, lookupRenderLimit);

    html += `
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-[#34C759]"></span>
          <span class="text-xs font-semibold text-gray-700">
            匹配 <strong class="text-blue-600">“${escapeHtml(res.rawQuery)}”</strong> 的课本词条共 <strong class="text-blue-600">${total}</strong> 个
            <span class="text-[11px] text-gray-400 font-medium">（点击卡片看同根词/变形）</span>
          </span>
        </div>
        ${selectedBookScope !== "ALL" ? `<span class="text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md shrink-0">筛选: ${escapeHtml(getShortBookName(selectedBookScope))}</span>` : ""}
      </div>
    `;

    for (const entry of slice) {
      const idx = currentDisplayedEntries.length;
      currentDisplayedEntries.push(entry);
      html += createWordCardHtml(entry, idx, res.normalizedQuery);
    }

    if (total > lookupRenderLimit) {
      html += `
        <div class="text-center pt-1">
          <button id="lookupLoadMoreBtn" type="button" class="ios-btn-active w-full py-2.5 rounded-xl bg-white border border-gray-200 text-blue-600 font-semibold text-sm shadow-sm">
            显示更多匹配词条（剩余 ${total - lookupRenderLimit} 个）
          </button>
        </div>
      `;
    }
  } else {
    html += `
      <div class="ios-card p-5 text-center space-y-2.5 border-2 border-red-100 animate-fade-in">
        <div class="w-12 h-12 rounded-full bg-red-50 text-[#FF3B30] mx-auto flex items-center justify-center">
          <svg class="w-6 h-6" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div class="text-lg font-bold text-[#FF3B30]">不在课本中</div>
        <p class="text-xs text-gray-500 leading-relaxed">
          课本词库中没有包含 <strong class="text-gray-800">“${escapeHtml(res.rawQuery)}”</strong>${res.queryLemmas.length > 0 ? `（或原形 ${escapeHtml(res.queryLemmas.slice(0, 3).join("/"))}）` : ""} 的单词或词组。
        </p>
        ${
          res.matchesInOtherBooks.length > 0
            ? `<div class="pt-2">
            <button type="button" id="switchAllBooksBtn" class="ios-btn-active text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
              💡 该词在其他册别中匹配到 ${res.matchesInOtherBooks.length} 个词条，点击切换「全部册别」查看
            </button>
          </div>`
            : ""
        }
      </div>
    `;

    if (res.typoMatches.length > 0) {
      html += `
        <div class="ios-card p-3.5 space-y-2.5 border border-blue-200/80 bg-blue-50/40">
          <div class="text-xs font-bold text-blue-950">🔎 拼写相近提示：您是不是想找以下课本词条？（点击查看详细位置）</div>
          <div class="space-y-2">
            ${res.typoMatches
              .map(
                (p) => `
              <button type="button" data-quick-word="${escapeHtml(p._headLower || p.w)}" class="quick-word-chip ios-btn-active w-full text-left bg-white p-2.5 rounded-xl border border-blue-100 flex items-center justify-between">
                <div>
                  <span class="font-bold text-gray-900 text-sm">${escapeHtml(p.w)}</span>
                  <span class="text-xs text-gray-500 ml-1.5">${escapeHtml(p.p)} ${escapeHtml(p.m)}</span>
                </div>
                <span class="text-[11px] font-semibold text-blue-600 shrink-0 ml-2">${escapeHtml(getShortBookName(p.b))} · ${escapeHtml(formatShortUnitBadge(p.u))}</span>
              </button>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function getFilteredBrowseEntries(): VocabEntry[] {
  const bVal = byId<HTMLSelectElement>("browseBookSelect").value;
  const uVal = byId<HTMLSelectElement>("browseUnitSelect").value;
  const fVal = byId<HTMLSelectElement>("browseFontSelect").value;
  const qVal = normalizeWordStr(byId<HTMLInputElement>("browseFilterInput").value);

  return vocabList.filter((e) => {
    if (bVal !== "ALL" && e.b !== bVal) return false;
    if (uVal !== "ALL" && String(e.u).toLowerCase() !== uVal.toLowerCase()) return false;
    if (fVal === "黑体" && e.f !== "黑体") return false;
    if (fVal === "白体" && e.f !== "白体") return false;
    if (fVal === "专有名词" && (!e.n || !e.n.includes("专有名词"))) return false;
    if (qVal) {
      const matchW = e.w.toLowerCase().includes(qVal);
      const matchM = (e.m || "").toLowerCase().includes(qVal);
      if (!matchW && !matchM) return false;
    }
    return true;
  });
}

function renderBrowseList(): void {
  const filtered = getFilteredBrowseEntries();
  byId("browseCountBadge").textContent = `${filtered.length} 词`;
  const container = byId("browseListContainer");
  const loadMoreWrap = byId("browseLoadMoreWrap");

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="ios-card p-6 text-center text-xs text-gray-400">
        当前筛选条件下暂无词条
      </div>
    `;
    loadMoreWrap.classList.add("hidden");
    return;
  }

  const slice = filtered.slice(0, browseRenderLimit);
  container.innerHTML = renderBrowseCardItemsHtml(slice);

  if (filtered.length > browseRenderLimit) {
    loadMoreWrap.classList.remove("hidden");
  } else {
    loadMoreWrap.classList.add("hidden");
  }
}

function switchTab(tabName: VocabTab): void {
  const views: Record<VocabTab, HTMLElement> = {
    lookup: byId("viewLookup"),
    browse: byId("viewBrowse"),
    import: byId("viewImport"),
  };
  for (const k of Object.keys(views) as VocabTab[]) {
    if (k === tabName) views[k].classList.remove("hidden");
    else views[k].classList.add("hidden");
  }

  for (const btn of document.querySelectorAll(".nav-tab-btn")) {
    const isTarget = btn.getAttribute("data-tab") === tabName;
    btn.classList.toggle("text-[#007AFF]", isTarget);
    btn.classList.toggle("text-gray-400", !isTarget);
  }

  for (const btn of document.querySelectorAll(".desktop-nav-tab")) {
    const isTarget = btn.getAttribute("data-tab") === tabName;
    btn.classList.toggle("text-blue-600", isTarget);
    btn.classList.toggle("bg-white", isTarget);
    btn.classList.toggle("shadow-xs", isTarget);
    btn.classList.toggle("text-gray-600", !isTarget);
  }

  if (tabName === "browse") {
    renderBrowseList();
  }
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

  renderBookFilterBarAndSelects();
  renderBrowseList();
  showToast(`成功导入 ${fileList.length} 个文件（共加载 ${vocabList.length} 词条）`);

  const syncCheckbox = optById<HTMLInputElement>("syncToD1Checkbox");
  if (syncCheckbox?.checked) {
    const pwd = window.prompt("请输入管理员密码以同步至 Cloudflare D1 云端数据库:", "");
    if (pwd) {
      try {
        showToast("正在向 Cloudflare D1 云端数据库同步...");
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
          showToast(
            `☁️ D1 云端同步完成！成功写入 ${resData.inserted ?? importedEntries.length} 词条`,
          );
        } else {
          showToast(`⚠️ 云端同步未成功: ${resData.error || resData.message || "密码或网络错误"}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "网络错误";
        showToast(`⚠️ 云端网络请求失败: ${msg}`);
      }
    }
  }

  switchTab("lookup");
}

async function initApp(): Promise<void> {
  initAppShell({ activePage: "vocab" });
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
    // ignore cleanup error
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
    // ignore parse error
  }

  let cachedBaseline: VocabEntry[] | null = null;
  try {
    const idbWords = await getIdbCachedVocab();
    if (Array.isArray(idbWords) && idbWords.length >= 10000) {
      cachedBaseline = idbWords;
    }
  } catch {
    // ignore idb error
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
      // ignore local cache parse error
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
    byId("headerStats").textContent = "正在加载综合词库数据 (1.1万词)...";
  }

  const isForeground = !cachedBaseline && !loadedCustom;
  void fetchBaselineVocabData()
    .then((result) => {
      if (!result) return;
      builtinVocab = result.words;
      if (!getStorageItem(STORAGE_KEY_CUSTOM_VOCAB)) {
        vocabList = builtinVocab.map((e) => ({ ...e }));
        indexAllEntries(vocabList);
        renderBookFilterBarAndSelects();
        const currentQ = optById<HTMLInputElement>("wordInput")?.value.trim() || "";
        if (currentQ) {
          renderLookupResults(currentQ, false);
        }
        if (isForeground) {
          showToast(
            `词库加载完成 (${vocabList.length.toLocaleString()} 词${result.fromD1 ? " · D1云端同步" : " · 本地全量"})`,
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
    // ignore history error
  }

  renderBookFilterBarAndSelects();
  renderHistoryChips();

  const wordInput = byId<HTMLInputElement>("wordInput");
  const searchForm = byId<HTMLFormElement>("searchForm");
  const clearInputBtn = byId<HTMLButtonElement>("clearInputBtn");

  if (initialQuery) {
    wordInput.value = initialQuery;
    renderLookupResults(initialQuery, true);
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    renderLookupResults(wordInput.value, true);
    wordInput.blur();
  });

  wordInput.addEventListener("input", () => {
    renderLookupResults(wordInput.value, false);
  });

  clearInputBtn.addEventListener("click", () => {
    wordInput.value = "";
    renderLookupResults("", false);
    wordInput.focus();
  });

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const desktopTab = target.closest<HTMLElement>(".desktop-nav-tab");
    if (desktopTab) {
      const tab = desktopTab.getAttribute("data-tab") as VocabTab | null;
      if (tab) switchTab(tab);
      return;
    }

    const quickChip = target.closest<HTMLElement>(".quick-word-chip");
    if (quickChip) {
      const w = quickChip.getAttribute("data-quick-word");
      if (w) {
        switchTab("lookup");
        wordInput.value = w;
        renderLookupResults(w, true);
      }
      return;
    }

    const scopePill = target.closest<HTMLElement>(".book-scope-pill");
    if (scopePill) {
      selectedBookScope = scopePill.getAttribute("data-book-scope") || "ALL";
      renderBookFilterBarAndSelects();
      if (wordInput.value.trim()) {
        renderLookupResults(wordInput.value, false);
      }
      const batchSec = optById("batchCheckResultSection");
      if (batchCheckResults.length > 0 && batchSec && !batchSec.classList.contains("hidden")) {
        const rawWords = batchCheckResults.map((r) => r.inputWord);
        runBatchWordCheck(rawWords, batchCurrentFileName);
      }
      return;
    }

    const batchPill = target.closest<HTMLElement>(".batch-filter-pill");
    if (batchPill) {
      const mode = (batchPill.getAttribute("data-batch-filter") as BatchFilterMode | null) ?? "ALL";
      batchCurrentFilter = mode;
      renderBatchCheckTable();
      return;
    }

    const batchRowOrBtn = target.closest<HTMLElement>(
      "[data-batch-card-idx], [data-batch-row-idx]",
    );
    if (batchRowOrBtn) {
      const idxStr =
        batchRowOrBtn.getAttribute("data-batch-card-idx") ??
        batchRowOrBtn.getAttribute("data-batch-row-idx");
      const rItem = batchCheckResults[Number(idxStr)];
      if (rItem) {
        const firstMatch = rItem.matches[0];
        if (rItem.isInTextbook && firstMatch) {
          openWordDetailCard(firstMatch);
        } else {
          const targetW = rItem.matchedLemma || rItem.normalized;
          let famMember: { p: string; m: string } | null = null;
          for (const fam of COMPLETE_ROOT_FAMILIES) {
            const m = fam.members.find((x) => normalizeWordStr(x.w) === targetW);
            if (m) {
              famMember = m;
              break;
            }
          }
          openWordDetailCard({
            w: rItem.inputWord,
            p: famMember ? famMember.p : "",
            m: famMember ? famMember.m : "（课外拓展词 · 查看下方全形态变形与同根词家族）",
            b: "拓展同根词库",
            u: "非CSV",
            f: "拓展",
            n: "",
            inCsv: false,
          });
        }
      }
      return;
    }

    if (target.closest("#switchAllBooksBtn")) {
      selectedBookScope = "ALL";
      renderBookFilterBarAndSelects();
      renderLookupResults(wordInput.value, false);
      return;
    }

    if (target.closest("#lookupLoadMoreBtn")) {
      lookupRenderLimit += 40;
      renderLookupResults(wordInput.value, false, false);
      return;
    }

    const speakBtn = target.closest<HTMLElement>(".speak-btn");
    if (speakBtn) {
      speakWord(speakBtn.getAttribute("data-speak-word") || "");
      return;
    }

    const copyBtn = target.closest<HTMLElement>(".copy-btn");
    if (copyBtn) {
      const idx = Number(copyBtn.getAttribute("data-copy-idx"));
      const entry = currentDisplayedEntries[idx];
      if (entry) {
        void copyEntryInfo(entry);
      }
      return;
    }

    if (target.closest("#modalCloseBtn") || target.id === "wordDetailBackdrop") {
      closeWordDetailCard();
      return;
    }

    const directCardBtn = target.closest<HTMLElement>(".open-direct-card-btn");
    if (directCardBtn) {
      const dw = directCardBtn.getAttribute("data-open-direct-word") || "";
      const normDw = normalizeWordStr(dw);
      const exactFound = vocabList.find(
        (item) => (item._headLower || normalizeWordStr(item.w)) === normDw,
      );
      if (exactFound) {
        openWordDetailCard(exactFound);
      } else {
        let famMember: { p: string; m: string } | null = null;
        for (const fam of COMPLETE_ROOT_FAMILIES) {
          const m = fam.members.find((x) => normalizeWordStr(x.w) === normDw);
          if (m) {
            famMember = m;
            break;
          }
        }
        openWordDetailCard({
          w: dw,
          p: famMember ? famMember.p : "",
          m: famMember ? famMember.m : "（查看下方全形态词形变化、一词多义与全部同根词）",
          b: "拓展同根词库",
          u: "非CSV",
          f: "拓展",
          n: "",
          inCsv: false,
        });
      }
      return;
    }

    const jumpBtn = target.closest<HTMLElement>(".modal-jump-word-btn");
    if (jumpBtn) {
      const targetW = jumpBtn.getAttribute("data-open-word") || "";
      const targetB = jumpBtn.getAttribute("data-open-book") || "";
      const targetPos = jumpBtn.getAttribute("data-open-pos") || "";
      const targetMean = jumpBtn.getAttribute("data-open-mean") || "";
      const found =
        vocabList.find((item) => item.w === targetW && item.b === targetB) ||
        vocabList.find((item) => normalizeWordStr(item.w) === normalizeWordStr(targetW));
      if (found) {
        openWordDetailCard(found);
      } else {
        openWordDetailCard({
          w: targetW,
          p: targetPos,
          m: targetMean,
          b: "拓展同根词库",
          u: "非CSV",
          f: "拓展",
          n: "",
          inCsv: false,
        });
      }
      return;
    }

    const wordCard = target.closest<HTMLElement>("article[data-card-idx]");
    if (wordCard) {
      const idx = Number(wordCard.getAttribute("data-card-idx"));
      const entry = currentDisplayedEntries[idx];
      if (entry) {
        for (const c of document.querySelectorAll(".word-card-clickable")) {
          c.classList.remove("card-selected");
        }
        wordCard.classList.add("card-selected");
        openWordDetailCard(entry);
      }
      return;
    }

    const browseCard = target.closest<HTMLElement>(".browse-card-item");
    if (browseCard) {
      const bw = browseCard.getAttribute("data-browse-word");
      const bb = browseCard.getAttribute("data-browse-book");
      const found =
        vocabList.find((item) => item.w === bw && item.b === bb) ||
        vocabList.find((item) => item.w === bw);
      if (found) {
        for (const c of document.querySelectorAll(".browse-card-item")) {
          c.classList.remove("card-selected");
        }
        browseCard.classList.add("card-selected");
        openWordDetailCard(found);
      }
      return;
    }

    const tabBtn = target.closest<HTMLElement>(".nav-tab-btn");
    if (tabBtn) {
      const tab = tabBtn.getAttribute("data-tab") as VocabTab | null;
      if (tab) switchTab(tab);
    }
  });

  byId("randomWordBtn").addEventListener("click", () => {
    if (vocabList.length === 0) return;
    const rand = vocabList[Math.floor(Math.random() * vocabList.length)];
    if (!rand) return;
    wordInput.value = rand._headLower || rand.w;
    renderLookupResults(wordInput.value, true);
  });

  byId("clearHistoryBtn").addEventListener("click", () => {
    searchHistory = [];
    removeStorageItem(STORAGE_KEY_HISTORY);
    renderHistoryChips();
  });

  byId("quickImportBtn").addEventListener("click", () => {
    switchTab("import");
  });

  byId("browseBookSelect").addEventListener("change", () => {
    updateBrowseUnitSelectOptions();
    browseRenderLimit = 60;
    renderBrowseList();
  });

  for (const id of ["browseUnitSelect", "browseFontSelect"]) {
    byId(id).addEventListener("change", () => {
      browseRenderLimit = 60;
      renderBrowseList();
    });
  }

  byId("browseFilterInput").addEventListener("input", () => {
    browseRenderLimit = 60;
    renderBrowseList();
  });

  byId("browseLoadMoreBtn").addEventListener("click", () => {
    browseRenderLimit += 80;
    renderBrowseList();
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
        // skip invalid file
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
    runBatchWordCheck(sampleWords, "示例测试词表.csv");
    showToast("已生成示例单词批量判定表（含原词、变形词与课外词）");
  });

  byId("exportBatchCsvBtn").addEventListener("click", exportBatchCheckResultsAsCSV);
  byId("copyBatchTableBtn").addEventListener("click", () => {
    void copyBatchCheckResultsAsTSV();
  });
  byId("closeBatchTableBtn").addEventListener("click", () => {
    byId("batchCheckResultSection").classList.add("hidden");
  });

  byId("resetDefaultDbBtn").addEventListener("click", () => {
    vocabList = builtinVocab.map((e) => ({ ...e }));
    indexAllEntries(vocabList);
    selectedBookScope = "ALL";
    removeStorageItem(STORAGE_KEY_CUSTOM_VOCAB);
    removeStorageItem("pep_iphone_vocab_custom_v1");
    renderBookFilterBarAndSelects();
    renderBrowseList();
    showToast(`已恢复默认全量词库 (${vocabList.length.toLocaleString()} 词 · 含高中与四六级)`);
  });
}

if (document.readyState !== "loading") {
  void initApp();
} else {
  window.addEventListener("DOMContentLoaded", () => {
    void initApp();
  });
}
