#!/usr/bin/env python3
"""Enhanced Whisper transcription with anti-hallucination and structure detection.

Features beyond basic whisper.transcribe():
  - VAD-based filtering (silero-vad or energy-based)
  - Hallucination detection and removal
  - initial_prompt to bias language and avoid confusion (e.g., Spanish vs Portuguese)
  - Optional automatic song structure detection ([Verse], [Chorus], etc.)
  - Repetition filtering
  - Support for both openai-whisper and faster-whisper backends

Usage:
  python whisper_transcribe.py --audio path/to/audio.wav --model large-v3 --json
  python whisper_transcribe.py --audio path/to/audio.wav --model base --structure --json
"""
import argparse
import json
import os
import re
import sys
import time
import warnings

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
#  HALLUCINATION PATTERNS
# ---------------------------------------------------------------------------
HALLUCINATION_PATTERNS = [
    # YouTube / social media artifacts
    r"(?i)suscr[ií]b",
    r"(?i)subscribe",
    r"(?i)like\s*(and|y)\s*(share|compart)",
    r"(?i)dale\s*like",
    r"(?i)activa\s*la\s*campan",
    r"(?i)hit\s*the\s*bell",
    r"(?i)notification",
    r"(?i)comment\s*(below|abajo)",
    r"(?i)follow\s*(me|us)\s*(on|en)",
    r"(?i)s[ií]gueme",
    r"(?i)canal\s*de\s*youtube",
    # Common Whisper hallucinations
    r"(?i)^thanks?\s*(for|por)\s*(watching|ver)",
    r"(?i)^gracias\s*por\s*(ver|escuchar)",
    r"(?i)^subtitles?\s*by",
    r"(?i)^subt[ií]tulos?\s*(por|by|de)",
    r"(?i)^translated\s*by",
    r"(?i)^traducido\s*por",
    r"(?i)^transcribed\s*by",
    r"(?i)^copyright",
    r"(?i)^\[m[uú]sica\]$",
    r"(?i)^\[music\]$",
    r"(?i)^\[aplausos\]$",
    r"(?i)^\[applause\]$",
    r"(?i)^\.{2,}$",
    # Whisper repetition artifacts
    r"(?i)^(la ){5,}",
    r"(?i)^(na ){5,}",
    r"(?i)^(oh ){5,}",
    r"(?i)^(ah ){5,}",
]

# Language-specific initial prompts to reduce hallucination
INITIAL_PROMPTS = {
    "es": "Letra de canción en español. Transcripción de letra musical.",
    "en": "Song lyrics in English. Music lyrics transcription.",
    "pt": "Letra de música em português. Transcrição de letra musical.",
    "fr": "Paroles de chanson en français. Transcription de paroles.",
    "de": "Liedtext auf Deutsch. Transkription von Liedtexten.",
    "ja": "日本語の歌詞。歌詞の書き起こし。",
    "ko": "한국어 가사. 가사 전사.",
    "zh": "中文歌词。歌词转录。",
    "auto": "Song lyrics transcription. Transcripción de letras.",
}


def is_hallucination(text: str) -> bool:
    """Check if a text segment matches known hallucination patterns."""
    text = text.strip()
    if not text:
        return True
    for pattern in HALLUCINATION_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def is_repetition(text: str, prev_lines: list, threshold: int = 3) -> bool:
    """Check if a line is excessively repeated."""
    if not prev_lines:
        return False
    clean = text.strip().lower()
    count = sum(1 for p in prev_lines[-threshold * 2:] if p.strip().lower() == clean)
    return count >= threshold


