#!/usr/bin/env bash
# Demucs + Whisper - Transcriptor / Transcriber
# Shell equivalent of transcribir_letras.bat

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================================"
echo "  TRANSCRIPTOR PROFESIONAL DE LETRAS / PROFESSIONAL LYRICS TRANSCRIBER"
echo "  Demucs htdemucs_ft + Whisper large-v3"
echo "============================================================"
echo ""

# ─── Detect Python ────────────────────────────────────────────
PYTHON=""
if [ -f "$SCRIPT_DIR/ACE-Step-1.5_/.venv/bin/python" ]; then
    PYTHON="$SCRIPT_DIR/ACE-Step-1.5_/.venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
    echo "[!] Python no encontrado en venv / not found in venv, usando / using system python"
else
    PYTHON="python"
    echo "[!] Usando / Using system python"
fi

echo "Opciones / Options:"
echo "  1. Completo / Full: separar stems + transcribir / separate stems + transcribe (calidad alta / high quality, shifts=5)"
echo "  2. Completo / Full: calidad maxima / max quality (shifts=10, mas lento / slower)"
echo "  3. Completo / Full: calidad rapida / fast quality (shifts=1, rapido / fast)"
echo "  4. Solo separar stems / Stems only (sin transcribir / no transcription)"
echo "  5. Solo transcribir / Transcribe only (stems ya separados / stems already separated)"
echo "  6. Todo con sobreescritura / Overwrite all (calidad alta / high quality)"
echo ""
read -r -p "Elige / Choose (1-6) [1]: " OPCION
OPCION="${OPCION:-1}"

ARGS="--calidad alta"
case "$OPCION" in
    2) ARGS="--calidad maxima" ;;
    3) ARGS="--calidad rapida" ;;
    4) ARGS="--solo-stems --calidad alta" ;;
    5) ARGS="--solo-transcribir" ;;
    6) ARGS="--sobreescribir --calidad alta" ;;
esac

echo ""
# shellcheck disable=SC2086
"$PYTHON" "$SCRIPT_DIR/transcribir_letras.py" $ARGS

echo ""
read -r -p "Presiona Enter para cerrar / Press Enter to close..."
