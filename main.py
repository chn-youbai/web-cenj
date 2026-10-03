"""
FastAPI Cloud Backend Entrypoint for Exam Typesetter
Designed for seamless deployment on Zeabur, Render, Railway, or Docker.
Fully accessible from mobile devices on 4G/5G/Wi-Fi without local PC.
"""
import os
import io
import re
import sys
import base64
import tempfile
import urllib.parse
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel

from exam_typesetter.doc_parser import parse_docx
from exam_typesetter.pdf_parser import parse_pdf
from exam_typesetter.ai_parser import structure_exam_text, validate_and_normalize_exam_data
from exam_typesetter.docx_builder import ExamDocxBuilder
from exam_typesetter.agent_router import route_chat_action
from exam_typesetter.converter import docx_to_pdf

app = FastAPI(
    title="AI Exam Typesetter Cloud Engine",
    description="Cloud-native document typesetting engine with OMML formula extraction and DeepSeek tool calling",
    version="2.0.0"
)

# Enable full Cross-Origin Resource Sharing (CORS) for mobile web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatActionRequest(BaseModel):
    instruction: str
    exam_data: Dict[str, Any]
    api_key: Optional[str] = None
    history: Optional[list] = None
    model: Optional[str] = "deepseek-flash"


class ExportRequest(BaseModel):
    exam_data: Dict[str, Any]


class UploadBase64Request(BaseModel):
    filename: str
    content_base64: str
    api_key: Optional[str] = None
    provider: Optional[str] = "deepseek"
    model: Optional[str] = "deepseek-flash"


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "service": "AI Exam Typesetter Cloud Engine",
        "version": "2.0.0",
        "docs_url": "/docs",
        "health": "/api/status"
    }


@app.get("/api/status")
def get_status():
    return {
        "status": "ok",
        "service": "exam-typesetter-cloud",
        "version": "2.0.0",
        "features": [
            "omml_math_formula_preservation",
            "deterministic_agent_tools",
            "deepseek_function_calling",
            "native_docx_export",
            "pdf_vector_export"
        ]
    }


@app.post("/api/chat_action")
def handle_chat_action(req: ChatActionRequest):
    """
    Receives instruction from mobile chat or quick chips,
    executes deterministic Python tools or DeepSeek Function Calling with 1M context,
    and returns updated exam_data + message.
    """
    try:
        reply_msg, updated_data, tool_name = route_chat_action(
            instruction=req.instruction,
            exam_data=req.exam_data,
            api_key=req.api_key,
            history=req.history,
            model=req.model or "deepseek-flash"
        )
        return {
            "success": True,
            "message": reply_msg,
            "exam_data": updated_data,
            "tool_executed": tool_name or None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"执行指令失败: {str(e)}")


