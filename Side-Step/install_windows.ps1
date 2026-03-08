#Requires -Version 5.1
<#
.SYNOPSIS
    Side-Step Installer for Windows.
.DESCRIPTION
    Run from inside the Side-Step repo.  Handles:
      - uv installation (if missing)
      - Python 3.11 provisioning (via uv)
      - Dependency sync (PyTorch CUDA 12.8 wheels, etc.)
      - Optional: download model checkpoints (from HuggingFace)
      - Optional: add "sidestep" command to PATH
.NOTES
    Requirements:
      - Windows 10/11
      - NVIDIA GPU with CUDA support (for training)
      - ~12 GB free disk (models + deps)
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ── Resolve script location ───────────────────────────────────────────────
$sideDir = $PSScriptRoot

# ── Colours ──────────────────────────────────────────────────────────────
function Write-Step  { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

# ── Banner ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ███████ ██ ██████  ███████       ███████ ████████ ███████ ██████" -ForegroundColor Cyan
Write-Host "  ██      ██ ██   ██ ██            ██         ██    ██      ██   ██" -ForegroundColor Cyan
Write-Host "  ███████ ██ ██   ██ █████   █████ ███████    ██    █████   ██████" -ForegroundColor Cyan
Write-Host "       ██ ██ ██   ██ ██                 ██    ██    ██      ██" -ForegroundColor Cyan
Write-Host "  ███████ ██ ██████  ███████       ███████    ██    ███████ ██" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Installer (v1.0.1)" -ForegroundColor Green
Write-Host ""

# ── Pre-flight ───────────────────────────────────────────────────────────
Write-Step "Checking prerequisites"

Write-Ok "Side-Step directory: $sideDir"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Warn "Git not found -- you'll need it later for updates (git pull)."
    Write-Host "  Install from: https://git-scm.com/download/win"
} else {
    Write-Ok "Git found: $(git --version)"
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    try {
        $pyv = python --version 2>$null
        if ($pyv) { Write-Ok "System Python found: $pyv (uv will still manage 3.11)" }
    } catch {}
} else {
    Write-Warn "System Python not found on PATH (this is okay; uv will provision Python 3.11)."
}

# ── Install uv if missing ───────────────────────────────────────────────
Write-Step "Checking for uv (fast Python package manager)"

if (Get-Command uv -ErrorAction SilentlyContinue) {
    Write-Ok "uv found: $(uv --version)"
} else {
    Write-Host "  Installing uv..."
    try {
        irm https://astral.sh/uv/install.ps1 | iex
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
            $uvPath = Join-Path $env:USERPROFILE ".local\bin"
            $env:Path += ";$uvPath"
        }
        if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
            Write-Fail "uv installation completed but command was not found on PATH."
            Write-Host "  Try opening a new PowerShell window, then run:"
            Write-Host "    irm https://astral.sh/uv/install.ps1 | iex"
            Write-Host "  Or install manually: https://docs.astral.sh/uv/getting-started/installation/"
            exit 1
        }
        Write-Ok "uv installed: $(uv --version)"
    } catch {
        Write-Fail "Could not install uv automatically."
        Write-Host "  Manual install: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    }
}

# ── Install Side-Step dependencies ───────────────────────────────────────
Write-Step "Installing Side-Step dependencies (this may take a few minutes)"
Write-Host "  PyTorch with CUDA 12.8 will be downloaded automatically."
Write-Host "  First run downloads ~5 GB of wheels.`n"

Set-Location $sideDir
try {
    uv sync
    Write-Ok "Side-Step dependencies installed"
} catch {
    Write-Fail "Dependency sync failed. Check the output above for errors."
    Write-Host "  Common fix: ensure you have enough disk space and a stable internet connection."
    exit 1
}

# ── Electron shell (GUI window) ──────────────────────────────────────────
$electronDir = Join-Path $sideDir "frontend\electron"

