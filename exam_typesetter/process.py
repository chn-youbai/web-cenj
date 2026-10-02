"""
Full Pipeline CLI Tool for Exam Processing
Usage:
    python -m exam_typesetter.process my_raw_exam.docx -o typeset_exam.docx --pdf
"""
import os
import sys
import json
import argparse

from .doc_parser import parse_docx
from .pdf_parser import parse_pdf
from .ai_parser import structure_exam_text
from .docx_builder import ExamDocxBuilder
from .converter import docx_to_pdf

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="AI 试卷自动化排版流水线：从草稿/扫描件一键生成标准可编辑 Word 与矢量 PDF")
    parser.add_argument("input_file", help="待处理的输入文档路径 (.docx / .pdf / .txt / .json)")
    parser.add_argument("-o", "--output", default="typeset_exam.docx", help="生成的输出 Word 试卷路径 (默认: typeset_exam.docx)")
    parser.add_argument("--pdf", action="store_true", help="同时使用本地 WPS/Office COM 导出高清矢量 PDF")
    parser.add_argument("--save-json", help="将 AI 结构化后的试卷数据保存为 JSON 文件")
    parser.add_argument("--provider", default="deepseek", choices=["deepseek", "gemini"], help="AI 结构化解析引擎")
    parser.add_argument("--api-key", help="自定义大模型 API Key (若不填则使用内置 Key)")
    parser.add_argument("--model", help="指定大模型名称")

    args = parser.parse_args()

    input_path = os.path.abspath(args.input_file)
    if not os.path.exists(input_path):
        print(f"[ERROR] 输入文件不存在: {input_path}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("📝 AI 试卷自动化排版全流程正在运行...")
    print("=" * 60)

    # 1. 深度解析提取
    ext = os.path.splitext(input_path)[1].lower()
    if ext == ".docx":
        print(f"[*] 正在从 Word 文档深度提取题干、OMML 原生公式与表格...")
        doc_res = parse_docx(input_path)
        raw_text = doc_res["full_text"]
        print(f"    -> 成功提取 {doc_res['paragraph_count']} 个段落/题块，{doc_res['image_count']} 张题图。")
    elif ext == ".pdf":
        print(f"[*] 正在使用 PyMuPDF 提取 PDF 页面与文字排版...")
        pdf_res = parse_pdf(input_path)
        raw_text = pdf_res["full_text"]
        print(f"    -> 成功提取 {pdf_res['page_count']} 页，{len(pdf_res['paragraphs'])} 个文本块。")
    elif ext == ".json":
        print(f"[*] 直接读取现成试卷 JSON 数据...")
        with open(input_path, "r", encoding="utf-8") as f:
            exam_data = json.load(f)
        raw_text = ""
    else:
        print(f"[*] 读取纯文本试卷草稿...")
        with open(input_path, "r", encoding="utf-8", errors="ignore") as f:
            raw_text = f.read()

    # 2. AI 智能结构化
    if raw_text:
        print(f"[*] 正在调用 {args.provider.upper()} 深度推理大脑进行题型划分与试卷结构化...")
        exam_data = structure_exam_text(
            raw_text,
            provider=args.provider,
            api_key=args.api_key,
            model=args.model
        )
        print(f"    -> 结构化完成！试卷名称: 《{exam_data.get('meta', {}).get('title')}》")
        print(f"    -> 大题数量: {len(exam_data.get('sections', []))}，参考答案数量: {len(exam_data.get('answers', []))}")

    # 保存中间 JSON（若指定）
    if args.save_json:
        with open(args.save_json, "w", encoding="utf-8") as f:
            json.dump(exam_data, f, ensure_ascii=False, indent=2)
        print(f"[+] 试卷中间 JSON 已保存至: {args.save_json}")

    # 3. 动态渲染标准 Word 试卷
    print(f"[*] 正在使用 ExamDocxBuilder 编译国家标准 A4 试卷并嵌入原生 OMML 公式...")
    output_docx = os.path.abspath(args.output)
    builder = ExamDocxBuilder(exam_data)
    builder.build(output_docx)
    print(f"[SUCCESS] 标准 Word 试卷已生成: {output_docx}")

    # 4. 导出 PDF
    if args.pdf:
        output_pdf = os.path.splitext(output_docx)[0] + ".pdf"
        print(f"[*] 正在调用本地办公软件自动化导出矢量 PDF...")
        ok = docx_to_pdf(output_docx, output_pdf)
        if ok and os.path.exists(output_pdf):
            print(f"[SUCCESS] 矢量打印级 PDF 已生成: {output_pdf}")
        else:
            print(f"[WARN] PDF 导出未完成，您可以直接使用 Word/WPS 打开 {output_docx} 并另存为 PDF。")

    print("=" * 60)
    print("🎉 全部排版流水线处理完成！")
    print("=" * 60)

if __name__ == "__main__":
    main()
