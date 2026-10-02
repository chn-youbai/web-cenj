@echo off
chcp 65001 >nul
title AI 试卷智能排版系统 · 本地伴生服务
cls
echo =====================================================================
echo           AI 试卷智能排版系统 · 本地 Python 强算力服务
echo =====================================================================
echo.
echo [*] 正在检查 Python 环境与依赖组件...

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未检测到 Python，请先安装 Python 3.10 或更高版本并加入 PATH 环境变量。
    pause
    exit /b 1
)

echo [*] Python 运行环境就绪。
echo [*] 正在启动本地服务端口 8765 ...
echo.

python server.py

pause
