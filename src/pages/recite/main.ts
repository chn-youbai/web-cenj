import "@/core/fonts";
import { copyToClipboard, escapeHtml, optById } from "@/core/dom";
import { initAppShell } from "@/core/shell";
import { getPreferredTheme, toggleTheme } from "@/core/theme";
import "@/styles/recite.css";
import {
  buildFilteredDeck,
  cleanWordForSpeech,
  getFontWeightLabel,
  getQuizCandidates,
  getWordsByGroup,
  wordMatchesFilter,
} from "./engine";
import {
  fetchVocabFromCloud,
  loadVocabFromIdb,
  openVocabDb,
  parseRawWords,
  saveVocabToIdb,
} from "./idb";
import { EMBEDDED_RAW_WORDS } from "./raw-words";
import {
  closeModal,
  isModalOpen,
  openModal,
  populateGroupSelector,
  renderAllViews,
  renderHeaderAndMiniStats,
  renderQuizScoreUI,
  renderStudyCard,
  renderWordList,
  showToast,
  triggerModalConfirm,
  updateSyncUI,
} from "./render";
import {
  LAST_SYNC_STORAGE,
  SYNC_KEY_STORAGE,
  applyImportedCsvRows,
  buildExportCsvContent,
  getOrCreateSyncKey,
  loadReciteState,
  mergeCloudDataIntoState,
  parseCsvRows,
  persistReciteState,
  pullCloudSyncRequest,
  pushCloudSyncRequest,
} from "./sync";
import {
  type ListTab,
  type MainTab,
  type MaskMode,
  type QuizPool,
  type ReciteWord,
  type StatusFilter,
  type WordMarkStatus,
  createInitialReciteState,
} from "./types";

let vocabList: ReciteWord[] = parseRawWords(EMBEDDED_RAW_WORDS);
const state = createInitialReciteState();
let filteredDeck: ReciteWord[] = [...vocabList];
let audioPlayer: HTMLAudioElement | null = null;
let syncDebounceTimer: number | null = null;
let quizAutoNextTimer: number | null = null;

function speakWebSpeechFallback(text: string, rate: number, callback?: () => void): void {
  if ("speechSynthesis" in window) {
    try {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = state.accent || "en-US";
      utter.rate = rate || 1.0;
      utter.onend = () => callback?.();
      utter.onerror = () => callback?.();
      window.speechSynthesis.speak(utter);
      return;
    } catch (err) {
      console.warn("SpeechSynthesis fallback error:", err);
    }
  }
  callback?.();
}

function speakText(text: string, rate = state.speechRate || 1.0): void {
  if (!text) return;
  const primaryWord = cleanWordForSpeech(text);
  if (!primaryWord) return;

  const btn = optById("btnSpeakWord");
  btn?.classList.add("speaking-pulse");

  const stopPulse = () => {
    btn?.classList.remove("speaking-pulse");
  };

  try {
    if (!audioPlayer) audioPlayer = new Audio();
    const type = state.accent === "en-US" ? 2 : 1;
    audioPlayer.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(primaryWord)}&type=${type}`;
    audioPlayer.playbackRate = rate;
    audioPlayer.onended = stopPulse;
    audioPlayer.onerror = () => {
      speakWebSpeechFallback(primaryWord, rate, stopPulse);
    };
    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        speakWebSpeechFallback(primaryWord, rate, stopPulse);
      });
    }
  } catch {
    speakWebSpeechFallback(primaryWord, rate, stopPulse);
  }
}

function saveState(triggerSync = true): void {
  persistReciteState(state);
  if (triggerSync) {
    if (syncDebounceTimer !== null) window.clearTimeout(syncDebounceTimer);
    syncDebounceTimer = window.setTimeout(() => {
      void pushCloudSync(false);
    }, 3000);
  }
}

async function pushCloudSync(isManual = false): Promise<void> {
  const key = getOrCreateSyncKey();
  try {
    const res = await pushCloudSyncRequest(key, state);
    if (res.status === "ok") {
      const nowStr = new Date().toLocaleTimeString();
      try {
        localStorage.setItem(LAST_SYNC_STORAGE, nowStr);
      } catch {
        // ignore
      }
      updateSyncUI();
      if (isManual) showToast(`☁️ 已保存并同步至专属云端 (${nowStr})`);
    } else if (res.status === "conflict" && res.cloudData) {
      mergeCloudDataIntoState(state, res.cloudData);
      saveState(false);
      rebuildFilteredDeck(false);
      renderAllViews(state, vocabList, filteredDeck);
      if (isManual) showToast("☁️ 已与云端最新进度智能对齐！");
    }
  } catch {
    if (isManual) showToast("⚠️ 云端同步暂不可用，已保存在个人本地空间");
  }
}

async function pullCloudSync(targetKey: string): Promise<void> {
  const cleanKey = targetKey.trim();
  if (!cleanKey) return;
  try {
    const res = await pullCloudSyncRequest(cleanKey);
    try {
      localStorage.setItem(SYNC_KEY_STORAGE, cleanKey);
    } catch {
      // ignore
    }
    loadReciteState(state, cleanKey);

    if (res.status === "ok" && res.data) {
      mergeCloudDataIntoState(state, res.data);
      saveState(false);
      rebuildFilteredDeck(false);
      renderAllViews(state, vocabList, filteredDeck);
      const nowStr = new Date().toLocaleTimeString();
      try {
        localStorage.setItem(LAST_SYNC_STORAGE, nowStr);
      } catch {
        // ignore
      }
      updateSyncUI();
      showToast(`✅ 已载入用户「${cleanKey}」的专属个性化数据`);
    } else if (res.status === "empty") {
      updateSyncUI();
      await pushCloudSync(true);
      showToast(`✅ 已绑定新用户同步码「${cleanKey}」，个性化数据独立保存！`);
    } else {
      showToast(`⚠️ 同步失败：${res.message || "同步码无效"}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "网络错误";
    showToast(`❌ 网络请求失败：${msg}`);
  }
}

