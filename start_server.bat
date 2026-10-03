@echo off
cd /d "%~dp0"
title Intelligent Exam Typesetter Server

echo ==================================================================
echo          AI Exam Typesetter - Local Companion Service
echo ==================================================================
echo.
echo [*] Checking Python environment...

set PY_CMD=
python --version >nul 2>&1
if not errorlevel 1 (
    set PY_CMD=python
) else (
    py -3 --version >nul 2>&1
    if not errorlevel 1 (
        set PY_CMD=py -3
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] Python was not found in your system PATH!
    echo Please install Python 3.10+ from https://www.python.org/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [*] Using: %PY_CMD%
echo [*] Starting companion server on port 8765...
echo.

%PY_CMD% main.py
if errorlevel 1 (
    echo.
    echo [ERROR] Server stopped with error code %errorlevel%.
)

echo.
echo Server closed.
pause
