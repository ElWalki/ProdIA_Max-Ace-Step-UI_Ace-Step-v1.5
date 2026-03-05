#!/usr/bin/env bash
# ACE-Step 1.5 - Generador de Musica con IA
# Shell equivalent of iniciar_acestep.bat (interactive menu)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export ACESTEP_CACHE_DIR="$SCRIPT_DIR/.cache/acestep"
export HF_HOME="$SCRIPT_DIR/.cache/huggingface"

PY="$SCRIPT_DIR/.venv/bin/python"
[ ! -f "$PY" ] && command -v python3 &>/dev/null && PY="python3"
[ ! -f "$PY" ] && { echo "[ERROR] Python not found"; exit 1; }

UI_DIR="$SCRIPT_DIR/../ace-step-ui"

open_browser() {
    if command -v xdg-open &>/dev/null; then xdg-open "$1" &
    elif command -v open &>/dev/null; then open "$1" &
    fi
}

free_port() {
    command -v lsof &>/dev/null && lsof -ti tcp:"$1" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
}

show_menu() {
    clear
    echo "============================================================"
    echo "         ACE-Step 1.5 - Generador de Musica con IA"
    echo "============================================================"
    echo ""
    "$PY" --version 2>&1 || true
    echo ""
    echo "--- Estado de modelos ---"
    for m in acestep-v15-turbo vae Qwen3-Embedding-0.6B acestep-5Hz-lm-0.6B acestep-5Hz-lm-1.7B acestep-5Hz-lm-4B; do
        if [ -d "checkpoints/$m" ]; then
            echo "  [OK] $m"
        else
            echo "  [--] $m"
        fi
    done
    echo ""
    echo "--- Menu ---"
    echo "  1. Iniciar Gradio UI (interfaz web)"
    echo "  2. Iniciar API Server (REST API, puerto 8001)"
    echo "  3. Elegir modelo de lenguaje (LM)"
    echo "  4. Descargar modelos por adelantado"
    echo "  5. Configuracion avanzada"
    echo "  6. Iniciar UI tipo Suno (ace-step-ui)"
    echo "  0. Salir"
    echo ""
}

while true; do
    show_menu
    read -r -p "Elige una opcion [1]: " OPCION
    OPCION="${OPCION:-1}"

    case "$OPCION" in
    0) exit 0 ;;

    1) # Gradio UI
        echo ""
        echo "Configuracion actual:"; [ -f ".env" ] && cat ".env" || true
        echo ""
        free_port 7860
        echo "La interfaz se abrira en: http://127.0.0.1:7860"
        echo "Presiona Ctrl+C para detener el servidor."
        "$PY" -m acestep.acestep_v15_pipeline --server-name 127.0.0.1 --port 7860 || true
        echo "ACE-Step se ha detenido."
        read -r -p "Presiona Enter para volver al menu..."
        ;;

    2) # API Server
        echo ""
        free_port 8001
        echo "API: http://127.0.0.1:8001  |  Docs: http://127.0.0.1:8001/docs"
        echo "Presiona Ctrl+C para detener."
        "$PY" -m acestep.api_server --host 127.0.0.1 --port 8001 || true
        echo "API Server detenido."
        read -r -p "Presiona Enter para volver al menu..."
        ;;

    3) # Choose LM
        echo ""
        echo "  1. acestep-5Hz-lm-0.6B  (rapido, ~3 GB VRAM)"
        echo "  2. acestep-5Hz-lm-1.7B  (recomendado, ~8 GB VRAM)"
        echo "  3. acestep-5Hz-lm-4B    (mejor calidad, ~12 GB VRAM)"
        echo "  4. Sin modelo LM"
        echo "  0. Volver"
        echo ""
        [ -f ".env" ] && grep "ACESTEP_LM_MODEL_PATH" ".env" || true
        echo ""
        read -r -p "Elige modelo [2]: " LM_OPT
        LM_OPT="${LM_OPT:-2}"
        case "$LM_OPT" in
            1) LM_MODEL="acestep-5Hz-lm-0.6B" ;;
            2) LM_MODEL="acestep-5Hz-lm-1.7B" ;;
            3) LM_MODEL="acestep-5Hz-lm-4B" ;;
            4) LM_MODEL="none" ;;
            0) continue ;;
            *) continue ;;
        esac
        "$PY" -c "
