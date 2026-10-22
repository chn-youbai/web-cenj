#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/sync_d1.py
一键同步课本词库、四六级词典和词根拓展数据库到 Cloudflare D1 (web-vocab-db)
用法:
  python scripts/sync_d1.py              # 同步所有数据（高中课本 + 四六级 + 词根词族）
  python scripts/sync_d1.py --textbook   # 仅同步高中课本词库
  python scripts/sync_d1.py --cet        # 仅同步大学英语四六级词典
  python scripts/sync_d1.py --derivatives# 仅同步词根词族
  python scripts/sync_d1.py --local      # 同步到本地 Wrangler 开发数据库
"""

import sys
import os
import json
import argparse
import subprocess
import re

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

DB_NAME = "web-vocab-db"

def escape_sql(val):
    if val is None:
        return "''"
    s = str(val).replace("'", "''")
    return f"'{s}'"

def run_wrangler(args):
    """运行 wrangler 命令并输出执行结果"""
    cmd = ["npx", "wrangler", "d1"] + args
    print(f"-> 运行命令: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", shell=True)
    if res.returncode != 0:
        print(f"❌ 命令执行失败:\n{res.stderr}\n{res.stdout}")
        return False
    print("✅ 执行成功")
    print(res.stdout.strip())
    return True

def generate_textbook_sql():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vocab_path = os.path.join(base_dir, "data", "vocab.json")
    
    if not os.path.exists(vocab_path):
        print(f"❌ 找不到词库文件: {vocab_path}")
        return None

    with open(vocab_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    words = data.get("words", [])
    print(f"📖 发现高中课本词条: {len(words)} 条")

    out_path = os.path.join(base_dir, "data", "seed_textbook.sql")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("-- Seed textbook words\n")
        f.write("DELETE FROM textbook_words WHERE book NOT LIKE '大学英语%';\n")

        batch_size = 200
        for i in range(0, len(words), batch_size):
            chunk = words[i:i + batch_size]
            values = []
            for w in chunk:
                book = escape_sql(w.get("b", ""))
                unit = escape_sql(w.get("u", ""))
                word = escape_sql(w.get("w", ""))
                pos = escape_sql(w.get("p", ""))
                meaning = escape_sql(w.get("m", ""))
                font = escape_sql(w.get("f", "白体"))
                note = escape_sql(w.get("n", ""))
                raw_word = str(w.get("w", "")).strip().lower()
                head_lower = escape_sql(re.sub(r"[^a-z\-]", "", raw_word))
                values.append(f"({book}, {unit}, {word}, {pos}, {meaning}, {font}, {note}, {head_lower})")
            
            f.write(f"INSERT INTO textbook_words (book, unit, word, pos, meaning, font, note, head_lower) VALUES\n  " + ",\n  ".join(values) + ";\n")

    return out_path

def generate_split_cet_sql(words, book_name, file_name):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(base_dir, 'data', file_name)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f"-- Delete previous {book_name} records\n")
        f.write(f"DELETE FROM textbook_words WHERE book = '{book_name}';\n")

        batch_size = 150
        for i in range(0, len(words), batch_size):
            chunk = words[i:i + batch_size]
            values = []
            for w in chunk:
                book = escape_sql(w.get('b', ''))
                unit = escape_sql(w.get('u', ''))
                word = escape_sql(w.get('w', ''))
                pos = escape_sql(w.get('p', ''))
                meaning = escape_sql(w.get('m', ''))
                font = escape_sql(w.get('f', '核心'))
                note = escape_sql(w.get('n', ''))
                raw_word = str(w.get('w', '')).strip().lower()
                head_lower = escape_sql(re.sub(r'[^a-z\-]', '', raw_word))
                values.append(f"({book}, {unit}, {word}, {pos}, {meaning}, {font}, {note}, {head_lower})")
            
            f.write(f"INSERT INTO textbook_words (book, unit, word, pos, meaning, font, note, head_lower) VALUES\n  " + ",\n  ".join(values) + ";\n")

    size_kb = os.path.getsize(out_path) / 1024
    print(f"📝 生成 {file_name}: {len(words)} 词 ({size_kb:.1f} KB)")
    return out_path

def generate_derivatives_sql():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root_path = os.path.join(base_dir, "data", "root_families.json")
    
    if not os.path.exists(root_path):
        print(f"❌ 找不到词族文件: {root_path}")
        return None

    with open(root_path, "r", encoding="utf-8") as f:
        families = json.load(f)
    
    out_path = os.path.join(base_dir, "data", "seed_derivatives.sql")
    all_records = []
    for fam in families:
        root_name = fam.get("rootName", "")
        triggers = fam.get("triggers", [])
        members = fam.get("members", [])
        for trg in triggers:
            trg_clean = str(trg).strip().lower()
            if not trg_clean:
                continue
            for m in members:
                w = str(m.get("w", "")).strip()
                p = str(m.get("p", "")).strip()
                mean = str(m.get("m", "")).strip()
                lvl = "高考拓展"
                all_records.append((root_name, trg_clean, w, p, mean, lvl))

    print(f"🌱 发现同根/派生词族映射: {len(all_records)} 条记录 ({len(families)} 个核心词族)")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("-- Seed word derivatives\n")
        f.write("DELETE FROM word_derivatives;\n")

        batch_size = 200
        for i in range(0, len(all_records), batch_size):
            chunk = all_records[i:i + batch_size]
            values = []
            for r in chunk:
                root_group = escape_sql(r[0])
                trigger_word = escape_sql(r[1])
                word = escape_sql(r[2])
                pos = escape_sql(r[3])
                meaning = escape_sql(r[4])
                lvl = escape_sql(r[5])
                values.append(f"({root_group}, {trigger_word}, {word}, {pos}, {meaning}, {lvl})")
            
            f.write(f"INSERT INTO word_derivatives (root_group, trigger_word, word, pos, meaning, level) VALUES\n  " + ",\n  ".join(values) + ";\n")

    return out_path

def main():
    parser = argparse.ArgumentParser(description="同步英语词库到 Cloudflare D1")
    parser.add_argument("--textbook", action="store_true", help="仅同步高中课本词库")
    parser.add_argument("--cet", action="store_true", help="仅同步大学英语四六级词库")
    parser.add_argument("--derivatives", action="store_true", help="仅同步词族与派生词")
    parser.add_argument("--local", action="store_true", help="同步到本地开发数据库（默认同步到远程）")
    args = parser.parse_args()

    mode_flag = [] if args.local else ["--remote"]
    sync_all = not (args.textbook or args.cet or args.derivatives)

    print("=" * 60)
    print(f"🚀 开始 Cloudflare D1 数据库同步 [{'本地模式' if args.local else '远程云端生产环境'}]")
    print(f"🎯 目标数据库: {DB_NAME}")
    print("=" * 60)

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    schema_path = os.path.join(base_dir, "data", "schema.sql")
    print(f"📋 检查并执行表结构: {schema_path}")
    if not run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={schema_path}"]):
        print("❌ 表结构初始化失败，终止同步。")
        sys.exit(1)

    # 1. 同步高中课本词库
    if sync_all or args.textbook:
        print("\n📚 生成高中课本词库 SQL 批处理文件...")
        tb_sql = generate_textbook_sql()
        if tb_sql:
            print("🚀 执行课本词库同步到 D1...")
            run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={tb_sql}"])
            try:
                os.remove(tb_sql)
            except Exception:
                pass

    # 2. 同步四六级词典
    if sync_all or args.cet:
        print("\n🎓 准备大学英语四六级词典...")
        cet4_path = os.path.join(base_dir, 'data', 'cet4.json')
        cet6_path = os.path.join(base_dir, 'data', 'cet6.json')
        if os.path.exists(cet4_path) and os.path.exists(cet6_path):
            with open(cet4_path, 'r', encoding='utf-8') as f:
                cet4_words = json.load(f).get('words', [])
            with open(cet6_path, 'r', encoding='utf-8') as f:
                cet6_words = json.load(f).get('words', [])

            c4_sql = generate_split_cet_sql(cet4_words, '大学英语四级 (CET-4)', 'seed_cet4.sql')
            run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={c4_sql}"])
            try:
                os.remove(c4_sql)
            except Exception:
                pass

            c6_sql = generate_split_cet_sql(cet6_words, '大学英语六级 (CET-6)', 'seed_cet6.sql')
            run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={c6_sql}"])
            try:
                os.remove(c6_sql)
            except Exception:
                pass
        else:
            print("⚠️ 未找到 data/cet4.json 或 data/cet6.json，跳过四六级同步。")

    # 3. 同步词根词族
    if sync_all or args.derivatives:
        print("\n🌱 生成词族与派生词 SQL 批处理文件...")
        deriv_sql = generate_derivatives_sql()
        if deriv_sql:
            print("🚀 执行词族与派生词同步到 D1...")
            run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={deriv_sql}"])
            try:
                os.remove(deriv_sql)
            except Exception:
                pass

    # 4. 统计结果
    print("\n🔍 正在验证 D1 数据库统计数据...")
    stat_cmd = "SELECT book, COUNT(*) as count FROM textbook_words GROUP BY book ORDER BY count DESC;"
    run_wrangler(["execute", DB_NAME] + mode_flag + [f"--command={stat_cmd}"])

    print("\n🎉 D1 数据库同步完成！")

if __name__ == "__main__":
    main()
