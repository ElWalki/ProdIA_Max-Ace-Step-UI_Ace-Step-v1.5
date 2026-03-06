@echo off
chcp 65001 >nul 2>&1
title ProdIA pro - Iniciar todo / Start All
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   ProdIA pro - Inicio Completo / Full Start              ║
echo ║   Setup + Gradio API + Backend + Frontend                ║
echo ║   (con soporte LoRA / with LoRA support)                 ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

REM ─── Rutas / Paths ──────────────────────────────────────────
set "ACESTEP_DIR=%~dp0ACE-Step-1.5_"
set "UI_DIR=%~dp0ace-step-ui"
set "VENV=%ACESTEP_DIR%\.venv"

REM ─── Verificar Node.js / Check Node.js ──────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js no encontrado / Node.js not found.
    echo          Instala Node.js 18+ desde / Install Node.js 18+ from:
    echo          https://nodejs.org/
    pause
    exit /b 1
)

REM ─── Detectar Python / Detect Python ────────────────────────
set "PYTHON="
set "BASE_PYTHON="
if exist "%ACESTEP_DIR%\python_embeded\python.exe" (
    set "PYTHON=%ACESTEP_DIR%\python_embeded\python.exe"
    echo  [Python] Usando python_embeded / Using embedded python
    goto :PYTHON_OK
)
if exist "%VENV%\Scripts\python.exe" (
    set "PYTHON=%VENV%\Scripts\python.exe"
    echo  [Python] Usando .venv existente / Using existing .venv
    goto :PYTHON_OK
)
python --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('where python') do set "BASE_PYTHON=%%i" & goto :GOT_SYS_PYTHON
    :GOT_SYS_PYTHON
    echo  [Python] Python del sistema encontrado / System Python found
    goto :CREATE_VENV
)
py --version >nul 2>&1
if %errorlevel% equ 0 (
    set "BASE_PYTHON=py"
    echo  [Python] Python launcher encontrado / Python launcher found
    goto :CREATE_VENV
)
echo  [ERROR] No se encontro Python / Python not found.
echo          Instala Python 3.10 o 3.11 desde / Install Python 3.10 or 3.11 from:
echo          https://www.python.org/downloads/
echo          Asegurate de marcar "Add Python to PATH"
pause
exit /b 1

:CREATE_VENV
echo.
echo  [Setup] Creando entorno virtual / Creating virtual environment...
if exist "%VENV%" (
    echo         Ya existe, omitiendo / Already exists, skipping.
) else (
    "%BASE_PYTHON%" -m venv "%VENV%"
    if %errorlevel% neq 0 (
        echo  [ERROR] No se pudo crear el venv / Could not create venv.
        pause
        exit /b 1
    )
    echo         Creado correctamente / Created successfully.
)
set "PYTHON=%VENV%\Scripts\python.exe"

:PYTHON_OK

REM ─── Instalar dependencias Python si es necesario ────────────
REM     Solo instala si no existe el marker o si requirements.txt cambio
REM     Install Python deps only if marker missing or requirements.txt changed
set "PY_MARKER=%ACESTEP_DIR%\.deps_installed"
set "NEED_PY_INSTALL=0"
if not exist "%PY_MARKER%" set "NEED_PY_INSTALL=1"
if "%NEED_PY_INSTALL%"=="0" (
    REM Comprobar si requirements.txt es mas nuevo que el marker
    for /f "tokens=*" %%a in ('powershell -NoProfile -Command "if ((Get-Item \"%ACESTEP_DIR%\requirements.txt\" -ErrorAction SilentlyContinue).LastWriteTime -gt (Get-Item \"%PY_MARKER%\" -ErrorAction SilentlyContinue).LastWriteTime) { echo 1 } else { echo 0 }"') do set "NEED_PY_INSTALL=%%a"
)
if "%NEED_PY_INSTALL%"=="1" (
    echo.
    echo  [Setup] Instalando dependencias Python / Installing Python dependencies...
    echo          Esto puede tardar varios minutos / This may take several minutes...
    echo.
    "%PYTHON%" -m pip install --upgrade pip >nul 2>&1
    if exist "%ACESTEP_DIR%\requirements.txt" (
        "%PYTHON%" -m pip install -r "%ACESTEP_DIR%\requirements.txt"
        if %errorlevel% neq 0 (
            echo.
            echo  [AVISO / WARNING] Algunos paquetes pueden haber fallado.
            echo          Si es CUDA/torch, instala manualmente segun tu GPU:
            echo          https://pytorch.org/get-started/locally/
            echo.
            pause
        ) else (
            echo. > "%PY_MARKER%"
            echo  [OK] Dependencias Python instaladas / Python deps installed.
        )
    )
) else (
    echo  [OK] Dependencias Python ya instaladas / Python deps already installed.
)

