"""
PDF Parser for Educational Exam Papers
Extracts text blocks, mathematical notation, and embedded diagrams using PyMuPDF.
"""
import os
from io import BytesIO
import pymupdf

def extract_images_from_pdf(doc, output_dir: str = None) -> list:
    """
    Extracts embedded images from PDF pages.
    """
    images = []
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
                "data": image_bytes
            })
            image_idx += 1
    return images

def parse_pdf(file_source, output_media_dir: str = None) -> dict:
    """
    Parses a PDF exam document:
    1. Extracts text flow by block coordinates (handling 2-column or standard layouts);
    2. Extracts images;
    3. Normalizes text lines.
    """
    if isinstance(file_source, bytes):
        doc = pymupdf.open(stream=file_source, filetype="pdf")
    else:
        doc = pymupdf.open(file_source)

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
    images = extract_images_from_pdf(doc, output_dir=output_media_dir)
    doc.close()

    return {
        "full_text": full_text,
        "page_count": len(page_texts),
        "paragraphs": all_blocks,
        "images": images,
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
