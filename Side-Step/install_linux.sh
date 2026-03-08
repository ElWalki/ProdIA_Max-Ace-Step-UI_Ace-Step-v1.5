#!/usr/bin/env bash
# ====================================================================
#  Side-Step Installer (Linux / macOS)
#
#  Run from inside the Side-Step repo:
#    chmod +x install_linux.sh && ./install_linux.sh
#
#  Handles:
#    - uv installation (if missing)
#    - Python 3.11 provisioning (via uv)
#    - Dependency sync (PyTorch CUDA 12.8 wheels, etc.)
#    - Optional: download model checkpoints (from HuggingFace)
#    - Optional: add "sidestep" command to PATH
# ====================================================================
set -euo pipefail

# ── Resolve script location (symlink-safe) ─────────────────────────
SOURCE="$0"
while [ -L "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SIDE_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

# ── Colours ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}==> $1${NC}"; }
ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "  ${RED}[FAIL]${NC} $1"; }

# ── Parse args ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Banner ──────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}  ███████ ██ ██████  ███████       ███████ ████████ ███████ ██████${NC}"
echo -e "${CYAN}  ██      ██ ██   ██ ██            ██         ██    ██      ██   ██${NC}"
echo -e "${CYAN}  ███████ ██ ██   ██ █████   █████ ███████    ██    █████   ██████${NC}"
echo -e "${CYAN}       ██ ██ ██   ██ ██                 ██    ██    ██      ██${NC}"
echo -e "${CYAN}  ███████ ██ ██████  ███████       ███████    ██    ███████ ██${NC}"
echo ""
echo -e "  ${GREEN}Installer (v1.0.1)${NC}"
echo ""

# ── Pre-flight ──────────────────────────────────────────────────────
step "Checking prerequisites"

ok "Side-Step directory: $SIDE_DIR"

if ! command -v git &>/dev/null; then
    warn "Git not found — you'll need it later for updates (git pull)."
else
    ok "Git found: $(git --version)"
fi

# ── Install uv if missing ──────────────────────────────────────────
step "Checking for uv (fast Python package manager)"

if command -v uv &>/dev/null; then
    ok "uv found: $(uv --version)"
else
    echo "  Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    if command -v uv &>/dev/null; then
        ok "uv installed: $(uv --version)"
    else
        fail "uv installation completed but command not found."
        echo "  Try: export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo "  Or install manually: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    fi
fi

# ── Install dependencies ────────────────────────────────────────────
step "Installing Side-Step dependencies (this may take a few minutes)"
echo "  PyTorch with CUDA 12.8 will be downloaded automatically."
echo "  First run downloads ~5 GB of wheels."
echo ""

cd "$SIDE_DIR"
if uv sync; then
    ok "Side-Step dependencies installed"
else
    fail "Dependency sync failed. Check the output above."
    exit 1
fi

# ── Electron shell (GUI window) ──────────────────────────────────────
ELECTRON_DIR="$SIDE_DIR/frontend/electron"

step "Electron GUI shell"

if command -v node &>/dev/null; then
    ok "Node.js found: $(node --version)"
else
    warn "Node.js not found. Attempting automatic install..."
    if [[ "$(uname)" == "Darwin" ]]; then
        if command -v brew &>/dev/null; then
            echo "  Installing Node.js via Homebrew..."
            brew install node 2>/dev/null
        else
            warn "Homebrew not found. Install it from https://brew.sh then run: brew install node"
        fi
    else
        if command -v apt-get &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - 2>/dev/null
            sudo apt-get install -y nodejs 2>/dev/null
        elif command -v dnf &>/dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - 2>/dev/null
            sudo dnf install -y nodejs 2>/dev/null
        elif command -v pacman &>/dev/null; then
            sudo pacman -S --noconfirm nodejs npm 2>/dev/null
        fi
    fi

    if command -v node &>/dev/null; then
        ok "Node.js installed: $(node --version)"
    else
        warn "Could not install Node.js automatically."
        echo "  Install it manually: https://nodejs.org/"
        echo "  The GUI will fall back to pywebview or your browser."
    fi
fi

if command -v node &>/dev/null && command -v npm &>/dev/null; then
    if [ -f "$ELECTRON_DIR/package.json" ]; then
        echo "  Installing Electron in $ELECTRON_DIR ..."
        cd "$ELECTRON_DIR"
        if npm install --no-fund --no-audit 2>&1; then
            ok "Electron installed"
        else
            warn "npm install failed. The GUI will fall back to pywebview or your browser."
        fi
        cd "$SIDE_DIR"
    fi
else
    warn "npm not found — skipping Electron install."
    echo "  The GUI will fall back to pywebview or your browser."
fi

echo ""
echo "  GUI window priority: Electron → pywebview → system browser"
echo "  (Each falls back automatically if the previous is unavailable.)"

# ── Model checkpoints (opt-in) ──────────────────────────────────────
CKPT_DIR="$SIDE_DIR/checkpoints"

