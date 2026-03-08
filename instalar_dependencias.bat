@echo off
chcp 65001 >nul 2>&1
title ProdIA pro - Instalar dependencias / Install dependencies
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   ProdIA pro - Instalar Dependencias / Install Deps      ║
echo ║   Python + Node.js (sin iniciar servidores)              ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

set "ACESTEP_DIR=%~dp0ACE-Step-1.5_"
set "UI_DIR=%~dp0ace-step-ui"
set "PRO_UI_DIR=%~dp0ace-step-ui-pro"
set "VENV=%ACESTEP_DIR%\.venv"

REM ─── Node.js ────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js no encontrado / not found. Instala desde https://nodejs.org/
    pause
    exit /b 1
)
echo  [OK] Node.js encontrado / found.

REM ─── Python ─────────────────────────────────────────────────
set "PYTHON="
if exist "%ACESTEP_DIR%\python_embeded\python.exe" (
    set "PYTHON=%ACESTEP_DIR%\python_embeded\python.exe"
    echo  [OK] Python embebido encontrado / Embedded Python found.
    goto :PY_INSTALL
)
if exist "%VENV%\Scripts\python.exe" (
    set "PYTHON=%VENV%\Scripts\python.exe"
    echo  [OK] Entorno virtual encontrado / Virtual env found.
    goto :PY_INSTALL
)
set "BASE_PYTHON="
python --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('where python') do set "BASE_PYTHON=%%i" & goto :MAKE_VENV
)
py --version >nul 2>&1
if %errorlevel% equ 0 ( set "BASE_PYTHON=py" & goto :MAKE_VENV )

echo  [ERROR] Python no encontrado / not found. Instala desde https://www.python.org/downloads/
pause
exit /b 1

:MAKE_VENV
if not exist "%VENV%" (
    echo  [Setup] Creando entorno virtual / Creating venv...
    "%BASE_PYTHON%" -m venv "%VENV%"
)
set "PYTHON=%VENV%\Scripts\python.exe"

:PY_INSTALL
echo.
echo  [1/4] Instalando dependencias Python / Installing Python deps...
"%PYTHON%" -m pip install --upgrade pip >nul 2>&1
if exist "%ACESTEP_DIR%\requirements.txt" (
    "%PYTHON%" -m pip install -r "%ACESTEP_DIR%\requirements.txt"
    if %errorlevel% neq 0 (
        echo  [AVISO] Algunos paquetes fallaron. Verifica CUDA/torch manualmente.
    ) else (
        echo. > "%ACESTEP_DIR%\.deps_installed"
        echo  [OK] Dependencias Python instaladas.
    )
)

echo.
echo  [2/4] Instalando dependencias UI / Installing UI deps...
cd /d "%UI_DIR%"
call npm install
if %errorlevel% neq 0 ( echo  [ERROR] npm install UI fallo. & pause & exit /b 1 )

echo.
echo  [3/4] Instalando dependencias backend / Installing backend deps...
cd /d "%UI_DIR%\server"
call npm install
if %errorlevel% neq 0 ( echo  [ERROR] npm install backend fallo. & pause & exit /b 1 )

echo.
echo  [4/4] Instalando dependencias Pro UI / Installing Pro UI deps...
if exist "%PRO_UI_DIR%\package.json" (
    cd /d "%PRO_UI_DIR%"
    call npm install
    if %errorlevel% neq 0 ( echo  [ERROR] npm install Pro UI fallo. & pause & exit /b 1 )
)

cd /d "%~dp0"
echo.
echo ═══════════════════════════════════════════════════════════
echo  Todas las dependencias instaladas correctamente.
echo  All dependencies installed successfully.
echo  Ahora puedes ejecutar: iniciar_todo.bat
echo ═══════════════════════════════════════════════════════════
echo.
pause
