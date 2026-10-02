"""
AI Exam Typesetter Local Companion API Server
Provides high-fidelity document parsing, AI structuring, and native Word/PDF generation.
Powered by Python standard library (http.server.ThreadingHTTPServer) with zero extra server dependencies.
"""
import os
import sys
import json
import base64
import socket
import tempfile
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from exam_typesetter.doc_parser import parse_docx
from exam_typesetter.pdf_parser import parse_pdf
from exam_typesetter.ai_parser import structure_exam_text
from exam_typesetter.docx_builder import ExamDocxBuilder
from exam_typesetter.converter import docx_to_pdf

PORT = 8765
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_lan_ip():
    """Detects the primary LAN IP address of this machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()

class ExamCompanionHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for all local requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-goog-api-key')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "OK")
        self.end_headers()

    def send_json(self, data: dict, status_code: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. Health & Status check endpoint
        if path == '/api/status':
            self.send_json({
                "status": "online",
                "version": "2.0.0",
                "engine": "AI Exam Typesetter Engine (Python Native)",
                "python": sys.version.split(' ')[0],
                "lan_ip": get_lan_ip(),
                "port": PORT
            })
            return

        # 2. Pretty URLs for local static serving
        if path == '/exam':
            self.path = '/exam.html'
        elif path == '/exam-mobile':
            self.path = '/exam-mobile.html'

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        # 1. Upload & Deep Parse Document (Base64 JSON payload)
        if path == '/api/upload_base64' or path == '/api/upload':
            try:
                # Handle JSON payload with base64 encoded file
                try:
                    payload = json.loads(body.decode('utf-8'))
                except Exception:
                    # If sent as raw multipart, try extracting file content
                    payload = self._parse_multipart(body)

                filename = payload.get('filename', 'document.docx').lower()
                b64_content = payload.get('content_base64', '')
                provider = payload.get('provider', 'deepseek')
                model = payload.get('model', None)
                api_key = payload.get('api_key', None)

                if b64_content:
                    file_bytes = base64.b64decode(b64_content)
                elif 'raw_bytes' in payload:
                    file_bytes = payload['raw_bytes']
                else:
                    return self.send_json({"success": False, "error": "未接收到文件数据"}, 400)

                # Process based on file type
                if filename.endswith('.docx'):
                    parsed_res = parse_docx(file_bytes)
                    extracted_text = parsed_res["full_text"]
                    images = parsed_res.get("images", [])
                elif filename.endswith('.pdf'):
                    parsed_res = parse_pdf(file_bytes)
                    extracted_text = parsed_res["full_text"]
                    images = parsed_res.get("images", [])
                elif filename.endswith('.json'):
                    exam_data = json.loads(file_bytes.decode('utf-8'))
                    return self.send_json({"success": True, "data": exam_data})
                else:
                    extracted_text = file_bytes.decode('utf-8', errors='ignore')
                    images = []

                if not extracted_text.strip():
                    return self.send_json({"success": False, "error": "未能从文件中提取到有效文本或公式内容。"}, 400)

                # Call AI structuring
                exam_data = structure_exam_text(
                    extracted_text,
                    provider=provider,
                    api_key=api_key,
                    model=model
                )

                self.send_json({
                    "success": True,
                    "data": exam_data,
                    "extracted_chars": len(extracted_text),
                    "image_count": len(images)
                })

            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json({"success": False, "error": f"文档处理失败: {str(e)}"}, 500)
            return

        # 2. Text / OCR Direct Structuring
        if path == '/api/parse_text':
            try:
                payload = json.loads(body.decode('utf-8'))
                raw_text = payload.get('text', '')
                provider = payload.get('provider', 'deepseek')
                model = payload.get('model', None)
                api_key = payload.get('api_key', None)

                if not raw_text.strip():
                    return self.send_json({"success": False, "error": "文本内容为空"}, 400)

                exam_data = structure_exam_text(
                    raw_text,
                    provider=provider,
                    api_key=api_key,
                    model=model
                )
                self.send_json({"success": True, "data": exam_data})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        # 3. Export Real Native Word (.docx with OMML formulas)
        if path == '/api/export/docx':
            try:
                exam_data = json.loads(body.decode('utf-8'))
                title = exam_data.get('meta', {}).get('title', '试卷')
                safe_title = urllib.parse.quote(f"{title}.docx")

                with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_file:
                    tmp_docx = tmp_file.name

                builder = ExamDocxBuilder(exam_data)
                builder.build(tmp_docx)

                with open(tmp_docx, 'rb') as f:
                    docx_bytes = f.read()

                try:
                    os.remove(tmp_docx)
                except Exception:
                    pass

                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_title}"; filename*=UTF-8\'\'{safe_title}')
                self.send_header('Content-Length', str(len(docx_bytes)))
                self.end_headers()
                self.wfile.write(docx_bytes)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json({"success": False, "error": f"Word 导出失败: {str(e)}"}, 500)
            return

        # 4. Export Real Vector PDF via WPS / Word COM
        if path == '/api/export/pdf':
            try:
                exam_data = json.loads(body.decode('utf-8'))
                title = exam_data.get('meta', {}).get('title', '试卷')
                safe_title = urllib.parse.quote(f"{title}.pdf")

                with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_doc:
                    tmp_docx = tmp_doc.name
                tmp_pdf = tmp_docx.replace('.docx', '.pdf')

                builder = ExamDocxBuilder(exam_data)
                builder.build(tmp_docx)

                ok = docx_to_pdf(tmp_docx, tmp_pdf)
                if not ok or not os.path.exists(tmp_pdf):
                    # Clean up
                    try:
                        os.remove(tmp_docx)
                    except Exception:
                        pass
                    return self.send_json({
                        "success": False,
                        "error": "本地未检测到可用的 Microsoft Word 或 WPS Office COM 自动化导出组件。请下载 Word (.docx) 后在办公软件中另存为 PDF。"
                    }, 501)

                with open(tmp_pdf, 'rb') as f:
                    pdf_bytes = f.read()

                try:
                    os.remove(tmp_docx)
                    os.remove(tmp_pdf)
                except Exception:
                    pass

                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_title}"; filename*=UTF-8\'\'{safe_title}')
                self.send_header('Content-Length', str(len(pdf_bytes)))
                self.end_headers()
                self.wfile.write(pdf_bytes)
            except Exception as e:
                self.send_json({"success": False, "error": f"PDF 导出失败: {str(e)}"}, 500)
            return

        self.send_json({"error": "Not Found"}, 404)

    def _parse_multipart(self, body: bytes) -> dict:
        """Simple multipart/form-data fallback parser."""
        content_type = self.headers.get('Content-Type', '')
        boundary = content_type.split('boundary=')[-1].encode('ascii')
        parts = body.split(b'--' + boundary)
        res = {}
        for part in parts:
            if b'filename="' in part:
                headers_part, file_data = part.split(b'\r\n\r\n', 1)
                file_data = file_data.rsplit(b'\r\n', 1)[0]
                # Extract filename
                fn_match = re.search(r'filename="([^"]+)"', headers_part.decode('utf-8', errors='ignore'))
                if fn_match:
                    res['filename'] = fn_match.group(1)
                res['raw_bytes'] = file_data
        return res

def run_server(port: int = PORT):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    lan_ip = get_lan_ip()
    server_address = ('0.0.0.0', port)
    httpd = ThreadingHTTPServer(server_address, ExamCompanionHandler)

    print("=" * 65)
    print("🚀 AI 试卷智能排版系统 · 本地 Python 强算力服务已就绪！")
    print("=" * 65)
    print(f"💻 本地电脑端访问:   http://localhost:{port}/exam.html")
    print(f"📱 手机/局域网访问:   http://{lan_ip}:{port}/exam-mobile.html")
    print(f"⚡ API 状态探活端点:  http://localhost:{port}/api/status")
    print(f"📂 网页与真题工作目录: {BASE_DIR}")
    print("=" * 65)
    print("💡 提示：在网页端上传真实 .docx / .pdf 将自动由本引擎进行公式无损提取，")
    print("   点击“导出 Word”将由本服务动态生成原生可双击修改的 OMML 试卷！")
    print("   保持本窗口开启即可。按 Ctrl+C 可停止服务。")
    print("=" * 65)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 服务已停止。")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
