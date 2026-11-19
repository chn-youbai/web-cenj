import { escapeHtml } from "@/core/dom";
import {
  escapeRegExp,
  formatShortUnitBadge,
  formatUnitLabel,
  getShortBookName,
  normalizeWordStr,
} from "./search";
import type { BatchCheckResult, ScoredVocabEntry, VocabEntry } from "./types";

export function highlightQueryFragment(text: string, query: string): string {
  const raw = String(text || "");
  const q = normalizeWordStr(query);
  if (!q) return escapeHtml(raw);
  const escapedQ = escapeRegExp(q);
  const re = new RegExp(`(${escapedQ})`, "ig");
  const parts = raw.split(re);
  return parts
    .map((part) => {
      if (part.toLowerCase() === q) {
        return `<mark class="match-hl">${escapeHtml(part)}</mark>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

export function createWordCardHtml(
  entry: ScoredVocabEntry | VocabEntry,
  idx: number,
  queryHighlight = "",
): string {
  const isCet4 = Boolean(entry.b && (entry.b.includes("四级") || entry.b.includes("CET-4")));
  const isCet6 = Boolean(entry.b && (entry.b.includes("六级") || entry.b.includes("CET-6")));
  const isBold = entry.f === "黑体";
  const isProper = Boolean(entry.n?.includes("专有名词"));
  const shortBook = getShortBookName(entry.b);
  const unitFull = formatUnitLabel(entry.u);
  const scored = entry as Partial<ScoredVocabEntry>;
  const hlTarget = scored._hlTerm || queryHighlight;
  const isLemmaMatch = Boolean(
    scored._matchType && (scored._matchType.includes("变形") || scored._matchType.includes("词根")),
  );
  const matchBadge = scored._matchType
    ? `<span class="inline-flex items-center text-[10px] font-semibold ${
        scored._matchRank === 1
          ? "bg-blue-50 text-blue-700 border border-blue-200/80"
          : isLemmaMatch
            ? "bg-purple-50 text-purple-700 border border-purple-200"
            : "bg-gray-100 text-gray-600"
      } px-1.5 py-0.5 rounded">${escapeHtml(scored._matchType)}</span>`
    : "";

  let bookTypeBadge = "";
  if (isCet4) {
    bookTypeBadge =
      '<span class="inline-flex items-center text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 px-2 py-0.5 rounded-md">🎓 四级核心</span>';
  } else if (isCet6) {
    bookTypeBadge =
      '<span class="inline-flex items-center text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200/80 px-2 py-0.5 rounded-md">🎓 六级核心</span>';
  } else if (isBold) {
    bookTypeBadge =
      '<span class="inline-flex items-center text-[11px] font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-md">黑体 · 课标重点词</span>';
  } else {
    bookTypeBadge =
      '<span class="inline-flex items-center text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">白体 · 认读词</span>';
  }

  const borderLeftColor = isCet4
    ? "border-l-indigo-500"
    : isCet6
      ? "border-l-purple-500"
      : isBold
        ? "border-l-[#007AFF]"
        : "border-l-gray-300";

  return `
    <article data-card-idx="${idx}" class="word-card-clickable ios-card p-4 animate-fade-in space-y-3 border-l-4 ${borderLeftColor}">
      <div class="flex items-start justify-between gap-2">
        <div class="space-y-1">
          <div class="flex items-center flex-wrap gap-2">
            <h3 class="text-xl font-bold text-gray-900 tracking-tight break-words">${highlightQueryFragment(entry.w, hlTarget)}</h3>
            ${entry.p ? `<span class="text-xs font-semibold italic text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">${escapeHtml(entry.p)}</span>` : ""}
          </div>
          <div class="flex items-center flex-wrap gap-1.5 pt-0.5">
            ${bookTypeBadge}
            ${isProper ? '<span class="inline-flex items-center text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 rounded-md">△ 专有名词</span>' : ""}
            ${matchBadge}
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-speak-word="${escapeHtml(entry.w)}"
            aria-label="朗读发音"
            class="speak-btn ios-btn-active w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"
            title="朗读单词"
          >
            <svg class="w-4 h-4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          </button>
          <button
            type="button"
            data-copy-idx="${idx}"
            aria-label="复制词条"
            class="copy-btn ios-btn-active w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"
            title="复制词条信息"
          >
            <svg class="w-4 h-4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
          </button>
        </div>
      </div>

      <div class="bg-gray-50/90 rounded-xl p-3 border border-gray-100">
        <div class="text-[11px] font-semibold text-gray-400 mb-0.5">中文释义</div>
        <div class="text-[16px] font-semibold text-gray-900 leading-relaxed">${escapeHtml(entry.m || "（无释义）")}</div>
      </div>

      <div class="grid grid-cols-2 gap-2 pt-0.5">
        <div class="${isCet4 || isCet6 ? "bg-purple-50/60 border-purple-100/80" : "bg-blue-50/60 border-blue-100/80"} border rounded-xl p-2.5">
          <div class="text-[11px] ${isCet4 || isCet6 ? "text-purple-600/80" : "text-blue-600/80"} font-medium">词库来源</div>
          <div class="text-xs font-bold ${isCet4 || isCet6 ? "text-purple-950" : "text-blue-950"} mt-0.5">${isCet4 || isCet6 ? "🎓 " : "📘 "}${escapeHtml(shortBook)}</div>
          <div class="text-[10px] text-gray-500 truncate">${escapeHtml(entry.b)}</div>
        </div>
        <div class="bg-indigo-50/60 border border-indigo-100/80 rounded-xl p-2.5">
          <div class="text-[11px] text-indigo-600/80 font-medium">${isCet4 || isCet6 ? "字母索引" : "课本单元位置"}</div>
          <div class="text-xs font-bold text-indigo-950 mt-0.5">${escapeHtml(unitFull)}</div>
          <div class="text-[10px] text-gray-500">${isCet4 || isCet6 ? "字母分组" : "单元代码"}: ${escapeHtml(entry.u)}</div>
        </div>
      </div>

      <div class="pt-1 flex items-center justify-between text-xs font-semibold text-[#007AFF]">
        <span>📇 点击打开单词卡片：同根词 · 不同形式 · 一词多义</span>
        <span>查看详情 ›</span>
      </div>
    </article>
  `;
}

export function renderBatchTableRowsHtml(
  batchCheckResults: BatchCheckResult[],
  filtered: BatchCheckResult[],
): string {
  if (filtered.length === 0) {
    return `
      <tr>
        <td colspan="6" class="text-center text-xs text-gray-400 py-4">当前筛选条件下暂无单词记录</td>
      </tr>
    `;
  }

  return filtered
    .map((item) => {
      const origIdx = batchCheckResults.indexOf(item);
      if (item.isInTextbook) {
        const entriesHtml =
          item.matches
            .slice(0, 3)
            .map(
              (e) => `
          <div class="mb-1">
            <span class="font-bold text-gray-900">${escapeHtml(e.w)}</span>
            ${e.p ? `<span class="text-[11px] italic text-blue-600 ml-1">${escapeHtml(e.p)}</span>` : ""}
            <div class="text-xs text-gray-600">${escapeHtml(e.m)}</div>
          </div>
        `,
            )
            .join("") +
          (item.matches.length > 3
            ? `<div class="text-[10px] text-gray-400">等共 ${item.matches.length} 处匹配</div>`
            : "");

        const locsHtml = item.matches
          .slice(0, 3)
          .map(
            (e) => `
          <div class="mb-1 flex items-center gap-1 flex-wrap">
            <span class="text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
              ${escapeHtml(getShortBookName(e.b))} · ${escapeHtml(formatShortUnitBadge(e.u))}
            </span>
            <span class="text-[10px] px-1.5 py-0.2 rounded ${e.f === "黑体" ? "bg-gray-900 text-white font-semibold" : "bg-gray-100 text-gray-600"}">
              ${escapeHtml(e.f || "白体")}
            </span>
          </div>
        `,
          )
          .join("");

        return `
          <tr data-batch-row-idx="${origIdx}" class="batch-table-row batch-row-yes cursor-pointer">
            <td class="text-xs text-gray-400 font-medium">${origIdx + 1}</td>
            <td>
              <div class="font-bold text-gray-900 text-sm break-words">${escapeHtml(item.inputWord)}</div>
            </td>
            <td>
              <span class="badge-yes">✅ 是课本词</span>
              <div><span class="badge-sub">${escapeHtml(item.matchType)}</span></div>
            </td>
            <td>${entriesHtml}</td>
            <td>${locsHtml}</td>
            <td>
              <button type="button" data-batch-card-idx="${origIdx}" class="batch-open-card-btn ios-btn-active text-xs font-semibold text-[#007AFF] bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                卡片›
              </button>
            </td>
          </tr>
        `;
      }

      return `
        <tr data-batch-row-idx="${origIdx}" class="batch-table-row batch-row-no cursor-pointer">
          <td class="text-xs text-gray-400 font-medium">${origIdx + 1}</td>
          <td>
            <div class="font-bold text-gray-900 text-sm break-words">${escapeHtml(item.inputWord)}</div>
            ${item.matchedLemma && item.matchedLemma !== item.normalized ? `<div class="text-[10px] text-gray-500">还原词干: ${escapeHtml(item.matchedLemma)}</div>` : ""}
          </td>
          <td>
            <span class="badge-no">❌ 不在课本中</span>
          </td>
          <td class="text-xs text-gray-400">—（未收录于课本词表）</td>
          <td class="text-xs text-gray-400">—</td>
          <td>
            <button type="button" data-batch-card-idx="${origIdx}" class="batch-open-card-btn ios-btn-active text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
              拓展›
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

export function renderBrowseCardItemsHtml(slice: VocabEntry[]): string {
  return slice
    .map((e) => {
      const isCet4 = Boolean(e.b && (e.b.includes("四级") || e.b.includes("CET-4")));
      const isCet6 = Boolean(e.b && (e.b.includes("六级") || e.b.includes("CET-6")));
      const isBold = e.f === "黑体";
      const badgeBg = isCet4
        ? "bg-indigo-50 text-indigo-700"
        : isCet6
          ? "bg-purple-50 text-purple-700"
          : "bg-blue-50 text-blue-700";
      const borderColor = isCet4
        ? "border-l-indigo-400"
        : isCet6
          ? "border-l-purple-400"
          : isBold
            ? "border-l-[#007AFF]"
            : "border-l-gray-200";

      return `
        <div data-browse-word="${escapeHtml(e.w)}" data-browse-book="${escapeHtml(e.b)}" class="browse-card-item word-card-clickable ios-card p-3 flex items-center justify-between gap-2 border-l-4 ${borderColor}">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-bold text-sm text-gray-900">${escapeHtml(e.w)}</span>
              ${e.p ? `<span class="text-[11px] italic text-blue-600">${escapeHtml(e.p)}</span>` : ""}
              ${isCet4 ? '<span class="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-medium">四级</span>' : ""}
              ${isCet6 ? '<span class="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-medium">六级</span>' : ""}
              ${isBold ? '<span class="text-[10px] bg-gray-900 text-white px-1.5 py-0.2 rounded">黑体</span>' : ""}
              ${e.n?.includes("专有名词") ? '<span class="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded">△</span>' : ""}
            </div>
            <div class="text-xs text-gray-600 mt-0.5 truncate">${escapeHtml(e.m)}</div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-[11px] font-semibold ${badgeBg} px-2 py-1 rounded-lg">
              ${isCet4 || isCet6 ? "🎓 " : "📘 "}${escapeHtml(getShortBookName(e.b))} · ${escapeHtml(formatShortUnitBadge(e.u))}
            </span>
            <button
              type="button"
              data-speak-word="${escapeHtml(e.w)}"
              aria-label="朗读"
              class="speak-btn ios-btn-active w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14" height="14">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}
