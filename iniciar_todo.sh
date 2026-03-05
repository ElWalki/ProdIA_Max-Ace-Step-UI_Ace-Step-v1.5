#!/usr/bin/env bash
# ProdIA pro - Iniciar todo / Start All
# Shell equivalent of iniciar_todo.bat
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ACESTEP_DIR="$SCRIPT_DIR/ACE-Step-1.5_"
UI_DIR="$SCRIPT_DIR/ace-step-ui"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ProdIA pro - Inicio Completo / Full Start              ║"
echo "║   Gradio API + Backend + Frontend (con soporte LoRA)     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Detectar Python / Detect Python ──────────────────────────
PYTHON=""
if [ -f "$ACESTEP_DIR/.venv/bin/python" ]; then
    PYTHON="$ACESTEP_DIR/.venv/bin/python"
    echo " [Python] Usando .venv / Using .venv"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
    echo " [Python] Usando Python del sistema / Using system Python"
elif command -v python &>/dev/null; then
    PYTHON="python"
    echo " [Python] Usando Python del sistema / Using system Python"
else
    echo " [ERROR] No se encontro Python / Python not found. Ejecuta / Run: ./setup.sh"
    exit 1
fi

if [ ! -d "$UI_DIR/node_modules" ]; then
    echo " [ERROR] Dependencias UI no instaladas / UI dependencies not installed."
    echo " Ejecuta / Run: ./setup.sh"
    exit 1
fi
if [ ! -d "$UI_DIR/server/node_modules" ]; then
    echo " [ERROR] Dependencias backend no instaladas / Backend dependencies not installed."
    echo " Ejecuta / Run: ./setup.sh"
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
    if [ -n "$pids" ]; then
        echo "$pids" | xargs -r kill -9 2>/dev/null || true
    fi
}

# ─── Helper: open browser cross-platform ─────────────────────
open_browser() {
    local url="$1"
    if command -v xdg-open &>/dev/null; then
        xdg-open "$url" &
    elif command -v open &>/dev/null; then
        open "$url" &
    fi
}

# ─── Get local IP ─────────────────────────────────────────────
LOCAL_IP=""
if command -v hostname &>/dev/null; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi

# ─── Free ports ───────────────────────────────────────────────
echo " [0/3] Liberando puertos / Freeing ports (8001, 3001, 3000)..."
free_port 8001
free_port 3001
free_port 3000
sleep 1

# ═══════════════════════════════════════════════════════════
# PASO 1: Gradio API
# ═══════════════════════════════════════════════════════════
echo ""
echo " [1/3] Iniciando / Starting ACE-Step Gradio API (puerto/port 8001)..."
echo "       El modelo se inicializa automaticamente / Model initializes automatically."
echo "       Esto puede tardar / This may take 1-2 minutes the first time."

export ACESTEP_CACHE_DIR="$ACESTEP_DIR/.cache/acestep"
export HF_HOME="$ACESTEP_DIR/.cache/huggingface"

(
    cd "$ACESTEP_DIR"
    "$PYTHON" -m acestep.acestep_v15_pipeline \
        --port 8001 --enable-api --backend pt \
        --server-name 127.0.0.1 --config_path acestep-v15-turbo
) > /tmp/acestep_gradio.log 2>&1 &
GRADIO_PID=$!
echo " [*] Gradio PID: $GRADIO_PID (log: /tmp/acestep_gradio.log)"

# ─── Wait for Gradio ──────────────────────────────────────────
echo ""
echo " Esperando / Waiting for Gradio to start..."
echo " (comprobando / checking http://localhost:8001 every 5 seconds)"
echo ""

ATTEMPTS=0
MAX_ATTEMPTS=60
READY=0
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if curl -sf "http://localhost:8001/gradio_api/info" -o /dev/null 2>/dev/null; then
        READY=1
        break
    fi
    SECS=$((ATTEMPTS * 5))
    echo "   ... ${SECS}s esperando / waiting (intento/attempt ${ATTEMPTS}/${MAX_ATTEMPTS})"
    sleep 5
done

if [ $READY -eq 1 ]; then
    echo ""
    echo " ✓ Gradio API listo / ready! (modelo/model initialized)"
    echo ""
else
    echo ""
    echo " [AVISO] Gradio no respondio / did not respond after 5 min. Continuando / Continuing..."
fi

# ═══════════════════════════════════════════════════════════
# PASO 2: Backend
# ═══════════════════════════════════════════════════════════
echo " [2/3] Iniciando / Starting Backend (puerto/port 3001)..."
(
    cd "$UI_DIR/server"
    ACESTEP_PATH="$ACESTEP_DIR" DATASETS_DIR="$ACESTEP_DIR/datasets" npm run dev
) > /tmp/acestep_backend.log 2>&1 &
BACKEND_PID=$!
echo " [*] Backend PID: $BACKEND_PID (log: /tmp/acestep_backend.log)"

echo " Esperando backend / Waiting for backend..."
sleep 5

# ═══════════════════════════════════════════════════════════
# PASO 3: Frontend
# ═══════════════════════════════════════════════════════════
echo " [3/3] Iniciando / Starting Frontend (puerto/port 3000)..."
(
    cd "$UI_DIR"
    npm run dev
) > /tmp/acestep_frontend.log 2>&1 &
FRONTEND_PID=$!
echo " [*] Frontend PID: $FRONTEND_PID (log: /tmp/acestep_frontend.log)"

sleep 5

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   TODOS LOS SERVICIOS ARRANCADOS / ALL SERVICES STARTED  ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║   Gradio API:  http://localhost:8001                     ║"
echo "║   Backend:     http://localhost:3001                     ║"
echo "║   Frontend:    http://localhost:3000                     ║"
echo "║                                                          ║"
if [ -n "$LOCAL_IP" ]; then
echo "║   LAN:         http://$LOCAL_IP:3000"
echo "║                                                          ║"
fi
echo "║   LoRA: Cargalo / Load from UI in LoRA section           ║"
echo "║   (Custom mode -> LoRA -> Browse -> Load)                ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

echo " Abriendo navegador en 3 segundos... / Opening browser in 3s..."
sleep 3
open_browser "http://localhost:3000"

echo ""
echo " Pulsa Ctrl+C para detener todos los servicios."
echo " (Press Ctrl+C to stop all services)"
echo ""

# ─── Cleanup on exit ──────────────────────────────────────────
cleanup() {
    echo ""
    echo " Deteniendo servicios / Stopping services..."
    kill "$GRADIO_PID" "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    free_port 8001; free_port 3001; free_port 3000
    echo " Todo detenido / All stopped."
}
trap cleanup EXIT INT TERM

wait
