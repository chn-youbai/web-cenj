"""
AI Structuring Parser
Transforms unorganized exam text / extracted OCR into standardized, validated exam_data JSON.
Supports DeepSeek API and Google Gemini Interactions API.
"""
import os
import re
import json
import urllib.request
import urllib.error

BUILTIN_DEEPSEEK_KEY = "sk-2d1d216cb2d249769cba218baefc7f5e"
BUILTIN_GEMINI_KEY = "AQ.Ab8RN6IuAdyz64ZtGMRt0xMIutpY4Kvm9XVkr2sS85HwK1fVBQ"

SYSTEM_PROMPT = """你是一位专业的中小学及高考理科试卷排版与题库数字化专家。
请将我提供的原始试卷文本（草稿、题库散乱内容、Word解析文本或OCR扫描识别结果），清洗并转化为符合标准试卷排版引擎要求的 JSON 格式。

### 核心转换规范与要求：
1. 数学公式与符号：
   - 所有的数学公式、变量字母（如 x, y, a, b）、数学符号（如 ∈, ⊆, ⊥, //, △, ∠）必须使用标准 LaTeX 语法表示，并用单个美元符号 $...$ 包裹（行内公式）或双美元符号 $$...$$ 包裹（独立行公式）。
   - 分数使用 \\frac{分子}{分母}，根号使用 \\sqrt{内容}，上下标使用 x^2, a_1。
2. 选择题规范：
   - 每道选择题的 4 个选项必须拆分成独立的字符串数组，形如：["A. 选项内容", "B. 选项内容", "C. 选项内容", "D. 选项内容"]。
3. 解答题预留答题高度：
   - 解答题必须包含 blank_lines 字段（整数），指示在试卷中为学生预留的书写空行数（一般小题留 4~6 行，综合大题留 8~12 行）。
4. 试题与答案必须一一对应：
   - 如果原文包含参考答案或解析，必须在 answers 列表中按题号对应输出；如果没有提供答案，answers 数组可以为空列表 []。
5. 试题附图与插图标记保留（至关重要）：
   - 如果文本中包含形如 `[IMAGE:xxx.png]` 的插图标注，请务必保留在对应题目的 `stem`（题干）或 `images` 数组中，或者答案解析 `analysis` 中，绝不可擅自丢弃或删除！
6. 输出格式：
   - 必须只输出合法的标准纯 JSON 代码块（```json ... ```），不要包含任何额外的客套话或多余解释。

### 目标 JSON 结构示例：
{
  "meta": {
    "title": "2026年普通高等学校招生全国统一考试模拟演练",
    "subject": "数学",
    "grade": "高三",
    "duration": 120,
    "total_score": 150,
    "show_score_table": true
  },
  "sections": [
    {
      "section_id": 1,
      "type": "single_choice",
      "title": "一、选择题（本大题共 4 小题，每小题 5 分，共 20 分）",
      "questions": [
        {
          "number": 1,
          "score": 5,
          "stem": "设全集 $U = \\mathbf{R}$，集合 $A = \\{x \\mid x^2 - 2x - 3 < 0\\}$，$B = \\{x \\mid x \\ge 1\\}$，则 $A \\cap (\\complement_U B) = $（　　）",
          "options": [
            "A. $(-1, 1)$",
            "B. $[-1, 1)$",
            "C. $(-1, 3)$",
            "D. $[1, 3)$"
          ],
          "layout": "cols-4"
        }
      ]
    }
  ],
  "answers": [
    {
      "number": 1,
      "answer": "A",
      "analysis": "由 $x^2 - 2x - 3 < 0$ 解得 $-1 < x < 3$，故 $A = (-1, 3)$..."
    }
  ]
}
"""

def extract_json_from_text(text: str) -> dict:
    """
    Extracts and parses JSON object from AI model response.
    """
    cleaned = text.strip()
    # 1. Match ```json ... ``` code fence
    fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', cleaned)
    if fence_match:
        try:
            return json.loads(fence_match.group(1).strip())
        except Exception:
            pass

    # 2. Match outermost { ... }
    first_brace = cleaned.find('{')
    last_brace = cleaned.rfind('}')
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace:last_brace + 1]
        try:
            return json.loads(candidate)
        except Exception:
            pass

    raise ValueError("未能从大模型回复中提取到有效的 JSON 试卷结构数据。")

