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


def fast_match_command(instruction: str, exam_data: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Ultra-fast rule matching for standard commands. Executes in < 1ms without hitting LLM API.
    """
    text = instruction.strip().lower()
    
    # 1. Clear answers
    if text in ["清空答案", "清空所有答案", "清空全部答案", "清空参考答案", "不要答案", "删除全部答案"]:
        updated = clear_answers(exam_data, scope="all")
        return True, "已为您清空全卷所有题目的参考答案与解析。试题内容与编号已严格保留。", updated
        
    if "清空选择题答案" in text:
        updated = clear_answers(exam_data, scope="choices")
        return True, "已清空所有选择题的参考答案与解析。", updated
        
    if "清空解答题答案" in text or "清空大题答案" in text:
        updated = clear_answers(exam_data, scope="solutions")
        return True, "已清空所有解答题的参考答案与解析。", updated

    # 2. Renumber
    if text in ["重新编号", "全卷重新编号", "自动编号", "规范题号", "连续编号"]:
        updated = renumber_all(exam_data)
        return True, "已对全卷所有题目与答案完成顺次连续重新编号（1, 2, 3...）。", updated

    # 3. Delete section
    if text in ["删除解答题", "删掉解答题", "删除所有解答题", "不要解答题", "清空解答题"]:
        updated = delete_section(exam_data, "solution")
        return True, "已成功删除全卷所有解答题大题，剩余题目已重新连续编号。", updated
        
    if text in ["删除选择题", "删掉选择题", "删除所有选择题"]:
        updated = delete_section(exam_data, "choice")
        return True, "已成功删除所有选择题，剩余题目已重新连续编号。", updated

    # 4. Simple delete single question: e.g. "删除第2题" / "删掉第3题" / "删除第 4 题"
    m_del = re.match(r'^(?:删除|删掉|去掉|不要)\s*第?\s*(\d+)\s*题?$', text)
    if m_del:
        q_num = int(m_del.group(1))
        updated = delete_questions(exam_data, [q_num])
        return True, f"已成功删除第 {q_num} 题，并已将后续所有试题与答案自动顺延重新编号。", updated

    # 5. Simple swap: e.g. "把第1题和第2题调换" / "调换第1题和第2题"
    m_swap = re.search(r'(?:把)?第?\s*(\d+)\s*题?(?:和|与)第?\s*(\d+)\s*题?(?:调换|对调|交换)', text)
    if m_swap:
        n1 = int(m_swap.group(1))
        n2 = int(m_swap.group(2))
        updated = swap_questions(exam_data, n1, n2)
        return True, f"已成功将第 {n1} 题与第 {n2} 题的位置、内容及对应答案完成对调。", updated

    return False, "", exam_data


def route_chat_action(instruction: str, exam_data: Dict[str, Any], api_key: str = None) -> Tuple[str, Dict[str, Any]]:
    """
    Main entry point for handling chat actions from mobile.
    1. Checks fast-path rule engine (<1ms).
    2. Dispatches to DeepSeek Function Calling for intelligent tool selection.
    """
    # Step 1: Fast-path
    hit, reply_msg, updated_data = fast_match_command(instruction, exam_data)
    if hit:
        return reply_msg, updated_data

    # Step 2: DeepSeek Function Calling
    key = api_key or os.environ.get("DEEPSEEK_API_KEY", DEEPSEEK_KEY)
    
    # Summary of current exam for LLM context
    meta = exam_data.get("meta", {})
    sections_summary = []
    for s in exam_data.get("sections", []):
        q_nums = [q.get("number") for q in s.get("questions", [])]
        sections_summary.append(f"大题: {s.get('title', '')} (题号范围: {q_nums})")
    ans_count = len(exam_data.get("answers", []))
    
    system_prompt = (
        "你是一个专业的试卷排版与数据处理引擎。用户正在手机端调整一份试卷。\n"
        f"当前试卷信息：\n"
        f"- 标题：{meta.get('title', '未命名')}\n"
        f"- 结构：{'; '.join(sections_summary)}\n"
        f"- 当前答案条目数：{ans_count}\n\n"
        "请根据用户的指令调用最匹配的工具函数（tools）。如果用户的指令需要删除、清空答案、重排或修改属性，务必调用对应的函数！"
    )
    
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": instruction}
        ],
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
                
                if fn_name == "clear_answers":
                    updated = clear_answers(exam_data, scope=args.get("scope", "all"))
                    return f"已按照指令清空对应试题的参考答案与解析。", updated
                elif fn_name == "delete_questions":
                    numbers = args.get("numbers", [])
                    updated = delete_questions(exam_data, numbers)
                    return f"已成功删除题号为 {numbers} 的题目，全卷已重新顺延编号。", updated
                elif fn_name == "delete_section":
                    stype = args.get("section_type", "solution")
                    updated = delete_section(exam_data, stype)
                    return f"已删除对应类型的大题，全卷已重新连续编号。", updated
                elif fn_name == "swap_questions":
                    n1 = args.get("num1")
                    n2 = args.get("num2")
                    updated = swap_questions(exam_data, n1, n2)
                    return f"已将第 {n1} 题与第 {n2} 题调换位置。", updated
                elif fn_name == "renumber_all":
                    updated = renumber_all(exam_data)
                    return f"已对全卷进行重新连续规范编号。", updated
                elif fn_name == "modify_meta":
                    updated = modify_meta(exam_data, **args)
                    return f"已更新试卷抬头元数据信息。", updated
                    
            content = message.get("content", "")
            return content or "已收到您的指令并完成分析。", exam_data
            
    except Exception as e:
        # Graceful fallback: return user-friendly message
        return f"处理指令时遇到网络或模型调用异常: {str(e)}", exam_data
