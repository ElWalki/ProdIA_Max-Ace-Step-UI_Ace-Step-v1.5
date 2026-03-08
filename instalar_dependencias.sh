#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ProdIA pro - Instalar Dependencias / Install Deps      ║"
echo "║   Python + Node.js (sin iniciar servidores)              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

ACESTEP_DIR="$(pwd)/ACE-Step-1.5_"
UI_DIR="$(pwd)/ace-step-ui"
PRO_UI_DIR="$(pwd)/ace-step-ui-pro"
VENV="$ACESTEP_DIR/.venv"

# ─── Node.js ────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  [ERROR] Node.js no encontrado / not found. Instala desde https://nodejs.org/"
  exit 1
fi
echo "  [OK] Node.js encontrado / found."

# ─── Python ─────────────────────────────────────────────────
PYTHON=""
if [ -f "$ACESTEP_DIR/python_embeded/python" ]; then
  PYTHON="$ACESTEP_DIR/python_embeded/python"
  echo "  [OK] Python embebido encontrado / Embedded Python found."
elif [ -f "$VENV/bin/python" ]; then
  PYTHON="$VENV/bin/python"
  echo "  [OK] Entorno virtual encontrado / Virtual env found."
elif command -v python3 &>/dev/null; then
  if [ ! -d "$VENV" ]; then
    echo "  [Setup] Creando entorno virtual / Creating venv..."
    python3 -m venv "$VENV"
  fi
  PYTHON="$VENV/bin/python"
elif command -v python &>/dev/null; then
  if [ ! -d "$VENV" ]; then
    echo "  [Setup] Creando entorno virtual / Creating venv..."
    python -m venv "$VENV"
  fi
  PYTHON="$VENV/bin/python"
else
  echo "  [ERROR] Python no encontrado / not found."
  exit 1
fi

echo ""
echo "  [1/4] Instalando dependencias Python / Installing Python deps..."
"$PYTHON" -m pip install --upgrade pip >/dev/null 2>&1 || true
if [ -f "$ACESTEP_DIR/requirements.txt" ]; then
  "$PYTHON" -m pip install -r "$ACESTEP_DIR/requirements.txt"
  touch "$ACESTEP_DIR/.deps_installed"
  echo "  [OK] Dependencias Python instaladas."
fi

echo ""
echo "  [2/4] Instalando dependencias UI / Installing UI deps..."
cd "$UI_DIR" && npm install

echo ""
echo "  [3/4] Instalando dependencias backend / Installing backend deps..."
cd "$UI_DIR/server" && npm install

echo ""
echo "  [4/4] Instalando dependencias Pro UI / Installing Pro UI deps..."
if [ -f "$PRO_UI_DIR/package.json" ]; then
  cd "$PRO_UI_DIR" && npm install
fi

cd "$(dirname "$0")"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Todas las dependencias instaladas correctamente."
echo "  All dependencies installed successfully."
echo "  Ahora puedes ejecutar: ./iniciar_todo.sh"
echo "═══════════════════════════════════════════════════════════"
echo ""
