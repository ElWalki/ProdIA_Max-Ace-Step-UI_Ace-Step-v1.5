#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  ProdIA pro - Iniciar todo / Start All (Linux / macOS)
#  Setup + Gradio API + Backend + Frontend (con soporte LoRA)
# ═══════════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ACESTEP_DIR="$SCRIPT_DIR/ACE-Step-1.5_"
UI_DIR="$SCRIPT_DIR/ace-step-ui"
VENV="$ACESTEP_DIR/.venv"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ProdIA pro - Inicio Completo / Full Start              ║"
echo "║   Setup + Gradio API + Backend + Frontend                ║"
echo "║   (con soporte LoRA / with LoRA support)                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Verificar Node.js / Check Node.js ────────────────────────
if ! command -v node &>/dev/null; then
    echo "  [ERROR] Node.js no encontrado / Node.js not found."
    echo "          Instala Node.js 18+ desde / Install Node.js 18+ from:"
    echo "          https://nodejs.org/"
    exit 1
fi

# ─── Detectar Python / Detect Python ──────────────────────────
PYTHON=""
BASE_PYTHON=""
if [ -f "$ACESTEP_DIR/python_embeded/python" ]; then
    PYTHON="$ACESTEP_DIR/python_embeded/python"
    echo "  [Python] Usando python_embeded / Using embedded python"
elif [ -f "$VENV/bin/python" ]; then
    PYTHON="$VENV/bin/python"
    echo "  [Python] Usando .venv existente / Using existing .venv"
elif command -v python3 &>/dev/null; then
    BASE_PYTHON="python3"
    echo "  [Python] Python del sistema encontrado / System Python found: $(python3 --version)"
elif command -v python &>/dev/null; then
    BASE_PYTHON="python"
    echo "  [Python] Python del sistema encontrado / System Python found: $(python --version)"
else
    echo "  [ERROR] No se encontró Python / Python not found."
    echo "          Instala Python 3.10 o 3.11 / Install Python 3.10 or 3.11"
    echo "          Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
    echo "          macOS: brew install python@3.11"
    exit 1
fi

# ─── Crear venv si es necesario / Create venv if needed ────────
if [ -z "$PYTHON" ]; then
    echo ""
    echo "  [Setup] Creando entorno virtual / Creating virtual environment..."
    if [ -d "$VENV" ]; then
        echo "          Ya existe, omitiendo / Already exists, skipping."
    else
        "$BASE_PYTHON" -m venv "$VENV"
        echo "          Creado correctamente / Created successfully."
    fi
    PYTHON="$VENV/bin/python"
fi

# ─── Instalar dependencias Python si es necesario ──────────────
PY_MARKER="$ACESTEP_DIR/.deps_installed"
NEED_PY_INSTALL=0
if [ ! -f "$PY_MARKER" ]; then
    NEED_PY_INSTALL=1
elif [ -f "$ACESTEP_DIR/requirements.txt" ] && [ "$ACESTEP_DIR/requirements.txt" -nt "$PY_MARKER" ]; then
    NEED_PY_INSTALL=1
fi
if [ "$NEED_PY_INSTALL" -eq 1 ]; then
    echo ""
    echo "  [Setup] Instalando dependencias Python / Installing Python dependencies..."
    echo "          Esto puede tardar varios minutos / This may take several minutes..."
    echo ""
    "$PYTHON" -m pip install --upgrade pip 2>/dev/null || true
    if [ -f "$ACESTEP_DIR/requirements.txt" ]; then
        if "$PYTHON" -m pip install -r "$ACESTEP_DIR/requirements.txt"; then
            touch "$PY_MARKER"
            echo "  [OK] Dependencias Python instaladas / Python deps installed."
        else
            echo ""
            echo "  [AVISO / WARNING] Algunos paquetes pueden haber fallado."
            echo "          Si es CUDA/torch, instala manualmente según tu GPU:"
            echo "          https://pytorch.org/get-started/locally/"
            echo ""
            read -p "  Presiona Enter para continuar / Press Enter to continue..."
        fi
    fi
else
    echo "  [OK] Dependencias Python ya instaladas / Python deps already installed."
fi

# ─── Instalar dependencias Node.js ─────────────────────────────
if [ ! -d "$UI_DIR/node_modules" ]; then
    echo "  [!] Dependencias UI no instaladas / UI deps missing. Instalando / Installing..."
    cd "$UI_DIR"
    npm install || { echo "  [ERROR] npm install falló / failed."; exit 1; }