def bind_images_to_exam_data(exam_data: dict, images_map: dict, paragraphs: list) -> dict:
    """
    Binds extracted images (as base64 data URLs) to questions and answers in exam_data.
    1. First checks for explicit [IMAGE:xxx] tokens in question stems and answer analyses.
    2. Uses deterministic sequential document paragraph scanning as fallback.
    """
    if not isinstance(exam_data, dict) or not images_map:
        return exam_data

    assigned_images = set()

    # Step 1: Scan exam_data for explicit [IMAGE:xxx] tokens
    for sec in exam_data.get("sections", []):
        for q in sec.get("questions", []):
            stem = q.get("stem", "")
            tokens = re.findall(r'\[IMAGE:([^\]]+)\]', stem)
            if tokens:
                q_imgs = q.setdefault("images", [])
                for tok in tokens:
                    if tok in images_map:
                        img_url = images_map[tok]
                        if img_url not in q_imgs:
                            q_imgs.append(img_url)
                        assigned_images.add(tok)
                clean_stem = re.sub(r'\s*\[IMAGE:[^\]]+\]\s*', '', stem).strip()
                q["stem"] = clean_stem

    for ans in exam_data.get("answers", []):
        analysis = ans.get("analysis", "")
        tokens = re.findall(r'\[IMAGE:([^\]]+)\]', analysis)
        if tokens:
            ans_imgs = ans.setdefault("images", [])
            for tok in tokens:
                if tok in images_map:
                    img_url = images_map[tok]
                    if img_url not in ans_imgs:
                        ans_imgs.append(img_url)
                    assigned_images.add(tok)
            clean_analysis = re.sub(r'\s*\[IMAGE:[^\]]+\]\s*', '', analysis).strip()
            ans["analysis"] = clean_analysis

    # Step 2: Fallback scanning on original paragraphs
    q_bindings = {}
    a_bindings = {}
    in_ans = False
    curr_q = None

    for p in paragraphs:
        if any(kw in p for kw in ("参考答案", "答案与解析", "参考答案及评分标准", "答案及解析")):
            in_ans = True
            curr_q = None

        m = re.search(r'(?:^|\n)\s*(?:【第\s*)?(\d+)[\.．、\s]', p)
        if m:
            curr_q = int(m.group(1))

        imgs = re.findall(r'\[IMAGE:([^\]]+)\]', p)
        for img in imgs:
            if img in assigned_images:
                continue
            if in_ans and curr_q is not None:
                a_bindings.setdefault(curr_q, []).append(img)
            elif curr_q is not None:
                q_bindings.setdefault(curr_q, []).append(img)

    # Attach bindings to exam_data questions
    if q_bindings:
        for sec in exam_data.get("sections", []):
            for q in sec.get("questions", []):
                num = q.get("number")
                if num in q_bindings:
                    q_imgs = q.setdefault("images", [])
                    for img_name in q_bindings[num]:
                        if img_name in images_map and images_map[img_name] not in q_imgs:
                            q_imgs.append(images_map[img_name])
                            assigned_images.add(img_name)

    # Attach bindings to exam_data answers
    if a_bindings:
        for ans in exam_data.get("answers", []):
            num = ans.get("number")
            if num in a_bindings:
                ans_imgs = ans.setdefault("images", [])
                for img_name in a_bindings[num]:
                    if img_name in images_map and images_map[img_name] not in ans_imgs:
                        ans_imgs.append(images_map[img_name])
                        assigned_images.add(img_name)

    return exam_data


