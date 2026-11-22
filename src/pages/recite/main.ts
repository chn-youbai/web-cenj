import "@/core/fonts";
import { copyToClipboard, escapeHtml, optById } from "@/core/dom";
import { initAppShell } from "@/core/shell";
import {
  TYPOGRAPHY_PRESETS,
  buildFilteredDeck,
  cleanWordForSpeech,
  getQuizCandidates,
  getWordsByGroup,
  jumpToWordInDeck,
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
  renderHeaderAndControls,
  renderQuizScoreUI,
  renderStatsView,
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
  type QuizKind,
  type QuizPool,
  type QuizType,
  type ReciteWord,
  SYSTEM_DEFAULTS,
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
      if (isManual) showToast(`☁️ 已保存并同步至云端 (${nowStr})`);
    } else if (res.status === "conflict" && res.cloudData) {
      mergeCloudDataIntoState(state, res.cloudData);
      saveState(false);
      rebuildFilteredDeck(false);
      renderAllViews(state, vocabList, filteredDeck);
      if (isManual) showToast("☁️ 已与云端最新进度智能对齐");
    }
  } catch {
    if (isManual) showToast("⚠️ 云端同步暂不可用，已保存在本地");
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
      showToast(`✅ 已载入「${cleanKey}」云端学习进度`);
    } else if (res.status === "empty") {
      updateSyncUI();
      await pushCloudSync(true);
      showToast(`✅ 已绑定新同步码「${cleanKey}」`);
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
    title: "☁️ 跨端云同步 · 设置同步码",
    body: `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>当前同步码：<strong style="font-family:var(--font-mono);">${escapeHtml(currentKey)}</strong></div>
        <div style="font-size:12px;opacity:0.8;">支持任意 1–50 位中英文或数字组合；多端输入相同同步码即可云端互通。</div>
        <div style="display:flex;gap:8px;">
          <button type="button" id="modalCopyBtn" class="rc-btn rc-btn-ghost" style="flex:1;">📋 复制当前码</button>
          <button type="button" id="modalRandomBtn" class="rc-btn rc-btn-ghost" style="flex:1;">🎲 随机短码</button>
        </div>
      </div>
    `,
    showInput: true,
    inputValue: currentKey,
    onConfirm: () => {
      const input = optById<HTMLInputElement>("modalInput");
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
      const inp = optById<HTMLInputElement>("modalInput");
      if (inp) inp.value = `GK-${rand}`;
    });
  }, 30);
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
      toastMsg = `🎉 第 ${currentG} 组已完成，自动进入第 ${currentG + 1} 组`;
    } else {
      state.currentIndex = 0;
      toastMsg = "🎉 第 41 组已完成，已回到本组开头";
    }
  } else {
    state.currentIndex = 0;
    toastMsg = `${item.word} → ${statusLabels[status]}（已循环到开头）`;
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

function stepWord(delta: number, wrapInZen = false): void {
  if (filteredDeck.length === 0) return;
  let nextIdx = state.currentIndex + delta;
  if (wrapInZen) {
    nextIdx = (nextIdx + filteredDeck.length) % filteredDeck.length;
  } else {
    if (nextIdx < 0) {
      showToast("已经是第一个单词");
      return;
    }
    if (nextIdx >= filteredDeck.length) {
      showToast("已经是最后一个单词");
      return;
    }
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

const ALL_QUIZ_KINDS: QuizKind[] = ["en_to_cn", "cn_to_en", "listen_to_cn", "spell"];

const QUIZ_KIND_LABELS: Record<QuizKind, string> = {
  en_to_cn: "看英选中",
  cn_to_en: "看中选英",
  listen_to_cn: "听音选义",
  spell: "拼写",
};

function resolveQuizKind(mode: QuizType): QuizKind {
  if (mode === "mixed") {
    return ALL_QUIZ_KINDS[Math.floor(Math.random() * ALL_QUIZ_KINDS.length)] ?? "en_to_cn";
  }
  return mode;
}

function isChoiceQuizKind(kind: QuizKind): boolean {
  return kind === "en_to_cn" || kind === "cn_to_en" || kind === "listen_to_cn";
}

function syncWrongMarkGroup(visible: boolean): void {
  const group = optById("quizWrongMarkGroup");
  if (!group) return;
  group.hidden = !visible;
  const wordId = state.currentQuizWord?.id;
  const currentStatus = wordId !== undefined ? state.marks[wordId] : undefined;
  for (const btn of group.querySelectorAll<HTMLButtonElement>("[data-quiz-mark]")) {
    const status = btn.dataset.quizMark as WordMarkStatus | undefined;
    btn.classList.toggle("active", Boolean(status && currentStatus === status));
  }
}

function markWordFromQuiz(status: WordMarkStatus): void {
  const word = state.currentQuizWord;
  if (!word) return;
  if (state.marks[word.id] === status) {
    delete state.marks[word.id];
    showToast(`已取消「${word.word}」的标记`);
  } else {
    state.marks[word.id] = status;
    showToast(status === "unknown" ? `已标「${word.word}」为不会` : `已标「${word.word}」为模糊`);
  }
  syncWrongMarkGroup(true);
  saveState();
  renderAllViews(state, vocabList, filteredDeck);
}

function renderQuizChoicesForCurrentWord(): void {
  clearQuizAutoNextTimer();
  const target = state.currentQuizWord;
  if (!target) return;
  state.quizAnswered = false;
  syncWrongMarkGroup(false);

  const fb = optById("quizFeedbackText");
  if (fb) {
    fb.textContent = "默认不改熟练度，答错可一键标为不会/模糊";
    fb.className = "quiz-feedback-text";
  }

  const isCnToEn = state.currentQuizKind === "cn_to_en";
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
      cand.word !== target.word &&
      !prevIds.has(cand.id) &&
      !distractors.some(
        (d) => d.id === cand.id || d.meaning === cand.meaning || d.word === cand.word,
      )
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
        <button type="button" data-quiz-opt="${opt.id}" class="quiz-opt-btn${isCnToEn ? " is-en" : ""}">
          <span>${idx + 1}. ${escapeHtml(isCnToEn ? opt.word : opt.meaning)}</span>
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
  state.currentQuizKind = resolveQuizKind(state.quizType);
  state.quizAnswered = false;
  state.quizHintLevel = 0;
  syncWrongMarkGroup(false);

  const kind = state.currentQuizKind;
  const metaEl = optById("quizWordMeta");
  if (metaEl) {
    const freqText = target.freq > 0 ? `考频 ${target.freq} 次` : "新增词";
    metaEl.textContent = `${QUIZ_KIND_LABELS[kind]} · #${target.id} · ${freqText}`;
  }

  const fb = optById("quizFeedbackText");
  if (fb) {
    fb.textContent = "默认不改熟练度，答错可一键标为不会/模糊";
    fb.className = "quiz-feedback-text";
  }

  const choiceBox = optById("quizChoiceContainer");
  const spellBox = optById("quizSpellContainer");
  const refreshBtn = optById("btnQuizRefreshOptions");
  const promptMain = optById("quizPromptMain");
  const listenBtn = optById("btnQuizListenReplay");
  const promptSub = optById("quizPromptSub");

  if (isChoiceQuizKind(kind)) {
    if (choiceBox) choiceBox.hidden = false;
    if (spellBox) spellBox.hidden = true;
    if (refreshBtn) refreshBtn.hidden = false;

    if (kind === "en_to_cn") {
      if (promptMain) {
        promptMain.hidden = false;
        promptMain.textContent = target.word;
      }
      if (listenBtn) listenBtn.hidden = true;
      if (promptSub) promptSub.textContent = "按 1–4 或点击选项选出正确中文释义";
      renderQuizChoicesForCurrentWord();
      if (state.autoSpeak) speakText(target.word);
    } else if (kind === "cn_to_en") {
      if (promptMain) {
        promptMain.hidden = false;
        promptMain.textContent = target.meaning;
      }
      if (listenBtn) listenBtn.hidden = true;
      if (promptSub) promptSub.textContent = "按 1–4 或点击选项选出对应英文单词";
      renderQuizChoicesForCurrentWord();
    } else {
      if (promptMain) promptMain.hidden = true;
      if (listenBtn) listenBtn.hidden = false;
      if (promptSub) promptSub.textContent = "听发音后按 1–4 或点击选项选出中文释义（空格重播）";
      renderQuizChoicesForCurrentWord();
      speakText(target.word);
    }
  } else {
    if (choiceBox) choiceBox.hidden = true;
    if (spellBox) spellBox.hidden = false;
    if (refreshBtn) refreshBtn.hidden = true;
    if (listenBtn) listenBtn.hidden = true;
    if (promptMain) {
      promptMain.hidden = false;
      promptMain.textContent = target.meaning;
    }
    if (promptSub) promptSub.textContent = "根据中文释义与发音拼写完整英文单词";

    const cleanTarget = cleanWordForSpeech(target.word) || target.word;
    const hintEl = optById("quizSpellHint");
    if (hintEl)
      hintEl.textContent = `${"_ ".repeat(cleanTarget.length).trim()} (${cleanTarget.length}字母)`;

    const inp = optById<HTMLInputElement>("inputQuizSpell");
    if (inp) {
      inp.value = "";
      inp.disabled = false;
      window.setTimeout(() => inp.focus(), 40);
    }
    speakText(target.word);
  }
}

function handleQuizChoiceAnswer(optBtn: HTMLButtonElement): void {
  if (state.quizAnswered || !state.currentQuizWord) return;
  state.quizAnswered = true;
  const chosenId = Number.parseInt(optBtn.dataset.quizOpt ?? "0", 10);
  const target = state.currentQuizWord;
  const kind = state.currentQuizKind;
  const isCorrect = chosenId === target.id;

  state.quizTotal += 1;
  if (isCorrect) {
    state.quizCorrect += 1;
    state.quizStreak += 1;
  } else {
    state.quizStreak = 0;
  }

  for (const b of document.querySelectorAll<HTMLButtonElement>(".quiz-opt-btn")) {
    const bid = Number.parseInt(b.dataset.quizOpt ?? "0", 10);
    b.disabled = true;
    if (bid === target.id) {
      b.classList.add("is-correct");
    } else if (bid === chosenId && !isCorrect) {
      b.classList.add("is-wrong");
    }
  }

  if (kind === "listen_to_cn") {
    const promptMain = optById("quizPromptMain");
    if (promptMain) {
      promptMain.hidden = false;
      promptMain.textContent = target.word;
    }
  }

  const fb = optById("quizFeedbackText");
  if (fb) {
    if (isCorrect) {
      fb.textContent = `✅ 回答正确：${target.word} · ${target.meaning}`;
      fb.className = "quiz-feedback-text is-correct";
    } else {
      const answerDisplay =
        kind === "cn_to_en" ? target.word : `${target.word} · ${target.meaning}`;
      fb.textContent = `❌ 正确答案：${answerDisplay}`;
      fb.className = "quiz-feedback-text is-wrong";
    }
  }
  syncWrongMarkGroup(!isCorrect);
  renderQuizScoreUI(state);
  speakText(target.word);

  if (isCorrect) {
    scheduleQuizAutoNext(650);
  }
}

function handleQuizSpellSubmit(): void {
  if (state.quizAnswered || !state.currentQuizWord) return;
  const inp = optById<HTMLInputElement>("inputQuizSpell");
  const userAns = (inp?.value || "").trim().toLowerCase();
  if (!userAns) {
    showToast("请先输入单词拼写");
    return;
  }

  const target = state.currentQuizWord;
  const targetWord = (cleanWordForSpeech(target.word) || target.word).toLowerCase();
  const isCorrect = userAns === targetWord;

  state.quizAnswered = true;
  if (inp) inp.disabled = true;
  state.quizTotal += 1;
  if (isCorrect) {
    state.quizCorrect += 1;
    state.quizStreak += 1;
  } else {
    state.quizStreak = 0;
  }

  const fb = optById("quizFeedbackText");
  if (fb) {
    if (isCorrect) {
      fb.textContent = `✅ 拼写正确：${targetWord}`;
      fb.className = "quiz-feedback-text is-correct";
    } else {
      fb.textContent = `❌ 正确拼写：${targetWord}`;
      fb.className = "quiz-feedback-text is-wrong";
    }
  }
  syncWrongMarkGroup(!isCorrect);
  renderQuizScoreUI(state);
  speakText(target.word);

  if (isCorrect) {
    scheduleQuizAutoNext(650);
  }
}

function switchTab(tabName: MainTab): void {
  clearQuizAutoNextTimer();
  state.activeTab = tabName;

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-nav]")) {
    const isTarget = btn.dataset.nav === tabName;
    btn.classList.toggle("active", isTarget);
    btn.setAttribute("aria-selected", String(isTarget));
  }

  const views: Record<MainTab, string> = {
    study: "viewStudy",
    quiz: "viewQuiz",
    list: "viewList",
    stats: "viewStats",
  };
  for (const [k, id] of Object.entries(views)) {
    const el = optById(id);
    if (el) el.hidden = k !== tabName;
  }

  if (tabName === "quiz" && !state.currentQuizWord) {
    nextQuizQuestion();
  }
  if (tabName === "list") {
    renderWordList(state, vocabList);
  }
  if (tabName === "stats") {
    renderStatsView(state, vocabList);
  }
}

function openPrefModal(): void {
  const modal = optById("prefModalBackdrop");
  if (modal) modal.hidden = false;
  renderHeaderAndControls(state, vocabList);
}

function closePrefModal(): void {
  const modal = optById("prefModalBackdrop");
  if (modal) modal.hidden = true;
}

function exportCsv(
  filterFn: (w: ReciteWord) => boolean,
  filePrefix: string,
  emptyMsg: string,
): void {
  const { csvContent, count } = buildExportCsvContent(vocabList, state.marks, filterFn);
  if (count === 0) {
    showToast(emptyMsg);
    return;
  }
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`✅ 已导出 ${count} 个单词 CSV 报表`);
}

