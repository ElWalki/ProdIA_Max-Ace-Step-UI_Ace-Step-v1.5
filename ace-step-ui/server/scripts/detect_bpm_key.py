#!/usr/bin/env python3
"""BPM and musical key detection for individual audio files.

Uses librosa for BPM detection (3 methods with weighted average) and
Krumhansl-Schmuckler algorithm with Chroma CQT for key detection.

Usage:
  python detect_bpm_key.py --audio path/to/song.wav --json
  python detect_bpm_key.py --audio path/to/song.wav --normalize-bpm --json

Output: JSON with bpm, key, mode, confidence.
"""
import argparse
import json
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")

import numpy as np
import librosa


# ─── Krumhansl-Schmuckler key profiles ──────────────────────────────────
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                           2.52, 5.19, 2.39, 3.66, 2.29, 2.88])

MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                           2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F',
             'F#', 'G', 'G#', 'A', 'A#', 'B']

# ACE-Step compatible key format (e.g., "C major", "A minor")
KEY_ACE_MAP = {
    'Major': 'major',
    'Minor': 'minor',
}


def detect_key(y, sr):
    """Detect musical key using Chroma CQT + Krumhansl-Schmuckler.

    Returns: (key_name, mode, confidence)
    """
    chromagram = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12, bins_per_octave=36)
    chroma_vals = np.mean(chromagram, axis=1)
    chroma_vals = chroma_vals - np.mean(chroma_vals)

    best_corr = -2
    best_key = 0
    best_mode = 'Major'

    for i in range(12):
        major_rotated = np.roll(MAJOR_PROFILE, i)
        minor_rotated = np.roll(MINOR_PROFILE, i)

        major_norm = major_rotated - np.mean(major_rotated)
        minor_norm = minor_rotated - np.mean(minor_rotated)

        corr_major = np.corrcoef(chroma_vals, major_norm)[0, 1]
        corr_minor = np.corrcoef(chroma_vals, minor_norm)[0, 1]

        if corr_major > best_corr:
            best_corr = corr_major
            best_key = i
            best_mode = 'Major'

        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = i
            best_mode = 'Minor'

    return KEY_NAMES[best_key], best_mode, max(0, best_corr)


def detect_bpm(y, sr, normalize=True):
    """Detect BPM using 3 methods with weighted averaging.

    Args:
        y: Audio time series
        sr: Sample rate
        normalize: If True, normalize BPM to 50-150 range (halve/double)

    Returns: (bpm_rounded, bpm_exact)
    """
    # Method 1: beat_track
    tempo1, _ = librosa.beat.beat_track(y=y, sr=sr)
    if isinstance(tempo1, np.ndarray):
        tempo1 = float(tempo1[0])

    # Method 2: onset strength tempogram
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo2 = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
    if isinstance(tempo2, np.ndarray) and len(tempo2) > 0:
        tempo2 = float(np.median(tempo2))
    else:
        tempo2 = tempo1

    # Method 3: with prior=None (unbiased)
    tempo3 = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, prior=None)
    if isinstance(tempo3, np.ndarray):
        tempo3 = float(tempo3[0])

    # Weighted average: bias toward unbiased method
    bpm_exact = tempo1 * 0.25 + tempo2 * 0.25 + tempo3 * 0.50

    # Octave normalization: bring BPM into the 50-150 range
    if normalize:
        while bpm_exact > 150:
            bpm_exact /= 2
        while bpm_exact < 50:
            bpm_exact *= 2

    return round(bpm_exact, 1), bpm_exact


def analyze_file(audio_path: str, normalize_bpm: bool = True) -> dict:
    """Analyze a single audio file for BPM and key.

    Args:
        audio_path: Path to audio file
        normalize_bpm: Whether to normalize BPM to 50-150 range

    Returns:
        dict with bpm, key, mode, confidence, duration, etc.
    """
    print(f"[detect] Loading: {os.path.basename(audio_path)}...", flush=True)
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    print(f"[detect] Duration: {duration:.1f}s, analyzing...", flush=True)

    bpm, bpm_exact = detect_bpm(y, sr, normalize=normalize_bpm)
    key_name, mode, confidence = detect_key(y, sr)

    # ACE-Step compatible format
    key_scale = f"{key_name} {KEY_ACE_MAP.get(mode, mode.lower())}"

    return {
        "success": True,
        "file": os.path.basename(audio_path),
        "bpm": bpm,
        "bpm_exact": round(bpm_exact, 2),
        "key": key_name,
        "mode": mode,
        "key_scale": key_scale,
        "confidence": round(confidence * 100, 1),
        "duration_sec": round(duration, 1),
    }


def analyze_batch(audio_paths: list, normalize_bpm: bool = True) -> list:
    """Analyze multiple audio files.

    Args:
        audio_paths: List of paths to audio files
        normalize_bpm: Whether to normalize BPM

    Returns:
        List of analysis results
    """
    results = []
    for i, path in enumerate(audio_paths):
        print(f"[detect] [{i+1}/{len(audio_paths)}] {os.path.basename(path)}", flush=True)
        try:
            result = analyze_file(path, normalize_bpm)
            results.append(result)
        except Exception as e:
            results.append({
                "success": False,
                "file": os.path.basename(path),
                "error": str(e),
            })
    return results


def main():
    parser = argparse.ArgumentParser(description="Detect BPM and musical key from audio files")
    parser.add_argument("--audio", type=str, required=True,
                        help="Path to audio file, or comma-separated paths for batch mode")
    parser.add_argument("--normalize-bpm", action="store_true", default=True,
                        help="Normalize BPM to 50-150 range (default: True)")
    parser.add_argument("--no-normalize-bpm", action="store_true",
                        help="Disable BPM normalization")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    normalize = not args.no_normalize_bpm

    # Support comma-separated paths for batch mode
    paths = [p.strip() for p in args.audio.split(",") if p.strip()]

    # Validate paths
    for p in paths:
        if not os.path.exists(p):
            error = {"success": False, "error": f"File not found: {p}"}
            if args.json:
                print(json.dumps(error))
            else:
                print(f"Error: {error['error']}")
            sys.exit(1)

    try:
        start_time = time.time()

        if len(paths) == 1:
            result = analyze_file(paths[0], normalize)
            elapsed = time.time() - start_time
            result["elapsed_seconds"] = round(elapsed, 2)

            if args.json:
                print(json.dumps(result, ensure_ascii=False))
            else:
                if result["success"]:
                    print(f"\n  BPM: {result['bpm']} (exact: {result['bpm_exact']})")
                    print(f"  Key: {result['key_scale']} (confidence: {result['confidence']}%)")
                    print(f"  Duration: {result['duration_sec']}s")
                    print(f"  Elapsed: {elapsed:.1f}s")
        else:
            results = analyze_batch(paths, normalize)
            elapsed = time.time() - start_time

            output = {
                "success": True,
                "results": results,
                "total": len(results),
                "elapsed_seconds": round(elapsed, 2),
            }

            if args.json:
                print(json.dumps(output, ensure_ascii=False))
            else:
                for r in results:
                    if r["success"]:
                        print(f"  {r['file']}: BPM={r['bpm']} Key={r['key_scale']} ({r['confidence']}%)")
                    else:
                        print(f"  {r['file']}: ERROR - {r.get('error', 'Unknown')}")

    except Exception as e:
        error = {"success": False, "error": str(e)}
        if args.json:
            print(json.dumps(error))
        else:
            print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
