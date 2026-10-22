#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/sync_d1.py
一键同步课本词库和词根拓展数据库到 Cloudflare D1 (web-vocab-db)
用法:
  python scripts/sync_d1.py           # 同步所有数据（课本 + 词族）到远程 D1
  python scripts/sync_d1.py --textbook  # 仅同步课本词库
  python scripts/sync_d1.py --derivatives # 仅同步词根词族
  python scripts/sync_d1.py --local   # 同步到本地 Wrangler 开发数据库
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
    print(f"📖 发现课本词条: {len(words)} 条")

    out_path = os.path.join(base_dir, "data", "seed_textbook.sql")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("-- Seed textbook words\n")
        f.write("DELETE FROM textbook_words;\n")

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
    parser = argparse.ArgumentParser(description="同步高中英语词库到 Cloudflare D1")
    parser.add_argument("--textbook", action="store_true", help="仅同步课本词库")
    parser.add_argument("--derivatives", action="store_true", help="仅同步词族与派生词")
    parser.add_argument("--local", action="store_true", help="同步到本地开发数据库（默认同步到远程）")
    args = parser.parse_args()

    mode_flag = [] if args.local else ["--remote"]
    sync_all = not (args.textbook or args.derivatives)

    print("=" * 60)
    print(f"🚀 开始 Cloudflare D1 数据库同步 [{'本地模式' if args.local else '远程云端生产环境'}]")
    print(f"🎯 目标数据库: {DB_NAME}")
    print("=" * 60)

    # 1. 确保表结构存在
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    schema_path = os.path.join(base_dir, "data", "schema.sql")
    print(f"📋 检查并执行表结构: {schema_path}")
    if not run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={schema_path}"]):
        print("❌ 表结构初始化失败，终止同步。")
        sys.exit(1)

    # 2. 同步课本词库
    if sync_all or args.textbook:
        print("\n📚 生成课本词库 SQL 批处理文件...")
        tb_sql = generate_textbook_sql()
        if tb_sql:
            print("🚀 执行课本词库同步到 D1...")
            run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={tb_sql}"])

    # 3. 同步词根词族
    if sync_all or args.derivatives:
        print("\n🌱 生成词族与派生词 SQL 批处理文件...")
        deriv_sql = generate_derivatives_sql()
        if deriv_sql:
            print("🚀 执行词族与派生词同步到 D1...")
            run_wrangler(["execute", DB_NAME] + mode_flag + [f"--file={deriv_sql}"])

    # 4. 统计结果
    print("\n🔍 正在验证 D1 数据库统计数据...")
    verify_cmd = "SELECT COUNT(*) as textbook_count FROM textbook_words; SELECT COUNT(*) as deriv_count FROM word_derivatives;"
    run_wrangler(["execute", DB_NAME] + mode_flag + [f"--command={verify_cmd}"])

    print("\n🎉 D1 数据库同步完成！")

if __name__ == "__main__":
    main()
