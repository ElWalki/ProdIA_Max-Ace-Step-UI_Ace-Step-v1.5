@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
::  VERIFICADOR Y DESCARGADOR DE MODELOS ACE-Step 1.5
::  Comprueba qué modelos están completos y cuáles faltan.
::  Permite descargar los que faltan de forma selectiva.
:: ============================================================================

set "CHECKPOINTS_DIR=%~dp0ACE-Step-1.5_\checkpoints"
set "PYTHON_DIR=%~dp0ACE-Step-1.5_\python_embeded"
set "SCRIPT_DIR=%~dp0ACE-Step-1.5_"

:: Buscar Python (embebido o del sistema)
set "PYTHON_CMD="
if exist "%PYTHON_DIR%\python.exe" (
    set "PYTHON_CMD=%PYTHON_DIR%\python.exe"
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_CMD=python"
    )
)

title Verificador de Modelos ACE-Step 1.5
cls
echo.
echo  ╔══════════════════════════════════════════════════════════════╗
echo  ║        VERIFICADOR DE MODELOS ACE-Step 1.5                  ║
echo  ╚══════════════════════════════════════════════════════════════╝
echo.
echo  Directorio de checkpoints:
echo  %CHECKPOINTS_DIR%
echo.
echo  ────────────────────────────────────────────────────────────────
echo  MODELOS PRINCIPALES (incluidos en ACE-Step/Ace-Step1.5)
echo  ────────────────────────────────────────────────────────────────

:: ===================== MODELOS PRINCIPALES =====================
set "MISSING_MAIN=0"
set "TOTAL_OK=0"
set "TOTAL_MISSING=0"

:: 1. acestep-v15-turbo (DiT por defecto)
set "M1_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-v15-turbo\model.safetensors" (
    set "M1_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
    set /a MISSING_MAIN+=1
)
echo   [!M1_STATUS!]  acestep-v15-turbo          (DiT turbo por defecto)

:: 2. vae
set "M2_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\vae\diffusion_pytorch_model.safetensors" (
    set "M2_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
    set /a MISSING_MAIN+=1
)
echo   [!M2_STATUS!]  vae                         (Codificador/Decodificador de audio)

:: 3. Qwen3-Embedding-0.6B (text encoder)
set "M3_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\Qwen3-Embedding-0.6B\model.safetensors" (
    set "M3_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
    set /a MISSING_MAIN+=1
)
echo   [!M3_STATUS!]  Qwen3-Embedding-0.6B        (Codificador de texto)

:: 4. acestep-5Hz-lm-1.7B (LM por defecto)
set "M4_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-5Hz-lm-1.7B\model.safetensors" (
    set "M4_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
    set /a MISSING_MAIN+=1
)
echo   [!M4_STATUS!]  acestep-5Hz-lm-1.7B         (Modelo de lenguaje 1.7B)

echo.
echo  ────────────────────────────────────────────────────────────────
echo  MODELOS OPCIONALES (repos separados en HuggingFace)
echo  ────────────────────────────────────────────────────────────────

:: ===================== MODELOS OPCIONALES =====================

:: 5. acestep-v15-base
set "M5_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-v15-base\model.safetensors" (
    set "M5_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
)
echo   [!M5_STATUS!]  acestep-v15-base             (DiT base, 50 pasos, CFG)

:: 6. acestep-v15-sft
set "M6_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-v15-sft\model.safetensors" (
    set "M6_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
)
echo   [!M6_STATUS!]  acestep-v15-sft              (DiT SFT, fine-tuned)

:: 7. acestep-v15-turbo-shift1
set "M7_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-v15-turbo-shift1\model.safetensors" (
    set "M7_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
)
echo   [!M7_STATUS!]  acestep-v15-turbo-shift1     (DiT turbo variante shift1)

:: 8. acestep-v15-turbo-shift3
set "M8_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-v15-turbo-shift3\model.safetensors" (
    set "M8_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
)
echo   [!M8_STATUS!]  acestep-v15-turbo-shift3     (DiT turbo variante shift3)

:: 9. acestep-v15-turbo-continuous
set "M9_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-v15-turbo-continuous\model.safetensors" (
    set "M9_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
)
echo   [!M9_STATUS!]  acestep-v15-turbo-continuous (DiT turbo continuo)

:: 10. acestep-5Hz-lm-0.6B
set "M10_STATUS=FALTA"
if exist "%CHECKPOINTS_DIR%\acestep-5Hz-lm-0.6B\model.safetensors" (
    set "M10_STATUS=  OK  "
    set /a TOTAL_OK+=1
) else (
    set /a TOTAL_MISSING+=1
)
echo   [!M10_STATUS!]  acestep-5Hz-lm-0.6B         (Modelo de lenguaje 0.6B)

