#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课本词汇 CSV 转换与更新工具 (Textbook CSV to vocab.json)
功能：
1. 支持将人教版高中英语 7 册（或新增分册）词库 CSV 批量转换为云端标准 `data/vocab.json`。
2. 自动兼容 UTF-8、UTF-8-SIG (BOM)、GBK 等多种编码。
3. 智能容错：自动识别「册/课本/Volume」、「单元/Unit」、「单词/Word」、「词性/POS」、「释义/Meaning」等列。

使用方法：
  python scripts/convert_csv_to_vocab.py [csv_path_or_dir]
如果不带参数，默认会在 data/csv/ 目录下寻找所有 .csv 文件并合并导出到 data/vocab.json。
"""

import os
import sys
import csv
import json
from datetime import date

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

DEFAULT_CSV_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "csv")
TARGET_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "vocab.json")

def read_csv_smart(filepath):
    """尝试用 utf-8-sig, utf-8, gbk 读取 CSV"""
    for enc in ["utf-8-sig", "utf-8", "gbk", "gb18030"]:
        try:
            with open(filepath, "r", encoding=enc, errors="strict") as f:
                reader = csv.reader(f)
                return [row for row in reader], enc
        except UnicodeDecodeError:
            continue
    # 兜底
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        return [row for row in reader], "utf-8(replace)"

def find_column_index(headers, keywords, default_idx=-1):
    for i, h in enumerate(headers):
        clean_h = str(h or "").lower().strip()
        if any(kw in clean_h for kw in keywords):
            return i
    return default_idx

def parse_csv_rows(rows, filename=""):
    if not rows:
        return []

    # 过滤空行
    clean_rows = [r for r in rows if any(str(c or "").strip() for c in r)]
    if not clean_rows:
        return []

    headers = [str(c or "").strip() for c in clean_rows[0]]

    # 检查是否为人教版标准格式: [册, 单元, 单词, 词性, 释义, 字体, 标注]
    is_standard = len(headers) >= 3 and (
        ("册" in headers[0] or "book" in headers[0].lower()) and
        ("单元" in headers[1] or "unit" in headers[1].lower()) and
        ("单词" in headers[2] or "word" in headers[2].lower())
    )

    idx_book = 0 if is_standard else find_column_index(headers, ["册", "书", "课本", "教材", "book", "volume"], -1)
    idx_unit = 1 if is_standard else find_column_index(headers, ["单元", "课", "unit", "lesson", "section"], -1)
    idx_word = 2 if is_standard else find_column_index(headers, ["单词", "词汇", "word", "vocabulary", "term"], 0)
    idx_pos = 3 if is_standard else find_column_index(headers, ["词性", "pos", "part of speech"], -1)
    idx_meaning = 4 if is_standard else find_column_index(headers, ["释义", "意思", "中文", "meaning", "definition"], -1)
    idx_font = 5 if is_standard else find_column_index(headers, ["字体", "重点", "font", "level"], -1)
    idx_note = 6 if is_standard else find_column_index(headers, ["标注", "备注", "说明", "note"], -1)

    fallback_book = os.path.splitext(os.path.basename(filename))[0] if filename else "高中英语课本"

    entries = []
    for r in clean_rows[1:]:
        if idx_word >= len(r):
            continue
        word = str(r[idx_word] or "").strip()
        if not word:
            continue

        book = str(r[idx_book] or "").strip() if idx_book >= 0 and idx_book < len(r) else fallback_book
        if not book:
            book = fallback_book

        unit = str(r[idx_unit] or "").strip() if idx_unit >= 0 and idx_unit < len(r) else ""
        pos = str(r[idx_pos] or "").strip() if idx_pos >= 0 and idx_pos < len(r) else ""
        meaning = str(r[idx_meaning] or "").strip() if idx_meaning >= 0 and idx_meaning < len(r) else ""
        font = str(r[idx_font] or "").strip() if idx_font >= 0 and idx_font < len(r) else ""
        note = str(r[idx_note] or "").strip() if idx_note >= 0 and idx_note < len(r) else ""

        entries.append({
            "b": book,
            "u": unit,
            "w": word,
            "p": pos,
            "m": meaning,
            "f": font,
            "n": note
        })

    return entries

def main():
    target_path = TARGET_JSON_PATH
    input_source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV_DIR

    all_entries = []

    if os.path.isfile(input_source):
        print(f"📖 正在解析单个 CSV: {input_source}")
        rows, enc = read_csv_smart(input_source)
        entries = parse_csv_rows(rows, input_source)
        print(f"   ✓ 编码: {enc}, 提取到 {len(entries)} 个词条")
        all_entries.extend(entries)
    elif os.path.isdir(input_source):
        print(f"📁 正在扫描目录: {input_source}")
        csv_files = [f for f in os.listdir(input_source) if f.lower().endswith(".csv")]
        if not csv_files:
            print("   ⚠️ 目录下未发现 .csv 文件。如果需要转换，请将 CSV 放入该目录。")
            return
        for f in sorted(csv_files):
            p = os.path.join(input_source, f)
            rows, enc = read_csv_smart(p)
            entries = parse_csv_rows(rows, f)
            print(f"   ✓ {f} ({enc}): {len(entries)} 词")
            all_entries.extend(entries)
    else:
        print(f"⚠️ 指定的路径不存在: {input_source}")
        print(f"提示：若无外部 CSV，当前已有基线词库位于 {target_path}。")
        return

    if not all_entries:
        print("未提取到任何词条，跳过写入。")
        return

    output_data = {
        "version": "1.0.0",
        "updatedAt": str(date.today()),
        "total": len(all_entries),
        "words": all_entries
    }

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 成功生成词库文件: {target_path}")
    print(f"   总词条数: {len(all_entries)}")

if __name__ == "__main__":
    main()
