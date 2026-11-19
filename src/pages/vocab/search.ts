import type {
  BatchCheckResult,
  LookupResult,
  ScoredVocabEntry,
  SubstringMatchScore,
  VocabEntry,
} from "./types";
import { IRREGULAR_TO_BASE } from "./word-knowledge";

export function getShortBookName(fullBook: string): string {
  if (!fullBook) return "未命名课本";
  if (fullBook.includes("四级") || fullBook.includes("CET-4")) return "四级 (CET-4)";
  if (fullBook.includes("六级") || fullBook.includes("CET-6")) return "六级 (CET-6)";
  return fullBook
    .replace("人教版高中英语", "")
    .replace("普通高中教科书-英语", "")
    .replace("-词汇表", "");
}

export function formatUnitLabel(unitStr: string): string {
  const u = String(unitStr || "").trim();
  if (!u) return "通用";
  if (u.toLowerCase() === "w" || u.toLowerCase() === "welcome") {
    return "Welcome Unit (预备单元)";
  }
  if (/^\d+$/.test(u)) {
    return `Unit ${u} (第${u}单元)`;
  }
  if (/^[a-zA-Z]$/.test(u)) {
    return `字母 ${u.toUpperCase()} 组`;
  }
  return u;
}

export function formatShortUnitBadge(unitStr: string): string {
  const u = String(unitStr || "").trim();
  if (!u) return "通用";
  if (u.toLowerCase() === "w" || u.toLowerCase() === "welcome") return "Welcome Unit";
  if (/^\d+$/.test(u)) return `Unit ${u}`;
  if (/^[a-zA-Z]$/.test(u)) return `字母 ${u.toUpperCase()}`;
  return u;
}

