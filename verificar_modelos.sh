#!/usr/bin/env bash
# Verificador y Descargador de Modelos ACE-Step 1.5
# Shell equivalent of verificar_modelos.bat

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKPOINTS_DIR="$SCRIPT_DIR/ACE-Step-1.5_/checkpoints"
PYTHON_DIR="$SCRIPT_DIR/ACE-Step-1.5_/.venv/bin"

# ─── Detect Python ────────────────────────────────────────────
PYTHON_CMD=""
if [ -f "$PYTHON_DIR/python" ]; then
    PYTHON_CMD="$PYTHON_DIR/python"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
fi

clear
echo ""
echo " ╔══════════════════════════════════════════════════════════════╗"
echo " ║        VERIFICADOR DE MODELOS ACE-Step 1.5                  ║"
echo " ╚══════════════════════════════════════════════════════════════╝"
echo ""
echo " Directorio de checkpoints:"
echo " $CHECKPOINTS_DIR"
echo ""

# ─── Helper: check model ──────────────────────────────────────
check_model() {
    local path="$1"
    if [ -f "$path" ]; then echo "  OK  "; else echo "FALTA "; fi
}

TOTAL_OK=0
TOTAL_MISSING=0
MISSING_MAIN=0

echo " ────────────────────────────────────────────────────────────────"
echo " MODELOS PRINCIPALES (incluidos en ACE-Step/Ace-Step1.5)"
echo " ────────────────────────────────────────────────────────────────"

