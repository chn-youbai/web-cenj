import { postJson, requestJson } from "@/core/api";
import {
  type ReciteCloudData,
  type ReciteState,
  type ReciteWord,
  SYSTEM_DEFAULTS,
  type WordMarkStatus,
} from "./types";

export const CLOUD_SYNC_API = "/api/recite-sync";
export const STORAGE_KEY = "gaokao_2050_vocab_state_v1";
export const SYNC_KEY_STORAGE = "gaokao_2050_sync_key_v1";
export const LAST_SYNC_STORAGE = "gaokao_2050_last_sync_v1";

export function getOrCreateSyncKey(): string {
  try {
    let key = localStorage.getItem(SYNC_KEY_STORAGE);
    if (!key || !key.trim()) {
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      key = `GK-${rand}`;
      localStorage.setItem(SYNC_KEY_STORAGE, key);
    }
    return key.trim();
  } catch {
    return "GK-LOCAL";
  }
}

export function getUserStorageKey(syncKey?: string): string {
  const key = (syncKey || getOrCreateSyncKey()).trim().toLowerCase();
  return `gaokao_2050_user_${encodeURIComponent(key)}_state`;
}

export function loadReciteState(state: ReciteState, targetSyncKey?: string): void {
  try {
    const userKey = getUserStorageKey(targetSyncKey);
    let saved = localStorage.getItem(userKey);
    if (!saved && !targetSyncKey) {
      saved = localStorage.getItem(STORAGE_KEY);
    }

    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ReciteState>;
      state.marks = parsed.marks ?? {};
      state.memos = parsed.memos ?? {};
      state.currentGroup = parsed.currentGroup ?? SYSTEM_DEFAULTS.currentGroup;
      state.accent = parsed.accent ?? SYSTEM_DEFAULTS.accent;
      state.speechRate = parsed.speechRate ?? SYSTEM_DEFAULTS.speechRate;
      state.enFontSize = parsed.enFontSize
        ? Math.min(100, Math.max(20, parsed.enFontSize))
        : SYSTEM_DEFAULTS.enFontSize;
      state.cnFontSize = parsed.cnFontSize
        ? Math.min(100, Math.max(16, parsed.cnFontSize))
        : SYSTEM_DEFAULTS.cnFontSize;
      state.enFontWeight = parsed.enFontWeight ?? SYSTEM_DEFAULTS.enFontWeight;
      state.cnFontWeight = parsed.cnFontWeight ?? SYSTEM_DEFAULTS.cnFontWeight;
      state.autoSpeak =
        typeof parsed.autoSpeak === "boolean" ? parsed.autoSpeak : SYSTEM_DEFAULTS.autoSpeak;
      state.darkMode = typeof parsed.darkMode === "boolean" ? parsed.darkMode : false;
      state.currentIndex =
        Number.isInteger(parsed.currentIndex) && (parsed.currentIndex ?? 0) >= 0
          ? (parsed.currentIndex ?? 0)
          : 0;
    } else {
      state.marks = {};
      state.memos = {};
      state.enFontSize = SYSTEM_DEFAULTS.enFontSize;
      state.cnFontSize = SYSTEM_DEFAULTS.cnFontSize;
      state.enFontWeight = SYSTEM_DEFAULTS.enFontWeight;
      state.cnFontWeight = SYSTEM_DEFAULTS.cnFontWeight;
      state.accent = SYSTEM_DEFAULTS.accent;
      state.speechRate = SYSTEM_DEFAULTS.speechRate;
      state.autoSpeak = SYSTEM_DEFAULTS.autoSpeak;
      state.maskMode = SYSTEM_DEFAULTS.maskMode;
      state.statusFilter = SYSTEM_DEFAULTS.statusFilter;
      state.currentGroup = SYSTEM_DEFAULTS.currentGroup;
      state.currentIndex = SYSTEM_DEFAULTS.currentIndex;
    }
  } catch (err) {
    console.warn("LocalStorage unavailable:", err);
  }
}

