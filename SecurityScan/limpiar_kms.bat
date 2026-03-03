@echo off
setlocal enabledelayedexpansion
if "%~1"=="--run" goto :main

chcp 65001 >nul 2>&1
title Limpiador de Residuos KMS
color 0C

REM Generar nombre de log con fecha y hora exacta
set "HH=%time:~0,2%"
set "MM=%time:~3,2%"
set "SS=%time:~6,2%"
set "LOGFILE=%~dp0log_limpieza_%date:~6,4%-%date:~3,2%-%date:~0,2%_%HH%h%MM%m%SS%s.txt"
set "LOGFILE=!LOGFILE: =0!"

echo ============================================================
echo    LIMPIADOR DE RESIDUOS KMS / KMSpico
echo    %date% %time%
echo ============================================================
echo.
echo ATENCION: Este script ELIMINARA los rastros de KMSpico.
echo Necesita ejecutarse como ADMINISTRADOR.
echo.
echo Asegurate de haber ejecutado primero escanear_seguridad.bat
echo para saber que hay en tu sistema.
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Este script necesita permisos de ADMINISTRADOR.
    echo         Haz clic derecho -^> Ejecutar como administrador.
    echo.
    echo Presiona cualquier tecla para cerrar...
    pause >nul
    exit /b 1
)

echo Ejecutando como administrador: OK
echo.

set /p CONFIRMAR="Deseas continuar con la limpieza? (S/N): "
if /i not "%CONFIRMAR%"=="S" (
    echo Cancelado por el usuario.
    echo.
    echo Presiona cualquier tecla para cerrar...
    pause >nul
    exit /b 0
)

echo.
echo Todo lo que veas aqui se guarda automaticamente en:
echo    !LOGFILE!
echo.

cmd /c ""%~f0" --run" 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '!LOGFILE!'"

echo.
echo ============================================================
echo    LOG COMPLETO GUARDADO EN:
echo    !LOGFILE!
echo ============================================================
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause >nul
exit /b

:main
chcp 65001 >nul 2>&1

echo ============================================================
echo    INICIANDO LIMPIEZA DE RESIDUOS KMS
echo    %date% %time%
echo ============================================================
echo.

echo [1/6] Eliminando entrada IFEO de SppExtComObj.exe...
reg delete "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\SppExtComObj.exe" /f 2>nul
if %errorlevel% equ 0 (
    echo    [ELIMINADO] IFEO SppExtComObj.exe
) else (
    echo    [OK] No existia - LIMPIO
)

echo [2/6] Eliminando claves KMS del registro...
reg delete "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform" /v KeyManagementServiceName /f 2>nul
if %errorlevel% equ 0 (
    echo    [ELIMINADO] KeyManagementServiceName
) else (
    echo    [OK] No existia - LIMPIO
)
reg delete "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform" /v KeyManagementServicePort /f 2>nul
if %errorlevel% equ 0 (
    echo    [ELIMINADO] KeyManagementServicePort
) else (
    echo    [OK] No existia - LIMPIO
)

echo [3/6] Eliminando archivos SECOH...
del /f /q "%windir%\System32\SECOH-QAD.dll" 2>nul
del /f /q "%windir%\System32\SECOH-QAD.exe" 2>nul
del /f /q "%windir%\SysWOW64\SECOH-QAD.dll" 2>nul
del /f /q "%windir%\SysWOW64\SECOH-QAD.exe" 2>nul
echo    [OK] Archivos SECOH procesados

echo [4/6] Buscando y eliminando servicios AutoKMS...
sc query AutoKMS >nul 2>&1
if %errorlevel% equ 0 (
    sc stop AutoKMS >nul 2>&1
    sc delete AutoKMS >nul 2>&1
    echo    [ELIMINADO] Servicio AutoKMS
) else (
    echo    [OK] Servicio AutoKMS no encontrado - LIMPIO
)

echo [5/6] Buscando y eliminando tareas programadas KMS...
schtasks /delete /tn "AutoKMS" /f 2>nul
if %errorlevel% equ 0 (
    echo    [ELIMINADO] Tarea AutoKMS
) else (
    echo    [OK] Tarea AutoKMS no encontrada - LIMPIO
)
schtasks /delete /tn "AutoPico" /f 2>nul
if %errorlevel% equ 0 (
    echo    [ELIMINADO] Tarea AutoPico
) else (
    echo    [OK] Tarea AutoPico no encontrada - LIMPIO
)

echo [6/6] Reiniciando servicio de proteccion de software...
net stop sppsvc 2>nul
net start sppsvc 2>nul
echo    [OK] Servicio sppsvc reiniciado

echo.
echo ============================================================
echo    LIMPIEZA COMPLETADA
echo ============================================================
echo.
echo NOTA: Despues de limpiar, Windows puede mostrar que no esta
echo activado. Esto es normal si se estaba usando KMS para la
echo activacion.
echo.
echo Se recomienda ejecutar escanear_seguridad.bat de nuevo para
echo verificar que todo quedo limpio.
echo.

exit /b
