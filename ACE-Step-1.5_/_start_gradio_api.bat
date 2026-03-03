@echo off
chcp 65001 >nul 2>&1
title ACE-Step Gradio API
cd /d "%~dp0"
set "ACESTEP_CACHE_DIR=%~dp0.cache\acestep"
set "TRITON_CACHE_DIR=%~dp0.cache\acestep\triton"
set "TORCHINDUCTOR_CACHE_DIR=%~dp0.cache\acestep\torchinductor"
set "HF_HOME=%~dp0.cache\huggingface"
set "MODELSCOPE_CACHE=%~dp0.cache\modelscope"
echo Iniciando ACE-Step Gradio + API en puerto 8001...
"%~dp0python_embeded\python.exe" -m acestep.acestep_v15_pipeline --port 8001 --enable-api --backend pt --server-name 127.0.0.1
pause
