## Overview

Side-Step supports five adapter types:

| Adapter | Status | Library | Description |
| --- | --- | --- | --- |
| **LoRA** | Recommended | PEFT | Standard low-rank adaptation |
| **DoRA** | Stable | PEFT | Weight-decomposed LoRA (often better quality) |
| **LoKR** | Experimental | LyCORIS | Kronecker product factorization |
| **LoHA** | Experimental | LyCORIS | Hadamard product factorization |
| **OFT** | Experimental | PEFT | Orthogonal fine-tuning |

Side-Step **auto-detects** the model variant and selects the correct training strategy:

| Model | Timestep Sampling | CFG Dropout | Notes |
| --- | --- | --- | --- |
| **Turbo** | Discrete 8-step | Disabled | Matches turbo's inference schedule |
| **Base** | Continuous logit-normal | 15% | Matches how base was actually trained |
| **SFT** | Continuous logit-normal | 15% | Matches how sft was actually trained |

You don't need to choose a training mode -- just pick your model and Side-Step does the rest.

---

## Quick Start: GUI

The easiest way to train is the desktop GUI:

```bash
sidestep gui
```

The GUI offers **Ez Mode** (3-click training), **Advanced Mode** (every knob), a **Monitor** tab (live loss charts, GPU stats), and a **Lab** workspace (datasets, preprocessing, PP++, export).

---

## Quick Start: Wizard

If you prefer the terminal:

```bash
sidestep
```

The wizard walks you through:
1. Selecting adapter type (LoRA, DoRA, LoKR, LoHA, or OFT)
2. Picking your model (interactive selector with fuzzy search)
3. Seeing the auto-detected training strategy (turbo vs base/sft)
4. Setting hyperparameters (Basic mode uses good defaults, Advanced exposes everything)
5. Confirming and starting

### Wizard Features

- **Go-back navigation**: Type `b` at any prompt to return to the previous question
- **Presets**: Save and load named configurations (main menu > Manage presets)
- **Flow chaining**: After preprocessing, the wizard offers to start training immediately
- **ComfyUI export**: Convert PEFT adapters to diffusers format (main menu > Export)
- **Settings**: Configure checkpoint paths (main menu > Settings)
- **Session loop**: The wizard stays open after each action -- no need to restart

---

## Quick Start: CLI

For automated pipelines or when you know exactly what you want:

### Preprocessing

Convert raw audio to training tensors:

```bash
# With a dataset JSON (lyrics, genre, BPM metadata)
sidestep preprocess \
    --audio-dir ./my_audio \
    --dataset-json ./my_dataset.json \
    --output ./my_tensors

# Without metadata (all tracks treated as instrumentals)
sidestep preprocess \
    --audio-dir ./my_audio \
    --output ./my_tensors
```

Preprocessing runs in two passes to minimize VRAM:
1. **Pass 1** -- VAE + Text Encoder (~3 GB): encodes audio to latents, text to embeddings
2. **Pass 2** -- DiT Encoder (~6 GB): generates condition encodings

### Training

```bash
# LoRA (stable, recommended)
sidestep train \
    --dataset-dir ./my_tensors \
    --output-dir ./output/my_lora \
    --epochs 500

# DoRA (weight-decomposed LoRA)
sidestep train \
    --adapter dora \
    --dataset-dir ./my_tensors \
    --output-dir ./output/my_dora \
    --epochs 500

# LoKR (experimental, Kronecker product)
sidestep train \
    --adapter lokr \
    --dataset-dir ./my_tensors \
    --output-dir ./output/my_lokr \
    --epochs 500

# Training on a fine-tune
sidestep train \
    --model my-custom-finetune \
    --base-model base \
    --dataset-dir ./my_tensors \
    --output-dir ./output/finetune_lora
```

---

## Adapter Types

### LoRA (Low-Rank Adaptation)

- Uses the PEFT library
- Well-tested, stable, widely supported
- Adds low-rank matrices to attention layers
- Good default: rank 64, alpha 128

### DoRA (Weight-Decomposed LoRA)

- Uses the PEFT library
- Decomposes weights into magnitude and direction components
- Often produces better quality than standard LoRA at similar rank
- Same hyperparameters as LoRA (rank, alpha, dropout)

### LoKR (Low-Rank Kronecker)

- Uses the LyCORIS library (included automatically)
- **Experimental** -- may have rough edges
- Uses Kronecker product factorization instead of simple low-rank decomposition
- May capture different patterns than LoRA
- Additional options: Tucker decomposition, scalar scaling

### LoHA (Low-Rank Hadamard)

- Uses the LyCORIS library
- **Experimental** -- similar maturity to LoKR
- Uses Hadamard product factorization
- Can capture different structural patterns than LoRA or LoKR

### OFT (Orthogonal Fine-Tuning)

- Uses the PEFT library
- **Experimental** -- preserves the model's weight space geometry
- Uses orthogonal rotation matrices instead of low-rank additive updates
- Different approach: block size replaces rank as the primary capacity knob

> **Warning:** LoKR, LoHA, and OFT are experimental. If you encounter issues, fall back to LoRA or DoRA.

