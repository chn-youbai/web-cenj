# 课本词库 CSV 目录

如果你有更新或新增的高中英语课本单词 CSV 文件，可以直接放入本目录：
- 支持格式：`.csv` 文件（UTF-8 或 GBK 编码均可）。
- 标准列顺序：`册, 单元, 单词, 词性, 释义, 字体, 标注`（也支持包含相应表头列名的任意顺序）。
- 放入后在项目根目录运行：
  ```bash
  python scripts/convert_csv_to_vocab.py
  ```
  即可自动将所有 CSV 合并并更新为 `data/vocab.json`。
