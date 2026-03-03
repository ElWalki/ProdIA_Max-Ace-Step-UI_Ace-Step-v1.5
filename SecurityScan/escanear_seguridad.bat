@echo off
setlocal enabledelayedexpansion
if "%~1"=="--run" goto :main

chcp 65001 >nul 2>&1
title Escaner de Seguridad del Sistema
color 0B

REM Generar nombre de log con fecha y hora exacta
set "HH=%time:~0,2%"
set "MM=%time:~3,2%"
set "SS=%time:~6,2%"
set "LOGFILE=%~dp0log_escaneo_%date:~6,4%-%date:~3,2%-%date:~0,2%_%HH%h%MM%m%SS%s.txt"
set "LOGFILE=!LOGFILE: =0!"

echo ============================================================
echo    Todo lo que veas aqui se guarda automaticamente en:
echo    !LOGFILE!
echo ============================================================
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
echo        ESCANER DE SEGURIDAD DEL SISTEMA
echo        %date% %time%
echo        Equipo: %COMPUTERNAME%
echo ============================================================
echo.

set "OUTDIR=%~dp0resultados_%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%"
set "OUTDIR=%OUTDIR: =0%"
mkdir "%OUTDIR%" 2>nul

echo Carpeta de reportes: %OUTDIR%
echo.

echo [1/8] Escaneando puertos abiertos y conexiones activas...
echo ============================================================ > "%OUTDIR%\1_puertos_y_conexiones.txt"
echo PUERTOS ABIERTOS Y CONEXIONES DE RED ACTIVAS >> "%OUTDIR%\1_puertos_y_conexiones.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\1_puertos_y_conexiones.txt"
echo ============================================================ >> "%OUTDIR%\1_puertos_y_conexiones.txt"
echo. >> "%OUTDIR%\1_puertos_y_conexiones.txt"
echo --- CONEXIONES ACTIVAS (con programa asociado) --- >> "%OUTDIR%\1_puertos_y_conexiones.txt"
netstat -abno >> "%OUTDIR%\1_puertos_y_conexiones.txt" 2>&1
echo. >> "%OUTDIR%\1_puertos_y_conexiones.txt"
echo --- PUERTOS EN ESCUCHA (LISTENING) --- >> "%OUTDIR%\1_puertos_y_conexiones.txt"
netstat -ano | findstr "LISTENING" >> "%OUTDIR%\1_puertos_y_conexiones.txt" 2>&1
echo. >> "%OUTDIR%\1_puertos_y_conexiones.txt"
echo --- BUSQUEDA ESPECIFICA: Puerto 1688 (KMS) --- >> "%OUTDIR%\1_puertos_y_conexiones.txt"
netstat -ano | findstr "1688" >> "%OUTDIR%\1_puertos_y_conexiones.txt" 2>&1
if %errorlevel% neq 0 (
    echo    [OK] Puerto 1688 NO esta en uso - LIMPIO
    echo [OK] Puerto 1688 NO esta en uso - LIMPIO >> "%OUTDIR%\1_puertos_y_conexiones.txt"
) else (
    echo    [!!] PUERTO 1688 DETECTADO - Revisa el reporte
    echo [!!] PUERTO 1688 DETECTADO >> "%OUTDIR%\1_puertos_y_conexiones.txt"
)

echo [2/8] Revisando reglas del Firewall sospechosas...
echo ============================================================ > "%OUTDIR%\2_firewall.txt"
echo REGLAS DEL FIREWALL DE WINDOWS >> "%OUTDIR%\2_firewall.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\2_firewall.txt"
echo ============================================================ >> "%OUTDIR%\2_firewall.txt"
echo. >> "%OUTDIR%\2_firewall.txt"
echo --- REGLAS DE ENTRADA HABILITADAS --- >> "%OUTDIR%\2_firewall.txt"
netsh advfirewall firewall show rule name=all dir=in | findstr /i "Rule Name: Enabled: Action: Program: LocalPort:" >> "%OUTDIR%\2_firewall.txt" 2>&1
echo. >> "%OUTDIR%\2_firewall.txt"
echo --- BUSQUEDA: Reglas con puerto 1688 --- >> "%OUTDIR%\2_firewall.txt"
netsh advfirewall firewall show rule name=all dir=in | findstr /i "1688" >> "%OUTDIR%\2_firewall.txt" 2>&1
if %errorlevel% neq 0 (
    echo    [OK] No hay reglas de firewall con puerto 1688 - LIMPIO
    echo [OK] No hay reglas de firewall con puerto 1688 - LIMPIO >> "%OUTDIR%\2_firewall.txt"
) else (
    echo    [!!] Regla con puerto 1688 encontrada - Revisa el reporte
)

