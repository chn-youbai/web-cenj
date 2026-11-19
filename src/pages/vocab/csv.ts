import { formatShortUnitBadge, getShortBookName } from "./search";
import type { BatchCheckResult, VocabEntry } from "./types";

export function parseCSVTextToRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += ch;
    }
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export function cleanMeaningText(m: string): string {
  return String(m || "")
    .replace(/\u00A0/g, " ")
    .replace(/^[=+//\s]+/, "")
    .replace(/（\s*\.?\s*）/g, "")
    .replace(/\(\s*\.?\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function mergePendingRowsGroup(group: string[][], isProper: boolean): VocabEntry {
  const firstRow = group[0] ?? [];
  const lastRow = group[group.length - 1] ?? [];
  const book = lastRow[0] ?? "";
  const unit = lastRow[1] ?? "";
  const font = firstRow[5] || lastRow[5] || "";
  const note = isProper ? "专有名词(△)" : "";

  if (group.length === 1) {
    return {
      b: book,
      u: unit,
      w: (firstRow[2] ?? "").replace(/\u00A0/g, " ").trim(),
      p: (firstRow[3] ?? "").replace(/\u00A0/g, " ").trim(),
      m: cleanMeaningText(firstRow[4] ?? ""),
      f: font,
      n: note,
    };
  }

  const words = group.map((g) => (g[2] ?? "").replace(/\u00A0/g, " ").trim());
  const poses = group.map((g) => (g[3] ?? "").replace(/\u00A0/g, " ").trim());
  const meanings = group.map((g) => (g[4] ?? "").replace(/\u00A0/g, " ").trim());
  const w0 = words[0] ?? "";

  if (words.slice(1).some((x) => x === "·" || x === "-")) {
    const realWords = words.filter((x) => x !== "·" && x !== "-");
    const mParts: string[] = [];
    for (const g of group) {
      const gw = (g[2] ?? "").trim();
      const gm = (g[4] ?? "").trim();
      if (gw === "·" || gw === "-") mParts.push(gw + gm);
      else if (gm) mParts.push(gm);
    }
    return {
      b: book,
      u: unit,
      w: realWords.join(" "),
      p: poses.filter(Boolean).join(" "),
      m: cleanMeaningText(mParts.join("")),
      f: font,
      n: note,
    };
  }

  if (w0 === "tai chi")
    return {
      b: book,
      u: unit,
      w: "tai chi (also t'ai chi)",
      p: "n.",
      m: "太极拳",
      f: font,
      n: note,
    };
  if (w0 === "artemisinin")
    return { b: book, u: unit, w: "artemisinin", p: "n.", m: "[药] 青蒿素", f: font, n: note };
  if (w0 === "circumstance")
    return {
      b: book,
      u: unit,
      w: "circumstance",
      p: "n. [usually pl.]",
      m: "条件；环境；状况",
      f: font,
      n: note,
    };
  if (w0 === "glacier")
    return { b: book, u: unit, w: "glacier", p: "n.", m: "冰川", f: font, n: note };
  if (w0 === "(real")
    return {
      b: book,
      u: unit,
      w: "(real) estate agent",
      p: "n.",
      m: "房地产经纪人",
      f: font,
      n: note,
    };
  if (w0 === "bath") {
    return {
      b: book,
      u: unit,
      w: "bath (BrE) / bathtub (NAmE) / bathe",
      p: "n. & vt.",
      m: "洗澡；（=bathtub）浴缸；浴盆；（=bathe）给……洗澡",
      f: font,
      n: note,
    };
  }
  if (w0 === "chilli")
    return {
      b: book,
      u: unit,
      w: "chilli (NAmE chili, pl. -es)",
      p: "n.",
      m: "辣椒",
      f: font,
      n: note,
    };
  if (["tornado", "volcano", "mosquito"].includes(w0)) {
    const lastMeaning = meanings[meanings.length - 1] ?? "";
    return {
      b: book,
      u: unit,
      w: `${w0} (pl. -oes or -os)`,
      p: "n.",
      m: cleanMeaningText(lastMeaning.replace(/^[）)]+/, "")),
      f: font,
      n: note,
    };
  }
  if (w0 === "cm")
    return {
      b: book,
      u: unit,
      w: "cm (centimetre / centimeter)",
      p: "abbr.",
      m: "厘米",
      f: font,
      n: note,
    };
  if (w0 === "CV")
    return { b: book, u: unit, w: "CV (NAmE résumé)", p: "n.", m: "履历；简历", f: font, n: note };
  if (w0 === "transport")
    return {
      b: book,
      u: unit,
      w: "transport (usually transportation)",
      p: "n. & vt.",
      m: "交通运输系统；运输；运送",
      f: font,
      n: note,
    };
  if (w0 === "bean curd")
    return { b: book, u: unit, w: "bean curd (= tofu)", p: "n.", m: "豆腐", f: font, n: note };
  if (w0 === "junk food")
    return { b: book, u: unit, w: "junk food (= junk)", p: "n.", m: "垃圾食品", f: font, n: note };

  if (group.length === 2 && meanings[0] === "（" && meanings[1]?.startsWith("）")) {
    return {
      b: book,
      u: unit,
      w: `${words[0] ?? ""} (${words[1] ?? ""})`,
      p: `${poses[0] ?? ""} ${poses[1] ?? ""}`.trim(),
      m: cleanMeaningText(meanings[1].slice(1)),
      f: font,
      n: note,
    };
  }

  const wStr = words.filter(Boolean).join(" ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  const pStr = poses.filter(Boolean).join(" ");
  const mStr = cleanMeaningText(
    meanings
      .filter((m) => !["（", "(", ")", "）", "//", "also", "usually", "especially"].includes(m))
      .join("")
      .replace(/^[)）\s/]+/, ""),
  );
  return { b: book, u: unit, w: wStr, p: pStr, m: mStr, f: font, n: note };
}

export function parseUploadedCSVContent(csvText: string, fallbackFileName: string): VocabEntry[] {
  const rows = parseCSVTextToRows(csvText);
  if (rows.length < 2) return [];

  const headerRow = rows[0] ?? [];
  const header = headerRow.map((h) =>
    String(h || "")
      .replace(/^\uFEFF/, "")
      .trim(),
  );
  const isStandardPEP = header[0] === "册" && header[1] === "单元" && header[2] === "单词";

  if (isStandardPEP) {
    const entries: VocabEntry[] = [];
    let pending: string[][] = [];
    let nextIsProper = false;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.some((x) => String(x || "").trim())) continue;
      const book = String(r[0] || "").trim() || fallbackFileName;
      const unit = String(r[1] || "").trim();
      const word = String(r[2] || "").trim();
      const pos = String(r[3] || "").trim();
      const meaning = String(r[4] || "").trim();
      const font = String(r[5] || "").trim();
      const note = String(r[6] || "").trim();

      if (!unit) {
        if (word === "campaign" && meaning.includes("(3)")) {
          entries.push({
            b: book,
            u: "3",
            w: word,
            p: pos,
            m: cleanMeaningText(meaning.replace("(3)", "；")),
            f: font,
            n: nextIsProper ? "专有名词(△)" : "",
          });
          nextIsProper = note === "专有名词(△)";
          continue;
        }
        if (word === "consist" && meaning === "(3)") {
          entries.push({
            b: book,
            u: "3",
            w: word,
            p: pos,
            m: "组成；构成（常与 of 连用）",
            f: font,
            n: nextIsProper ? "专有名词(△)" : "",
          });
          nextIsProper = note === "专有名词(△)";
          continue;
        }
        if (word === "estate" && meaning.includes("(5)")) {
          entries.push({
            b: book,
            u: "5",
            w: word,
            p: pos,
            m: cleanMeaningText(meaning.replace(/\s*\(5\)\s*（?/, "")),
            f: font,
            n: nextIsProper ? "专有名词(△)" : "",
          });
          nextIsProper = false;
          pending.push([book, "", "(real", "", "", font, note]);
          continue;
        }
        pending.push([book, unit, word, pos, meaning, font, note]);
      } else {
        pending.push([book, unit, word, pos, meaning, font, note]);
        entries.push(mergePendingRowsGroup(pending, nextIsProper));
        nextIsProper = note === "专有名词(△)";
        pending = [];
      }
    }
    return entries;
  }

  const findCol = (keywords: string[], defaultIdx: number): number => {
    const idx = header.findIndex((h) => keywords.some((k) => h.toLowerCase().includes(k)));
    return idx >= 0 ? idx : defaultIdx;
  };
  const idxWord = findCol(["单词", "词条", "英文", "word", "vocabulary", "term"], 0);
  const idxMeaning = findCol(
    ["释义", "中文", "意思", "翻译", "meaning", "definition", "translation"],
    1,
  );
  const idxBook = findCol(["册", "课本", "教材", "书", "book", "volume"], -1);
  const idxUnit = findCol(["单元", "位置", "章节", "页", "unit", "lesson", "location", "page"], -1);
  const idxPos = findCol(["词性", "pos", "part of speech", "type"], -1);
  const idxFont = findCol(["字体", "重点", "font", "level"], -1);
  const idxNote = findCol(["备注", "说明", "note", "remark"], -1);

  const cleanFallbackBook = fallbackFileName.replace(/\.csv$/i, "");
  const customEntries: VocabEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.some((x) => String(x || "").trim())) continue;
    const w = String(r[idxWord] || "").trim();
    if (!w) continue;
    customEntries.push({
      b: idxBook >= 0 && r[idxBook] ? String(r[idxBook]).trim() : cleanFallbackBook,
      u: idxUnit >= 0 && r[idxUnit] ? String(r[idxUnit]).trim() : "默认单元",
      w,
      p: idxPos >= 0 && r[idxPos] ? String(r[idxPos]).trim() : "",
      m: idxMeaning >= 0 && r[idxMeaning] ? cleanMeaningText(String(r[idxMeaning])) : "",
      f: idxFont >= 0 && r[idxFont] ? String(r[idxFont]).trim() : "",
      n: idxNote >= 0 && r[idxNote] ? String(r[idxNote]).trim() : "",
    });
  }
  return customEntries;
}