Write-Step "Electron GUI shell"

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Ok "Node.js found: $(node --version)"
} else {
    Write-Warn "Node.js not found."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "  Installing Node.js LTS via winget..."
        try {
            winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            if (Get-Command node -ErrorAction SilentlyContinue) {
                Write-Ok "Node.js installed: $(node --version)"
            } else {
                Write-Warn "Node.js installed but not on PATH yet. Restart your terminal after setup."
            }
        } catch {
            Write-Warn "Could not install Node.js via winget."
        }
    } else {
        Write-Host "  Install Node.js manually: https://nodejs.org/" -ForegroundColor Yellow
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  The GUI will fall back to pywebview or your browser."
        Write-Host ""
        Write-Host "  If Node.js was just installed, restart PowerShell and re-run this installer" -ForegroundColor Yellow
        Write-Host "  to pick up Electron support."
    }
}

if ((Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    if (Test-Path (Join-Path $electronDir "package.json")) {
        Write-Host "  Installing Electron in $electronDir ..."
        Set-Location $electronDir
        try {
            npm install --no-fund --no-audit 2>&1 | Out-Host
            Write-Ok "Electron installed"
        } catch {
            Write-Warn "npm install failed. Trying clean reinstall..."
            try {
                if (Test-Path "node_modules") {
                    Remove-Item "node_modules" -Recurse -Force
                }
                if (Test-Path "package-lock.json") {
                    Remove-Item "package-lock.json" -Force
                }
                npm install --no-fund --no-audit 2>&1 | Out-Host
                Write-Ok "Electron installed after clean reinstall"
            } catch {
                Write-Warn "Clean reinstall failed. The GUI will fall back to pywebview or your browser."
                Write-Host "  Manual fix (PowerShell):"
                Write-Host "    Set-Location frontend/electron"
                Write-Host "    if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force }"
                Write-Host "    if (Test-Path package-lock.json) { Remove-Item package-lock.json -Force }"
                Write-Host "    npm install --no-fund --no-audit"
            }
        }
        Set-Location $sideDir
    }
} else {
    Write-Warn "npm not found -- skipping Electron install."
    Write-Host "  The GUI will fall back to pywebview or your browser."
}

Write-Host ""
Write-Host "  GUI window priority: Electron -> pywebview -> system browser"
Write-Host "  (Each falls back automatically if the previous is unavailable.)"

# ── Model checkpoints (opt-in) ───────────────────────────────────────────
$checkpointsDir = Join-Path $sideDir "checkpoints"

function Invoke-HfDownload {
    param([string[]]$HfArgs)
    if (-not (Test-Path $checkpointsDir)) { New-Item -ItemType Directory -Path $checkpointsDir -Force | Out-Null }
    Push-Location $sideDir
    try {
        & uv run hf download @HfArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Download failed (exit code $LASTEXITCODE). You may need to log in first:"
            Write-Host "    uv run hf login"
            Write-Host "  Then retry manually."
            return $false
        }
        return $true
    } catch {
        Write-Warn "Download failed: $_"
        Write-Host "    uv run hf login"
        Write-Host "  Then retry manually."
        return $false
    } finally {
        Pop-Location
    }
}

Write-Step "Model checkpoints"
Write-Host ""
Write-Host "  If you already have the ACE-Step model weights somewhere,"
Write-Host "  you can skip these -- the wizard will ask on first run."
Write-Host ""
Write-Host "  Requires a HuggingFace account + access to the gated repos." -ForegroundColor Yellow

$turboDir = Join-Path $checkpointsDir "acestep-v15-turbo"
$vaeDir = Join-Path $checkpointsDir "vae"
$qwenDir = Join-Path $checkpointsDir "Qwen3-Embedding-0.6B"
$baseDir = Join-Path $checkpointsDir "acestep-v15-base"
$sftDir = Join-Path $checkpointsDir "acestep-v15-sft"

# -- Turbo (lives inside the monorepo ACE-Step/Ace-Step1.5) ----------------
# That repo also contains the shared VAE + Qwen3-Embedding needed for
# preprocessing.  We exclude the LM (acestep-5Hz-lm-*) -- Side-Step
# never uses it.
if (Test-Path $turboDir) {
    Write-Ok "Turbo DiT found: $turboDir"
} else {
    Write-Host ""
    Write-Host "  The turbo model lives in a combined repo (~5 GB) that also"
    Write-Host "  includes the shared VAE + text encoder needed for preprocessing."
    Write-Host "  (The LM is excluded -- Side-Step doesn't use it.)"
    Write-Host ""
    $dlTurbo = Read-Host "  Download ACE-Step v1.5 Turbo? [y/N]"
    if ([string]::IsNullOrWhiteSpace($dlTurbo)) { $dlTurbo = "N" }
    if ($dlTurbo -match '^[Yy]$') {
        Write-Host ""
        if (Invoke-HfDownload @("ACE-Step/Ace-Step1.5", "--local-dir", $checkpointsDir, "--exclude", "acestep-5Hz-lm-*/*")) {
            Write-Ok "Turbo + VAE + Qwen3-Embedding downloaded to $checkpointsDir"
        }
    } else {
        Write-Host "  Skipped."
    }
}