echo [3/8] Comprobando Image File Execution Options (IFEO)...
echo ============================================================ > "%OUTDIR%\3_ifeo_hijacking.txt"
echo IMAGE FILE EXECUTION OPTIONS - DETECCION DE HIJACKING >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo ============================================================ >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo. >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo IFEO es usado legitimamente para depuracion, pero malware >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo puede usarlo para interceptar procesos del sistema. >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo Entradas con "Debugger" son las potencialmente peligrosas. >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo. >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo --- Buscando entradas con Debugger configurado --- >> "%OUTDIR%\3_ifeo_hijacking.txt"
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options" /s /v Debugger 2>&1 >> "%OUTDIR%\3_ifeo_hijacking.txt"
if %errorlevel% neq 0 (
    echo    [OK] No se encontraron entradas IFEO con Debugger - LIMPIO
    echo [OK] No se encontraron entradas IFEO con Debugger - LIMPIO >> "%OUTDIR%\3_ifeo_hijacking.txt"
) else (
    echo    [!!] ENTRADAS IFEO CON DEBUGGER ENCONTRADAS - REVISAR REPORTE
)
echo. >> "%OUTDIR%\3_ifeo_hijacking.txt"
echo --- Busqueda especifica: SppExtComObj.exe --- >> "%OUTDIR%\3_ifeo_hijacking.txt"
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\SppExtComObj.exe" 2>&1 >> "%OUTDIR%\3_ifeo_hijacking.txt"
if %errorlevel% neq 0 (
    echo    [OK] SppExtComObj.exe NO tiene IFEO configurado - LIMPIO
    echo [OK] SppExtComObj.exe NO tiene IFEO configurado - LIMPIO >> "%OUTDIR%\3_ifeo_hijacking.txt"
) else (
    echo    [!!] SppExtComObj.exe TIENE IFEO - POSIBLE HIJACKING
)

echo [4/8] Revisando servicios sospechosos...
echo ============================================================ > "%OUTDIR%\4_servicios.txt"
echo SERVICIOS DEL SISTEMA - ANALISIS >> "%OUTDIR%\4_servicios.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\4_servicios.txt"
echo ============================================================ >> "%OUTDIR%\4_servicios.txt"
echo. >> "%OUTDIR%\4_servicios.txt"
echo --- Estado del servicio de proteccion de software (sppsvc) --- >> "%OUTDIR%\4_servicios.txt"
sc query sppsvc >> "%OUTDIR%\4_servicios.txt" 2>&1
echo. >> "%OUTDIR%\4_servicios.txt"
echo --- Configuracion de sppsvc --- >> "%OUTDIR%\4_servicios.txt"
sc qc sppsvc >> "%OUTDIR%\4_servicios.txt" 2>&1
echo. >> "%OUTDIR%\4_servicios.txt"
echo --- Busqueda de servicios sospechosos (KMS/SECOH) --- >> "%OUTDIR%\4_servicios.txt"
echo (Servicios con rutas inusuales pueden ser sospechosos) >> "%OUTDIR%\4_servicios.txt"
wmic service where "PathName is not null" get Name,PathName,StartMode,State /format:list 2>>"%OUTDIR%\4_servicios.txt" | findstr /i "secoh kms kmspico" >> "%OUTDIR%\4_servicios.txt" 2>&1
if %errorlevel% neq 0 (
    echo    [OK] No se encontraron servicios KMS/SECOH activos - LIMPIO
    echo [OK] No se encontraron servicios KMS/SECOH activos - LIMPIO >> "%OUTDIR%\4_servicios.txt"
) else (
    echo    [!!] Servicios KMS/SECOH encontrados - Revisa el reporte
)

echo [5/8] Comprobando tareas programadas sospechosas...
echo ============================================================ > "%OUTDIR%\5_tareas_programadas.txt"
echo TAREAS PROGRAMADAS - BUSQUEDA DE SOSPECHOSAS >> "%OUTDIR%\5_tareas_programadas.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\5_tareas_programadas.txt"
echo ============================================================ >> "%OUTDIR%\5_tareas_programadas.txt"
echo. >> "%OUTDIR%\5_tareas_programadas.txt"
echo --- Buscando tareas con palabras clave sospechosas --- >> "%OUTDIR%\5_tareas_programadas.txt"
schtasks /query /fo LIST /v 2>&1 | findstr /i "TaskName Folder Author Run Status secoh kms kmspico autoKMS" >> "%OUTDIR%\5_tareas_programadas.txt" 2>&1
echo. >> "%OUTDIR%\5_tareas_programadas.txt"
echo --- Busqueda especifica de tareas KMS --- >> "%OUTDIR%\5_tareas_programadas.txt"
schtasks /query /fo LIST /v 2>&1 | findstr /i "kms" >> "%OUTDIR%\5_tareas_programadas.txt" 2>&1
if %errorlevel% neq 0 (
    echo    [OK] No se encontraron tareas programadas KMS - LIMPIO
    echo [OK] No se encontraron tareas programadas KMS - LIMPIO >> "%OUTDIR%\5_tareas_programadas.txt"
) else (
    echo    [!!] Tareas KMS encontradas - Revisa el reporte
)

