"""
Script para truncar captions del dataset a máximo 2 oraciones.
Límite seguro: ~150 tokens disponibles después del overhead del SFT_GEN_PROMPT.
"""
import json
import re
import shutil
from pathlib import Path

JSON_PATH = Path(r"D:\espacios de trabajo\vscode\acestep\ACE-Step-1.5_\datasets\my_lora_dataset.json")
BACKUP_PATH = JSON_PATH.with_suffix(".json.bak")
MAX_SENTENCES = 2

def split_sentences(text):
    """Divide texto en oraciones por . ? !"""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]

def truncar_caption(caption, max_sentences=MAX_SENTENCES):
    sentences = split_sentences(caption)
    if len(sentences) <= max_sentences:
        return caption, False  # No cambio
    truncado = ' '.join(sentences[:max_sentences])
    # Asegurar que termine con punto
    if truncado and truncado[-1] not in '.!?':
        truncado += '.'
    return truncado, True

def main():
    # Backup
    shutil.copy2(JSON_PATH, BACKUP_PATH)
    print(f"Backup creado: {BACKUP_PATH}")

    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    samples = data['samples']
    modificados = 0
    reporte = []

    for sample in samples:
        filename = sample.get('filename', sample.get('id', '?'))
        caption_original = sample.get('caption', '')
        
        if not caption_original:
            continue
        
        caption_nuevo, cambiado = truncar_caption(caption_original)
        
        if cambiado:
            palabras_antes = len(caption_original.split())
            palabras_despues = len(caption_nuevo.split())
            chars_antes = len(caption_original)
            chars_despues = len(caption_nuevo)
            
            reporte.append({
                'file': filename,
                'antes_palabras': palabras_antes,
                'despues_palabras': palabras_despues,
                'antes_chars': chars_antes,
                'despues_chars': chars_despues,
                'caption_nuevo': caption_nuevo
            })
            
            sample['caption'] = caption_nuevo
            modificados += 1

    # Guardar JSON modificado
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Total muestras: {len(samples)}")
    print(f"Captions truncados: {modificados}")
    print(f"Captions sin cambio: {len(samples) - modificados}")
    print(f"{'='*60}\n")

    for r in reporte:
        print(f"[{r['file']}]")
        print(f"  Antes: {r['antes_palabras']} palabras ({r['antes_chars']} chars)")
        print(f"  Después: {r['despues_palabras']} palabras ({r['despues_chars']} chars)")
        print(f"  Nuevo: {r['caption_nuevo'][:120]}...")
        print()

    print(f"JSON guardado en: {JSON_PATH}")
    print(f"Backup en: {BACKUP_PATH}")

if __name__ == '__main__':
    main()
