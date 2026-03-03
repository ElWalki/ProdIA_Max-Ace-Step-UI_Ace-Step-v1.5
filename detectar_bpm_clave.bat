@echo off
chcp 65001 >nul 2>&1
title Detector BPM y Clave Musical
cd /d "%~dp0"

echo.
echo ══════════════════════════════════════════════════════════
echo    DETECTOR DE BPM Y CLAVE MUSICAL
echo ══════════════════════════════════════════════════════════
echo.

set "PYTHON=%~dp0ACE-Step-1.5_\python_embeded\python.exe"

if not exist "%PYTHON%" (
    echo  ERROR: No se encontro Python en:
    echo  %PYTHON%
    echo.
    pause
    exit /b 1
)

"%PYTHON%" "%~dp0detectar_bpm_clave.py" %*
