#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  ProdIA Pro UI - Inicio Rapido / Quick Start (Linux / macOS)
#  Gradio API (8001) + Backend (3001) + Pro UI (3002)
# ═══════════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ACESTEP_DIR="$SCRIPT_DIR/ACE-Step-1.5_"
UI_DIR="$SCRIPT_DIR/ace-step-ui"
PRO_UI_DIR="$SCRIPT_DIR/ace-step-ui-pro"
VENV="$ACESTEP_DIR/.venv"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ProdIA Pro UI - Inicio Rapido / Quick Start            ║"
echo "║   Gradio API (8001) + Backend (3001) + Pro UI (3002)     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Verificar que Pro UI existe / Check Pro UI exists ─────────
if [ ! -f "$PRO_UI_DIR/package.json" ]; then
    echo "  [ERROR] Pro UI no encontrada en / not found at:"
    echo "          $PRO_UI_DIR"
    exit 1
fi

# ─── Verificar Node.js / Check Node.js ────────────────────────
if ! command -v node &>/dev/null; then
    echo "  [ERROR] Node.js no encontrado / Node.js not found."
    echo "          Instala Node.js 18+ desde / Install Node.js 18+ from:"
    echo "          https://nodejs.org/"
    exit 1
fi

# ─── Detectar Python / Detect Python ──────────────────────────
PYTHON=""
if [ -f "$ACESTEP_DIR/python_embeded/python" ]; then
    PYTHON="$ACESTEP_DIR/python_embeded/python"
    echo "  [Python] Usando python_embeded / Using embedded python"
elif [ -f "$VENV/bin/python" ]; then
    PYTHON="$VENV/bin/python"
    echo "  [Python] Usando .venv / Using .venv"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
    echo "  [Python] Usando sistema / Using system: $(python3 --version)"
elif command -v python &>/dev/null; then
    PYTHON="python"
    echo "  [Python] Usando sistema / Using system: $(python --version)"
else
    echo "  [ERROR] No se encontro Python / Python not found."
    echo "          Instala Python 3.10+ / Install Python 3.10+"
    echo "          Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
    echo "          macOS: brew install python@3.11"
    exit 1
fi

# ─── Instalar dependencias si faltan / Install deps if missing ──
if [ ! -d "$PRO_UI_DIR/node_modules" ]; then
    echo "  [Setup] Instalando dependencias Pro UI / Installing Pro UI deps..."
    cd "$PRO_UI_DIR"
    npm install || { echo "  [ERROR] npm install fallo / failed."; exit 1; }
    cd "$SCRIPT_DIR"
fi
if [ ! -d "$UI_DIR/server/node_modules" ]; then
    echo "  [Setup] Instalando dependencias backend / Installing backend deps..."
    cd "$UI_DIR/server"
    npm install || { echo "  [ERROR] npm install backend fallo / failed."; exit 1; }
    cd "$SCRIPT_DIR"
fi

# ─── Funcion para matar proceso en un puerto / Kill port ──────
kill_port() {
    local port=$1
    local pid
    pid=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null || true
    fi
}

# ─── Liberar puertos / Free ports ─────────────────────────────
echo "  [0/3] Liberando puertos / Freeing ports (8001, 3001, 3002)..."
kill_port 8001
kill_port 3001
kill_port 3002
sleep 1

# ─── Obtener IP local / Get local IP ─────────────────────────
LOCAL_IP=""
if command -v hostname &>/dev/null; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi
if [ -z "$LOCAL_IP" ] && command -v ifconfig &>/dev/null; then
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
fi

# ─── Variables de entorno / Environment vars ──────────────────
export ACESTEP_CACHE_DIR="$ACESTEP_DIR/.cache/acestep"
export HF_HOME="$ACESTEP_DIR/.cache/huggingface"
export ACESTEP_PATH="$ACESTEP_DIR"
export DATASETS_DIR="$ACESTEP_DIR/datasets"