echo [6/8] Escaneando registro de Windows (claves KMS)...
echo ============================================================ > "%OUTDIR%\6_registro_windows.txt"
echo REGISTRO DE WINDOWS - CLAVES RELACIONADAS CON ACTIVACION >> "%OUTDIR%\6_registro_windows.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\6_registro_windows.txt"
echo ============================================================ >> "%OUTDIR%\6_registro_windows.txt"
echo. >> "%OUTDIR%\6_registro_windows.txt"
echo --- SoftwareProtectionPlatform (KMS Config) --- >> "%OUTDIR%\6_registro_windows.txt"
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform" /v KeyManagementServiceName 2>&1 >> "%OUTDIR%\6_registro_windows.txt"
if %errorlevel% neq 0 (
    echo    [OK] KeyManagementServiceName no configurado - LIMPIO
    echo [OK] KeyManagementServiceName no configurado - LIMPIO >> "%OUTDIR%\6_registro_windows.txt"
) else (
    echo    [!!] KeyManagementServiceName CONFIGURADO - Revisa el reporte
)
echo. >> "%OUTDIR%\6_registro_windows.txt"
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform" /v KeyManagementServicePort 2>&1 >> "%OUTDIR%\6_registro_windows.txt"
if %errorlevel% neq 0 (
    echo    [OK] KeyManagementServicePort no configurado - LIMPIO
    echo [OK] KeyManagementServicePort no configurado - LIMPIO >> "%OUTDIR%\6_registro_windows.txt"
) else (
    echo    [!!] KeyManagementServicePort CONFIGURADO - Revisa el reporte
)
echo. >> "%OUTDIR%\6_registro_windows.txt"
echo --- Estado de licencia de Windows --- >> "%OUTDIR%\6_registro_windows.txt"
cscript //nologo "%windir%\System32\slmgr.vbs" /dli 2>&1 >> "%OUTDIR%\6_registro_windows.txt"
echo. >> "%OUTDIR%\6_registro_windows.txt"
echo --- Detalle de licencia --- >> "%OUTDIR%\6_registro_windows.txt"
cscript //nologo "%windir%\System32\slmgr.vbs" /dlv 2>&1 >> "%OUTDIR%\6_registro_windows.txt"
echo    [OK] Registro escaneado

echo [7/8] Buscando archivos sospechosos en el sistema...
echo ============================================================ > "%OUTDIR%\7_archivos_sospechosos.txt"
echo BUSQUEDA DE ARCHIVOS SOSPECHOSOS >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo ============================================================ >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo. >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo --- Buscando SECOH-QAD en System32 --- >> "%OUTDIR%\7_archivos_sospechosos.txt"
dir /s /b "%windir%\System32\SECOH*" 2>&1 >> "%OUTDIR%\7_archivos_sospechosos.txt"
if %errorlevel% neq 0 (
    echo    [OK] No se encontro SECOH en System32 - LIMPIO
    echo [OK] No se encontro SECOH en System32 - LIMPIO >> "%OUTDIR%\7_archivos_sospechosos.txt"
) else (
    echo    [!!] SECOH encontrado en System32 - Revisa el reporte
)
echo. >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo --- Buscando SECOH-QAD en SysWOW64 --- >> "%OUTDIR%\7_archivos_sospechosos.txt"
dir /s /b "%windir%\SysWOW64\SECOH*" 2>&1 >> "%OUTDIR%\7_archivos_sospechosos.txt"
if %errorlevel% neq 0 (
    echo    [OK] No se encontro SECOH en SysWOW64 - LIMPIO
    echo [OK] No se encontro SECOH en SysWOW64 - LIMPIO >> "%OUTDIR%\7_archivos_sospechosos.txt"
) else (
    echo    [!!] SECOH encontrado en SysWOW64 - Revisa el reporte
)
echo. >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo --- Buscando archivos KMS en ubicaciones comunes --- >> "%OUTDIR%\7_archivos_sospechosos.txt"
for %%D in ("%ProgramFiles%" "%ProgramFiles(x86)%" "%windir%" "%TEMP%" "%APPDATA%") do (
    dir /s /b "%%~D\*kmspico*" 2>nul >> "%OUTDIR%\7_archivos_sospechosos.txt"
    dir /s /b "%%~D\*secoh*" 2>nul >> "%OUTDIR%\7_archivos_sospechosos.txt"
    dir /s /b "%%~D\*AutoKMS*" 2>nul >> "%OUTDIR%\7_archivos_sospechosos.txt"
)
echo. >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo --- Buscando en carpeta del usuario --- >> "%OUTDIR%\7_archivos_sospechosos.txt"
dir /s /b "%USERPROFILE%\Desktop\*kmspico*" 2>nul >> "%OUTDIR%\7_archivos_sospechosos.txt"
dir /s /b "%USERPROFILE%\Downloads\*kmspico*" 2>nul >> "%OUTDIR%\7_archivos_sospechosos.txt"
echo    [OK] Archivos escaneados

