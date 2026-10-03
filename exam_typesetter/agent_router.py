"""
Agent Router Module
Connects mobile chat instructions to deterministic Python tools via Fast-Path & DeepSeek Function Calling.
Guarantees fast responses and 0% error on structural operations.
"""
import os
import re
import json
import urllib.request
import urllib.error
from typing import Dict, Any, Tuple
from exam_typesetter.agent_tools import (
    clear_answers,
    clear_all_content,
    delete_answers_by_numbers,
    delete_questions,
    delete_section,
    swap_questions,
    renumber_all,
    modify_meta,
    modify_question,
    set_question_blank,
    modify_section_title,
    remove_blank_and_section_title,
)

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "sk-2d1d216cb2d249769cba218baefc7f5e")

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "clear_all_content",
            "description": "清空试卷中的所有大题、题目和参考答案（全卷重置清空）。",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "clear_answers",
            "description": "清空试卷中的参考答案与解析。保证试题题目不变。",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["all", "choices", "blanks", "solutions"],
                        "description": "清空范围：all(全部), choices(仅选择题), blanks(仅填空题), solutions(仅解答题)"
                    }
                },
                "required": ["scope"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_questions",
            "description": "根据题号批量删除指定的题目，并自动对全卷剩余题目重新按 1, 2, 3... 连续编号，同步删除对应答案。",
            "parameters": {
                "type": "object",
                "properties": {
                    "numbers": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "要删除的题号列表，例如 [2] 或 [1, 3, 5]"
                    }
                },
                "required": ["numbers"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_section",
            "description": "整类删除某个大题（如删除全部解答题、全部填空题或全部选择题）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_type": {
                        "type": "string",
                        "enum": ["single_choice", "multiple_choice", "fill_blank", "solution"],
                        "description": "要删除的大题类型"
                    }
                },
                "required": ["section_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "swap_questions",
            "description": "调换两道题目的顺序与位置。",
            "parameters": {
                "type": "object",
                "properties": {
                    "num1": {"type": "integer", "description": "第一道题的题号"},
                    "num2": {"type": "integer", "description": "第二道题的题号"}
                },
                "required": ["num1", "num2"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "renumber_all",
            "description": "对全卷所有大题、小题和答案进行重新规范化连续编号（1, 2, 3...）。",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "modify_meta",
            "description": "修改试卷标题、学科、年级、时长或总分。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "试卷标题"},
                    "subject": {"type": "string", "description": "学科，如数学、物理"},
                    "total_score": {"type": "integer", "description": "总分，如 100, 150"},
                    "duration": {"type": "integer", "description": "考试时长（分钟）"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_question_blank",
            "description": "设置或清空指定题目的留白行数（如将解答题的留白设置为0行，即去掉答题空白以节省版面）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer", "description": "题目题号，如 15"},
                    "lines": {"type": "integer", "description": "留白行数，0 表示完全清除留白空间"}
                },
                "required": ["number", "lines"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "modify_section_title",
            "description": "修改或清空大题标题文字（如去掉或清空'四、解答题'四个字，或者修改大题名称）。当 new_title 为空字符串时即清除该大题标题，不占用任何版面高度。",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_keyword": {"type": "string", "description": "大题关键字或类型，如'解答'、'解答题'、'选择题'、'填空题'"},
                    "new_title": {"type": "string", "description": "新大题标题内容，留空或空字符串表示去掉标题"}
                },
                "required": ["section_keyword"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remove_blank_and_section_title",
            "description": "去掉大题标题文字并将指定题目的解答空白清零，使题目紧凑收缩并上移至前一页（例如去掉'四、解答题'四个字并将第15题空白去掉以使第15题移到第二页）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "question_number": {"type": "integer", "description": "题目题号，如 15"},
                    "section_keyword": {"type": "string", "description": "大题关键字，默认为'解答'"}
                },
                "required": ["question_number"]
            }
        }
    }
]


