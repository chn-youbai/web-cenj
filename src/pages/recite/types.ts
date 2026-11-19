export type WordMarkStatus = "known" | "fuzzy" | "unknown";
export type StatusFilter = "all" | "unmarked" | "review" | WordMarkStatus;
export type MaskMode = "none" | "hide_cn" | "hide_en";
export type MainTab = "study" | "zen" | "quiz" | "list" | "stats";
export type ListTab = "all" | "unmarked" | WordMarkStatus;
export type QuizPool = "current_group" | "review" | "high_freq" | "all";
export type QuizType = "choice" | "spell";
export type AccentType = "en-US" | "en-GB";

export interface ReciteWord {
  id: number;
  freq: number;
  word: string;
  meaning: string;
  forms: string[];
}

export interface ReciteSyncSettings {
  enFontSize?: number;
  cnFontSize?: number;
  enFontWeight?: number;
  cnFontWeight?: number;
  accent?: AccentType;
  speechRate?: number;
  autoSpeak?: boolean;
  maskMode?: MaskMode;
  statusFilter?: StatusFilter;
  currentGroup?: string;
  currentIndex?: number;
}

export interface ReciteCloudData {
  key?: string;
  marks?: Record<number, WordMarkStatus>;
  memos?: Record<number, string>;
  settings?: ReciteSyncSettings;
  updatedAt?: number;
}

export interface ReciteState {
  marks: Record<number, WordMarkStatus>;
  memos: Record<number, string>;
  currentGroup: string;
  statusFilter: StatusFilter;
  maskMode: MaskMode;
  isShuffled: boolean;
  autoSpeak: boolean;
  accent: AccentType;
  speechRate: number;
  enFontSize: number;
  cnFontSize: number;
  enFontWeight: number;
  cnFontWeight: number;
  darkMode: boolean;
  currentIndex: number;
  cardRevealed: boolean;
  activeTab: MainTab;
  listSearch: string;
  listTab: ListTab;
  listPage: number;
  listPageSize: number;
  quizPool: QuizPool;
  quizType: QuizType;
  quizTotal: number;
  quizCorrect: number;
  quizStreak: number;
  currentQuizWord: ReciteWord | null;
  lastDistractorIds: number[];
  quizAnswered: boolean;
  quizHintLevel: number;
}

export const SYSTEM_DEFAULTS = {
  enFontSize: 58,
  cnFontSize: 34,
  enFontWeight: 700,
  cnFontWeight: 700,
  accent: "en-US" as AccentType,
  speechRate: 1.0,
  autoSpeak: false,
  maskMode: "none" as MaskMode,
  statusFilter: "all" as StatusFilter,
  currentGroup: "all",
  currentIndex: 0,
};

export function createInitialReciteState(): ReciteState {
  return {
    marks: {},
    memos: {},
    currentGroup: SYSTEM_DEFAULTS.currentGroup,
    statusFilter: SYSTEM_DEFAULTS.statusFilter,
    maskMode: SYSTEM_DEFAULTS.maskMode,
    isShuffled: false,
    autoSpeak: SYSTEM_DEFAULTS.autoSpeak,
    accent: SYSTEM_DEFAULTS.accent,
    speechRate: SYSTEM_DEFAULTS.speechRate,
    enFontSize: SYSTEM_DEFAULTS.enFontSize,
    cnFontSize: SYSTEM_DEFAULTS.cnFontSize,
    enFontWeight: SYSTEM_DEFAULTS.enFontWeight,
    cnFontWeight: SYSTEM_DEFAULTS.cnFontWeight,
    darkMode: false,
    currentIndex: SYSTEM_DEFAULTS.currentIndex,
    cardRevealed: false,
    activeTab: "study",
    listSearch: "",
    listTab: "all",
    listPage: 1,
    listPageSize: 50,
    quizPool: "current_group",
    quizType: "choice",
    quizTotal: 0,
    quizCorrect: 0,
    quizStreak: 0,
    currentQuizWord: null,
    lastDistractorIds: [],
    quizAnswered: false,
    quizHintLevel: 0,
  };
}
