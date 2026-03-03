@echo off
chcp 65001 >nul 2>&1
title ACE-Step 1.5 - Generador de Musica con IA

:: Ir al directorio del script
cd /d "%~dp0"

:: Configurar variables de entorno para cache local
set "ACESTEP_CACHE_DIR=%~dp0.cache\acestep"
set "TRITON_CACHE_DIR=%~dp0.cache\acestep\triton"
set "TORCHINDUCTOR_CACHE_DIR=%~dp0.cache\acestep\torchinductor"
set "HF_HOME=%~dp0.cache\huggingface"
set "MODELSCOPE_CACHE=%~dp0.cache\modelscope"
set "PY=%~dp0python_embeded\python.exe"

:: Verificar que existe Python embebido
if not exist "%PY%" (
    echo [ERROR] No se encontro Python embebido en python_embeded\
    pause
    exit /b 1
)

:MENU
cls
echo ============================================================
echo          ACE-Step 1.5 - Generador de Musica con IA
echo ============================================================
echo.
"%PY%" --version
echo.
echo --- Estado de modelos ---
if exist "checkpoints\acestep-v15-turbo" (echo   [OK] DiT: acestep-v15-turbo) else (echo   [--] DiT: acestep-v15-turbo)
if exist "checkpoints\vae" (echo   [OK] VAE: encoder/decoder de audio) else (echo   [--] VAE)
if exist "checkpoints\Qwen3-Embedding-0.6B" (echo   [OK] Text Encoder: Qwen3-Embedding) else (echo   [--] Text Encoder)
if exist "checkpoints\acestep-5Hz-lm-0.6B" (echo   [OK] LM 0.6B) else (echo   [--] LM 0.6B)
if exist "checkpoints\acestep-5Hz-lm-1.7B" (echo   [OK] LM 1.7B) else (echo   [--] LM 1.7B)
if exist "checkpoints\acestep-5Hz-lm-4B" (echo   [OK] LM 4B) else (echo   [--] LM 4B)
echo.
echo --- Menu ---
echo   1. Iniciar Gradio UI (interfaz web)
echo   2. Iniciar API Server (REST API)
echo   3. Elegir modelo de lenguaje (LM)
echo   4. Descargar modelos por adelantado
echo   5. Configuracion avanzada
echo   6. Iniciar UI tipo Suno (ace-step-ui)
echo   0. Salir
echo.
set "opcion="
set /p "opcion=Elige una opcion [1]: "
if "%opcion%"=="" set "opcion=1"
if "%opcion%"=="1" goto GRADIO
if "%opcion%"=="2" goto API
if "%opcion%"=="3" goto ELEGIR_LM
if "%opcion%"=="4" goto DESCARGAR
if "%opcion%"=="5" goto AVANZADO
if "%opcion%"=="6" goto SUNO_UI
if "%opcion%"=="0" exit /b 0
goto MENU

:: ============================================================
:GRADIO
:: ============================================================
cls
echo ============================================================
echo          Iniciando Gradio UI
echo ============================================================
echo.
echo Configuracion actual:
if exist ".env" type ".env"
echo.
"%PY%" -c "import subprocess,re; o=subprocess.run(['netstat','-ano'],capture_output=True,text=True).stdout; pids=set(m.group(1) for m in re.finditer(r':7860\s+\S+\s+LISTENING\s+(\d+)',o)); [subprocess.run(['taskkill','/PID',p,'/F'],capture_output=True) for p in pids]; print('Puerto 7860 liberado') if pids else print('Puerto 7860 disponible')"
echo.
echo La interfaz se abrira en: http://127.0.0.1:7860
echo Si es la primera vez, los modelos se descargaran automaticamente.
echo Presiona Ctrl+C para detener el servidor.
echo ============================================================
echo.
"%PY%" -m acestep.acestep_v15_pipeline --server-name 127.0.0.1 --port 7860
echo.
echo ACE-Step se ha detenido.
pause
goto MENU

:: ============================================================
:API
:: ============================================================
cls
echo ============================================================
echo          Iniciando API Server
echo ============================================================
echo.
"%PY%" -c "import subprocess,re; o=subprocess.run(['netstat','-ano'],capture_output=True,text=True).stdout; pids=set(m.group(1) for m in re.finditer(r':8001\s+\S+\s+LISTENING\s+(\d+)',o)); [subprocess.run(['taskkill','/PID',p,'/F'],capture_output=True) for p in pids]; print('Puerto 8001 liberado') if pids else print('Puerto 8001 disponible')"
echo.
echo API: http://127.0.0.1:8001
echo Docs: http://127.0.0.1:8001/docs
echo Presiona Ctrl+C para detener.
echo ============================================================
echo.
"%PY%" -m acestep.api_server --host 127.0.0.1 --port 8001
echo.
echo API Server se ha detenido.
pause
goto MENU

