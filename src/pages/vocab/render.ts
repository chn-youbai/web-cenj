import { escapeHtml } from "@/core/dom";
import { escapeRegExp, formatShortUnitBadge, getShortBookName, normalizeWordStr } from "./search";
import type { AggregatedVocabItem, BatchCheckResult } from "./types";

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
        return `<mark class="vc-hl">${escapeHtml(part)}</mark>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

export function renderAggregatedWordRowHtml(
  item: AggregatedVocabItem,
  idx: number,
  isSelected: boolean,
  queryHighlight = "",
): string {
  const { primary, occurrences, isBold } = item;
  const hlTarget = primary._hlTerm || queryHighlight;
  const isChineseMatch = primary._matchType.includes("中文");

  const wordHtml = isChineseMatch
    ? escapeHtml(primary.w)
    : highlightQueryFragment(primary.w, hlTarget);
  const meanHtml = isChineseMatch
    ? highlightQueryFragment(primary.m || "", hlTarget)
    : escapeHtml(primary.m || "（无释义）");

  const firstOcc = occurrences[0] ?? primary;
  const shortBook = getShortBookName(firstOcc.b);
  const shortUnit = formatShortUnitBadge(firstOcc.u);
  const extraCount = occurrences.length > 1 ? ` +${occurrences.length - 1}` : "";
  const isCet = Boolean(
    firstOcc.b &&
      (firstOcc.b.includes("四级") || firstOcc.b.includes("六级") || firstOcc.b.includes("CET")),
  );

  const showMatchTag =
    primary._matchType &&
    primary._matchRank > 1 &&
    primary._matchType !== "浏览" &&
    primary._matchType !== "开头匹配";

  return `
    <div
      role="option"
      aria-selected="${isSelected ? "true" : "false"}"
      data-row-idx="${idx}"
      class="vc-word-row${isSelected ? " is-active" : ""}"
    >
      <div class="vc-row-main">
        <div class="vc-row-head">
          <span class="vc-row-word">${wordHtml}</span>
          ${primary.p ? `<span class="vc-pos-inline">${escapeHtml(primary.p)}</span>` : ""}
          ${isBold ? '<span class="vc-dot-bold" title="课标重点黑体词"></span>' : ""}
          ${showMatchTag ? `<span class="vc-match-pill">${escapeHtml(primary._matchType)}</span>` : ""}
        </div>
        <div class="vc-row-mean">${meanHtml}</div>
      </div>
      <div class="vc-row-aside">
        <span class="vc-source-pill${isCet ? " is-cet" : ""}">${escapeHtml(shortBook)} · ${escapeHtml(shortUnit)}${extraCount}</span>
        <button
          type="button"
          class="vc-row-speak speak-btn"
          data-speak-word="${escapeHtml(primary.w)}"
          aria-label="朗读 ${escapeHtml(primary.w)}"
          title="朗读发音"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

export function renderBatchTableRowsHtml(
  batchCheckResults: BatchCheckResult[],
  filtered: BatchCheckResult[],
): string {
  if (filtered.length === 0) {
    return `
      <tr>
        <td colspan="6" class="vc-batch-empty">当前筛选条件下暂无单词记录</td>
      </tr>
    `;
  }

  return filtered
    .map((item) => {
      const origIdx = batchCheckResults.indexOf(item);
      if (item.isInTextbook) {
        const entriesHtml =
          item.matches
            .slice(0, 2)
            .map(
              (e) => `
          <div class="vc-batch-entry">
            <strong>${escapeHtml(e.w)}</strong>
            ${e.p ? `<span class="vc-pos-inline">${escapeHtml(e.p)}</span>` : ""}
            <span class="vc-batch-mean">${escapeHtml(e.m)}</span>
          </div>
        `,
            )
            .join("") +
          (item.matches.length > 2
            ? `<div class="vc-batch-more">等共 ${item.matches.length} 处匹配</div>`
            : "");

        const locsHtml = item.matches
          .slice(0, 2)
          .map(
            (e) => `
          <div class="vc-batch-loc">
            <span class="vc-tag">${escapeHtml(getShortBookName(e.b))} · ${escapeHtml(formatShortUnitBadge(e.u))}</span>
            ${e.f === "黑体" ? '<span class="vc-tag is-bold is-mini">黑体</span>' : ""}
          </div>
        `,
          )
          .join("");

        return `
          <tr data-batch-row-idx="${origIdx}" class="vc-batch-row is-yes">
            <td class="vc-batch-idx">${origIdx + 1}</td>
            <td><strong>${escapeHtml(item.inputWord)}</strong></td>
            <td>
              <span class="vc-tag is-ext">✅ 收录</span>
              <div class="vc-batch-sub">${escapeHtml(item.matchType)}</div>
            </td>
            <td>${entriesHtml}</td>
            <td>${locsHtml}</td>
            <td>
              <button type="button" data-batch-card-idx="${origIdx}" class="vc-btn-mini">详情 ›</button>
            </td>
          </tr>
        `;
      }

      return `
        <tr data-batch-row-idx="${origIdx}" class="vc-batch-row is-no">
          <td class="vc-batch-idx">${origIdx + 1}</td>
          <td>
            <strong>${escapeHtml(item.inputWord)}</strong>
            ${item.matchedLemma && item.matchedLemma !== item.normalized ? `<div class="vc-batch-sub">词干: ${escapeHtml(item.matchedLemma)}</div>` : ""}
          </td>
          <td><span class="vc-tag is-miss">未收录</span></td>
          <td class="vc-batch-muted">—（不在当前课本词表中）</td>
          <td class="vc-batch-muted">—</td>
          <td>
            <button type="button" data-batch-card-idx="${origIdx}" class="vc-btn-mini">拓展 ›</button>
          </td>
        </tr>
      `;
    })
    .join("");
}