function copyCurrentKey(): void {
  const key = getOrCreateSyncKey();
  void copyToClipboard(key).then((ok) => {
    if (ok) showToast(`✅ 已复制同步码: ${key}`);
    else window.prompt("请手动长按复制同步码：", key);
  });
}

function openSyncKeyModal(): void {
  const currentKey = getOrCreateSyncKey();
  openModal({
    title: "☁️ 跨端云同步 · 自定义同步码",
    body: `
      <div class="space-y-3 text-left">
        <div class="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border">
          <div class="text-[10px] sub-text font-semibold">当前设备绑定的同步码</div>
          <div class="flex items-center justify-between mt-1">
            <span id="modalCurrentKeyDisplay" class="text-base font-extrabold font-mono text-teal-600 dark:text-teal-400 select-all">${escapeHtml(currentKey)}</span>
            <button type="button" id="modalCopyBtn" class="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-700 border text-xs font-bold">📋 复制</button>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-bold block text-slate-700 dark:text-slate-200">
            ✏️ 输入自定义专属同步码
          </label>
          <input id="modalSyncInput" type="text" placeholder="输入自定义同步码 (如 cenji / 高考必胜 / mywords)" value="${escapeHtml(currentKey)}" class="w-full px-3 py-2 rounded-xl card-surface border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <p class="text-[10px] sub-text leading-tight mt-1">
            💡 <strong>多端同步使用指南</strong>：支持任意中文、英文、数字组合！在另一台手机或电脑输入完全相同的同步码，点击「绑定并同步」，即可自动实现多端云端漫游。
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button" id="modalRandomBtn" class="py-2 px-2.5 rounded-xl border text-xs font-semibold sub-text hover:text-teal-600">
            🎲 随机生成码
          </button>
          <button type="button" id="modalPullBtn" class="py-2 px-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 text-xs font-bold">
            📥 拉取覆盖云端
          </button>
        </div>
      </div>
    `,
    onConfirm: () => {
      const input = optById<HTMLInputElement>("modalSyncInput");
      const val = (input?.value || "").trim();
      if (!val) {
        showToast("请输入同步码");
        return;
      }
      closeModal();
      void pullCloudSync(val);
    },
  });

  window.setTimeout(() => {
    optById("modalCopyBtn")?.addEventListener("click", copyCurrentKey);
    optById("modalRandomBtn")?.addEventListener("click", () => {
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const newKey = `GK-${rand}`;
      const inp = optById<HTMLInputElement>("modalSyncInput");
      if (inp) inp.value = newKey;
    });
    optById("modalPullBtn")?.addEventListener("click", () => {
      const input = optById<HTMLInputElement>("modalSyncInput");
      const val = (input?.value || "").trim();
      if (!val) {
        showToast("请输入同步码");
        return;
      }
      closeModal();
      void pullCloudSync(val);
    });
  }, 50);
}

function rebuildFilteredDeck(resetIndex = false): void {
  filteredDeck = buildFilteredDeck(
    vocabList,
    state.marks,
    state.currentGroup,
    state.statusFilter,
    state.isShuffled,
  );
  if (
    resetIndex ||
    !Number.isInteger(state.currentIndex) ||
    state.currentIndex < 0 ||
    state.currentIndex >= filteredDeck.length
  ) {
    state.currentIndex = 0;
  }
  state.cardRevealed = false;
  if (state.currentQuizWord) {
    const validQuizPool = getQuizCandidates(
      vocabList,
      filteredDeck,
      state.marks,
      state.currentGroup,
      state.quizPool,
    );
    if (!validQuizPool.some((w) => w.id === state.currentQuizWord?.id)) {
      state.currentQuizWord = null;
    }
  }
  renderAllViews(state, vocabList, filteredDeck);
}

function advanceZenWord(delta = 1): void {
  if (filteredDeck.length === 0) return;
  state.currentIndex = (state.currentIndex + delta + filteredDeck.length) % filteredDeck.length;
  state.cardRevealed = false;
  saveState();
  renderAllViews(state, vocabList, filteredDeck);
  const word = filteredDeck[state.currentIndex]?.word;
  if (state.autoSpeak && word) {
    speakText(word);
  }
}

function markCurrentWord(status: WordMarkStatus): void {
  if (filteredDeck.length === 0) return;
  if (
    !Number.isInteger(state.currentIndex) ||
    state.currentIndex < 0 ||
    state.currentIndex >= filteredDeck.length
  ) {
    state.currentIndex = 0;
  }
  const item = filteredDeck[state.currentIndex];
  if (!item) return;

  state.marks[item.id] = status;
  const statusLabels: Record<WordMarkStatus, string> = {
    known: "🟢 很熟",
    fuzzy: "🟡 有点模糊",
    unknown: "🔴 完全不会",
  };
  let toastMsg = `${item.word} → ${statusLabels[status]}`;

  const stillMatches = wordMatchesFilter(state.marks, item.id, state.statusFilter);
  if (!stillMatches) {
    filteredDeck.splice(state.currentIndex, 1);
    if (state.currentIndex >= filteredDeck.length) {
      state.currentIndex = 0;
    }
  } else if (state.currentIndex < filteredDeck.length - 1) {
    state.currentIndex += 1;
  } else if (state.statusFilter === "all" && state.currentGroup.startsWith("g_")) {
    const currentG = Number.parseInt(state.currentGroup.split("_")[1] ?? "1", 10);
    if (currentG < 41) {
      state.currentGroup = `g_${currentG + 1}`;
      const selGroup = optById<HTMLSelectElement>("selectGroup");
      if (selGroup) selGroup.value = state.currentGroup;
      filteredDeck = getWordsByGroup(vocabList, state.currentGroup);
      state.currentIndex = 0;
      toastMsg = `🎉 第 ${currentG} 组已完成，自动进入第 ${currentG + 1} 组！`;
    } else {
      state.currentIndex = 0;
      toastMsg = "🎉 第 41 组已完成，已回到本组开头！";
    }
  } else {
    state.currentIndex = 0;
    toastMsg = `${item.word} → ${statusLabels[status]} (已循环到列表开头)`;
  }

  state.cardRevealed = false;
  saveState();
  renderAllViews(state, vocabList, filteredDeck);
  showToast(toastMsg);

  const nextWord = filteredDeck[state.currentIndex]?.word;
  if (state.autoSpeak && nextWord) {
    speakText(nextWord);
  }
}

