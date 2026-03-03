@echo off
chcp 65001 >nul 2>&1
title ACE-Step - Iniciando todo...
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║          ACE-Step - Inicio Completo                     ║
echo ║   Gradio API + Backend + Frontend (con soporte LoRA)    ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

REM ─── Rutas ────────────────────────────────────────────────
set "ACESTEP_DIR=%~dp0ACE-Step-1.5_"
set "UI_DIR=%~dp0ace-step-ui"

REM ─── Detectar Python (embebido > venv > sistema) ──────────
set "PYTHON="
if exist "%ACESTEP_DIR%\python_embeded\python.exe" (
    set "PYTHON=%ACESTEP_DIR%\python_embeded\python.exe"
    echo  [Python] Usando python_embeded
    goto :PYTHON_OK
)
if exist "%ACESTEP_DIR%\.venv\Scripts\python.exe" (
    set "PYTHON=%ACESTEP_DIR%\.venv\Scripts\python.exe"
    echo  [Python] Usando .venv
    goto :PYTHON_OK
)
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON=python"
    echo  [Python] Usando Python del sistema
    goto :PYTHON_OK
)
echo  [ERROR] No se encontro Python. Ejecuta primero: setup.bat
pause
exit /b 1
:PYTHON_OK
if not exist "%UI_DIR%\node_modules" (
    echo  [ERROR] Dependencias UI no instaladas.
    echo  Ejecuta primero: setup.bat
    pause
    exit /b 1
)
if not exist "%UI_DIR%\server\node_modules" (
    echo  [ERROR] Dependencias backend no instaladas.
    echo  Ejecuta primero: setup.bat
    pause
    exit /b 1
)

REM ─── Matar procesos previos ───────────────────────────────
echo  [0/3] Liberando puertos (8001, 3001, 3000)...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM ─── Obtener IP local ────────────────────────────────────
set LOCAL_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set LOCAL_IP=%%b
)

REM ═══════════════════════════════════════════════════════════
REM  PASO 1: Iniciar Gradio API con auto-inicializacion
REM  --enable-api activa init_service automaticamente
REM  --backend pt usa PyTorch puro (compatible siempre)
REM  --config_path acestep-v15-turbo modelo por defecto
REM  Flash attention se auto-detecta
REM ═══════════════════════════════════════════════════════════
echo.
echo  [1/3] Iniciando ACE-Step Gradio API (puerto 8001)...
echo        El modelo se inicializa automaticamente.
echo        Esto puede tardar 1-2 minutos la primera vez.

start "ACE-Step Gradio API" cmd /s /k "title ACE-Step Gradio API && cd /d "%ACESTEP_DIR%" && set "ACESTEP_CACHE_DIR=%ACESTEP_DIR%.cache\acestep" && set "HF_HOME=%ACESTEP_DIR%.cache\huggingface" && "%PYTHON%" -m acestep.acestep_v15_pipeline --port 8001 --enable-api --backend pt --server-name 127.0.0.1 --config_path acestep-v15-turbo"

REM ─── Esperar a que Gradio este listo ──────────────────────
echo.
echo  Esperando a que Gradio inicie y cargue el modelo...
echo  (comprobando http://localhost:8001 cada 5 segundos)
echo.

set READY=0
set ATTEMPTS=0
set MAX_ATTEMPTS=60

:WAIT_GRADIO
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr %MAX_ATTEMPTS% (
    echo.
    echo  [AVISO] Gradio no respondio despues de 5 minutos.
    echo          Puede que aun este cargando. Continuando...
    goto GRADIO_CONTINUE
)

REM Comprobar si el puerto 8001 esta escuchando
netstat -aon | findstr ":8001 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    REM Puerto abierto, verificar que responde HTTP
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8001/gradio_api/info' -TimeoutSec 3 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
    if %errorlevel% equ 0 (
        set READY=1
        goto GRADIO_READY
    )
)

REM Mostrar progreso
set /a SECS=%ATTEMPTS%*5
echo    ... %SECS%s esperando (intento %ATTEMPTS%/%MAX_ATTEMPTS%)
timeout /t 5 /nobreak >nul
goto WAIT_GRADIO

:GRADIO_READY
echo.
echo  ✓ Gradio API listo! (modelo inicializado)
echo.

:GRADIO_CONTINUE

REM ═══════════════════════════════════════════════════════════
REM  PASO 2: Iniciar Backend Node.js
REM ═══════════════════════════════════════════════════════════
echo  [2/3] Iniciando Backend (puerto 3001)...
start "ACE-Step UI Backend" cmd /s /k "title ACE-Step Backend && cd /d "%UI_DIR%\server" && set "ACESTEP_PATH=%ACESTEP_DIR%" && set "DATASETS_DIR=%ACESTEP_DIR%\datasets" && npm run dev"

echo  Esperando backend...
timeout /t 5 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
REM  PASO 3: Iniciar Frontend
REM ═══════════════════════════════════════════════════════════
echo  [3/3] Iniciando Frontend (puerto 3000)...
start "ACE-Step UI Frontend" cmd /s /k "title ACE-Step Frontend && cd /d "%UI_DIR%" && npm run dev"

timeout /t 5 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   TODOS LOS SERVICIOS ARRANCADOS                       ║
echo ╠══════════════════════════════════════════════════════════╣
echo ║                                                         ║
echo ║   Gradio API:  http://localhost:8001                    ║
echo ║   Backend:     http://localhost:3001                    ║
echo ║   Frontend:    http://localhost:3000                    ║
echo ║                                                         ║
if defined LOCAL_IP (
echo ║   LAN:         http://%LOCAL_IP%:3000               ║
echo ║                                                         ║
)
echo ║   LoRA: Cargalo desde la UI en la seccion LoRA          ║
echo ║   (Custom mode -^> LoRA -^> Browse -^> Load)              ║
echo ║                                                         ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

echo  Abriendo navegador en 3 segundos...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo  Pulsa cualquier tecla para cerrar esta ventana.
echo  (Los servicios seguiran corriendo en sus ventanas)
pause >nul
