import urllib.request
import urllib.parse
import json
import os
import sys
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL_CET4 = 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/3-CET4-顺序.json'
BASE_URL_CET6 = 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/4-CET6-顺序.json'

def fetch_json(url):
    print(f"正在从 GitHub 拉取词库: {url}")
    quoted = urllib.parse.quote(url, safe='/:?=&')
    req = urllib.request.Request(quoted, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def clean_pos(pos_str):
    if not pos_str:
        return ""
    pos = pos_str.strip().lower()
    if pos and not pos.endswith('.'):
        pos += '.'
    return pos

def process_raw_dataset(raw_items, book_name, note_tag):
    word_map = {}
    for item in raw_items:
        w = item.get('word', '').strip()
        if not w:
            continue
        w_lower = w.lower()

        translations = item.get('translations', [])
        pos_list = []
        mean_list = []
        for t in translations:
            p = clean_pos(t.get('type', ''))
            m = t.get('translation', '').strip()
            if p and p not in pos_list:
                pos_list.append(p)
            if m and m not in mean_list:
                mean_list.append(m)

        if w_lower not in word_map:
            # 获取首字母作为单元索引 (A-Z)
            first_char = w[0].upper() if w[0].isalpha() else '#'
            word_map[w_lower] = {
                'b': book_name,
                'u': first_char,
                'w': w,
                'p': ' & '.join(pos_list) if pos_list else '',
                'm': '；'.join(mean_list) if mean_list else '',
                'f': f'{note_tag}核心',
                'n': note_tag
            }
        else:
            # 合并词性与释义
            existing = word_map[w_lower]
            for p in pos_list:
                if p and p not in existing['p']:
                    existing['p'] = (existing['p'] + ' & ' + p) if existing['p'] else p
            for m in mean_list:
                if m and m not in existing['m']:
                    existing['m'] = (existing['m'] + '；' + m) if existing['m'] else m

    # 按字母顺序排序
    result = list(word_map.values())
    result.sort(key=lambda x: x['w'].lower())
    return result

def main():
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
    os.makedirs(data_dir, exist_ok=True)

    # 1. CET-4
    raw_cet4 = fetch_json(BASE_URL_CET4)
    cet4_words = process_raw_dataset(raw_cet4, '大学英语四级 (CET-4)', 'CET-4')
    cet4_path = os.path.join(data_dir, 'cet4.json')
    with open(cet4_path, 'w', encoding='utf-8') as f:
        json.dump({'total': len(cet4_words), 'words': cet4_words}, f, ensure_ascii=False, indent=2)
    print(f"✅ CET-4 词库处理完成，去重后共 {len(cet4_words)} 词，已保存至 {cet4_path}")

    # 2. CET-6
    raw_cet6 = fetch_json(BASE_URL_CET6)
    cet6_words = process_raw_dataset(raw_cet6, '大学英语六级 (CET-6)', 'CET-6')
    cet6_path = os.path.join(data_dir, 'cet6.json')
    with open(cet6_path, 'w', encoding='utf-8') as f:
        json.dump({'total': len(cet6_words), 'words': cet6_words}, f, ensure_ascii=False, indent=2)
    print(f"✅ CET-6 词库处理完成，去重后共 {len(cet6_words)} 词，已保存至 {cet6_path}")

if __name__ == '__main__':
    main()
