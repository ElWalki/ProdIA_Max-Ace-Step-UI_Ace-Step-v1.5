## Overview

Every `--flag` organized by subcommand. Arguments marked **(required)** must always be provided; everything else has a default.

All examples use `sidestep <subcommand>`. If the command is not on your PATH, use `uv run sidestep <subcommand>` instead.

Side-Step uses twelve subcommands:

| Subcommand | Purpose |
| --- | --- |
| `train` | Train an adapter (LoRA, DoRA, LoKR, LoHA, OFT) |
| `preprocess` | Convert audio to .pt tensors (two-pass pipeline) |
| `analyze` | PP++ / Fisher analysis for adaptive rank assignment |
| `audio-analyze` | Offline BPM, key, time signature extraction |
| `captions` | AI caption generation + lyrics scraping |
| `tags` | Bulk sidecar tag operations (add/remove triggers) |
| `dataset` | Build `dataset.json` from audio + sidecar folders |
| `convert-sidecars` | Migrate legacy sidecar formats to .txt |
| `settings` | View/modify persistent configuration |
| `history` | List past training runs and best loss values |
| `export` | Export adapter to ComfyUI `.safetensors` |
| `gui` | Launch the Electron desktop application |

---

## Global Flags

Available on every subcommand. Place these **before** the subcommand name.

```bash
sidestep --plain --yes train ...
```

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--plain` | | bool | `False` | Disable Rich output; use plain text. Auto-set when stdout is not a TTY |
| `--yes` | `-y` | bool | `False` | Skip the confirmation prompt and start immediately |

---

## `train` -- Train an Adapter

This is the main training subcommand. It includes all argument groups below.

### Model / Paths

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--checkpoint-dir` | `-c` | str | from settings | Path to checkpoints root directory |
| `--model` | `-M` | str | `turbo` | Model variant or subfolder name. Official: `turbo`, `base`, `sft`. For fine-tunes: use the exact folder name under checkpoint-dir. Also accepts `--model-variant` |

### Device / Platform

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--device` | | str | `auto` | Device selection: `auto`, `cuda`, `cuda:0`, `mps`, `xpu`, `cpu` |
| `--precision` | | str | `auto` | Precision: `auto`, `bf16`, `fp16`, `fp32` |

### Data

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--dataset-dir` | `-d` | str | **(required)** | Directory containing preprocessed `.pt` files |
| `--num-workers` | | int | `4` (Linux), `0` (Windows) | DataLoader workers |
| `--pin-memory` / `--no-pin-memory` | | bool | `True` | Pin memory for GPU transfer |
| `--prefetch-factor` | | int | `2` (Linux), `0` (Windows) | DataLoader prefetch factor |
| `--persistent-workers` / `--no-persistent-workers` | | bool | `True` (Linux), `False` (Windows) | Keep workers alive between epochs |

### Training

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--lr` / `--learning-rate` | `-l` | float | `3e-4` | Initial learning rate |
| `--batch-size` | `-b` | int | `1` | Training batch size |
| `--gradient-accumulation` | `-g` | int | `4` | Gradient accumulation steps. Effective batch = `batch-size` x this |
| `--epochs` | `-e` | int | `1000` | Maximum training epochs |
| `--max-steps` | `-m` | int | `0` | Maximum optimizer steps; 0 = use epochs only |
| `--warmup-steps` | | int | `100` | LR warmup steps |
| `--weight-decay` | | float | `0.01` | AdamW weight decay |
| `--max-grad-norm` | | float | `1.0` | Gradient clipping norm |
| `--seed` | `-s` | int | `42` | Random seed |
| `--chunk-duration` | | int | `None` (disabled) | Random latent chunk duration in seconds. Recommended: `60`. Extracts a random window each iteration for augmentation and VRAM savings. Values below 60s may hurt quality |
| `--chunk-decay-every` | | int | `10` | Epoch interval for halving chunk coverage histogram; 0 disables decay |
| `--optimizer-type` | | str | `adamw8bit` | Optimizer. Choices: `adamw`, `adamw8bit`, `adafactor`, `prodigy` |
| `--scheduler-type` | | str | `cosine` | LR scheduler. Choices: `cosine`, `cosine_restarts`, `linear`, `constant`, `constant_with_warmup`, `custom` |
| `--scheduler-formula` | | str | `""` | Custom LR formula (Python math expression). Only used with `--scheduler-type custom` |
| `--gradient-checkpointing` / `--no-gradient-checkpointing` | | bool | `True` | Recompute activations to save VRAM (~40-60% less, ~10-30% slower). See [[VRAM Optimization Guide]] |
| `--gradient-checkpointing-ratio` | | float | `1.0` | Fraction of decoder layers to checkpoint (0.0=none, 0.5=half, 1.0=all). Only applies when `--gradient-checkpointing` is on |
| `--offload-encoder` / `--no-offload-encoder` | | bool | `True` | Move encoder/VAE to CPU after setup (saves ~2-4 GB VRAM). On by default |

### Adapter

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--adapter` / `--adapter-type` | `-a` | str | `lora` | Adapter type: `lora`, `dora`, `lokr`, `loha`, `oft` |

