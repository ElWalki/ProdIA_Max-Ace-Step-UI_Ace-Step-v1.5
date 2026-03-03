#!/usr/bin/env python3
"""
=============================================================================
  TRANSCRIPTOR DE LETRAS v2 — Optimizado para Reggaeton/Urbano en Español
  Demucs htdemucs_ft + Whisper large-v3 (con initial_prompt anti-alucinación)
=============================================================================

  Mejoras vs v1:
    - initial_prompt fuerza a Whisper a transcribir en español
    - condition_on_previous_text=False evita cascada de alucinaciones
    - Detección de estructura automática (Verse/Chorus/Bridge)
    - Lee el JSON del dataset para saltar instrumentales
    - Mapea archivos numerados → nombres originales
    - Salida en formato ACE-Step listo para LoRA training

  Uso:
    python transcribir_letras_v2.py                           (procesa todo)
    python transcribir_letras_v2.py --solo-transcribir        (usa stems ya separados)
    python transcribir_letras_v2.py --indices 3 4 5 18 21     (solo archivos específicos)
    python transcribir_letras_v2.py --calidad rapida          (shifts=1, rápido para test)
    python transcribir_letras_v2.py --sobreescribir           (reprocesar todo)
    python transcribir_letras_v2.py --skip-comerciales        (solo canciones propias)
=============================================================================
"""

import os
import sys
import json
import time
import argparse
import warnings
from pathlib import Path
from difflib import SequenceMatcher

warnings.filterwarnings("ignore")

# ─── Configuración ───────────────────────────────────────────────────────────

MODELO_WHISPER = "large-v3"
MODELO_DEMUCS = "htdemucs_ft"
IDIOMA = "es"
DEVICE = "cuda"
COMPUTE_TYPE = "float16"
EXTENSIONES = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wma", ".opus"}

# Prompt que fuerza a Whisper a transcribir en español latino
# Esto es CLAVE para evitar que transcriba en portugués u otros idiomas
INITIAL_PROMPT = (
    "Letra de canción de reggaeton y música urbana latina en español. "
    "Incluye perreo, dembow, trap latino, y R&B urbano. "
    "Las letras están en español latinoamericano con jerga urbana."
)

CALIDAD = {
    "rapida": {"shifts": 1, "overlap": 0.25},
    "alta":   {"shifts": 5, "overlap": 0.5},
    "maxima": {"shifts": 10, "overlap": 0.75},
}

# Patrones de alucinación (Whisper repite esto cuando no entiende)
ALUCINACIONES = {
    # YouTube/social media
    "suscríbete", "suscribete", "subscribe", "gracias por ver",
    "thanks for watching", "gracias por escuchar", "like y suscríbete",
    "like and subscribe", "dale like", "activa la campana",
    "comparte el video", "hasta el próximo video", "hasta el proximo video",
    "nos vemos en el próximo", "no olvides suscribirte",
    # Subtítulos
    "subtítulos", "subtitulos realizados", "amara.org", "translated by",
    "copyright", "all rights reserved", "derechos reservados",
    # Alucinaciones comunes de Whisper
    "gracias por su atención", "gracias por su atencion",
    "fin del video", "end of video", "thank you for listening",
    "follow me on", "sígueme en", "sigueme en",
    "music by", "produced by", "beat by",
    # Whisper dice esto en silencios
    "you", "the", "i'm", "oh", "ah",
    # Portugués (Whisper confunde español con portugués)
    "obrigado", "obrigada", "muito obrigado",
}

# Artistas comerciales — estos necesitan letras manuales de Genius/Letras.com
ARTISTAS_COMERCIALES = {
    "becky g", "don omar", "maluma", "rauw alejandro",
    "lyanno", "brray", "pitbull", "lil jon", "noriega",
    "justin quiles", "luny tunes",
}

# ─── Detección de alucinaciones ──────────────────────────────────────────────

def es_alucinacion(texto: str, prob: float = 0.0) -> bool:
    """Detecta si un segmento es alucinación de Whisper."""
    t = texto.lower().strip()

    # Vacío o muy corto
    if not t or len(t) < 3:
        return True

    # Palabras sueltas que no son letras
    if t in ("música", "musica", "aplausos", "risas", "...", "…", ".",
             "eh", "ah", "oh", "uh", "hmm", "mm", "na", "la", "pa"):
        return True

    # Solo puntuación o símbolos
    if all(c in ' .,!?¿¡…-–—()[]{}"\'' for c in t):
        return True

    # Patrones conocidos de alucinación
    for patron in ALUCINACIONES:
        if patron in t:
            return True

    # Probabilidad muy baja = Whisper no está seguro
    if prob < -1.5:
        return True

    return False


