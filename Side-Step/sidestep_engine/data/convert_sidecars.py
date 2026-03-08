"""
Convert per-file JSON sidecars or a dataset.json into TXT sidecar files.

Supports two input modes:

1. **Per-file JSON**: ``song.json`` alongside ``song.wav`` -- keys are
   extracted and written to ``song.txt``.
2. **Dataset JSON**: A single ``dataset.json`` (upstream ACE-Step format)
   containing a ``samples`` array -- each sample is written as a
   ``<filename>.txt`` sidecar next to the audio file.

Uses the standard ``write_sidecar()`` from ``sidecar_io`` so the output
format is identical to what the rest of the pipeline expects.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

from sidestep_engine.core.constants import AUDIO_EXTENSIONS
from sidestep_engine.data.sidecar_io import write_sidecar

logger = logging.getLogger(__name__)

# Upstream JSON keys → TXT sidecar key names
_KEY_MAP = {
    "caption": "caption",
    "genre": "genre",
    "bpm": "bpm",
    "keyscale": "key",
    "key": "key",
    "timesignature": "signature",
    "signature": "signature",
    "lyrics": "lyrics",
    "custom_tag": "custom_tag",
    "trigger": "custom_tag",
    "is_instrumental": "is_instrumental",
    "prompt_override": "prompt_override",
    "tags": "tags",
    "repeat": "repeat",
}


def _map_sample_to_sidecar(sample: Dict[str, Any]) -> Dict[str, str]:
    """Map a JSON sample dict to TXT sidecar key-value pairs."""
    out: Dict[str, str] = {}
    for json_key, txt_key in _KEY_MAP.items():
        val = sample.get(json_key)
        if val is None or val == "":
            continue
        if isinstance(val, bool):
            out[txt_key] = "true" if val else "false"
        else:
            out[txt_key] = str(val)
    return out


def convert_per_file_jsons(
    directory: str,
    *,
    overwrite: bool = False,
) -> List[Tuple[Path, Path]]:
    """Convert per-file ``<stem>.json`` sidecars to ``<stem>.txt``.

    Scans *directory* for audio files with a matching ``.json`` sidecar
    and writes a ``.txt`` version.

    Returns:
        List of ``(json_path, txt_path)`` pairs that were converted.
    """
    base = Path(directory).resolve()
    converted: List[Tuple[Path, Path]] = []

    audio_files = sorted(
        f for f in base.rglob("*")
        if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS
    )

    for af in audio_files:
        json_path = af.with_suffix(".json")
        if not json_path.is_file():
            continue

        txt_path = af.with_suffix(".txt")
        if txt_path.is_file() and not overwrite:
            logger.info("Skipping %s (TXT sidecar already exists)", af.name)
            continue

        try:
            raw = json.loads(json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Could not read %s: %s", json_path, exc)
            continue

        if not isinstance(raw, dict):
            logger.warning("Unexpected JSON structure in %s (expected object)", json_path)
            continue

        sidecar_data = _map_sample_to_sidecar(raw)
        if not sidecar_data:
            logger.warning("No mappable fields in %s", json_path)
            continue

        write_sidecar(txt_path, sidecar_data)
        converted.append((json_path, txt_path))
        logger.info("Converted %s -> %s", json_path.name, txt_path.name)

    return converted


def convert_dataset_json(
    json_path: str,
    audio_dir: str | None = None,
    *,
    overwrite: bool = False,
) -> List[Tuple[str, Path]]:
    """Convert an upstream ``dataset.json`` into per-file TXT sidecars.

    Each sample in the JSON's ``samples`` array is written as a
    ``<filename>.txt`` sidecar.  Audio files are located via
    ``filename`` or ``audio_path`` relative to *audio_dir* (defaults
    to the JSON file's parent directory).

    Returns:
        List of ``(sample_filename, txt_path)`` pairs that were written.
    """
    jp = Path(json_path).resolve()
    if not jp.is_file():
        raise FileNotFoundError(f"Dataset JSON not found: {jp}")

    raw = json.loads(jp.read_text(encoding="utf-8"))
    samples = raw if isinstance(raw, list) else raw.get("samples", [])
    if not samples:
        logger.warning("No samples found in %s", jp)
        return []

    search_dir = Path(audio_dir).resolve() if audio_dir else jp.parent
    converted: List[Tuple[str, Path]] = []

    for sample in samples:
        fname = sample.get("filename", "")
        if not fname and sample.get("audio_path"):
            fname = Path(sample["audio_path"]).name
        if not fname:
            continue

        audio_path = search_dir / fname
        if not audio_path.is_file():
            logger.warning("Audio file not found for sample '%s' in %s", fname, search_dir)
            continue

        txt_path = audio_path.with_suffix(".txt")
        if txt_path.is_file() and not overwrite:
            logger.info("Skipping %s (TXT sidecar already exists)", fname)
            continue

        sidecar_data = _map_sample_to_sidecar(sample)
        if not sidecar_data:
            continue

        write_sidecar(txt_path, sidecar_data)
        converted.append((fname, txt_path))
        logger.info("Converted sample '%s' -> %s", fname, txt_path.name)

    return converted


def detect_json_sidecars(directory: str) -> List[Path]:
    """Find per-file ``.json`` sidecar files alongside audio files.

    Useful for showing a warning during preprocessing that JSON sidecars
    are not natively supported and should be converted.
    """
    base = Path(directory).resolve()
    found: List[Path] = []

    audio_files = sorted(
        f for f in base.rglob("*")
        if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS
    )

    for af in audio_files:
        json_path = af.with_suffix(".json")
        if json_path.is_file() and json_path.name != "dataset.json":
            found.append(json_path)

    return found