def detect_structure(segments: list, min_gap_sec: float = 2.0) -> list:
    """Detect song structure (Verse/Chorus/Bridge) from whisper segments.

    Uses text similarity between sections and silence gaps to identify
    repeated choruses, verses, and transitional sections.

    Args:
        segments: List of whisper segments with 'start', 'end', 'text'
        min_gap_sec: Minimum silence gap to consider a section break

    Returns:
        List of dicts with 'tag' and 'lines'
    """
    if not segments:
        return []

    # Group segments into sections by silence gaps
    sections = []
    current_section = {"lines": [], "start": 0, "end": 0}

    for i, seg in enumerate(segments):
        if i == 0:
            current_section["start"] = seg.get("start", 0)

        gap = seg.get("start", 0) - current_section.get("end", 0) if current_section["lines"] else 0

        if gap > min_gap_sec and current_section["lines"]:
            sections.append(current_section)
            current_section = {"lines": [], "start": seg.get("start", 0), "end": 0}

        current_section["lines"].append(seg.get("text", "").strip())
        current_section["end"] = seg.get("end", 0)

    if current_section["lines"]:
        sections.append(current_section)

    if not sections:
        return []

    # Simple structure assignment based on section similarity and position
    # Short intro/outro, repeated sections = chorus, unique = verse
    section_texts = [" ".join(s["lines"]).lower().strip() for s in sections]

    # Count how many times each section text appears (approximate match)
    def text_similarity(a: str, b: str) -> float:
        words_a = set(a.split())
        words_b = set(b.split())
        if not words_a or not words_b:
            return 0
        intersection = words_a & words_b
        union = words_a | words_b
        return len(intersection) / len(union) if union else 0

    # Find repeated sections (likely choruses)
    repeat_counts = [0] * len(sections)
    for i in range(len(sections)):
        for j in range(i + 1, len(sections)):
            sim = text_similarity(section_texts[i], section_texts[j])
            if sim > 0.5:
                repeat_counts[i] += 1
                repeat_counts[j] += 1

    # Assign tags
    result = []
    verse_num = 1
    chorus_seen = False

    for i, sec in enumerate(sections):
        text = " ".join(sec["lines"])
        word_count = len(text.split())

        # Short section at start → Intro
        if i == 0 and word_count < 15:
            tag = "[Intro]"
        # Short section at end → Outro
        elif i == len(sections) - 1 and word_count < 15:
            tag = "[Outro]"
        # Repeated section → Chorus
        elif repeat_counts[i] > 0:
            tag = "[Chorus]"
            chorus_seen = True
        # Short section between others → Pre-Chorus or Bridge
        elif word_count < 20 and chorus_seen:
            tag = "[Bridge]"
        elif word_count < 20 and not chorus_seen:
            tag = "[Pre-Chorus]"
        else:
            tag = f"[Verse {verse_num}]"
            verse_num += 1

        result.append({"tag": tag, "lines": sec["lines"]})

    return result


# ---------------------------------------------------------------------------
#  TRANSCRIPTION BACKENDS
# ---------------------------------------------------------------------------
def transcribe_openai_whisper(audio_path: str, model_name: str = "base",
                              language: str = None, initial_prompt: str = None) -> dict:
    """Transcribe using openai-whisper library."""
    import whisper

    print(f"[whisper] Loading model: {model_name}...", flush=True)
    model = whisper.load_model(model_name)

    opts = {
        "fp16": False,
        "verbose": False,
    }
    if language and language != "auto":
        opts["language"] = language
    if initial_prompt:
        opts["initial_prompt"] = initial_prompt

    # Disable condition_on_previous_text to prevent hallucination cascading
    opts["condition_on_previous_text"] = False

    print(f"[whisper] Transcribing: {os.path.basename(audio_path)}...", flush=True)
    result = model.transcribe(audio_path, **opts)

    return {
        "text": result.get("text", "").strip(),
        "segments": result.get("segments", []),
        "language": result.get("language", language or "auto"),
    }


def transcribe_faster_whisper(audio_path: str, model_name: str = "base",
                               language: str = None, initial_prompt: str = None) -> dict:
    """Transcribe using faster-whisper (CTranslate2 backend, ~4x faster)."""
    from faster_whisper import WhisperModel

    # Use int8 for CPU, float16 for CUDA
    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute = "float16" if device == "cuda" else "int8"
    except ImportError:
        device = "cpu"
        compute = "int8"

    print(f"[whisper] Loading faster-whisper model: {model_name} ({device})...", flush=True)
    model = WhisperModel(model_name, device=device, compute_type=compute)

    opts = {
        "beam_size": 5,
        "best_of": 3,
        "patience": 1.5,
        "condition_on_previous_text": False,
        "vad_filter": True,
        "vad_parameters": {
            "min_silence_duration_ms": 500,
            "speech_pad_ms": 200,
        },
    }
    if language and language != "auto":
        opts["language"] = language
    if initial_prompt:
        opts["initial_prompt"] = initial_prompt

    print(f"[whisper] Transcribing: {os.path.basename(audio_path)}...", flush=True)
    segments_iter, info = model.transcribe(audio_path, **opts)

    segments = []
    full_text = []
    for seg in segments_iter:
        segments.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
        })
        full_text.append(seg.text.strip())

    return {
        "text": " ".join(full_text),
        "segments": segments,
        "language": info.language if hasattr(info, "language") else (language or "auto"),
    }


