@echo off
chcp 65001 >nul 2>&1
title Restaurar Sesion Urban_Walki_V3 - 21 Feb 2026

:: ============================================================
::   BAT para restaurar la sesion de edicion de dataset
::   Proyecto: Urban_Walki_V3 (LoRA turbo)
::   Fecha snapshot: 21 Febrero 2026
:: ============================================================

cd /d "%~dp0"
set "ACEDIR=%~dp0ACE-Step-1.5_"
set "PY=%ACEDIR%\python_embeded\python.exe"

:: Verificar Python
if not exist "%PY%" (
    echo [ERROR] No se encontro Python embebido en %ACEDIR%\python_embeded\
    pause
    exit /b 1
)

:: Configurar variables de entorno
set "ACESTEP_CACHE_DIR=%ACEDIR%\.cache\acestep"
set "TRITON_CACHE_DIR=%ACEDIR%\.cache\acestep\triton"
set "TORCHINDUCTOR_CACHE_DIR=%ACEDIR%\.cache\acestep\torchinductor"
set "HF_HOME=%ACEDIR%\.cache\huggingface"
set "MODELSCOPE_CACHE=%ACEDIR%\.cache\modelscope"

:: ============================================================
::          CONFIGURACION DE LA SESION
:: ============================================================
:: .env settings (ya grabados en ACE-Step-1.5_/.env):
::   ACESTEP_CONFIG_PATH=acestep-v15-turbo
::   ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-1.7B
::   ACESTEP_DEVICE=auto
::   ACESTEP_LM_BACKEND=vllm
::
:: Dataset Settings:
::   Dataset Name:        Urban_Walki_V3
::   Custom Activation Tag: Walki-bass
::   Tag Position:        Prepend (tag, caption)
::   Genre Ratio:         40%%
::   All Instrumental:    No
::   Num Samples:         58
::   Audio Dir:           %ACEDIR%\datasets\urban_flow\dataset_IA
::
:: Samples editados: ~14-15 (del 0 al 14)
:: Samples restantes: ~43-44
:: ============================================================

cls
echo ============================================================
echo   Restaurar Sesion - Urban_Walki_V3
echo ============================================================
echo.
echo   Modelo:    acestep-v15-turbo
echo   LM:        acestep-5Hz-lm-1.7B
echo   Dataset:   Urban_Walki_V3 (58 samples)
echo   Tag:       Walki-bass (prepend)
echo   Genre:     40%%
echo   Editados:  ~14 de 58
echo.

:: Verificar que el .env tiene la config correcta
echo --- Verificando .env ---
findstr /C:"acestep-v15-turbo" "%ACEDIR%\.env" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo   [OK] Modelo turbo configurado
) else (
    echo   [!!] ADVERTENCIA: .env no tiene acestep-v15-turbo
    echo   Corrigiendo .env...
    (
        echo ACESTEP_CONFIG_PATH=acestep-v15-turbo
        echo ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-1.7B
        echo ACESTEP_DEVICE=auto
        echo ACESTEP_LM_BACKEND=vllm
    ) > "%ACEDIR%\.env"
    echo   [OK] .env restaurado
)
echo.

:: Verificar que existe el JSON guardado
echo --- Verificando dataset guardado ---
set "JSON_CONTINUAR=%ACEDIR%\datasets\Continuar.json"
set "JSON_ORIGINAL=%ACEDIR%\datasets\my_lora_dataset.json"

if exist "%JSON_CONTINUAR%" (
    echo   [OK] Encontrado: Continuar.json
    set "DATASET_JSON=./datasets/Continuar.json"
    echo        ^(Este es el que guardaste antes de dormir^)
) else if exist "%JSON_ORIGINAL%" (
    echo   [OK] Encontrado: my_lora_dataset.json
    set "DATASET_JSON=./datasets/my_lora_dataset.json"
    echo        ^(Usando el original - puede NO tener las ediciones manuales^)
    echo   [!!] ADVERTENCIA: Continuar.json no existe.
    echo        Si no guardaste con "Save Dataset" en Gradio, las ediciones se perdieron.
) else (
    echo   [ERROR] No se encontro ningun dataset JSON
    echo   Necesitas volver a hacer Scan + Auto-Label
    pause
    exit /b 1
)
echo.

:: Verificar audio
echo --- Verificando archivos de audio ---
set "AUDIO_DIR=%ACEDIR%\datasets\urban_flow\dataset_IA"
if exist "%AUDIO_DIR%" (
    set count=0
    for %%f in ("%AUDIO_DIR%\*.mp3" "%AUDIO_DIR%\*.wav" "%AUDIO_DIR%\*.flac" "%AUDIO_DIR%\*.ogg" "%AUDIO_DIR%\*.opus") do set /a count+=1
    echo   [OK] Directorio de audio existe: urban_flow\dataset_IA
) else (
    echo   [ERROR] No se encontro directorio de audio
    pause
    exit /b 1
)
echo.

:: Verificar checkpoints
echo --- Verificando modelos ---
if exist "%ACEDIR%\checkpoints\acestep-v15-turbo" (echo   [OK] DiT turbo) else (echo   [!!] FALTA DiT turbo)
if exist "%ACEDIR%\checkpoints\vae" (echo   [OK] VAE) else (echo   [!!] FALTA VAE)
if exist "%ACEDIR%\checkpoints\Qwen3-Embedding-0.6B" (echo   [OK] Text Encoder) else (echo   [!!] FALTA Text Encoder)
if exist "%ACEDIR%\checkpoints\acestep-5Hz-lm-1.7B" (echo   [OK] LM 1.7B) else (echo   [!!] FALTA LM 1.7B)
echo.

echo ============================================================
echo   Todo verificado. Lanzando Gradio...
echo ============================================================
echo.
echo   INSTRUCCIONES DESPUES DE CARGAR:
echo   ================================
echo   1. En Gradio, ve a "Load Existing Dataset"
echo   2. Escribe la ruta: %DATASET_JSON%
echo   3. Click "Load"
echo   4. Verifica que carga 58 samples con las ediciones
echo   5. Ve a Step 3 "Preview ^& Edit"
echo   6. Continua editando desde sample ~15
echo   7. Al terminar: "Save Dataset" en Step 4
echo   8. Luego ejecuta truncar_captions.py
echo.
echo   Presiona cualquier tecla para lanzar Gradio...
pause >nul

:: Liberar puerto 7860 si ya esta en uso
"%PY%" -c "import subprocess,re; o=subprocess.run(['netstat','-ano'],capture_output=True,text=True).stdout; pids=set(m.group(1) for m in re.finditer(r':7860\s+\S+\s+LISTENING\s+(\d+)',o)); [subprocess.run(['taskkill','/PID',p,'/F'],capture_output=True) for p in pids]; print('Puerto 7860 liberado') if pids else print('Puerto 7860 disponible')"

:: Lanzar Gradio
cd /d "%ACEDIR%"
echo.
echo La interfaz se abrira en: http://127.0.0.1:7860
echo Presiona Ctrl+C para detener el servidor.
echo.
"%PY%" -m acestep.acestep_v15_pipeline --server-name 127.0.0.1 --port 7860
echo.
echo ACE-Step se ha detenido.
pause