def filtrar_repeticiones(lineas: list, max_consecutivas: int = 3) -> list:
    """Elimina repeticiones excesivas al final (síntoma de alucinación)."""
    if len(lineas) <= max_consecutivas:
        return lineas

    # Detectar repeticiones al final
    ultima = lineas[-1].lower().strip()
    n = 0
    for i in range(len(lineas) - 1, -1, -1):
        if lineas[i].lower().strip() == ultima:
            n += 1
        else:
            break

    if n > max_consecutivas:
        lineas = lineas[:-(n - max_consecutivas)]

    # También detectar patrones de 2-3 líneas que se repiten
    if len(lineas) >= 6:
        # Patrón de 2 líneas
        for size in [2, 3]:
            if len(lineas) >= size * 3:
                bloque = tuple(l.lower().strip() for l in lineas[-size:])
                repeticiones = 0
                for i in range(len(lineas) - size, -1, -size):
                    actual = tuple(l.lower().strip() for l in lineas[i:i+size])
                    if actual == bloque:
                        repeticiones += 1
                    else:
                        break
                if repeticiones > 2:
                    # Dejar solo 2 repeticiones del bloque
                    lineas = lineas[:-(repeticiones - 2) * size]

    return lineas


def similitud_texto(a: str, b: str) -> float:
    """
    Calcula similitud entre dos textos (0.0 - 1.0)
    usando Jaccard similarity sobre n-gramas de palabras.
    Más robusto que matching exacto — tolera errores de Whisper.
    """
    def ngrams(texto, n=2):
        palabras = texto.lower().split()
        if len(palabras) < n:
            return set(palabras)
        return set(tuple(palabras[i:i+n]) for i in range(len(palabras) - n + 1))

    set_a = ngrams(a)
    set_b = ngrams(b)

    if not set_a or not set_b:
        return 0.0

    interseccion = set_a & set_b
    union = set_a | set_b
    return len(interseccion) / len(union) if union else 0.0


