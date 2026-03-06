@echo off
chcp 65001 >nul 2>&1
title ProdIA Pro UI - Quick Start
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   ProdIA Pro UI - Inicio Rapido / Quick Start            ║
echo ║   Gradio API (8001) + Backend (3001) + Pro UI (3002)     ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

REM ─── Rutas / Paths ──────────────────────────────────────────
set "ACESTEP_DIR=%~dp0ACE-Step-1.5_"
set "UI_DIR=%~dp0ace-step-ui"
set "PRO_UI_DIR=%~dp0ace-step-ui-pro"
set "VENV=%ACESTEP_DIR%\.venv"

REM ─── Verificar que Pro UI existe / Check Pro UI exists ───────
if not exist "%PRO_UI_DIR%\package.json" (
    echo  [ERROR] Pro UI no encontrada en / not found at:
    echo          %PRO_UI_DIR%
    pause
    exit /b 1
)

REM ─── Verificar Node.js / Check Node.js ──────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js no encontrado / Node.js not found.
    echo          Instala Node.js 18+ desde / Install from: https://nodejs.org/
    pause
    exit /b 1
)

REM ─── Detectar Python / Detect Python ────────────────────────
set "PYTHON="
if exist "%ACESTEP_DIR%\python_embeded\python.exe" (
    set "PYTHON=%ACESTEP_DIR%\python_embeded\python.exe"
    echo  [Python] Usando python_embeded / Using embedded python
    goto :PYTHON_OK
)
if exist "%VENV%\Scripts\python.exe" (
    set "PYTHON=%VENV%\Scripts\python.exe"
    echo  [Python] Usando .venv / Using .venv
    goto :PYTHON_OK
)
python --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('where python') do set "PYTHON=%%i" & goto :PYTHON_OK
)
py --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON=py"
    goto :PYTHON_OK
)
echo  [ERROR] No se encontro Python / Python not found.
pause
exit /b 1

:PYTHON_OK

REM ─── Instalar dependencias si faltan / Install deps if missing ──
if not exist "%PRO_UI_DIR%\node_modules" (
    echo  [Setup] Instalando dependencias Pro UI / Installing Pro UI deps...
    cd /d "%PRO_UI_DIR%"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install fallo / failed.
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)
if not exist "%UI_DIR%\server\node_modules" (
    echo  [Setup] Instalando dependencias backend / Installing backend deps...
    cd /d "%UI_DIR%\server"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install backend fallo / failed.
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)

REM ─── Liberar puertos / Free ports ───────────────────────────
echo  [0/3] Liberando puertos / Freeing ports (8001, 3001, 3002)...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3002 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM ─── Obtener IP local / Get local IP ────────────────────────
set LOCAL_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set LOCAL_IP=%%b
)

REM ─── Variables de entorno heredadas / Inherited env vars ─────
set "ACESTEP_CACHE_DIR=%ACESTEP_DIR%.cache\acestep"
set "HF_HOME=%ACESTEP_DIR%.cache\huggingface"
set "ACESTEP_PATH=%ACESTEP_DIR%"
set "DATASETS_DIR=%ACESTEP_DIR%\datasets"

REM ─── Crear lanzadores temporales / Create temp launchers ─────
REM   (evita problemas de comillas anidadas en rutas con espacios)
set "LAUNCHER_DIR=%TEMP%\acestep_launchers"
if not exist "%LAUNCHER_DIR%" mkdir "%LAUNCHER_DIR%"

> "%LAUNCHER_DIR%\_gradio.cmd" (
    echo @echo off
    echo title ACE-Step Gradio API
    echo cd /d "%ACESTEP_DIR%"
    echo "%PYTHON%" -m acestep.acestep_v15_pipeline --port 8001 --enable-api --backend pt --server-name 127.0.0.1 --config_path acestep-v15-turbo
    echo pause
)

> "%LAUNCHER_DIR%\_backend.cmd" (
    echo @echo off
    echo title ACE-Step Backend
    echo cd /d "%UI_DIR%\server"
    echo npm run dev
    echo pause
)

> "%LAUNCHER_DIR%\_proui.cmd" (
    echo @echo off
    echo title ACE-Step Pro UI
    echo cd /d "%PRO_UI_DIR%"
    echo npm run dev
    echo pause
)

REM ═══════════════════════════════════════════════════════════
REM  PASO 1: Gradio API (puerto 8001)
REM ═══════════════════════════════════════════════════════════
echo.
echo  [1/3] Iniciando / Starting Gradio API (puerto/port 8001)...

start "ACE-Step Gradio API" "%LAUNCHER_DIR%\_gradio.cmd"

REM ─── Esperar Gradio / Wait for Gradio ───────────────────────
echo.
echo  Esperando Gradio / Waiting for Gradio API...
echo  (comprobando / checking http://localhost:8001 cada/every 5s)

set ATTEMPTS=0
set MAX_ATTEMPTS=60

:WAIT_GRADIO
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr %MAX_ATTEMPTS% (
    echo  [AVISO] Gradio no respondio en 5 min. Continuando...
    goto GRADIO_CONTINUE
)
netstat -aon | findstr ":8001 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8001/gradio_api/info' -TimeoutSec 3 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
    if %errorlevel% equ 0 goto GRADIO_READY
)
set /a SECS=%ATTEMPTS%*5
echo    ... %SECS%s esperando / waiting (%ATTEMPTS%/%MAX_ATTEMPTS%)
timeout /t 5 /nobreak >nul
goto WAIT_GRADIO

:GRADIO_READY
echo.
echo  OK Gradio API listo / ready!

:GRADIO_CONTINUE

REM ═══════════════════════════════════════════════════════════
REM  PASO 2: Backend Node.js (puerto 3001)
REM ═══════════════════════════════════════════════════════════
echo  [2/3] Iniciando / Starting Backend (puerto/port 3001)...

start "ACE-Step Backend" "%LAUNCHER_DIR%\_backend.cmd"

timeout /t 3 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
REM  PASO 3: Pro UI (puerto 3002)
REM ═══════════════════════════════════════════════════════════
echo  [3/3] Iniciando / Starting Pro UI (puerto/port 3002)...

start "ACE-Step Pro UI" "%LAUNCHER_DIR%\_proui.cmd"

timeout /t 5 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║         PRO UI LISTA / PRO UI READY                      ║
echo ╠══════════════════════════════════════════════════════════╣
echo ║                                                          ║
echo ║   Gradio API:  http://localhost:8001                     ║
echo ║   Backend:     http://localhost:3001                     ║
echo ║   Pro UI:      http://localhost:3002                     ║
echo ║                                                          ║
if defined LOCAL_IP (
echo ║   LAN:         http://%LOCAL_IP%:3002                    ║
echo ║                                                          ║
)
echo ║   Legacy UI NO iniciada (usar iniciar_todo.bat)          ║
echo ║   Legacy UI NOT started (use iniciar_todo.bat)           ║
echo ║                                                          ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

echo  Abriendo navegador / Opening browser...
timeout /t 2 /nobreak >nul
start http://localhost:3002

echo.
echo  Pulsa cualquier tecla para cerrar esta ventana.
echo  (Los servicios seguiran corriendo en sus ventanas)
pause >nul