function bindEvents(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-nav]")) {
    btn.addEventListener("click", () => {
      switchTab((btn.dataset.nav as MainTab | undefined) ?? "study");
    });
  }

  // Group selector
  optById<HTMLSelectElement>("selectGroup")?.addEventListener("change", (e) => {
    state.currentGroup = (e.target as HTMLSelectElement).value;
    rebuildFilteredDeck(true);
    saveState();
  });

  // Inline status filters
  for (const chip of document.querySelectorAll<HTMLButtonElement>("[data-status-filter]")) {
    chip.addEventListener("click", () => {
      const f = (chip.dataset.statusFilter as StatusFilter | undefined) ?? "all";
      state.statusFilter = f;
      rebuildFilteredDeck(true);
      saveState();
    });
  }

  // Mask mode cycle button
  optById("btnMaskToggle")?.addEventListener("click", () => {
    const order: MaskMode[] = ["none", "hide_cn", "hide_en"];
    const next = order[(order.indexOf(state.maskMode) + 1) % order.length] ?? "none";
    state.maskMode = next;
    state.cardRevealed = false;
    saveState();
    renderAllViews(state, vocabList, filteredDeck);
  });

  // Shuffle toggle
  optById("btnShuffleDeck")?.addEventListener("click", () => {
    state.isShuffled = !state.isShuffled;
    rebuildFilteredDeck(true);
    showToast(state.isShuffled ? "🔀 已开启乱序刷词" : "📋 已恢复考频顺序");
  });

  // Fullscreen Zen mode toggle
  optById("btnZenToggle")?.addEventListener("click", () => {
    state.zenMode = !state.zenMode;
    renderAllViews(state, vocabList, filteredDeck);
  });

  optById("btnExitZen")?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.zenMode = false;
    renderAllViews(state, vocabList, filteredDeck);
  });

  const zenOverlay = optById("zenFullscreen");
  zenOverlay?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement | null)?.closest("#btnExitZen")) return;
    if (filteredDeck.length === 0) return;
    if (state.maskMode !== "none" && !state.cardRevealed) {
      state.cardRevealed = true;
      renderStudyCard(state, filteredDeck);
      const w = filteredDeck[state.currentIndex]?.word;
      if (w) speakText(w);
      return;
    }
    const rect = zenOverlay.getBoundingClientRect();
    const clickRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 1;
    stepWord(clickRatio < 0.35 ? -1 : 1, true);
  });

  let zenTouchStartX = 0;
  let zenTouchStartY = 0;
  zenOverlay?.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      zenTouchStartX = touch.screenX;
      zenTouchStartY = touch.screenY;
    },
    { passive: true },
  );
  zenOverlay?.addEventListener(
    "touchend",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.screenX - zenTouchStartX;
      const dy = touch.screenY - zenTouchStartY;
      if (Math.abs(dx) > 56 && Math.abs(dy) < 55) {
        stepWord(dx > 0 ? -1 : 1, true);
      }
    },
    { passive: true },
  );

  // Card swipe / drag on mobile & desktop
  let startX = 0;
  let startY = 0;
  let suppressNextClick = false;
  const cardEl = optById("wordCardContainer");

  cardEl?.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      startX = touch.screenX;
      startY = touch.screenY;
    },
    { passive: true },
  );
  cardEl?.addEventListener(
    "touchend",
    (e) => {
      if (state.activeTab !== "study") return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.screenX - startX;
      const dy = touch.screenY - startY;
      if (Math.abs(dx) > 48 && Math.abs(dy) < 60) {
        stepWord(dx > 0 ? -1 : 1, state.zenMode);
      }
    },
    { passive: true },
  );

  let pointerDown = false;
  cardEl?.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    pointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  cardEl?.addEventListener("pointerup", (e) => {
    if (!pointerDown || e.pointerType === "touch") return;
    pointerDown = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 48 && Math.abs(dy) < 60) {
      suppressNextClick = true;
      stepWord(dx > 0 ? -1 : 1, state.zenMode);
    }
  });

  // Card center area interaction
  optById("cardCenterArea")?.addEventListener("click", () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (filteredDeck.length === 0) return;
    if (state.maskMode !== "none" && !state.cardRevealed) {
      state.cardRevealed = true;
      renderStudyCard(state, filteredDeck);
      const w = filteredDeck[state.currentIndex]?.word;
      if (w) speakText(w);
    } else {
      const w = filteredDeck[state.currentIndex]?.word;
      if (w) speakText(w);
    }
  });

  // Study controls
  optById("btnSpeakWord")?.addEventListener("click", () => {
    const w = filteredDeck[state.currentIndex]?.word;
    if (w) speakText(w);
  });

  // Mark pills
  optById("btnMarkKnown")?.addEventListener("click", () => markCurrentWord("known"));
  optById("btnMarkFuzzy")?.addEventListener("click", () => markCurrentWord("fuzzy"));
  optById("btnMarkUnknown")?.addEventListener("click", () => markCurrentWord("unknown"));

  // Header controls
  optById("btnHeaderSync")?.addEventListener("click", openSyncKeyModal);
  const toggleAccent = () => {
    state.accent = state.accent === "en-US" ? "en-GB" : "en-US";
    saveState();
    renderHeaderAndControls(state, vocabList);
    showToast(state.accent === "en-US" ? "已切换为美式发音" : "已切换为英式发音");
    if (state.activeTab === "study") {
      const w = filteredDeck[state.currentIndex]?.word;
      if (w) speakText(w);
    }
  };
  optById("btnAccentToggle")?.addEventListener("click", toggleAccent);
  optById("btnDrawerAccentToggle")?.addEventListener("click", toggleAccent);

  // Preference modal
  optById("btnOpenPref")?.addEventListener("click", openPrefModal);
  optById("btnClosePrefModal")?.addEventListener("click", closePrefModal);
  optById("btnDonePrefModal")?.addEventListener("click", closePrefModal);
  optById("prefModalBackdrop")?.addEventListener("click", (e) => {
    if (e.target === optById("prefModalBackdrop")) closePrefModal();
  });

  for (const presetBtn of document.querySelectorAll<HTMLButtonElement>("[data-typo-preset]")) {
    presetBtn.addEventListener("click", () => {
      const preset = TYPOGRAPHY_PRESETS.find((p) => p.id === presetBtn.dataset.typoPreset);
      if (!preset) return;
      state.enFontSize = preset.enFontSize;
      state.cnFontSize = preset.cnFontSize;
      state.enFontWeight = preset.enFontWeight;
      state.cnFontWeight = preset.cnFontWeight;
      saveState();
      renderAllViews(state, vocabList, filteredDeck);
    });
  }

  optById("btnResetFontSizes")?.addEventListener("click", () => {
    state.enFontSize = SYSTEM_DEFAULTS.enFontSize;
    state.cnFontSize = SYSTEM_DEFAULTS.cnFontSize;
    state.enFontWeight = SYSTEM_DEFAULTS.enFontWeight;
    state.cnFontWeight = SYSTEM_DEFAULTS.cnFontWeight;
    saveState();
    renderAllViews(state, vocabList, filteredDeck);
    showToast("已恢复默认字号与粗细");
  });

  const bindRange = (id: string, assign: (val: number) => void, onDoneToast?: string): void => {
    const el = optById<HTMLInputElement>(id);
    el?.addEventListener("input", (e) => {
      assign(Number.parseInt((e.target as HTMLInputElement).value, 10));
      renderHeaderAndControls(state, vocabList);
      renderStudyCard(state, filteredDeck);
    });
    el?.addEventListener("change", () => {
      saveState();
      if (onDoneToast) showToast(onDoneToast);
    });
  };
  bindRange("sliderEnFontSize", (v) => {
    state.enFontSize = v;
  });
  bindRange("sliderCnFontSize", (v) => {
    state.cnFontSize = v;
  });
  bindRange("sliderEnFontWeight", (v) => {
    state.enFontWeight = v;
  });
  bindRange("sliderCnFontWeight", (v) => {
    state.cnFontWeight = v;
  });

  optById("btnDrawerSpeedToggle")?.addEventListener("click", () => {
    const speeds = [0.8, 1.0, 1.25];
    const next = speeds[(speeds.indexOf(state.speechRate) + 1) % speeds.length] ?? 1.0;
    state.speechRate = next;
    saveState();
    renderHeaderAndControls(state, vocabList);
    showToast(`语速已切换为 ${next}x`);
  });

  optById("btnAutoPlayAudio")?.addEventListener("click", () => {
    state.autoSpeak = !state.autoSpeak;
    saveState();
    renderHeaderAndControls(state, vocabList);
    showToast(state.autoSpeak ? "🔔 已开启切词自动发音" : "🔕 已关闭切词自动发音");
  });

  // Quiz controls
  const quizModeSwitch = optById("quizModeSwitch");
  quizModeSwitch?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-quiz-type]");
    const nextMode = btn?.dataset.quizType as QuizType | undefined;
    if (!nextMode) return;
    state.quizType = nextMode;
    for (const item of quizModeSwitch.querySelectorAll<HTMLButtonElement>("[data-quiz-type]")) {
      item.classList.toggle("active", item.dataset.quizType === nextMode);
    }
    nextQuizQuestion();
  });
  optById<HTMLSelectElement>("selectQuizPool")?.addEventListener("change", (e) => {
    state.quizPool = (e.target as HTMLSelectElement).value as QuizPool;
    state.currentQuizWord = null;
    nextQuizQuestion();
  });
  optById("btnQuizSpeak")?.addEventListener("click", () => {
    if (state.currentQuizWord) speakText(state.currentQuizWord.word);
  });
  optById("btnQuizListenReplay")?.addEventListener("click", () => {
    if (state.currentQuizWord) speakText(state.currentQuizWord.word);
  });
  optById("btnQuizRefreshOptions")?.addEventListener("click", () => {
    if (!isChoiceQuizKind(state.currentQuizKind) || !state.currentQuizWord) return;
    if (state.quizAnswered) {
      nextQuizQuestion();
      return;
    }
    renderQuizChoicesForCurrentWord();
    showToast("🔄 已换一组干扰项");
  });
  optById("quizWrongMarkGroup")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-quiz-mark]");
    const status = btn?.dataset.quizMark as WordMarkStatus | undefined;
    if (status) markWordFromQuiz(status);
  });
  optById("btnQuizNext")?.addEventListener("click", nextQuizQuestion);
  optById("quizChoiceContainer")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".quiz-opt-btn");
    if (btn) handleQuizChoiceAnswer(btn);
  });
  optById("btnQuizSpellSubmit")?.addEventListener("click", handleQuizSpellSubmit);
  optById("btnQuizSpellHintTrigger")?.addEventListener("click", () => {
    if (!state.currentQuizWord) return;
    const cleanTarget =
      cleanWordForSpeech(state.currentQuizWord.word) || state.currentQuizWord.word;
    state.quizHintLevel += 1;
    const showLen = Math.min(state.quizHintLevel, Math.max(1, cleanTarget.length - 1));
    const masked = `${cleanTarget.slice(0, showLen)} ${"_ ".repeat(Math.max(0, cleanTarget.length - showLen)).trim()}`;
    const hintEl = optById("quizSpellHint");
    if (hintEl) hintEl.textContent = `${masked} (${cleanTarget.length}字母)`;
  });
  optById<HTMLInputElement>("inputQuizSpell")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (state.quizAnswered) nextQuizQuestion();
      else handleQuizSpellSubmit();
    }
  });

  // Word list controls (search + filter + inline quick mark + jump to flashcard)
  let searchTimer: number | null = null;
  const searchInp = optById<HTMLInputElement>("inputListSearch");
  const clearSearchBtn = optById<HTMLButtonElement>("btnClearSearch");
  searchInp?.addEventListener("input", (e) => {
    const val = (e.target as HTMLInputElement).value;
    state.listSearch = val;
    if (clearSearchBtn) clearSearchBtn.hidden = !val;
    state.listPage = 1;
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      renderWordList(state, vocabList);
    }, 120);
  });
  clearSearchBtn?.addEventListener("click", () => {
    if (searchInp) searchInp.value = "";
    state.listSearch = "";
    clearSearchBtn.hidden = true;
    state.listPage = 1;
    renderWordList(state, vocabList);
  });
  for (const tabBtn of document.querySelectorAll<HTMLButtonElement>("[data-list-tab]")) {
    tabBtn.addEventListener("click", () => {
      state.listTab = (tabBtn.dataset.listTab as ListTab | undefined) ?? "all";
      state.listPage = 1;
      for (const t of document.querySelectorAll<HTMLButtonElement>("[data-list-tab]")) {
        t.classList.toggle("active", t === tabBtn);
      }
      renderWordList(state, vocabList);
    });
  }
  optById("btnListPrevPage")?.addEventListener("click", () => {
    if (state.listPage > 1) {
      state.listPage -= 1;
      renderWordList(state, vocabList);
      optById("wordListScroll")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  optById("btnListNextPage")?.addEventListener("click", () => {
    state.listPage += 1;
    renderWordList(state, vocabList);
    optById("wordListScroll")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  optById("wordListScroll")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const speakBtn = target.closest<HTMLButtonElement>("[data-list-speak]");
    if (speakBtn) {
      const id = Number.parseInt(speakBtn.dataset.listSpeak ?? "0", 10);
      const word = vocabList.find((w) => w.id === id);
      if (word) speakText(word.word);
      return;
    }

    const markBtn = target.closest<HTMLButtonElement>("[data-list-mark]");
    if (markBtn) {
      const [idStr, st] = (markBtn.dataset.listMark ?? "").split(":");
      const id = Number.parseInt(idStr ?? "0", 10);
      const status = st as WordMarkStatus | undefined;
      if (!id || !status) return;
      if (state.marks[id] === status) {
        delete state.marks[id];
      } else {
        state.marks[id] = status;
      }
      saveState();
      renderAllViews(state, vocabList, filteredDeck);
      return;
    }

    const jumpBtn = target.closest<HTMLButtonElement>("[data-list-jump]");
    if (jumpBtn) {
      const id = Number.parseInt(jumpBtn.dataset.listJump ?? "0", 10);
      if (!id) return;
      const jumped = jumpToWordInDeck(vocabList, filteredDeck, id);
      if (jumped.resetGroupOrFilter) {
        state.currentGroup = "all";
        state.statusFilter = "all";
        const sel = optById<HTMLSelectElement>("selectGroup");
        if (sel) sel.value = "all";
      }
      filteredDeck = jumped.deck;
      state.currentIndex = jumped.index;
      state.cardRevealed = false;
      switchTab("study");
      renderAllViews(state, vocabList, filteredDeck);
      showToast("🎯 已定位到对应记忆闪卡");
    }
  });

  // Cloud sync & CSV actions
  optById("btnManualSync")?.addEventListener("click", () => {
    showToast("⏳ 正在同步到云端...");
    void pushCloudSync(true);
  });
  optById("btnCopySyncKey")?.addEventListener("click", copyCurrentKey);
  optById("btnRandomKey")?.addEventListener("click", () => {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKey = `GK-${rand}`;
    const customInp = optById<HTMLInputElement>("inputCustomSyncKey");
    if (customInp) customInp.value = newKey;
    showToast(`已填入随机码 ${newKey}，点击「绑定并拉取」生效`);
  });
  optById("btnApplyCustomKey")?.addEventListener("click", () => {
    const val = (optById<HTMLInputElement>("inputCustomSyncKey")?.value || "").trim();
    if (!val) {
      showToast("请输入有效的同步码");
      return;
    }
    void pullCloudSync(val);
  });

  optById("btnExportAllCsv")?.addEventListener("click", () =>
    exportCsv(() => true, "高考2050词汇全量进度", "词库为空"),
  );
  optById("btnExportReviewCsv")?.addEventListener("click", () =>
    exportCsv(
      (w) => state.marks[w.id] === "unknown" || state.marks[w.id] === "fuzzy",
      "高考2050重点错词本",
      "暂无不会或模糊词汇",
    ),
  );
  optById("btnExportUnknownCsv")?.addEventListener("click", () =>
    exportCsv((w) => state.marks[w.id] === "unknown", "高考2050完全不会词表", "暂无完全不会词汇"),
  );
  optById("btnExportFuzzyCsv")?.addEventListener("click", () =>
    exportCsv((w) => state.marks[w.id] === "fuzzy", "高考2050有点模糊词表", "暂无有点模糊词汇"),
  );

  optById<HTMLInputElement>("inputImportCsv")?.addEventListener("change", (e) => {
    const inputEl = e.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCsvRows(String(ev.target?.result ?? ""));
        if (rows.length < 2) {
          showToast("CSV 文件内容为空或格式不对");
          return;
        }
        const summary = applyImportedCsvRows(rows, vocabList, state.marks);
        saveState();
        rebuildFilteredDeck(false);
        showToast(
          `✅ 成功恢复：很熟 ${summary.importedKnown} · 模糊 ${summary.importedFuzzy} · 不会 ${summary.importedUnknown}`,
        );
      } catch {
        showToast("CSV 解析失败，请检查文件编码");
      }
    };
    reader.readAsText(file, "UTF-8");
    inputEl.value = "";
  });

  optById("btnResetProgress")?.addEventListener("click", () => {
    openModal({
      title: "⚠️ 确认清空全部进度？",
      body: "此操作将清空你本地所有词汇熟练度标记，且不可撤销。",
      onConfirm: () => {
        state.marks = {};
        state.currentIndex = 0;
        saveState();
        rebuildFilteredDeck(true);
        closeModal();
        showToast("已重置全部学习进度");
      },
    });
  });

  // Generic modal controls
  optById("btnModalCancel")?.addEventListener("click", closeModal);
  optById("btnCloseAppModal")?.addEventListener("click", closeModal);
  optById("btnModalConfirm")?.addEventListener("click", triggerModalConfirm);
  optById("appModal")?.addEventListener("click", (e) => {
    if (e.target === optById("appModal")) closeModal();
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }
    if (isModalOpen()) {
      if (e.key === "Escape") closeModal();
      return;
    }
    const prefModal = optById("prefModalBackdrop");
    if (prefModal && !prefModal.hidden) {
      if (e.key === "Escape") closePrefModal();
      return;
    }

    if (state.activeTab === "study") {
      if (e.key === "Escape" && state.zenMode) {
        e.preventDefault();
        state.zenMode = false;
        renderAllViews(state, vocabList, filteredDeck);
      } else if (e.key === "1") {
        e.preventDefault();
        markCurrentWord("known");
      } else if (e.key === "2") {
        e.preventDefault();
        markCurrentWord("fuzzy");
      } else if (e.key === "3") {
        e.preventDefault();
        markCurrentWord("unknown");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepWord(-1, state.zenMode);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepWord(1, state.zenMode);
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        optById("btnZenToggle")?.click();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (state.maskMode !== "none" && !state.cardRevealed) {
          state.cardRevealed = true;
          renderStudyCard(state, filteredDeck);
        }
        const w = filteredDeck[state.currentIndex]?.word;
        if (w) speakText(w);
      }
      return;
    }

    if (state.activeTab === "quiz" && isChoiceQuizKind(state.currentQuizKind)) {
      if (["1", "2", "3", "4"].includes(e.key) && !state.quizAnswered) {
        e.preventDefault();
        const idx = Number.parseInt(e.key, 10) - 1;
        const buttons = document.querySelectorAll<HTMLButtonElement>(".quiz-opt-btn");
        const targetBtn = buttons[idx];
        if (targetBtn) handleQuizChoiceAnswer(targetBtn);
      } else if (e.code === "Space" && state.currentQuizWord) {
        e.preventDefault();
        if (state.quizAnswered) {
          nextQuizQuestion();
        } else {
          speakText(state.currentQuizWord.word);
        }
      } else if (e.key === "Enter" && state.quizAnswered) {
        e.preventDefault();
        nextQuizQuestion();
      }
    }
  });
}

