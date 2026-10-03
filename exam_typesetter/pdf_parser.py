"""
PDF Parser for Educational Exam Papers
Extracts text blocks, mathematical notation, and embedded diagrams using PyMuPDF.
"""
import os
import base64
from io import BytesIO

try:
    import pymupdf
except ImportError:
    try:
        import fitz as pymupdf
    except ImportError:
        pymupdf = None

try:
    import pypdf
except ImportError:
    pypdf = None

def extract_images_from_pdf(doc, output_dir: str = None) -> tuple:
    """
    Extracts embedded images from PDF pages.
    Returns (images_list, images_map).
    """
    images = []
    images_map = {}
    image_idx = 1
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        image_list = page.get_images(full=True)
        for img_info in image_list:
            xref = img_info[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            filename = f"img_p{page_idx+1}_{image_idx}.{image_ext}"
            
            b64 = base64.b64encode(image_bytes).decode('utf-8')
            mime = "jpeg" if image_ext.lower() == "jpg" else image_ext.lower()
            data_url = f"data:image/{mime};base64,{b64}"
            images_map[filename] = data_url

            target_path = ""
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
                target_path = os.path.join(output_dir, filename)
                with open(target_path, "wb") as f:
                    f.write(image_bytes)
            images.append({
                "page": page_idx + 1,
                "filename": filename,
                "path": target_path,
                "size": len(image_bytes),
                "data_url": data_url,
                "data": image_bytes
            })
            image_idx += 1
    return images, images_map

def parse_pdf(file_source, output_media_dir: str = None) -> dict:
    """
    Parses a PDF exam document:
    1. Extracts text flow by block coordinates (handling 2-column or standard layouts);
    2. Extracts images;
    3. Normalizes text lines.
    """
    if pymupdf:
        if isinstance(file_source, bytes):
            doc = pymupdf.open(stream=file_source, filetype="pdf")
        else:
            doc = pymupdf.open(file_source)
    elif pypdf:
        reader = pypdf.PdfReader(BytesIO(file_source) if isinstance(file_source, bytes) else file_source)
        page_texts = [p.extract_text() or "" for p in reader.pages]
        return {
            "full_text": "\n\n".join(page_texts),
            "page_count": len(page_texts),
            "paragraphs": page_texts,
            "images": [],
            "images_map": {},
            "image_count": 0
        }
    else:
        raise ImportError("Neither pymupdf nor pypdf is installed to parse PDF files.")

    page_texts = []
    all_blocks = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        # Text with blocks sorted top-to-bottom, left-to-right
        blocks = page.get_text("blocks")
        # Sort blocks by y0 (top), then x0 (left)
        sorted_blocks = sorted(blocks, key=lambda b: (round(b[1] / 15) * 15, b[0]))
        block_texts = [b[4].strip() for b in sorted_blocks if b[4].strip()]
        page_str = "\n\n".join(block_texts)
        page_texts.append(page_str)
        all_blocks.extend(block_texts)

    full_text = "\n\n".join(page_texts)
    images, images_map = extract_images_from_pdf(doc, output_dir=output_media_dir)
    doc.close()

    return {
        "full_text": full_text,
        "page_count": len(page_texts),
        "paragraphs": all_blocks,
        "images": images,
        "images_map": images_map,
        "image_count": len(images)
    }

if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    test_pdf = sys.argv[1] if len(sys.argv) > 1 else "sample_math_exam.pdf"
    if os.path.exists(test_pdf):
        res = parse_pdf(test_pdf)
        print(f"Extracted {res['page_count']} pages, {len(res['paragraphs'])} blocks, {res['image_count']} images.")
        print("--- Sample Extracted Text ---")
        print(res["full_text"][:1000])
