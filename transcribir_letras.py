#!/usr/bin/env python3
"""
=============================================================================
  TRANSCRIPTOR PROFESIONAL DE LETRAS
  Demucs htdemucs_ft (máxima calidad) + Whisper large-v3
=============================================================================

  Por cada canción:
    1. Demucs htdemucs_ft separa stems con shifts=10 (máxima calidad)
    2. Guarda acapella como: stems/{nombre}_acapella.wav
    3. Guarda otros stems en: stems/{nombre}/drums.wav, bass.wav, other.wav
    4. Whisper large-v3 transcribe la acapella limpia
    5. Guarda letra como:    letras/{nombre}.txt

  Estructura final:
    stems/
      MALA SANTA_acapella.wav          ← vocals de máxima calidad
      MALA SANTA/
        drums.wav
        bass.wav
        other.wav
    letras/
      MALA SANTA.txt                   ← letra transcrita

  Uso:
    python transcribir_letras.py [CARPETA_AUDIO] [CARPETA_SALIDA]
    python transcribir_letras.py --sobreescribir
    python transcribir_letras.py --solo-stems
    python transcribir_letras.py --solo-transcribir
    python transcribir_letras.py --calidad media   (shifts=5, más rápido)
    python transcribir_letras.py --calidad maxima   (shifts=10, default)
=============================================================================
"""

import os
import sys
import time
import argparse
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

MODELO_WHISPER = "large-v3"
MODELO_DEMUCS = "htdemucs_ft"
IDIOMA = "es"
DEVICE = "cuda"
COMPUTE_TYPE = "float16"
EXTENSIONES = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wma", ".opus"}

# Calidad de separación de Demucs
# shifts: número de pasadas con offsets aleatorios (más = mejor pero más lento)
# overlap: solapamiento entre chunks (más = transiciones más suaves)
CALIDAD = {
    "rapida":  {"shifts": 1,  "overlap": 0.25},
    "alta":    {"shifts": 5,  "overlap": 0.5},
    "maxima":  {"shifts": 10, "overlap": 0.75},
}

ALUCINACIONES = {
    "suscríbete", "suscribete", "subscribe", "gracias por ver",
    "thanks for watching", "gracias por escuchar", "like y suscríbete",
    "like and subscribe", "dale like", "activa la campana",
    "comparte el video", "hasta el próximo video", "hasta el proximo video",
    "nos vemos en el próximo", "no olvides suscribirte", "subtítulos",
    "subtitulos realizados", "amara.org", "translated by",
    "copyright", "all rights reserved", "derechos reservados",
}


def es_alucinacion(texto: str) -> bool:
    t = texto.lower().strip()
    if not t or len(t) < 3:
        return True
    if t in ("música", "musica", "aplausos", "risas", "...", "…", "."):
        return True
    for patron in ALUCINACIONES:
        if patron in t:
            return True
    return False


def filtrar_repeticiones(lineas: list) -> list:
    if len(lineas) <= 4:
        return lineas
    ultima = lineas[-1].lower().strip()
    n = 0
    for i in range(len(lineas) - 1, -1, -1):
        if lineas[i].lower().strip() == ultima:
            n += 1
        else:
            break
    if n > 3:
        lineas = lineas[:-(n - 2)]
    return lineas


# ─── Demucs ──────────────────────────────────────────────────────────────────

_demucs_model = None


def cargar_demucs():
    global _demucs_model
    if _demucs_model is None:
        from demucs.pretrained import get_model
        print(f"\n  ⏳ Cargando Demucs ({MODELO_DEMUCS})...", end=" ", flush=True)
        _demucs_model = get_model(MODELO_DEMUCS)
        _demucs_model.to(DEVICE)
        _demucs_model.eval()
        print("✅")
    return _demucs_model