export function persistReciteState(state: ReciteState): void {
  try {
    const userKey = getUserStorageKey();
    const data = {
      marks: state.marks,
      memos: state.memos,
      currentGroup: state.currentGroup,
      statusFilter: state.statusFilter,
      maskMode: state.maskMode,
      accent: state.accent,
      speechRate: state.speechRate,
      enFontSize: state.enFontSize,
      cnFontSize: state.cnFontSize,
      enFontWeight: state.enFontWeight,
      cnFontWeight: state.cnFontWeight,
      autoSpeak: state.autoSpeak,
      darkMode: state.darkMode,
      currentIndex: state.currentIndex,
      updatedAt: Date.now(),
    };
    const json = JSON.stringify(data);
    localStorage.setItem(userKey, json);
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function mergeCloudDataIntoState(
  state: ReciteState,
  cloudData: ReciteCloudData | null,
): void {
  if (!cloudData) return;
  if (cloudData.marks) {
    state.marks = { ...state.marks, ...cloudData.marks };
  }
  if (cloudData.memos) {
    state.memos = { ...state.memos, ...cloudData.memos };
  }
  if (cloudData.settings) {
    const s = cloudData.settings;
    if (s.enFontSize) state.enFontSize = Math.min(100, Math.max(20, s.enFontSize));
    if (s.cnFontSize) state.cnFontSize = Math.min(100, Math.max(16, s.cnFontSize));
    if (s.enFontWeight) state.enFontWeight = s.enFontWeight;
    if (s.cnFontWeight) state.cnFontWeight = s.cnFontWeight;
    if (s.accent) state.accent = s.accent;
    if (s.speechRate) state.speechRate = s.speechRate;
    if (typeof s.autoSpeak === "boolean") state.autoSpeak = s.autoSpeak;
    if (s.maskMode) state.maskMode = s.maskMode;
    if (s.statusFilter) state.statusFilter = s.statusFilter;
    if (s.currentGroup) state.currentGroup = s.currentGroup;
    if (Number.isInteger(s.currentIndex) && (s.currentIndex ?? -1) >= 0) {
      state.currentIndex = s.currentIndex ?? 0;
    }
  }
}

export interface SyncPostResponse {
  status: string;
  cloudData?: ReciteCloudData;
  message?: string;
}

export interface SyncGetResponse {
  status: string;
  data?: ReciteCloudData;
  message?: string;
}

export async function pushCloudSyncRequest(
  key: string,
  state: ReciteState,
): Promise<SyncPostResponse> {
  const payload = {
    key,
    marks: state.marks,
    memos: state.memos,
    settings: {
      enFontSize: state.enFontSize,
      cnFontSize: state.cnFontSize,
      enFontWeight: state.enFontWeight,
      cnFontWeight: state.cnFontWeight,
      accent: state.accent,
      speechRate: state.speechRate,
      autoSpeak: state.autoSpeak,
      maskMode: state.maskMode,
      statusFilter: state.statusFilter,
      currentGroup: state.currentGroup,
      currentIndex: state.currentIndex,
    },
    updatedAt: Date.now(),
  };
  return postJson<SyncPostResponse>(CLOUD_SYNC_API, payload);
}

export async function pullCloudSyncRequest(targetKey: string): Promise<SyncGetResponse> {
  return requestJson<SyncGetResponse>(`${CLOUD_SYNC_API}?key=${encodeURIComponent(targetKey)}`);
}

// ==================== CSV IMPORT & EXPORT HELPERS ====================
export function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else if (ch !== undefined) {
        field += ch;
      }
    } else {
      if (ch === '"' && field.trim().length === 0) {
        inQuotes = true;
      } else if (ch === ",") {
        cols.push(field.trim());
        field = "";
      } else if (ch !== undefined) {
        field += ch;
      }
    }
  }
  cols.push(field.trim());
  return cols;
}

export function parseCsvRows(rawText: string): string[][] {
  const cleaned = rawText.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/);
  const rows: string[][] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    rows.push(parseCsvLine(line));
  }
  return rows;
}

