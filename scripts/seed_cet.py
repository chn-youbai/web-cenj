import json
import os
import sys
import subprocess
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DB_NAME = "web-vocab-db"

def escape_sql(val):
    if val is None:
        return "''"
    s = str(val).replace("'", "''")
    return f"'{s}'"

def run_wrangler(args):
    cmd = ["npx", "wrangler", "d1"] + args
    print(f"-> 运行命令: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", shell=True)
    if res.returncode != 0:
        print(f"❌ 命令执行失败:\n{res.stderr}\n{res.stdout}")
        return False
    print("✅ 执行成功")
    print(res.stdout.strip())
    return True

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

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cet4_path = os.path.join(base_dir, 'data', 'cet4.json')
    cet6_path = os.path.join(base_dir, 'data', 'cet6.json')

    with open(cet4_path, 'r', encoding='utf-8') as f:
        cet4_words = json.load(f).get('words', [])
    with open(cet6_path, 'r', encoding='utf-8') as f:
        cet6_words = json.load(f).get('words', [])

    print("=" * 60)
    print("🚀 分批导入大学英语四级与六级词典到 Cloudflare D1")
    print("=" * 60)

    # 1. CET-4
    sql_cet4 = generate_split_cet_sql(cet4_words, '大学英语四级 (CET-4)', 'seed_cet4.sql')
    print("🚀 执行 CET-4 导入到远程 D1...")
    if not run_wrangler(["execute", DB_NAME, "--remote", f"--file={sql_cet4}"]):
        print("❌ CET-4 导入失败")
        return

    # 2. CET-6
    sql_cet6 = generate_split_cet_sql(cet6_words, '大学英语六级 (CET-6)', 'seed_cet6.sql')
    print("🚀 执行 CET-6 导入到远程 D1...")
    if not run_wrangler(["execute", DB_NAME, "--remote", f"--file={sql_cet6}"]):
        print("❌ CET-6 导入失败")
        return

    # 3. 统计结果
    print("\n🔍 正在统计 D1 词库各分册数据...")
    stat_cmd = "SELECT book, COUNT(*) as count FROM textbook_words GROUP BY book ORDER BY count DESC;"
    run_wrangler(["execute", DB_NAME, "--remote", f"--command={stat_cmd}"])
    print("\n🎉 大学英语四六级词典已成功全量灌入 D1！")

if __name__ == '__main__':
    main()
