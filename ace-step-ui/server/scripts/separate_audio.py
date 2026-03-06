#!/usr/bin/env python3
"""Separate audio into stems using Demucs or UVR (MDX-Net / VR-Net).

Backends:
  - demucs: htdemucs_ft model. Always produces 4 stems (drums, bass, other, vocals).
            Returns vocals + instrumental (mixed drums+bass+other) by default,
            or all 4 individual stems with --stems 4.
  - uvr:    Uses audio-separator (MDX-Net / VR-Net models).
            Default model: UVR-MDX-NET-Inst_HQ_3 (high quality vocal/inst).
            Supports 2-stem separation. For multi-stem, runs multiple passes.

Output is JSON with paths to the separated files.
"""
import argparse
import json
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")

MODELO_DEMUCS = "htdemucs_ft"

# Curated UVR model presets — model_name must match audio-separator's model registry
UVR_MODELS = {
    "UVR-MDX-NET-Inst_HQ_3": {"description": "MDX-Net Inst HQ 3 — best overall vocal/inst", "stems": 2},
    "UVR-MDX-NET-Voc_FT":    {"description": "MDX-Net Vocal FT — vocal-focused", "stems": 2},
    "UVR_MDXNET_KARA_2":     {"description": "MDX-Net Karaoke 2 — karaoke-grade", "stems": 2},
    "Kim_Vocal_2":            {"description": "Kim Vocal 2 — popular vocal extraction", "stems": 2},
    "UVR-MDX-NET-Inst_3":    {"description": "MDX-Net Inst 3 — clean instrumental", "stems": 2},
}
DEFAULT_UVR_MODEL = "UVR-MDX-NET-Inst_HQ_3"


def get_device():
    import torch
    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# ---------------------------------------------------------------------------
