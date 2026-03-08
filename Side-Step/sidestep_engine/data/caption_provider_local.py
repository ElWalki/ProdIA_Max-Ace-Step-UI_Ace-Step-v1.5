"""
Generate audio captions using a local Qwen2.5-Omni-7B model.

Loads the model lazily on first use and caches it for the duration
of the batch.  Supports two VRAM tiers:

* **8-10 GB** — 4-bit NF4 quantisation via ``bitsandbytes``
* **16 GB+** — bf16 (auto-fallback to fp16 on older GPUs)

Call :func:`unload_model` after a batch to free VRAM.
"""

from __future__ import annotations

import gc
import logging
from pathlib import Path
from typing import Any, Optional

import torch

from sidestep_engine.data.caption_config import (
    DEFAULT_MAX_TOKENS,
    DEFAULT_TEMPERATURE,
    build_user_prompt,
    get_system_prompt,
)

logger = logging.getLogger(__name__)

# ── Model registry ──────────────────────────────────────────────────
MODEL_ID = "Qwen/Qwen2.5-Omni-7B"

# ── Module-level cache (lazy-loaded) ────────────────────────────────
_model: Any = None
_processor: Any = None
_loaded_tier: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────────────

def _resolve_model_path() -> str:
    """Return a local checkpoint path if present, else the HF Hub ID.

    Checks ``<project>/checkpoints/Qwen2.5-Omni-7B/`` first so that
    installer-downloaded weights are used without a network round-trip.
    """
    project_root = Path(__file__).resolve().parent.parent.parent
    local_dir = project_root / "checkpoints" / "Qwen2.5-Omni-7B"
    if local_dir.is_dir() and any(local_dir.iterdir()):
        logger.info("Using local model weights: %s", local_dir)
        return str(local_dir)
    return MODEL_ID


def _pick_dtype() -> torch.dtype:
    """Pick bf16 on Ampere+ GPUs, fall back to fp16."""
    if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
        return torch.bfloat16
    return torch.float16


def _load_model(tier: str) -> None:
    """Load model + processor into module-level cache.

    Args:
        tier: ``"8-10gb"`` for 4-bit NF4 or ``"16gb"`` for native bf16/fp16.
    """
    global _model, _processor, _loaded_tier  # noqa: PLW0603

    if _model is not None and _loaded_tier == tier:
        return  # already loaded at the right tier

    # Unload first if switching tiers
    if _model is not None:
        unload_model()

    from transformers import (
        BitsAndBytesConfig,
        Qwen2_5OmniForConditionalGeneration,
        Qwen2_5OmniProcessor,
    )

    model_path = _resolve_model_path()
    compute_dtype = _pick_dtype()
    logger.info(
        "Loading Qwen2.5-Omni-7B (tier=%s, dtype=%s) from %s …",
        tier, compute_dtype, model_path,
    )

    load_kwargs: dict[str, Any] = {
        "device_map": "auto",
        "trust_remote_code": True,
    }

    if tier == "8-10gb":
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=compute_dtype,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )
        load_kwargs["quantization_config"] = bnb_config
    else:
        load_kwargs["torch_dtype"] = compute_dtype

    try:
        _model = Qwen2_5OmniForConditionalGeneration.from_pretrained(
            model_path, **load_kwargs,
        )
        # Disable the speech synthesiser — saves ~2 GB VRAM
        _model.disable_talker()
        _processor = Qwen2_5OmniProcessor.from_pretrained(
            model_path, trust_remote_code=True,
        )
        _loaded_tier = tier
        logger.info("Model loaded successfully (tier=%s).", tier)
    except Exception:
        _model = None
        _processor = None
        _loaded_tier = None
        raise


def unload_model() -> None:
    """Free GPU memory occupied by the cached model."""
    global _model, _processor, _loaded_tier  # noqa: PLW0603
    if _model is not None:
        del _model
    if _processor is not None:
        del _processor
    _model = None
    _processor = None
    _loaded_tier = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    logger.info("Local captioner model unloaded — VRAM freed.")


# ── Public API ──────────────────────────────────────────────────────

def generate_caption(
    title: str,
    artist: str,
    *,
    audio_path: Optional[Path] = None,
    lyrics_excerpt: str = "",
    tier: str = "16gb",
    max_new_tokens: int = DEFAULT_MAX_TOKENS,
) -> Optional[str]:
    """Generate a caption for a song using the local Qwen2.5-Omni model.

    Args:
        title: Song title.
        artist: Artist name.
        audio_path: Path to the audio file.
        lyrics_excerpt: Optional lyrics text.
        tier: ``"8-10gb"`` or ``"16gb"``.
        max_new_tokens: Maximum tokens to generate.

    Returns:
        Raw caption string, or ``None`` on failure.
    """
    try:
        _load_model(tier)
    except ImportError as exc:
        logger.error(
            "Missing dependency for local captioning: %s. "
            "Install with: pip install transformers torchvision bitsandbytes qwen-omni-utils",
            exc,
        )
        return None
    except Exception as exc:
        logger.error("Failed to load local captioner model: %s", exc)
        return None

    assert _model is not None and _processor is not None

    from qwen_omni_utils import process_mm_info

    user_prompt = build_user_prompt(title, artist, lyrics_excerpt)
    system_prompt = get_system_prompt()

    # Build conversation in Qwen2.5-Omni format
    user_content: list[dict[str, str]] = []
    if audio_path and audio_path.is_file():
        user_content.append({"type": "audio", "audio": str(audio_path)})
    user_content.append({"type": "text", "text": user_prompt})

    conversation = [
        {
            "role": "system",
            "content": [{"type": "text", "text": system_prompt}],
        },
        {
            "role": "user",
            "content": user_content,
        },
    ]

    try:
        text_template = _processor.apply_chat_template(
            conversation, add_generation_prompt=True, tokenize=False,
        )
        audios, images, videos = process_mm_info(
            conversation, use_audio_in_video=False,
        )
        inputs = _processor(
            text=text_template,
            audio=audios,
            images=images,
            videos=videos,
            return_tensors="pt",
            padding=True,
            use_audio_in_video=False,
        )
        inputs = inputs.to(_model.device)

        with torch.inference_mode():
            text_ids = _model.generate(
                **inputs,
                return_audio=False,
                use_audio_in_video=False,
                max_new_tokens=max_new_tokens,
                temperature=DEFAULT_TEMPERATURE,
                do_sample=True,
            )

        decoded = _processor.batch_decode(
            text_ids, skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )
        result = decoded[0].strip() if decoded else ""
        if result:
            return result

        logger.warning("Local model returned empty for: %s - %s", artist, title)
        return None

    except torch.cuda.OutOfMemoryError:
        logger.error(
            "CUDA out of memory while captioning '%s - %s'. "
            "Try the 8-10gb tier or close other GPU applications.",
            artist, title,
        )
        return None
    except Exception as exc:
        logger.error("Local caption generation failed for '%s - %s': %s",
                     artist, title, exc)
        return None
