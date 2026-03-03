@echo off
chcp 65001 >nul 2>&1
title ACE-Step UI (Suno-like)
color 0B
cd /d "%~dp0"

set "PY=%~dp0python_embeded\python.exe"
set "UI_DIR=%~dp0..\ace-step-ui"

:: Cache local
set "ACESTEP_CACHE_DIR=%~dp0.cache\acestep"
set "TRITON_CACHE_DIR=%~dp0.cache\acestep\triton"
set "TORCHINDUCTOR_CACHE_DIR=%~dp0.cache\acestep\torchinductor"
set "HF_HOME=%~dp0.cache\huggingface"
set "MODELSCOPE_CACHE=%~dp0.cache\modelscope"

:: ═══════════════════════════════════════════════════════════
cls
echo.
echo  ========================================================
echo        ACE-Step UI - Interfaz tipo Suno
echo        Arranca todo automaticamente
echo  ========================================================
echo.

:: ─── Verificaciones ────────────────────────────────────────
set "ERRORES=0"

if not exist "%PY%" (
    echo  [X] Python embebido NO encontrado
    set "ERRORES=1"
) else (
    echo  [OK] Python embebido
)

if not exist "%UI_DIR%\node_modules" (
    echo  [X] Frontend: dependencias no instaladas
    set "ERRORES=1"
) else (
    echo  [OK] Frontend - node_modules
)

if not exist "%UI_DIR%\server\node_modules" (
    echo  [X] Backend: dependencias no instaladas
    set "ERRORES=1"
) else (
    echo  [OK] Backend - server/node_modules
)

if not exist "checkpoints\acestep-v15-turbo" (
    echo  [!] DiT turbo no descargado
) else (
    echo  [OK] DiT: acestep-v15-turbo
)

where npm >nul 2>&1
if errorlevel 1 (
    echo  [X] npm no encontrado en PATH
    set "ERRORES=1"
) else (
    echo  [OK] npm disponible
)

echo.

if "%ERRORES%"=="1" (
    echo  Corrige los errores antes de continuar.
    pause
    exit /b 1
)

"%PY%" -c "import torch; print(f'  GPU: {torch.cuda.get_device_name(0)} ({round(torch.cuda.get_device_properties(0).total_mem/1024**3,1)} GB)') if torch.cuda.is_available() else print('  GPU: No disponible')" 2>nul
echo.

:: ═══════════════════════════════════════════════════════════
:: PASO 0: Liberar puertos
:: ═══════════════════════════════════════════════════════════
echo  [0/3] Liberando puertos 8001, 3001, 3000...
for %%P in (8001 3001 3000) do (
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
echo        Puertos libres.
echo.

:: ═══════════════════════════════════════════════════════════
:: PASO 1: ACE-Step Gradio + API (puerto 8001)
:: ═══════════════════════════════════════════════════════════
echo  [1/3] Arrancando ACE-Step Gradio + API (puerto 8001)...
echo        Cargando modelos (30-60 seg)...
start "" /min "%~dp0_start_gradio_api.bat"

:: Esperar a que responda /config (hasta 120s)
set "INTENTOS=0"
:WAIT_API
set /a INTENTOS+=1
if %INTENTOS% GTR 60 (
    echo.
    echo  [!] La API no respondio en 120 seg.
    echo      Revisa la ventana "ACE-Step Gradio API"
    pause >nul
    goto START_BACKEND
)
"%PY%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/config', timeout=2)" 2>nul && goto API_OK
timeout /t 2 /nobreak >nul
set /a MOD=%INTENTOS% %% 5
if %MOD%==0 echo        ...esperando %INTENTOS%x2s...
goto WAIT_API

:API_OK
echo        API Gradio lista en puerto 8001
echo.

:: ═══════════════════════════════════════════════════════════
:: PASO 2: Backend Express (puerto 3001)
:: ═══════════════════════════════════════════════════════════
:START_BACKEND
echo  [2/3] Arrancando Backend (puerto 3001)...
start "" /min "%~dp0_start_backend.bat"

set "INTENTOS=0"
:WAIT_BACKEND
set /a INTENTOS+=1
if %INTENTOS% GTR 15 (
    echo        Backend tardo mas de lo esperado, continuando...
    goto START_FRONTEND
)
"%PY%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3001/health', timeout=2)" 2>nul && goto BACKEND_OK
timeout /t 2 /nobreak >nul
goto WAIT_BACKEND

:BACKEND_OK
echo        Backend listo en puerto 3001
echo.

:: ═══════════════════════════════════════════════════════════
:: PASO 3: Frontend Vite (puerto 3000)
:: ═══════════════════════════════════════════════════════════
:START_FRONTEND
echo  [3/3] Arrancando Frontend (puerto 3000)...
start "" /min "%~dp0_start_frontend.bat"

timeout /t 6 /nobreak >nul
echo        Frontend arrancado
echo.

:: ═══════════════════════════════════════════════════════════
:: LISTO
:: ═══════════════════════════════════════════════════════════
echo.
echo  ========================================================
echo        TODOS LOS SERVICIOS LISTOS
echo  ========================================================
echo.
echo    ACE-Step Gradio:  http://localhost:8001
echo    Backend API:      http://localhost:3001
echo    Frontend (Suno):  http://localhost:3000
echo.
echo    Abriendo navegador...
echo.
echo  ========================================================
echo    Para detener: pulsa una tecla en esta ventana
echo  ========================================================
echo.

start http://localhost:3000

echo  Esperando... Pulsa cualquier tecla para DETENER TODO.
pause >nul

echo.
echo  Deteniendo servicios...

for %%P in (8001 3001 3000) do (
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
taskkill /FI "WINDOWTITLE eq ACE-Step Gradio API*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ACE-Step UI Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ACE-Step UI Frontend*" /F >nul 2>&1

echo  Todo detenido.
timeout /t 2 >nul
