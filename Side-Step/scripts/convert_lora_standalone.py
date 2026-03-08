#!/usr/bin/env python3
"""Standalone PEFT LoRA -> ComfyUI converter for ACE-Step 1.5.

Zero dependency on Side-Step.  Only requires:
    pip install torch safetensors

Usage:
    python convert_lora_standalone.py <adapter_dir>
    python convert_lora_standalone.py <adapter_dir> --target native
    python convert_lora_standalone.py <adapter_dir> --target generic
    python convert_lora_standalone.py <adapter_dir> --prefix my.custom.prefix
    python convert_lora_standalone.py <adapter_dir> -o my_lora.safetensors

Targets:
    native   (default)  base_model.model prefix -- ComfyUI built-in ACE-Step 1.5
    generic             diffusion_model.decoder prefix -- broad compat fallback
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import torch
from safetensors.torch import load_file, save_file

# ---------------------------------------------------------------------------
# Target presets
# ---------------------------------------------------------------------------

TARGETS = {
    "native": {
        "prefix": "base_model.model",
        "desc": "ComfyUI built-in ACE-Step 1.5 (base_model.model prefix)",
    },
    "generic": {
        "prefix": "diffusion_model.decoder",
        "desc": "Generic ComfyUI key map (diffusion_model.decoder prefix)",
    },
}

DEFAULT_TARGET = "native"


def resolve_prefix(target_or_prefix: str) -> str:
    if target_or_prefix in TARGETS:
        return TARGETS[target_or_prefix]["prefix"]
    return target_or_prefix


# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------

def convert(adapter_dir: str, output: str | None, prefix: str, verbose: bool, normalize_alpha: bool = False) -> str:
    adapter_dir = Path(adapter_dir)

    # -- Load config ----------------------------------------------------------
    config_path = adapter_dir / "adapter_config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"No adapter_config.json in {adapter_dir}")

    with open(config_path) as f:
        config = json.load(f)

    global_alpha = config.get("lora_alpha", config.get("r", 64))
    alpha_pattern = config.get("alpha_pattern", {})
    use_dora = config.get("use_dora", False)

    print(f"[info] r={config.get('r')}, alpha={global_alpha}, dora={use_dora}")

    # -- Load weights ---------------------------------------------------------
    weights_path = adapter_dir / "adapter_model.safetensors"
    if not weights_path.exists():
        weights_path = adapter_dir / "adapter_model.bin"
        if not weights_path.exists():
            raise FileNotFoundError(f"No adapter_model.safetensors or .bin in {adapter_dir}")
        peft_sd = torch.load(weights_path, map_location="cpu", weights_only=True)
    else:
        peft_sd = load_file(str(weights_path))

    print(f"[info] Loaded {len(peft_sd)} tensors from {weights_path.name}")

    # -- Remap keys -----------------------------------------------------------
    comfy_sd: dict[str, torch.Tensor] = {}
    lora_modules: set[str] = set()
    skipped: list[str] = []

    for peft_key, tensor in peft_sd.items():
        key = peft_key
        if key.startswith("base_model.model."):
            key = key[len("base_model.model."):]
        elif key.startswith("base_model."):
            key = key[len("base_model."):]

        comfy_key = f"{prefix}.{key}" if prefix else key

        # Strip .default. segment from newer PEFT versions
        comfy_key = comfy_key.replace(".default.", ".")

        if ".lora_A." in comfy_key:
            comfy_key = comfy_key.replace(".lora_A.", ".lora_down.")
            module_path = comfy_key.rsplit(".lora_down.", 1)[0]
            lora_modules.add(module_path)
        elif ".lora_B." in comfy_key:
            comfy_key = comfy_key.replace(".lora_B.", ".lora_up.")
            module_path = comfy_key.rsplit(".lora_up.", 1)[0]
            lora_modules.add(module_path)
        elif ".lora_magnitude_vector" in comfy_key:
            comfy_key = comfy_key.replace(".lora_magnitude_vector", ".dora_scale")
            print(f"[dora] {peft_key} -> {comfy_key}")
        else:
            skipped.append(peft_key)
            continue

        comfy_sd[comfy_key] = tensor
        if verbose:
            print(f"  {peft_key} -> {comfy_key}  {list(tensor.shape)}")

    # -- Alpha tensors --------------------------------------------------------
    for module_path in sorted(lora_modules):
        mp = module_path
        if prefix and mp.startswith(f"{prefix}."):
            mp = mp[len(f"{prefix}."):]

        if normalize_alpha:
            down_key = f"{module_path}.lora_down.weight"
            if down_key in comfy_sd:
                alpha_val = comfy_sd[down_key].shape[0]  # rank
            else:
                alpha_val = config.get("r", 64)
            print(f"  [normalize] {mp} alpha -> {alpha_val} (= rank)")
        else:
            alpha_val = alpha_pattern.get(mp, global_alpha)
        comfy_sd[f"{module_path}.alpha"] = torch.tensor(float(alpha_val))

    if normalize_alpha:
        print(f"[info] Alpha normalized: all modules set to alpha=rank (scaling 1.0x)")

    # -- Save -----------------------------------------------------------------
    if output is None:
        output = str(adapter_dir.parent / (adapter_dir.name + "_comfyui.safetensors"))

    save_file(comfy_sd, output)
    size_mb = os.path.getsize(output) / (1024 * 1024)

    print(f"[info] {len(lora_modules)} LoRA modules, {len(comfy_sd)} total tensors")
    if skipped:
        print(f"[warn] Skipped {len(skipped)} non-LoRA keys")
    print(f"[ok] Saved: {output} ({size_mb:.1f} MB)")

    # -- Dump first few keys for verification ---------------------------------
    print(f"\n[keys] First 5 output keys:")
    for i, k in enumerate(sorted(comfy_sd.keys())):
        if i >= 5:
            print(f"       ... and {len(comfy_sd) - 5} more")
            break
        print(f"       {k}")

    return output


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Standalone PEFT LoRA -> ComfyUI converter (ACE-Step 1.5)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "targets:\n"
            "  native   base_model.model prefix (ComfyUI built-in ACE-Step 1.5)\n"
            "  generic  diffusion_model.decoder prefix (broad compat fallback)\n"
        ),
    )
    parser.add_argument("adapter_dir", help="Path to PEFT adapter directory")
    parser.add_argument("-o", "--output", default=None,
                        help="Output .safetensors path (default: auto)")
    parser.add_argument("-t", "--target", default=DEFAULT_TARGET,
                        choices=list(TARGETS.keys()),
                        help=f"Target format (default: {DEFAULT_TARGET})")
    parser.add_argument("--prefix", default=None,
                        help="Manual key prefix override (ignores --target)")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Print every key mapping")
    parser.add_argument("--normalize-alpha", action="store_true",
                        help="Set alpha=rank so ComfyUI strength 1.0 = natural magnitude")
    parser.add_argument("--dump-keys", action="store_true",
                        help="Dump ALL output keys (for debugging)")
    args = parser.parse_args()

    prefix = args.prefix if args.prefix is not None else resolve_prefix(args.target)

    print(f"[config] target={args.target}, prefix={prefix!r}")
    print(f"[config] adapter_dir={args.adapter_dir}")
    if args.normalize_alpha:
        print(f"[config] normalize_alpha=True (alpha will be set to rank)")

    try:
        out = convert(args.adapter_dir, args.output, prefix, args.verbose, args.normalize_alpha)
    except Exception as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        sys.exit(1)

    if args.dump_keys:
        sd = load_file(out)
        print(f"\n[dump] All {len(sd)} keys in {out}:")
        for k in sorted(sd.keys()):
            print(f"  {k}  {list(sd[k].shape)}")


if __name__ == "__main__":
    main()