# Shared VAE + Qwen3-Embedding (needed for preprocessing, not training)
if ((Test-Path $vaeDir) -and (Test-Path $qwenDir)) {
    Write-Ok "Shared VAE + text encoder found"
} elseif (Test-Path $turboDir) {
    Write-Warn "VAE or Qwen3-Embedding missing. Re-downloading shared components..."
    if (Invoke-HfDownload @("ACE-Step/Ace-Step1.5", "--local-dir", $checkpointsDir, "--include", "vae/*", "Qwen3-Embedding-0.6B/*", "config.json")) {
        Write-Ok "Shared components downloaded"
    }
}

# -- Base (standalone DiT repo, ~4.8 GB) ----------------------------------
if (Test-Path $baseDir) {
    Write-Ok "Base DiT found: $baseDir"
} else {
    Write-Host ""
    $dlBase = Read-Host "  Download ACE-Step v1.5 Base (~4.8 GB)? [y/N]"
    if ([string]::IsNullOrWhiteSpace($dlBase)) { $dlBase = "N" }
    if ($dlBase -match '^[Yy]$') {
        Write-Host ""
        if (Invoke-HfDownload @("ACE-Step/acestep-v15-base", "--local-dir", $baseDir)) {
            Write-Ok "Base downloaded to $baseDir"
        }
    } else {
        Write-Host "  Skipped."
    }
}

# -- SFT (standalone DiT repo) --------------------------------------------
if (Test-Path $sftDir) {
    Write-Ok "SFT DiT found: $sftDir"
} else {
    Write-Host ""
    $dlSft = Read-Host "  Download ACE-Step v1.5 SFT (~4.8 GB)? [y/N]"
    if ([string]::IsNullOrWhiteSpace($dlSft)) { $dlSft = "N" }
    if ($dlSft -match '^[Yy]$') {
        Write-Host ""
        if (Invoke-HfDownload @("ACE-Step/acestep-v15-sft", "--local-dir", $sftDir)) {
            Write-Ok "SFT downloaded to $sftDir"
        }
    } else {
        Write-Host "  Skipped."
    }
}

# ── Local captioner model (opt-in) ────────────────────────────────────
$captionerDir = Join-Path $checkpointsDir "Qwen2.5-Omni-7B"

Write-Step "Local captioner model (optional)"
Write-Host ""
Write-Host "  Qwen2.5-Omni-7B lets you generate AI captions locally"
Write-Host "  without needing Gemini or OpenAI API keys."
Write-Host ""
Write-Host "  You can always re-run this installer to download it later." -ForegroundColor Yellow

if (Test-Path $captionerDir) {
    Write-Ok "Qwen2.5-Omni-7B found: $captionerDir"
} else {
    Write-Host ""
    $dlCaptioner = Read-Host "  Download Qwen2.5-Omni-7B for local captions (~15 GB)? [y/N]"
    if ([string]::IsNullOrWhiteSpace($dlCaptioner)) { $dlCaptioner = "N" }
    if ($dlCaptioner -match '^[Yy]$') {
        Write-Host ""
        if (Invoke-HfDownload @("Qwen/Qwen2.5-Omni-7B", "--local-dir", $captionerDir)) {
            Write-Ok "Qwen2.5-Omni-7B downloaded to $captionerDir"
        }
    } else {
        Write-Host "  Skipped."
    }
}

# ── Add "sidestep" command to PATH ────────────────────────────────────────
$localBin = Join-Path $env:USERPROFILE ".local\bin"
$proxyCmd = Join-Path $localBin "sidestep.cmd"

