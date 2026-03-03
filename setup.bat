@echo off
chcp 65001 >nul 2>&1
title ACE-Step MAX - Setup / Instalacion
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║          ACE-Step MAX - Instalacion inicial             ║
echo ║   Python venv + dependencias + Node.js UI              ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

set "ACESTEP_DIR=%~dp0ACE-Step-1.5_"
set "UI_DIR=%~dp0ace-step-ui"
set "VENV=%ACESTEP_DIR%\.venv"
set "PYTHON_EMBED=%ACESTEP_DIR%\python_embeded\python.exe"

REM ─── Detectar Python ──────────────────────────────────────
if exist "%PYTHON_EMBED%" (
    set "PYTHON=%PYTHON_EMBED%"
    echo  [OK] Python embebido encontrado.
    goto :PYTHON_FOUND
)

python --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('where python') do set "SYS_PYTHON=%%i" & goto :GOT_SYS_PYTHON
    :GOT_SYS_PYTHON
    echo  [OK] Python del sistema encontrado: %SYS_PYTHON%
    set "BASE_PYTHON=%SYS_PYTHON%"
    goto :CREATE_VENV
)

py --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Python launcher encontrado.
    set "BASE_PYTHON=py"
    goto :CREATE_VENV
)

echo  [ERROR] No se encontro Python. Instala Python 3.10 o 3.11 desde:
echo          https://www.python.org/downloads/
echo          Asegurate de marcar "Add Python to PATH"
pause
exit /b 1

:CREATE_VENV
echo.
echo  [1/4] Creando entorno virtual en ACE-Step-1.5_\.venv ...
if exist "%VENV%" (
    echo       Ya existe, omitiendo creacion.
) else (
    "%BASE_PYTHON%" -m venv "%VENV%"
    if %errorlevel% neq 0 (
        echo  [ERROR] No se pudo crear el venv.
        pause
        exit /b 1
    )
    echo       Creado correctamente.
)
set "PYTHON=%VENV%\Scripts\python.exe"

:PYTHON_FOUND
echo.
echo  [2/4] Instalando dependencias Python (requirements.txt)...
echo        Esto puede tardar varios minutos la primera vez...
echo        (PyTorch, Gradio, etc.)
echo.
"%PYTHON%" -m pip install --upgrade pip >nul 2>&1
"%PYTHON%" -m pip install -r "%ACESTEP_DIR%\requirements.txt"
if %errorlevel% neq 0 (
    echo.
    echo  [AVISO] Algunos paquetes pueden haber fallado.
    echo          Revisa los errores arriba. Si es CUDA/torch,
    echo          instala manualmente segun tu GPU:
    echo          https://pytorch.org/get-started/locally/
    echo.
    pause
)

echo.
echo  [3/4] Instalando dependencias Node.js - Frontend...
if exist "%UI_DIR%\node_modules" (
    echo       Ya instaladas, omitiendo.
) else (
    cd /d "%UI_DIR%"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install fallo en frontend.
        pause
        exit /b 1
    )
)

echo.
echo  [4/4] Instalando dependencias Node.js - Backend...
if exist "%UI_DIR%\server\node_modules" (
    echo       Ya instaladas, omitiendo.
) else (
    cd /d "%UI_DIR%\server"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install fallo en backend.
        pause
        exit /b 1
    )
)

cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   Instalacion completada                                ║
echo ╠══════════════════════════════════════════════════════════╣
echo ║                                                         ║
echo ║   Ahora ejecuta: iniciar_todo.bat                       ║
echo ║                                                         ║
echo ║   NOTA: Los modelos de IA se descargan la primera vez   ║
echo ║   que inicias el Gradio API (~10-20 GB).                ║
echo ║   Necesitas conexion a internet la primera vez.         ║
echo ║                                                         ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
pause