:: 11. acestep-5Hz-lm-4B
set "M11_STATUS=FALTA"
set "M11_FILE=model-00001-of-00002.safetensors"
if exist "%CHECKPOINTS_DIR%\acestep-5Hz-lm-4B\model-00001-of-00002.safetensors" (
    if exist "%CHECKPOINTS_DIR%\acestep-5Hz-lm-4B\model-00002-of-00002.safetensors" (
        set "M11_STATUS=  OK  "
        set /a TOTAL_OK+=1
    ) else (
        set /a TOTAL_MISSING+=1
    )
) else (
    set /a TOTAL_MISSING+=1
)
echo   [!M11_STATUS!]  acestep-5Hz-lm-4B           (Modelo de lenguaje 4B)

echo.
echo  ────────────────────────────────────────────────────────────────
echo   Resumen:  !TOTAL_OK! completos  /  !TOTAL_MISSING! faltan
echo  ────────────────────────────────────────────────────────────────

if !TOTAL_MISSING! equ 0 (
    echo.
    echo   Todos los modelos estan completos. No hay nada que descargar.
    echo.
    pause
    exit /b 0
)

echo.
echo  ╔══════════════════════════════════════════════════════════════╗
echo  ║  OPCIONES DE DESCARGA                                      ║
echo  ╚══════════════════════════════════════════════════════════════╝
echo.

if !MISSING_MAIN! gtr 0 (
    echo   [0] Descargar modelos PRINCIPALES que faltan (esencial para funcionar)
)
echo   [1] acestep-v15-base              (~4.5 GB) - ACE-Step/acestep-v15-base
echo   [2] acestep-v15-sft               (~4.5 GB) - ACE-Step/acestep-v15-sft
echo   [3] acestep-v15-turbo-shift1      (~4.5 GB) - ACE-Step/acestep-v15-turbo-shift1
echo   [4] acestep-v15-turbo-shift3      (~4.5 GB) - ACE-Step/acestep-v15-turbo-shift3
echo   [5] acestep-v15-turbo-continuous  (~4.5 GB) - ACE-Step/acestep-v15-turbo-continuous
echo   [6] acestep-5Hz-lm-0.6B          (~1.2 GB) - ACE-Step/acestep-5Hz-lm-0.6B
echo   [7] acestep-5Hz-lm-4B            (~7.8 GB) - ACE-Step/acestep-5Hz-lm-4B
echo   [8] Descargar TODOS los que faltan
echo   [9] Salir
echo.

set /p "CHOICE=  Elige una opcion (0-9): "

if "%PYTHON_CMD%"=="" (
    echo.
    echo   ERROR: No se encontro Python. Se usara huggingface-cli directamente.
    echo   Asegurate de tener instalado: pip install huggingface_hub
    echo.
    goto :use_hf_cli
)

:: ===================== EJECUTAR DESCARGA =====================

if "%CHOICE%"=="0" goto :download_main
if "%CHOICE%"=="1" goto :download_1
if "%CHOICE%"=="2" goto :download_2
if "%CHOICE%"=="3" goto :download_3
if "%CHOICE%"=="4" goto :download_4
if "%CHOICE%"=="5" goto :download_5
if "%CHOICE%"=="6" goto :download_6
if "%CHOICE%"=="7" goto :download_7
if "%CHOICE%"=="8" goto :download_all
if "%CHOICE%"=="9" goto :exit_script

echo   Opcion no valida.
pause
goto :exit_script

:download_main
echo.
echo   Descargando modelos principales desde ACE-Step/Ace-Step1.5 ...
echo.
%PYTHON_CMD% -c "from huggingface_hub import snapshot_download; snapshot_download('ACE-Step/Ace-Step1.5', local_dir=r'%CHECKPOINTS_DIR%', local_dir_use_symlinks=False)"
if !errorlevel! equ 0 (
    echo.
    echo   Modelos principales descargados correctamente.
) else (
    echo.
    echo   ERROR en la descarga. Revisa tu conexion o token de HuggingFace.
)
pause
goto :exit_script

:download_1
call :do_download "acestep-v15-base" "ACE-Step/acestep-v15-base"
goto :exit_script

:download_2
call :do_download "acestep-v15-sft" "ACE-Step/acestep-v15-sft"
goto :exit_script

:download_3
call :do_download "acestep-v15-turbo-shift1" "ACE-Step/acestep-v15-turbo-shift1"
goto :exit_script

:download_4
call :do_download "acestep-v15-turbo-shift3" "ACE-Step/acestep-v15-turbo-shift3"
goto :exit_script