export function classifyStatusCell(val: string | undefined): WordMarkStatus | "unmarked" | null {
  if (!val) return null;
  const s = val.replace(/^["']|["']$/g, "").trim();
  if (s === "很熟" || s === "🟢 很熟" || s === "熟") return "known";
  if (s === "有点模糊" || s === "🟡 有点模糊" || s === "模糊" || s === "模") return "fuzzy";
  if (s === "完全不会" || s === "🔴 完全不会" || s === "不会" || s === "生词" || s === "生") {
    return "unknown";
  }
  if (s === "未标记" || s === "⚪ 未标记" || s === "未标") return "unmarked";
  return null;
}

export interface CsvImportSummary {
  importedKnown: number;
  importedFuzzy: number;
  importedUnknown: number;
  memoCount: number;
}

export function applyImportedCsvRows(
  rows: string[][],
  vocabList: ReciteWord[],
  marks: Record<number, WordMarkStatus>,
  memos: Record<number, string>,
): CsvImportSummary {
  const header = (rows[0] ?? []).map((h) => h.replace(/^\uFEFF/, "").trim());
  let idCol = 0;
  let wordCol = 2;
  let statusCol = 5;
  let memoCol = 6;

  header.forEach((h, idx) => {
    if (h.includes("序号") || h.toLowerCase() === "id") idCol = idx;
    else if (h === "单词" || h.toLowerCase() === "word") wordCol = idx;
    else if (h.includes("标记") || h.includes("状态") || h.toLowerCase() === "status") {
      statusCol = idx;
    } else if (h.includes("笔记") || h.includes("备注") || h.toLowerCase() === "memo") {
      memoCol = idx;
    }
  });

  const wordToId: Record<string, number> = {};
  for (const w of vocabList) {
    const k = w.word.toLowerCase();
    if (!wordToId[k]) wordToId[k] = w.id;
  }

  const isFullExport = rows.length >= 2000;
  let importedKnown = 0;
  let importedFuzzy = 0;
  let importedUnknown = 0;
  let memoCount = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i];
    if (!cols || cols.length < 3) continue;
    const firstCell = String(cols[0] ?? "").trim();
    if (firstCell.includes("统计汇总") || firstCell.includes("序号")) continue;

    let id = Number.parseInt(firstCell.replace(/[^\d]/g, ""), 10);
    if (!id || id < 1 || id > 2050) {
      const rawIdCell = String(cols[idCol] ?? "").replace(/[^\d]/g, "");
      id = Number.parseInt(rawIdCell, 10);
    }
    if (!id || id < 1 || id > 2050) {
      const wKey = String(cols[wordCol] ?? "")
        .toLowerCase()
        .trim();
      id = wordToId[wKey] ?? 0;
    }
    if (!id || id < 1 || id > 2050) continue;

    let detectedStatus = classifyStatusCell(cols[statusCol]);
    let detectedColIdx = statusCol;

    if (!detectedStatus) {
      for (let c = cols.length - 1; c >= 3; c -= 1) {
        const st = classifyStatusCell(cols[c]);
        if (st) {
          detectedStatus = st;
          detectedColIdx = c;
          break;
        }
      }
    }

    if (detectedStatus === "known") {
      marks[id] = "known";
      importedKnown += 1;
    } else if (detectedStatus === "fuzzy") {
      marks[id] = "fuzzy";
      importedFuzzy += 1;
    } else if (detectedStatus === "unknown") {
      marks[id] = "unknown";
      importedUnknown += 1;
    } else if (detectedStatus === "unmarked" && isFullExport) {
      delete marks[id];
    }

    const actualMemoIdx = Math.max(memoCol, detectedColIdx + 1);
    if (cols.length > actualMemoIdx) {
      const memoVal = cols
        .slice(actualMemoIdx)
        .join(", ")
        .replace(/^["']|["']$/g, "")
        .trim();
      if (memoVal) {
        memos[id] = memoVal;
        memoCount += 1;
      }
    }
  }

  return { importedKnown, importedFuzzy, importedUnknown, memoCount };
}

export function buildExportCsvContent(
  vocabList: ReciteWord[],
  marks: Record<number, WordMarkStatus>,
  memos: Record<number, string>,
  filterFn: (w: ReciteWord) => boolean,
): { csvContent: string; count: number } {
  const statusMap: Record<WordMarkStatus, string> = {
    known: "很熟",
    fuzzy: "有点模糊",
    unknown: "完全不会",
  };
  const rows: (string | number)[][] = [
    ["序号", "高考词频", "单词", "中文释义", "考查形式", "熟练度标记", "个人助记笔记"],
  ];

  const list = vocabList.filter(filterFn);
  if (list.length === 0) {
    return { csvContent: "", count: 0 };
  }

  for (const w of list) {
    const m = marks[w.id];
    const statusCn = m ? statusMap[m] : "未标记";
    const memo = memos[w.id] ?? "";
    rows.push([w.id, w.freq, w.word, w.meaning, w.forms.join(", "), statusCn, memo]);
  }

  let k = 0;
  let f = 0;
  let u = 0;
  for (const w of list) {
    if (marks[w.id] === "known") k += 1;
    else if (marks[w.id] === "fuzzy") f += 1;
    else if (marks[w.id] === "unknown") u += 1;
  }
  rows.push([]);
  rows.push([
    "【统计汇总】",
    `导出词数: ${list.length}`,
    `很熟: ${k}`,
    `有点模糊: ${f}`,
    `完全不会: ${u}`,
    `未标记: ${list.length - k - f - u}`,
    "",
  ]);

  const csvContent = `\uFEFF${rows
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n")}`;

  return { csvContent, count: list.length };
}