function stepWord(delta: number): void {
  if (filteredDeck.length === 0) return;
  const nextIdx = state.currentIndex + delta;
  if (nextIdx < 0) {
    showToast("已经是第一词了");
    return;
  }
  if (nextIdx >= filteredDeck.length) {
    showToast("已经是最后一词了");
    return;
  }
  state.currentIndex = nextIdx;
  state.cardRevealed = false;
  saveState();
  renderAllViews(state, vocabList, filteredDeck);
  const word = filteredDeck[state.currentIndex]?.word;
  if (state.autoSpeak && word) {
    speakText(word);
  }
}

function clearQuizAutoNextTimer(): void {
  if (quizAutoNextTimer !== null) {
    window.clearTimeout(quizAutoNextTimer);
    quizAutoNextTimer = null;
  }
}

function scheduleQuizAutoNext(delayMs: number): void {
  clearQuizAutoNextTimer();
  quizAutoNextTimer = window.setTimeout(() => {
    quizAutoNextTimer = null;
    if (state.activeTab === "quiz") {
      nextQuizQuestion();
    }
  }, delayMs);
}

function renderQuizChoicesForCurrentWord(): void {
  clearQuizAutoNextTimer();
  const target = state.currentQuizWord;
  if (!target) return;
  state.quizAnswered = false;

  const fb = optById("quizFeedbackText");
  if (fb) {
    fb.textContent = "纯测验模式（不修改熟练度）";
    fb.className = "text-xs font-semibold sub-text";
  }

  const prevIds = new Set(state.lastDistractorIds);
  const distractors: ReciteWord[] = [];
  let safety = 0;
  while (distractors.length < 3 && safety < 500 && vocabList.length > 0) {
    safety += 1;
    const cand = vocabList[Math.floor(Math.random() * vocabList.length)];
    if (
      cand &&
      cand.id !== target.id &&
      cand.meaning !== target.meaning &&
      !prevIds.has(cand.id) &&
      !distractors.some((d) => d.id === cand.id || d.meaning === cand.meaning)
    ) {
      distractors.push(cand);
    }
  }
  state.lastDistractorIds = distractors.map((d) => d.id);

  const options = [target, ...distractors];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = options[i];
    const swap = options[j];
    if (tmp && swap) {
      options[i] = swap;
      options[j] = tmp;
    }
  }

  const choiceBox = optById("quizChoiceContainer");
  if (choiceBox) {
    choiceBox.innerHTML = options
      .map(
        (opt, idx) => `
        <button type="button" data-quiz-opt="${opt.id}" class="quiz-opt-btn w-full text-left px-3.5 py-2.5 rounded-2xl card-surface border text-xs font-semibold hover:border-teal-500 transition flex items-center justify-between">
          <span>${idx + 1}. ${escapeHtml(opt.meaning)}</span>
        </button>
      `,
      )
      .join("");
  }
}

function nextQuizQuestion(): void {
  clearQuizAutoNextTimer();
  const pool = getQuizCandidates(
    vocabList,
    filteredDeck,
    state.marks,
    state.currentGroup,
    state.quizPool,
  );
  if (!pool || pool.length === 0) return;

  let candidates = pool;
  if (pool.length > 1 && state.currentQuizWord) {
    candidates = pool.filter((w) => w.id !== state.currentQuizWord?.id);
  }
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  if (!target) return;

  state.currentQuizWord = target;
  state.quizAnswered = false;
  state.quizHintLevel = 0;

  const groupLabel = optById("headerGroupBadge")?.textContent?.trim() || "当前组";
  const metaEl = optById("quizWordMeta");
  if (metaEl) metaEl.textContent = `${groupLabel} · #${target.id} · 考频 ${target.freq}次`;

  const fb = optById("quizFeedbackText");
  if (fb) {
    fb.textContent = "纯测验模式（不修改熟练度）";
    fb.className = "text-xs font-semibold sub-text";
  }

  const choiceBox = optById("quizChoiceContainer");
  const spellBox = optById("quizSpellContainer");
  const refreshBtn = optById("btnQuizRefreshOptions");
  const promptMain = optById("quizPromptMain");
  const promptSub = optById("quizPromptSub");

  if (state.quizType === "choice") {
    choiceBox?.classList.remove("hidden");
    spellBox?.classList.add("hidden");
    refreshBtn?.classList.remove("hidden");
    if (promptMain) promptMain.textContent = target.word;
    if (promptSub) promptSub.textContent = "请选择正确的中文释义（刷新可更换其余三个干扰项）";
    renderQuizChoicesForCurrentWord();
  } else {
    choiceBox?.classList.add("hidden");
    spellBox?.classList.remove("hidden");
    refreshBtn?.classList.add("hidden");
    if (promptMain) promptMain.textContent = target.meaning;
    if (promptSub) promptSub.textContent = "请根据释义或发音拼写英文单词";
    const spellHint = optById("quizSpellHint");
    if (spellHint) spellHint.textContent = "";
    const inp = optById<HTMLInputElement>("inputQuizSpell");
    if (inp) {
      inp.value = "";
      inp.disabled = false;
      window.setTimeout(() => inp.focus(), 50);
    }
  }

  if (state.autoSpeak) {
    speakText(target.word);
  }
}