f=open('.env','w')
f.write('ACESTEP_CONFIG_PATH=acestep-v15-turbo\n')
f.write('ACESTEP_LM_MODEL_PATH=$LM_MODEL\n')
f.write('ACESTEP_DEVICE=auto\n')
f.write('ACESTEP_LM_BACKEND=vllm\n')
f.close()
print('Modelo LM configurado: $LM_MODEL')
"
        read -r -p "Presiona Enter para continuar..."
        ;;

    4) # Download models
        while true; do
            echo ""
            echo "  1. Descargar TODO lo necesario"
            echo "  2. Solo modelo principal (DiT + VAE + Text Encoder)"
            echo "  3. Solo modelo LM segun .env"
            echo "  4. Todos los modelos LM (0.6B + 1.7B + 4B)"
            echo "  0. Volver"
            echo ""
            read -r -p "Elige opcion [1]: " DL_OPT
            DL_OPT="${DL_OPT:-1}"
            case "$DL_OPT" in
                1|2|3|4)
                    "$PY" -c "
from acestep.model_downloader import ensure_main_model, ensure_lm_model
import os
from dotenv import load_dotenv
load_dotenv('.env')
if '$DL_OPT' in ('1','2'): ensure_main_model()
if '$DL_OPT' in ('1','3'):
    lm=os.getenv('ACESTEP_LM_MODEL_PATH','acestep-5Hz-lm-0.6B')
    if lm != 'none': ensure_lm_model(lm)
if '$DL_OPT' == '4':
    for m in ['acestep-5Hz-lm-0.6B','acestep-5Hz-lm-1.7B','acestep-5Hz-lm-4B']:
        ensure_lm_model(m)
print('Descarga completada.')
" || echo "[ERROR] Descarga fallida"
                    read -r -p "Presiona Enter para continuar..."
                    ;;
                0|*) break ;;
            esac
        done
        ;;

    5) # Advanced config
        while true; do
            echo ""
            echo "  1. Editar .env"
            echo "  2. Verificar GPU y CUDA"
            echo "  3. Verificar paquetes"
            echo "  4. Limpiar cache de compilacion"
            echo "  0. Volver"
            echo ""
            read -r -p "Elige: " ADV_OPT
            case "$ADV_OPT" in
                1)
                    EDITOR="${EDITOR:-nano}"
                    "$EDITOR" ".env" 2>/dev/null || vi ".env"
                    ;;
                2)
                    "$PY" -c "
import torch
print('PyTorch:', torch.__version__)
print('CUDA disponible:', torch.cuda.is_available())
if torch.cuda.is_available():
    print('CUDA:', torch.version.cuda)
    print('GPU:', torch.cuda.get_device_name(0))
    print('VRAM:', round(torch.cuda.get_device_properties(0).total_mem/1024**3,1), 'GB')
" || echo "PyTorch not available"
                    read -r -p "Presiona Enter..."
                    ;;
                3)
                    "$PY" -c "
import torch, gradio, transformers, diffusers
print('PyTorch:', torch.__version__)
print('Gradio:', gradio.__version__)
print('Transformers:', transformers.__version__)
print('Diffusers:', diffusers.__version__)
" || echo "Some packages not available"
                    read -r -p "Presiona Enter..."
                    ;;
                4)
                    rm -rf ".cache/acestep/triton" ".cache/acestep/torchinductor" 2>/dev/null || true
                    echo "Cache limpiada."
                    read -r -p "Presiona Enter..."
                    ;;
                0|*) break ;;
            esac
        done
        ;;

    6) # Suno UI
        if [ ! -d "$UI_DIR/node_modules" ]; then
            echo "[ERROR] ace-step-ui no instalado: $UI_DIR"
            read -r -p "Presiona Enter..."; continue
        fi
        free_port 8001
        echo "[1/3] Iniciando ACE-Step Gradio + API (puerto 8001)..."
        (cd "$SCRIPT_DIR" && "$PY" -m acestep.acestep_v15_pipeline \
            --port 8001 --enable-api --backend pt --server-name 127.0.0.1) \
            > /tmp/acestep_api.log 2>&1 &
        API_PID=$!
        echo "Esperando 30s para que carguen los modelos..."
        sleep 30

        echo "[2/3] Iniciando Backend (puerto 3001)..."
        (cd "$UI_DIR/server" && npm run dev) > /tmp/acestep_backend.log 2>&1 &
        BACKEND_PID=$!
        sleep 5

        echo "[3/3] Iniciando Frontend (puerto 3000)..."
        (cd "$UI_DIR" && npm run dev) > /tmp/acestep_frontend.log 2>&1 &
        FRONTEND_PID=$!
        sleep 5

        echo ""; echo "Todos los servicios arrancados!"
        echo "  API: http://localhost:8001  Backend: http://localhost:3001  Frontend: http://localhost:3000"
        open_browser "http://localhost:3000"
        read -r -p "Presiona Enter para DETENER todos los servicios..."
        kill "$API_PID" "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
        free_port 8001; free_port 3001; free_port 3000
        echo "Servicios detenidos."
        read -r -p "Presiona Enter para volver al menu..."
        ;;

    *)
        echo "Opcion no valida."
        sleep 1
        ;;
    esac
done
