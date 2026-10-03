"""
Vercel Serverless Function Entrypoint
Exports the FastAPI app for Vercel Python runtime
"""
import sys
import os

# Ensure current directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

# Vercel looks for 'app' in api/index.py