def detectar_estructura(segmentos_con_tiempo: list) -> str:
    """
    Detecta estructura de la canción con heurísticas inteligentes:

    1. Agrupa segmentos en SECCIONES por gaps de silencio (>1.5s)
    2. Subdivide secciones largas (>8 líneas) en sub-bloques de ~4 líneas
    3. Detecta CORO usando similitud de texto (no matching exacto)
       → El coro es el bloque que aparece 2+ veces con >60% similitud
    4. Detecta PRE-CHORUS: sección corta (2-4 líneas) justo antes de cada coro
    5. Detecta BRIDGE: sección única que aparece después del 2do coro
    6. INTRO/OUTRO: secciones cortas al inicio/final
    7. Todo lo demás = VERSO (numerado)

    Para ACE-Step LoRA training, tags soportados:
    [Intro], [Verse N], [Pre-Chorus], [Chorus], [Bridge], [Outro],
    [Instrumental], [Break]
    """
    if not segmentos_con_tiempo:
        return "[Instrumental]"

    # ══════ Paso 1: Agrupar por gaps de silencio ══════
    secciones = []          # list de (lineas: list[str], t_inicio, t_fin)
    seccion_lineas = []
    seccion_inicio = segmentos_con_tiempo[0][1]
    ultimo_fin = 0.0

    for texto, inicio, fin in segmentos_con_tiempo:
        gap = inicio - ultimo_fin
        # Gap de >1.5s = nueva sección
        if gap > 1.5 and seccion_lineas:
            secciones.append((seccion_lineas, seccion_inicio, ultimo_fin))
            seccion_lineas = []
            seccion_inicio = inicio
        seccion_lineas.append(texto)
        ultimo_fin = fin

    if seccion_lineas:
        secciones.append((seccion_lineas, seccion_inicio, ultimo_fin))

    if not secciones:
        return "[Instrumental]"

    # ══════ Paso 2: Subdividir secciones muy largas ══════
    # Si una sección tiene >8 líneas, probablemente son 2 secciones
    # (verso + coro pegados sin gap suficiente)
    bloques = []  # (lineas, t_inicio, t_fin)
    for lineas, t_ini, t_fin in secciones:
        if len(lineas) > 10:
            # Dividir en bloques de ~4-6 líneas
            chunk_size = min(6, max(4, len(lineas) // 2))
            for j in range(0, len(lineas), chunk_size):
                chunk = lineas[j:j + chunk_size]
                # Aproximar timestamps
                frac_ini = j / len(lineas)
                frac_fin = min(1.0, (j + len(chunk)) / len(lineas))
                ct_ini = t_ini + (t_fin - t_ini) * frac_ini
                ct_fin = t_ini + (t_fin - t_ini) * frac_fin
                bloques.append((chunk, ct_ini, ct_fin))
        else:
            bloques.append((lineas, t_ini, t_fin))

    # ══════ Paso 3: Detectar CORO por similitud ══════
    n_bloques = len(bloques)
    textos = [" ".join(lineas) for lineas, _, _ in bloques]

    # Matriz de similitud
    coro_indices = set()
    coro_grupo = []  # grupos de bloques similares

    for i in range(n_bloques):
        if i in coro_indices:
            continue
        grupo = [i]
        for j in range(i + 1, n_bloques):
            if j in coro_indices:
                continue
            sim = similitud_texto(textos[i], textos[j])
            if sim > 0.45:  # >45% similar = probablemente mismo bloque
                grupo.append(j)
        if len(grupo) >= 2:
            # Este bloque se repite → candidato a coro
            coro_grupo.append(grupo)
            for idx in grupo:
                coro_indices.add(idx)

    # El coro es el grupo más frecuente
    coro_set = set()
    if coro_grupo:
        # Preferir el grupo más grande, si empate el que tiene líneas más cortas (coros suelen ser más pegadizos)
        coro_grupo.sort(key=lambda g: (-len(g), sum(len(bloques[i][0]) for i in g)))
        coro_set = set(coro_grupo[0])

    # ══════ Paso 4: Detectar PRE-CHORUS ══════
    # Pre-chorus: bloque corto (2-4 líneas) justo antes de un coro
    pre_chorus_set = set()
    for idx in sorted(coro_set):
        if idx > 0 and idx - 1 not in coro_set:
            prev_lineas = bloques[idx - 1][0]
            if 1 <= len(prev_lineas) <= 4:
                # Verificar que este pre-chorus se repite antes de otros coros
                pre_texto = " ".join(prev_lineas)
                similar_count = 0
                for other_idx in sorted(coro_set):
                    if other_idx > 0 and other_idx - 1 not in coro_set:
                        other_pre = " ".join(bloques[other_idx - 1][0])
                        if similitud_texto(pre_texto, other_pre) > 0.4:
                            similar_count += 1
                if similar_count >= 2:
                    # Se repite antes de múltiples coros → es pre-chorus
                    for other_idx in sorted(coro_set):
                        if other_idx > 0 and other_idx - 1 not in coro_set:
                            other_pre = " ".join(bloques[other_idx - 1][0])
                            if similitud_texto(pre_texto, other_pre) > 0.4:
                                pre_chorus_set.add(other_idx - 1)
                    break

    # ══════ Paso 5: Asignar etiquetas ══════
    resultado = []
    verso_num = 1
    bridge_asignado = False
    ultimo_coro_idx = max(coro_set) if coro_set else -1

    for i, (lineas, t_ini, t_fin) in enumerate(bloques):
        bloque_texto = "\n".join(lineas)
        n_lineas = len(lineas)

        # --- INTRO: primera sección si es corta (≤3 líneas) ---
        if i == 0 and n_lineas <= 3 and i not in coro_set:
            resultado.append("[Intro]")
            resultado.append(bloque_texto)
            resultado.append("")
            continue

        # --- OUTRO: última sección si es corta (≤3 líneas) ---
        if i == n_bloques - 1 and n_lineas <= 3 and i not in coro_set:
            resultado.append("[Outro]")
            resultado.append(bloque_texto)
            continue

        # --- CORO ---
        if i in coro_set:
            resultado.append("[Chorus]")
            resultado.append(bloque_texto)
            resultado.append("")
            continue

        # --- PRE-CHORUS ---
        if i in pre_chorus_set:
            resultado.append("[Pre-Chorus]")
            resultado.append(bloque_texto)
            resultado.append("")
            continue

        # --- BRIDGE: sección única después del 2do coro ---
        coros_antes = len([c for c in coro_set if c < i])
        if (coros_antes >= 2 and not bridge_asignado
                and n_lineas <= 6 and i not in coro_set
                and i < n_bloques - 1):
            # Verificar que no se repite
            bloque_norm = " ".join(lineas)
            es_unico = all(
                similitud_texto(bloque_norm, " ".join(bloques[j][0])) < 0.3
                for j in range(n_bloques) if j != i
            )
            if es_unico:
                resultado.append("[Bridge]")
                resultado.append(bloque_texto)
                resultado.append("")
                bridge_asignado = True
                continue

        # --- BREAK: sección muy corta (1 línea) en medio ---
        if n_lineas == 1 and 0 < i < n_bloques - 1:
            resultado.append("[Break]")
            resultado.append(bloque_texto)
            resultado.append("")
            continue

        # --- VERSO: todo lo demás ---
        resultado.append(f"[Verse {verso_num}]")
        resultado.append(bloque_texto)
        resultado.append("")
        verso_num += 1

    return "\n".join(resultado).strip()


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
    """Separa audio en stems. Retorna ruta a la acapella."""
    import torch
    import torchaudio
    from demucs.apply import apply_model

    modelo = cargar_demucs()

    wav, sr = torchaudio.load(str(ruta_audio))
    duracion_seg = wav.shape[1] / sr
    print(f"    Archivo: {duracion_seg:.0f}s, {sr}Hz, {wav.shape[0]}ch")

    if sr != 44100:
        wav = torchaudio.functional.resample(wav, sr, 44100)
        sr = 44100

    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    if wav.shape[0] > 2:
        wav = wav[:2]

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

    # Guardar acapella
    vocals = sources[0, 3].cpu()
    ruta_acapella = carpeta_stems / f"{nombre_base}_acapella.wav"
    torchaudio.save(str(ruta_acapella), vocals, sr, bits_per_sample=32)

    # Guardar otros stems
    subcarpeta = carpeta_stems / nombre_base
    subcarpeta.mkdir(parents=True, exist_ok=True)
    for idx, nombre in enumerate(["drums", "bass", "other"]):
        stem = sources[0, idx].cpu()
        torchaudio.save(str(subcarpeta / f"{nombre}.wav"), stem, sr, bits_per_sample=32)

    del sources, wav_gpu, vocals
    torch.cuda.empty_cache()

    return ruta_acapella


# ─── Whisper (mejorado) ─────────────────────────────────────────────────────

def transcribir_vocals(model, ruta_vocals: Path) -> tuple:
    """
    Transcribe vocals con Whisper large-v3 optimizado para español urbano.

    Cambios clave vs v1:
    - initial_prompt: fuerza español latino (evita portugués)
    - condition_on_previous_text=False: evita cascada de alucinaciones
    - word_timestamps=True: para detectar gaps y estructura
    - log_prob_threshold más estricto: rechaza segmentos de baja confianza
    """
    segments, info = model.transcribe(
        str(ruta_vocals),
        language=IDIOMA,
        beam_size=5,
        best_of=5,
        patience=1.5,
        temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),

        # ══ CLAVE: Estos 2 parámetros arreglan el 90% de problemas ══
        initial_prompt=INITIAL_PROMPT,           # Fuerza español latino
        condition_on_previous_text=False,         # Evita efecto bola de nieve

        # VAD (Voice Activity Detection) — filtra silencios
        vad_filter=True,
        vad_parameters={
            "threshold": 0.40,              # Más alto = más agresivo
            "min_speech_duration_ms": 200,
            "max_speech_duration_s": 30,
            "min_silence_duration_ms": 300,  # Gaps más largos = mejor estructura
            "speech_pad_ms": 150,
        },

        # Filtros de calidad
        no_speech_threshold=0.5,
        log_prob_threshold=-0.8,            # Rechaza segmentos poco confiables
        compression_ratio_threshold=2.0,     # Rechaza texto muy repetitivo
        hallucination_silence_threshold=0.8,

        # Timestamps por palabra para detección de estructura
        word_timestamps=True,

        # Anti-repetición
        repetition_penalty=1.2,
    )

    # Recolectar segmentos con timestamps y probabilidades
    segmentos_con_tiempo = []
    lineas_raw = []

    for seg in segments:
        texto = seg.text.strip()
        prob = seg.avg_log_prob if hasattr(seg, 'avg_log_prob') else 0.0

        if texto and not es_alucinacion(texto, prob):
            segmentos_con_tiempo.append((texto, seg.start, seg.end))
            lineas_raw.append(texto)

    # Filtrar repeticiones
    lineas_raw = filtrar_repeticiones(lineas_raw)

    # Generar ambos formatos
    letra_raw = "\n".join(lineas_raw)
    letra_estructurada = detectar_estructura(segmentos_con_tiempo)

    return letra_raw, letra_estructurada, info.duration


# ─── Utilidades del Dataset ──────────────────────────────────────────────────

def cargar_dataset_json(ruta_json: Path) -> dict:
    """Carga el JSON del dataset y crea mapeo índice → metadata."""
    if not ruta_json.exists():
        return {}
    with open(ruta_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def es_comercial(nombre_original: str) -> bool:
    """Detecta si una canción es de un artista comercial."""
    nombre_lower = nombre_original.lower()
    return any(artista in nombre_lower for artista in ARTISTAS_COMERCIALES)


def generar_guia_comerciales(dataset: dict, carpeta_salida: Path):
    """Genera un archivo guía para las canciones comerciales."""
    guia = []
    guia.append("=" * 70)
    guia.append("  GUÍA DE LETRAS COMERCIALES — Copiar de Genius/Letras.com")
    guia.append("=" * 70)
    guia.append("")
    guia.append("Estas canciones necesitan letras REALES (no Whisper).")
    guia.append("Busca las letras en: https://genius.com o https://letras.com")
    guia.append("Luego cópialas en el archivo .txt correspondiente.")
    guia.append("")

    for i, sample in enumerate(dataset.get("samples", [])):
        nombre = sample.get("filename", "")
        if sample.get("is_instrumental", False):
            continue
        if es_comercial(nombre):
            artista = "?"
            cancion = nombre
            # Intentar extraer artista - canción
            if " - " in nombre:
                partes = nombre.split(" - ")
                artista = partes[0].strip()
                cancion = partes[-1].strip()
                # Limpiar extensión
                for ext in EXTENSIONES:
                    cancion = cancion.replace(ext, "")

            guia.append(f"  [{i:02d}] {artista} — {cancion}")
            guia.append(f"       Archivo: {i}.* (original: {nombre})")
            guia.append(f"       Buscar:  https://genius.com/search?q={cancion.replace(' ', '+')}")
            guia.append(f"       TXT:     letras_v2/{i}.txt")
            guia.append("")

    guia.append("=" * 70)
    guia.append("FORMATO: Copia las letras con tags [Verse 1], [Chorus], etc.")
    guia.append("=" * 70)

    ruta_guia = carpeta_salida / "_GUIA_COMERCIALES.txt"
    ruta_guia.write_text("\n".join(guia), encoding="utf-8")
    print(f"\n  📋 Guía de comerciales: {ruta_guia}")
    return len([s for s in dataset.get("samples", [])
                if es_comercial(s.get("filename", "")) and not s.get("is_instrumental", False)])


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Transcriptor v2: Demucs + Whisper optimizado para reggaeton/urbano")
    parser.add_argument("--carpeta-audio", default=None,
        help="Carpeta con archivos de audio (default: datasets/urban_flow/dataset_IA)")
    parser.add_argument("--carpeta-salida", default=None,
        help="Carpeta de salida para letras (default: letras_v2/)")
    parser.add_argument("--json-dataset", default=None,
        help="JSON del dataset (default: datasets/my_lora_dataset.json)")
    parser.add_argument("--sobreescribir", action="store_true",
        help="Sobreescribir letras existentes")
    parser.add_argument("--solo-stems", action="store_true",
        help="Solo separar stems, no transcribir")
    parser.add_argument("--solo-transcribir", action="store_true",
        help="Solo transcribir (usar stems existentes)")
    parser.add_argument("--skip-comerciales", action="store_true",
        help="Saltar canciones de artistas comerciales")
    parser.add_argument("--skip-instrumentales", action="store_true",
        default=False, help="Saltar instrumentales marcadas en el JSON")
    parser.add_argument("--indices", nargs="+", type=int, default=None,
        help="Solo procesar estos índices (ej: --indices 35 36 37)")
    parser.add_argument("--calidad", default="alta",
        choices=["rapida", "alta", "maxima"],
        help="Calidad Demucs: rapida(1), alta(5), maxima(10)")
    args = parser.parse_args()

    # Rutas
    base = Path(os.path.dirname(os.path.abspath(__file__)))
    acestep = base / "ACE-Step-1.5_"

    carpeta_audio = Path(args.carpeta_audio) if args.carpeta_audio else \
        acestep / "datasets" / "urban_flow" / "dataset_IA"
    salida = Path(args.carpeta_salida) if args.carpeta_salida else \
        base / "letras_v2"
    json_path = Path(args.json_dataset) if args.json_dataset else \
        acestep / "datasets" / "my_lora_dataset.json"
    carpeta_stems = base / "stems"

    salida.mkdir(parents=True, exist_ok=True)
    carpeta_stems.mkdir(parents=True, exist_ok=True)

    # Cargar dataset JSON para metadata
    dataset = cargar_dataset_json(json_path)
    samples = dataset.get("samples", [])

    # Listar archivos de audio ordenados numéricamente
    archivos = sorted(
        [f for f in carpeta_audio.iterdir()
         if f.is_file() and f.suffix.lower() in EXTENSIONES],
        key=lambda f: int(f.stem) if f.stem.isdigit() else f.stem
    )

    if not archivos:
        print(f"❌ No hay archivos de audio en {carpeta_audio}")
        sys.exit(1)

    cal = CALIDAD[args.calidad]

    # ─── Header ──────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  🎵 TRANSCRIPTOR DE LETRAS v2 — Reggaeton/Urbano")
    print("     Demucs htdemucs_ft + Whisper large-v3 (optimizado español)")
    print("=" * 70)
    print(f"  Demucs:       {MODELO_DEMUCS} ({args.calidad}, shifts={cal['shifts']})")
    print(f"  Whisper:      {MODELO_WHISPER} ({COMPUTE_TYPE})")
    print(f"  Idioma:       {IDIOMA} (con initial_prompt anti-alucinación)")
    print(f"  Archivos:     {len(archivos)}")
    print(f"  Dataset JSON: {'✅ ' + str(len(samples)) + ' muestras' if samples else '❌ No encontrado'}")
    print(f"  Audio:        {carpeta_audio}")
    print(f"  Stems:        {carpeta_stems}")
    print(f"  Letras:       {salida}")
    if args.indices:
        print(f"  Filtro:       Solo índices {args.indices}")
    print("=" * 70)

    # Generar guía para canciones comerciales
    if samples:
        n_comerciales = generar_guia_comerciales(dataset, salida)
        print(f"  📋 {n_comerciales} canciones comerciales necesitan letras manuales")

    # Cargar Whisper si vamos a transcribir
    whisper_model = None
    if not args.solo_stems:
        print(f"\n  ⏳ Cargando Whisper {MODELO_WHISPER}...", end=" ", flush=True)
        from faster_whisper import WhisperModel
        whisper_model = WhisperModel(MODELO_WHISPER, device=DEVICE, compute_type=COMPUTE_TYPE)
        print("✅")

    # ─── Procesar ────────────────────────────────────────────────────────
    total = len(archivos)
    completados = 0
    instrumentales = 0
    saltados = 0
    errores = 0

    for i, archivo in enumerate(archivos):
        idx = int(archivo.stem) if archivo.stem.isdigit() else i

        # Metadata del JSON
        sample = samples[idx] if idx < len(samples) else None
        nombre_original = sample.get("filename", archivo.name) if sample else archivo.name
        es_instrumental = sample.get("is_instrumental", False) if sample else False

        # Filtrar por índices
        if args.indices and idx not in args.indices:
            continue

        # Saltar instrumentales
        if args.skip_instrumentales and es_instrumental:
            txt = salida / f"{idx}.txt"
            if not txt.exists():
                txt.write_text("[Instrumental]", encoding="utf-8")
            print(f"\n  [{idx:02d}] ⏭️  INSTRUMENTAL — {nombre_original}")
            instrumentales += 1
            continue

        # Saltar comerciales si se pidió
        if args.skip_comerciales and es_comercial(nombre_original):
            print(f"\n  [{idx:02d}] ⏭️  COMERCIAL — {nombre_original}")
            print(f"         → Copiar letra real de Genius/Letras.com")
            saltados += 1
            continue

        # ¿Ya procesado?
        txt_raw = salida / f"{idx}.txt"
        txt_struct = salida / f"{idx}_estructurada.txt"
        ruta_acapella = carpeta_stems / f"{idx}_acapella.wav"

        if not args.sobreescribir and txt_raw.exists() and not args.solo_stems:
            print(f"\n  [{idx:02d}] ⏭️  Ya existe — {nombre_original}")
            continue

        print(f"\n  [{idx:02d}] 🎤 {nombre_original}")
        if es_comercial(nombre_original):
            print(f"         ⚠️  COMERCIAL — Whisper transcribirá, pero revisa contra letra real")
        t_total = time.time()

        try:
            # ─── Paso 1: Separar stems (solo si no existen) ───────
            if not args.solo_transcribir:
                # Solo separar si la acapella no existe ya
                if ruta_acapella.exists() and not args.sobreescribir:
                    print(f"    ⏭️  Acapella ya existe, saltando Demucs")
                else:
                    print(f"    → Separando stems ({args.calidad})...")
                    t0 = time.time()
                    ruta_acapella = separar_stems(
                        archivo, carpeta_stems, str(idx),
                        shifts=cal["shifts"], overlap=cal["overlap"]
                    )
                    print(f"    ✅ Stems: {time.time()-t0:.1f}s")
            else:
                # --solo-transcribir: si no hay acapella, separar de todas formas
                if not ruta_acapella.exists():
                    print(f"    ⚠️  Acapella no existe — ejecutando Demucs...")
                    t0 = time.time()
                    ruta_acapella = separar_stems(
                        archivo, carpeta_stems, str(idx),
                        shifts=cal["shifts"], overlap=cal["overlap"]
                    )
                    print(f"    ✅ Stems: {time.time()-t0:.1f}s")

            # ─── Paso 2: Transcribir ───────────────────────────────
            if not args.solo_stems and whisper_model is not None:
                # Verificar que tenemos audio para transcribir
                audio_para_transcribir = ruta_acapella
                if not audio_para_transcribir.exists():
                    print(f"    ℹ️  Sin acapella, usando audio original")
                    audio_para_transcribir = archivo

                print(f"    → Transcribiendo...", end=" ", flush=True)
                t0 = time.time()
                letra_raw, letra_struct, dur = transcribir_vocals(
                    whisper_model, ruta_acapella
                )
                dt = time.time() - t0

                if letra_raw.strip():
                    # Guardar letra raw
                    txt_raw.write_text(letra_raw, encoding="utf-8")
                    # Guardar letra estructurada
                    txt_struct.write_text(letra_struct, encoding="utf-8")

                    n_lineas = len(letra_raw.split('\n'))
                    print(f"({dt:.1f}s) → {n_lineas} líneas")
                    print(f"    📄 {txt_raw.name} (raw)")
                    print(f"    📄 {txt_struct.name} (con [Verse]/[Chorus])")
                    completados += 1
                else:
                    txt_raw.write_text("[Instrumental]", encoding="utf-8")
                    txt_struct.write_text("[Instrumental]", encoding="utf-8")
                    print(f"({dt:.1f}s) → Instrumental (sin voz detectada)")
                    instrumentales += 1

            print(f"    ✅ Total: {time.time()-t_total:.1f}s")

        except Exception as e:
            print(f"    ❌ Error: {e}")
            import traceback
            traceback.print_exc()
            errores += 1

    # ─── Resumen ─────────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print(f"  📊 RESUMEN")
    print(f"{'=' * 70}")
    print(f"  Procesados:     {completados} con letra")
    print(f"  Instrumentales: {instrumentales}")
    print(f"  Saltados:       {saltados}")
    print(f"  Errores:        {errores}")
    print(f"{'=' * 70}")
    print(f"\n  Archivos generados en: {salida}/")
    print(f"    {{número}}.txt              — letra raw")
    print(f"    {{número}}_estructurada.txt — con [Verse], [Chorus], etc.")
    print(f"    _GUIA_COMERCIALES.txt     — canciones que necesitan letras manuales")
    print(f"\n  Siguiente paso:")
    print(f"    1. Revisa las letras transcribidas")
    print(f"    2. Copia letras reales para las comerciales (ver _GUIA_COMERCIALES.txt)")
    print(f"    3. Ejecuta: python actualizar_dataset_letras.py")
    print()


if __name__ == "__main__":
    main()