# ═══════════════════════════════════════════════════════════════
#  PASO 1 / STEP 1: Gradio API (puerto 8001)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "  [1/3] Iniciando / Starting Gradio API (puerto/port 8001)..."

(cd "$ACESTEP_DIR" && "$PYTHON" -m acestep.acestep_v15_pipeline \
    --port 8001 \
    --enable-api \
    --backend pt \
    --server-name 127.0.0.1 \
    --config_path acestep-v15-turbo) &
GRADIO_PID=$!

# ─── Esperar Gradio / Wait for Gradio ────────────────────────
echo ""
echo "  Esperando Gradio / Waiting for Gradio API..."
echo "  (comprobando / checking http://localhost:8001 cada/every 5s)"
echo ""

ATTEMPTS=0
MAX_ATTEMPTS=60
READY=0

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    ATTEMPTS=$((ATTEMPTS + 1))

    if curl -s --max-time 3 "http://localhost:8001/gradio_api/info" &>/dev/null; then
        READY=1
        break
    fi

    SECS=$((ATTEMPTS * 5))
    echo "    ... ${SECS}s esperando / waiting (intento/attempt $ATTEMPTS/$MAX_ATTEMPTS)"
    sleep 5
done

if [ $READY -eq 1 ]; then
    echo ""
    echo "  OK Gradio API listo / ready!"
    echo ""
else
    echo ""
    echo "  [AVISO / WARNING] Gradio no respondio / did not respond after 5 min."
    echo "  Puede que aun este cargando / May still be loading. Continuando / Continuing..."
fi

# ═══════════════════════════════════════════════════════════════
#  PASO 2 / STEP 2: Backend Node.js (puerto 3001)
# ═══════════════════════════════════════════════════════════════
echo "  [2/3] Iniciando / Starting Backend (puerto/port 3001)..."

(cd "$UI_DIR/server" && \
    ACESTEP_PATH="$ACESTEP_DIR" \
    DATASETS_DIR="$ACESTEP_DIR/datasets" \
    npm run dev) &
BACKEND_PID=$!

echo "  Esperando backend / Waiting for backend..."
sleep 3

# ═══════════════════════════════════════════════════════════════
#  PASO 3 / STEP 3: Pro UI (puerto 3002)
# ═══════════════════════════════════════════════════════════════
echo "  [3/3] Iniciando / Starting Pro UI (puerto/port 3002)..."

(cd "$PRO_UI_DIR" && npm run dev) &
PROUI_PID=$!

sleep 5

# ═══════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         PRO UI LISTA / PRO UI READY                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║   Gradio API:  http://localhost:8001                     ║"
echo "║   Backend:     http://localhost:3001                     ║"
echo "║   Pro UI:      http://localhost:3002                     ║"
echo "║                                                          ║"
if [ -n "$LOCAL_IP" ]; then
echo "║   LAN:         http://${LOCAL_IP}:3002                   ║"
echo "║                                                          ║"
fi
echo "║   Legacy UI NO iniciada (usar iniciar_todo.sh)           ║"
echo "║   Legacy UI NOT started (use iniciar_todo.sh)            ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Abrir navegador / Open browser ──────────────────────────
sleep 2
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3002" 2>/dev/null || true
elif command -v open &>/dev/null; then
    open "http://localhost:3002" 2>/dev/null || true
fi

echo "  Presiona Ctrl+C para detener todos los servicios."
echo "  Press Ctrl+C to stop all services."
echo ""

# ─── Manejar Ctrl+C para limpiar / Handle Ctrl+C cleanup ─────
cleanup() {
    echo ""
    echo "  Deteniendo servicios / Stopping services..."
    kill $GRADIO_PID $BACKEND_PID $PROUI_PID 2>/dev/null || true
    wait $GRADIO_PID $BACKEND_PID $PROUI_PID 2>/dev/null || true
    echo "  Servicios detenidos / Services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Esperar a que algun proceso termine / Wait for any process to exit
wait
