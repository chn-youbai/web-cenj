"""
Word DOCX Deep Parser for Educational Exam Papers
Extracts text with OMML math equations converted to standard LaTeX ($...$ and $$...$$),
preserves table layouts (e.g. choice options), and extracts embedded images.
"""
import os
import re
import zipfile
from io import BytesIO
from lxml import etree
import docx

# Unicode math symbol mapping to LaTeX
MATH_SYMBOL_MAP = {
    '\U0001d411': r'\mathbf{R}',
    '\U0001d419': r'\mathbf{Z}',
    '\U0001d40f': r'\mathbf{P}',
    '\U0001d410': r'\mathbf{Q}',
    '\U0001d402': r'\mathbf{C}',
    '\U0001d40d': r'\mathbf{N}',
    '\u2208': r'\in',
    '\u2209': r'\notin',
    '\u2286': r'\subseteq',
    '\u2287': r'\supseteq',
    '\u2282': r'\subset',
    '\u2283': r'\supset',
    '\u2229': r'\cap',
    '\u222a': r'\cup',
    '\u2205': r'\emptyset',
    '\u2201': r'\complement',
    '\u22a5': r'\perp',
    '\u2225': r'\parallel',
    '\u223f': r'\sim',
    '\u2245': r'\cong',
    '\u2235': r'\because',
    '\u2234': r'\therefore',
    '\u2264': r'\le',
    '\u2265': r'\ge',
    '\u2260': r'\ne',
    '\u2248': r'\approx',
    '\u00b1': r'\pm',
    '\u00d7': r'\times',
    '\u00f7': r'\div',
    '\u221e': r'\infty',
    '\u03b1': r'\alpha',
    '\u03b2': r'\beta',
    '\u03b3': r'\gamma',
    '\u03b8': r'\theta',
    '\u03c0': r'\pi',
    '\u03c6': r'\varphi',
    '\u03c9': r'\omega',
    '\u03bb': r'\lambda',
    '\u03bc': r'\mu',
    '\u0394': r'\Delta',
    '\u03a9': r'\Omega',
    '\u25b3': r'\triangle',
    '\u2220': r'\angle',
    '\u2218': r'^\circ',
    '\u222b': r'\int',
    '\u2211': r'\sum',
}

# Math alphanumeric unicode ranges to standard ascii letters
def _clean_unicode_math_chars(text: str) -> str:
    res = []
    for ch in text:
        if ch in MATH_SYMBOL_MAP:
            res.append(MATH_SYMBOL_MAP[ch])
            continue
        code = ord(ch)
        # Mathematical italic small letters (e.g. 𝑥 -> x)
        if 0x1D44E <= code <= 0x1D467:
            res.append(chr(code - 0x1D44E + ord('a')))
        # Mathematical italic capital letters (e.g. 𝐴 -> A)
        elif 0x1D434 <= code <= 0x1D44D:
            res.append(chr(code - 0x1D434 + ord('A')))
        # Mathematical bold small letters
        elif 0x1D41A <= code <= 0x1D433:
            res.append(chr(code - 0x1D41A + ord('a')))
        # Mathematical bold capital letters
        elif 0x1D400 <= code <= 0x1D419:
            res.append(chr(code - 0x1D400 + ord('A')))
        else:
            res.append(ch)
    return ''.join(res)

