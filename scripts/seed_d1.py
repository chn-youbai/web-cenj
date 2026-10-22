import json
import os
import subprocess
import re

def escape_sql(val):
    if val is None:
        return "''"
    s = str(val).replace("'", "''")
    return f"'{s}'"

def generate_textbook_sql():
    vocab_path = os.path.join(os.path.dirname(__file__), "..", "data", "vocab.json")
    with open(vocab_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    words = data.get("words", [])
    print(f"Total textbook words to seed: {len(words)}")

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "seed_textbook.sql")
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

    print(f"Generated {out_path}")
    return out_path

def generate_derivatives_sql():
    root_path = os.path.join(os.path.dirname(__file__), "..", "data", "root_families.json")
    with open(root_path, "r", encoding="utf-8") as f:
        families = json.load(f)
    
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "seed_derivatives.sql")
    total_rows = 0

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("-- Seed word derivatives\n")
        f.write("DELETE FROM word_derivatives;\n")

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

        total_rows = len(all_records)
        print(f"Total derivative rows to seed: {total_rows}")

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

    print(f"Generated {out_path}")
    return out_path

if __name__ == "__main__":
    t_sql = generate_textbook_sql()
    d_sql = generate_derivatives_sql()
    print("SQL files successfully generated. Ready to execute on D1.")