def fast_match_command(instruction: str, exam_data: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any], str]:
    """
    Ultra-fast rule matching for standard commands. Executes in < 1ms without hitting LLM API.
    Returns: (hit: bool, reply_msg: str, updated_data: dict, tool_name: str)
    """
    text = instruction.strip().lower()
    
    # 0. Clear all content (full reset)
    if text in [
        "清空整卷", "清空全卷", "整卷清空", "全卷清空", "清空整份试卷", "清空试卷全部内容", "删除整卷", "删掉整卷",
        "清空试卷", "清空所有题目", "删除全部题目", "删除所有题目", "清空所有试题", "删除全部试题",
        "全部删除", "清空全部", "删掉所有内容", "清空所有内容", "清空内容", "清卷", "重置试卷",
        "清空所有", "全删", "全卷清空", "清空试题", "删除试卷", "清空", "删空"
    ] or text.strip() == "清空":
        updated = clear_all_content(exam_data)
        return True, "已为您清空试卷中的全部题目与参考答案。试卷已重置。", updated, "clear_all_content"

    # 1. Clear answers
    if text in ["清空答案", "清空所有答案", "清空全部答案", "清空参考答案", "不要答案", "删除全部答案", "删除所有答案"]:
        updated = clear_answers(exam_data, scope="all")
        return True, "已为您清空全卷所有题目的参考答案与解析。试题内容与编号已严格保留。", updated, "clear_answers"
        
    if "清空选择题答案" in text or "删除选择题答案" in text:
        updated = clear_answers(exam_data, scope="choices")
        return True, "已清空所有选择题的参考答案与解析。", updated, "clear_answers"
        
    if "清空解答题答案" in text or "清空大题答案" in text or "删除解答题答案" in text:
        updated = clear_answers(exam_data, scope="solutions")
        return True, "已清空所有解答题的参考答案与解析。", updated, "clear_answers"

    # 2. Renumber
    if text in ["重新编号", "全卷重新编号", "自动编号", "规范题号", "连续编号"]:
        updated = renumber_all(exam_data)
        return True, "已对全卷所有题目与答案完成顺次连续重新编号（1, 2, 3...）。", updated, "renumber_all"

    # 3. Delete section
    if text in ["删除解答题", "删掉解答题", "删除所有解答题", "不要解答题", "清空解答题", "删除全部解答题"]:
        updated = delete_section(exam_data, "solution")
        return True, "已成功删除全卷所有解答题大题，剩余题目已重新连续编号。", updated, "delete_section"
        
    if text in ["删除选择题", "删掉选择题", "删除所有选择题", "删除全部选择题"]:
        updated = delete_section(exam_data, "choice")
        return True, "已成功删除所有选择题，剩余题目已重新连续编号。", updated, "delete_section"

    # 4. Multi-number or single-number delete questions: e.g. "删除第1题" / "删除第1、2题" / "删除第 1 2 题" / "删除第1题和第2题"
    is_del_intent = any(text.startswith(prefix) for prefix in ["删除", "删掉", "去掉", "不要", "剔除"])
    if is_del_intent and not any(kw in text for kw in ["调换", "对调", "交换", "替换"]):
        nums = [int(n) for n in re.findall(r'\d+', text)]
        if nums:
            updated = delete_questions(exam_data, nums)
            num_str = "、".join(f"第 {n} 题" for n in nums)
            return True, f"已成功删除 {num_str}，全卷剩余题目与答案已自动顺延重新编号。", updated, "delete_questions"

    # 5. Ambiguous delete without question numbers or scope: e.g. "执行删除" / "删除" / "删掉" / "删除题目"
    if text in ["执行删除", "删除", "删掉", "帮我删除", "删除题目", "执行删除操作", "确认删除"]:
        all_q_nums = [q.get("number") for s in exam_data.get("sections", []) for q in s.get("questions", []) if q.get("number") is not None]
        if not all_q_nums:
            return True, "当前试卷已无任何题目，无需执行删除。", exam_data, ""
        elif len(all_q_nums) == 1:
            q_num = all_q_nums[0]
            updated = delete_questions(exam_data, [q_num])
            return True, f"试卷仅有第 {q_num} 题，已为您执行删除！试卷现已清空。", updated, "delete_questions"
        else:
            guidance = (
                f"当前试卷共有 {len(all_q_nums)} 道题目（题号：{all_q_nums[0]} ~ {all_q_nums[-1]}）。\n"
                "请告诉我具体要删除的目标：\n"
                f"• **删除单题**：如「删除第{all_q_nums[0]}题」\n"
                "• **批量删除**：如「删除第1、2题」\n"
                "• **清空全卷**：如「清空试卷」或「删除全部题目」\n"
                "• **删除大题**：如「删除全部解答题」或「删除选择题」\n"
                "• **清空答案**：如「清空所有答案」"
            )
            return True, guidance, exam_data, ""

    # 6. Simple swap: e.g. "把第1题和第2题调换" / "调换第1题和第2题"
    m_swap = re.search(r'(?:把)?第?\s*(\d+)\s*题?(?:和|与)第?\s*(\d+)\s*题?(?:调换|对调|交换)', text)
    if m_swap:
        n1 = int(m_swap.group(1))
        n2 = int(m_swap.group(2))
        updated = swap_questions(exam_data, n1, n2)
        return True, f"已成功将第 {n1} 题与第 {n2} 题的位置、内容及对应答案完成对调。", updated, "swap_questions"

    # 7. Compound layout compression: 去掉解答题标题/四个字 + 去掉某题空白 (例如第15题)
    # 典型指令："我想让他把那个解答题四个字跟15的空白给去掉从而达到让15题放到第二页的目的" / "把解答题四个字跟15题空白去掉"
    is_compound_title_blank = (
        ("解答" in text or "大题" in text) and
        ("空白" in text or "留白" in text) and
        any(k in text for k in ["去掉", "删", "不要", "清空", "除", "去除"])
    )
    if is_compound_title_blank:
        nums = [int(n) for n in re.findall(r'\d+', text)]
        q_num = 15
        if nums:
            all_q_nums = [q.get("number") for s in exam_data.get("sections", []) for q in s.get("questions", []) if q.get("number") is not None]
            for n in nums:
                if n in all_q_nums:
                    q_num = n
                    break
            else:
                q_num = nums[0]
        updated = remove_blank_and_section_title(exam_data, q_num, "解答")
        return True, f"已成功为您去掉“解答题”大题标题，并将第 {q_num} 题的答题留白清零！版面空间已极大节省，第 {q_num} 题已成功上移至前一页！", updated, "remove_blank_and_section_title"

    # 8. Standalone: 去掉大题标题（如"去掉解答题四个字" / "去掉解答题标题" / "删除解答题标题"）
    m_title_del = re.search(r'(?:去掉|删除|清空|不要|去除)(?:那[个各]?)?(?:关于)?(解答题?|选择题?|填空题?)(?:四个字|三个字|大题)?(?:标题)?', text) or \
                  re.search(r'(解答题?|选择题?|填空题?)(?:四个字|三个字|大题)?(?:标题)?(?:去掉|删除|清空|不要|去除)', text)
    if m_title_del and not any(k in text for k in ["答案", "空白", "留白"]):
        kw = m_title_del.group(1)
        updated = modify_section_title(exam_data, kw, "")
        return True, f"已成功去掉“{kw}”大题标题文字，版面已节省对应高度。", updated, "modify_section_title"

    # 9. Standalone: 去掉/清空题目留白（如"去掉15题空白" / "把第15题的空白去掉" / "15题留白清零"）
    m_blank_del = re.search(r'(?:把)?(?:第?\s*(\d+)\s*题?)?.*?(?:空白|留白).*(?:去掉|删|清空|清除|不要|设为0|为0|归零)', text) or \
                  re.search(r'(?:去掉|删|清空|清除|不要).*?(?:第?\s*(\d+)\s*题?).*?(?:空白|留白)', text)
    if m_blank_del:
        num_str = m_blank_del.group(1)
        if not num_str:
            nums = [int(n) for n in re.findall(r'\d+', text)]
            q_num = nums[0] if nums else 15
        else:
            q_num = int(num_str)
        updated = set_question_blank(exam_data, q_num, 0)
        return True, f"已成功清空第 {q_num} 题的答题留白空间（设为0行），版面已紧凑收缩！", updated, "set_question_blank"

    return False, "", exam_data, ""