### LoRA / DoRA (used when `--adapter=lora` or `--adapter=dora`)

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--rank` | `-r` | int | `64` | LoRA/DoRA rank. Higher = more capacity, more VRAM |
| `--alpha` | | int | `128` | LoRA/DoRA alpha (scaling factor). Usually 2x rank |
| `--dropout` | | float | `0.1` | LoRA/DoRA dropout. Increase for small datasets, decrease for large |
| `--target-modules` | | list | `q_proj k_proj v_proj o_proj` | Modules to apply adapter to. Space-separated |
| `--target-mlp` / `--no-target-mlp` | | bool | `True` | Target MLP/FFN layers (`gate_proj`, `up_proj`, `down_proj`) |
| `--bias` | | str | `none` | Bias training mode: `none`, `all`, `lora_only` |
| `--attention-type` | | str | `both` | Attention layers to target: `self`, `cross`, `both` |
| `--self-target-modules` | | list | `None` | Projections for self-attention only (when `--attention-type=both`) |
| `--cross-target-modules` | | list | `None` | Projections for cross-attention only (when `--attention-type=both`) |

### LoKR (used when `--adapter=lokr`)

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--lokr-linear-dim` | | int | `64` | LoKR linear dimension (analogous to LoRA rank) |
| `--lokr-linear-alpha` | | int | `128` | LoKR linear alpha (keep at 2x linear dim) |
| `--lokr-factor` | | int | `-1` | Kronecker factorization factor. `-1` = auto |
| `--lokr-decompose-both` | | bool | `False` | Decompose both Kronecker factors |
| `--lokr-use-tucker` | | bool | `False` | Use Tucker decomposition |
| `--lokr-use-scalar` | | bool | `False` | Use scalar scaling |
| `--lokr-weight-decompose` | | bool | `False` | Enable DoRA-style weight decomposition |

### LoHA (used when `--adapter=loha`)

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--loha-linear-dim` | | int | `64` | LoHA linear dimension (analogous to LoRA rank) |
| `--loha-linear-alpha` | | int | `128` | LoHA linear alpha (keep at 2x linear dim) |
| `--loha-factor` | | int | `-1` | Hadamard factorization factor. `-1` = auto |
| `--loha-use-tucker` | | bool | `False` | Use Tucker decomposition |
| `--loha-use-scalar` | | bool | `False` | Use scalar scaling |

### OFT (used when `--adapter=oft`) -- Experimental

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--oft-block-size` | | int | `64` | OFT block size (replaces rank as the capacity knob) |
| `--oft-coft` | | bool | `False` | Enable constrained OFT (Cayley projection) |
| `--oft-eps` | | float | `6e-5` | OFT epsilon for numerical stability |

### Checkpointing

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--output-dir` | `-o` | str | **(required)** | Output directory for adapter weights and logs |
| `--run-name` | `-n` | str | auto | Name for this training run. Auto-generated if omitted |
| `--save-every` | | int | `50` | Save checkpoint every N epochs |
| `--resume-from` | | str | `None` | Path to a checkpoint directory to resume from |
| `--strict-resume` / `--no-strict-resume` | | bool | `True` | Abort on config mismatch during resume |
| `--save-best` / `--no-save-best` | | bool | `True` | Auto-save best model by smoothed loss |
| `--save-best-after` | | int | `200` | Epoch to start best-model tracking |
| `--early-stop-patience` | | int | `0` | Stop if no improvement for N epochs; 0 = disabled |

### Logging / TensorBoard

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--log-dir` | | str | `None` | TensorBoard log directory. Default: `{output-dir}/runs` |
| `--log-every` | | int | `10` | Log basic metrics (loss, LR) every N steps |
| `--log-heavy-every` | | int | `50` | Log per-layer gradient norms every N steps; 0 disables heavy logging |

