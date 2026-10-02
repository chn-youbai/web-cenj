# AI 智能理科试卷排版系统 (Exam Typesetter)

专为中学及高校教师、题库数字化人员设计的 **AI 试卷自动化排版工具**。支持将杂乱的试卷草稿或大模型提取的结构化题目，高保真输出为符合国家考试规范的 **原生可编辑 DOCX (Word)** 及 **印刷级矢量 PDF**。

---

## 🌟 核心功能特色

1. **LaTeX 数学公式无损转原生 OMML**：
   - 题干与解析中的数学公式（如 `$...$`、`$$...$$`）自动转换为 Word 原生的 **Office Math ML (OMML)** 对象；
   - 彻底告别模糊低清的截图与公式变形，老师在 Word / WPS 中双击公式即可直接修改；
   - 完美支持上下标、分式方程、根式、向量、希腊字母、微积分与几何符号。
2. **选择题自适应对齐引擎**：
   - 自动检测 A、B、C、D 四个选项的文字长度；
   - 短选项自适应为 **单行 4 等分** 对齐；
   - 中长选项自适应为 **双行 2 等分** 对齐；
   - 超长选项自适应为 **单行独占**；
   - 使用隐藏无边框表格锁定位置，确保任何电脑打开都不跑偏、不错位。
3. **标准化试卷卷头与统分表**：
   - 规范大标题（黑体小二）、副标题（黑体小四）、考试时间及满分说明（楷体）；
   - 标准考生信息栏（考号、班级、姓名、座位号）；
   - 自动统计题号并生成标准 **“大题统分表”**（题号、各大题、总分、评卷人）。
4. **主观解答题智能留白**：
   - 解答题支持精准配置 `blank_lines`，为学生在卷面上预留出标准作答高度；
   - 自动防孤行处理（Keep With Next），大题标题与小题题干绝不会被截断在页末空白处。
5. **双轨输出 (DOCX + 高清 PDF)**：
   - 一键生成 `.docx` 文件；
   - 可一键调用本地 WPS / Word 自动化无损导出矢量 `.pdf`，直接连接打印机即可批量印卷。

---

## 🚀 快速上手 (Quick Start)

### 1. 命令行一键生成

```bash
# 1. 仅生成标准可编辑 Word 试卷
python -m exam_typesetter.cli sample_math_exam.json -o 我的数学试卷.docx

# 2. 同时生成 Word 试卷与高清打印 PDF
python -m exam_typesetter.cli sample_math_exam.json -o 我的数学试卷.docx --pdf
```

### 2. Python 代码调用

```python
import json
from exam_typesetter import ExamDocxBuilder, docx_to_pdf

# 1. 读取结构化试卷 JSON
with open("sample_math_exam.json", "r", encoding="utf-8") as f:
    exam_data = json.load(f)

# 2. 生成 DOCX 试卷
builder = ExamDocxBuilder(exam_data)
builder.build("高三数学模拟卷.docx")

# 3. 导出为高清 PDF
docx_to_pdf("高三数学模拟卷.docx", "高三数学模拟卷.pdf")
```

---

## 🤖 配合 AI 大模型工作流 (AI Prompt 联动)

您无需手动编写 JSON！只需将任意杂乱题目草稿（包括微信群发过来的题目、扫描 OCR 出来的文本）发给大模型（DeepSeek、ChatGPT、Claude、Kimi 等），并附带我们提供的 Prompt 模板：

👉 **[查看 AI 结构化提取系统提示词](file:///f:/zuomian/code/antitest/exam_typesetter/ai_prompt_template.md)**

大模型会瞬间输出规范的 JSON，然后直接运行命令即可秒级出卷！

---

## 📁 目录文件结构

```text
exam_typesetter/
├── __init__.py               # 包入口
├── docx_builder.py           # 核心试卷排版生成器 (A4版式、表格、大题、选项对齐)
├── latex_omml.py             # LaTeX -> MathML -> Word 原生 OMML 转换引擎
├── converter.py              # DOCX -> 矢量 PDF 自动化导出组件 (WPS/Word COM)
├── cli.py                    # 命令行终端工具
├── ai_prompt_template.md     # 供大模型清洗杂乱试卷的 Prompt 模板
└── README.md                 # 系统详细使用手册
```
