@echo off
chcp 65001 >nul 2>&1
title Demucs + Whisper - Transcriptor
echo.
echo ============================================================
echo   TRANSCRIPTOR PROFESIONAL DE LETRAS
echo   Demucs htdemucs_ft + Whisper large-v3
echo ============================================================
echo.

set "PYTHON=%~dp0ACE-Step-1.5_\python_embeded\python.exe"
if not exist "%PYTHON%" (
    echo [!] Python no encontrado, usando python del sistema
    set "PYTHON=python"
)

echo Opciones:
echo   1. Completo: separar stems + transcribir (calidad alta, shifts=5)
echo   2. Completo: calidad maxima (shifts=10, mas lento)
echo   3. Completo: calidad rapida (shifts=1, rapido)
echo   4. Solo separar stems (sin transcribir)
echo   5. Solo transcribir (stems ya separados)
echo   6. Todo con sobreescritura (calidad alta)
echo.
set /p OPCION="Elige (1-6) [1]: "
if "%OPCION%"=="" set OPCION=1

set "ARGS=--calidad alta"
if "%OPCION%"=="2" set "ARGS=--calidad maxima"
if "%OPCION%"=="3" set "ARGS=--calidad rapida"
if "%OPCION%"=="4" set "ARGS=--solo-stems --calidad alta"
if "%OPCION%"=="5" set "ARGS=--solo-transcribir"
if "%OPCION%"=="6" set "ARGS=--sobreescribir --calidad alta"

echo.
"%PYTHON%" "%~dp0transcribir_letras.py" %ARGS%

echo.
pause