async function initApp(): Promise<void> {
  initAppShell({ activePage: "recite" });
  getOrCreateSyncKey();
  loadReciteState(state);
  populateGroupSelector(vocabList, state.currentGroup);
  filteredDeck = buildFilteredDeck(
    vocabList,
    state.marks,
    state.currentGroup,
    state.statusFilter,
    state.isShuffled,
  );
  bindEvents();
  renderAllViews(state, vocabList, filteredDeck);

  // Hydrate full 2050 words from IndexedDB / Cloud
  const db = await openVocabDb();
  const idbWords = await loadVocabFromIdb(db);
  if (idbWords && idbWords.length >= 2000) {
    vocabList = idbWords;
    populateGroupSelector(vocabList, state.currentGroup);
    rebuildFilteredDeck(false);
    void fetchVocabFromCloud().then((fresh) => {
      if (fresh && fresh.length >= 2000) {
        vocabList = fresh;
        void saveVocabToIdb(db, fresh);
        rebuildFilteredDeck(false);
      }
    });
  } else {
    void fetchVocabFromCloud().then((cloudWords) => {
      if (cloudWords && cloudWords.length >= 2000) {
        vocabList = cloudWords;
        void saveVocabToIdb(db, cloudWords);
        populateGroupSelector(vocabList, state.currentGroup);
        rebuildFilteredDeck(false);
      }
    });
  }

  // Pull cloud sync progress cleanly on startup
  const currentKey = getOrCreateSyncKey();
  if (currentKey && currentKey !== "GK-LOCAL") {
    void pullCloudSyncRequest(currentKey)
      .then((res) => {
        if (res.status === "ok" && res.data) {
          mergeCloudDataIntoState(state, res.data);
          saveState(false);
          rebuildFilteredDeck(false);
          renderAllViews(state, vocabList, filteredDeck);
        }
      })
      .catch(() => {
        // silent offline fallback
      });
  }
}

void initApp();
