@echo off
chcp 65001 >nul 2>&1
REM ACE-Step UI Complete Startup Script for Windows
REM Starts ACE-Step API + Backend + Frontend
setlocal EnableDelayedExpansion

echo ==================================
echo   ACE-Step Complete Startup
echo ==================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: UI dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "server\node_modules" (
    echo Error: Server dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM ─── Auto-detect ACE-Step path ────────────────────────────
REM Try multiple common directory names next to ace-step-ui
set "ACESTEP_PATH="
if exist "%~dp0..\ACE-Step-1.5_" (
    set "ACESTEP_PATH=%~dp0..\ACE-Step-1.5_"
) else if exist "%~dp0..\ACE-Step-1.5" (
    set "ACESTEP_PATH=%~dp0..\ACE-Step-1.5"
) else if exist "%~dp0..\ACE-Step" (
    set "ACESTEP_PATH=%~dp0..\ACE-Step"
)

REM Allow override from environment
if "%ACESTEP_PATH%"=="" (
    echo.
    echo Warning: ACE-Step not found next to ace-step-ui
    echo Looked for: ACE-Step-1.5_, ACE-Step-1.5, ACE-Step
    echo.
    echo Please set ACESTEP_PATH or place ACE-Step next to ace-step-ui
    echo Example: set ACESTEP_PATH=C:\ACE-Step-1.5
    echo.
    pause
    exit /b 1
)

echo [+] ACE-Step found at: %ACESTEP_PATH%

REM ─── Detect installation type ─────────────────────────────
set "PYTHON="
set "API_COMMAND="
if exist "%ACESTEP_PATH%\python_embeded\python.exe" (
    echo [+] Detected Windows Portable Package
    set "PYTHON=%ACESTEP_PATH%\python_embeded\python.exe"
    set "API_COMMAND="%ACESTEP_PATH%\python_embeded\python.exe" -m acestep.acestep_v15_pipeline --port 8001 --enable-api --backend pt --server-name 127.0.0.1 --config_path acestep-v15-turbo"
) else (
    echo [+] Detected Standard Installation
    set "API_COMMAND=uv run acestep-api --port 8001"
)

REM ─── Kill previous processes on ports ─────────────────────
echo [0/3] Freeing ports (8001, 3001, 3000)...
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

REM Get local IP for LAN access
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set "LOCAL_IP=%%b"
    )
)

echo.
echo ==================================
echo   Starting All Services...
echo ==================================
echo.

REM ─── STEP 1: Start Gradio API ────────────────────────────
echo [1/3] Starting ACE-Step Gradio API (port 8001)...
start "ACE-Step Gradio API" cmd /k "title ACE-Step Gradio API && cd /d "%ACESTEP_PATH%" && set "ACESTEP_CACHE_DIR=%ACESTEP_PATH%\.cache\acestep" && set "HF_HOME=%ACESTEP_PATH%\.cache\huggingface" && %API_COMMAND%"

REM Wait for API to start
echo Waiting for Gradio API to initialize (model loading ~1-2 min first time)...
set READY=0
set ATTEMPTS=0
set MAX_ATTEMPTS=60
:WAIT_GRADIO
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr %MAX_ATTEMPTS% (
    echo [!] Gradio not ready after 5 min. Continuing anyway...
    goto GRADIO_CONTINUE
)
netstat -aon | findstr ":8001 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8001/gradio_api/info' -TimeoutSec 3 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
    if %errorlevel% equ 0 (
        set READY=1
        goto GRADIO_READY
    )
)
set /a SECS=%ATTEMPTS%*5
echo    ... %SECS%s waiting (attempt %ATTEMPTS%/%MAX_ATTEMPTS%)
timeout /t 5 /nobreak >nul
goto WAIT_GRADIO

:GRADIO_READY
echo [+] Gradio API ready!

:GRADIO_CONTINUE

REM ─── STEP 2: Start Backend ───────────────────────────────
echo [2/3] Starting Backend (port 3001)...
start "ACE-Step UI Backend" cmd /k "title ACE-Step Backend && cd /d "%~dp0server" && set "ACESTEP_PATH=%ACESTEP_PATH%" && set "DATASETS_DIR=%ACESTEP_PATH%\datasets" && npm run dev"

echo Waiting for backend...
timeout /t 5 /nobreak >nul

REM ─── STEP 3: Start Frontend ──────────────────────────────
echo [3/3] Starting Frontend (port 3000)...
start "ACE-Step UI Frontend" cmd /k "title ACE-Step Frontend && cd /d "%~dp0" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ==================================
echo   All Services Running!
echo ==================================
echo.
echo   Gradio API:  http://localhost:8001
echo   Backend:     http://localhost:3001
echo   Frontend:    http://localhost:3000
echo.
if defined LOCAL_IP (
    echo   LAN Access:  http://%LOCAL_IP%:3000
    echo.
)
echo   LoRA: Load from UI in Custom mode
echo   Close terminal windows to stop services.
echo.
echo ==================================
echo.
echo Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo Press any key to close this window (services will keep running)
pause >nul