### Inline Preprocessing

These flags trigger the preprocessing pipeline inline with training. Add `--preprocess` to activate.

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--preprocess` | | bool | `False` | Preprocess audio into tensors, then continue to training |
| `--preprocess-only` | | bool | `False` | Run preprocessing and exit (do not train) |
| `--audio-dir` | | str | `None` | Source audio directory |
| `--dataset-json` | | str | `None` | Labeled dataset JSON file (lyrics, genre, BPM) |
| `--tensor-output` | | str | `None` | Output directory for `.pt` tensor files |
| `--max-duration` | | float | `0` | Max audio duration in seconds. `0` = auto-detect from dataset |
| `--normalize` | | str | `none` | Audio normalization: `none`, `peak`, `lufs` |
| `--target-db` | | float | `-1.0` | Peak normalization target in dBFS (used with `--normalize peak`) |
| `--target-lufs` | | float | `-14.0` | LUFS normalization target (used with `--normalize lufs`) |

### Corrected Training

These control the corrected training behavior for base/sft models. Auto-disabled for turbo. See [[Loss Weighting and CFG Dropout]].

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--cfg-ratio` | | float | `0.15` | CFG dropout probability. The base model was trained with 0.15 -- match it |
| `--loss-weighting` | | str | `none` | Loss weighting strategy: `none` (flat MSE) or `min_snr` |
| `--snr-gamma` | | float | `5.0` | Gamma for min-SNR weighting (only with `min_snr`) |
| `--ignore-fisher-map` | | bool | `False` | Bypass auto-detection of `fisher_map.json` in dataset dir |
| `--dataset-repeats` | `-R` | int | `1` | Global dataset repetition multiplier |

### All the Levers (Experimental)

Advanced experimental enhancements. Most users should leave these at defaults.

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--ema-decay` | | float | `0.0` | EMA decay for adapter weights (0 = off, 0.9999 = typical) |
| `--val-split` | | float | `0.0` | Validation holdout fraction (0 = off, 0.1 = 10%) |
| `--adaptive-timestep-ratio` | | float | `0.0` | Adaptive timestep sampling ratio (0 = off, 0.3 = recommended). Base/SFT only |
| `--warmup-start-factor` | | float | `0.1` | LR warmup starts at base_lr * this |
| `--cosine-eta-min-ratio` | | float | `0.01` | Cosine scheduler decays LR to base_lr * this |
| `--cosine-restarts-count` | | int | `4` | Number of cosine restart cycles |
| `--save-best-every-n-steps` | | int | `0` | Step-level best-model check interval (0 = epoch only) |
| `--timestep-mu` | | float | `None` | Override logit-normal timestep mean (default: from model config, typically -0.4) |
| `--timestep-sigma` | | float | `None` | Override logit-normal timestep sigma (default: from model config, typically 1.0) |

### Config File

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--config` | | str | `None` | Load training config from JSON file. CLI args override JSON values |

---

## `preprocess` -- Convert Audio to Tensors

Standalone preprocessing subcommand. Converts raw audio into `.pt` training tensors via a two-pass pipeline.

### Model / Paths

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--checkpoint-dir` | `-c` | str | from settings | Path to checkpoints root directory |
| `--model` | `-M` | str | `turbo` | Model variant or subfolder name |

### Device / Platform

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--device` | | str | `auto` | Device selection |
| `--precision` | | str | `auto` | Precision: `auto`, `bf16`, `fp16`, `fp32` |

