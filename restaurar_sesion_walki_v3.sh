#!/usr/bin/env bash
# Restaurar Sesion Urban_Walki_V3
# Shell equivalent of restaurar_sesion_walki_v3.bat
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ACEDIR="$SCRIPT_DIR/ACE-Step-1.5_"

export ACESTEP_CACHE_DIR="$ACEDIR/.cache/acestep"
export HF_HOME="$ACEDIR/.cache/huggingface"

PY="$ACEDIR/.venv/bin/python"
if [ ! -f "$PY" ]; then
    command -v python3 &>/dev/null && PY="python3" || { echo "[ERROR] Python not found"; exit 1; }
fi

clear
echo "============================================================"
echo "  Restaurar Sesion - Urban_Walki_V3"
echo "============================================================"
echo "  Modelo: acestep-v15-turbo  |  LM: acestep-5Hz-lm-1.7B"
echo "  Dataset: Urban_Walki_V3 (58 samples)  |  Tag: Walki-bass"
echo ""

echo "--- Verificando .env ---"
if grep -q "acestep-v15-turbo" "$ACEDIR/.env" 2>/dev/null; then
    echo "  [OK] Modelo turbo configurado"
else
    echo "  [!!] Corrigiendo .env..."
    printf 'ACESTEP_CONFIG_PATH=acestep-v15-turbo\nACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-1.7B\nACESTEP_DEVICE=auto\nACESTEP_LM_BACKEND=vllm\n' > "$ACEDIR/.env"
    echo "  [OK] .env restaurado"
fi

echo ""
echo "--- Verificando dataset ---"
DATASET_JSON=""
if [ -f "$ACEDIR/datasets/Continuar.json" ]; then
    echo "  [OK] Continuar.json"
    DATASET_JSON="./datasets/Continuar.json"
elif [ -f "$ACEDIR/datasets/my_lora_dataset.json" ]; then
    echo "  [OK] my_lora_dataset.json (sin ediciones manuales)"
    DATASET_JSON="./datasets/my_lora_dataset.json"
else
    echo "  [ERROR] No se encontro dataset JSON"; exit 1
fi

echo ""
echo "--- Verificando audio ---"
AUDIO_DIR="$ACEDIR/datasets/urban_flow/dataset_IA"
[ -d "$AUDIO_DIR" ] && echo "  [OK] $AUDIO_DIR" || { echo "  [ERROR] Audio dir not found"; exit 1; }

echo ""
echo "--- Verificando modelos ---"
for m in acestep-v15-turbo vae Qwen3-Embedding-0.6B acestep-5Hz-lm-1.7B; do
    [ -d "$ACEDIR/checkpoints/$m" ] && echo "  [OK] $m" || echo "  [!!] FALTA $m"
done

echo ""
echo "Ruta dataset: $DATASET_JSON"
read -r -p "Presiona Enter para lanzar Gradio (Ctrl+C para cancelar)..."

# Free port 7860
if command -v lsof &>/dev/null; then
    lsof -ti tcp:7860 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi

cd "$ACEDIR"
echo "Abriendo: http://127.0.0.1:7860"
"$PY" -m acestep.acestep_v15_pipeline --server-name 127.0.0.1 --port 7860
echo "ACE-Step detenido."
