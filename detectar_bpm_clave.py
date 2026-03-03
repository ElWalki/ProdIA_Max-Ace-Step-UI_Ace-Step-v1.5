#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════╗
║          DETECTOR DE BPM Y CLAVE MUSICAL (Key)              ║
║          Escanea una carpeta de archivos de audio            ║
║          Formatos: .mp3, .wav, .flac, .ogg, .m4a, .wma      ║
╚══════════════════════════════════════════════════════════════╝

Uso:
  python detectar_bpm_clave.py [carpeta]

Si no se especifica carpeta, se pregunta interactivamente.
Genera un archivo CSV con los resultados en la carpeta analizada.

Algoritmos:
  - BPM: librosa.beat.beat_track (onset strength + autocorrelation)
         + verificación con librosa.beat.tempo (prior=None) para mayor precisión
  - Key: Chroma CQT + Krumhansl-Schmuckler key-finding algorithm
         Detecta las 24 tonalidades (12 mayores + 12 menores)
"""

import os
import sys
import csv
import time
import warnings
import argparse
from datetime import datetime

import numpy as np

warnings.filterwarnings("ignore")

import librosa


# ─── Krumhansl-Schmuckler key profiles ──────────────────────────────────
# Correlación de cada grado cromático con la tonalidad
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                           2.52, 5.19, 2.39, 3.66, 2.29, 2.88])

MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                           2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F',
             'F#', 'G', 'G#', 'A', 'A#', 'B']

AUDIO_EXTENSIONS = {'.mp3', '.wav', '.flac', '.ogg', '.m4a', '.wma', '.aac', '.opus'}


def detect_key(y, sr):
    """
    Detecta la clave musical usando Chroma CQT + Krumhansl-Schmuckler.
    
    Retorna: (key_name, mode, confidence)
      - key_name: e.g. 'C', 'F#', 'A'
      - mode: 'Major' o 'Minor'
      - confidence: correlación (0-1), mayor = más seguro
    """
    # Chroma CQT es más preciso que chroma_stft para detección de clave
    chromagram = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12, bins_per_octave=36)
    
    # Promedio temporal de cada clase de pitch
    chroma_vals = np.mean(chromagram, axis=1)
    
    # Normalizar
    chroma_vals = chroma_vals - np.mean(chroma_vals)
    
    best_corr = -2
    best_key = 0
    best_mode = 'Major'
    
    for i in range(12):
        # Rotar el perfil para probar cada tonalidad
        major_rotated = np.roll(MAJOR_PROFILE, i)
        minor_rotated = np.roll(MINOR_PROFILE, i)
        
        # Normalizar perfiles
        major_norm = major_rotated - np.mean(major_rotated)
        minor_norm = minor_rotated - np.mean(minor_rotated)
        
        # Correlación de Pearson
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
    
    key_name = KEY_NAMES[best_key]
    confidence = max(0, best_corr)  # Clamp a 0
    
    return key_name, best_mode, confidence


def detect_bpm(y, sr):
    """
    Detecta BPM con alta precisión usando múltiples métodos y promediando.
    
    Retorna: (bpm_redondeado, bpm_exacto)
    """
    # Método 1: beat_track estándar
    tempo1, _ = librosa.beat.beat_track(y=y, sr=sr)
    if isinstance(tempo1, np.ndarray):
        tempo1 = float(tempo1[0])
    
    # Método 2: onset strength + tempogram para mayor precisión
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    
    # Tempograma para análisis más detallado
    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
    
    # Autocorrelación global del tempograma
    ac_global = librosa.autocorrelate(onset_env, max_size=tempogram.shape[0])
    ac_global = librosa.util.normalize(ac_global)
    
    # Estimar tempo desde autocorrelación
    tempo2 = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
    if isinstance(tempo2, np.ndarray) and len(tempo2) > 0:
        tempo2 = float(np.median(tempo2))
    else:
        tempo2 = tempo1
    
    # Método 3: con prior=None (sin sesgo hacia tempos "comunes")
    tempo3 = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, prior=None)
    if isinstance(tempo3, np.ndarray):
        tempo3 = float(tempo3[0])
    
    # Promediar los métodos, dando más peso al método sin prior
    bpm_exact = (tempo1 * 0.25 + tempo2 * 0.25 + tempo3 * 0.50)
    
    # Para reggaeton/urban, el rango típico es 80-110 BPM
    # Si el BPM detectado es el doble, dividir; si es la mitad, multiplicar
    bpm_rounded = round(bpm_exact, 1)
    
    return bpm_rounded, bpm_exact


def format_duration(seconds):
    """Formatea duración en mm:ss."""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


def analyze_file(filepath):
    """
    Analiza un archivo de audio y retorna BPM, Key, duración.
    
    Retorna dict con los resultados o None si falla.
    """
    try:
        # Cargar audio (mono, sr=22050 por defecto para análisis)
        y, sr = librosa.load(filepath, sr=22050, mono=True)
        
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Detectar BPM
        bpm, bpm_exact = detect_bpm(y, sr)
        
        # Detectar clave
        key, mode, confidence = detect_key(y, sr)
        
        return {
            'file': os.path.basename(filepath),
            'bpm': bpm,
            'bpm_exact': round(bpm_exact, 2),
            'key': key,
            'mode': mode,
            'key_full': f"{key} {mode}",
            'confidence': round(confidence * 100, 1),
            'duration': format_duration(duration),
            'duration_sec': round(duration, 1),
        }
        
    except Exception as e:
        print(f"  ERROR procesando {os.path.basename(filepath)}: {e}")
        return None


def scan_folder(folder_path):
    """Busca archivos de audio en la carpeta (no recursivo)."""
    files = []
    for f in sorted(os.listdir(folder_path)):
        ext = os.path.splitext(f)[1].lower()
        if ext in AUDIO_EXTENSIONS:
            files.append(os.path.join(folder_path, f))
    return files


def main():
    parser = argparse.ArgumentParser(
        description='Detector de BPM y Clave Musical para archivos de audio'
    )
    parser.add_argument('folder', nargs='?', default=None,
                        help='Carpeta con archivos de audio a analizar')
    parser.add_argument('--recursive', '-r', action='store_true',
                        help='Buscar también en subcarpetas')
    args = parser.parse_args()
    
    print()
    print("=" * 66)
    print("   DETECTOR DE BPM Y CLAVE MUSICAL")
    print("   Formatos soportados: MP3, WAV, FLAC, OGG, M4A, WMA, AAC, OPUS")
    print("=" * 66)
    print()
    
    # Obtener carpeta
    folder = args.folder
    if not folder:
        folder = input("  Ingresa la ruta de la carpeta con los audios:\n  > ").strip()
        folder = folder.strip('"').strip("'")
    
    if not os.path.isdir(folder):
        print(f"\n  ERROR: La carpeta no existe: {folder}")
        input("\n  Presiona Enter para salir...")
        sys.exit(1)
    
    # Buscar archivos
    if args.recursive:
        audio_files = []
        for root, dirs, files in os.walk(folder):
            for f in sorted(files):
                ext = os.path.splitext(f)[1].lower()
                if ext in AUDIO_EXTENSIONS:
                    audio_files.append(os.path.join(root, f))
    else:
        audio_files = scan_folder(folder)
    
    if not audio_files:
        print(f"\n  No se encontraron archivos de audio en: {folder}")
        input("\n  Presiona Enter para salir...")
        sys.exit(1)
    
    print(f"  Carpeta: {folder}")
    print(f"  Archivos encontrados: {len(audio_files)}")
    print()
    
    # ─── Analizar ────────────────────────────────────────────────────────
    results = []
    errors = []
    t_start = time.time()
    
    # Primero analizar todo (mostrando progreso simple)
    print("  Analizando...\n")
    for i, filepath in enumerate(audio_files, 1):
        filename = os.path.basename(filepath)
        print(f"  [{i:>3}/{len(audio_files)}] {filename}... ", end="", flush=True)
        
        result = analyze_file(filepath)
        
        if result:
            results.append(result)
            print(f"OK  ({result['bpm']:.1f} BPM, {result['key_full']})")
        else:
            errors.append(filename)
            print("ERROR")
    
    # Calcular ancho dinámico basado en el nombre más largo
    if results:
        max_name_len = max(len(r['file']) for r in results)
        name_col = max(max_name_len, 10)  # mínimo 10 chars
    else:
        name_col = 35
    
    # Ancho total de la tabla
    # #(4) + nombre + BPM(8) + Clave(14) + Conf(7) + mm:ss(8) + seg(10) + espacios
    total_width = 4 + name_col + 2 + 8 + 2 + 14 + 2 + 7 + 2 + 8 + 2 + 10
    
    separator = "─" * total_width
    
    print()
    print(f"  {'═' * total_width}")
    print(f"  {'RESULTADOS':^{total_width}}")
    print(f"  {'═' * total_width}")
    header = f"  {'#':>3} {'Archivo':<{name_col}}  {'BPM':>7}  {'Clave':<12}  {'Conf':>6}  {'Tiempo':>7}  {'Segundos':>9}"
    print(header)
    print(f"  {separator}")
    
    for i, r in enumerate(results, 1):
        conf_str = f"{r['confidence']}%"
        print(f"  {i:>3} {r['file']:<{name_col}}  {r['bpm']:>7.1f}  {r['key_full']:<12}  {conf_str:>6}  {r['duration']:>7}  {r['duration_sec']:>8.1f}s")
    
    print(f"  {separator}")
    
    elapsed = time.time() - t_start
    
    # Duración total del dataset
    if results:
        total_sec = sum(r['duration_sec'] for r in results)
        total_min = total_sec / 60
        total_h = total_sec / 3600
        print(f"\n  Analizados: {len(results)}/{len(audio_files)} archivos en {elapsed:.1f}s")
        if errors:
            print(f"  Errores: {len(errors)} archivos no se pudieron procesar")
        print(f"  Duración total del dataset: {format_duration(total_sec)} ({total_sec:.1f}s = {total_min:.1f} min = {total_h:.2f} horas)")
    
    # ─── Estadísticas ────────────────────────────────────────────────────
    if results:
        bpms = [r['bpm'] for r in results]
        durations = [r['duration_sec'] for r in results]
        print(f"\n  ═══ Estadísticas BPM ═══")
        print(f"  Promedio: {np.mean(bpms):.1f}  │  Mínimo: {min(bpms):.1f}  │  Máximo: {max(bpms):.1f}")
        print(f"  Mediana:  {np.median(bpms):.1f}  │  Desv. Estándar: {np.std(bpms):.1f}")
        
        print(f"\n  ═══ Estadísticas Duración ═══")
        print(f"  Promedio: {format_duration(np.mean(durations))} ({np.mean(durations):.1f}s)")
        print(f"  Mínima:   {format_duration(min(durations))} ({min(durations):.1f}s)  │  Máxima: {format_duration(max(durations))} ({max(durations):.1f}s)")
        
        # Distribución de claves
        from collections import Counter
        key_counts = Counter(r['key_full'] for r in results)
        print(f"\n  ═══ Distribución de Claves ═══")
        for key, count in key_counts.most_common():
            bar = "█" * count
            print(f"  {key:<12} {count:>3}  {bar}")
    
    # ─── Guardar CSV ─────────────────────────────────────────────────────
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = os.path.join(folder, f"analisis_bpm_clave_{timestamp}.csv")
    
    try:
        with open(csv_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['Archivo', 'BPM', 'BPM_Exacto', 'Clave', 'Modo', 
                           'Clave_Completa', 'Confianza_%', 'Duracion', 'Duracion_seg'])
            for r in results:
                writer.writerow([
                    r['file'], r['bpm'], r['bpm_exact'], r['key'], r['mode'],
                    r['key_full'], r['confidence'], r['duration'], r['duration_sec']
                ])
        
        print(f"\n  Resultados guardados en:")
        print(f"  {csv_path}")
    except Exception as e:
        print(f"\n  Error guardando CSV: {e}")
    
    print()
    input("  Presiona Enter para salir...")


if __name__ == '__main__':
    main()