echo [8/8] Consultando Windows Defender...
echo ============================================================ > "%OUTDIR%\8_defender_scan.txt"
echo WINDOWS DEFENDER - ESTADO Y AMENAZAS >> "%OUTDIR%\8_defender_scan.txt"
echo Fecha: %date% %time% >> "%OUTDIR%\8_defender_scan.txt"
echo ============================================================ >> "%OUTDIR%\8_defender_scan.txt"
echo. >> "%OUTDIR%\8_defender_scan.txt"
echo --- Estado de Windows Defender --- >> "%OUTDIR%\8_defender_scan.txt"
powershell -NoProfile -Command "Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated,QuickScanEndTime | Format-List" >> "%OUTDIR%\8_defender_scan.txt" 2>&1
echo. >> "%OUTDIR%\8_defender_scan.txt"
echo --- Amenazas detectadas recientemente --- >> "%OUTDIR%\8_defender_scan.txt"
powershell -NoProfile -Command "Get-MpThreatDetection | Select-Object -First 20 ThreatID,DomainUser,ProcessName,InitialDetectionTime,CleaningAction,Resources | Format-List" >> "%OUTDIR%\8_defender_scan.txt" 2>&1
echo. >> "%OUTDIR%\8_defender_scan.txt"
echo --- Historial de amenazas --- >> "%OUTDIR%\8_defender_scan.txt"
powershell -NoProfile -Command "Get-MpThreat | Select-Object -First 10 ThreatName,SeverityID,IsActive,DidThreatExecute | Format-List" >> "%OUTDIR%\8_defender_scan.txt" 2>&1
echo    [OK] Defender consultado

echo.
echo ============================================================
echo    GENERANDO RESUMEN...
echo ============================================================

REM Generar resumen
(
echo ============================================================
echo        RESUMEN DEL ESCANEO DE SEGURIDAD
echo        Fecha: %date% %time%
echo        Equipo: %COMPUTERNAME%
echo ============================================================
echo.
echo COMO INTERPRETAR LOS RESULTADOS:
echo.
echo   [OK] ... LIMPIO   = No se encontro nada sospechoso
echo   [!!] ...          = Se encontro algo que debes revisar
echo.
echo ============================================================
echo ARCHIVOS GENERADOS:
echo ============================================================
echo.
echo   1_puertos_y_conexiones.txt  - Puertos abiertos, conexiones activas
echo   2_firewall.txt              - Reglas del firewall
echo   3_ifeo_hijacking.txt        - Interceptacion de procesos ^(CRITICO^)
echo   4_servicios.txt             - Servicios del sistema
echo   5_tareas_programadas.txt    - Tareas automaticas
echo   6_registro_windows.txt      - Claves de registro y licencia
echo   7_archivos_sospechosos.txt  - Archivos KMS/SECOH en el sistema
echo   8_defender_scan.txt         - Estado de Windows Defender
echo.
echo ============================================================
echo QUE BUSCAR EN CADA ARCHIVO:
echo ============================================================
echo.
echo   ARCHIVO 1 - Si el puerto 1688 aparece como LISTENING, algo
echo               sigue escuchando conexiones KMS.
echo.
echo   ARCHIVO 3 - EL MAS IMPORTANTE. Si SppExtComObj.exe tiene
echo               un Debugger configurado, hay hijacking activo.
echo               Si dice LIMPIO, esta bien.
echo.
echo   ARCHIVO 7 - Si aparecen archivos SECOH o KMSpico en
echo               System32 o SysWOW64, hay residuos.
echo.
echo   ARCHIVO 8 - Si Defender muestra amenazas activas,
echo               ejecuta un escaneo completo.
echo.
echo ============================================================
) > "%OUTDIR%\RESUMEN_LEER_PRIMERO.txt"

echo.
echo ============================================================
echo    ESCANEO COMPLETADO
echo ============================================================
echo.
echo    Reportes detallados en: %OUTDIR%
echo    Abre primero: RESUMEN_LEER_PRIMERO.txt
echo.
echo ============================================================

REM Abrir la carpeta de resultados
explorer "%OUTDIR%"

exit /b
