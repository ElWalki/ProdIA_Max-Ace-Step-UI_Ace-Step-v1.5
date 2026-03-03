@echo off
chcp 65001 >nul 2>&1
title ACE-Step - Limpiar datos de usuario
cd /d "%~dp0"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║         ACE-Step - Limpiar datos de usuario             ║
echo ║   Esto elimina: base de datos, audios generados         ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo  ADVERTENCIA: Se eliminaran todos los usuarios, canciones
echo  y audios generados. Los modelos y el codigo NO se tocan.
echo.
set /p CONFIRM= ¿Confirmas? (s/N): 
if /i not "%CONFIRM%"=="s" (
    echo  Cancelado.
    pause
    exit /b 0
)

echo.
echo  [1/2] Eliminando base de datos...
if exist "%~dp0ace-step-ui\server\data\acestep.db" (
    del /f /q "%~dp0ace-step-ui\server\data\acestep.db"
    echo       OK - acestep.db eliminada
) else (
    echo       No existe, nada que borrar
)

echo  [2/2] Eliminando audios generados...
if exist "%~dp0ace-step-ui\server\public\audio\" (
    del /f /q /s "%~dp0ace-step-ui\server\public\audio\*.*" >nul 2>&1
    echo       OK - audios eliminados
) else (
    echo       No existe, nada que borrar
)

echo.
echo  ✓ Limpieza completada. Al iniciar la app se creara
echo    una base de datos nueva en blanco.
echo.
pause