Write-Step "Global 'sidestep' command"

# If proxy already exists and points to this installation, skip the prompt
$alreadySetUp = $false
if (Test-Path $proxyCmd) {
    $existing = Get-Content $proxyCmd -Raw -ErrorAction SilentlyContinue
    if ($existing -and $existing.Contains($sideDir)) {
        $alreadySetUp = $true
    }
}

if ($alreadySetUp) {
    Write-Ok "'sidestep' command already set up: $proxyCmd"
    Write-Host "  " -NoNewline
    Write-Host "You can type 'sidestep' from any terminal." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "  Would you like to add Side-Step to your PATH?" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  This lets you launch Side-Step from any terminal by just typing:"
    Write-Host ""
    Write-Host "      sidestep" -ForegroundColor Green -NoNewline; Write-Host "          -- open the launcher menu"
    Write-Host "      sidestep gui" -ForegroundColor Green -NoNewline; Write-Host "      -- jump straight to the GUI"
    Write-Host "      sidestep train" -ForegroundColor Green -NoNewline; Write-Host " ... -- run a training command"
    Write-Host ""
    Write-Host "  Without this, you'd need to cd into the install folder first."
    Write-Host ""
    Write-Host "  What it does: places a tiny launcher in " -NoNewline
    Write-Host "~\.local\bin\" -ForegroundColor Yellow -NoNewline
    Write-Host " and adds"
    Write-Host "  that folder to your user PATH (no admin required)."
    Write-Host "  Survives updates -- git pull won't break it."
    Write-Host ""

    $addPath = Read-Host "  Add 'sidestep' command to PATH? [Y/n]"
    if ([string]::IsNullOrWhiteSpace($addPath)) { $addPath = "Y" }

    if ($addPath -match '^[Yy]$') {
        if (-not (Test-Path $localBin)) { New-Item -ItemType Directory -Path $localBin -Force | Out-Null }

        $proxyContent = "@echo off`r`n`"$sideDir\sidestep.bat`" %*"
        Set-Content -Path $proxyCmd -Value $proxyContent -Encoding ASCII
        Write-Ok "Created proxy: $proxyCmd"

        $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notlike "*$localBin*") {
            [System.Environment]::SetEnvironmentVariable("Path", "$localBin;$userPath", "User")
            $env:Path = "$localBin;$env:Path"
            Write-Ok "Added $localBin to user PATH"
        } else {
            Write-Ok "$localBin already on PATH"
        }

        Write-Host ""
        Write-Host "  You can now type 'sidestep' from any terminal!" -ForegroundColor Green
        Write-Host "  (You may need to restart your terminal for PATH changes to take effect.)" -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "  Skipped. You can always re-run this installer to set it up."
    }
}

# ── Summary ──────────────────────────────────────────────────────────────
Write-Host "`n"
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Side-Step:    $sideDir"
Write-Host "  Checkpoints:  $checkpointsDir"
Write-Host ""
if (Test-Path $proxyCmd) {
    Write-Host "  Quick start (from anywhere):"
    Write-Host "    sidestep              " -ForegroundColor Green -NoNewline; Write-Host "# Pick wizard or GUI"
    Write-Host "    sidestep gui          " -ForegroundColor Green -NoNewline; Write-Host "# Launch GUI directly"
    Write-Host "    sidestep train --help " -ForegroundColor Green -NoNewline; Write-Host "# CLI help"
} else {
    Write-Host "  Quick start:"
    Write-Host "    cd `"$sideDir`""
    Write-Host "    sidestep.bat              # Pick wizard or GUI"
    Write-Host "    sidestep.bat gui          # Launch GUI directly"
    Write-Host "    sidestep.bat train --help # CLI help"
}
Write-Host ""
Write-Host "  To update later:"
Write-Host "    cd `"$sideDir`""
Write-Host "    git pull && uv sync"
Write-Host ""
Write-Host "  IMPORTANT:"
Write-Host "    - Never rename checkpoint folders"
Write-Host "    - First run will ask where your checkpoints are"
Write-Host ""
Write-Host "  If you get CUDA errors, check:"
Write-Host "    uv run python -c `"import torch; print(torch.cuda.is_available())`""
Write-Host ""
