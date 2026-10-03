"""
Exam Paper DOCX Builder
Transforms structured Exam JSON into a standardized, professionally typeset Word document.
"""
import docx
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls
from .latex_omml import append_text_with_math

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Sets cell padding in twips (1/20th of a pt)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def clear_cell_borders(cell):
    """Removes all borders from a table cell."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for border_name in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        node = OxmlElement(f'w:{border_name}')
        node.set(qn('w:val'), 'none')
        tcBorders.append(node)
    tcPr.append(tcBorders)

def set_table_borders(table, color="000000", sz="4", val="single"):
    """Applies borders to the entire table."""
    tblPr = table._tbl.tblPr
    tblBorders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(tblBorders)

class ExamDocxBuilder:
    def __init__(self, exam_data: dict):
        self.data = exam_data
        self.doc = docx.Document()
        self.setup_page()

    def setup_page(self):
        """Sets standard A4 paper size and educational document margins."""
        section = self.doc.sections[0]
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.0)

    def build(self, output_path: str):
        meta = self.data.get("meta", {})

        # 1. 试卷卷头
        self.render_header(meta)

        # 2. 考生信息与统分表 (按需求完全去除无用表头)
        if meta.get("show_student_info", False):
            self.render_student_info(meta)

        if meta.get("show_score_table", False):
            sections = self.data.get("sections", [])
            self.render_score_table(sections)

        # 4. 各大题渲染
        for sec in self.data.get("sections", []):
            self.render_section(sec)

        # 5. 参考答案（可选）
        answers = self.data.get("answers", [])
        if answers:
            self.render_answers(answers)

        self.doc.save(output_path)
        return output_path

    def render_header(self, meta: dict):
        # 卷名 (学校/大考名称)
        title = meta.get("title", "试卷")
        p_title = self.doc.add_paragraph()
        p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_title.paragraph_format.space_before = Pt(0)
        p_title.paragraph_format.space_after = Pt(12)
        run_title = p_title.add_run(title)
        run_title.font.name = "Times New Roman"
        run_title.font.size = Pt(16)
        run_title.font.bold = True
        rPr = run_title._r.get_or_add_rPr()
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:eastAsia'), '黑体')
        rPr.append(rFonts)

    def render_student_info(self, meta: dict):
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(8)
        info_str = "考号：__________________    班级：____________    姓名：____________    座位号：______"
        run = p.add_run(info_str)
        run.font.name = "Times New Roman"
        run.font.size = Pt(10.5)
        rPr = run._r.get_or_add_rPr()
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:eastAsia'), '宋体')
        rPr.append(rFonts)

    def render_score_table(self, sections: list):
        sec_count = len(sections)
        if sec_count == 0:
            return

        cols = sec_count + 3  # 题号 + 各大题 + 总分 + 评卷人
        table = self.doc.add_table(rows=2, cols=cols)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(table, color="555555", sz="4")

        chinese_nums = ["一", "二", "三", "四", "五", "六", "七", "八"]
        headers = ["题号"]
        for i in range(sec_count):
            num_str = chinese_nums[i] if i < len(chinese_nums) else str(i+1)
            headers.append(num_str)
        headers.extend(["总分", "评卷人"])

        # Row 0: 标题
        for col_idx, text in enumerate(headers):
            cell = table.cell(0, col_idx)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_margins(cell, top=60, bottom=60, left=80, right=80)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(text)
            r.font.name = "Times New Roman"
            r.font.size = Pt(9.5)
            r.font.bold = True
            rPr = r._r.get_or_add_rPr()
            rFonts = OxmlElement('w:rFonts')
            rFonts.set(qn('w:eastAsia'), '宋体')
            rPr.append(rFonts)

        # Row 1: 得分
        cell_score = table.cell(1, 0)
        cell_score.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        set_cell_margins(cell_score, top=120, bottom=120, left=80, right=80)
        p_score = cell_score.paragraphs[0]
        p_score.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p_score.add_run("得分")
        r.font.name = "Times New Roman"
        r.font.size = Pt(9.5)
        r.font.bold = True
        rPr = r._r.get_or_add_rPr()
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:eastAsia'), '宋体')
        rPr.append(rFonts)

        # 调整各列宽
        for row in table.rows:
            row.cells[0].width = Cm(1.5)
            for i in range(1, sec_count + 1):
                row.cells[i].width = Cm(1.3)
            row.cells[sec_count + 1].width = Cm(1.6)
            row.cells[sec_count + 2].width = Cm(1.8)

        # 表格下方微小空隙
        p_spacer = self.doc.add_paragraph()
        p_spacer.paragraph_format.space_before = Pt(0)
        p_spacer.paragraph_format.space_after = Pt(6)

    def render_section(self, section: dict):
        title = section.get("title", "")
        p_sec = self.doc.add_paragraph()
        p_sec.paragraph_format.space_before = Pt(8)
        p_sec.paragraph_format.space_after = Pt(4)
        p_sec.paragraph_format.keep_with_next = True
        run_sec = p_sec.add_run(title)
        run_sec.font.name = "Times New Roman"
        run_sec.font.size = Pt(11)
        run_sec.font.bold = True
        rPr = run_sec._r.get_or_add_rPr()
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:eastAsia'), '黑体')
        rPr.append(rFonts)

        questions = section.get("questions", [])
        for q in questions:
            self.render_question(q, section.get("type", "normal"))

    def render_question(self, q: dict, sec_type: str):
        number = q.get("number", "")
        stem = q.get("stem", "")
        prefix = f"{number}. " if number else ""
        full_stem = prefix + stem

        # 1. 题干渲染
        p_q = self.doc.add_paragraph()
        p_q.paragraph_format.space_before = Pt(3)
        p_q.paragraph_format.space_after = Pt(3)
        p_q.paragraph_format.line_spacing = 1.25
        p_q.paragraph_format.keep_with_next = True
        append_text_with_math(p_q, full_stem, font_name="宋体", ascii_font="Times New Roman", font_size_pt=10.5)

        # 2. 选择题选项处理
        options = q.get("options", [])
        if options and (sec_type == "single_choice" or sec_type == "multiple_choice" or len(options) == 4):
            self.render_options(options)

        # 3. 解答题留白处理
        blank_lines = q.get("blank_lines", 0)
        if blank_lines > 0:
            for _ in range(blank_lines):
                p_blank = self.doc.add_paragraph()
                p_blank.paragraph_format.space_before = Pt(0)
                p_blank.paragraph_format.space_after = Pt(14)

    def render_options(self, options: list):
        """
        Intelligent Option Alignment:
        Calculates max option character length:
        - <= 15 chars: 1 row x 4 cols
        - <= 35 chars: 2 rows x 2 cols
        - > 35 chars: 4 rows x 1 col
        Uses borderless tables to guarantee vertical alignment in all Word/WPS viewers.
        """
        max_len = max([len(opt) for opt in options]) if options else 0

        if max_len <= 15 and len(options) == 4:
            table = self.doc.add_table(rows=1, cols=4)
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            row = table.rows[0]
            for idx, opt in enumerate(options):
                cell = row.cells[idx]
                clear_cell_borders(cell)
                set_cell_margins(cell, top=20, bottom=20, left=40, right=40)
                p = cell.paragraphs[0]
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.line_spacing = 1.2
                append_text_with_math(p, opt, font_name="宋体", ascii_font="Times New Roman", font_size_pt=10.5)

        elif max_len <= 35 and len(options) == 4:
            table = self.doc.add_table(rows=2, cols=2)
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            mapping = [(0, 0, options[0]), (0, 1, options[1]), (1, 0, options[2]), (1, 1, options[3])]
            for r, c, opt in mapping:
                cell = table.cell(r, c)
                clear_cell_borders(cell)
                set_cell_margins(cell, top=20, bottom=20, left=40, right=40)
                p = cell.paragraphs[0]
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.line_spacing = 1.2
                append_text_with_math(p, opt, font_name="宋体", ascii_font="Times New Roman", font_size_pt=10.5)

        else:
            for opt in options:
                p_opt = self.doc.add_paragraph()
                p_opt.paragraph_format.left_indent = Inches(0.2)
                p_opt.paragraph_format.space_before = Pt(1)
                p_opt.paragraph_format.space_after = Pt(2)
                p_opt.paragraph_format.line_spacing = 1.2
                append_text_with_math(p_opt, opt, font_name="宋体", ascii_font="Times New Roman", font_size_pt=10.5)

    def render_answers(self, answers: list):
        self.doc.add_page_break()
        p_ans_title = self.doc.add_paragraph()
        p_ans_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_ans_title.paragraph_format.space_before = Pt(10)
        p_ans_title.paragraph_format.space_after = Pt(8)
        run = p_ans_title.add_run("参考答案与试题解析")
        run.font.size = Pt(14)
        run.font.bold = True
        rPr = run._r.get_or_add_rPr()
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:eastAsia'), '黑体')
        rPr.append(rFonts)

        for item in answers:
            num = item.get("number", "")
            ans = item.get("answer", "")
            analysis = item.get("analysis", "")

            p = self.doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(2)
            r_num = p.add_run(f"【第 {num} 题】 ")
            r_num.font.bold = True
            r_num.font.size = Pt(10.5)
            rPr = r_num._r.get_or_add_rPr()
            rFonts = OxmlElement('w:rFonts')
            rFonts.set(qn('w:eastAsia'), '黑体')
            rPr.append(rFonts)

            if ans:
                r_ans = p.add_run("答案：")
                r_ans.font.bold = True
                append_text_with_math(p, ans, font_name="宋体", ascii_font="Times New Roman", font_size_pt=10.5)

            if analysis:
                p_ana = self.doc.add_paragraph()
                p_ana.paragraph_format.left_indent = Inches(0.2)
                p_ana.paragraph_format.space_before = Pt(1)
                p_ana.paragraph_format.space_after = Pt(4)
                r_tag = p_ana.add_run("解析：")
                r_tag.font.bold = True
                append_text_with_math(p_ana, analysis, font_name="楷体", ascii_font="Times New Roman", font_size_pt=10)
