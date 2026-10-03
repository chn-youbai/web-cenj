"""
FastAPI Cloud Backend Entrypoint for Exam Typesetter
Designed for seamless deployment on Zeabur, Render, Railway, or Docker.
Fully accessible from mobile devices on 4G/5G/Wi-Fi without local PC.
"""
import os
import io
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


class ExportRequest(BaseModel):
    exam_data: Dict[str, Any]


class UploadBase64Request(BaseModel):
    filename: str
    content_base64: str
    api_key: Optional[str] = None


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
    executes deterministic Python tools or DeepSeek Function Calling,
    and returns updated exam_data + message.
    """
    try:
        reply_msg, updated_data, tool_name = route_chat_action(
            instruction=req.instruction,
            exam_data=req.exam_data,
            api_key=req.api_key
        )
        return {
            "success": True,
            "message": reply_msg,
            "exam_data": updated_data,
            "tool_executed": tool_name or None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"执行指令失败: {str(e)}")


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
        if ext == ".docx":
            parsed = parse_docx(tmp_path)
            raw_text = parsed["full_text"]
            summary = {
                "paragraph_count": parsed["paragraph_count"],
                "image_count": parsed["image_count"],
                "table_count": parsed["table_count"]
            }
        elif ext == ".pdf":
            parsed = parse_pdf(tmp_path)
            raw_text = parsed["full_text"]
            summary = {
                "page_count": parsed["page_count"],
                "paragraph_count": len(parsed["paragraphs"])
            }
        else:
            raw_text = file_bytes.decode("utf-8", errors="ignore")
            summary = {"char_count": len(raw_text)}

        # 2. Structure via DeepSeek
        exam_data = structure_exam_text(raw_text, api_key=req.api_key)
        return {
            "success": True,
            "filename": filename,
            "summary": summary,
            "exam_data": exam_data
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
async def handle_upload_file(file: UploadFile = File(...), api_key: Optional[str] = Form(None)):
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
        if ext == ".docx":
            parsed = parse_docx(tmp_path)
            raw_text = parsed["full_text"]
            summary = {
                "paragraph_count": parsed["paragraph_count"],
                "image_count": parsed["image_count"]
            }
        elif ext == ".pdf":
            parsed = parse_pdf(tmp_path)
            raw_text = parsed["full_text"]
            summary = {"page_count": parsed["page_count"]}
        else:
            raw_text = content.decode("utf-8", errors="ignore")
            summary = {"char_count": len(raw_text)}

        exam_data = structure_exam_text(raw_text, api_key=api_key)
        return {
            "success": True,
            "filename": filename,
            "summary": summary,
            "exam_data": exam_data
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