else
    echo "  [*] Verificando dependencias UI / Checking UI deps..."
    cd "$UI_DIR"
    npm install --prefer-offline 2>/dev/null || true
fi
if [ ! -d "$UI_DIR/server/node_modules" ]; then
    echo "  [!] Dependencias backend no instaladas / Backend deps missing. Instalando / Installing..."
    cd "$UI_DIR/server"
    npm install || { echo "  [ERROR] npm install falló / failed."; exit 1; }
else
    echo "  [*] Verificando dependencias backend / Checking backend deps..."
    cd "$UI_DIR/server"
    npm install --prefer-offline 2>/dev/null || true
fi
cd "$SCRIPT_DIR"

# ─── Función para matar proceso en un puerto ──────────────────
kill_port() {
    local port=$1
    local pid
    pid=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null || true
    fi
}

# ─── Matar procesos previos / Kill previous processes ─────────
echo "  [0/3] Liberando puertos / Freeing ports (8001, 3001, 3000)..."
kill_port 8001
kill_port 3001
kill_port 3000
sleep 2

# ─── Obtener IP local / Get local IP ─────────────────────────
LOCAL_IP=""
if command -v hostname &>/dev/null; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi
if [ -z "$LOCAL_IP" ] && command -v ifconfig &>/dev/null; then
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
fi

# ═══════════════════════════════════════════════════════════════
#  PASO 1 / STEP 1: Gradio API
# ═══════════════════════════════════════════════════════════════
echo ""
echo "  [1/3] Iniciando / Starting ACE-Step Gradio API (puerto/port 8001)..."
echo "        El modelo se inicializa automáticamente / Model initializes automatically."
echo "        Esto puede tardar / This may take 1-2 minutes the first time."

export ACESTEP_CACHE_DIR="$ACESTEP_DIR/.cache/acestep"
export HF_HOME="$ACESTEP_DIR/.cache/huggingface"

(cd "$ACESTEP_DIR" && "$PYTHON" -m acestep.acestep_v15_pipeline \
    --port 8001 \
    --enable-api \
    --backend pt \
    --server-name 127.0.0.1 \
    --config_path acestep-v15-turbo) &
GRADIO_PID=$!

# ─── Esperar Gradio / Wait for Gradio ────────────────────────
echo ""
echo "  Esperando / Waiting for Gradio to start and load the model..."
echo "  (comprobando / checking http://localhost:8001 every 5 seconds)"
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
    echo "  ✓ Gradio API listo / ready! (modelo/model initialized)"
    echo ""
else
    echo ""
    echo "  [AVISO / WARNING] Gradio no respondió / did not respond after 5 min."
    echo "  Puede que aún esté cargando / May still be loading. Continuando / Continuing..."
fi

# ═══════════════════════════════════════════════════════════════
#  PASO 2 / STEP 2: Backend Node.js
# ═══════════════════════════════════════════════════════════════
echo "  [2/3] Iniciando / Starting Backend (puerto/port 3001)..."
(cd "$UI_DIR/server" && \
    ACESTEP_PATH="$ACESTEP_DIR" \
    DATASETS_DIR="$ACESTEP_DIR/datasets" \
    npm run dev) &
BACKEND_PID=$!

echo "  Esperando backend / Waiting for backend..."
sleep 5

# ═══════════════════════════════════════════════════════════════
#  PASO 3 / STEP 3: Frontend
# ═══════════════════════════════════════════════════════════════
echo "  [3/3] Iniciando / Starting Frontend (puerto/port 3000)..."
(cd "$UI_DIR" && npm run dev) &
FRONTEND_PID=$!

sleep 5

# ═══════════════════════════════════════════════════════════════
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
echo "║   LAN:         http://${LOCAL_IP}:3000                   ║"
echo "║                                                          ║"
fi
echo "║   LoRA: Cárgalo / Load from UI in LoRA section           ║"
echo "║   (Custom mode -> LoRA -> Browse -> Load)                ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Abrir navegador / Open browser ──────────────────────────
sleep 3
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null || true
elif command -v open &>/dev/null; then
    open "http://localhost:3000" 2>/dev/null || true
fi

echo "  Presiona Ctrl+C para detener todos los servicios."
echo "  Press Ctrl+C to stop all services."
echo ""

# ─── Manejar Ctrl+C para limpiar / Handle Ctrl+C cleanup ─────
cleanup() {
    echo ""
    echo "  Deteniendo servicios / Stopping services..."
    kill $GRADIO_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $GRADIO_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "  Servicios detenidos / Services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Esperar a que algún proceso termine / Wait for any process to exit
wait
