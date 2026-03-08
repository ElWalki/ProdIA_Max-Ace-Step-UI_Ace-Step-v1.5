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
set "SIDESTEP_DIR=%~dp0Side-Step"
set "UI_DIR=%~dp0ace-step-ui"
set "PRO_UI_DIR=%~dp0ace-step-ui-pro"
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
set "TOP_REQS=%~dp0requirements.txt"
set "NEED_PY_INSTALL=0"
if not exist "%PY_MARKER%" set "NEED_PY_INSTALL=1"
if "%NEED_PY_INSTALL%"=="0" (
    REM Comprobar si requirements.txt (top-level o ACE-Step) es mas nuevo que el marker
    for /f "tokens=*" %%a in ('powershell -NoProfile -Command "$m=(Get-Item \"%PY_MARKER%\" -EA SilentlyContinue).LastWriteTime; $r1=(Get-Item \"%TOP_REQS%\" -EA SilentlyContinue).LastWriteTime; $r2=(Get-Item \"%ACESTEP_DIR%\requirements.txt\" -EA SilentlyContinue).LastWriteTime; if($r1 -gt $m -or $r2 -gt $m){echo 1}else{echo 0}"') do set "NEED_PY_INSTALL=%%a"
)
if "%NEED_PY_INSTALL%"=="1" (
    echo.
    echo  [Setup] Instalando dependencias Python / Installing Python dependencies...
    echo          ACE-Step + Side-Step + ProdIA tools
    echo          Esto puede tardar varios minutos / This may take several minutes...
    echo.
    "%PYTHON%" -m pip install --upgrade pip >nul 2>&1
    if exist "%TOP_REQS%" (
        "%PYTHON%" -m pip install -r "%TOP_REQS%"
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
echo  [0/4] Liberando puertos / Freeing ports (8001, 3001, 3000, 3002)...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3002 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
timeout /t 2 /nobreak >nul

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

> "%LAUNCHER_DIR%\_frontend.cmd" (
    echo @echo off
    echo title ACE-Step Frontend
    echo cd /d "%UI_DIR%"
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
REM  PASO 1: Iniciar Gradio API con auto-inicializacion
REM  --enable-api activa init_service automaticamente
REM  --backend pt usa PyTorch puro (compatible siempre)
REM  --config_path acestep-v15-turbo modelo por defecto
REM  Flash attention se auto-detecta
REM ═══════════════════════════════════════════════════════════
echo.
REM ─── Instalar dependencias Pro UI / Install Pro UI deps ──────
if exist "%PRO_UI_DIR%\package.json" (
    if not exist "%PRO_UI_DIR%\node_modules" (
        echo  [!] Dependencias Pro UI no instaladas / Pro UI deps not installed. Instalando / Installing...
        cd /d "%PRO_UI_DIR%"
        call npm install
        if %errorlevel% neq 0 (
            echo  [ERROR] npm install Pro UI fallo / failed.
            pause
            exit /b 1
        )
    ) else (
        echo  [*] Verificando dependencias Pro UI / Checking Pro UI deps...
        cd /d "%PRO_UI_DIR%"
        call npm install --prefer-offline >nul 2>&1
    )
    cd /d "%~dp0"
)

echo  [1/4] Iniciando / Starting ACE-Step Gradio API (puerto/port 8001)...

start "ACE-Step Gradio API" "%LAUNCHER_DIR%\_gradio.cmd"

REM ─── Esperar / Wait for Gradio ──────────────────────────────
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║   CARGANDO EL MODELO DE IA / LOADING THE AI MODEL           ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  ACE-Step necesita cargar varios GB de pesos del modelo     ║
echo ║  en la GPU antes de poder generar musica.                   ║
echo ║                                                              ║
echo ║  Esto es NORMAL y ocurre siempre al iniciar:                ║
echo ║    - Primera vez: puede tardar 2-5 minutos                  ║
echo ║    - Usos siguientes: 1-2 minutos (cache caliente)          ║
echo ║                                                              ║
echo ║  Por favor, SE PACIENTE y no cierres esta ventana.          ║
echo ║  Please be PATIENT and do not close this window.            ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
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

REM Mostrar progreso con mensajes rotatorios segun tiempo transcurrido
set /a SECS=%ATTEMPTS%*5
if %ATTEMPTS% leq 6 (
    echo    [%SECS%s] Iniciando Python y cargando dependencias... / Starting Python and loading dependencies...
) else if %ATTEMPTS% leq 12 (
    echo    [%SECS%s] Cargando pesos del modelo DiT en GPU... / Loading DiT model weights into GPU...
) else if %ATTEMPTS% leq 20 (
    echo    [%SECS%s] Inicializando el backbone LM... / Initializing LM backbone... (esto es normal / this is normal)
) else if %ATTEMPTS% leq 30 (
    echo    [%SECS%s] Casi listo... el modelo es grande, espera un poco mas. / Almost there... model is large, hang tight.
) else (
    echo    [%SECS%s] Todavia cargando... GPU lenta o disco HDD? Sigue esperando. / Still loading... slow GPU or HDD? Keep waiting.
)
timeout /t 5 /nobreak >nul
goto WAIT_GRADIO

:GRADIO_READY
echo.
echo  ╔══════════════════════════════════════════════════════════════╗
echo  ║  ✓  MODELO LISTO / MODEL READY!                             ║
echo  ╚══════════════════════════════════════════════════════════════╝
echo.

:GRADIO_CONTINUE

REM ═══════════════════════════════════════════════════════════
REM  PASO 2 / STEP 2: Backend Node.js
REM ═══════════════════════════════════════════════════════════
echo  [2/4] Iniciando / Starting Backend (puerto/port 3001)...
start "ACE-Step Backend" "%LAUNCHER_DIR%\_backend.cmd"

echo  Esperando backend / Waiting for backend...
timeout /t 5 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
REM  PASO 3 / STEP 3: Frontend
REM ═══════════════════════════════════════════════════════════
echo  [3/4] Iniciando / Starting Frontend (puerto/port 3000)...
start "ACE-Step Frontend" "%LAUNCHER_DIR%\_frontend.cmd"

timeout /t 3 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
REM  PASO 4 / STEP 4: Pro UI
REM ═══════════════════════════════════════════════════════════
if exist "%PRO_UI_DIR%\package.json" (
    echo  [4/4] Iniciando / Starting Pro UI (puerto/port 3002)...
    start "ACE-Step Pro UI" "%LAUNCHER_DIR%\_proui.cmd"
) else (
    echo  [4/4] Pro UI no encontrada / not found. Omitiendo / Skipping.
)

timeout /t 3 /nobreak >nul

REM ═══════════════════════════════════════════════════════════
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   TODOS LOS SERVICIOS ARRANCADOS / ALL SERVICES STARTED  ║
echo ╠══════════════════════════════════════════════════════════╣
echo ║                                                          ║
echo ║   Gradio API:  http://localhost:8001                     ║
echo ║   Backend:     http://localhost:3001                     ║
echo ║   Frontend:    http://localhost:3000                     ║
echo ║   Pro UI:      http://localhost:3002                     ║
echo ║                                                          ║
if defined LOCAL_IP (
echo ║   LAN Classic: http://%LOCAL_IP%:3000                    ║
echo ║   LAN Pro:    http://%LOCAL_IP%:3002                     ║
echo ║                                                          ║
)
echo ║   Cambia entre interfaces en el navegador:               ║
echo ║   Switch UIs in browser:                                 ║
echo ║     :3000 = Classic UI  /  :3002 = Pro UI                ║
echo ║                                                          ║
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
