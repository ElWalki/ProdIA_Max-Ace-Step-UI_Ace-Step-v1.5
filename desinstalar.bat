@echo off
chcp 65001 >nul 2>&1
title ACE-Step MAX - Desinstalar dependencias
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║          ACE-Step MAX - Desinstalar                     ║
echo ║   Elimina venv, node_modules y datos de usuario        ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo  Esto eliminara:
echo    - ACE-Step-1.5_\.venv  (entorno Python)
echo    - ace-step-ui\node_modules
echo    - ace-step-ui\server\node_modules
echo    - ace-step-ui\server\data\acestep.db
echo    - ace-step-ui\server\public\audio\*
echo.
echo  NO se eliminaran: modelos, LoRAs, codigo fuente.
echo.
set /p CONFIRM= ¿Confirmas? (s/N): 
if /i not "%CONFIRM%"=="s" (
    echo  Cancelado.
    pause
    exit /b 0
)

set "ACESTEP_DIR=%~dp0ACE-Step-1.5_"
set "UI_DIR=%~dp0ace-step-ui"

echo.
echo  [1/5] Eliminando entorno Python (.venv)...
if exist "%ACESTEP_DIR%\.venv" (
    rmdir /s /q "%ACESTEP_DIR%\.venv"
    echo       OK
) else (
    echo       No existe, omitiendo.
)

echo  [2/5] Eliminando node_modules frontend...
if exist "%UI_DIR%\node_modules" (
    rmdir /s /q "%UI_DIR%\node_modules"
    echo       OK
) else (
    echo       No existe, omitiendo.
)

echo  [3/5] Eliminando node_modules backend...
if exist "%UI_DIR%\server\node_modules" (
    rmdir /s /q "%UI_DIR%\server\node_modules"
    echo       OK
) else (
    echo       No existe, omitiendo.
)

echo  [4/5] Eliminando base de datos...
if exist "%UI_DIR%\server\data\acestep.db" (
    del /f /q "%UI_DIR%\server\data\acestep.db"
    echo       OK
) else (
    echo       No existe, omitiendo.
)

echo  [5/5] Eliminando audios generados...
if exist "%UI_DIR%\server\public\audio\" (
    del /f /q /s "%UI_DIR%\server\public\audio\*.*" >nul 2>&1
    echo       OK
) else (
    echo       No existe, omitiendo.
)

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   Desinstalacion completada                             ║
echo ║   Para volver a instalar ejecuta: setup.bat             ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
pause
