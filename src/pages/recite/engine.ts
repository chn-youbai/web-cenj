import type { ListTab, QuizPool, ReciteWord, StatusFilter, WordMarkStatus } from "./types";

export interface FreqTierStat {
  name: string;
  total: number;
  known: number;
  fuzzy: number;
  unknown: number;
  knownPct: string;
  fuzzyPct: string;
  unknownPct: string;
}

export interface MasteryStats {
  total: number;
  known: number;
  fuzzy: number;
  unknown: number;
  unmarked: number;
  marked: number;
  masteryPct: string;
  knownPct: string;
  fuzzyPct: string;
  unknownPct: string;
  unmarkedPct: string;
  tiers: FreqTierStat[];
}

export interface TypographyPreset {
  id: "compact" | "standard" | "large";
  label: string;
  enFontSize: number;
  cnFontSize: number;
  enFontWeight: number;
  cnFontWeight: number;
}

export const TYPOGRAPHY_PRESETS: readonly TypographyPreset[] = [
  {
    id: "compact",
    label: "紧凑",
    enFontSize: 42,
    cnFontSize: 24,
    enFontWeight: 600,
    cnFontWeight: 600,
  },
  {
    id: "standard",
    label: "标准",
    enFontSize: 58,
    cnFontSize: 34,
    enFontWeight: 700,
    cnFontWeight: 700,
  },
  {
    id: "large",
    label: "大字",
    enFontSize: 72,
    cnFontSize: 42,
    enFontWeight: 700,
    cnFontWeight: 700,
  },
] as const;