def omml_to_latex(elem) -> str:
    """
    Recursively converts an OMML XML node (<m:oMath>, <m:oMathPara>, etc.)
    into a valid LaTeX formula representation.
    """
    tag = etree.QName(elem).localname
    
    # Text run inside math
    if tag == 't':
        text = elem.text or ''
        return _clean_unicode_math_chars(text)
    
    # Generic math container or run
    if tag in ('oMath', 'oMathPara', 'r', 'e'):
        return ''.join(omml_to_latex(c) for c in elem)
        
    # Fraction: <m:f><m:num><m:e>...</m:e></m:num><m:den><m:e>...</m:e></m:den></m:f>
    if tag == 'f':
        num = ''
        den = ''
        for c in elem:
            c_tag = etree.QName(c).localname
            if c_tag == 'num':
                num = omml_to_latex(c)
            elif c_tag == 'den':
                den = omml_to_latex(c)
        return f'\\frac{{{num}}}{{{den}}}'
        
    # Radical / Square root: <m:rad><m:deg>...</m:deg><m:e>...</m:e></m:rad>
    if tag == 'rad':
        deg = ''
        base = ''
        for c in elem:
            c_tag = etree.QName(c).localname
            if c_tag == 'deg':
                deg = omml_to_latex(c)
            elif c_tag == 'e':
                base = omml_to_latex(c)
        if deg:
            return f'\\sqrt[{deg}]{{{base}}}'
        return f'\\sqrt{{{base}}}'
        
    # Superscript: <m:sSup><m:e>...</m:e><m:sup>...</m:sup></m:sSup>
    if tag == 'sSup':
        base = ''
        sup = ''
        for c in elem:
            c_tag = etree.QName(c).localname
            if c_tag == 'e':
                base = omml_to_latex(c)
            elif c_tag == 'sup':
                sup = omml_to_latex(c)
        return f'{{{base}}}^{{{sup}}}'
        
    # Subscript: <m:sSub><m:e>...</m:e><m:sub>...</m:sub></m:sSub>
    if tag == 'sSub':
        base = ''
        sub = ''
        for c in elem:
            c_tag = etree.QName(c).localname
            if c_tag == 'e':
                base = omml_to_latex(c)
            elif c_tag == 'sub':
                sub = omml_to_latex(c)
        return f'{{{base}}}_{{{sub}}}'
        
    # SubSup: <m:sSubSup><m:e>...</m:e><m:sub>...</m:sub><m:sup>...</m:sup></m:sSubSup>
    if tag == 'sSubSup':
        base = ''
        sub = ''
        sup = ''
        for c in elem:
            c_tag = etree.QName(c).localname
            if c_tag == 'e':
                base = omml_to_latex(c)
            elif c_tag == 'sub':
                sub = omml_to_latex(c)
            elif c_tag == 'sup':
                sup = omml_to_latex(c)
        return f'{{{base}}}_{{{sub}}}^{{{sup}}}'
        
    # Delimiter (brackets, parens): <m:d><m:e>...</m:e></m:d>
    if tag == 'd':
        dPr = elem.find('{http://schemas.openxmlformats.org/officeDocument/2006/math}dPr')
        begChr = '('
        endChr = ')'
        if dPr is not None:
            beg = dPr.find('{http://schemas.openxmlformats.org/officeDocument/2006/math}begChr')
            if beg is not None:
                begChr = beg.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/math}val', '(')
            end = dPr.find('{http://schemas.openxmlformats.org/officeDocument/2006/math}endChr')
            if end is not None:
                endChr = end.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/math}val', ')')
                
        content = ''
        for c in elem:
            if etree.QName(c).localname == 'e':
                content += omml_to_latex(c)
        if begChr == '{' or endChr == '}':
            return f'\\{{{content}\\}}'
        if begChr == '[' and endChr == ']':
            return f'[{content}]'
        if begChr == '|' and endChr == '|':
            return f'|{content}|'
        return f'({content})'
        
    # Accent / Vector: <m:acc> or <m:groupChr>
    if tag in ('acc', 'groupChr'):
        base = ''
        for c in elem:
            if etree.QName(c).localname == 'e':
                base = omml_to_latex(c)
        return f'\\vec{{{base}}}'
        
    # N-ary (sum, int, prod): <m:nary>
    if tag == 'nary':
        sub = ''
        sup = ''
        base = ''
        for c in elem:
            c_tag = etree.QName(c).localname
            if c_tag == 'sub': sub = omml_to_latex(c)
            elif c_tag == 'sup': sup = omml_to_latex(c)
            elif c_tag == 'e': base = omml_to_latex(c)
        res = '\\sum'
        if sub: res += f'_{{{sub}}}'
        if sup: res += f'^{{{sup}}}'
        return f'{res} {base}'
        
    # Function (sin, cos, log, etc.): <m:func>
    if tag == 'func':
        fName = ''
        e = ''
        for c in elem:
            c_tag = etree.QName(c).localname
            if c_tag == 'fName': fName = omml_to_latex(c)
            elif c_tag == 'e': e = omml_to_latex(c)
        return f'\\{fName.strip()} {e}'

    # Matrix: <m:m>
    if tag == 'm':
        rows = []
        for r in elem:
            if etree.QName(r).localname == 'mr':
                row_cells = [omml_to_latex(e) for e in r if etree.QName(e).localname == 'e']
                rows.append(' & '.join(row_cells))
        return f'\\begin{{matrix}} {" \\\\ ".join(rows)} \\end{{matrix}}'
        
    # Default fallback: concatenate all children
    return ''.join(omml_to_latex(c) for c in elem)

