"""ComfyUI adapter export utilities.

Converts PEFT LoRA/DoRA adapters to the single-file safetensors format
expected by ComfyUI's LoRA loader node.  LyCORIS-based adapters (LoKR,
LoHA) are already natively compatible and need no conversion.

The main entry point is :func:`export_for_comfyui` which auto-detects
the adapter type and either converts or reports compatibility.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import torch
from safetensors.torch import load_file, save_file

logger = logging.getLogger(__name__)


# -- Export target presets ----------------------------------------------------
# Each target maps to a key prefix that matches a specific ComfyUI version
# or custom node's LoRA key mapping.  See comfy/lora.py in the ComfyUI repo
# for the authoritative key_map definitions.

COMFYUI_TARGETS: Dict[str, Dict[str, str]] = {
    "native": {
        "prefix": "base_model.model",
        "label": "ComfyUI Native (ACE-Step 1.5)",
        "description": (
            "Matches the ACEStep15-specific key_map in ComfyUI's lora.py: "
            'key_map["base_model.model.{path}"].  Recommended for ComfyUI '
            "with built-in ACE-Step 1.5 support."
        ),
    },
    "generic": {
        "prefix": "diffusion_model.decoder",
        "label": "ComfyUI Generic (diffusion_model.decoder)",
        "description": (
            "Uses the generic lora_unet / diffusion_model key_map that "
            "ComfyUI registers for all model types.  Try this if 'native' "
            "does not work with your ComfyUI version."
        ),
    },
}

DEFAULT_TARGET = "native"


def resolve_target(target_or_prefix: str) -> str:
    """Resolve a target name or raw prefix to a key prefix string.

    If *target_or_prefix* matches a key in :data:`COMFYUI_TARGETS`, the
    corresponding prefix is returned.  Otherwise the string is used as-is
    (allowing advanced users to pass a custom prefix).
    """
    if target_or_prefix in COMFYUI_TARGETS:
        return COMFYUI_TARGETS[target_or_prefix]["prefix"]
    return target_or_prefix


# -- Scaling info helper ------------------------------------------------------

def get_scaling_info(adapter_dir: str | Path) -> Dict[str, Any]:
    """Read adapter_config.json and compute the alpha/rank scaling ratio.

    Returns a dict with:
        - ``rank`` (int)
        - ``alpha`` (int | float)
        - ``ratio`` (float): alpha / rank
        - ``recommended_strength`` (float): approximate ComfyUI strength for 1x effect
        - ``needs_normalization`` (bool): True when ratio != 1.0
    """
    adapter_dir = Path(adapter_dir)
    config_path = adapter_dir / "adapter_config.json"
    if not config_path.is_file():
        return {"rank": 0, "alpha": 0, "ratio": 1.0,
                "recommended_strength": 1.0, "needs_normalization": False}

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    rank = cfg.get("r", 64)
    alpha = cfg.get("lora_alpha", rank)
    ratio = alpha / rank if rank else 1.0
    rec_strength = round(1.0 / ratio, 2) if ratio else 1.0

    return {
        "rank": rank,
        "alpha": alpha,
        "ratio": round(ratio, 3),
        "recommended_strength": rec_strength,
        "needs_normalization": abs(ratio - 1.0) > 0.01,
    }


# -- Adapter detection --------------------------------------------------------

_PEFT_ARTIFACTS = ("adapter_model.safetensors", "adapter_model.bin")
_LYCORIS_ARTIFACTS = ("lokr_weights.safetensors", "loha_weights.safetensors")


def detect_adapter_type(adapter_dir: str | Path) -> Tuple[str, Optional[Path]]:
    """Detect the adapter type present in *adapter_dir*.

    Returns:
        ``(adapter_type, weights_path)`` where *adapter_type* is one of
        ``"lora"``, ``"lokr"``, ``"loha"``, ``"oft"``, or ``"unknown"``.
    """
    adapter_dir = Path(adapter_dir)

    # LyCORIS files (already ComfyUI-compatible)
    for fname in _LYCORIS_ARTIFACTS:
        p = adapter_dir / fname
        if p.is_file():
            algo = "lokr" if "lokr" in fname else "loha"
            return algo, p

    # PEFT adapter (needs conversion)
    config_path = adapter_dir / "adapter_config.json"
    if config_path.is_file():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            peft_type = cfg.get("peft_type", "").upper()
            if peft_type == "OFT":
                for fname in _PEFT_ARTIFACTS:
                    p = adapter_dir / fname
                    if p.is_file():
                        return "oft", p
                return "oft", None
            # LORA covers both LoRA and DoRA (use_dora flag)
            for fname in _PEFT_ARTIFACTS:
                p = adapter_dir / fname
                if p.is_file():
                    return "lora", p
        except (json.JSONDecodeError, OSError):
            pass

    # Fallback: check for PEFT weight files without config
    for fname in _PEFT_ARTIFACTS:
        p = adapter_dir / fname
        if p.is_file():
            return "lora", p

    return "unknown", None


# -- PEFT LoRA/DoRA conversion -----------------------------------------------

def convert_peft_to_comfyui(
    adapter_dir: str | Path,
    output_path: str | None = None,
    model_prefix: str | None = None,
    target: str = DEFAULT_TARGET,
    normalize_alpha: bool = False,
    verbose: bool = True,
) -> str:
    """Convert PEFT adapter to ComfyUI LoRA format.

    Args:
        adapter_dir: Path to PEFT adapter directory (contains
            adapter_config.json + adapter_model.safetensors).
        output_path: Output .safetensors file name/path.  Defaults to
            ``<adapter_dir_name>_comfyui.safetensors`` next to the adapter dir.
        model_prefix: Explicit key prefix override.  When ``None`` (the
            default), the prefix is resolved from *target*.
        target: Named target preset (see :data:`COMFYUI_TARGETS`).
            Ignored when *model_prefix* is given explicitly.
        normalize_alpha: When ``True``, set each module's alpha equal to
            its rank so that ``alpha/rank = 1.0``.  This makes ComfyUI
            strength 1.0 correspond to the "natural" LoRA magnitude and
            avoids the need to manually lower strength when ``lora_alpha``
            was set higher than ``r`` during training.
        verbose: Print per-key remapping details.

    Returns:
        Path to the saved ComfyUI LoRA file.
    """
    if model_prefix is None:
        model_prefix = resolve_target(target)
    adapter_dir = Path(adapter_dir)

    # -- Load config ----------------------------------------------------------
    config_path = adapter_dir / "adapter_config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"No adapter_config.json found in {adapter_dir}")

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    global_alpha = config.get("lora_alpha", config.get("r", 64))
    global_rank = config.get("r", 64)
    alpha_pattern = config.get("alpha_pattern", {})
    rank_pattern = config.get("rank_pattern", {})
    use_dora = config.get("use_dora", False)

    logger.info("PEFT config: r=%d, alpha=%d, dora=%s", global_rank, global_alpha, use_dora)
    if rank_pattern:
        logger.info("rank_pattern has %d entries", len(rank_pattern))
    if alpha_pattern:
        logger.info("alpha_pattern has %d entries", len(alpha_pattern))

    # -- Load weights ---------------------------------------------------------
    weights_path = adapter_dir / "adapter_model.safetensors"
    if not weights_path.exists():
        weights_path = adapter_dir / "adapter_model.bin"
        if not weights_path.exists():
            raise FileNotFoundError(f"No adapter_model.safetensors or .bin in {adapter_dir}")
        peft_sd = torch.load(weights_path, map_location="cpu", weights_only=True)
    else:
        peft_sd = load_file(str(weights_path))

    logger.info("Loaded %d tensors from %s", len(peft_sd), weights_path.name)

    # -- Convert keys ---------------------------------------------------------
    # ComfyUI ACEStep15 LoRA key mapping expects:
    #   key_map["base_model.model.{path}"] = "diffusion_model.decoder.{path}.weight"
    # So we preserve the PEFT key structure, only renaming lora_A/B -> lora_down/up.
    comfy_sd: Dict[str, torch.Tensor] = {}
    lora_modules: set[str] = set()
    skipped: list[str] = []

    for peft_key, tensor in peft_sd.items():
        key = peft_key
        # Strip the PEFT wrapper prefix, then re-add the model_prefix.
        # PEFT saves keys as: base_model.model.layers.0.cross_attn.k_proj.lora_A.default.weight
        # We need:            base_model.model.layers.0.cross_attn.k_proj.lora_down.weight
        if key.startswith("base_model.model."):
            key = key[len("base_model.model."):]
        elif key.startswith("base_model."):
            key = key[len("base_model."):]

        comfy_key = f"{model_prefix}.{key}" if model_prefix else key

        # Strip .default. segment inserted by newer PEFT versions
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
            logger.warning("DoRA magnitude vector found: %s -> %s", peft_key, comfy_key)
        else:
            skipped.append(peft_key)
            continue

        comfy_sd[comfy_key] = tensor
        if verbose:
            logger.debug("  %s -> %s  %s", peft_key, comfy_key, list(tensor.shape))

    # -- Inject alpha tensors -------------------------------------------------
    for module_path in sorted(lora_modules):
        peft_module_path = module_path
        if peft_module_path.startswith(f"{model_prefix}."):
            peft_module_path = peft_module_path[len(f"{model_prefix}."):]

        if normalize_alpha:
            # Set alpha = rank so alpha/rank = 1.0 (strength 1.0 = natural magnitude)
            down_key = f"{module_path}.lora_down.weight"
            if down_key in comfy_sd:
                alpha = comfy_sd[down_key].shape[0]  # rank = first dim of lora_down
            else:
                alpha = rank_pattern.get(peft_module_path, global_rank)
            logger.info("  [normalize] %s alpha -> %d (= rank)", peft_module_path, alpha)
        elif peft_module_path in alpha_pattern:
            alpha = alpha_pattern[peft_module_path]
        else:
            alpha = global_alpha

        alpha_key = f"{module_path}.alpha"
        comfy_sd[alpha_key] = torch.tensor(float(alpha))

    if normalize_alpha:
        logger.info("Alpha normalized: all modules set to alpha=rank (scaling ratio 1.0)")

    logger.info("Converted %d LoRA modules", len(lora_modules))
    logger.info(
        "Total output tensors: %d (%d modules x 2 weights + %d alphas)",
        len(comfy_sd), len(lora_modules), len(lora_modules),
    )

    if skipped:
        logger.warning("Skipped %d non-LoRA keys", len(skipped))

    # -- Save -----------------------------------------------------------------
    if output_path is None:
        output_path = str(adapter_dir.parent / (adapter_dir.name + "_comfyui.safetensors"))

    save_file(comfy_sd, output_path)
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    logger.info("Saved ComfyUI LoRA to: %s (%.1f MB)", output_path, file_size_mb)

    return output_path


# -- High-level export entry point --------------------------------------------

def export_for_comfyui(
    adapter_dir: str | Path,
    output_path: str | None = None,
    model_prefix: str | None = None,
    target: str = DEFAULT_TARGET,
    normalize_alpha: bool = False,
    verbose: bool = True,
) -> Dict[str, Any]:
    """Auto-detect adapter type and export/report ComfyUI compatibility.

    Returns a result dict with keys:
        - ``ok`` (bool): Whether export succeeded or adapter is already compatible.
        - ``adapter_type`` (str): Detected adapter type.
        - ``output_path`` (str | None): Path to exported file, if any.
        - ``size_mb`` (float | None): Size of exported file in MB.
        - ``message`` (str): Human-readable status message.
        - ``already_compatible`` (bool): True if no conversion was needed.
        - ``scaling`` (dict | None): Alpha/rank scaling info.
    """
    adapter_dir = Path(adapter_dir)
    if not adapter_dir.is_dir():
        return {
            "ok": False,
            "adapter_type": "unknown",
            "output_path": None,
            "size_mb": None,
            "message": f"Directory not found: {adapter_dir}",
            "already_compatible": False,
        }

    adapter_type, weights_path = detect_adapter_type(adapter_dir)

    if adapter_type in ("lokr", "loha"):
        msg = (
            f"{adapter_type.upper()} adapters use LyCORIS format which is "
            f"already natively compatible with ComfyUI. "
            f"No conversion needed — load {weights_path.name} directly."
        )
        return {
            "ok": True,
            "adapter_type": adapter_type,
            "output_path": str(weights_path) if weights_path else None,
            "size_mb": weights_path.stat().st_size / (1024 * 1024) if weights_path else None,
            "message": msg,
            "already_compatible": True,
        }

    if adapter_type == "oft":
        return {
            "ok": False,
            "adapter_type": "oft",
            "output_path": None,
            "size_mb": None,
            "message": "OFT adapter export to ComfyUI is experimental and not yet supported.",
            "already_compatible": False,
        }

    if adapter_type == "unknown":
        return {
            "ok": False,
            "adapter_type": "unknown",
            "output_path": None,
            "size_mb": None,
            "message": f"No recognized adapter weights found in {adapter_dir}",
            "already_compatible": False,
        }

    # PEFT LoRA / DoRA — convert
    scaling = get_scaling_info(adapter_dir)
    try:
        out = convert_peft_to_comfyui(
            adapter_dir, output_path=output_path,
            model_prefix=model_prefix, target=target,
            normalize_alpha=normalize_alpha, verbose=verbose,
        )
        size_mb = os.path.getsize(out) / (1024 * 1024)
        msg = f"Exported ComfyUI LoRA to {out} ({size_mb:.1f} MB)"
        if normalize_alpha and scaling["needs_normalization"]:
            msg += " [alpha normalized to rank]"
        elif scaling["needs_normalization"]:
            msg += (
                f" -- Note: alpha/rank = {scaling['ratio']}x, "
                f"recommended ComfyUI strength ~ {scaling['recommended_strength']}"
            )
        return {
            "ok": True,
            "adapter_type": adapter_type,
            "output_path": out,
            "size_mb": round(size_mb, 1),
            "message": msg,
            "already_compatible": False,
            "scaling": scaling,
        }
    except Exception as exc:
        return {
            "ok": False,
            "adapter_type": adapter_type,
            "output_path": None,
            "size_mb": None,
            "message": f"Export failed: {exc}",
            "already_compatible": False,
            "scaling": scaling,
        }