REM ─── Instalar dependencias Node.js ───────────────────────────
if not exist "%UI_DIR%\node_modules" (
    echo  [!] Dependencias UI no instaladas / UI deps not installed. Instalando / Installing...
    cd /d "%UI_DIR%"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install fallo / failed.
        pause
        exit /b 1
    )
) else (
    echo  [*] Verificando dependencias UI / Checking UI deps...
    cd /d "%UI_DIR%"
    call npm install --prefer-offline >nul 2>&1
)
if not exist "%UI_DIR%\server\node_modules" (
    echo  [!] Dependencias backend no instaladas / Backend deps not installed. Instalando / Installing...
    cd /d "%UI_DIR%\server"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install fallo / failed.
        pause
        exit /b 1
    )
) else (
    echo  [*] Verificando dependencias backend / Checking backend deps...
    cd /d "%UI_DIR%\server"
    call npm install --prefer-offline >nul 2>&1
)
cd /d "%~dp0"

REM ─── Matar procesos previos / Kill previous processes ────────
echo  [0/3] Liberando puertos / Freeing ports (8001, 3001, 3000)...
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

REM ─── Obtener IP local / Get local IP ────────────────────────
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
echo  [1/3] Iniciando / Starting ACE-Step Gradio API (puerto/port 8001)...
echo        El modelo se inicializa automaticamente / Model initializes automatically.
echo        Esto puede tardar / This may take 1-2 minutes the first time.

start "ACE-Step Gradio API" cmd /s /k "title ACE-Step Gradio API && cd /d "%ACESTEP_DIR%" && set "ACESTEP_CACHE_DIR=%ACESTEP_DIR%.cache\acestep" && set "HF_HOME=%ACESTEP_DIR%.cache\huggingface" && "%PYTHON%" -m acestep.acestep_v15_pipeline --port 8001 --enable-api --backend pt --server-name 127.0.0.1 --config_path acestep-v15-turbo"

REM ─── Esperar / Wait for Gradio ──────────────────────────────
echo.
echo  Esperando / Waiting for Gradio to start and load the model...
echo  (comprobando / checking http://localhost:8001 every 5 seconds)
echo.

set READY=0
set ATTEMPTS=0
set MAX_ATTEMPTS=60

:WAIT_GRADIO
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr %MAX_ATTEMPTS% (
    echo.
    echo  [AVISO / WARNING] Gradio no respondio / did not respond after 5 min. Continuando / Continuing...
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
echo    ... %SECS%s esperando / waiting (intento/attempt %ATTEMPTS%/%MAX_ATTEMPTS%)
timeout /t 5 /nobreak >nul
goto WAIT_GRADIO

:GRADIO_READY
echo.
echo  ✓ Gradio API listo / ready! (modelo/model initialized)
echo.

:GRADIO_CONTINUE

REM ═══════════════════════════════════════════════════════════
REM  PASO 2 / STEP 2: Backend Node.js
REM ═══════════════════════════════════════════════════════════
echo  [2/3] Iniciando / Starting Backend (puerto/port 3001)...
start "ACE-Step UI Backend" cmd /s /k "title ACE-Step Backend && cd /d "%UI_DIR%\server" && set "ACESTEP_PATH=%ACESTEP_DIR%" && set "DATASETS_DIR=%ACESTEP_DIR%\datasets" && npm run dev"

echo  Esperando backend / Waiting for backend...
timeout /t 5 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
REM  PASO 3 / STEP 3: Frontend
REM ═══════════════════════════════════════════════════════════
echo  [3/3] Iniciando / Starting Frontend (puerto/port 3000)...
start "ACE-Step UI Frontend" cmd /s /k "title ACE-Step Frontend && cd /d "%UI_DIR%" && npm run dev"

timeout /t 5 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   TODOS LOS SERVICIOS ARRANCADOS / ALL SERVICES STARTED  ║
echo ╠══════════════════════════════════════════════════════════╣
echo ║                                                          ║
echo ║   Gradio API:  http://localhost:8001                     ║
echo ║   Backend:     http://localhost:3001                     ║
echo ║   Frontend:    http://localhost:3000                     ║
echo ║                                                          ║
if defined LOCAL_IP (
echo ║   LAN:         http://%LOCAL_IP%:3000                    ║
echo ║                                                          ║
)
echo ║   LoRA: Cargalo / Load from UI in LoRA section           ║
echo ║   (Custom mode -> LoRA -> Browse -> Load)                ║
echo ║                                                          ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

echo  Abriendo navegador en 3 segundos...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo  Pulsa cualquier tecla para cerrar esta ventana.
echo  (Los servicios seguiran corriendo en sus ventanas)
pause >nul