#  DEMUCS BACKEND
# ---------------------------------------------------------------------------
def separate_demucs(audio_path, output_dir, quality="alta", stems=2, device=None):
    """Separate audio using Demucs htdemucs_ft.

    Args:
        audio_path: Path to the input audio file
        output_dir: Directory to save separated stems
        quality: 'rapida' (shifts=1), 'alta' (shifts=5), 'maxima' (shifts=10)
        stems: 2 = vocals + instrumental | 4 = drums, bass, other, vocals
        device: Device to use (cuda/cpu/mps). Auto-detected if None.

    Returns:
        dict with paths to separated files and metadata
    """
    import torch
    import torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from pathlib import Path

    CALIDAD = {
        "rapida": {"shifts": 1, "overlap": 0.25},
        "alta":   {"shifts": 5, "overlap": 0.25},
        "maxima": {"shifts": 10, "overlap": 0.5},
    }

    if device is None:
        device = get_device()

    cal = CALIDAD.get(quality, CALIDAD["alta"])

    audio_path = Path(audio_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    base_name = audio_path.stem

    # Load Demucs model
    print(f"[separate] Loading Demucs {MODELO_DEMUCS}...", flush=True)
    model = get_model(MODELO_DEMUCS)
    model.to(device)
    model.eval()

    # Load audio
    print(f"[separate] Loading audio: {audio_path}", flush=True)
    wav, sr = torchaudio.load(str(audio_path))
    duration_sec = wav.shape[1] / sr
    print(f"[separate] Duration: {duration_sec:.1f}s, {sr}Hz, {wav.shape[0]}ch", flush=True)

    # Resample to 44100 Hz (required by Demucs)
    if sr != 44100:
        wav = torchaudio.functional.resample(wav, sr, 44100)
        sr = 44100

    # Ensure stereo
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    if wav.shape[0] > 2:
        wav = wav[:2]

    # Separate stems
    print(f"[separate] Processing with {cal['shifts']} shifts...", flush=True)
    wav_gpu = wav.unsqueeze(0).to(device)
    with torch.no_grad():
        sources = apply_model(
            model, wav_gpu,
            device=device,
            shifts=cal["shifts"],
            overlap=cal["overlap"],
            progress=True,
        )
    # sources shape: [1, 4, 2, samples]
    # Order: drums(0), bass(1), other(2), vocals(3)

    result_stems = {}

    # Always save vocals
    vocals = sources[0, 3].cpu()
    vocals_path = output_dir / f"{base_name}_vocals.wav"
    torchaudio.save(str(vocals_path), vocals, sr, bits_per_sample=32)
    result_stems["vocals"] = str(vocals_path)
    print(f"[separate] Saved vocals: {vocals_path}", flush=True)

    if stems >= 4:
        # Save individual stems
        stem_names = ["drums", "bass", "other"]
        for idx, name in enumerate(stem_names):
            stem = sources[0, idx].cpu()
            stem_path = output_dir / f"{base_name}_{name}.wav"
            torchaudio.save(str(stem_path), stem, sr, bits_per_sample=32)
            result_stems[name] = str(stem_path)
            print(f"[separate] Saved {name}: {stem_path}", flush=True)
    else:
        # Mix drums + bass + other into instrumental
        instrumental = sources[0, 0].cpu() + sources[0, 1].cpu() + sources[0, 2].cpu()
        instrumental_path = output_dir / f"{base_name}_instrumental.wav"
        torchaudio.save(str(instrumental_path), instrumental, sr, bits_per_sample=32)
        result_stems["instrumental"] = str(instrumental_path)
        print(f"[separate] Saved instrumental: {instrumental_path}", flush=True)

    # Cleanup GPU memory
    del sources, wav_gpu, vocals, model
    torch.cuda.empty_cache()

    return {
        "success": True,
        "backend": "demucs",
        "stems": result_stems,
        "stem_count": len(result_stems),
        "duration": round(duration_sec, 2),
        "sample_rate": sr,
        "base_name": base_name,
    }


# ---------------------------------------------------------------------------
#  UVR / MDX-NET BACKEND
# ---------------------------------------------------------------------------
def separate_uvr(audio_path, output_dir, model_name=None, stems=2, device=None):
    """Separate audio using UVR / MDX-Net via audio-separator.

    Args:
        audio_path: Path to the input audio file
        output_dir: Directory to save separated stems
        model_name: UVR model name (default: UVR-MDX-NET-Inst_HQ_3)
        stems: Number of stems (2 = vocal/inst, 4 = multi-pass for drums/bass/other/vocals)
        device: Device to use. Auto-detected if None.

    Returns:
        dict with paths to separated files and metadata
    """
    from audio_separator.separator import Separator
    from pathlib import Path
    import torchaudio

    if model_name is None:
        model_name = DEFAULT_UVR_MODEL

    audio_path = Path(audio_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    base_name = audio_path.stem

    # Get duration
    wav, sr = torchaudio.load(str(audio_path))
    duration_sec = wav.shape[1] / sr
    del wav

    print(f"[separate] Loading UVR model: {model_name}...", flush=True)
    print(f"[separate] Duration: {duration_sec:.1f}s", flush=True)

    # Configure separator
    separator = Separator(
        output_dir=str(output_dir),
        output_format="WAV",
        output_bitrate=None,
        normalization_threshold=0.9,
        amplification_threshold=0.6,
        mdx_params={
            "hop_length": 1024,
            "segment_size": 256,
            "overlap": 0.25,
            "batch_size": 1,
            "enable_denoise": True,
        },
    )

    separator.load_model(model_filename=model_name)

    result_stems = {}

    if stems <= 2:
        # Simple 2-stem separation
        print(f"[separate] Separating with {model_name}...", flush=True)
        output_files = separator.separate(str(audio_path))

        # audio-separator returns list of output file paths
        # Typically [instrumental_path, vocal_path] or [primary, secondary]
        for out_file in output_files:
            out_path = Path(out_file)
            name_lower = out_path.stem.lower()
            if "vocal" in name_lower or "primary" in name_lower:
                # Rename to our convention
                final_path = output_dir / f"{base_name}_vocals.wav"
                out_path.rename(final_path)
                result_stems["vocals"] = str(final_path)
                print(f"[separate] Saved vocals: {final_path}", flush=True)
            elif "instrument" in name_lower or "no_vocal" in name_lower or "secondary" in name_lower:
                final_path = output_dir / f"{base_name}_instrumental.wav"
                out_path.rename(final_path)
                result_stems["instrumental"] = str(final_path)
                print(f"[separate] Saved instrumental: {final_path}", flush=True)
            else:
                # Unknown output — keep with descriptive name
                final_path = output_dir / f"{base_name}_{out_path.stem}.wav"
                if out_path != final_path:
                    out_path.rename(final_path)
                result_stems[out_path.stem] = str(final_path)
                print(f"[separate] Saved {out_path.stem}: {final_path}", flush=True)

    else:
        # Multi-stem via multiple passes (Demucs is better for this, but we support it)
        # Pass 1: Extract vocals vs instrumental
        print(f"[separate] Pass 1: Extracting vocals...", flush=True)
        output_files = separator.separate(str(audio_path))

        vocals_path = None
        instrumental_path = None

        for out_file in output_files:
            out_path = Path(out_file)
            name_lower = out_path.stem.lower()
            if "vocal" in name_lower or "primary" in name_lower:
                vocals_path = output_dir / f"{base_name}_vocals.wav"
                out_path.rename(vocals_path)
                result_stems["vocals"] = str(vocals_path)
            else:
                instrumental_path = output_dir / f"{base_name}_instrumental.wav"
                out_path.rename(instrumental_path)
                result_stems["instrumental"] = str(instrumental_path)

        # Pass 2: If we have instrumental and want 4 stems, try to extract drums/bass
        if instrumental_path and stems >= 4:
            print(f"[separate] Pass 2: Extracting drums from instrumental...", flush=True)
            # Use Demucs for fine-grained splitting of the instrumental
            try:
                import torch
                from demucs.pretrained import get_model
                from demucs.apply import apply_model

                dev = device if device else get_device()
                model = get_model(MODELO_DEMUCS)
                model.to(dev)
                model.eval()

                inst_wav, inst_sr = torchaudio.load(str(instrumental_path))
                if inst_sr != 44100:
                    inst_wav = torchaudio.functional.resample(inst_wav, inst_sr, 44100)
                    inst_sr = 44100
                if inst_wav.shape[0] == 1:
                    inst_wav = inst_wav.repeat(2, 1)
                if inst_wav.shape[0] > 2:
                    inst_wav = inst_wav[:2]

                wav_gpu = inst_wav.unsqueeze(0).to(dev)
                with torch.no_grad():
                    sources = apply_model(model, wav_gpu, device=dev, shifts=5, overlap=0.25, progress=True)

                for idx, name in enumerate(["drums", "bass", "other"]):
                    stem = sources[0, idx].cpu()
                    stem_path = output_dir / f"{base_name}_{name}.wav"
                    torchaudio.save(str(stem_path), stem, inst_sr, bits_per_sample=32)
                    result_stems[name] = str(stem_path)
                    print(f"[separate] Saved {name}: {stem_path}", flush=True)

                del sources, wav_gpu, model
                torch.cuda.empty_cache()
            except Exception as e:
                print(f"[separate] Warning: multi-stem pass 2 failed: {e}", flush=True)

    # Cleanup
    del separator

    return {
        "success": True,
        "backend": "uvr",
        "model": model_name,
        "stems": result_stems,
        "stem_count": len(result_stems),
        "duration": round(duration_sec, 2),
        "base_name": base_name,
    }


# ---------------------------------------------------------------------------
#  LIST AVAILABLE MODELS
# ---------------------------------------------------------------------------
def list_models():
    """Return available UVR model presets."""
    models = []
    for name, info in UVR_MODELS.items():
        models.append({"name": name, "description": info["description"], "stems": info["stems"]})
    return models


# ---------------------------------------------------------------------------
#  MAIN
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Separate audio into stems using Demucs or UVR (MDX-Net)")
    parser.add_argument("--audio", type=str, help="Path to input audio file")
    parser.add_argument("--output", type=str, help="Output directory for separated stems")
    parser.add_argument("--backend", type=str, default="demucs", choices=["demucs", "uvr"],
                        help="Separation backend: demucs or uvr (MDX-Net)")
    parser.add_argument("--quality", type=str, default="alta", choices=["rapida", "alta", "maxima"],
                        help="Demucs quality: rapida(shifts=1), alta(shifts=5), maxima(shifts=10)")
    parser.add_argument("--model", type=str, default=None,
                        help="UVR model name (default: UVR-MDX-NET-Inst_HQ_3)")
    parser.add_argument("--stems", type=int, default=2, choices=[2, 4],
                        help="Number of stems: 2 (vocal+inst) or 4 (drums+bass+other+vocals)")
    parser.add_argument("--device", type=str, default=None,
                        help="Device (cuda/cpu/mps). Auto-detected if omitted.")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--list-models", action="store_true", help="List available UVR models and exit")

    args = parser.parse_args()

    # List models mode
    if args.list_models:
        models = list_models()
        if args.json:
            print(json.dumps({"models": models}))
        else:
            print("Available UVR models:")
            for m in models:
                print(f"  {m['name']}: {m['description']} ({m['stems']} stems)")
        return

    # Validate required args for separation
    if not args.audio:
        print(json.dumps({"success": False, "error": "--audio is required"}) if args.json else "Error: --audio is required")
        sys.exit(1)
    if not args.output:
        print(json.dumps({"success": False, "error": "--output is required"}) if args.json else "Error: --output is required")
        sys.exit(1)

    if not os.path.exists(args.audio):
        error = {"success": False, "error": f"Audio file not found: {args.audio}"}
        if args.json:
            print(json.dumps(error))
        else:
            print(f"Error: {error['error']}")
        sys.exit(1)

    try:
        start_time = time.time()

        if args.backend == "uvr":
            result = separate_uvr(
                audio_path=args.audio,
                output_dir=args.output,
                model_name=args.model,
                stems=args.stems,
                device=args.device,
            )
        else:
            result = separate_demucs(
                audio_path=args.audio,
                output_dir=args.output,
                quality=args.quality,
                stems=args.stems,
                device=args.device,
            )

        elapsed = time.time() - start_time
        result["elapsed_seconds"] = round(elapsed, 2)

        if args.json:
            print(json.dumps(result))
        else:
            if result["success"]:
                print(f"\nSeparation complete in {elapsed:.1f}s ({result['backend']})")
                for stem_name, stem_path in result["stems"].items():
                    print(f"  {stem_name}: {stem_path}")
            else:
                print(f"Error: {result.get('error', 'Unknown error')}")

    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        if args.json:
            print(json.dumps(error_result))
        else:
            print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