# ---------------------------------------------------------------------------
#  MAIN TRANSCRIPTION PIPELINE
# ---------------------------------------------------------------------------
def transcribe(audio_path: str, model_name: str = "base", language: str = None,
               structure: bool = False, backend: str = "auto") -> dict:
    """Full transcription pipeline with anti-hallucination and optional structure.

    Args:
        audio_path: Path to audio file
        model_name: Whisper model size
        language: Language code or 'auto'
        structure: Whether to detect song structure tags
        backend: 'openai', 'faster', or 'auto' (tries faster first)

    Returns:
        dict with 'text', 'structured_text', 'language', 'segments', 'duration'
    """
    start_time = time.time()

    # Build initial prompt
    lang_key = language if language and language != "auto" else "auto"
    initial_prompt = INITIAL_PROMPTS.get(lang_key, INITIAL_PROMPTS["auto"])

    # Choose backend
    result = None
    used_backend = "unknown"

    if backend == "auto":
        # Try faster-whisper first (faster + better VAD)
        try:
            result = transcribe_faster_whisper(audio_path, model_name, language, initial_prompt)
            used_backend = "faster-whisper"
        except (ImportError, Exception) as e:
            print(f"[whisper] faster-whisper not available ({e}), falling back to openai-whisper", flush=True)
            result = transcribe_openai_whisper(audio_path, model_name, language, initial_prompt)
            used_backend = "openai-whisper"
    elif backend == "faster":
        result = transcribe_faster_whisper(audio_path, model_name, language, initial_prompt)
        used_backend = "faster-whisper"
    else:
        result = transcribe_openai_whisper(audio_path, model_name, language, initial_prompt)
        used_backend = "openai-whisper"

    # Post-process: filter hallucinations and repetitions
    segments = result.get("segments", [])
    clean_lines = []
    prev_lines = []

    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        if is_hallucination(text):
            print(f"[whisper] Filtered hallucination: '{text[:60]}'", flush=True)
            continue
        if is_repetition(text, prev_lines, threshold=3):
            print(f"[whisper] Filtered repetition: '{text[:60]}'", flush=True)
            continue
        clean_lines.append(text)
        prev_lines.append(text)

    clean_text = "\n".join(clean_lines)

    # Structure detection
    structured_text = None
    if structure and segments:
        # Filter hallucinated segments before structure detection
        clean_segments = [s for s in segments if not is_hallucination(s.get("text", ""))]
        structure_result = detect_structure(clean_segments)
        if structure_result:
            parts = []
            for section in structure_result:
                parts.append(section["tag"])
                parts.extend(section["lines"])
                parts.append("")  # blank line between sections
            structured_text = "\n".join(parts).strip()

    elapsed = time.time() - start_time

    return {
        "success": True,
        "text": clean_text,
        "structured_text": structured_text,
        "language": result.get("language", language or "auto"),
        "segment_count": len(clean_lines),
        "filtered_count": len(segments) - len(clean_lines),
        "backend": used_backend,
        "model": model_name,
        "elapsed_seconds": round(elapsed, 2),
    }


# ---------------------------------------------------------------------------
#  CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Enhanced Whisper transcription with anti-hallucination")
    parser.add_argument("--audio", type=str, required=True, help="Path to audio file")
    parser.add_argument("--model", type=str, default="base",
                        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3", "turbo"],
                        help="Whisper model size")
    parser.add_argument("--language", type=str, default=None,
                        help="Language code (e.g., 'es', 'en') or omit for auto-detect")
    parser.add_argument("--structure", action="store_true",
                        help="Detect song structure ([Verse], [Chorus], etc.)")
    parser.add_argument("--backend", type=str, default="auto", choices=["auto", "openai", "faster"],
                        help="Whisper backend: auto, openai, or faster (faster-whisper)")
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
        result = transcribe(
            audio_path=args.audio,
            model_name=args.model,
            language=args.language,
            structure=args.structure,
            backend=args.backend,
        )

        if args.json:
            print(json.dumps(result, ensure_ascii=False))
        else:
            if result["success"]:
                print(f"\nTranscription ({result['backend']}, {result['model']}) — {result['elapsed_seconds']}s")
                print(f"Language: {result['language']} | Segments: {result['segment_count']} | Filtered: {result['filtered_count']}")
                print("─" * 60)
                if result.get("structured_text"):
                    print(result["structured_text"])
                else:
                    print(result["text"])
            else:
                print(f"Error: {result.get('error', 'Unknown')}")

    except Exception as e:
        error = {"success": False, "error": str(e)}
        if args.json:
            print(json.dumps(error))
        else:
            print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