### Preprocessing

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--audio-dir` / `--input` | `-i` | str | **(required)** | Source audio directory (scanned recursively) |
| `--dataset-json` | | str | `None` | Labeled dataset JSON file (alternative to audio-dir) |
| `--output` / `--tensor-output` | `-o` | str | **(required)** | Output directory for `.pt` tensor files |
| `--max-duration` | | float | `0` | Max audio duration in seconds. `0` = auto-detect |
| `--normalize` | | str | `none` | Audio normalization: `none`, `peak`, `lufs` |
| `--target-db` | | float | `-1.0` | Peak normalization target in dBFS |
| `--target-lufs` | | float | `-14.0` | LUFS normalization target |

---

## `analyze` -- PP++ / Fisher Analysis

Runs Fisher Information analysis on preprocessed tensors to generate a `fisher_map.json` for adaptive rank assignment. See [[Preprocessing++]].

### Model / Paths

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--checkpoint-dir` | `-c` | str | from settings | Path to checkpoints root directory |
| `--model` | `-M` | str | `turbo` | Model variant or subfolder name |

### Device / Platform

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--device` | | str | `auto` | Device selection |
| `--precision` | | str | `auto` | Precision: `auto`, `bf16`, `fp16`, `fp32` |

### Analysis

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--dataset-dir` | `-d` | str | **(required)** | Directory containing preprocessed `.pt` files |
| `--rank` | `-r` | int | `64` | Base LoRA rank (median target) |
| `--rank-min` | | int | `16` | Minimum adaptive rank |
| `--rank-max` | | int | `128` | Maximum adaptive rank |
| `--timestep-focus` | | str | `balanced` | Focus: `balanced`, `texture`, `structure`, or custom `low,high` range |
| `--runs` / `--fisher-runs` | | int | auto | Number of estimation runs (default: auto from dataset size) |
| `--batches` / `--fisher-batches` | | int | auto | Batches per run (default: auto from dataset size) |
| `--convergence-patience` | | int | `5` | Early stop when ranking stable for N batches |
| `--output` | | str | `None` | Override output path for `fisher_map.json` |

---

## `audio-analyze` -- Offline Audio Analysis

Extract BPM, key, and time signature from audio files. Uses Demucs stem separation + librosa. No API keys required.

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--input` | `-i` | str | **(required)** | Directory containing audio files (scanned recursively) |
| `--device` | | str | `auto` | Device: `auto`, `cuda`, `cpu` |
| `--policy` | | str | `fill_missing` | Merge policy: `fill_missing` (only fill empty fields), `overwrite_all` |
| `--mode` | | str | `mid` | Analysis quality: `faf` (fast, no Demucs), `mid` (default, ensemble), `sas` (deep multi-technique) |
| `--chunks` | | int | `5` | Number of analysis chunks for `sas` mode |

---

## `captions` -- AI Caption Generation

Generate sidecar metadata for audio files using AI providers or lyrics scraping.

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--input` | `-i` | str | **(required)** | Directory containing audio files (scanned recursively) |
| `--provider` | | str | from settings | Provider: `gemini`, `openai`, `local_8-10gb`, `local_16gb` |
| `--ai-model` / `--model` | | str | auto | Override AI model name (e.g. `gemini-2.5-flash`, `gpt-4o`) |
| `--policy` | | str | `fill_missing` | Merge policy: `fill_missing`, `overwrite_caption`, `overwrite_all` |
| `--lyrics` / `--no-lyrics` | | bool | `True` | Fetch lyrics from Genius (requires `GENIUS_API_TOKEN` or settings) |
| `--default-artist` | | str | `""` | Default artist name for Genius lookups when filename has no artist |
| `--gemini-api-key` | | str | `None` | Gemini API key (overrides env/settings) |
| `--openai-api-key` | | str | `None` | OpenAI API key (overrides env/settings) |
| `--openai-base-url` | | str | `None` | Custom OpenAI-compatible base URL |
| `--genius-token` | | str | `None` | Genius API token (overrides env/settings) |

---

## `tags` -- Bulk Sidecar Tag Operations

Manages trigger tags in sidecar `.txt` files. Has four sub-actions: `add`, `remove`, `clear`, `list`.

```bash
sidestep tags add ./my_audio --tag "suno_v4" --position prepend
sidestep tags remove ./my_audio --tag "suno_v4"
sidestep tags clear ./my_audio
sidestep tags list ./my_audio
```