:: ============================================================
:ELEGIR_LM
:: ============================================================
cls
echo ============================================================
echo          Elegir Modelo de Lenguaje (LM)
echo ============================================================
echo.
echo El modelo LM genera letras y parametros musicales.
echo.
echo   1. acestep-5Hz-lm-0.6B  (rapido, ~3 GB VRAM)
echo   2. acestep-5Hz-lm-1.7B  (equilibrado, ~8 GB VRAM) [recomendado 24GB]
echo   3. acestep-5Hz-lm-4B    (mejor calidad, ~12 GB VRAM)
echo   4. Sin modelo LM        (solo generacion manual)
echo   0. Volver al menu
echo.
echo Configuracion actual:
if exist ".env" findstr "ACESTEP_LM_MODEL_PATH" ".env"
echo.
set "lm_opcion="
set /p "lm_opcion=Elige modelo [2]: "
if "%lm_opcion%"=="" set "lm_opcion=2"
if "%lm_opcion%"=="0" goto MENU
if "%lm_opcion%"=="1" goto LM_06B
if "%lm_opcion%"=="2" goto LM_17B
if "%lm_opcion%"=="3" goto LM_4B
if "%lm_opcion%"=="4" goto LM_NONE
goto ELEGIR_LM

:LM_06B
set "LM_MODEL=acestep-5Hz-lm-0.6B"
goto LM_GUARDAR
:LM_17B
set "LM_MODEL=acestep-5Hz-lm-1.7B"
goto LM_GUARDAR
:LM_4B
set "LM_MODEL=acestep-5Hz-lm-4B"
goto LM_GUARDAR
:LM_NONE
set "LM_MODEL=none"
goto LM_GUARDAR

:LM_GUARDAR
"%PY%" -c "lm='%LM_MODEL%'; f=open('.env','w'); f.write('ACESTEP_CONFIG_PATH=acestep-v15-turbo\n'); f.write('ACESTEP_LM_MODEL_PATH='+lm+'\n'); f.write('ACESTEP_DEVICE=auto\n'); f.write('ACESTEP_LM_BACKEND=vllm\n'); f.close(); print('Modelo LM configurado: '+lm)"
echo.
pause
goto MENU

:: ============================================================
:DESCARGAR
:: ============================================================
cls
echo ============================================================
echo          Descargar Modelos
echo ============================================================
echo.
echo   1. Descargar TODO lo necesario (principal + LM del .env)
echo   2. Descargar solo modelo principal (DiT + VAE + Text Encoder)
echo   3. Descargar solo modelo LM actual (segun .env)
echo   4. Descargar TODOS los modelos LM (0.6B + 1.7B + 4B)
echo   0. Volver al menu
echo.
set "dl_opcion="
set /p "dl_opcion=Elige opcion [1]: "
if "%dl_opcion%"=="" set "dl_opcion=1"
if "%dl_opcion%"=="0" goto MENU
if "%dl_opcion%"=="1" goto DL_TODO
if "%dl_opcion%"=="2" goto DL_PRINCIPAL
if "%dl_opcion%"=="3" goto DL_LM_ACTUAL
if "%dl_opcion%"=="4" goto DL_LM_TODOS
goto DESCARGAR

:DL_TODO
echo.
echo === Descargando modelo principal (DiT + VAE + Text Encoder) ===
echo.
"%PY%" -c "from acestep.model_downloader import ensure_main_model; ensure_main_model()"
echo.
echo === Descargando modelo LM configurado en .env ===
echo.
"%PY%" -c "import os; from dotenv import load_dotenv; load_dotenv('.env'); lm=os.getenv('ACESTEP_LM_MODEL_PATH','acestep-5Hz-lm-0.6B'); print('Descargando: '+lm); from acestep.model_downloader import ensure_lm_model; ensure_lm_model(lm)"
echo.
echo ============================================================
echo   TODO descargado. Ya puedes iniciar ACE-Step (opcion 1).
echo ============================================================
pause
goto DESCARGAR

:DL_PRINCIPAL
echo.
echo Descargando modelo principal desde HuggingFace...
echo.
"%PY%" -c "from acestep.model_downloader import ensure_main_model; ensure_main_model()"
echo.
echo Descarga completada.
pause
goto DESCARGAR

:DL_LM_ACTUAL
echo.
echo Descargando modelo LM configurado en .env...
echo.
"%PY%" -c "import os; from dotenv import load_dotenv; load_dotenv('.env'); lm=os.getenv('ACESTEP_LM_MODEL_PATH','acestep-5Hz-lm-0.6B'); print('Descargando: '+lm); from acestep.model_downloader import ensure_lm_model; ensure_lm_model(lm)"
echo.
echo Descarga completada.
pause
goto DESCARGAR