export function extractWordsFromBatchCSV(csvText: string): string[] {
  const rows = parseCSVTextToRows(csvText);
  if (!rows || rows.length === 0) return [];

  const nonEmptyRows = rows.filter((r) => r.some((cell) => String(cell || "").trim()));
  if (nonEmptyRows.length === 0) return [];

  const firstRow = (nonEmptyRows[0] ?? []).map((c) =>
    String(c || "")
      .replace(/^\uFEFF/, "")
      .trim(),
  );
  const headerKeywords = [
    "单词",
    "词条",
    "英文",
    "词汇",
    "word",
    "words",
    "vocabulary",
    "term",
    "english",
  ];
  let wordColIdx = -1;
  let startRow = 0;

  const foundHeaderIdx = firstRow.findIndex((cell) => {
    const lower = cell.toLowerCase();
    return headerKeywords.some((k) => lower === k || lower.includes(k));
  });

  if (foundHeaderIdx >= 0) {
    wordColIdx = foundHeaderIdx;
    startRow = 1;
  } else {
    const hasChineseHeader = firstRow.some((cell) => /[\u4e00-\u9fa5]/.test(cell));
    if (hasChineseHeader && firstRow.length > 1) {
      startRow = 1;
    }
    const sampleRows = nonEmptyRows.slice(startRow, startRow + 5);
    let bestCol = 0;
    let bestScore = -1;
    const maxCols = Math.max(0, ...sampleRows.map((r) => r.length));
    for (let c = 0; c < maxCols; c++) {
      let score = 0;
      for (const r of sampleRows) {
        const val = String(r[c] || "").trim();
        if (
          /^[a-zA-Z][a-zA-Z\s'().\/-]*$/.test(val) &&
          !/^(n\.|v\.|vt\.|vi\.|adj\.|adv\.|prep\.|conj\.|w)$/i.test(val)
        ) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCol = c;
      }
    }
    wordColIdx = bestCol;
  }

  const words: string[] = [];
  for (let i = startRow; i < nonEmptyRows.length; i++) {
    const r = nonEmptyRows[i];
    if (!r) continue;
    const rawCell = r[wordColIdx] !== undefined ? r[wordColIdx] : (r[0] ?? "");
    const cellVal = String(rawCell || "")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!cellVal) continue;
    for (const line of cellVal.split(/[\r\n]+/)) {
      const trimmed = line.trim();
      if (trimmed && !/^(单词|word|words|序号|id)$/i.test(trimmed)) {
        words.push(trimmed);
      }
    }
  }
  return words;
}