### Preprocessing is adapter-agnostic

Preprocessing produces the same tensors regardless of which adapter you plan to train. The adapter type only affects how trainable weights are injected into the model during training -- it does not change the data pipeline. You only need to preprocess your audio once, and the resulting `.pt` files work for all five adapter types.

---

## Hyperparameter Guide

### Learning Rate

| Optimizer | Recommended LR | Notes |
|-----------|----------------|-------|
| AdamW | `1e-4` | Standard choice |
| AdamW8bit | `1e-4` | Same as AdamW but saves ~30% optimizer VRAM |
| Adafactor | `1e-4` | Minimal state memory |
| Prodigy | `1.0` | Auto-tunes the actual LR. Set scheduler to `constant` |

### Rank (LoRA) / Linear Dim (LoKR)

| Rank | Capacity | VRAM | Use Case |
|------|----------|------|----------|
| 16 | Low | Minimal | Quick tests, very small datasets |
| 64 | Medium | Standard | Recommended default |
| 128 | High | Higher | Large datasets, maximum quality |

### Epochs

Depends heavily on dataset size:
- **1-10 songs**: 200-500 epochs
- **10-50 songs**: 100-200 epochs
- **50+ songs**: 50-100 epochs

Watch the loss curve in TensorBoard. If it plateaus, you can stop early.

### VRAM Optimization

Side-Step applies several optimizations automatically and exposes others as options. For the full deep-dive, see [[VRAM Optimization Guide]].

**Automatic (no user action needed):**

1. **Gradient checkpointing** (ON by default) -- recomputes activations during backward pass, saves ~40-60% activation VRAM (~10-30% slower). Matches what the original ACE-Step trainer always did.
2. **Flash Attention 2** (auto-installed) -- fused attention kernels for better GPU utilization. Requires Ampere+ GPU (RTX 30xx or newer). Falls back to SDPA on older hardware.

**User-configurable (from least to most aggressive):**

3. **Batch size 1** (default) -- minimum memory per step
4. **8-bit optimizer** (`--optimizer-type adamw8bit`) -- saves ~30% optimizer VRAM
5. **Encoder offloading** (`--offload-encoder`) -- saves ~2-4 GB after setup
6. **Lower rank** (16 instead of 64) -- fewer trainable parameters

---

## Monitoring Training

### GUI Monitor

The GUI's Monitor tab shows live loss charts, learning rate curves, and GPU stats during training. No separate tool needed.

### TensorBoard

Side-Step also logs training metrics to TensorBoard automatically:

```bash
# In a separate terminal
tensorboard --logdir ./output/my_lora/runs

# Then open http://localhost:6006 in your browser
```

Key metrics to watch:
- **loss/train** -- Should decrease over time. Spikes are normal but persistent increase means overfitting
- **lr** -- Learning rate schedule. Should warm up then follow your chosen scheduler
- **grad_norm/** -- Per-layer gradient norms (logged every `--log-heavy-every` steps)
- **train/timestep_distribution** -- Histogram of sampled timesteps (under the Histograms tab). Verify your training is sampling the right noise levels

### Log File

All sessions append to `sidestep.log` in the working directory. This captures full tracebacks and debug-level messages that may not appear in the terminal. Useful for diagnosing issues.

---

## Resuming Training

If training is interrupted, resume from a checkpoint:

```bash
sidestep train \
    --dataset-dir ./my_tensors \
    --output-dir ./output/my_lora \
    --resume-from ./output/my_lora/checkpoint-epoch-50
```

The checkpoint contains LoRA/LoKR weights, optimizer state, and scheduler state. Training continues from where it left off.

---

## Preprocessing++ (Adaptive Rank Assignment)

If you aren't sure which modules to target or what rank to use, Side-Step provides the `analyze` subcommand. It runs Fisher Information analysis to generate a rank distribution map that training automatically detects.

```bash
sidestep analyze \
    --dataset-dir ./my_preprocessed_dataset \
    --rank 64 \
    --rank-min 16 \
    --rank-max 128
```

This creates a `fisher_map.json` in your dataset directory. When you run `sidestep train` with that dataset, it will automatically detect the map and use it to assign varying ranks to different layers. Useful for:
- Putting parameters where they matter most for your audio
- Capturing texture and timbre better than flat-rank training
- Reducing overfitting by leaving irrelevant layers alone

See [[Preprocessing++]] for the full guide.

---

## See Also

- [[Getting Started]] -- Installation and setup
- [[Model Management]] -- Checkpoint structure and fine-tune support
- [[Loss Weighting and CFG Dropout]] -- Loss weighting strategies, CFG dropout tuning, timestep distribution
- [[Shift and Timestep Sampling]] -- How training timesteps work, what shift actually does, Side-Step vs upstream
- [[Preprocessing++]] -- Dataset-aware adaptive rank and auto-targeting workflow
- [[VRAM Optimization Guide]] -- VRAM profiles, GPU tiers, and complete wizard settings reference
- [[CLI Argument Reference]] -- Every `--flag` organized by subcommand