function exportCsvByFilter(filterFn: (w: ReciteWord) => boolean, filenameSuffix: string): void {
  const { csvContent, count } = buildExportCsvContent(
    vocabList,
    state.marks,
    state.memos,
    filterFn,
  );
  if (count === 0) {
    showToast("⚠️ 当前筛选条件下没有可导出的单词");
    return;
  }
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `高考英语2050核心词汇_${filenameSuffix}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✅ 已导出 ${count} 个单词到 CSV`);
}

function handleImportCsv(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    let text = "";
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      text = new TextDecoder("gb18030").decode(buffer);
    }

    const rows = parseCsvRows(text);
    if (rows.length <= 1) {
      showToast("⚠️ CSV 文件内容为空或格式无法识别");
      return;
    }

    const summary = applyImportedCsvRows(rows, vocabList, state.marks, state.memos);
    const importedTotal = summary.importedKnown + summary.importedFuzzy + summary.importedUnknown;
    rebuildFilteredDeck(false);

    if (state.statusFilter === "all" && filteredDeck.length > 0) {
      const firstUnmarkedIdx = filteredDeck.findIndex((w) => !state.marks[w.id]);
      if (firstUnmarkedIdx !== -1) {
        state.currentIndex = firstUnmarkedIdx;
      }
    }

    saveState();
    renderAllViews(state, vocabList, filteredDeck);
    showToast(
      `✅ 已恢复 ${importedTotal} 词 (熟${summary.importedKnown}/模${summary.importedFuzzy}/生${summary.importedUnknown})`,
    );
  };
  reader.readAsArrayBuffer(file);
}

function switchTab(tabName: MainTab): void {
  state.activeTab = tabName;
  const views: Record<MainTab, HTMLElement | null> = {
    study: optById("viewStudy"),
    zen: optById("viewZen"),
    quiz: optById("viewQuiz"),
    list: optById("viewList"),
    stats: optById("viewStats"),
  };

  for (const key of Object.keys(views) as MainTab[]) {
    const el = views[key];
    if (!el) continue;
    if (key === tabName) el.classList.remove("hidden");
    else el.classList.add("hidden");
  }

  const topHeader = optById("appTopHeader");
  const miniBar = optById("appMiniStatusBar");
  if (tabName === "zen") {
    topHeader?.classList.add("hidden");
    miniBar?.classList.add("hidden");
  } else {
    topHeader?.classList.remove("hidden");
    miniBar?.classList.remove("hidden");
  }

  for (const btn of document.querySelectorAll<HTMLElement>(".nav-tab-btn")) {
    const isCurrent = btn.getAttribute("data-nav") === tabName;
    btn.className = `nav-tab-btn flex flex-col items-center justify-center gap-0.5 text-[10px] w-16 ${
      isCurrent ? "tab-active text-teal-600 dark:text-teal-400 font-bold" : "sub-text font-medium"
    }`;
  }

  if (tabName === "quiz") {
    const pool = getQuizCandidates(
      vocabList,
      filteredDeck,
      state.marks,
      state.currentGroup,
      state.quizPool,
    );
    const inPool = Boolean(
      state.currentQuizWord && pool.some((w) => w.id === state.currentQuizWord?.id),
    );
    if (!inPool) {
      nextQuizQuestion();
    } else if (state.quizType === "choice" && state.currentQuizWord) {
      const groupLabel = optById("headerGroupBadge")?.textContent?.trim() || "当前组";
      const metaEl = optById("quizWordMeta");
      if (metaEl) {
        metaEl.textContent = `${groupLabel} · #${state.currentQuizWord.id} · 考频 ${state.currentQuizWord.freq}次`;
      }
      renderQuizChoicesForCurrentWord();
    }
  }
  renderAllViews(state, vocabList, filteredDeck);
}

async function initVocabDataset(): Promise<void> {
  rebuildFilteredDeck(false);
  renderAllViews(state, vocabList, filteredDeck);

  try {
    const db = await openVocabDb();
    if (db) {
      const cached = await loadVocabFromIdb(db);
      if (cached && cached.length >= 2000) {
        vocabList = cached;
        rebuildFilteredDeck(false);
        renderAllViews(state, vocabList, filteredDeck);
      } else {
        await saveVocabToIdb(db, vocabList);
      }
    }
  } catch {
    // IDB fallback
  }

  fetchVocabFromCloud()
    .then(async (cloudWords) => {
      if (cloudWords && cloudWords.length >= 2000) {
        vocabList = cloudWords;
        rebuildFilteredDeck(false);
        renderAllViews(state, vocabList, filteredDeck);
        const db = await openVocabDb();
        if (db) await saveVocabToIdb(db, cloudWords);
      }
    })
    .catch(() => {});
}