def extract_paragraph_content(p_elem) -> str:
    """
    Extracts text and math formulas from a <w:p> element in order.
    Normal text is preserved, OMML formulas are wrapped in $...$.
    """
    parts = []
    for child in p_elem:
        tag = etree.QName(child).localname
        if tag == 'r':
            # Run
            t_elems = child.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
            for t in t_elems:
                if t.text:
                    parts.append(t.text)
        elif tag == 'oMath':
            latex = omml_to_latex(child).strip()
            if latex:
                parts.append(f' ${latex}$ ')
        elif tag == 'oMathPara':
            latex = omml_to_latex(child).strip()
            if latex:
                parts.append(f'\n$${latex}$$\n')
        elif tag in ('hyperlink', 'smartTag'):
            parts.append(extract_paragraph_content(child))

    raw_line = ''.join(parts).strip()
    # Normalize spaces inside and outside math
    raw_line = re.sub(r' +', ' ', raw_line)
    raw_line = re.sub(r'\$ +', '$', raw_line)
    raw_line = re.sub(r' +\$', '$', raw_line)
    return raw_line

def extract_images_from_docx(file_source, output_dir: str = None) -> list:
    """
    Extracts embedded images from Word DOCX zip structure.
    Returns list of dicts: [{'filename': str, 'path': str, 'size': int}]
    """
    images = []
    try:
        zf = zipfile.ZipFile(file_source if isinstance(file_source, (str, BytesIO)) else BytesIO(file_source))
        media_files = [f for f in zf.namelist() if f.startswith('word/media/')]
        for mf in media_files:
            bname = os.path.basename(mf)
            img_data = zf.read(mf)
            target_path = ""
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
                target_path = os.path.join(output_dir, bname)
                with open(target_path, 'wb') as f:
                    f.write(img_data)
            images.append({
                'filename': bname,
                'path': target_path,
                'size': len(img_data),
                'data': img_data
            })
    except Exception as e:
        print(f"[WARN] Failed to extract docx images: {e}")
    return images

def parse_docx(file_source, output_media_dir: str = None) -> dict:
    """
    Comprehensive Word DOCX parser:
    1. Parses all paragraphs in sequential order with OMML converted to LaTeX;
    2. Identifies choice option tables (e.g. 4-column tables A, B, C, D) and flattens them appropriately;
    3. Extracts embedded diagrams and charts;
    4. Produces a cohesive, clean text stream ready for AI structuring.
    """
    if isinstance(file_source, bytes):
        file_source = BytesIO(file_source)

    doc = docx.Document(file_source)
    paragraphs = []
    
    # Iterate over body elements (paragraphs and tables) in exact document order
    for elem in doc._body._element:
        tag = etree.QName(elem).localname
        if tag == 'p':
            p_text = extract_paragraph_content(elem)
            if p_text:
                paragraphs.append(p_text)
        elif tag == 'tbl':
            # Table extraction: commonly used for choice options (cols-4 or cols-2) or score tables
            table_rows = []
            for r in elem.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr'):
                row_cells = []
                for tc in r.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc'):
                    cell_text_parts = []
                    for p in tc.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                        c_text = extract_paragraph_content(p)
                        if c_text:
                            cell_text_parts.append(c_text)
                    row_cells.append(' '.join(cell_text_parts).strip())
                if any(row_cells):
                    table_rows.append(row_cells)
            
            # Format table content
            for row in table_rows:
                # If row looks like choice options (contains A., B., C., D.), join nicely
                row_str = '    '.join([c for c in row if c])
                if row_str:
                    paragraphs.append(row_str)

    full_text = '\n\n'.join(paragraphs)
    images = extract_images_from_docx(file_source, output_dir=output_media_dir)

    return {
        "full_text": full_text,
        "paragraphs": paragraphs,
        "images": images,
        "paragraph_count": len(paragraphs),
        "image_count": len(images)
    }

if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    test_file = sys.argv[1] if len(sys.argv) > 1 else "sample_math_exam.docx"
    if os.path.exists(test_file):
        res = parse_docx(test_file)
        print(f"Extracted {res['paragraph_count']} paragraphs, {res['image_count']} images.")
        print("--- Sample Extracted Text (First 1500 chars) ---")
        print(res["full_text"][:1500])