export function normalizeWordStr(s: string): string {
  return String(s || "")
    .replace(/[\u2018\u2019\u02BC`´]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function stripAccents(s: string): string {
  try {
    return s.normalize("NFD").replace(/\p{Mn}+/gu, "");
  } catch {
    return s;
  }
}

export function escapeRegExp(str: string): string {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildEntryKeys(entry: VocabEntry): void {
  const rawW = String(entry.w || "").trim();
  const normFull = normalizeWordStr(rawW);
  const keys = new Set<string>();
  if (!normFull) {
    entry._keys = [];
    entry._irreg = [];
    entry._headLower = "";
    return;
  }

  keys.add(normFull);
  keys.add(stripAccents(normFull));

  const withoutDots = normFull
    .replace(/\.\.\.|…/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutDots) keys.add(withoutDots);

  const parenMatches = rawW.match(/\(([^)]+)\)/g);
  const outsideParen = normalizeWordStr(rawW.replace(/\([^)]*\)/g, " "));
  if (outsideParen) {
    keys.add(outsideParen);
    keys.add(stripAccents(outsideParen));
    const outsideNoDots = outsideParen
      .replace(/\.\.\.|…/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (outsideNoDots) keys.add(outsideNoDots);
  }

  const optRemoved = normalizeWordStr(rawW.replace(/\([^)]*\)/g, ""));
  const optIncluded = normalizeWordStr(rawW.replace(/[()]/g, " "));
  if (optRemoved) keys.add(optRemoved);
  if (optIncluded && !optIncluded.includes("-")) keys.add(optIncluded);

  if (outsideParen.includes("/")) {
    const parts = outsideParen
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1 && outsideParen.includes(" / ")) {
      for (const p of parts) {
        keys.add(p);
      }
    } else {
      const tokens = outsideParen.split(" ");
      tokens.forEach((tok, idx) => {
        if (tok.includes("/")) {
          for (const sub of tok.split("/")) {
            const copy = [...tokens];
            copy[idx] = sub;
            keys.add(
              copy
                .join(" ")
                .replace(/\.\.\.|…/g, "")
                .replace(/\s+/g, " ")
                .trim(),
            );
          }
        }
      });
    }
  }

  const eqMatch = rawW.match(/=\s*([a-zA-Z\s'-]+)/);
  if (eqMatch?.[1]) {
    const eqWord = normalizeWordStr(eqMatch[1]);
    if (eqWord) keys.add(eqWord);
  }

  if (parenMatches && outsideParen) {
    for (const pm of parenMatches) {
      let inner = normalizeWordStr(pm.slice(1, -1));
      inner = inner
        .replace(/\b(name|bre|us|uk|also|especially|usually|informal|abbr\.|pl\.)\b/g, " ")
        .replace(/=/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!inner) continue;

      if (inner === "-ize" || inner === "–ize") {
        keys.add(outsideParen.replace(/ise$/, "ize"));
      } else if (inner === "-ze") {
        keys.add(outsideParen.replace(/se$/, "ze"));
      } else if (inner === "-ization" || inner === "–ization") {
        keys.add(outsideParen.replace(/isation$/, "ization"));
      } else if (inner === "-izer") {
        keys.add(outsideParen.replace(/iser$/, "izer"));
      } else if (inner === "-vor") {
        keys.add(outsideParen.replace(/our$/, "or"));
      } else if (inner === "-ser") {
        keys.add(outsideParen.replace(/sor$/, "ser"));
      } else if (inner.includes("-oes") || inner.includes("-os")) {
        keys.add(`${outsideParen}s`);
        keys.add(`${outsideParen}es`);
      } else if (inner.includes("chili")) {
        keys.add("chili");
        keys.add("chillies");
        keys.add("chilies");
      } else {
        for (const cand of inner.split(/[\/,]/)) {
          const c = cand.trim();
          if (
            c &&
            !c.startsWith("-") &&
            !c.includes("sth") &&
            !c.includes("sb") &&
            !c.includes("…")
          ) {
            keys.add(c);
            keys.add(stripAccents(c));
          }
        }
      }
    }
  }

  if (normFull.startsWith("no matter where")) {
    keys.add("no matter");
    keys.add("no matter where");
    keys.add("no matter who");
    keys.add("no matter what");
  }
  if (normFull === "forward" && String(entry.m || "").includes("forwards")) {
    keys.add("forwards");
  }

  const irregForms: string[] = [];
  const mStr = String(entry.m || "");
  const irregMatch = mStr.match(/[（(]([a-zA-Z,\s/-]+)[)）]/);
  if (irregMatch?.[1]) {
    for (const tok of irregMatch[1].split(/[,/]/)) {
      const cleanTok = normalizeWordStr(tok);
      if (
        cleanTok &&
        /^[a-z-]{2,}$/.test(cleanTok) &&
        !["pl", "usually", "also", "or"].includes(cleanTok)
      ) {
        irregForms.push(cleanTok);
      }
    }
  }

  entry._keys = Array.from(keys).filter(Boolean);
  entry._irreg = irregForms;
  entry._headLower = outsideParen || normFull;
}

export function indexAllEntries(list: VocabEntry[]): void {
  for (const entry of list) {
    buildEntryKeys(entry);
  }
}

export function deinflectSingleToken(tok: string): string[] {
  const q = normalizeWordStr(tok);
  const cands = new Set<string>();
  if (!q || q.length < 2) return [];

  const irreg = IRREGULAR_TO_BASE[q];
  if (irreg) {
    for (const b of irreg) {
      cands.add(b);
    }
  }

  if (q.endsWith("ies") && q.length >= 4) {
    cands.add(`${q.slice(0, -3)}y`);
  }
  if (q.endsWith("ves") && q.length >= 4) {
    cands.add(`${q.slice(0, -3)}f`);
    cands.add(`${q.slice(0, -3)}fe`);
  }
  if (q.endsWith("es") && q.length >= 4) {
    cands.add(q.slice(0, -2));
    cands.add(q.slice(0, -1));
  }
  if (
    q.endsWith("s") &&
    !q.endsWith("ss") &&
    !q.endsWith("us") &&
    !q.endsWith("is") &&
    q.length >= 3
  ) {
    cands.add(q.slice(0, -1));
  }

  if (q.endsWith("ied") && q.length >= 4) {
    cands.add(`${q.slice(0, -3)}y`);
    cands.add(q.slice(0, -1));
  }
  if (q.endsWith("ed") && q.length >= 4) {
    const stem = q.slice(0, -2);
    cands.add(stem);
    cands.add(q.slice(0, -1));
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      cands.add(stem.slice(0, -1));
    }
    if (stem.endsWith("ck")) {
      cands.add(stem.slice(0, -1));
    }
  }

  if (q.endsWith("ying") && q.length >= 5) {
    cands.add(`${q.slice(0, -4)}ie`);
    cands.add(q.slice(0, -3));
  }
  if (q.endsWith("ing") && q.length >= 4) {
    const stem = q.slice(0, -3);
    if (stem.length >= 2) {
      cands.add(stem);
      cands.add(`${stem}e`);
    }
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      cands.add(stem.slice(0, -1));
    }
    if (stem.endsWith("ck")) {
      cands.add(stem.slice(0, -1));
    }
  }

  if (q.endsWith("ier") && q.length >= 5) {
    cands.add(`${q.slice(0, -3)}y`);
  }
  if (q.endsWith("iest") && q.length >= 6) {
    cands.add(`${q.slice(0, -4)}y`);
  }
  if (q.endsWith("er") && q.length >= 4) {
    const stem = q.slice(0, -2);
    cands.add(stem);
    cands.add(q.slice(0, -1));
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      cands.add(stem.slice(0, -1));
    }
  }
  if (q.endsWith("est") && q.length >= 5) {
    const stem = q.slice(0, -3);
    cands.add(stem);
    cands.add(q.slice(0, -2));
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      cands.add(stem.slice(0, -1));
    }
  }

  if (q.endsWith("ily") && q.length >= 5) {
    cands.add(`${q.slice(0, -3)}y`);
  }
  if (q.endsWith("ally") && q.length >= 6) {
    cands.add(q.slice(0, -4));
    cands.add(q.slice(0, -2));
  }
  if (q.endsWith("ly") && q.length >= 4) {
    cands.add(q.slice(0, -2));
    if (q.endsWith("ply") || q.endsWith("bly") || q.endsWith("tly")) {
      cands.add(`${q.slice(0, -1)}e`);
    }
  }
  if (q.endsWith("ation") && q.length >= 7) {
    cands.add(q.slice(0, -5));
    cands.add(`${q.slice(0, -5)}e`);
  }
  if (q.endsWith("ition") && q.length >= 7) {
    cands.add(q.slice(0, -5));
    cands.add(`${q.slice(0, -5)}e`);
  }
  if (q.endsWith("ion") && q.length >= 6) {
    cands.add(q.slice(0, -3));
    cands.add(`${q.slice(0, -3)}e`);
  }
  if (q.endsWith("ment") && q.length >= 6) {
    cands.add(q.slice(0, -4));
    cands.add(`${q.slice(0, -4)}e`);
  }
  if (q.endsWith("ness") && q.length >= 6) {
    cands.add(q.slice(0, -4));
    if (q.endsWith("iness")) {
      cands.add(`${q.slice(0, -5)}y`);
    }
  }

  cands.delete(q);
  return Array.from(cands).filter((c) => c.length >= 2);
}

export function generateDeinflectedCandidates(rawQuery: string): string[] {
  const q = normalizeWordStr(rawQuery);
  if (!q) return [];
  const tokens = q.split(" ").filter(Boolean);
  const firstToken = tokens[0];
  if (!firstToken) return [];
  if (tokens.length === 1) {
    return deinflectSingleToken(firstToken);
  }
  const firstCands = deinflectSingleToken(firstToken);
  const rest = tokens.slice(1).join(" ");
  const results = new Set<string>();
  for (const fc of firstCands) {
    results.add(`${fc} ${rest}`);
    results.add(fc);
  }
  return Array.from(results);
}

export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  const firstRow = dp[0];
  if (firstRow) {
    for (let j = 1; j <= b.length; j++) firstRow[j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    const row = dp[i];
    const prevRow = dp[i - 1];
    if (!row || !prevRow) continue;
    for (let j = 1; j <= b.length; j++) {
      row[j] =
        a[i - 1] === b[j - 1]
          ? (prevRow[j - 1] ?? 0)
          : 1 + Math.min(prevRow[j - 1] ?? 0, row[j - 1] ?? 0, prevRow[j] ?? 0);
    }
  }
  return dp[a.length]?.[b.length] ?? 99;
}

export function scoreSubstringMatch(
  entry: VocabEntry,
  q: string,
  qNoAccent: string,
  queryLemmas: string[] = [],
): SubstringMatchScore {
  const wLower = normalizeWordStr(entry.w);
  const head = entry._headLower || wLower;
  const keys = entry._keys || [wLower];
  const irreg = entry._irreg || [];
  const baseToken = entry.w.split(" ")[0] ?? entry.w;

  if (head === q || keys.includes(q) || (qNoAccent !== q && keys.includes(qNoAccent))) {
    return { matched: true, rank: 1, matchType: "完全匹配", hlTerm: q };
  }
  if (irreg.includes(q)) {
    return { matched: true, rank: 2, matchType: `不规则变形 → ${baseToken}`, hlTerm: baseToken };
  }
  for (const lemma of queryLemmas) {
    if (head === lemma || keys.includes(lemma)) {
      return {
        matched: true,
        rank: 2,
        matchType: `变形还原: ${lemma}`,
        hlTerm: lemma,
        matchedLemma: lemma,
      };
    }
  }
  if (
    head.startsWith(q) ||
    wLower.startsWith(q) ||
    keys.some((k) => k.startsWith(q) || (qNoAccent !== q && k.startsWith(qNoAccent)))
  ) {
    return { matched: true, rank: 3, matchType: "开头匹配", hlTerm: q };
  }
  const escaped = escapeRegExp(q);
  const wordBoundaryRe = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");
  if (wordBoundaryRe.test(wLower) || keys.some((k) => wordBoundaryRe.test(k))) {
    return { matched: true, rank: 4, matchType: "词组包含单词", hlTerm: q };
  }
  for (const lemma of queryLemmas) {
    if (lemma.length < 2) continue;
    const escL = escapeRegExp(lemma);
    const lemmaWordRe = new RegExp(`(^|[^a-z])${escL}([^a-z]|$)`, "i");
    if (lemmaWordRe.test(wLower) || keys.some((k) => lemmaWordRe.test(k))) {
      return {
        matched: true,
        rank: 4,
        matchType: `变形识别(${lemma}) · 词组匹配`,
        hlTerm: lemma,
        matchedLemma: lemma,
      };
    }
    if (lemma.length >= 4 && (head.startsWith(lemma) || wLower.includes(lemma))) {
      return {
        matched: true,
        rank: 5,
        matchType: `词根还原: ${lemma}`,
        hlTerm: lemma,
        matchedLemma: lemma,
      };
    }
  }
  if (
    wLower.includes(q) ||
    (qNoAccent !== q && stripAccents(wLower).includes(qNoAccent)) ||
    keys.some((k) => k.includes(q) || (qNoAccent !== q && k.includes(qNoAccent))) ||
    irreg.some((ir) => ir.includes(q))
  ) {
    return { matched: true, rank: 6, matchType: "包含字母片段", hlTerm: q };
  }

  return { matched: false, rank: 99, matchType: "", hlTerm: q };
}

export function judgeWordByTextbookStandard(
  vocabList: VocabEntry[],
  rawWord: string,
  selectedBookScope = "ALL",
): BatchCheckResult | null {
  const cleanInput = String(rawWord || "").trim();
  const q = normalizeWordStr(cleanInput);
  const qNoAccent = stripAccents(q);
  if (!q) return null;

  const queryLemmas = generateDeinflectedCandidates(q);
  const activePool =
    selectedBookScope === "ALL" ? vocabList : vocabList.filter((e) => e.b === selectedBookScope);

  const exactMatches: Array<{ entry: VocabEntry; matchLabel: string }> = [];
  const lemmaMatches: Array<{ entry: VocabEntry; matchLabel: string }> = [];
  const phraseMatches: Array<{ entry: VocabEntry; matchLabel: string }> = [];
  let matchedLemmaStr = "";

  for (const entry of activePool) {
    const wLower = normalizeWordStr(entry.w);
    const head = entry._headLower || wLower;
    const keys = entry._keys || [wLower];
    const irreg = entry._irreg || [];
    const baseToken = entry.w.split(" ")[0] ?? entry.w;

    if (head === q || keys.includes(q) || (qNoAccent !== q && keys.includes(qNoAccent))) {
      exactMatches.push({ entry, matchLabel: "课本原词" });
      continue;
    }

    if (irreg.includes(q)) {
      lemmaMatches.push({ entry, matchLabel: `不规则变形 → ${baseToken}` });
      if (!matchedLemmaStr) matchedLemmaStr = baseToken;
      continue;
    }

    let matchedLemma = false;
    for (const lemma of queryLemmas) {
      if (head === lemma || keys.includes(lemma)) {
        lemmaMatches.push({ entry, matchLabel: `变形还原 → ${lemma}` });
        if (!matchedLemmaStr) matchedLemmaStr = lemma;
        matchedLemma = true;
        break;
      }
    }
    if (matchedLemma) continue;

    const escQ = escapeRegExp(q);
    const wordBoundaryRe = new RegExp(`(^|[^a-z])${escQ}([^a-z]|$)`, "i");
    if (wordBoundaryRe.test(wLower) || keys.some((k) => wordBoundaryRe.test(k))) {
      phraseMatches.push({ entry, matchLabel: "课本短语包含" });
      continue;
    }

    for (const lemma of queryLemmas) {
      if (lemma.length < 2) continue;
      const escL = escapeRegExp(lemma);
      const lemmaWordRe = new RegExp(`(^|[^a-z])${escL}([^a-z]|$)`, "i");
      if (lemmaWordRe.test(wLower) || keys.some((k) => lemmaWordRe.test(k))) {
        phraseMatches.push({ entry, matchLabel: `变形(${lemma})·短语包含` });
        if (!matchedLemmaStr) matchedLemmaStr = lemma;
        break;
      }
    }
  }

  const allMatched = [...exactMatches, ...lemmaMatches, ...phraseMatches];
  const isInTextbook = allMatched.length > 0;
  const primaryMatchType =
    exactMatches[0]?.matchLabel ??
    lemmaMatches[0]?.matchLabel ??
    phraseMatches[0]?.matchLabel ??
    "不在课本中";

  return {
    inputWord: cleanInput,
    normalized: q,
    isInTextbook,
    matchType: primaryMatchType,
    matchedLemma: matchedLemmaStr || queryLemmas[0] || "",
    matches: allMatched.map((m) => m.entry),
  };
}

export function lookupWordInTextbook(
  vocabList: VocabEntry[],
  rawQuery: string,
  selectedBookScope = "ALL",
): LookupResult | null {
  const q = normalizeWordStr(rawQuery);
  const qNoAccent = stripAccents(q);
  if (!q) return null;

  const queryLemmas = generateDeinflectedCandidates(q);
  const activePool =
    selectedBookScope === "ALL" ? vocabList : vocabList.filter((e) => e.b === selectedBookScope);

  const scoredMatches: Array<{
    entry: VocabEntry;
    rank: number;
    matchType: string;
    hlTerm: string;
  }> = [];
  const recognizedLemmasUsed = new Set<string>();

  for (const entry of activePool) {
    const res = scoreSubstringMatch(entry, q, qNoAccent, queryLemmas);
    if (res.matched) {
      if (res.matchedLemma) recognizedLemmasUsed.add(res.matchedLemma);
      scoredMatches.push({ entry, rank: res.rank, matchType: res.matchType, hlTerm: res.hlTerm });
    }
  }

  scoredMatches.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const headA = a.entry._headLower || a.entry.w;
    const headB = b.entry._headLower || b.entry.w;
    if (headA.length !== headB.length) return headA.length - headB.length;
    return headA.localeCompare(headB);
  });

  const fragmentMatches: ScoredVocabEntry[] = scoredMatches.map((item) => ({
    ...item.entry,
    _matchType: item.matchType,
    _matchRank: item.rank,
    _hlTerm: item.hlTerm || q,
  }));

  const matchesInOtherBooks: VocabEntry[] = [];
  if (fragmentMatches.length === 0 && selectedBookScope !== "ALL") {
    for (const entry of vocabList) {
      if (scoreSubstringMatch(entry, q, qNoAccent, queryLemmas).matched) {
        matchesInOtherBooks.push(entry);
      }
    }
  }

  let typoMatches: VocabEntry[] = [];
  if (fragmentMatches.length === 0 && q.length >= 3) {
    const maxDist = q.length <= 5 ? 1 : 2;
    const typoScored: Array<{ entry: VocabEntry; dist: number; lenDiff: number }> = [];
    for (const e of activePool) {
      const head = e._headLower || normalizeWordStr(e.w);
      const tokens = head.split(/[\s/()-]+/).filter(Boolean);
      let bestDist = editDistance(q, head);
      for (const tok of tokens) {
        if (tok.length >= 3) {
          const d = editDistance(q, tok);
          if (d < bestDist) bestDist = d;
        }
        if (tok.length > q.length && q.length >= 3) {
          const dPref = editDistance(q, tok.slice(0, q.length));
          if (dPref < bestDist) bestDist = dPref;
        }
      }
      if (bestDist <= maxDist) {
        typoScored.push({ entry: e, dist: bestDist, lenDiff: Math.abs(head.length - q.length) });
      }
    }
    typoScored.sort((a, b) => a.dist - b.dist || a.lenDiff - b.lenDiff);
    typoMatches = typoScored.slice(0, 10).map((x) => x.entry);
  }

  return {
    rawQuery: rawQuery.trim(),
    normalizedQuery: q,
    queryLemmas,
    recognizedLemmas: Array.from(recognizedLemmasUsed),
    fragmentMatches,
    matchesInOtherBooks,
    typoMatches,
  };
}

export function getBookSortWeight(bName: string): number {
  if (bName.includes("选择性必修第一册")) return 4;
  if (bName.includes("选择性必修第二册")) return 5;
  if (bName.includes("选择性必修第三册")) return 6;
  if (bName.includes("选择性必修第四册")) return 7;
  if (bName.includes("必修第一册")) return 1;
  if (bName.includes("必修第二册")) return 2;
  if (bName.includes("必修第三册")) return 3;
  if (bName.includes("四级") || bName.includes("CET-4")) return 10;
  if (bName.includes("六级") || bName.includes("CET-6")) return 11;
  return 20;
}

export function getUniqueBooks(vocabList: VocabEntry[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const e of vocabList) {
    const b = e.b || "未命名课本";
    map.set(b, (map.get(b) || 0) + 1);
  }
  const entries = Array.from(map.entries());
  entries.sort((a, b) => getBookSortWeight(a[0]) - getBookSortWeight(b[0]));
  return entries;
}
