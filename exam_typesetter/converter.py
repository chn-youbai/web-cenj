"""
DOCX to PDF Conversion Module.
Utilizes WPS Office or MS Office COM automation on Windows.
"""
import os
import sys

def docx_to_pdf(docx_path: str, pdf_path: str) -> bool:
    """
    Converts a docx file to pdf using WPS Office or Microsoft Word.
    Returns True if successful, False otherwise.
    """
    abs_docx = os.path.abspath(docx_path)
    abs_pdf = os.path.abspath(pdf_path)

    if not os.path.exists(abs_docx):
        raise FileNotFoundError(f"Input docx not found: {abs_docx}")

    # Remove existing pdf if any
    if os.path.exists(abs_pdf):
        try:
            os.remove(abs_pdf)
        except Exception:
            pass

    # Try WPS Office COM first (widely used in Chinese educational settings)
    try:
        import comtypes.client
        app = comtypes.client.CreateObject('kwps.application')
        app.Visible = False
        try:
            doc = app.Documents.Open(abs_docx, ReadOnly=True)
            # wdExportFormatPDF = 17
            doc.ExportAsFixedFormat(abs_pdf, 17)
            doc.Close()
            return os.path.exists(abs_pdf)
        finally:
            app.Quit()
    except Exception as wps_err:
        pass

    # Try MS Word COM
    try:
        import comtypes.client
        app = comtypes.client.CreateObject('Word.Application')
        app.Visible = False
        try:
            doc = app.Documents.Open(abs_docx, ReadOnly=True)
            doc.ExportAsFixedFormat(abs_pdf, 17)
            doc.Close()
            return os.path.exists(abs_pdf)
        finally:
            app.Quit()
    except Exception as word_err:
        pass

    print("[WARN] Neither WPS Office nor MS Word COM automation could be completed. Please open the .docx file and save as PDF manually.", file=sys.stderr)
    return False