@app.post("/api/upload_base64")
def handle_upload_base64(req: UploadBase64Request):
    """
    Upload file as base64 string (ideal for mobile cross-origin fetch).
    """
    filename = req.filename or "upload.docx"
    ext = os.path.splitext(filename)[1].lower()
    
    try:
        file_bytes = base64.b64decode(req.content_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Base64 解码失败: {str(e)}")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        # 1. Parse text & equations
        images_map = {}
        paragraphs = []
        if ext == ".docx":
            parsed = parse_docx(tmp_path)
            raw_text = parsed.get("full_text", "")
            images_map = parsed.get("images_map", {})
            paragraphs = parsed.get("paragraphs", [])
            summary = {
                "paragraph_count": parsed.get("paragraph_count", len(paragraphs)),
                "image_count": parsed.get("image_count", len(images_map)),
                "table_count": parsed.get("table_count", 0)
            }
        elif ext == ".pdf":
            parsed = parse_pdf(tmp_path)
            raw_text = parsed.get("full_text", "")
            images_map = parsed.get("images_map", {})
            paragraphs = parsed.get("paragraphs", [])
            summary = {
                "page_count": parsed.get("page_count", 1),
                "paragraph_count": len(paragraphs),
                "image_count": parsed.get("image_count", len(images_map))
            }
        else:
            raw_text = file_bytes.decode("utf-8", errors="ignore")
            summary = {"char_count": len(raw_text)}

        # 2. Structure via DeepSeek / Gemini
        exam_data = structure_exam_text(
            raw_text,
            provider=req.provider or "deepseek",
            api_key=req.api_key,
            model=req.model
        )

        # 3. Deterministically bind images to questions and answers
        if images_map:
            exam_data = bind_images_to_exam_data(exam_data, images_map, paragraphs)

        return {
            "success": True,
            "filename": filename,
            "summary": summary,
            "exam_data": exam_data,
            "data": exam_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理文档失败: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


@app.post("/api/upload")
async def handle_upload_file(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(None),
    provider: Optional[str] = Form("deepseek"),
    model: Optional[str] = Form("deepseek-flash")
):
    """
    Standard multipart/form-data upload.
    """
    filename = file.filename or "document.docx"
    ext = os.path.splitext(filename)[1].lower()

    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        images_map = {}
        paragraphs = []
        if ext == ".docx":
            parsed = parse_docx(tmp_path)
            raw_text = parsed.get("full_text", "")
            images_map = parsed.get("images_map", {})
            paragraphs = parsed.get("paragraphs", [])
            summary = {
                "paragraph_count": parsed.get("paragraph_count", len(paragraphs)),
                "image_count": parsed.get("image_count", len(images_map)),
                "table_count": parsed.get("table_count", 0)
            }
        elif ext == ".pdf":
            parsed = parse_pdf(tmp_path)
            raw_text = parsed.get("full_text", "")
            images_map = parsed.get("images_map", {})
            paragraphs = parsed.get("paragraphs", [])
            summary = {
                "page_count": parsed.get("page_count", 1),
                "paragraph_count": len(paragraphs),
                "image_count": parsed.get("image_count", len(images_map))
            }
        else:
            raw_text = content.decode("utf-8", errors="ignore")
            summary = {"char_count": len(raw_text)}

        exam_data = structure_exam_text(
            raw_text,
            provider=provider or "deepseek",
            api_key=api_key,
            model=model
        )

        if images_map:
            exam_data = bind_images_to_exam_data(exam_data, images_map, paragraphs)

        return {
            "success": True,
            "filename": filename,
            "summary": summary,
            "exam_data": exam_data,
            "data": exam_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析试卷失败: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


@app.post("/api/export/docx")
def handle_export_docx(payload: Dict[str, Any] = Body(...)):
    """
    Generates real Word (.docx) file with native OMML editable math equations.
    Streams directly to mobile client.
    Supports both direct exam_data dictionary or wrapped {'exam_data': ...} payload.
    """
    try:
        raw_data = payload.get("exam_data", payload)
        norm_data = validate_and_normalize_exam_data(raw_data)
        bio = io.BytesIO()
        builder = ExamDocxBuilder(norm_data)
        builder.build(bio)
        bio.seek(0)

        filename = f"{norm_data.get('meta', {}).get('title', '试卷')}.docx"
        # RFC 5987 filename encoding for Chinese filenames
        encoded_filename = urllib.parse.quote(filename)

        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
        return StreamingResponse(
            bio,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成 Word 试卷失败: {str(e)}")


@app.post("/api/export/pdf")
def handle_export_pdf(payload: Dict[str, Any] = Body(...)):
    """
    Generates PDF from compiled Word document.
    """
    try:
        raw_data = payload.get("exam_data", payload)
        norm_data = validate_and_normalize_exam_data(raw_data)
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_docx:
            docx_path = tmp_docx.name
            
        builder = ExamDocxBuilder(norm_data)
        builder.build(docx_path)

        pdf_path = docx_path.replace(".docx", ".pdf")
        ok = docx_to_pdf(docx_path, pdf_path)
        
        if ok and os.path.exists(pdf_path):
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()
            try:
                os.remove(docx_path)
                os.remove(pdf_path)
            except Exception:
                pass

            filename = f"{norm_data.get('meta', {}).get('title', '试卷')}.pdf"
            encoded_filename = urllib.parse.quote(filename)
            headers = {
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers=headers
            )
        else:
            raise HTTPException(
                status_code=503,
                detail="服务端未安装 PDF 虚拟转换器，请先导出 Word (.docx)，可在手机 WPS 或 Office 中直接另存为 PDF。"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出 PDF 失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8765))
    print(f"Starting Exam Typesetter FastAPI Server on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
