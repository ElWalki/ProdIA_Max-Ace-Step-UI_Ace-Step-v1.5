"""Convert a PEFT LoRA adapter directory to a ComfyUI-compatible single safetensors file.

Thin CLI wrapper around :mod:`sidestep_engine.core.comfyui_export`.
Prefer ``sidestep export`` for integrated usage.

Usage:
    python scripts/convert_peft_to_comfyui.py <peft_adapter_dir> [--output <output.safetensors>]

Example:
    python scripts/convert_peft_to_comfyui.py output/my_lora --output my_lora_comfyui.safetensors
"""

import argparse
import logging
import sys
from pathlib import Path

# Ensure the project root is importable when run as a standalone script.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from sidestep_engine.core.comfyui_export import export_for_comfyui


def main():
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Convert PEFT LoRA to ComfyUI format")
    parser.add_argument("adapter_dir", help="Path to PEFT adapter directory")
    parser.add_argument("--output", "-o", default=None, help="Output .safetensors file name (default: <adapter_dir_name>_comfyui.safetensors)")
    parser.add_argument("--target", "-t", default="native", choices=["native", "generic"],
                        help="ComfyUI target format (default: native)")
    parser.add_argument("--prefix", default=None, help="Advanced: explicit key prefix override (ignores --target)")
    parser.add_argument("--normalize-alpha", action="store_true", default=False,
                        dest="normalize_alpha",
                        help="Set alpha=rank so ComfyUI strength 1.0 = natural magnitude")
    args = parser.parse_args()

    result = export_for_comfyui(
        args.adapter_dir,
        output_path=args.output,
        model_prefix=args.prefix,
        target=args.target,
        normalize_alpha=args.normalize_alpha,
    )

    if result["ok"]:
        print(f"[OK] {result['message']}")
    else:
        print(f"[FAIL] {result['message']}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
