with open('vocab.html', 'r', encoding='utf-8') as f:
    text = f.read()

print("Has document click listener:", "document.addEventListener('click'" in text)
print("Has fetchBaselineVocab:", "fetchBaselineVocab" in text)
print("Has DATA_VOCAB_URL:", "DATA_VOCAB_URL" in text)
print("Has desktopDetailPanel:", "desktopDetailPanel" in text)
print("Has desktop-header-tabs:", "desktop-header-tabs" in text)
print("Has card-selected:", "card-selected" in text)

import re
scripts = re.findall(r'<script>(.*?)</script>', text, re.DOTALL)
print("Scripts count:", len(scripts))
with open('.temp_check.js', 'w', encoding='utf-8') as sf:
    sf.write(scripts[0])
print("Wrote .temp_check.js for syntax test")
