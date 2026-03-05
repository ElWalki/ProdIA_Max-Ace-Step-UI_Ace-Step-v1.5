#!/usr/bin/env bash
# ProdIA pro - Desinstalar / Uninstall
# Shell equivalent of desinstalar.bat

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ACESTEP_DIR="$SCRIPT_DIR/ACE-Step-1.5_"
UI_DIR="$SCRIPT_DIR/ace-step-ui"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       ProdIA pro - Desinstalar / Uninstall               ║"
echo "║   Elimina venv, node_modules y datos de usuario          ║"
echo "║   Removes venv, node_modules and user data               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo " Esto eliminara / This will remove:"
echo "   - ACE-Step-1.5_/.venv  (entorno Python / Python environment)"
echo "   - ace-step-ui/node_modules"
echo "   - ace-step-ui/server/node_modules"
echo "   - ace-step-ui/server/data/acestep.db"
echo "   - ace-step-ui/server/public/audio/*"
echo ""
echo " NO se eliminaran / Will NOT be removed: modelos, LoRAs, codigo fuente."
echo ""
read -r -p " ¿Confirmas? / Confirm? (s/y to confirm, N to cancel): " CONFIRM
case "$CONFIRM" in
    [sySY]) ;;
    *)
        echo " Cancelado / Cancelled."
        exit 0
        ;;
esac

echo ""
echo " [1/5] Eliminando / Removing entorno Python / Python environment (.venv)..."
if [ -d "$ACESTEP_DIR/.venv" ]; then
    rm -rf "$ACESTEP_DIR/.venv"
    echo "       OK"
else
    echo "       No existe / Not found, omitiendo / skipping."
fi

echo " [2/5] Eliminando / Removing node_modules frontend..."
if [ -d "$UI_DIR/node_modules" ]; then
    rm -rf "$UI_DIR/node_modules"
    echo "       OK"
else
    echo "       No existe / Not found, omitiendo / skipping."
fi

echo " [3/5] Eliminando / Removing node_modules backend..."
if [ -d "$UI_DIR/server/node_modules" ]; then
    rm -rf "$UI_DIR/server/node_modules"
    echo "       OK"
else
    echo "       No existe / Not found, omitiendo / skipping."
fi

echo " [4/5] Eliminando / Removing base de datos / database..."
if [ -f "$UI_DIR/server/data/acestep.db" ]; then
    rm -f "$UI_DIR/server/data/acestep.db"
    echo "       OK"
else
    echo "       No existe / Not found, omitiendo / skipping."
fi

echo " [5/5] Eliminando / Removing audios generados / generated audio..."
if [ -d "$UI_DIR/server/public/audio" ]; then
    find "$UI_DIR/server/public/audio" -type f -delete
    echo "       OK"
else
    echo "       No existe / Not found, omitiendo / skipping."
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Desinstalacion completada / Uninstall complete         ║"
echo "║   Para reinstalar / To reinstall: ./setup.sh             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
read -r -p "Presiona Enter para cerrar / Press Enter to close..."