function setupApp(): void {
  initAppShell({ activePage: "recite" });
  try {
    loadReciteState(state);
    state.darkMode = getPreferredTheme() === "dark";
    populateGroupSelector(state.currentGroup);
    updateSyncUI();
    void initVocabDataset();
    renderQuizScoreUI(state);
  } catch (err) {
    console.warn("InitReciteApp error:", err);
  }

  const themeObserver = new MutationObserver(() => {
    const isDark = getPreferredTheme() === "dark";
    if (state.darkMode !== isDark) {
      state.darkMode = isDark;
      renderAllViews(state, vocabList, filteredDeck);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  optById("displaySyncKey")?.addEventListener("click", copyCurrentKey);
  optById("btnCopySyncKey")?.addEventListener("click", copyCurrentKey);

  optById("btnManualSync")?.addEventListener("click", () => {
    void pushCloudSync(true);
  });

  optById("btnApplyCustomKey")?.addEventListener("click", () => {
    const inp = optById<HTMLInputElement>("inputCustomSyncKey");
    if (!inp) return;
    const val = inp.value.trim();
    if (!val) {
      showToast("请输入你想自定义的同步码");
      inp.focus();
      return;
    }
    void pullCloudSync(val);
    inp.value = "";
  });

  optById("btnRandomKey")?.addEventListener("click", () => {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKey = `GK-${rand}`;
    try {
      localStorage.setItem(SYNC_KEY_STORAGE, newKey);
    } catch {
      // ignore
    }
    updateSyncUI();
    showToast(`已生成新随机同步码: ${newKey}`);
    void pushCloudSync(true);
  });

  optById("btnHeaderSyncPill")?.addEventListener("click", openSyncKeyModal);
  optById("btnHeaderSyncIcon")?.addEventListener("click", openSyncKeyModal);

  const updateAppHeight = () => {
    document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
  };
  window.addEventListener("resize", updateAppHeight);
  window.addEventListener("orientationchange", updateAppHeight);
  updateAppHeight();

  optById("btnShowShortcuts")?.addEventListener("click", () => {
    openModal({
      title: "⌨️ 键盘快捷键与手势指南",
      body: `
        <div class="space-y-1.5">
          <div>• <strong>数字键 1</strong>：标记为「🟢 很熟」并跳下一词</div>
          <div>• <strong>数字键 2</strong>：标记为「🟡 有点模糊」并跳下一词</div>
          <div>• <strong>数字键 3</strong>：标记为「🔴 完全不会」并跳下一词</div>
          <div>• <strong>空格键 Space</strong>：朗读当前单词发音 / 揭晓遮罩</div>
          <div>• <strong>左右方向键 ← / →</strong>：切换上一词 / 下一词</div>
          <div>• <strong>手机端左右滑动卡片</strong>：快速切换上一词 / 下一词</div>
        </div>
      `,
      onConfirm: closeModal,
    });
  });

  optById("btnAccentToggle")?.addEventListener("click", () => {
    state.accent = state.accent === "en-US" ? "en-GB" : "en-US";
    saveState();
    renderHeaderAndMiniStats(state, vocabList, filteredDeck);
    showToast(state.accent === "en-US" ? "🇺🇸 已切换为美式发音" : "🇬🇧 已切换为英式发音");
    const word = filteredDeck[state.currentIndex]?.word;
    if (word) speakText(word);
  });

  optById("btnThemeToggle")?.addEventListener("click", () => {
    state.darkMode = toggleTheme() === "dark";
    saveState();
    renderAllViews(state, vocabList, filteredDeck);
  });

  for (const btn of document.querySelectorAll<HTMLElement>(".quick-stat-pill")) {
    btn.addEventListener("click", () => {
      const f = (btn.getAttribute("data-quick-filter") || "all") as StatusFilter;
      state.statusFilter = f;
      const selFilter = optById<HTMLSelectElement>("selectStatusFilter");
      if (selFilter) selFilter.value = f;
      const groupMatches = getWordsByGroup(vocabList, state.currentGroup).filter((w) =>
        wordMatchesFilter(state.marks, w.id, f),
      );
      if (groupMatches.length === 0 && state.currentGroup !== "all") {
        state.currentGroup = "all";
        const selGroup = optById<HTMLSelectElement>("selectGroup");
        if (selGroup) selGroup.value = "all";
      }
      switchTab("study");
      rebuildFilteredDeck(true);
    });
  }

  optById<HTMLSelectElement>("selectGroup")?.addEventListener("change", (e) => {
    state.currentGroup = (e.target as HTMLSelectElement).value;
    saveState();
    rebuildFilteredDeck(true);
  });

  optById<HTMLSelectElement>("selectStatusFilter")?.addEventListener("change", (e) => {
    state.statusFilter = (e.target as HTMLSelectElement).value as StatusFilter;
    rebuildFilteredDeck(true);
  });

  optById<HTMLSelectElement>("selectMaskMode")?.addEventListener("change", (e) => {
    state.maskMode = (e.target as HTMLSelectElement).value as MaskMode;
    state.cardRevealed = false;
    renderStudyCard(state, filteredDeck);
  });

  optById("btnOpenPrefDrawer")?.addEventListener("click", () => {
    optById("prefDrawerModal")?.classList.remove("hidden");
  });
  optById("btnClosePrefDrawer")?.addEventListener("click", () => {
    optById("prefDrawerModal")?.classList.add("hidden");
  });

  optById<HTMLInputElement>("sliderEnFontSize")?.addEventListener("input", (e) => {
    state.enFontSize = Number.parseInt((e.target as HTMLInputElement).value, 10);
    const valEl = optById("valEnFontSize");
    if (valEl) valEl.textContent = `${state.enFontSize}px`;
    saveState();
    renderStudyCard(state, filteredDeck);
  });

  optById<HTMLInputElement>("sliderCnFontSize")?.addEventListener("input", (e) => {
    state.cnFontSize = Number.parseInt((e.target as HTMLInputElement).value, 10);
    const valEl = optById("valCnFontSize");
    if (valEl) valEl.textContent = `${state.cnFontSize}px`;
    saveState();
    renderStudyCard(state, filteredDeck);
  });

  optById<HTMLInputElement>("sliderEnFontWeight")?.addEventListener("input", (e) => {
    state.enFontWeight = Number.parseInt((e.target as HTMLInputElement).value, 10);
    const valEl = optById("valEnFontWeight");
    if (valEl) valEl.textContent = getFontWeightLabel(state.enFontWeight);
    saveState();
    renderStudyCard(state, filteredDeck);
  });

  optById<HTMLInputElement>("sliderCnFontWeight")?.addEventListener("input", (e) => {
    state.cnFontWeight = Number.parseInt((e.target as HTMLInputElement).value, 10);
    const valEl = optById("valCnFontWeight");
    if (valEl) valEl.textContent = getFontWeightLabel(state.cnFontWeight);
    saveState();
    renderStudyCard(state, filteredDeck);
  });

  optById("btnResetFontSizes")?.addEventListener("click", () => {
    state.enFontSize = 58;
    state.cnFontSize = 34;
    state.enFontWeight = 700;
    state.cnFontWeight = 700;
    saveState();
    renderHeaderAndMiniStats(state, vocabList, filteredDeck);
    renderStudyCard(state, filteredDeck);
    showToast("🔤 已恢复默认字号与粗细 (英文58px/粗体, 中文34px/粗体)");
  });

  optById("btnDrawerAccentToggle")?.addEventListener("click", () => {
    state.accent = state.accent === "en-US" ? "en-GB" : "en-US";
    saveState();
    renderHeaderAndMiniStats(state, vocabList, filteredDeck);
    showToast(state.accent === "en-US" ? "🇺🇸 已切换为美式发音" : "🇬🇧 已切换为英式发音");
    const word = filteredDeck[state.currentIndex]?.word;
    if (word) speakText(word);
  });

  optById("btnDrawerSpeedToggle")?.addEventListener("click", () => {
    state.speechRate = state.speechRate === 0.7 ? 1.0 : 0.7;
    saveState();
    renderHeaderAndMiniStats(state, vocabList, filteredDeck);
    showToast(state.speechRate === 0.7 ? "🐢 已切换为 0.7x 慢速跟读" : "⚡ 已恢复正常 1.0x 语速");
    const word = filteredDeck[state.currentIndex]?.word;
    if (word) speakText(word);
  });

  optById("btnSavePrefDrawer")?.addEventListener("click", () => {
    optById("prefDrawerModal")?.classList.add("hidden");
  });
  optById("prefDrawerModal")?.addEventListener("click", (e) => {
    if (e.target === optById("prefDrawerModal")) {
      optById("prefDrawerModal")?.classList.add("hidden");
    }
  });

  optById("btnShuffleDeck")?.addEventListener("click", () => {
    state.isShuffled = !state.isShuffled;
    rebuildFilteredDeck(true);
    showToast(state.isShuffled ? "🔀 已随机打乱当前词表" : "📋 已恢复词频顺序");
  });

  optById("btnAutoPlayAudio")?.addEventListener("click", () => {
    state.autoSpeak = !state.autoSpeak;
    saveState();
    renderHeaderAndMiniStats(state, vocabList, filteredDeck);
    showToast(state.autoSpeak ? "🔊 已开启切词自动发音" : "🔇 已关闭切词自动发音");
  });

  optById("btnSpeakWord")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const word = filteredDeck[state.currentIndex]?.word;
    if (word) speakText(word, 1.0);
  });

  optById("btnSpeakSlow")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const word = filteredDeck[state.currentIndex]?.word;
    if (word) speakText(word, 0.65);
  });

  const cardWordEl = optById("cardWordText");
  cardWordEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    const word = filteredDeck[state.currentIndex]?.word;
    if (word) {
      speakText(word);
      cardWordEl.classList.add("opacity-70", "scale-95");
      window.setTimeout(() => cardWordEl.classList.remove("opacity-70", "scale-95"), 120);
    }
  });

  optById("cardCenterArea")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    const formBtn = target?.closest<HTMLElement>("[data-speak-form]");
    if (formBtn) {
      e.stopPropagation();
      speakText(formBtn.getAttribute("data-speak-form") || "", 1.0);
      return;
    }
    if (state.maskMode !== "none" && !state.cardRevealed) {
      state.cardRevealed = true;
      renderStudyCard(state, filteredDeck);
    }
    const word = filteredDeck[state.currentIndex]?.word;
    if (word) speakText(word, 1.0);
  });

  optById("cardFormsList")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    const formBtn = target?.closest<HTMLElement>("[data-speak-form]");
    if (formBtn) {
      e.stopPropagation();
      speakText(formBtn.getAttribute("data-speak-form") || "", 1.0);
    }
  });

  optById("btnPrevWord")?.addEventListener("click", () => stepWord(-1));
  optById("btnNextWord")?.addEventListener("click", () => stepWord(1));

  const openMemoEditor = () => {
    if (filteredDeck.length === 0) return;
    const item = filteredDeck[state.currentIndex];
    if (!item) return;
    openModal({
      title: `✍️ 添加助记笔记 · ${item.word}`,
      body: "记录词根词缀、谐音联想或真题例句（导出 CSV 时会一并包含）：",
      showInput: true,
      inputValue: state.memos[item.id] || "",
      onConfirm: () => {
        const input = optById<HTMLInputElement>("modalInput");
        const val = (input?.value || "").trim();
        if (val) state.memos[item.id] = val;
        else delete state.memos[item.id];
        saveState();
        renderStudyCard(state, filteredDeck);
        closeModal();
        showToast("已保存助记笔记");
      },
    });
  };

  optById("btnAddMemo")?.addEventListener("click", openMemoEditor);
  optById("btnEditMemoInline")?.addEventListener("click", openMemoEditor);

  optById("viewZen")?.addEventListener("click", () => advanceZenWord(1));

  optById("btnMarkKnown")?.addEventListener("click", () => markCurrentWord("known"));
  optById("btnMarkFuzzy")?.addEventListener("click", () => markCurrentWord("fuzzy"));
  optById("btnMarkUnknown")?.addEventListener("click", () => markCurrentWord("unknown"));

  let touchStartX = 0;
  const cardEl = optById("wordCardContainer");
  cardEl?.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.changedTouches[0];
      if (touch) touchStartX = touch.screenX;
    },
    { passive: true },
  );
  cardEl?.addEventListener(
    "touchend",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const diffX = touch.screenX - touchStartX;
      if (Math.abs(diffX) > 65) {
        if (diffX < 0) stepWord(1);
        else stepWord(-1);
      }
    },
    { passive: true },
  );

  optById<HTMLSelectElement>("selectQuizPool")?.addEventListener("change", (e) => {
    state.quizPool = (e.target as HTMLSelectElement).value as QuizPool;
    nextQuizQuestion();
  });

  optById("btnQuizTypeChoice")?.addEventListener("click", () => {
    state.quizType = "choice";
    const btnChoice = optById("btnQuizTypeChoice");
    const btnSpell = optById("btnQuizTypeSpell");
    if (btnChoice) {
      btnChoice.className =
        "py-1.5 rounded-lg bg-white dark:bg-slate-700 shadow-sm text-teal-600 dark:text-teal-300 transition";
    }
    if (btnSpell) btnSpell.className = "py-1.5 rounded-lg sub-text transition";
    if (state.currentQuizWord) {
      optById("quizChoiceContainer")?.classList.remove("hidden");
      optById("quizSpellContainer")?.classList.add("hidden");
      optById("btnQuizRefreshOptions")?.classList.remove("hidden");
      const pm = optById("quizPromptMain");
      const ps = optById("quizPromptSub");
      if (pm) pm.textContent = state.currentQuizWord.word;
      if (ps) ps.textContent = "请选择正确的中文释义（刷新可更换其余三个干扰项）";
      renderQuizChoicesForCurrentWord();
    } else {
      nextQuizQuestion();
    }
  });

  optById("btnQuizTypeSpell")?.addEventListener("click", () => {
    state.quizType = "spell";
    const btnChoice = optById("btnQuizTypeChoice");
    const btnSpell = optById("btnQuizTypeSpell");
    if (btnSpell) {
      btnSpell.className =
        "py-1.5 rounded-lg bg-white dark:bg-slate-700 shadow-sm text-teal-600 dark:text-teal-300 transition";
    }
    if (btnChoice) btnChoice.className = "py-1.5 rounded-lg sub-text transition";
    nextQuizQuestion();
  });

  optById("btnQuizRefreshOptions")?.addEventListener("click", () => {
    if (!state.currentQuizWord) {
      nextQuizQuestion();
      return;
    }
    renderQuizChoicesForCurrentWord();
    showToast("🔄 已更换另外三个干扰选项");
  });

  optById("btnQuizSpeak")?.addEventListener("click", () => {
    if (state.currentQuizWord) speakText(state.currentQuizWord.word);
  });

  optById("quizChoiceContainer")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest<HTMLElement>("[data-quiz-opt]");
    if (!btn || state.quizAnswered || !state.currentQuizWord) return;
    state.quizAnswered = true;

    const chosenId = Number.parseInt(btn.getAttribute("data-quiz-opt") || "0", 10);
    const correctId = state.currentQuizWord.id;
    state.quizTotal += 1;

    for (const b of document.querySelectorAll<HTMLElement>(".quiz-opt-btn")) {
      const oid = Number.parseInt(b.getAttribute("data-quiz-opt") || "0", 10);
      if (oid === correctId) {
        b.className =
          "quiz-opt-btn w-full text-left px-3.5 py-2.5 rounded-2xl bg-emerald-500 text-white text-xs font-bold flex items-center justify-between";
      } else if (oid === chosenId) {
        b.className =
          "quiz-opt-btn w-full text-left px-3.5 py-2.5 rounded-2xl bg-rose-500 text-white text-xs font-bold flex items-center justify-between";
      }
    }

    const fb = optById("quizFeedbackText");
    if (chosenId === correctId) {
      state.quizCorrect += 1;
      state.quizStreak += 1;
      if (fb) {
        fb.textContent = "✅ 回答正确！（0.5s 后下一题）";
        fb.className = "text-xs font-bold text-emerald-500";
      }
      speakText(state.currentQuizWord.word);
      scheduleQuizAutoNext(500);
    } else {
      state.quizStreak = 0;
      if (fb) {
        fb.textContent = `❌ 答错了 · 正确释义：${state.currentQuizWord.meaning}（1.5s 后下一题）`;
        fb.className = "text-xs font-bold text-rose-500";
      }
      scheduleQuizAutoNext(1500);
    }
    renderQuizScoreUI(state);
  });

  optById("btnQuizSpellHintTrigger")?.addEventListener("click", () => {
    if (!state.currentQuizWord) return;
    const w = (state.currentQuizWord.word.split("/")[0] ?? "").trim();
    state.quizHintLevel = Math.min(w.length, state.quizHintLevel + 2);
    const revealed =
      w.slice(0, state.quizHintLevel) + "_".repeat(Math.max(0, w.length - state.quizHintLevel));
    const hintEl = optById("quizSpellHint");
    if (hintEl) hintEl.textContent = revealed.split("").join(" ");
    speakText(w);
  });

  optById("btnQuizSpellSubmit")?.addEventListener("click", () => {
    if (!state.currentQuizWord || state.quizAnswered) return;
    const inp = optById<HTMLInputElement>("inputQuizSpell");
    const inputVal = (inp?.value || "").trim().toLowerCase();
    if (!inputVal) return;

    state.quizAnswered = true;
    state.quizTotal += 1;
    const validAnswers = state.currentQuizWord.word
      .toLowerCase()
      .split("/")
      .map((s) => s.trim());
    const fb = optById("quizFeedbackText");

    if (validAnswers.includes(inputVal)) {
      state.quizCorrect += 1;
      state.quizStreak += 1;
      if (fb) {
        fb.textContent = `✅ 拼写正确 (${state.currentQuizWord.word})！（0.5s 后下一题）`;
        fb.className = "text-xs font-bold text-emerald-500";
      }
      scheduleQuizAutoNext(500);
    } else {
      state.quizStreak = 0;
      if (fb) {
        fb.textContent = `❌ 正确拼写：${state.currentQuizWord.word}（1.5s 后下一题）`;
        fb.className = "text-xs font-bold text-rose-500";
      }
      scheduleQuizAutoNext(1500);
    }
    speakText(state.currentQuizWord.word);
    renderQuizScoreUI(state);
  });

  optById<HTMLInputElement>("inputQuizSpell")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (state.quizAnswered) nextQuizQuestion();
      else optById("btnQuizSpellSubmit")?.click();
    }
  });

  optById("btnQuizNext")?.addEventListener("click", nextQuizQuestion);

  const searchInput = optById<HTMLInputElement>("inputListSearch");
  const clearBtn = optById("btnClearSearch");
  searchInput?.addEventListener("input", (e) => {
    state.listSearch = (e.target as HTMLInputElement).value;
    state.listPage = 1;
    clearBtn?.classList.toggle("hidden", !state.listSearch);
    renderWordList(state, vocabList);
  });
  clearBtn?.addEventListener("click", () => {
    state.listSearch = "";
    if (searchInput) searchInput.value = "";
    clearBtn.classList.add("hidden");
    state.listPage = 1;
    renderWordList(state, vocabList);
  });

  for (const btn of document.querySelectorAll<HTMLElement>(".list-filter-tab")) {
    btn.addEventListener("click", () => {
      state.listTab = (btn.getAttribute("data-list-tab") || "all") as ListTab;
      state.listPage = 1;
      for (const b of document.querySelectorAll<HTMLElement>(".list-filter-tab")) {
        const active = b.getAttribute("data-list-tab") === state.listTab;
        b.className = `list-filter-tab px-2.5 py-1 rounded-full whitespace-nowrap ${
          active ? "bg-teal-600 text-white font-semibold" : "card-surface border"
        }`;
      }
      renderWordList(state, vocabList);
    });
  }

  optById("btnListPrevPage")?.addEventListener("click", () => {
    if (state.listPage > 1) {
      state.listPage -= 1;
      renderWordList(state, vocabList);
    }
  });
  optById("btnListNextPage")?.addEventListener("click", () => {
    state.listPage += 1;
    renderWordList(state, vocabList);
  });

  optById("wordListScroll")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    const speakBtn = target?.closest<HTMLElement>("[data-list-speak]");
    if (speakBtn) {
      speakText(speakBtn.getAttribute("data-list-speak") || "");
      return;
    }
    const markBtn = target?.closest<HTMLElement>("[data-list-mark]");
    if (markBtn) {
      const parts = (markBtn.getAttribute("data-list-mark") || "").split(":");
      const id = Number.parseInt(parts[0] || "0", 10);
      const status = parts[1] as WordMarkStatus | undefined;
      if (!id || !status) return;
      if (state.marks[id] === status) delete state.marks[id];
      else state.marks[id] = status;
      saveState();
      renderWordList(state, vocabList);
      renderHeaderAndMiniStats(state, vocabList, filteredDeck);
    }
  });

  optById("btnExportAllCsv")?.addEventListener("click", () => {
    exportCsvByFilter(() => true, "全部2050词");
  });
  optById("btnExportReviewCsv")?.addEventListener("click", () => {
    exportCsvByFilter(
      (w) => state.marks[w.id] === "unknown" || state.marks[w.id] === "fuzzy",
      "重点攻克词表_不会与模糊",
    );
  });
  optById("btnExportUnknownCsv")?.addEventListener("click", () => {
    exportCsvByFilter((w) => state.marks[w.id] === "unknown", "完全不会词表");
  });
  optById("btnExportFuzzyCsv")?.addEventListener("click", () => {
    exportCsvByFilter((w) => state.marks[w.id] === "fuzzy", "有点模糊词表");
  });

  optById<HTMLInputElement>("inputImportCsv")?.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleImportCsv(file);
      input.value = "";
    }
  });

  optById("btnResetProgress")?.addEventListener("click", () => {
    openModal({
      title: "⚠️ 确认清空学习进度？",
      body: "此操作将清除所有单词的「很熟 / 有点模糊 / 完全不会」标记及笔记。建议清空前先导出 CSV 备份。",
      onConfirm: () => {
        state.marks = {};
        state.memos = {};
        state.currentIndex = 0;
        saveState();
        rebuildFilteredDeck(true);
        closeModal();
        showToast("已重置全部学习进度");
      },
    });
  });

  optById("btnModalCancel")?.addEventListener("click", closeModal);
  optById("btnModalConfirm")?.addEventListener("click", triggerModalConfirm);

  for (const btn of document.querySelectorAll<HTMLElement>(".nav-tab-btn")) {
    btn.addEventListener("click", () => {
      const nav = (btn.getAttribute("data-nav") || "study") as MainTab;
      switchTab(nav);
    });
  }

  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName ?? "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (isModalOpen()) return;

    if (state.activeTab === "zen") {
      if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        advanceZenWord(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        advanceZenWord(-1);
      }
      return;
    }
    if (state.activeTab !== "study") return;

    if (e.key === "1") {
      e.preventDefault();
      markCurrentWord("known");
    } else if (e.key === "2") {
      e.preventDefault();
      markCurrentWord("fuzzy");
    } else if (e.key === "3") {
      e.preventDefault();
      markCurrentWord("unknown");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepWord(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepWord(-1);
    } else if (e.key === " ") {
      e.preventDefault();
      if (state.maskMode !== "none" && !state.cardRevealed) {
        state.cardRevealed = true;
        renderStudyCard(state, filteredDeck);
      }
      const word = filteredDeck[state.currentIndex]?.word;
      if (word) speakText(word);
    }
  });
}

if (document.readyState !== "loading") {
  setupApp();
} else {
  window.addEventListener("DOMContentLoaded", setupApp);
}
