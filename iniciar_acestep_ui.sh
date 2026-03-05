#!/usr/bin/env bash
# ProdIA pro - Launcher (Interfaz tipo Suno)
# Shell equivalent of iniciar_acestep_ui.bat
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ACESTEP_DIR="$SCRIPT_DIR/ACE-Step-1.5_"
UI_DIR="$SCRIPT_DIR/ace-step-ui"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "   ProdIA pro - Interfaz tipo Suno"
echo "   Arranca: ACE-Step API + Backend + Frontend"
echo "══════════════════════════════════════════════════════════"
echo ""

# ─── Detect Python ────────────────────────────────────────────
PYTHON=""
if [ -f "$ACESTEP_DIR/.venv/bin/python" ]; then
    PYTHON="$ACESTEP_DIR/.venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
else
    echo " ERROR: No se encontro Python / Python not found."
    echo " Ejecuta / Run: ./setup.sh"
    exit 1
fi

# ─── Checks ───────────────────────────────────────────────────
if [ ! -d "$UI_DIR/node_modules" ]; then
    echo " ERROR: Dependencias frontend no instaladas / Frontend dependencies not installed."
    echo " Ejecuta / Run: cd ace-step-ui && npm install"
    exit 1
fi
if [ ! -d "$UI_DIR/server/node_modules" ]; then
    echo " ERROR: Dependencias backend no instaladas / Backend dependencies not installed."
    echo " Ejecuta / Run: cd ace-step-ui/server && npm install"
    exit 1
fi

# ─── Helper: free a port ──────────────────────────────────────
free_port() {
    local port="$1"
    local pids
    if command -v lsof &>/dev/null; then
        pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    else
        pids=$(ss -lptn "sport = :$port" 2>/dev/null | awk 'NR>1{gsub(/.*pid=/,"",$4);gsub(/,.*/,"",$4);print $4}' || true)
    fi
    [ -n "$pids" ] && echo "$pids" | xargs -r kill -9 2>/dev/null || true
}

open_browser() {
    local url="$1"
    if command -v xdg-open &>/dev/null; then xdg-open "$url" &
    elif command -v open &>/dev/null; then open "$url" &
    fi
}

LOCAL_IP=""
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

# ─── Free ports ───────────────────────────────────────────────
echo " [0/3] Liberando puertos..."
free_port 8001; free_port 3001; free_port 3000
sleep 1

# ─── Step 1: Gradio API ───────────────────────────────────────
echo ""
echo " [1/3] Iniciando / Starting ACE-Step Gradio API (puerto/port 8001)..."
echo "       Esto puede tardar 30-60s cargando modelos / This may take 30-60s loading models."

export ACESTEP_CACHE_DIR="$ACESTEP_DIR/.cache/acestep"
export HF_HOME="$ACESTEP_DIR/.cache/huggingface"

(
    cd "$ACESTEP_DIR"
    "$PYTHON" -m acestep.acestep_v15_pipeline \
        --port 8001 --enable-api --backend pt --server-name 127.0.0.1
) > /tmp/acestep_api.log 2>&1 &
API_PID=$!

echo " Esperando a que la API se inicialice (30-60s)..."
sleep 30

# ─── Step 2: Backend ──────────────────────────────────────────
echo ""
echo " [2/3] Iniciando / Starting Backend (puerto/port 3001)..."
(
    cd "$UI_DIR/server"
    ACESTEP_PATH="$ACESTEP_DIR" DATASETS_DIR="$ACESTEP_DIR/datasets" npm run dev
) > /tmp/acestep_backend.log 2>&1 &
BACKEND_PID=$!

echo " Esperando backend / Waiting for backend..."
sleep 5

# ─── Step 3: Frontend ─────────────────────────────────────────
echo ""
echo " [3/3] Iniciando / Starting Frontend (puerto/port 3000)..."
(
    cd "$UI_DIR"
    npm run dev
) > /tmp/acestep_frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 5

echo ""
echo "══════════════════════════════════════════════════════════"
echo "   TODOS LOS SERVICIOS ARRANCADOS / ALL SERVICES STARTED"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "   ACE-Step API:  http://localhost:8001"
echo "   Backend:       http://localhost:3001"
echo "   Frontend:      http://localhost:3000"
echo ""
if [ -n "$LOCAL_IP" ]; then
    echo "   LAN Access:    http://$LOCAL_IP:3000"
    echo ""
fi
echo "   Logs: /tmp/acestep_*.log"
echo "   Ctrl+C para detener / to stop all services"
echo "══════════════════════════════════════════════════════════"
echo ""

echo " Abriendo navegador / Opening browser..."
sleep 5
open_browser "http://localhost:3000"

cleanup() {
    echo ""
    echo " Deteniendo servicios / Stopping services..."
    kill "$API_PID" "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    free_port 8001; free_port 3001; free_port 3000
    echo " Todo detenido / All stopped."
}
trap cleanup EXIT INT TERM

wait
