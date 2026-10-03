"""
Agent Tools Module
Provides deterministic Python operations for manipulating exam_data structures.
Guarantees 100% precision, zero hallucination, and strict 1:1 question-answer synchronization.
"""
from typing import Dict, Any, List, Optional
import copy


def renumber_all(exam_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Renumber all questions across all sections sequentially (1, 2, 3...).
    Synchronously updates answers array to maintain strict 1:1 binding.
    """
    data = copy.deepcopy(exam_data)
    sections = data.get("sections", [])
    answers = data.get("answers", [])
    
    curr_num = 1
    num_map = {}  # old_num -> new_num
    
    for sec in sections:
        for q in sec.get("questions", []):
            old_num = q.get("number")
            q["number"] = curr_num
            if old_num is not None:
                num_map[old_num] = curr_num
            curr_num += 1
            
    # Sync answers
    new_answers = []
    for ans in answers:
        old_ans_num = ans.get("number")
        if old_ans_num in num_map:
            ans["number"] = num_map[old_ans_num]
            new_answers.append(ans)
    
    # Sort answers by number
    new_answers.sort(key=lambda a: a.get("number", 0))
    data["answers"] = new_answers
    
    # Clean up empty sections
    data["sections"] = [s for s in sections if len(s.get("questions", [])) > 0]
    for idx, s in enumerate(data["sections"], start=1):
        s["section_id"] = idx
        
    return data


def clear_answers(exam_data: Dict[str, Any], scope: str = "all") -> Dict[str, Any]:
    """
    Clear reference answers and explanations.
    scope:
      - 'all': Clears all answers and analysis.
      - 'choices': Clears only multiple choice answers.
      - 'blanks': Clears fill-in-the-blank answers.
      - 'solutions': Clears subjective/solution answers.
    """
    data = copy.deepcopy(exam_data)
    scope = scope.lower().strip()
    
    if scope == "all":
        data["answers"] = []
        return data
        
    # Categorize questions by type
    choice_nums = set()
    blank_nums = set()
    solution_nums = set()
    
    for sec in data.get("sections", []):
        sec_type = sec.get("type", "").lower()
        for q in sec.get("questions", []):
            q_num = q.get("number")
            if "choice" in sec_type:
                choice_nums.add(q_num)
            elif "blank" in sec_type or "fill" in sec_type:
                blank_nums.add(q_num)
            else:
                solution_nums.add(q_num)
                
    target_nums = set()
    if scope in ["choice", "choices", "single_choice", "multiple_choice"]:
        target_nums = choice_nums
    elif scope in ["blank", "blanks", "fill_blank"]:
        target_nums = blank_nums
    elif scope in ["solution", "solutions", "subjective"]:
        target_nums = solution_nums
    else:
        # Default fallback to all if unknown
        target_nums = choice_nums | blank_nums | solution_nums

    new_answers = []
    for ans in data.get("answers", []):
        if ans.get("number") not in target_nums:
            new_answers.append(ans)
            
    data["answers"] = new_answers
    return data


def clear_all_content(exam_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clears all sections, questions, and reference answers from the exam.
    Preserves meta structure (title, subject, duration, total_score).
    """
    data = copy.deepcopy(exam_data)
    data["sections"] = []
    data["answers"] = []
    return data


def delete_answers_by_numbers(exam_data: Dict[str, Any], numbers: List[int]) -> Dict[str, Any]:
    """
    Deletes reference answers for specified question numbers without deleting questions.
    """
    data = copy.deepcopy(exam_data)
    target_set = set(int(n) for n in numbers)
    data["answers"] = [a for a in data.get("answers", []) if a.get("number") not in target_set]
    return data


def delete_questions(exam_data: Dict[str, Any], numbers: List[int]) -> Dict[str, Any]:
    """
    Deletes specified questions by question numbers.
    Synchronously deletes corresponding answers and re-numbers all remaining questions.
    """
    data = copy.deepcopy(exam_data)
    target_set = set(int(n) for n in numbers)
    
    for sec in data.get("sections", []):
        sec["questions"] = [q for q in sec.get("questions", []) if q.get("number") not in target_set]
        
    data["answers"] = [a for a in data.get("answers", []) if a.get("number") not in target_set]
    
    return renumber_all(data)


def delete_section(exam_data: Dict[str, Any], section_type_or_id: Any) -> Dict[str, Any]:
    """
    Deletes an entire section by type ('single_choice', 'blank', 'solution') or section_id.
    """
    data = copy.deepcopy(exam_data)
    match_val = str(section_type_or_id).lower().strip()
    
    kept_sections = []
    for sec in data.get("sections", []):
        sec_id = str(sec.get("section_id", ""))
        sec_type = str(sec.get("type", "")).lower()
        sec_title = str(sec.get("title", "")).lower()
        
        # Check if match
        is_match = (
            sec_id == match_val or
            sec_type == match_val or
            match_val in sec_type or
            match_val in sec_title
        )
        if not is_match:
            kept_sections.append(sec)
            
    data["sections"] = kept_sections
    return renumber_all(data)


def swap_questions(exam_data: Dict[str, Any], num1: int, num2: int) -> Dict[str, Any]:
    """
    Swaps two questions and their corresponding answers.
    """
    data = copy.deepcopy(exam_data)
    num1, num2 = int(num1), int(num2)
    
    # Locate questions
    q1, q2 = None, None
    for sec in data.get("sections", []):
        for q in sec.get("questions", []):
            if q.get("number") == num1:
                q1 = q
            elif q.get("number") == num2:
                q2 = q
                
    if q1 and q2:
        # Swap contents except the number attribute
        fields_to_swap = ["stem", "options", "score", "layout", "blank_lines"]
        for f in fields_to_swap:
            val1 = q1.get(f)
            val2 = q2.get(f)
            if val2 is not None:
                q1[f] = val2
            elif f in q1:
                del q1[f]
            if val1 is not None:
                q2[f] = val1
            elif f in q2:
                del q2[f]

    # Swap answers
    ans1, ans2 = None, None
    for a in data.get("answers", []):
        if a.get("number") == num1:
            ans1 = a
        elif a.get("number") == num2:
            ans2 = a
            
    if ans1 and ans2:
        ans1["answer"], ans2["answer"] = ans2.get("answer", ""), ans1.get("answer", "")
        ans1["analysis"], ans2["analysis"] = ans2.get("analysis", ""), ans1.get("analysis", "")
    elif ans1 and not ans2:
        ans1["number"] = num2
    elif ans2 and not ans1:
        ans2["number"] = num1
        
    return data


def modify_meta(exam_data: Dict[str, Any], **kwargs) -> Dict[str, Any]:
    """
    Modifies exam meta header fields (title, subject, grade, duration, total_score, show_score_table).
    """
    data = copy.deepcopy(exam_data)
    if "meta" not in data:
        data["meta"] = {}
        
    meta = data["meta"]
    for k, v in kwargs.items():
        if v is not None:
            if k == "total_score" or k == "duration":
                try:
                    meta[k] = int(v)
                except Exception:
                    meta[k] = v
            elif k == "show_score_table":
                meta[k] = bool(v)
            else:
                meta[k] = str(v)
    return data


def modify_question(
    exam_data: Dict[str, Any],
    number: int,
    stem: Optional[str] = None,
    options: Optional[List[str]] = None,
    score: Optional[int] = None,
    answer: Optional[str] = None,
    analysis: Optional[str] = None,
    blank_lines: Optional[int] = None
) -> Dict[str, Any]:
    """
    Modifies stem, options, score, answer or analysis for a specific question number.
    """
    data = copy.deepcopy(exam_data)
    num = int(number)
    
    # Update question
    for sec in data.get("sections", []):
        for q in sec.get("questions", []):
            if q.get("number") == num:
                if stem is not None:
                    q["stem"] = stem
                if options is not None:
                    q["options"] = options
                if score is not None:
                    q["score"] = int(score)
                if blank_lines is not None:
                    q["blank_lines"] = int(blank_lines)
                break
                
    # Update or add answer
    if answer is not None or analysis is not None:
        answers = data.setdefault("answers", [])
        found_ans = False
        for a in answers:
            if a.get("number") == num:
                if answer is not None:
                    a["answer"] = answer
                if analysis is not None:
                    a["analysis"] = analysis
                found_ans = True
                break
        if not found_ans and (answer is not None or analysis is not None):
            answers.append({
                "number": num,
                "answer": answer or "",
                "analysis": analysis or ""
            })
            answers.sort(key=lambda a: a.get("number", 0))
            
    return data
