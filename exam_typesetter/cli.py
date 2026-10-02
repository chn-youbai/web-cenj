"""
Command Line Interface for Exam Typesetter
Usage:
    python -m exam_typesetter.cli sample_exam.json -o exam.docx --pdf
"""
import os
import sys
import json
import argparse
from .docx_builder import ExamDocxBuilder
from .converter import docx_to_pdf

def main():
    parser = argparse.ArgumentParser(description="AI 智能理科试卷排版工具 (DOCX & PDF)")
    parser.add_argument("input_json", help="输入的试卷结构化 JSON 文件路径")
    parser.add_argument("-o", "--output", help="输出的 docx 文件路径（默认为输入文件名.docx）", default=None)
    parser.add_argument("--pdf", action="store_true", help="同时导出高质量 PDF 文件")

    args = parser.parse_args()

    if not os.path.exists(args.input_json):
        print(f"[ERROR] 文件不存在: {args.input_json}", file=sys.stderr)
        sys.exit(1)

    with open(args.input_json, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"[ERROR] JSON 解析失败: {e}", file=sys.stderr)
            sys.exit(1)

    base_name = os.path.splitext(args.input_json)[0]
    docx_path = args.output if args.output else f"{base_name}.docx"
    pdf_path = f"{os.path.splitext(docx_path)[0]}.pdf"

    print(f"[*] 正在排版试卷: {args.input_json} ...")
    builder = ExamDocxBuilder(data)
    builder.build(docx_path)
    print(f"[SUCCESS] 试卷已生成: {docx_path}")

    if args.pdf:
        print("[*] 正在导出高清 PDF ...")
        success = docx_to_pdf(docx_path, pdf_path)
        if success:
            print(f"[SUCCESS] PDF 导出成功: {pdf_path}")
        else:
            print(f"[WARN] PDF 导出失败，请手动在 Word/WPS 中另存为 PDF")

if __name__ == "__main__":
    main()