export function readCsvFileSmart(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = (e.target as FileReader).result;
      if (!(buffer instanceof ArrayBuffer)) {
        reject(new Error("文件读取失败"));
        return;
      }
      let text = new TextDecoder("utf-8").decode(buffer);
      if (text.includes("\uFFFD")) {
        try {
          text = new TextDecoder("gbk").decode(buffer);
        } catch {
          // fallback to utf-8 string
        }
      }
      resolve(text);
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsArrayBuffer(file);
  });
}

export function buildBatchExportCSV(batchCheckResults: BatchCheckResult[]): string {
  const headers = [
    "序号",
    "导入单词",
    "是否课本单词",
    "判定类型",
    "匹配课本词条",
    "词性",
    "中文释义",
    "所在课本与单元",
    "字体",
  ];
  const csvRows = [headers.join(",")];

  const escCsv = (val: unknown): string => {
    const s = String(val ?? "").replace(/"/g, '""');
    return /[",\r\n]/.test(s) ? `"${s}"` : s;
  };

  batchCheckResults.forEach((item, idx) => {
    if (item.isInTextbook && item.matches.length > 0) {
      const mWords = item.matches.map((e) => e.w).join(" / ");
      const mPos = item.matches
        .map((e) => e.p)
        .filter(Boolean)
        .join(" / ");
      const mMean = item.matches.map((e) => e.m).join(" ｜ ");
      const mLocs = item.matches
        .map((e) => `${getShortBookName(e.b)} ${formatShortUnitBadge(e.u)}`)
        .join("；");
      const mFonts = item.matches.map((e) => e.f || "白体").join(" / ");
      csvRows.push(
        [
          idx + 1,
          escCsv(item.inputWord),
          "是",
          escCsv(item.matchType),
          escCsv(mWords),
          escCsv(mPos),
          escCsv(mMean),
          escCsv(mLocs),
          escCsv(mFonts),
        ].join(","),
      );
    } else {
      csvRows.push(
        [
          idx + 1,
          escCsv(item.inputWord),
          "否（不在课本中）",
          "不在课本中",
          "—",
          "—",
          "—",
          "—",
          "—",
        ].join(","),
      );
    }
  });

  return `\uFEFF${csvRows.join("\r\n")}`;
}

export function buildBatchExportTSV(batchCheckResults: BatchCheckResult[]): string {
  const lines = ["序号\t导入单词\t是否课本单词\t判定方式\t匹配课本词条\t中文释义\t所在课本与单元"];
  batchCheckResults.forEach((item, idx) => {
    const e0 = item.matches[0];
    if (item.isInTextbook && e0) {
      const locs = item.matches
        .map((e) => `${getShortBookName(e.b)} ${formatShortUnitBadge(e.u)}(${e.f || "白体"})`)
        .join("；");
      lines.push(
        `${idx + 1}\t${item.inputWord}\t是\t${item.matchType}\t${e0.w} ${e0.p || ""}\t${e0.m}\t${locs}`,
      );
    } else {
      lines.push(`${idx + 1}\t${item.inputWord}\t否(不在课本中)\t不在课本中\t—\t—\t—`);
    }
  });
  return lines.join("\n");
}