:download_5
call :do_download "acestep-v15-turbo-continuous" "ACE-Step/acestep-v15-turbo-continuous"
goto :exit_script

:download_6
call :do_download "acestep-5Hz-lm-0.6B" "ACE-Step/acestep-5Hz-lm-0.6B"
goto :exit_script

:download_7
call :do_download "acestep-5Hz-lm-4B" "ACE-Step/acestep-5Hz-lm-4B"
goto :exit_script

:download_all
echo.
echo   Descargando TODOS los modelos que faltan...
echo.

:: Primero los principales si faltan
if !MISSING_MAIN! gtr 0 (
    echo   --- Modelos principales ---
    %PYTHON_CMD% -c "from huggingface_hub import snapshot_download; snapshot_download('ACE-Step/Ace-Step1.5', local_dir=r'%CHECKPOINTS_DIR%', local_dir_use_symlinks=False)"
    echo.
)

:: Luego los opcionales que falten
if "!M5_STATUS!"=="FALTA" call :do_download "acestep-v15-base" "ACE-Step/acestep-v15-base"
if "!M6_STATUS!"=="FALTA" call :do_download "acestep-v15-sft" "ACE-Step/acestep-v15-sft"
if "!M7_STATUS!"=="FALTA" call :do_download "acestep-v15-turbo-shift1" "ACE-Step/acestep-v15-turbo-shift1"
if "!M8_STATUS!"=="FALTA" call :do_download "acestep-v15-turbo-shift3" "ACE-Step/acestep-v15-turbo-shift3"
if "!M9_STATUS!"=="FALTA" call :do_download "acestep-v15-turbo-continuous" "ACE-Step/acestep-v15-turbo-continuous"
if "!M10_STATUS!"=="FALTA" call :do_download "acestep-5Hz-lm-0.6B" "ACE-Step/acestep-5Hz-lm-0.6B"
if "!M11_STATUS!"=="FALTA" call :do_download "acestep-5Hz-lm-4B" "ACE-Step/acestep-5Hz-lm-4B"

echo.
echo   Descarga completa. Vuelve a ejecutar este script para verificar.
pause
goto :exit_script

:: ===================== FUNCION DE DESCARGA =====================
:do_download
set "MODEL_NAME=%~1"
set "REPO_ID=%~2"
set "DEST=%CHECKPOINTS_DIR%\%MODEL_NAME%"

echo.
echo   Descargando %MODEL_NAME% desde %REPO_ID% ...
echo   Destino: %DEST%
echo.
%PYTHON_CMD% -c "from huggingface_hub import snapshot_download; snapshot_download('%REPO_ID%', local_dir=r'%DEST%', local_dir_use_symlinks=False)"
if !errorlevel! equ 0 (
    echo   [OK] %MODEL_NAME% descargado correctamente.
) else (
    echo   [ERROR] Fallo al descargar %MODEL_NAME%.
)
echo.
pause
goto :eof

:: ===================== FALLBACK: huggingface-cli =====================
:use_hf_cli
echo.
echo  Comandos manuales para descargar con huggingface-cli:
echo.
echo   Modelos principales:
echo     huggingface-cli download ACE-Step/Ace-Step1.5 --local-dir "%CHECKPOINTS_DIR%"
echo.
echo   Modelos individuales:
echo     huggingface-cli download ACE-Step/acestep-v15-base --local-dir "%CHECKPOINTS_DIR%\acestep-v15-base"
echo     huggingface-cli download ACE-Step/acestep-v15-sft --local-dir "%CHECKPOINTS_DIR%\acestep-v15-sft"
echo     huggingface-cli download ACE-Step/acestep-v15-turbo-shift1 --local-dir "%CHECKPOINTS_DIR%\acestep-v15-turbo-shift1"
echo     huggingface-cli download ACE-Step/acestep-v15-turbo-shift3 --local-dir "%CHECKPOINTS_DIR%\acestep-v15-turbo-shift3"
echo     huggingface-cli download ACE-Step/acestep-v15-turbo-continuous --local-dir "%CHECKPOINTS_DIR%\acestep-v15-turbo-continuous"
echo     huggingface-cli download ACE-Step/acestep-5Hz-lm-0.6B --local-dir "%CHECKPOINTS_DIR%\acestep-5Hz-lm-0.6B"
echo     huggingface-cli download ACE-Step/acestep-5Hz-lm-4B --local-dir "%CHECKPOINTS_DIR%\acestep-5Hz-lm-4B"
echo.
pause
goto :exit_script

:exit_script
endlocal
exit /b 0