_hf_download() {
    local repo="$1"; shift
    mkdir -p "$CKPT_DIR"
    if uv run hf download "$repo" "$@"; then
        return 0
    else
        warn "Download failed. You may need to log in first:"
        echo "    uv run hf login"
        echo "  Then retry manually."
        return 1
    fi
}

step "Model checkpoints"
echo ""
echo "  If you already have the ACE-Step model weights somewhere,"
echo "  you can skip these — the wizard will ask on first run."
echo ""
echo -e "  ${YELLOW}Requires a HuggingFace account + access to the gated repos.${NC}"

# -- Turbo (lives inside the monorepo ACE-Step/Ace-Step1.5) ---------------
# That repo also contains the shared VAE + Qwen3-Embedding needed for
# preprocessing. We exclude the LM (acestep-5Hz-lm-*) — Side-Step
# never uses it.
if [[ -d "$CKPT_DIR/acestep-v15-turbo" ]]; then
    ok "Turbo DiT found: $CKPT_DIR/acestep-v15-turbo"
else
    echo ""
    echo "  The turbo model lives in a combined repo (~5 GB) that also"
    echo "  includes the shared VAE + text encoder needed for preprocessing."
    echo "  (The LM is excluded — Side-Step doesn't use it.)"
    echo ""
    read -rp "  Download ACE-Step v1.5 Turbo? [y/N]: " dl_turbo
    dl_turbo="${dl_turbo:-N}"
    if [[ "$dl_turbo" =~ ^[Yy]$ ]]; then
        echo ""
        _hf_download "ACE-Step/Ace-Step1.5" \
            --local-dir "$CKPT_DIR" \
            --exclude "acestep-5Hz-lm-*/*" \
            && ok "Turbo + VAE + Qwen3-Embedding downloaded to $CKPT_DIR"
    else
        echo "  Skipped."
    fi
fi

# Shared VAE + Qwen3-Embedding (needed for preprocessing, not training)
if [[ -d "$CKPT_DIR/vae" && -d "$CKPT_DIR/Qwen3-Embedding-0.6B" ]]; then
    ok "Shared VAE + text encoder found"
elif [[ -d "$CKPT_DIR/acestep-v15-turbo" ]]; then
    # They have turbo DiT but missing shared components — partial download?
    warn "VAE or Qwen3-Embedding missing. Re-downloading shared components..."
    _hf_download "ACE-Step/Ace-Step1.5" \
        --local-dir "$CKPT_DIR" \
        --include "vae/*" "Qwen3-Embedding-0.6B/*" "config.json" \
        && ok "Shared components downloaded"
fi

# -- Base (standalone DiT repo, ~4.8 GB) ----------------------------------
if [[ -d "$CKPT_DIR/acestep-v15-base" ]]; then
    ok "Base DiT found: $CKPT_DIR/acestep-v15-base"
else
    echo ""
    read -rp "  Download ACE-Step v1.5 Base (~4.8 GB)? [y/N]: " dl_base
    dl_base="${dl_base:-N}"
    if [[ "$dl_base" =~ ^[Yy]$ ]]; then
        echo ""
        _hf_download "ACE-Step/acestep-v15-base" \
            --local-dir "$CKPT_DIR/acestep-v15-base" \
            && ok "Base downloaded to $CKPT_DIR/acestep-v15-base"
    else
        echo "  Skipped."
    fi
fi

# -- SFT (standalone DiT repo) --------------------------------------------
if [[ -d "$CKPT_DIR/acestep-v15-sft" ]]; then
    ok "SFT DiT found: $CKPT_DIR/acestep-v15-sft"
else
    echo ""
    read -rp "  Download ACE-Step v1.5 SFT (~4.8 GB)? [y/N]: " dl_sft
    dl_sft="${dl_sft:-N}"
    if [[ "$dl_sft" =~ ^[Yy]$ ]]; then
        echo ""
        _hf_download "ACE-Step/acestep-v15-sft" \
            --local-dir "$CKPT_DIR/acestep-v15-sft" \
            && ok "SFT downloaded to $CKPT_DIR/acestep-v15-sft"
    else
        echo "  Skipped."
    fi
fi

# ── Local captioner model (opt-in) ──────────────────────────────────
CAPTIONER_DIR="$CKPT_DIR/Qwen2.5-Omni-7B"

step "Local captioner model (optional)"
echo ""
echo "  Qwen2.5-Omni-7B lets you generate AI captions locally"
echo "  without needing Gemini or OpenAI API keys."
echo ""
echo -e "  ${YELLOW}You can always re-run this installer to download it later.${NC}"

if [[ -d "$CAPTIONER_DIR" ]]; then
    ok "Qwen2.5-Omni-7B found: $CAPTIONER_DIR"
else
    echo ""
    read -rp "  Download Qwen2.5-Omni-7B for local captions (~15 GB)? [y/N]: " dl_captioner
    dl_captioner="${dl_captioner:-N}"
    if [[ "$dl_captioner" =~ ^[Yy]$ ]]; then
        echo ""
        _hf_download "Qwen/Qwen2.5-Omni-7B" \
            --local-dir "$CAPTIONER_DIR" \
            && ok "Qwen2.5-Omni-7B downloaded to $CAPTIONER_DIR"
    else
        echo "  Skipped."
    fi
