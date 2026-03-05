#!/usr/bin/env bash
# ProdIA pro - Setup / Instalacion
# Shell equivalent of setup.bat
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ACESTEP_DIR="$SCRIPT_DIR/ACE-Step-1.5_"
UI_DIR="$SCRIPT_DIR/ace-step-ui"
VENV="$ACESTEP_DIR/.venv"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          ProdIA pro - Instalacion / Installation         ║"
echo "║   Python venv + dependencias + Node.js UI                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Detectar Python / Detect Python ──────────────────────────
PYTHON=""

if command -v python3 &>/dev/null; then
    PYTHON="python3"
    echo " [OK] Python del sistema encontrado / System Python found: $(which python3)"
elif command -v python &>/dev/null; then
    PYTHON="python"
    echo " [OK] Python encontrado / Python found: $(which python)"
else
    echo " [ERROR] No se encontro Python / Python not found."
    echo "         Instala Python 3.10+ desde / Install Python 3.10+ from:"
    echo "         https://www.python.org/downloads/"
    exit 1
fi

echo ""
echo " [1/4] Creando entorno virtual / Creating virtual environment..."
if [ -d "$VENV" ]; then
    echo "       Ya existe, omitiendo creacion / Already exists, skipping creation."
else
    "$PYTHON" -m venv "$VENV"
    echo "       Creado correctamente / Created successfully."
fi

PYTHON="$VENV/bin/python"

echo ""
echo " [2/4] Instalando dependencias Python / Installing Python dependencies..."
echo "       Esto puede tardar varios minutos / This may take several minutes..."
echo ""
"$PYTHON" -m pip install --upgrade pip --quiet
"$PYTHON" -m pip install -r "$ACESTEP_DIR/requirements.txt" || {
    echo ""
    echo " [AVISO] Algunos paquetes pueden haber fallado / Some packages may have failed."
    echo "         Revisa los errores arriba / Check errors above."
    echo "         Si es CUDA/torch, instala manualmente segun tu GPU:"
    echo "         https://pytorch.org/get-started/locally/"
    echo ""
    read -r -p "Presiona Enter para continuar / Press Enter to continue..."
}

echo ""
echo " [3/4] Instalando dependencias Node.js - Frontend / Installing Node.js frontend..."
if [ -d "$UI_DIR/node_modules" ]; then
    echo "       Ya instaladas, omitiendo / Already installed, skipping."
else
    (cd "$UI_DIR" && npm install) || {
        echo " [ERROR] npm install fallo / failed."
        exit 1
    }
fi

echo ""
echo " [4/4] Instalando dependencias Node.js - Backend / Installing Node.js backend..."
if [ -d "$UI_DIR/server/node_modules" ]; then
    echo "       Ya instaladas, omitiendo / Already installed, skipping."
else
    (cd "$UI_DIR/server" && npm install) || {
        echo " [ERROR] npm install fallo / failed."
        exit 1
    }
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Instalacion completada / Installation completed        ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║   Ahora ejecuta / Now run: ./iniciar_todo.sh             ║"
echo "║                                                          ║"
echo "║   NOTA: Los modelos de IA se descargan la primera vez.   ║"
echo "║   NOTE: AI models are downloaded the first time.         ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
read -r -p "Presiona Enter para cerrar / Press Enter to close..."