:DL_LM_TODOS
echo.
echo Descargando todos los modelos LM (0.6B + 1.7B + 4B)...
echo.
"%PY%" -c "from acestep.model_downloader import ensure_lm_model; [ensure_lm_model(m) for m in ['acestep-5Hz-lm-0.6B','acestep-5Hz-lm-1.7B','acestep-5Hz-lm-4B']]"
echo.
echo Descarga completada.
pause
goto DESCARGAR

:: ============================================================
:SUNO_UI
:: ============================================================
cls
echo ============================================================
echo          Iniciando UI tipo Suno (ace-step-ui)
echo ============================================================
echo.
set "UI_DIR=%~dp0..\ace-step-ui"
if not exist "%UI_DIR%\node_modules" (
    echo [ERROR] ace-step-ui no esta instalado.
    echo Carpeta esperada: %UI_DIR%
    pause
    goto MENU
)
echo [1/3] Arrancando ACE-Step Gradio con API (puerto 8001)...
"%PY%" -c "import subprocess,re; o=subprocess.run(['netstat','-ano'],capture_output=True,text=True).stdout; pids=set(m.group(1) for m in re.finditer(r':8001\s+\S+\s+LISTENING\s+(\d+)',o)); [subprocess.run(['taskkill','/PID',p,'/F'],capture_output=True) for p in pids]; print('Puerto 8001 liberado') if pids else print('Puerto 8001 disponible')"
start "ACE-Step API (Suno UI)" cmd /s /k ""cd /d "%~dp0" && "%PY%" -m acestep.acestep_v15_pipeline --port 8001 --enable-api --backend pt --server-name 127.0.0.1""
echo Esperando a que la API se inicialice (puede tardar 30-60s cargando modelos)...
timeout /t 30 /nobreak >nul
echo.
echo [2/3] Arrancando Backend (puerto 3001)...
start "ACE-Step UI Backend" cmd /s /k ""cd /d "%UI_DIR%\server" && npm run dev""
timeout /t 5 /nobreak >nul
echo.
echo [3/3] Arrancando Frontend (puerto 3000)...
start "ACE-Step UI Frontend" cmd /s /k ""cd /d "%UI_DIR%" && npm run dev""
timeout /t 5 /nobreak >nul
echo.
echo ============================================================
echo   Todos los servicios arrancados!
echo ============================================================
echo.
echo   ACE-Step API:  http://localhost:8001
echo   Backend:       http://localhost:3001
echo   Frontend:      http://localhost:3000
echo.
echo   Cierra las ventanas para detener los servicios.
echo ============================================================
echo.
echo Abriendo navegador...
timeout /t 3 /nobreak >nul
start http://localhost:3000
echo.
pause
goto MENU

:: ============================================================
:AVANZADO
:: ============================================================
cls
echo ============================================================
echo          Configuracion Avanzada
echo ============================================================
echo.
echo   1. Editar .env manualmente
echo   2. Verificar GPU y CUDA
echo   3. Verificar paquetes instalados
echo   4. Limpiar cache
echo   0. Volver al menu
echo.
set "adv_opcion="
set /p "adv_opcion=Elige opcion: "
if "%adv_opcion%"=="0" goto MENU
if "%adv_opcion%"=="1" goto ADV_ENV
if "%adv_opcion%"=="2" goto ADV_GPU
if "%adv_opcion%"=="3" goto ADV_PKG
if "%adv_opcion%"=="4" goto ADV_CACHE
goto AVANZADO

:ADV_ENV
if exist ".env" (notepad ".env") else (notepad ".env.example")
goto AVANZADO

:ADV_GPU
echo.
"%PY%" -c "import torch; print('PyTorch: '+torch.__version__); print('CUDA disponible: '+str(torch.cuda.is_available())); print('CUDA version: '+str(torch.version.cuda)) if torch.cuda.is_available() else None; print('GPU: '+torch.cuda.get_device_name(0)) if torch.cuda.is_available() else None; print('VRAM: '+str(round(torch.cuda.get_device_properties(0).total_mem/1024**3,1))+' GB') if torch.cuda.is_available() else None"
echo.
pause
goto AVANZADO

:ADV_PKG
echo.
"%PY%" -c "import torch,gradio,transformers,diffusers; print('PyTorch: '+torch.__version__); print('Gradio: '+gradio.__version__); print('Transformers: '+transformers.__version__); print('Diffusers: '+diffusers.__version__)"
echo.
pause
goto AVANZADO

:ADV_CACHE
echo.
echo Limpiando cache de compilacion...
if exist ".cache\acestep\triton" rd /s /q ".cache\acestep\triton"
if exist ".cache\acestep\torchinductor" rd /s /q ".cache\acestep\torchinductor"
echo Cache limpiada.
echo.
pause
goto AVANZADO
