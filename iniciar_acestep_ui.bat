@echo off
chcp 65001 >nul 2>&1
title ACE-Step UI (Suno-like) - Launcher
cd /d "%~dp0"

echo.
echo ══════════════════════════════════════════════════════════
echo    ACE-Step UI - Interfaz tipo Suno
echo    Arranca: ACE-Step API + Backend + Frontend
echo ══════════════════════════════════════════════════════════
echo.

REM ─── Rutas ────────────────────────────────────────────────
set "ACESTEP_DIR=%~dp0ACE-Step-1.5_"
set "UI_DIR=%~dp0ace-step-ui"
set "PYTHON=%ACESTEP_DIR%\python_embeded\python.exe"

REM ─── Verificaciones ───────────────────────────────────────
if not exist "%PYTHON%" (
    echo  ERROR: No se encontro Python en:
    echo  %PYTHON%
    pause
    exit /b 1
)

if not exist "%UI_DIR%\node_modules" (
    echo  ERROR: Dependencias frontend no instaladas.
    echo  Ejecuta: cd ace-step-ui ^& npm install
    pause
    exit /b 1
)

if not exist "%UI_DIR%\server\node_modules" (
    echo  ERROR: Dependencias backend no instaladas.
    echo  Ejecuta: cd ace-step-ui\server ^& npm install
    pause
    exit /b 1
)

REM ─── Matar procesos previos en puertos 8001, 3001 ────────
echo  [0/3] Liberando puertos...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)

REM ─── Obtener IP local para acceso LAN ────────────────────
set LOCAL_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set LOCAL_IP=%%b
    )
)

echo.
echo  [1/3] Arrancando ACE-Step Gradio API (puerto 8001)...
echo         Esto puede tardar 30-60 segundos en cargar modelos.
start "ACE-Step API Server" cmd /s /k ""cd /d "%ACESTEP_DIR%" && "%PYTHON%" -m acestep.acestep_v15_pipeline --port 8001 --enable-api --backend pt --server-name 127.0.0.1""

echo  Esperando a que la API se inicialice (puede tardar 30-60s cargando modelos)...
timeout /t 30 /nobreak >nul

echo.
echo  [2/3] Arrancando Backend (puerto 3001)...
start "ACE-Step UI Backend" cmd /s /k ""cd /d "%UI_DIR%\server" && set ACESTEP_PATH=%ACESTEP_DIR% && set DATASETS_DIR=%ACESTEP_DIR%\datasets && npm run dev""

echo  Esperando backend...
timeout /t 5 /nobreak >nul

echo.
echo  [3/3] Arrancando Frontend (puerto 3000)...
start "ACE-Step UI Frontend" cmd /s /k ""cd /d "%UI_DIR%" && npm run dev""

timeout /t 5 /nobreak >nul

echo.
echo ══════════════════════════════════════════════════════════
echo    TODOS LOS SERVICIOS ARRANCADOS
echo ══════════════════════════════════════════════════════════
echo.
echo    ACE-Step API:  http://localhost:8001
echo    Backend:       http://localhost:3001
echo    Frontend:      http://localhost:3000
echo.
if defined LOCAL_IP (
    echo    LAN Access:    http://%LOCAL_IP%:3000
    echo.
)
echo    Cierra las ventanas de terminal para detener.
echo ══════════════════════════════════════════════════════════
echo.

echo  Abriendo navegador...
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo.
echo  Pulsa cualquier tecla para cerrar esta ventana.
echo  (Los servicios seguiran corriendo)
pause >nul