def separar_stems(ruta_audio: Path, carpeta_stems: Path, nombre_base: str,
                  shifts: int, overlap: float) -> Path:
    """
    Separa audio en stems. Guarda:
      - stems/{nombre}_acapella.wav  (vocals, máxima calidad)
      - stems/{nombre}/drums.wav, bass.wav, other.wav
    Retorna ruta a la acapella.
    """
    import torch
    import torchaudio
    from demucs.apply import apply_model

    modelo = cargar_demucs()

    wav, sr = torchaudio.load(str(ruta_audio))
    duracion_seg = wav.shape[1] / sr
    print(f"\n    Archivo: {duracion_seg:.0f}s, {sr}Hz, {wav.shape[0]}ch")

    # Resample a 44100 Hz (requerido por Demucs)
    if sr != 44100:
        wav = torchaudio.functional.resample(wav, sr, 44100)
        sr = 44100

    # Asegurar estéreo
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    if wav.shape[0] > 2:
        wav = wav[:2]

    # Separar stems (con barra de progreso)
    print(f"    Procesando {shifts} pasadas (shifts)...")
    wav_gpu = wav.unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        sources = apply_model(
            modelo, wav_gpu,
            device=DEVICE,
            shifts=shifts,
            overlap=overlap,
            progress=True,
        )
    # sources shape: [1, 4, 2, samples]
    # Orden: drums(0), bass(1), other(2), vocals(3)

    # ── Guardar acapella directamente en stems/ con nombre de la canción ──
    vocals = sources[0, 3].cpu()
    ruta_acapella = carpeta_stems / f"{nombre_base}_acapella.wav"
    torchaudio.save(str(ruta_acapella), vocals, sr,
                    bits_per_sample=32)  # 32-bit float para máxima calidad

    # ── Guardar otros stems en subcarpeta ──
    subcarpeta = carpeta_stems / nombre_base
    subcarpeta.mkdir(parents=True, exist_ok=True)

    nombres_stems = ["drums", "bass", "other"]
    for idx, nombre in enumerate(nombres_stems):
        stem = sources[0, idx].cpu()
        torchaudio.save(str(subcarpeta / f"{nombre}.wav"), stem, sr,
                        bits_per_sample=32)

    del sources, wav_gpu, vocals
    torch.cuda.empty_cache()

    return ruta_acapella


# ─── Whisper ─────────────────────────────────────────────────────────────────

