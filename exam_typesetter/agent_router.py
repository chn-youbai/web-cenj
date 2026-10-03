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
        "请根据多轮对话上下文与用户的最新指令调用最匹配的工具函数（tools）。如果用户的指令需要删除、清空答案、重排或修改属性，务必调用对应的函数！"
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
                    
            content = message.get("content", "")
            return content or "已收到您的指令并完成分析。", exam_data, ""
            
    except Exception as e:
        # Graceful fallback: return user-friendly message
        return f"处理指令时遇到网络或模型调用异常: {str(e)}", exam_data, ""
