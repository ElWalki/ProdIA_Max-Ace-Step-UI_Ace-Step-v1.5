# End-to-End Tutorial

This walkthrough takes you from raw audio files to generating music with a trained adapter. Every step includes the CLI command and links to detailed documentation.

> All CLI examples use `sidestep <subcommand>`. If the command is not on your PATH, use `uv run sidestep <subcommand>` instead. The GUI offers the same workflows visually -- launch with `sidestep gui`.

**Prerequisites:** Side-Step installed and working, model checkpoints downloaded, GPU with CUDA support. See [[Getting Started]] if you have not set up yet.

---

## Step 1: Prepare Your Dataset

Collect your audio files into a single folder. Side-Step supports `.wav`, `.mp3`, `.flac`, `.ogg`, `.opus`, and `.m4a`.

```text
my_audio/
├── track1.wav
├── track2.wav
├── track3.mp3
└── track4.flac
```

---

## Step 2: Preprocess

Convert your raw audio into preprocessed `.pt` tensor files. This runs in two low-VRAM passes: (1) VAE + Text Encoder (~3 GB), then (2) DIT encoder (~6 GB).

**Without a dataset JSON (auto-captions from filenames):**

```bash
sidestep preprocess \
    --audio-dir ./my_audio \
    --output ./my_tensors
```

**With a dataset JSON:**

```bash
sidestep preprocess \
    --audio-dir ./my_audio \
    --dataset-json ./my_audio/my_dataset.json \
    --output ./my_tensors
```

The checkpoint directory and model variant are read from your settings (configured during first-run setup). Override with `--checkpoint-dir` and `--model` if needed.

After preprocessing, you will have a `my_tensors/` directory containing `.pt` files and a `manifest.json`. These tensors work for all adapter types (LoRA, DoRA, LoKR, LoHA, OFT) -- you only need to preprocess once.

---

## Step 3: Train

Start training with the preprocessed tensors:

```bash
sidestep train \
    --dataset-dir ./my_tensors \
    --output-dir ./output/my_lora \
    --epochs 500
```

This uses the `recommended` defaults (rank 64, cosine LR schedule, AdamW8bit optimizer). To use a preset instead:

```bash
# Start the wizard and load a preset
sidestep
```

The wizard lets you load a preset (e.g., `vram_12gb` for a 12 GB GPU), adjust individual settings, and start training interactively. The GUI offers the same via Ez Mode (3 clicks) or Advanced Mode (every knob). See [[Preset Management]] for the full list of built-in presets.

**Key flags to know:**

| Flag | Purpose |
| :--- | :--- |
| `--epochs 500` | How many times to loop through the dataset |
| `--rank 64` | LoRA capacity (higher = more expressive, more VRAM) |
| `--save-every 10` | Save a checkpoint every N epochs |
| `--offload-encoder` | Free ~2-4 GB VRAM by moving encoders to CPU |
| `--optimizer-type adamw8bit` | Use 8-bit optimizer to save VRAM |

For all available options, see [[CLI Argument Reference]] or [[The Settings Wizard]].

---

## Step 4: Monitor

**In the GUI:** The Monitor tab shows live loss charts, learning rate curves, and GPU stats in real time.

**Via TensorBoard:**

```bash
tensorboard --logdir ./output/my_lora/runs
```

Open `http://localhost:6006` in your browser. Watch for:

- **Loss** decreasing and stabilizing (good) vs. loss dropping then rising (overfitting).
- **Learning rate** following the expected schedule (warmup then decay).
- **Gradient norms** staying stable (spikes may indicate training issues).

---

## Step 5: Export for ComfyUI (Optional)

If you use ComfyUI, export the adapter to the format it expects:

```bash
sidestep export ./output/my_lora/final
```

This writes a single `.safetensors` file that ComfyUI loads directly. LyCORIS adapters (LoKR, LoHA) are already natively compatible and don't need conversion -- only PEFT LoRA/DoRA adapters require this step.

The GUI's Export tab provides the same functionality visually.

---

## Step 6: Use Your Adapter

After training completes, your adapter is saved in `./output/my_lora/final/`.

### In ACE-Step Gradio

1. Start ACE-Step's Gradio UI.
2. In **Service Configuration**, find the **LoRA Adapter** section.
3. Enter the path to your adapter:
   ```
   /full/path/to/Side-Step/output/my_lora/final
   ```
4. Click **Load LoRA**.
5. Toggle **Use LoRA** on.
6. Adjust **LoRA Scale** (1.0 = full strength).
7. Generate audio. If you used a `custom_tag`, include it in your prompt.

### In ComfyUI

Use the exported `.safetensors` file from Step 5. See [[Using Your Adapter]] for detailed instructions.

**Important:** Use the correct shift and inference steps for your model variant. If you trained on turbo, use `shift=3.0` and 8 inference steps. For base/sft, use `shift=1.0` and 50 steps. See [[Shift and Timestep Sampling]] for details.

For the full guide on output layout, adapter limitations, and checkpoint usage, see [[Using Your Adapter]].

---

## Step 7: Iterate

Training is iterative. Here are common next steps:

### Resume training for more epochs

```bash
sidestep train \
    --dataset-dir ./my_tensors \
    --output-dir ./output/my_lora \
    --resume-from ./output/my_lora/checkpoints/epoch_100 \
    --epochs 1000
```

### Try a different preset

Load a VRAM-appropriate preset to optimize for your GPU:

```bash
sidestep    # wizard mode, load a preset at the start
```

### Test intermediate checkpoints

Every checkpoint is inference-ready. Point ACE-Step at any checkpoint directory to hear how your LoRA sounds at different training stages:

```
./output/my_lora/checkpoints/epoch_50
./output/my_lora/checkpoints/epoch_100
```

### Adjust hyperparameters

- **Overfitting?** (loss drops then rises, output sounds like your training data verbatim) -- Lower rank, increase dropout, add more training data.
- **Underfitting?** (loss stays high, LoRA has no audible effect) -- Increase epochs, increase rank, check your dataset quality.
- **Running out of VRAM?** -- See [[VRAM Optimization Guide]] for tier-specific settings.

---

## Quick Reference

| Step | Command | Output |
| :--- | :--- | :--- |
| Preprocess | `sidestep preprocess --audio-dir ./my_audio --output ./my_tensors` | `./my_tensors/*.pt` |
| Train | `sidestep train --dataset-dir ./my_tensors --output-dir ./output/my_lora` | `./output/my_lora/final/` |
| Export | `sidestep export ./output/my_lora/final` | `.safetensors` for ComfyUI |
| Monitor | GUI Monitor tab, or `tensorboard --logdir ./output/my_lora/runs` | Live charts |
| Inference | Load `./output/my_lora/final` in ACE-Step Gradio or ComfyUI | Generated audio |

---

## See Also

- [[Dataset Preparation]] -- JSON format, metadata fields, audio requirements
- [[Using Your Adapter]] -- Output layout, Gradio loading, LoKR limitations
- [[Training Guide]] -- Full training options and hyperparameters
- [[Preset Management]] -- Built-in presets, save/load/import/export
- [[VRAM Optimization Guide]] -- GPU memory profiles
- [[Windows Notes]] -- Windows-specific setup and workarounds
