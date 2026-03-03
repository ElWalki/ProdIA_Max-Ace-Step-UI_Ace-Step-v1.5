#!/usr/bin/env python3
"""Separate audio into vocal and instrumental stems using Demucs.

This script loads Demucs htdemucs_ft and separates an audio file into:
  - vocals (acapella)
  - instrumental (drums + bass + other mixed)
  - optionally individual stems (drums, bass, other)

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
EXTENSIONES = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wma", ".opus"}


def get_device():
    import torch
    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def separate(audio_path, output_dir, quality="alta", device=None):
    """Separate audio into vocals and instrumental.
    
    Args:
        audio_path: Path to the input audio file
        output_dir: Directory to save separated stems
        quality: 'rapida' (shifts=1), 'alta' (shifts=5), 'maxima' (shifts=10)
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
        "alta": {"shifts": 5, "overlap": 0.25},
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

    # Save vocals
    vocals = sources[0, 3].cpu()
    vocals_path = output_dir / f"{base_name}_vocals.wav"
    torchaudio.save(str(vocals_path), vocals, sr, bits_per_sample=32)
    print(f"[separate] Saved vocals: {vocals_path}", flush=True)

    # Create instrumental by mixing drums + bass + other
    instrumental = sources[0, 0].cpu() + sources[0, 1].cpu() + sources[0, 2].cpu()
    instrumental_path = output_dir / f"{base_name}_instrumental.wav"
    torchaudio.save(str(instrumental_path), instrumental, sr, bits_per_sample=32)
    print(f"[separate] Saved instrumental: {instrumental_path}", flush=True)

    # Cleanup GPU memory
    del sources, wav_gpu, vocals, instrumental, model
    torch.cuda.empty_cache()

    return {
        "success": True,
        "vocals_path": str(vocals_path),
        "instrumental_path": str(instrumental_path),
        "duration": round(duration_sec, 2),
        "sample_rate": sr,
        "base_name": base_name,
    }


def main():
    parser = argparse.ArgumentParser(description="Separate audio into vocal and instrumental stems using Demucs")
    parser.add_argument("--audio", type=str, required=True, help="Path to input audio file")
    parser.add_argument("--output", type=str, required=True, help="Output directory for separated stems")
    parser.add_argument("--quality", type=str, default="alta", choices=["rapida", "alta", "maxima"],
                        help="Separation quality: rapida(shifts=1), alta(shifts=5), maxima(shifts=10)")
    parser.add_argument("--device", type=str, default=None, help="Device (cuda/cpu/mps). Auto-detected if omitted.")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if not os.path.exists(args.audio):
        error = {"success": False, "error": f"Audio file not found: {args.audio}"}
        if args.json:
            print(json.dumps(error))
        else:
            print(f"Error: {error['error']}")
        sys.exit(1)

    try:
        start_time = time.time()
        result = separate(
            audio_path=args.audio,
            output_dir=args.output,
            quality=args.quality,
            device=args.device,
        )
        elapsed = time.time() - start_time
        result["elapsed_seconds"] = round(elapsed, 2)

        if args.json:
            print(json.dumps(result))
        else:
            if result["success"]:
                print(f"\nSeparation complete in {elapsed:.1f}s")
                print(f"  Vocals: {result['vocals_path']}")
                print(f"  Instrumental: {result['instrumental_path']}")
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
