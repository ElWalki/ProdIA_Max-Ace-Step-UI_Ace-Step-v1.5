#!/usr/bin/env bash
# Detector BPM y Clave Musical / BPM and Key Detector
# Shell equivalent of detectar_bpm_clave.bat

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "   DETECTOR DE BPM Y CLAVE MUSICAL / BPM AND KEY DETECTOR"
echo "══════════════════════════════════════════════════════════"
echo ""

# ─── Detect Python ────────────────────────────────────────────
PYTHON=""
if [ -f "$SCRIPT_DIR/ACE-Step-1.5_/.venv/bin/python" ]; then
    PYTHON="$SCRIPT_DIR/ACE-Step-1.5_/.venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
else
    echo " ERROR: No se encontro Python / Python not found."
    echo " Intenta ejecutar ./setup.sh primero / Try running ./setup.sh first."
    echo ""
    exit 1
fi

"$PYTHON" "$SCRIPT_DIR/detectar_bpm_clave.py" "$@"