def transcribir_vocals(model, ruta_vocals: Path) -> tuple:
    segments, info = model.transcribe(
        str(ruta_vocals),
        language=IDIOMA,
        beam_size=10,
        best_of=5,
        patience=2.0,
        temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),
        vad_filter=True,
        vad_parameters={
            "threshold": 0.35,
            "min_speech_duration_ms": 100,
            "max_speech_duration_s": 60,
            "min_silence_duration_ms": 250,
            "speech_pad_ms": 200,
        },
        no_speech_threshold=0.6,
        log_prob_threshold=-1.0,
        compression_ratio_threshold=2.4,
        hallucination_silence_threshold=1.0,
        condition_on_previous_text=True,
        word_timestamps=False,
        repetition_penalty=1.1,
    )

    lineas = []
    for seg in segments:
        texto = seg.text.strip()
        if texto and not es_alucinacion(texto):
            lineas.append(texto)

    lineas = filtrar_repeticiones(lineas)
    return "\n".join(lineas), info.duration


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Demucs + Whisper: separa stems y transcribe letras")
    parser.add_argument("carpeta_audio", nargs="?",
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
            "ACE-Step-1.5_", "datasets", "urban_flow", "dataset_IA"))
    parser.add_argument("carpeta_salida", nargs="?",
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "letras"))
    parser.add_argument("--sobreescribir", action="store_true",
        help="Sobreescribir todo")
    parser.add_argument("--solo-stems", action="store_true",
        help="Solo separar stems, no transcribir")
    parser.add_argument("--solo-transcribir", action="store_true",
        help="Solo transcribir vocals existentes en stems/")
    parser.add_argument("--calidad", default="alta",
        choices=["rapida", "alta", "maxima"],
        help="Calidad de separación: rapida(shifts=1), alta(shifts=5, default), maxima(shifts=10)")
    args = parser.parse_args()

    base = Path(os.path.dirname(os.path.abspath(__file__)))
    carpeta = Path(args.carpeta_audio).resolve()
    salida = Path(args.carpeta_salida).resolve()
    carpeta_stems = base / "stems"

    salida.mkdir(parents=True, exist_ok=True)
    carpeta_stems.mkdir(parents=True, exist_ok=True)

    archivos = sorted(f for f in carpeta.iterdir()
                      if f.is_file() and f.suffix.lower() in EXTENSIONES)
    if not archivos:
        print(f"No hay archivos de audio en {carpeta}")
        sys.exit(1)

    cal = CALIDAD[args.calidad]

    print("\n" + "=" * 65)
    print("  🎵 TRANSCRIPTOR PROFESIONAL DE LETRAS")
    print("     Demucs htdemucs_ft + Whisper large-v3")
    print("=" * 65)
    print(f"  Demucs:     {MODELO_DEMUCS}")
    print(f"  Calidad:    {args.calidad} (shifts={cal['shifts']}, overlap={cal['overlap']})")
    print(f"  Whisper:    {MODELO_WHISPER} ({COMPUTE_TYPE})")
    print(f"  Idioma:     {IDIOMA}")
    print(f"  Archivos:   {len(archivos)}")
    print(f"  Audio:      {carpeta}")
    print(f"  Stems:      {carpeta_stems}")
    print(f"  Letras:     {salida}")
    print("=" * 65)

    # Cargar Whisper si vamos a transcribir
    whisper_model = None
    if not args.solo_stems:
        print(f"\n  ⏳ Cargando Whisper {MODELO_WHISPER}...", end=" ", flush=True)
        from faster_whisper import WhisperModel
        whisper_model = WhisperModel(MODELO_WHISPER, device=DEVICE, compute_type=COMPUTE_TYPE)
        print("✅")

    total = len(archivos)
    completados = 0
    instrumentales = 0
    errores = 0

    for i, archivo in enumerate(archivos, 1):
        nombre_base = archivo.stem
        ruta_acapella = carpeta_stems / f"{nombre_base}_acapella.wav"
        txt = salida / f"{nombre_base}.txt"

        # ¿Saltar?
        acapella_existe = ruta_acapella.exists()
        txt_existe = txt.exists()

        if not args.sobreescribir:
            if args.solo_stems and acapella_existe:
                print(f"\n[{i}/{total}] ⏭️  {archivo.name}")
                continue
            if args.solo_transcribir and txt_existe:
                print(f"\n[{i}/{total}] ⏭️  {archivo.name}")
                continue
            if not args.solo_stems and not args.solo_transcribir and txt_existe and acapella_existe:
                print(f"\n[{i}/{total}] ⏭️  {archivo.name}")
                continue

        print(f"\n[{i}/{total}] 🎤 {archivo.name}")
        t_total = time.time()

        try:
            # ─── Paso 1: Separar stems ───────────────────────────
            if not args.solo_transcribir or not acapella_existe:
                print(f"  → Separando stems (calidad: {args.calidad}, shifts={cal['shifts']})...")
                t0 = time.time()
                ruta_acapella = separar_stems(
                    archivo, carpeta_stems, nombre_base,
                    shifts=cal["shifts"], overlap=cal["overlap"]
                )
                print(f"    ✅ Stems separados en {time.time()-t0:.1f}s")
                print(f"    📁 {nombre_base}_acapella.wav (32-bit float)")
                print(f"    📁 {nombre_base}/drums.wav, bass.wav, other.wav")

            # ─── Paso 2: Transcribir acapella ────────────────────
            if not args.solo_stems and whisper_model is not None:
                if not ruta_acapella.exists():
                    print(f"  ⚠️  No existe {ruta_acapella.name}, saltando transcripción")
                    continue

                print(f"  → Transcribiendo acapella...", end=" ", flush=True)
                t0 = time.time()
                letra, dur = transcribir_vocals(whisper_model, ruta_acapella)
                dt = time.time() - t0

                if letra.strip():
                    txt.write_text(letra, encoding="utf-8")
                    n_lineas = len(letra.split('\n'))
                    print(f"({dt:.1f}s) → {n_lineas} líneas")
                    completados += 1
                else:
                    txt.write_text("[Instrumental]", encoding="utf-8")
                    print(f"({dt:.1f}s) → Instrumental")
                    instrumentales += 1

            print(f"  ✅ {time.time()-t_total:.1f}s total")

        except Exception as e:
            print(f"  ❌ Error: {e}")
            errores += 1

    print(f"\n{'=' * 65}")
    print(f"  📊 RESUMEN")
    print(f"{'=' * 65}")
    print(f"  Total:          {total}")
    print(f"  Con letra:      {completados}")
    print(f"  Instrumentales: {instrumentales}")
    print(f"  Errores:        {errores}")
    print(f"  Stems en:       {carpeta_stems}")
    print(f"  Letras en:      {salida}")
    print(f"{'=' * 65}")
    print()
    print("  Estructura generada:")
    print(f"    stems/")
    print(f"      cancion_acapella.wav   ← vocals 32-bit float")
    print(f"      cancion/")
    print(f"        drums.wav")
    print(f"        bass.wav")
    print(f"        other.wav")
    print(f"    letras/")
    print(f"      cancion.txt            ← letra completa")
    print()


if __name__ == "__main__":
    main()
