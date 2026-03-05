#!/usr/bin/env bash
# ProdIA pro - Limpiar datos de usuario / Clear User Data
# Shell equivalent of limpiar_datos_usuario.bat

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║      ProdIA pro - Limpiar datos de usuario               ║"
echo "║      Clear User Data                                     ║"
echo "║   Elimina: base de datos, audios generados               ║"
echo "║   Removes: database, generated audio                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo " ADVERTENCIA / WARNING: Se eliminaran todos los usuarios, canciones"
echo " y audios generados / All users, songs and generated audio will be removed."
echo " Los modelos y el codigo NO se tocan / Models and source code are NOT affected."
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
echo " [1/2] Eliminando / Removing base de datos / database..."
DB="$SCRIPT_DIR/ace-step-ui/server/data/acestep.db"
if [ -f "$DB" ]; then
    rm -f "$DB"
    echo "       OK - acestep.db eliminada / removed"
else
    echo "       No existe / Not found, nada que borrar / nothing to remove"
fi

echo " [2/2] Eliminando / Removing audios generados / generated audio..."
AUDIO_DIR="$SCRIPT_DIR/ace-step-ui/server/public/audio"
if [ -d "$AUDIO_DIR" ]; then
    find "$AUDIO_DIR" -type f -delete
    echo "       OK - audios eliminados / removed"
else
    echo "       No existe / Not found, nada que borrar / nothing to remove"
fi

echo ""
echo " ✓ Limpieza completada / Cleanup complete."
echo "   Al iniciar la app / On next app start, a fresh database will be created."
echo ""
read -r -p "Presiona Enter para cerrar / Press Enter to close..."
