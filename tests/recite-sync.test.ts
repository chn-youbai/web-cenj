import {
  TYPOGRAPHY_PRESETS,
  buildFilteredDeck,
  calculateMasteryStats,
  cleanWordForSpeech,
  filterWordList,
  getQuizCandidates,
  getWordsByGroup,
  jumpToWordInDeck,
} from "@/pages/recite/engine";
import {
  applyImportedCsvRows,
  buildExportCsvContent,
  classifyStatusCell,
  mergeCloudDataIntoState,
  parseCsvRows,
} from "@/pages/recite/sync";
import {
  type ReciteWord,
  type WordMarkStatus,
  createInitialReciteState,
} from "@/pages/recite/types";
import { describe, expect, it } from "vitest";

const sampleWords: ReciteWord[] = [
  { id: 1, freq: 20, word: "abandon /əˈbændən/", meaning: "放弃", forms: ["abandoned"] },
  { id: 2, freq: 10, word: "benefit", meaning: "益处", forms: ["beneficial"] },
  { id: 3, freq: 3, word: "capture", meaning: "捕获", forms: ["captured"] },
  { id: 4, freq: 0, word: "zephyr", meaning: "和风", forms: [] },
];

describe("recite study engine", () => {
  it("cleans phonetic annotations for speech synthesis", () => {
    expect(cleanWordForSpeech("abandon /əˈbændən/")).toBe("abandon");
    expect(cleanWordForSpeech("well-known!")).toBe("well-known");
  });

  it("filters words by frequency tier and group", () => {
    expect(getWordsByGroup(sampleWords, "tier_high")).toHaveLength(1);
    expect(getWordsByGroup(sampleWords, "tier_mid")).toHaveLength(1);
    expect(getWordsByGroup(sampleWords, "tier_low")).toHaveLength(1);
    expect(getWordsByGroup(sampleWords, "tier_zero")).toHaveLength(1);
    expect(getWordsByGroup(sampleWords, "g_1")).toHaveLength(4);
  });

  it("builds filtered decks and calculates mastery statistics", () => {
    const marks: Record<number, WordMarkStatus> = {
      1: "known",
      2: "fuzzy",
      3: "unknown",
    };
    const reviewDeck = buildFilteredDeck(sampleWords, marks, "all", "review", false);
    expect(reviewDeck.map((w) => w.id)).toEqual([2, 3]);

    const stats = calculateMasteryStats(sampleWords, marks);
    expect(stats.total).toBe(4);
    expect(stats.known).toBe(1);
    expect(stats.fuzzy).toBe(1);
    expect(stats.unknown).toBe(1);
    expect(stats.unmarked).toBe(1);
    expect(stats.masteryPct).toBe("25.0");

    const searched = filterWordList(sampleWords, marks, "捕获", "unknown");
    expect(searched.map((w) => w.id)).toEqual([3]);

    const quizPool = getQuizCandidates(sampleWords, reviewDeck, marks, "all", "review");
    expect(quizPool.map((w) => w.id)).toEqual([2, 3]);

    const inDeck = jumpToWordInDeck(sampleWords, reviewDeck, 3);
    expect(inDeck.resetGroupOrFilter).toBe(false);
    expect(inDeck.index).toBe(1);

    const outOfDeck = jumpToWordInDeck(sampleWords, reviewDeck, 4);
    expect(outOfDeck.resetGroupOrFilter).toBe(true);
    expect(outOfDeck.deck).toHaveLength(4);
    expect(outOfDeck.index).toBe(3);

    expect(TYPOGRAPHY_PRESETS.some((p) => p.id === "standard" && p.enFontSize === 58)).toBe(true);
  });
});

describe("recite cloud merge & CSV sync", () => {
  it("merges cloud marks and clamped settings into local state", () => {
    const state = createInitialReciteState();
    state.marks[1] = "fuzzy";
    mergeCloudDataIntoState(state, {
      marks: { 1: "known", 2: "unknown" },
      settings: {
        enFontSize: 150,
        cnFontSize: 10,
        accent: "en-GB",
        autoSpeak: true,
        currentIndex: 3,
      },
    });

    expect(state.marks[1]).toBe("known");
    expect(state.marks[2]).toBe("unknown");
    expect(state.enFontSize).toBe(100);
    expect(state.cnFontSize).toBe(16);
    expect(state.accent).toBe("en-GB");
    expect(state.autoSpeak).toBe(true);
    expect(state.currentIndex).toBe(3);
  });

  it("classifies status labels and round-trips CSV export/import", () => {
    expect(classifyStatusCell("🟢 很熟")).toBe("known");
    expect(classifyStatusCell("有点模糊")).toBe("fuzzy");
    expect(classifyStatusCell("完全不会")).toBe("unknown");
    expect(classifyStatusCell("未标记")).toBe("unmarked");

    const marks: Record<number, WordMarkStatus> = { 1: "known", 3: "unknown" };
    const { csvContent, count } = buildExportCsvContent(sampleWords, marks, () => true);
    expect(count).toBe(4);

    const rows = parseCsvRows(csvContent);
    const nextMarks: Record<number, WordMarkStatus> = {};
    const summary = applyImportedCsvRows(rows, sampleWords, nextMarks);

    expect(summary.importedKnown).toBe(1);
    expect(summary.importedUnknown).toBe(1);
    expect(nextMarks[1]).toBe("known");
    expect(nextMarks[3]).toBe("unknown");
  });
});