# 1. acestep-v15-turbo
M1_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-v15-turbo/model.safetensors")
[ "$M1_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || { TOTAL_MISSING=$((TOTAL_MISSING+1)); MISSING_MAIN=$((MISSING_MAIN+1)); }
echo "   [$M1_STATUS]  acestep-v15-turbo          (DiT turbo por defecto)"

# 2. vae
M2_STATUS=$(check_model "$CHECKPOINTS_DIR/vae/diffusion_pytorch_model.safetensors")
[ "$M2_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || { TOTAL_MISSING=$((TOTAL_MISSING+1)); MISSING_MAIN=$((MISSING_MAIN+1)); }
echo "   [$M2_STATUS]  vae                         (Codificador/Decodificador de audio)"

# 3. Qwen3-Embedding-0.6B
M3_STATUS=$(check_model "$CHECKPOINTS_DIR/Qwen3-Embedding-0.6B/model.safetensors")
[ "$M3_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || { TOTAL_MISSING=$((TOTAL_MISSING+1)); MISSING_MAIN=$((MISSING_MAIN+1)); }
echo "   [$M3_STATUS]  Qwen3-Embedding-0.6B        (Codificador de texto)"

# 4. acestep-5Hz-lm-1.7B
M4_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-5Hz-lm-1.7B/model.safetensors")
[ "$M4_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || { TOTAL_MISSING=$((TOTAL_MISSING+1)); MISSING_MAIN=$((MISSING_MAIN+1)); }
echo "   [$M4_STATUS]  acestep-5Hz-lm-1.7B         (Modelo de lenguaje 1.7B)"

echo ""
echo " ────────────────────────────────────────────────────────────────"
echo " MODELOS OPCIONALES (repos separados en HuggingFace)"
echo " ────────────────────────────────────────────────────────────────"

# 5-11: optional models
M5_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-v15-base/model.safetensors")
[ "$M5_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || TOTAL_MISSING=$((TOTAL_MISSING+1))
echo "   [$M5_STATUS]  acestep-v15-base             (DiT base, 50 pasos, CFG)"

M6_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-v15-sft/model.safetensors")
[ "$M6_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || TOTAL_MISSING=$((TOTAL_MISSING+1))
echo "   [$M6_STATUS]  acestep-v15-sft              (DiT SFT, fine-tuned)"

M7_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-v15-turbo-shift1/model.safetensors")
[ "$M7_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || TOTAL_MISSING=$((TOTAL_MISSING+1))
echo "   [$M7_STATUS]  acestep-v15-turbo-shift1     (DiT turbo variante shift1)"

M8_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-v15-turbo-shift3/model.safetensors")
[ "$M8_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || TOTAL_MISSING=$((TOTAL_MISSING+1))
echo "   [$M8_STATUS]  acestep-v15-turbo-shift3     (DiT turbo variante shift3)"

M9_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-v15-turbo-continuous/model.safetensors")
[ "$M9_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || TOTAL_MISSING=$((TOTAL_MISSING+1))
echo "   [$M9_STATUS]  acestep-v15-turbo-continuous (DiT turbo continuo)"

M10_STATUS=$(check_model "$CHECKPOINTS_DIR/acestep-5Hz-lm-0.6B/model.safetensors")
[ "$M10_STATUS" = "  OK  " ] && TOTAL_OK=$((TOTAL_OK+1)) || TOTAL_MISSING=$((TOTAL_MISSING+1))
echo "   [$M10_STATUS]  acestep-5Hz-lm-0.6B         (Modelo de lenguaje 0.6B)"

# 4B model has 2 shards
M11_STATUS="FALTA "
if [ -f "$CHECKPOINTS_DIR/acestep-5Hz-lm-4B/model-00001-of-00002.safetensors" ] && \
   [ -f "$CHECKPOINTS_DIR/acestep-5Hz-lm-4B/model-00002-of-00002.safetensors" ]; then
    M11_STATUS="  OK  "
    TOTAL_OK=$((TOTAL_OK+1))
else
    TOTAL_MISSING=$((TOTAL_MISSING+1))
fi
echo "   [$M11_STATUS]  acestep-5Hz-lm-4B           (Modelo de lenguaje 4B)"

echo ""
echo " ────────────────────────────────────────────────────────────────"
echo "  Resumen:  $TOTAL_OK completos  /  $TOTAL_MISSING faltan"
echo " ────────────────────────────────────────────────────────────────"

if [ "$TOTAL_MISSING" -eq 0 ]; then
    echo ""
    echo "  Todos los modelos estan completos. No hay nada que descargar."
    echo ""
    exit 0
fi

echo ""
echo " ╔══════════════════════════════════════════════════════════════╗"
echo " ║  OPCIONES DE DESCARGA                                      ║"
echo " ╚══════════════════════════════════════════════════════════════╝"
echo ""
[ "$MISSING_MAIN" -gt 0 ] && echo "  [0] Descargar modelos PRINCIPALES que faltan (esencial para funcionar)"
echo "  [1] acestep-v15-base              (~4.5 GB) - ACE-Step/acestep-v15-base"
echo "  [2] acestep-v15-sft               (~4.5 GB) - ACE-Step/acestep-v15-sft"
echo "  [3] acestep-v15-turbo-shift1      (~4.5 GB) - ACE-Step/acestep-v15-turbo-shift1"
echo "  [4] acestep-v15-turbo-shift3      (~4.5 GB) - ACE-Step/acestep-v15-turbo-shift3"
echo "  [5] acestep-v15-turbo-continuous  (~4.5 GB) - ACE-Step/acestep-v15-turbo-continuous"
echo "  [6] acestep-5Hz-lm-0.6B          (~1.2 GB) - ACE-Step/acestep-5Hz-lm-0.6B"
echo "  [7] acestep-5Hz-lm-4B            (~7.8 GB) - ACE-Step/acestep-5Hz-lm-4B"
echo "  [8] Descargar TODOS los que faltan"
echo "  [9] Salir"
echo ""
read -r -p "  Elige una opcion (0-9): " CHOICE

# ─── Helper: download via Python ──────────────────────────────
do_download() {
    local model_name="$1"
    local repo_id="$2"
    local dest="$CHECKPOINTS_DIR/$model_name"
    echo ""
    echo "  Descargando $model_name desde $repo_id ..."
    echo "  Destino: $dest"
    echo ""
    if [ -n "$PYTHON_CMD" ]; then
        "$PYTHON_CMD" -c "
from huggingface_hub import snapshot_download
snapshot_download('$repo_id', local_dir='$dest', local_dir_use_symlinks=False)
print('  [OK] $model_name descargado correctamente.')
" || echo "  [ERROR] Fallo al descargar $model_name."
    else
        echo "  Usando huggingface-cli (Python no disponible)..."
        huggingface-cli download "$repo_id" --local-dir "$dest"
    fi
    echo ""
    read -r -p "  Presiona Enter para continuar..."
}

download_main() {
    echo ""
    echo "  Descargando modelos principales desde ACE-Step/Ace-Step1.5 ..."
    if [ -n "$PYTHON_CMD" ]; then
        "$PYTHON_CMD" -c "
from huggingface_hub import snapshot_download
snapshot_download('ACE-Step/Ace-Step1.5', local_dir='$CHECKPOINTS_DIR', local_dir_use_symlinks=False)
print('  Modelos principales descargados correctamente.')
" || echo "  ERROR en la descarga. Revisa tu conexion o token de HuggingFace."
    else
        huggingface-cli download ACE-Step/Ace-Step1.5 --local-dir "$CHECKPOINTS_DIR"
    fi
    read -r -p "  Presiona Enter para continuar..."
}

case "$CHOICE" in
    0) download_main ;;
    1) do_download "acestep-v15-base" "ACE-Step/acestep-v15-base" ;;
    2) do_download "acestep-v15-sft" "ACE-Step/acestep-v15-sft" ;;
    3) do_download "acestep-v15-turbo-shift1" "ACE-Step/acestep-v15-turbo-shift1" ;;
    4) do_download "acestep-v15-turbo-shift3" "ACE-Step/acestep-v15-turbo-shift3" ;;
    5) do_download "acestep-v15-turbo-continuous" "ACE-Step/acestep-v15-turbo-continuous" ;;
    6) do_download "acestep-5Hz-lm-0.6B" "ACE-Step/acestep-5Hz-lm-0.6B" ;;
    7) do_download "acestep-5Hz-lm-4B" "ACE-Step/acestep-5Hz-lm-4B" ;;
    8)
        echo ""
        echo "  Descargando TODOS los modelos que faltan..."
        [ "$MISSING_MAIN" -gt 0 ] && download_main
        [ "$M5_STATUS" = "FALTA " ] && do_download "acestep-v15-base" "ACE-Step/acestep-v15-base"
        [ "$M6_STATUS" = "FALTA " ] && do_download "acestep-v15-sft" "ACE-Step/acestep-v15-sft"
        [ "$M7_STATUS" = "FALTA " ] && do_download "acestep-v15-turbo-shift1" "ACE-Step/acestep-v15-turbo-shift1"
        [ "$M8_STATUS" = "FALTA " ] && do_download "acestep-v15-turbo-shift3" "ACE-Step/acestep-v15-turbo-shift3"
        [ "$M9_STATUS" = "FALTA " ] && do_download "acestep-v15-turbo-continuous" "ACE-Step/acestep-v15-turbo-continuous"
        [ "$M10_STATUS" = "FALTA " ] && do_download "acestep-5Hz-lm-0.6B" "ACE-Step/acestep-5Hz-lm-0.6B"
        [ "$M11_STATUS" = "FALTA " ] && do_download "acestep-5Hz-lm-4B" "ACE-Step/acestep-5Hz-lm-4B"
        echo ""
        echo "  Descarga completa. Vuelve a ejecutar este script para verificar."
        read -r -p "  Presiona Enter para continuar..."
        ;;
    9|*) echo "  Saliendo / Exiting."; exit 0 ;;
esac

exit 0