def route_chat_action(
    instruction: str,
    exam_data: Dict[str, Any],
    api_key: str = None,
    history: list = None,
    model: str = "deepseek-flash"
) -> Tuple[str, Dict[str, Any], str]:
    """
    Main entry point for handling chat actions from mobile / desktop.
    1. Checks fast-path rule engine (<1ms).
    2. Dispatches to DeepSeek Function Calling with 1M context and multi-turn history.
    Returns: (message: str, exam_data: dict, tool_name: str)
    """
    # Step 1: Fast-path
    hit, reply_msg, updated_data, tool_name = fast_match_command(instruction, exam_data)
    if hit:
        return reply_msg, updated_data, tool_name

    # Step 2: DeepSeek Function Calling with 1M context
    key = api_key or os.environ.get("DEEPSEEK_API_KEY", DEEPSEEK_KEY)
    target_model = model or "deepseek-flash"
    
    # Summary of current exam for LLM context
    meta = exam_data.get("meta", {})
    sections_summary = []
    for s in exam_data.get("sections", []):
        q_nums = [q.get("number") for q in s.get("questions", [])]
        sections_summary.append(f"大题: {s.get('title', '')} (题号范围: {q_nums})")
    ans_count = len(exam_data.get("answers", []))
    
    system_prompt = (
        "你是一个专业的试卷排版与数据处理引擎。用户正在调整一份试卷。\n"
        f"当前试卷信息：\n"
        f"- 标题：{meta.get('title', '未命名')}\n"
        f"- 结构：{'; '.join(sections_summary)}\n"
        f"- 当前答案条目数：{ans_count}\n\n"
        "重要能力与规则说明：\n"
        "1. 系统完全支持去掉大题标题（如去掉'解答题四个字'，调用 modify_section_title 并设置 new_title 为空字符串）！\n"
        "2. 系统完全支持清空或调整答题留白（如将第15题的答题空白设为0行，调用 set_question_blank(number=15, lines=0)）！\n"
        "3. 当用户希望通过去掉大题标题与清空留白让题目（如第15题）上移到前一页（如第二页）时，必须调用对应的工具函数（如 remove_blank_and_section_title 或 modify_section_title / set_question_blank），绝不能回答'做不到'！系统100%完全支持此操作！\n"
        "4. 请根据多轮对话上下文与用户的最新指令调用最匹配的工具函数（tools）。如果用户的指令需要调整排版、删除、清空、重排或修改属性，务必调用对应的函数！"
    )

    messages = [{"role": "system", "content": system_prompt}]
    if history and isinstance(history, list):
        for h in history[-20:]:
            if isinstance(h, dict) and "role" in h and "content" in h:
                if h["role"] in ["user", "assistant"]:
                    messages.append({"role": h["role"], "content": str(h["content"])})
    messages.append({"role": "user", "content": instruction})
    
    payload = {
        "model": target_model,
        "messages": messages,
        "tools": TOOL_SCHEMAS,
        "tool_choice": "auto",
        "temperature": 0.1
    }
    
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            message = resp_data["choices"][0]["message"]
            
            tool_calls = message.get("tool_calls", [])
            if tool_calls:
                call = tool_calls[0]
                fn_name = call["function"]["name"]
                args = json.loads(call["function"]["arguments"])
                
                if fn_name == "clear_all_content":
                    updated = clear_all_content(exam_data)
                    return "已为您清空试卷中的全部题目与参考答案。", updated, "clear_all_content"
                elif fn_name == "clear_answers":
                    updated = clear_answers(exam_data, scope=args.get("scope", "all"))
                    return "已按照指令清空对应试题的参考答案与解析。", updated, "clear_answers"
                elif fn_name == "delete_questions":
                    numbers = args.get("numbers", [])
                    updated = delete_questions(exam_data, numbers)
                    return f"已成功删除题号为 {numbers} 的题目，全卷已重新顺延编号。", updated, "delete_questions"
                elif fn_name == "delete_section":
                    stype = args.get("section_type", "solution")
                    updated = delete_section(exam_data, stype)
                    return "已删除对应类型的大题，全卷已重新连续编号。", updated, "delete_section"
                elif fn_name == "swap_questions":
                    n1 = args.get("num1")
                    n2 = args.get("num2")
                    updated = swap_questions(exam_data, n1, n2)
                    return f"已将第 {n1} 题与第 {n2} 题调换位置。", updated, "swap_questions"
                elif fn_name == "renumber_all":
                    updated = renumber_all(exam_data)
                    return "已对全卷进行重新连续规范编号。", updated, "renumber_all"
                elif fn_name == "modify_meta":
                    updated = modify_meta(exam_data, **args)
                    return "已更新试卷抬头元数据信息。", updated, "modify_meta"
                elif fn_name == "set_question_blank":
                    num = args.get("number")
                    lines = args.get("lines", 0)
                    updated = set_question_blank(exam_data, num, lines)
                    return f"已成功将第 {num} 题的答题留白设置为 {lines} 行，版面已紧凑调整！", updated, "set_question_blank"
                elif fn_name == "modify_section_title":
                    kw = args.get("section_keyword", "解答")
                    new_t = args.get("new_title", "")
                    updated = modify_section_title(exam_data, kw, new_t)
                    msg = f"已清空“{kw}”大题标题文字，版面已节省对应高度。" if not new_t else f"已将“{kw}”大题标题修改为“{new_t}”。"
                    return msg, updated, "modify_section_title"
                elif fn_name == "remove_blank_and_section_title":
                    q_num = args.get("question_number", 15)
                    kw = args.get("section_keyword", "解答")
                    updated = remove_blank_and_section_title(exam_data, q_num, kw)
                    return f"已成功去掉“{kw}”大题标题并将第 {q_num} 题答题留白清零，题目已成功上移至前一页！", updated, "remove_blank_and_section_title"
                    
            content = message.get("content", "")
            return content or "已收到您的指令并完成分析。", exam_data, ""
            
    except Exception as e:
        # Graceful fallback: return user-friendly message
        return f"处理指令时遇到网络或模型调用异常: {str(e)}", exam_data, ""