### `tags add`

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `directory` | | str | positional | Directory of audio/sidecar files |
| `--tag` | `-t` | str | **(required)** | Trigger tag to add |
| `--position` | | str | `prepend` | Tag placement: `prepend`, `append`, `replace` |

### `tags remove`

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `directory` | | str | positional | Directory of audio/sidecar files |
| `--tag` | `-t` | str | **(required)** | Trigger tag to remove |

### `tags clear` / `tags list`

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `directory` | | str | positional | Directory of audio/sidecar files |

---

## `dataset` -- Build Dataset JSON

Scans a folder of audio files and builds a `dataset.json` with metadata from sidecar files.

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--input` | `-i` | str | **(required)** | Root directory containing audio files (scanned recursively) |
| `--tag` | | str | `""` (none) | Custom trigger tag applied to all samples |
| `--tag-position` | | str | `prepend` | Tag placement: `prepend`, `append`, `replace` |
| `--genre-ratio` | | int | `0` | Percentage of samples that use genre instead of caption (0-100) |
| `--name` | | str | `local_dataset` | Dataset name in metadata block |
| `--output` | | str | `None` | Output JSON path. Default: `<input>/dataset.json` |

See [[Dataset Preparation]] for the JSON schema and sidecar file format.

---

## `convert-sidecars` -- Migrate Legacy Sidecars

Converts per-file `.json` sidecars or `dataset.json` metadata to `.txt` sidecar format.

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--input` | `-i` | str | **(required)** | Directory with per-file `.json` sidecars, or path to a `dataset.json` |
| `--audio-dir` | | str | `None` | Audio directory (for dataset.json mode; defaults to JSON parent dir) |
| `--overwrite` | | bool | `False` | Overwrite existing `.txt` sidecars (default: skip existing) |
| `--yes` | `-y` | bool | `False` | Skip confirmation prompt |

---

## `settings` -- Persistent Configuration

View or modify Side-Step settings. Has sub-actions: `show`, `set`, `clear`, `path`, `defaults`.

```bash
sidestep settings show
sidestep settings set checkpoint_dir ./checkpoints
sidestep settings clear checkpoint_dir
sidestep settings path
sidestep settings defaults
sidestep settings defaults --set lr 1e-4
```

---

## `history` -- Past Training Runs

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--limit` | | int | `20` | Maximum number of runs to show |
| `--json` | | bool | `False` | Output raw JSON instead of a table |

---

## `export` -- Export Adapter to ComfyUI

Converts PEFT LoRA/DoRA adapters to the single-file `.safetensors` format ComfyUI expects. LyCORIS adapters (LoKR, LoHA) are already natively compatible.

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `adapter_dir` | | str | positional **(required)** | Path to adapter directory (e.g. `output/my_lora/final`) |
| `--output` | `-o` | str | auto | Output `.safetensors` file name |
| `--format` | `-f` | str | `comfyui` | Export format |
| `--target` | `-t` | str | `native` | ComfyUI target: `native` (ACE-Step 1.5 prefix) or `generic` (try if native fails) |
| `--prefix` | | str | `None` | Advanced: explicit key prefix override (ignores `--target`) |
| `--normalize-alpha` | | bool | `False` | Set alpha=rank so ComfyUI strength 1.0 = natural LoRA magnitude |

---

## `gui` -- Launch Desktop Application

| Flag | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--port` | | int | `8770` | GUI server port |

---

## Quick Reference: Defaults by Model Variant

Some arguments are automatically adjusted based on the detected model. You can override them, but the defaults are:

| Argument | Turbo | Base / SFT |
| --- | --- | --- |
| `--shift` | `3.0` | `1.0` |
| `--num-inference-steps` | `8` | `50` |
| `--cfg-ratio` | disabled | `0.15` |

See [[Shift and Timestep Sampling]] and [[Loss Weighting and CFG Dropout]] for details.

---

## See Also

- [[Training Guide]] -- Adapter types, wizard walkthrough, CLI examples
- [[The Settings Wizard]] -- Every wizard setting and what it maps to
- [[VRAM Optimization Guide]] -- VRAM profiles and optimization flags
- [[Dataset Preparation]] -- Preparing audio and metadata for training
- [[Preprocessing++]] -- Fisher analysis for adaptive rank assignment