def validate_and_normalize_exam_data(data: dict) -> dict:
    """
    Validates and fills default values for exam_data structure.
    """
    if not isinstance(data, dict):
        data = {}

    meta = data.setdefault("meta", {})
    meta.setdefault("title", "试卷测试")
    meta.setdefault("subject", "学科")
    meta.setdefault("grade", "高三")
    meta.setdefault("duration", 120)
    meta.setdefault("total_score", 150)
    meta.setdefault("show_score_table", True)

    sections = data.setdefault("sections", [])
    if not isinstance(sections, list):
        data["sections"] = []

    for s_idx, sec in enumerate(data["sections"]):
        sec.setdefault("section_id", s_idx + 1)
        sec.setdefault("type", "normal")
        sec.setdefault("title", f"第 {s_idx + 1} 部分")
        questions = sec.setdefault("questions", [])
        for q_idx, q in enumerate(questions):
            q.setdefault("number", q_idx + 1)
            q.setdefault("stem", "")
            if "images" in q and not isinstance(q["images"], list):
                q["images"] = [q["images"]] if q["images"] else []
            elif "images" not in q:
                q["images"] = []
            q["images"] = [
                img for img in q["images"]
                if not (isinstance(img, str) and (img.lower().startswith("data:image/wmf") or img.lower().startswith("data:image/emf") or img.lower().endswith(".wmf") or img.lower().endswith(".emf")))
            ]

            # 容错：如果 AI 将选择题选项附在题干末尾，自动提取为标准 options 数组
            if (not q.get("options") or len(q.get("options", [])) == 0) and q.get("stem"):
                stem = q["stem"]
                m_opt = re.search(r'(?:[\r\n\s]+|^)(A[\.．、\s][\s\S]+?)\s+(B[\.．、\s][\s\S]+?)\s+(C[\.．、\s][\s\S]+?)\s+(D[\.．、\s][\s\S]+)$', stem)
                if m_opt:
                    q["options"] = [m_opt.group(1).strip(), m_opt.group(2).strip(), m_opt.group(3).strip(), m_opt.group(4).strip()]
                    q["stem"] = stem[:m_opt.start()].strip()

            if "options" in q and isinstance(q["options"], list):
                if not q.get("layout"):
                    # Auto select layout based on option length
                    max_len = max([len(str(opt)) for opt in q["options"]] + [0])
                    if max_len <= 15:
                        q["layout"] = "cols-4"
                    elif max_len <= 30:
                        q["layout"] = "cols-2"
                    else:
                        q["layout"] = "cols-1"

    answers = data.setdefault("answers", [])
    if isinstance(answers, list):
        for a in answers:
            if "images" in a and not isinstance(a["images"], list):
                a["images"] = [a["images"]] if a["images"] else []
            elif "images" not in a:
                a["images"] = []
            a["images"] = [
                img for img in a["images"]
                if not (isinstance(img, str) and (img.lower().startswith("data:image/wmf") or img.lower().startswith("data:image/emf") or img.lower().endswith(".wmf") or img.lower().endswith(".emf")))
            ]

    return data

def call_deepseek_structuring(raw_text: str, api_key: str = None, model: str = "deepseek-flash") -> dict:
    """
    Calls DeepSeek API to parse raw exam text into standard exam_data JSON.
    """
    key = api_key or BUILTIN_DEEPSEEK_KEY
    url = "https://api.deepseek.com/chat/completions"
    
    # Trim to 40,000 characters to stay within context limits
    input_text = raw_text[:40000]
    payload = {
        "model": model or "deepseek-flash",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"请将以下试卷文本结构化转换为标准 JSON 格式：\n\n{input_text}"}
        ],
        "temperature": 0.1
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}"
        }
    )

    with urllib.request.urlopen(req, timeout=90) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        reply_content = res_data.get("choices", [{}])[0].get("message", {}).get("content", "")
        exam_json = extract_json_from_text(reply_content)
        return validate_and_normalize_exam_data(exam_json)

def call_gemini_structuring(raw_text: str, api_key: str = None, model: str = "gemini-3.8-flash") -> dict:
    """
    Calls Google Gemini Interactions API (strictly adhering to GEMINI.md)
    to parse raw exam text into standard exam_data JSON.
    """
    key = api_key or BUILTIN_GEMINI_KEY
    url = "https://generativelanguage.googleapis.com/v1beta/interactions"
    
    input_text = raw_text[:40000]
    full_prompt = f"{SYSTEM_PROMPT}\n\n请将以下试卷文本清洗并转换为标准 JSON 格式：\n\n{input_text}"

    payload = {
        "model": model or "gemini-3.8-flash",
        "store": False,
        "input": [
            {
                "type": "user_input",
                "content": full_prompt
            }
        ]
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": key
        }
    )

    with urllib.request.urlopen(req, timeout=90) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        steps = res_data.get("steps", [])
        model_output = next((s for s in steps if s.get("type") == "model_output"), None)
        reply_content = model_output.get("content", [{}])[0].get("text", "") if model_output else ""
        exam_json = extract_json_from_text(reply_content)
        return validate_and_normalize_exam_data(exam_json)

def structure_exam_text(raw_text: str, provider: str = "deepseek", api_key: str = None, model: str = None) -> dict:
    """
    Unified entry point to parse raw exam text into standard exam_data JSON.
    Automatically tries primary engine, with fallback.
    """
    if provider == "gemini":
        try:
            return call_gemini_structuring(raw_text, api_key=api_key, model=model or "gemini-3.8-flash")
        except Exception as e:
            print(f"[WARN] Gemini structuring failed ({e}), falling back to DeepSeek...")
            return call_deepseek_structuring(raw_text, api_key=api_key)
    else:
        try:
            return call_deepseek_structuring(raw_text, api_key=api_key, model=model or "deepseek-flash")
        except Exception as e:
            print(f"[WARN] DeepSeek structuring failed ({e}), falling back to Gemini...")
            return call_gemini_structuring(raw_text, api_key=api_key)

if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    sample_text = r"""
    2026年期末考试 高三数学试卷 满分150分 考试时间120分钟
    一、单选题（每题5分，共10分）
    1. 设集合 A={x | x^2 - 1 = 0}, B={1, 2}，则 A交B 为（ ）
    A. {1}  B. {-1}  C. {1, 2}  D. 空集
    2. 已知复数 z = 1 + i，则 |z| = ( )
    A. 1  B. \sqrt{2}  C. 2  D. 4
    二、解答题
    3. （15分）解方程 x^2 - 4x + 3 = 0。
    参考答案：
    1. A. 由题意得 A={-1, 1}，故交集为{1}。
    2. B. |z| = \sqrt{1^2 + 1^2} = \sqrt{2}。
    3. x=1 或 x=3。
    """
    print("Testing AI structuring with sample text...")
    res = structure_exam_text(sample_text)
    print("Successfully structured exam! Title:", res.get("meta", {}).get("title"))
    print("Sections count:", len(res.get("sections", [])))
    print("Answers count:", len(res.get("answers", [])))
    print(json.dumps(res, ensure_ascii=False, indent=2))
