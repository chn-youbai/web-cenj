import type { VocabCompactWord } from "@shared/types";

export interface VocabEntry extends VocabCompactWord {
  _keys?: string[];
  _irreg?: string[];
  _headLower?: string;
  inCsv?: boolean;
  fromCloud?: boolean;
}

export interface ScoredVocabEntry extends VocabEntry {
  _matchType: string;
  _matchRank: number;
  _hlTerm: string;
}

export interface SubstringMatchScore {
  matched: boolean;
  rank: number;
  matchType: string;
  hlTerm: string;
  matchedLemma?: string;
}

export interface LookupResult {
  rawQuery: string;
  normalizedQuery: string;
  queryLemmas: string[];
  recognizedLemmas: string[];
  fragmentMatches: ScoredVocabEntry[];
  matchesInOtherBooks: VocabEntry[];
  typoMatches: VocabEntry[];
}

export interface BatchCheckResult {
  inputWord: string;
  normalized: string;
  isInTextbook: boolean;
  matchType: string;
  matchedLemma: string;
  matches: VocabEntry[];
}

export type BatchFilterMode = "ALL" | "YES" | "NO";
export type VocabTab = "lookup" | "browse" | "import";

export interface PolysemyExtra {
  pos: string;
  mean: string;
  ex: string;
}

export interface RootFamilyMember {
  w: string;
  p: string;
  m: string;
}

export interface RootFamily {
  rootName: string;
  triggers: string[];
  members: RootFamilyMember[];
}

export interface CloudDerivativesCacheEntry {
  rootGroup: string;
  derivatives: Array<{
    word?: string;
    w?: string;
    pos?: string;
    p?: string;
    meaning?: string;
    m?: string;
  }>;
}

export interface InflectionItem {
  label: string;
  val: string;
  inCsv: boolean;
}

export interface CognateItem {
  w: string;
  p: string;
  m: string;
  b: string;
  u: string;
  f: string;
  inCsv: boolean;
  fromCloud?: boolean;
}

export interface WordDetailData {
  word: string;
  pos: string;
  badgesHtml: string;
  bodyHtml: string;
}