fi

# ── Add "sidestep" command to PATH ──────────────────────────────────
LAUNCHER="$SIDE_DIR/sidestep.sh"
LOCAL_BIN="$HOME/.local/bin"
LINK_PATH="$LOCAL_BIN/sidestep"

step "Global 'sidestep' command"

# If symlink already exists and points to the right place, skip the prompt
if [[ -L "$LINK_PATH" ]] && [[ "$(readlink -f "$LINK_PATH")" == "$(readlink -f "$LAUNCHER")" ]]; then
    ok "'sidestep' command already set up: $LINK_PATH"
    echo -e "  ${GREEN}You can type 'sidestep' from any terminal.${NC}"
else
    echo ""
    echo -e "  ${CYAN}Would you like to add Side-Step to your PATH?${NC}"
    echo ""
    echo "  This lets you launch Side-Step from any terminal by just typing:"
    echo ""
    echo -e "      ${GREEN}sidestep${NC}          — open the launcher menu"
    echo -e "      ${GREEN}sidestep gui${NC}      — jump straight to the GUI"
    echo -e "      ${GREEN}sidestep train${NC} …  — run a training command"
    echo ""
    echo "  Without this, you'd need to cd into the install folder first."
    echo ""
    echo -e "  What it does: creates a symlink in ${YELLOW}~/.local/bin/${NC}"
    echo "  (a standard user-level PATH directory — no sudo required)."
    echo "  Survives updates — git pull won't break it."
    echo ""

    read -rp "  Add 'sidestep' command to PATH? [Y/n]: " add_path
    add_path="${add_path:-Y}"

    if [[ "$add_path" =~ ^[Yy]$ ]]; then
        mkdir -p "$LOCAL_BIN"
        ln -sf "$LAUNCHER" "$LINK_PATH"
        chmod +x "$LAUNCHER"
        ok "Symlink created: $LINK_PATH -> $LAUNCHER"

        # Ensure ~/.local/bin is on PATH for current + future sessions
        if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
            export PATH="$LOCAL_BIN:$PATH"

            SHELL_RC=""
            case "$(basename "${SHELL:-bash}")" in
                zsh)  SHELL_RC="$HOME/.zshrc" ;;
                fish) SHELL_RC="" ;;
                *)    SHELL_RC="$HOME/.bashrc" ;;
            esac

            if [[ -n "$SHELL_RC" ]]; then
                PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
                if ! grep -qF '.local/bin' "$SHELL_RC" 2>/dev/null; then
                    echo "" >> "$SHELL_RC"
                    echo "# Added by Side-Step installer" >> "$SHELL_RC"
                    echo "$PATH_LINE" >> "$SHELL_RC"
                    ok "Added ~/.local/bin to PATH in $(basename "$SHELL_RC")"
                else
                    ok "~/.local/bin already in $(basename "$SHELL_RC")"
                fi
            elif [[ "$(basename "${SHELL:-bash}")" == "fish" ]]; then
                fish -c "fish_add_path -g '$LOCAL_BIN'" 2>/dev/null || true
                ok "Added ~/.local/bin via fish_add_path"
            fi
        else
            ok "~/.local/bin already on PATH"
        fi

        echo ""
        echo -e "  ${GREEN}You can now type 'sidestep' from any terminal!${NC}"
        echo -e "  ${YELLOW}(You may need to restart your terminal for PATH changes to take effect.)${NC}"
    else
        echo ""
        echo "  Skipped. You can always do this later:"
        echo "    mkdir -p ~/.local/bin"
        echo "    ln -sf \"$LAUNCHER\" ~/.local/bin/sidestep"
    fi
fi

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Installation complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Side-Step:    $SIDE_DIR"
echo "  Checkpoints:  $CKPT_DIR"
echo ""
if [[ -L "$LINK_PATH" ]]; then
    echo "  Quick start (from anywhere):"
    echo -e "    ${GREEN}sidestep${NC}              # Pick wizard or GUI"
    echo -e "    ${GREEN}sidestep gui${NC}          # Launch GUI directly"
    echo -e "    ${GREEN}sidestep train --help${NC} # CLI help"
else
    echo "  Quick start:"
    echo "    cd \"$SIDE_DIR\""
    echo "    ./sidestep.sh              # Pick wizard or GUI"
    echo "    ./sidestep.sh gui          # Launch GUI directly"
    echo "    ./sidestep.sh train --help # CLI help"
fi
echo ""
echo "  To update later:"
echo "    cd \"$SIDE_DIR\" && git pull && uv sync"
echo ""
echo "  IMPORTANT:"
echo "    - Never rename checkpoint folders"
echo "    - First run will ask where your checkpoints are"
echo ""
echo "  If you get CUDA errors, check:"
echo "    uv run python -c \"import torch; print(torch.cuda.is_available())\""
echo ""