export function cleanWordForSpeech(raw: string): string {
  if (!raw) return "";
  const first = raw.split("/")[0] ?? "";
  return first.trim().replace(/[^a-zA-Z\s\-']/g, "");
}

export function getWordsByGroup(vocabList: ReciteWord[], groupKey: string): ReciteWord[] {
  if (groupKey === "all") return [...vocabList];
  if (groupKey === "tier_high") return vocabList.filter((w) => w.freq >= 15);
  if (groupKey === "tier_mid") return vocabList.filter((w) => w.freq >= 5 && w.freq <= 14);
  if (groupKey === "tier_low") return vocabList.filter((w) => w.freq >= 1 && w.freq <= 4);
  if (groupKey === "tier_zero") return vocabList.filter((w) => w.freq === 0);
  if (groupKey.startsWith("g_")) {
    const g = Number.parseInt(groupKey.split("_")[1] ?? "1", 10);
    if (!Number.isFinite(g) || g < 1) return [...vocabList];
    const start = (g - 1) * 50;
    return vocabList.slice(start, start + 50);
  }
  return [...vocabList];
}

export function wordMatchesFilter(
  marks: Record<number, WordMarkStatus>,
  wordId: number,
  filter: StatusFilter,
): boolean {
  if (!filter || filter === "all") return true;
  const m = marks[wordId];
  if (filter === "unmarked") return !m;
  if (filter === "review") return m === "unknown" || m === "fuzzy";
  return m === filter;
}

export function buildFilteredDeck(
  vocabList: ReciteWord[],
  marks: Record<number, WordMarkStatus>,
  groupKey: string,
  statusFilter: StatusFilter,
  isShuffled: boolean,
): ReciteWord[] {
  let pool = getWordsByGroup(vocabList, groupKey);
  if (statusFilter !== "all") {
    pool = pool.filter((w) => wordMatchesFilter(marks, w.id, statusFilter));
  }
  if (isShuffled) {
    pool = [...pool];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      const swap = pool[j];
      if (tmp && swap) {
        pool[i] = swap;
        pool[j] = tmp;
      }
    }
  }
  return pool;
}

export interface JumpToWordResult {
  deck: ReciteWord[];
  index: number;
  resetGroupOrFilter: boolean;
}

export function jumpToWordInDeck(
  vocabList: ReciteWord[],
  currentDeck: ReciteWord[],
  wordId: number,
): JumpToWordResult {
  const idx = currentDeck.findIndex((w) => w.id === wordId);
  if (idx >= 0) {
    return { deck: currentDeck, index: idx, resetGroupOrFilter: false };
  }
  const fullIdx = vocabList.findIndex((w) => w.id === wordId);
  return {
    deck: [...vocabList],
    index: fullIdx >= 0 ? fullIdx : 0,
    resetGroupOrFilter: true,
  };
}

export function getStatusInfo(status: WordMarkStatus | undefined): { label: string; cls: string } {
  if (status === "known") {
    return { label: "🟢 很熟", cls: "status-pill status-known" };
  }
  if (status === "fuzzy") {
    return { label: "🟡 有点模糊", cls: "status-pill status-fuzzy" };
  }
  if (status === "unknown") {
    return { label: "🔴 完全不会", cls: "status-pill status-unknown" };
  }
  return { label: "⚪ 未标记", cls: "status-pill status-unmarked" };
}

export function getFontWeightLabel(weight: number): string {
  const map: Record<number, string> = {
    300: "细体 (300)",
    400: "常规 (400)",
    500: "中等 (500)",
    600: "半粗 (600)",
    700: "粗体 (700)",
    800: "特粗 (800)",
    900: "极粗 (900)",
  };
  return map[weight] ?? `${weight}`;
}

export function calculateMasteryStats(
  vocabList: ReciteWord[],
  marks: Record<number, WordMarkStatus>,
): MasteryStats {
  const total = vocabList.length;
  let known = 0;
  let fuzzy = 0;
  let unknown = 0;

  for (const w of vocabList) {
    const m = marks[w.id];
    if (m === "known") known += 1;
    else if (m === "fuzzy") fuzzy += 1;
    else if (m === "unknown") unknown += 1;
  }

  const unmarked = total - known - fuzzy - unknown;
  const marked = known + fuzzy + unknown;
  const pct = (n: number, denom: number) => (denom > 0 ? ((n / denom) * 100).toFixed(1) : "0.0");

  const tierDefs: { name: string; filter: (w: ReciteWord) => boolean }[] = [
    { name: "高频核心词 (考频 ≥ 15)", filter: (w) => w.freq >= 15 },
    { name: "中频常考词 (考频 5–14)", filter: (w) => w.freq >= 5 && w.freq <= 14 },
    { name: "基础必备词 (考频 1–4)", filter: (w) => w.freq >= 1 && w.freq <= 4 },
    { name: "新增认知词 (考频 0)", filter: (w) => w.freq === 0 },
  ];

  const tiers: FreqTierStat[] = tierDefs.map((t) => {
    const list = vocabList.filter(t.filter);
    const tKnown = list.filter((w) => marks[w.id] === "known").length;
    const tFuzzy = list.filter((w) => marks[w.id] === "fuzzy").length;
    const tUnknown = list.filter((w) => marks[w.id] === "unknown").length;
    return {
      name: t.name,
      total: list.length,
      known: tKnown,
      fuzzy: tFuzzy,
      unknown: tUnknown,
      knownPct: pct(tKnown, list.length),
      fuzzyPct: pct(tFuzzy, list.length),
      unknownPct: pct(tUnknown, list.length),
    };
  });

  return {
    total,
    known,
    fuzzy,
    unknown,
    unmarked,
    marked,
    masteryPct: pct(known, total),
    knownPct: pct(known, total),
    fuzzyPct: pct(fuzzy, total),
    unknownPct: pct(unknown, total),
    unmarkedPct: pct(unmarked, total),
    tiers,
  };
}

export function filterWordList(
  vocabList: ReciteWord[],
  marks: Record<number, WordMarkStatus>,
  listSearch: string,
  listTab: ListTab,
): ReciteWord[] {
  const q = listSearch.trim().toLowerCase();
  return vocabList.filter((w) => {
    const m = marks[w.id];
    if (listTab === "known" && m !== "known") return false;
    if (listTab === "fuzzy" && m !== "fuzzy") return false;
    if (listTab === "unknown" && m !== "unknown") return false;
    if (listTab === "unmarked" && m) return false;
    if (!q) return true;
    return (
      String(w.id) === q ||
      w.word.toLowerCase().includes(q) ||
      w.meaning.toLowerCase().includes(q) ||
      w.forms.some((f) => f.toLowerCase().includes(q))
    );
  });
}

export function getQuizCandidates(
  vocabList: ReciteWord[],
  filteredDeck: ReciteWord[],
  marks: Record<number, WordMarkStatus>,
  currentGroup: string,
  quizPool: QuizPool,
): ReciteWord[] {
  const currentGroupWords = getWordsByGroup(vocabList, currentGroup);
  if (quizPool === "current_group") {
    if (filteredDeck.length > 0) return filteredDeck;
    return currentGroupWords.length > 0 ? currentGroupWords : vocabList;
  }
  if (quizPool === "review") {
    const groupRev = currentGroupWords.filter(
      (w) => marks[w.id] === "unknown" || marks[w.id] === "fuzzy",
    );
    if (groupRev.length > 0) return groupRev;
    const allRev = vocabList.filter((w) => marks[w.id] === "unknown" || marks[w.id] === "fuzzy");
    if (allRev.length > 0) return allRev;
    return currentGroupWords.length > 0 ? currentGroupWords : vocabList;
  }
  if (quizPool === "high_freq") {
    return vocabList.slice(0, 300);
  }
  return vocabList;
}
