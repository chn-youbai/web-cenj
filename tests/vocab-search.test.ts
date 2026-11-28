import { extractWordsFromBatchCSV, parseUploadedCSVContent } from "@/pages/vocab/csv";
import {
  aggregateLookupEntries,
  buildEntryKeys,
  deinflectSingleToken,
  editDistance,
  extractWordsFromFreeText,
  generateDeinflectedCandidates,
  indexAllEntries,
  judgeWordByTextbookStandard,
  lookupWordInTextbook,
  normalizeWordStr,
} from "@/pages/vocab/search";
import type { VocabEntry } from "@/pages/vocab/types";
import { describe, expect, it } from "vitest";

function makeSampleVocab(): VocabEntry[] {
  const entries: VocabEntry[] = [
    {
      b: "人教版高中英语必修第一册",
      u: "1",
      w: "apply",
      p: "vi. & vt.",
      m: "申请；请求；应用",
      f: "黑体",
      n: "",
    },
    {
      b: "人教版高中英语必修第二册",
      u: "2",
      w: "take care of",
      p: "phr.",
      m: "照顾；照料",
      f: "白体",
      n: "",
    },
    {
      b: "大学英语四级 (CET-4)",
      u: "A",
      w: "accommodate",
      p: "vt.",
      m: "容纳；提供住宿",
      f: "CET-4核心",
      n: "",
    },
    {
      b: "人教版高中英语必修第一册",
      u: "3",
      w: "go",
      p: "vi.",
      m: "去；走（went, gone）",
      f: "黑体",
      n: "",
    },
  ];
  indexAllEntries(entries);
  return entries;
}

describe("vocab search & normalization", () => {
  it("normalizes apostrophes, dashes, and whitespace", () => {
    expect(normalizeWordStr("  Don’t\u00A0give—up  ")).toBe("don't give-up");
  });

  it("builds variant keys including irregular forms and parenthetical suffixes", () => {
    const entry: VocabEntry = {
      b: "人教版高中英语必修第一册",
      u: "1",
      w: "organise (-ize)",
      p: "vt.",
      m: "组织（organised, organising）",
      f: "黑体",
      n: "",
    };
    buildEntryKeys(entry);
    expect(entry._headLower).toBe("organise");
    expect(entry._keys).toContain("organise");
    expect(entry._keys).toContain("organize");
    expect(entry._irreg).toContain("organised");
  });

  it("deinflects regular, doubled-consonant, and irregular tokens", () => {
    expect(deinflectSingleToken("applied")).toContain("apply");
    expect(deinflectSingleToken("running")).toContain("run");
    expect(deinflectSingleToken("went")).toContain("go");
    expect(generateDeinflectedCandidates("took care of")).toContain("take care of");
  });

  it("computes bounded edit distance accurately", () => {
    expect(editDistance("apply", "aply")).toBe(1);
    expect(editDistance("apply", "apply")).toBe(0);
    expect(editDistance("apply", "accommodation")).toBe(99);
  });

  it("looks up words across exact, lemma, phrase, other books, and typos", () => {
    const vocab = makeSampleVocab();

    const exact = lookupWordInTextbook(vocab, "applied", "ALL");
    expect(exact?.fragmentMatches[0]?.w).toBe("apply");
    expect(exact?.recognizedLemmas).toContain("apply");

    const scoped = lookupWordInTextbook(vocab, "accommodate", "人教版高中英语必修第一册");
    expect(scoped?.fragmentMatches).toHaveLength(0);
    expect(scoped?.matchesInOtherBooks).toHaveLength(1);
    expect(scoped?.matchesInOtherBooks[0]?.w).toBe("accommodate");

    const typo = lookupWordInTextbook(vocab, "aply", "ALL");
    expect(typo?.fragmentMatches).toHaveLength(0);
    expect(typo?.typoMatches.some((e) => e.w === "apply")).toBe(true);
  });

  it("judges batch words against textbook standards", () => {
    const vocab = makeSampleVocab();

    const hit = judgeWordByTextbookStandard(vocab, "went", "ALL");
    expect(hit?.isInTextbook).toBe(true);
    expect(hit?.matches[0]?.w).toBe("go");

    const miss = judgeWordByTextbookStandard(vocab, "quantum", "ALL");
    expect(miss?.isInTextbook).toBe(false);
    expect(miss?.matchType).toBe("不在课本中");
  });
});

describe("vocab CSV parsing", () => {
  it("parses custom CSV vocab tables", () => {
    const csv =
      '\uFEFF单词,释义,词性,单元\nresilience,韧性,n.,Unit 4\n"break through",突破,phr.,Unit 4\n';
    const entries = parseUploadedCSVContent(csv, "custom-list.csv");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      b: "custom-list",
      u: "Unit 4",
      w: "resilience",
      p: "n.",
      m: "韧性",
    });
    expect(entries[1]?.w).toBe("break through");
  });

  it("extracts word column cleanly from batch CSV files", () => {
    const csv = "序号,英文单词,中文备注\n1,apply,申请\n2,took care of,照顾\n";
    const words = extractWordsFromBatchCSV(csv);
    expect(words).toEqual(["apply", "took care of"]);
  });

  it("supports Chinese meaning reverse lookup, multi-book aggregation, and free-text extraction", () => {
    const vocab = makeSampleVocab();
    vocab.push({
      b: "大学英语四级 (CET-4)",
      u: "A",
      w: "apply",
      p: "v.",
      m: "申请；应用",
      f: "CET-4核心",
      n: "",
    });
    indexAllEntries(vocab);

    const zhRes = lookupWordInTextbook(vocab, "住宿", "ALL");
    expect(zhRes?.fragmentMatches[0]?.w).toBe("accommodate");

    const applyRes = lookupWordInTextbook(vocab, "apply", "ALL");
    const aggregated = aggregateLookupEntries(applyRes?.fragmentMatches ?? []);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.occurrences).toHaveLength(2);
    expect(aggregated[0]?.isBold).toBe(true);

    const extracted = extractWordsFromFreeText(
      "applied, resilience\nWe should take care of our planet and accommodate everyone.",
    );
    expect(extracted).toContain("applied");
    expect(extracted).toContain("resilience");
    expect(extracted).toContain("accommodate");
  });
});
