# Singer Library — Technical Specification
**Feature:** Neural Singer Adapter System for ACE-Step  
**Author:** Walki-bass  
**Date:** 2026-02-21  
**Status:** PROPOSAL — Ready for implementation  
**Target interfaces:** ace-step-ui (port 8001) + Gradio (port 7860)

---

## ⚠️ Design Philosophy — This is NOT TTS, NOT RVC

This system must be clearly distinguished from existing vocal AI approaches:

| System | Mechanism | Artifacts | Vibrato | Quejidos | Breathing |
|--------|-----------|-----------|---------|----------|-----------|
| **RVC** | Voice conversion (post-processing) | HIGH — frequency smearing, metallic tone | Lost/degraded | Lost | Lost |
| **TTS** | Text-to-speech synthesis | MEDIUM — robotic prosody | None | None | None |
| **ACE Studio** | Generative SVS (Singing Voice Synthesis) with per-singer neural adapters | NONE — generated from scratch | ✅ Natural | ✅ Style-specific | ✅ Organic |
| **THIS SYSTEM** | Voice LoRA injected into ACE-Step's generative DiT pipeline | NONE — generated, not converted | ✅ Learned | ✅ Learned | ✅ Learned |

**Why ACE-Step can do this without artifacts:**  
ACE-Step does not *convert* audio — it *generates* audio from noise via diffusion. A Voice LoRA teaches the diffusion model to generate vocal characteristics (vibrato, ornaments, breath sounds, dynamics) as part of the original generation process. There is no conversion step, therefore no conversion artifacts.

**Key vocal nuances a Voice LoRA can learn:**
- **Vibrato** — periodic pitch oscillation on sustained notes
- **Quejidos / vocal ornaments** — slides, bends, cries common in reggaeton/latin
- **Breathing** — inhale timing, breath duration, breath placement between phrases
- **Melisma** — vocal runs across multiple pitches on one syllable
- **Dynamics** — soft intro → explosive chorus transitions
- **Rasp/grain** — specific tonal texture of the voice (grit, breathiness, chest vs head voice)
- **Phrasing rhythm** — how the singer lays syllables over the beat (ahead/behind)
- **Auto-tune response** — if the singer uses auto-tune, the model learns that style too

**What it cannot clone:**
- The exact biometric identity/timbre of a real person's vocal cords  
  (This is intentional — full voice cloning raises ethical/legal issues)
- Micro-pitch deviations unique to one take
- Physiological artifacts (cough, throat clearing mid-take)

---

## 0. How ACE Studio Does It (Technical Reference)

ACE Studio's singer models are essentially **conditioned neural synthesizers** — each "singer" is a set of learned parameters that bias the vocal generation toward a specific phonation style, resonance pattern, and ornament vocabulary. Stored internally likely as:
- A small embedding vector (~256-512 floats) encoding the "vocal identity space"
- Potentially lightweight adapter weights on the attention layers of their SVS model

They train each singer model on **clean isolated acapella recordings** — no music, no reverb, just dry vocal takes. The model learns to associate that phonation pattern with a singer ID token.

**Our approach mirrors this exactly**, but instead of a proprietary SVS model, we inject the singer conditioning into ACE-Step's existing DiT cross-attention mechanism — which already accepts timbre conditioning.

---

## 1. Vision

Create a **"Singer Library"** system analogous to the existing LoRA library, where each entry is a **voice timbre adapter** — a precomputed embedding or lightweight adapter that encodes the tonal characteristics of a specific singer or vocal style. Users can select a singer from a dropdown, combine it with a LoRA (style), and generate music that sounds like *that singer* performing *in that style*.

This is conceptually what Suno does internally: they have a catalog of vocal identities encoded as conditioning vectors, selectable at inference time without retrained models.

---

## 2. Technical Background — How ACE-Step Handles Timbre

### 2.1 Existing Architecture

ACE-Step 1.5 already has timbre conditioning built in:

```
ACE-Step-1.5_/acestep/models/base/modeling_acestep_v15_base.py
  → class AceStepTimbreEncoder          # Encodes acoustic features into timbre vector
  → class AceStepConditionGenerationModel
      → prepare_condition(
            refer_audio_acoustic_hidden_states_packed,  # ← timbre comes in here
            refer_audio_order_mask,
            ...
        )
```

**Flow:** Reference audio → VAE acoustic encoder → TimbreEncoder → timbre hidden states → injected into DiT cross-attention as conditioning signal alongside text/lyrics.

### 2.2 Current Reference Audio Flow (already working)

```python
# In inference.py / handler.py:
# 1. Load reference audio
refer_wav, sr = torchaudio.load(refer_audio_path)
# 2. Encode through VAE
refer_acoustic = vae.encode(refer_wav)   # shape: [1, T, acoustic_dim]
# 3. Pack for TimbreEncoder
refer_packed = pack_acoustic_features(refer_acoustic)
# 4. Inject into generation
output = model.generate(
    ...,
    refer_audio_acoustic_hidden_states_packed=refer_packed,
    refer_audio_order_mask=order_mask,
)
```

**The Singer Library is essentially: precompute step 2-3 once per singer → save to disk → load at inference instead of reprocessing the raw audio every time.**

---

## 3. Singer Adapter Types

Two complementary approaches, from simple to complex:

### Type A — Timbre Embedding (Fast, Lightweight)
- **What it is:** A precomputed tensor `.pt` file containing the output of `TimbreEncoder` for a given voice sample
- **Size:** ~1-5 MB per singer
- **Training required:** NO — just encode an acapella/vocal sample
- **Quality:** Good for general timbre direction. Not a clone.
- **Use:** Inject directly as `refer_audio_acoustic_hidden_states_packed`

### Type B — Voice LoRA Adapter (Slow, High Quality)
- **What it is:** A LoRA fine-tuned specifically on acapella vocals of one singer, targeting the timbre-related attention layers in the DiT
- **Size:** ~50-200 MB (same as music LoRA)
- **Training required:** YES — needs 10-30 minutes of clean acapella audio
- **Quality:** Strong stylistic adherence to the singer's phrasing, melodic tendencies, and vocal character
- **Use:** Loaded as a LoRA on top of the base model, stacked with or without a music-style LoRA

### Type C — Combined (Type A + Type B together)
- Type B LoRA for vocal style/character
- Type A embedding for real-time timbre injection at inference
- **Maximum fidelity** — closest to what commercial products do

---

## 4. File Structure

```
singers/                              ← Singer Library root (analogous to lora_library/)
  ├── my_voice/
  │   ├── singer.json                 ← Metadata
  │   ├── timbre_embedding.pt         ← Type A: precomputed TimbreEncoder output
  │   ├── lora_adapter.safetensors    ← Type B: voice LoRA (optional)
  │   ├── reference_audio.wav         ← Original clean source (30-60s acapella)
  │   └── preview.mp3                 ← Short generated sample using this voice
  │
  ├── female_sensual_reggaeton/
  │   ├── singer.json
  │   ├── timbre_embedding.pt
  │   └── reference_audio.wav
  │
  └── male_trap_raspy/
      ├── singer.json
      ├── timbre_embedding.pt
      ├── lora_adapter.safetensors
      └── reference_audio.wav
```

### singer.json schema

```json
{
  "name": "My Voice",
  "id": "my_voice",
  "version": "1.0",
  "created_at": "2026-02-21T00:00:00",
  "adapter_type": "embedding+lora",
  "description": "Warm overdriven male voice, breathy delivery, reggaeton style",
  "vocal_style_tags": ["male", "breathy", "warm", "reggaeton", "melodic"],
  "language": "es",
  "source_duration_seconds": 180,
  "source_files": ["acapella_01.wav", "acapella_02.wav"],
  "base_model_compatible": ["acestep-v15-turbo", "acestep-v15-sft"],
  "embedding_file": "timbre_embedding.pt",
  "lora_file": "lora_adapter.safetensors",
  "lora_rank": 64,
  "lora_alpha": 128,
  "target_layers": ["timbre_attention", "cross_attention"],
  "strength_recommended": 0.7,
  "notes": "Trained from 3 minutes of clean acapella. Works best with reggaeton/trap LoRAs."
}
```

---

## 5. Timbre Embedding Extraction Script

### 5.1 Script: `extract_singer_embedding.py`

Location: `ACE-Step-1.5_/scripts/extract_singer_embedding.py`

```python
"""
Singer Timbre Embedding Extractor
Extracts and saves TimbreEncoder output from acapella audio files.
No training required — inference-time embedding precomputation.

Usage:
    python extract_singer_embedding.py \
        --audio_paths acapella_01.wav acapella_02.wav \
        --output_dir singers/my_voice \
        --name "My Voice" \
        --checkpoint_dir checkpoints/

The script:
1. Loads all audio files provided
2. Runs each through VAE acoustic encoder
3. Runs acoustic features through AceStepTimbreEncoder
4. Averages embeddings across all files (ensemble)
5. Saves result as timbre_embedding.pt + singer.json
"""
import torch
import torchaudio
import json
import os
import argparse
from pathlib import Path
from datetime import datetime
from acestep.handler import AceStepHandler

def extract_timbre_embedding(
    audio_paths: list[str],
    checkpoint_dir: str,
    output_dir: str,
    singer_name: str,
    config_path: str = "acestep-v15-turbo",
    device: str = "auto",
) -> dict:
    """
    Extract and average timbre embeddings from one or more audio files.
    
    Args:
        audio_paths: List of paths to clean acapella audio files
        checkpoint_dir: Path to ACE-Step checkpoints directory
        output_dir: Where to save the singer adapter
        singer_name: Human-readable name for this singer
        config_path: Which ACE-Step model to use
        device: CUDA device or "auto"
    
    Returns:
        Dict with metadata about the extracted embedding
    """
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    
    # Initialize handler (loads VAE + TimbreEncoder only, not full DiT)
    handler = AceStepHandler()
    handler.initialize_service(
        project_root=str(Path(checkpoint_dir).parent),
        config_path=config_path,
        device=device,
        load_dit=False,        # Don't need DiT for embedding extraction
        load_lm=False,         # Don't need LM either
        offload_to_cpu=False,
    )
    
    model = handler.model
    vae = model.vae
    timbre_encoder = model.timbre_encoder
    
    all_embeddings = []
    total_duration = 0.0
    
    for audio_path in audio_paths:
        print(f"  Processing: {audio_path}")
        
        # Load audio
        wav, sr = torchaudio.load(audio_path)
        if wav.shape[0] > 1:
            wav = wav.mean(0, keepdim=True)  # Stereo → mono
        if sr != 44100:
            wav = torchaudio.functional.resample(wav, sr, 44100)
        
        duration = wav.shape[-1] / 44100
        total_duration += duration
        print(f"    Duration: {duration:.1f}s")
        
        # Encode through VAE
        wav = wav.unsqueeze(0).to(device)  # [1, 1, T]
        with torch.no_grad():
            acoustic_features = vae.encode_acoustic(wav)  # [1, T', acoustic_dim]
            
            # Run through TimbreEncoder
            timbre_out = timbre_encoder(
                acoustic_features,
                output_hidden_states=True
            )
            # Use the pooled output as the timbre embedding
            embedding = timbre_out.last_hidden_state.mean(dim=1)  # [1, hidden_dim]
            all_embeddings.append(embedding.cpu())
    
    # Average all embeddings (ensemble for robustness)
    final_embedding = torch.stack(all_embeddings, dim=0).mean(dim=0)  # [1, hidden_dim]
    print(f"\n  Embedding shape: {final_embedding.shape}")
    print(f"  Total source audio: {total_duration:.1f}s")
    
    # Save
    os.makedirs(output_dir, exist_ok=True)
    
    embedding_path = os.path.join(output_dir, "timbre_embedding.pt")
    torch.save({
        "embedding": final_embedding,
        "shape": list(final_embedding.shape),
        "model_config": config_path,
        "num_source_files": len(audio_paths),
        "total_duration_seconds": total_duration,
        "extraction_date": datetime.now().isoformat(),
    }, embedding_path)
    print(f"  Saved: {embedding_path}")
    
    # Generate singer.json
    singer_id = os.path.basename(output_dir)
    metadata = {
        "name": singer_name,
        "id": singer_id,
        "version": "1.0",
        "created_at": datetime.now().isoformat(),
        "adapter_type": "embedding",
        "description": f"Voice timbre extracted from {len(audio_paths)} audio file(s)",
        "vocal_style_tags": [],
        "language": "unknown",
        "source_duration_seconds": total_duration,
        "source_files": [os.path.basename(p) for p in audio_paths],
        "base_model_compatible": [config_path],
        "embedding_file": "timbre_embedding.pt",
        "lora_file": None,
        "strength_recommended": 0.7,
        "notes": "Auto-generated. Edit vocal_style_tags and description manually.",
    }
    
    meta_path = os.path.join(output_dir, "singer.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {meta_path}")
    
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract singer timbre embedding")
    parser.add_argument("--audio_paths", nargs="+", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--checkpoint_dir", default="checkpoints")
    parser.add_argument("--config_path", default="acestep-v15-turbo")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()
    
    result = extract_timbre_embedding(
        audio_paths=args.audio_paths,
        checkpoint_dir=args.checkpoint_dir,
        output_dir=args.output_dir,
        singer_name=args.name,
        config_path=args.config_path,
        device=args.device,
    )
    print(f"\nDone! Singer '{result['name']}' saved to {args.output_dir}")
```

---

## 6. Voice LoRA Training (Type B)

### 6.1 Dataset Preparation for Voice Training

Voice LoRA training uses the **same pipeline as music LoRA training** but with acapella files and voice-specific captions:

```
singers/training_data/my_voice/
  ├── acapella_01.wav    ← Clean vocal, no music/reverb/effects
  ├── acapella_02.wav    ← Multiple takes = more variety = better generalization
  ├── acapella_03.wav
  └── ...                ← Minimum: 10 files × 30s = 5 minutes. Ideal: 30 min+
```

**Audio requirements:**
- Clean/dry acapella — no reverb, no compression, no music underneath
- Consistent microphone and recording conditions
- Various pitches, dynamics, emotional intensities
- Multiple songs preferred over one long song
- Format: WAV/FLAC, 44100Hz, stereo or mono

**Caption format for voice training:**
```
[Singer name], [vocal characteristics], [delivery style], [recording quality]

Examples:
"breathy female voice, sensual and languid delivery, smooth and effortless, studio quality"
"raspy male baritone, aggressive rap delivery, rhythmic flow, strong chest resonance"
"clean tenor, melodic hooks with auto-tune effect, modern reggaeton style, bright timbre"
```

### 6.2 Gradio Training Config for Voice LoRA

Same as music LoRA but with different target layers:

```python
# Key differences from music LoRA training:
target_layers = [
    "timbre_attention",     # Timbre encoder attention — most important for voice
    "cross_attention_kv",   # Key/Value in cross-attention where timbre is injected
    # NOT "mlp" — MLP layers encode musical style, not vocal timbre
]

# Recommended hyperparameters for voice LoRA:
rank = 32           # Lower rank than music LoRA (voice is lower-dimensional space)
alpha = 64
dropout = 0.05
lr = 1e-4           # Lower LR — voice is more sensitive to overfitting
epochs = 500        # More epochs but with lower LR
batch_size = 1
gradient_accumulation = 4
shift = 1.0         # Use SFT-compatible shift (not turbo shift=3)
```

### 6.3 Custom Tag for Singer Activation

Same system as music LoRA `custom_tag`. Example:
- Music LoRA tag: `Walki-bass`
- Voice LoRA tag: `WalkiVoice` or `$VOICE_NAME$`

At generation time, both tags can be combined:
```
Caption: "Walki-bass, WalkiVoice, reggaeton track with aggressive male vocals..."
```
→ Music LoRA activates for production style  
→ Voice LoRA activates for vocal timbre  

---

## 7. Inference Integration

### 7.1 Modified inference.py / handler.py

```python
def load_singer_adapter(
    singer_dir: str,
    model,
    device: str,
    strength: float = 0.7,
) -> dict:
    """
    Load a singer adapter (Type A embedding and/or Type B LoRA).
    
    Args:
        singer_dir: Path to singer folder (e.g., singers/my_voice/)
        model: AceStepConditionGenerationModel instance
        device: Target device
        strength: Timbre injection strength (0.0-1.0)
    
    Returns:
        dict with loaded components ready for generation
    """
    meta_path = os.path.join(singer_dir, "singer.json")
    with open(meta_path) as f:
        meta = json.load(f)
    
    result = {"metadata": meta, "type": meta["adapter_type"]}
    
    # Type A: Load precomputed timbre embedding
    if meta.get("embedding_file"):
        emb_path = os.path.join(singer_dir, meta["embedding_file"])
        saved = torch.load(emb_path, map_location=device)
        embedding = saved["embedding"] * strength   # Scale by strength
        result["timbre_embedding"] = embedding
        print(f"  Loaded timbre embedding: {embedding.shape}")
    
    # Type B: Load voice LoRA
    if meta.get("lora_file"):
        lora_path = os.path.join(singer_dir, meta["lora_file"])
        # Load LoRA weights (same mechanism as music LoRAs)
        from peft import PeftModel
        model = PeftModel.from_pretrained(
            model,
            lora_path,
            adapter_name=f"singer_{meta['id']}"
        )
        result["lora_loaded"] = True
        print(f"  Loaded voice LoRA: {lora_path}")
    
    return result


def generate_with_singer(
    handler,
    singer_dir: str,
    prompt: str,
    lyrics: str,
    music_lora_path: str = None,
    singer_strength: float = 0.7,
    **generation_kwargs
):
    """
    Generate music with a specific singer voice.
    Optionally stacks with a music-style LoRA.
    
    Example:
        generate_with_singer(
            handler,
            singer_dir="singers/my_voice",
            prompt="Walki-bass, dark reggaeton, aggressive flow",
            lyrics="[Chorus]\nYo soy el mejor...",
            music_lora_path="lora_library/Urban_Walki_v3_turbo/adapter.safetensors",
            singer_strength=0.8,
        )
    """
    # 1. Load singer adapter
    singer = load_singer_adapter(singer_dir, handler.model, handler.device, singer_strength)
    
    # 2. Load music LoRA if provided (stacked on top of voice LoRA)
    if music_lora_path:
        handler.load_lora(music_lora_path)
    
    # 3. Inject timbre embedding into generation params
    extra_kwargs = {}
    if "timbre_embedding" in singer:
        extra_kwargs["refer_audio_precomputed_embedding"] = singer["timbre_embedding"]
    
    # 4. Generate
    result = handler.generate(
        prompt=prompt,
        lyrics=lyrics,
        **extra_kwargs,
        **generation_kwargs,
    )
    
    return result
```

### 7.2 Required Model Changes

In `AceStepConditionGenerationModel.prepare_condition()`, add support for precomputed embeddings:

```python
# In modeling_acestep_v15_base.py and modeling_acestep_v15_turbo.py
# Add new parameter: refer_audio_precomputed_embedding

@torch.no_grad()
def prepare_condition(
    self,
    text_hidden_states,
    text_attention_mask,
    lyric_hidden_states,
    lyric_attention_mask,
    refer_audio_acoustic_hidden_states_packed=None,  # existing: raw packed features
    refer_audio_order_mask=None,
    refer_audio_precomputed_embedding=None,           # NEW: precomputed timbre embedding
    hidden_states=None,
    attention_mask=None,
    ...
):
    # If precomputed embedding provided, skip TimbreEncoder processing
    if refer_audio_precomputed_embedding is not None:
        timbre_hidden_states = refer_audio_precomputed_embedding.to(self.device)
    elif refer_audio_acoustic_hidden_states_packed is not None:
        # Existing path: encode on-the-fly
        timbre_hidden_states = self.timbre_encoder(
            refer_audio_acoustic_hidden_states_packed,
            refer_audio_order_mask,
        )
    else:
        timbre_hidden_states = None
    
    # Rest of conditioning pipeline unchanged...
```

---

## 8. UI Integration

### 8.1 ace-step-ui (port 8001) — React/TypeScript

**New component:** `SingerSelector.tsx`

```typescript
// ace-step-ui/components/SingerSelector.tsx

interface Singer {
  id: string;
  name: string;
  description: string;
  vocal_style_tags: string[];
  language: string;
  adapter_type: "embedding" | "lora" | "embedding+lora";
  strength_recommended: number;
  preview_url?: string;
}

interface SingerSelectorProps {
  onSelect: (singer: Singer | null, strength: number) => void;
  selectedSingerId?: string;
}

export function SingerSelector({ onSelect, selectedSingerId }: SingerSelectorProps) {
  const [singers, setSingers] = useState<Singer[]>([]);
  const [strength, setStrength] = useState(0.7);
  
  useEffect(() => {
    // Fetch available singers from backend
    fetch("/api/singers").then(r => r.json()).then(setSingers);
  }, []);
  
  return (
    <div className="singer-selector">
      <label>Singer Voice</label>
      <select onChange={e => {
        const singer = singers.find(s => s.id === e.target.value) || null;
        onSelect(singer, strength);
      }}>
        <option value="">None (model default)</option>
        {singers.map(s => (
          <option key={s.id} value={s.id}>
            {s.name} [{s.vocal_style_tags.slice(0, 3).join(", ")}]
          </option>
        ))}
      </select>
      
      {selectedSingerId && (
        <EditableSlider
          label="Voice Strength"
          value={strength}
          min={0} max={1} step={0.05}
          onChange={v => { setStrength(v); onSelect(singers.find(s => s.id === selectedSingerId)!, v); }}
        />
      )}
    </div>
  );
}
```

**Backend route:** `ace-step-ui/server/src/routes/singers.ts`

```typescript
// GET /api/singers — List all available singers
// GET /api/singers/:id — Get singer metadata
// POST /api/singers/extract — Extract embedding from uploaded audio
// DELETE /api/singers/:id — Remove singer adapter

router.get("/", async (req, res) => {
  const singersDir = path.join(WORKSPACE_ROOT, "singers");
  const singers = await scanSingerLibrary(singersDir);
  res.json(singers);
});

router.post("/extract", upload.array("audio"), async (req, res) => {
  // Trigger extract_singer_embedding.py with uploaded files
  // Returns progress via SSE stream
});
```

**Integration in `CreatePanel.tsx`:**

```typescript
// Add SingerSelector between LoRA selector and Generate button
<SingerSelector
  onSelect={(singer, strength) => {
    setGenerationParams(prev => ({
      ...prev,
      singerAdapterId: singer?.id ?? null,
      singerStrength: strength,
    }));
  }}
  selectedSingerId={generationParams.singerAdapterId}
/>
```

### 8.2 Gradio UI (port 7860)

**New Gradio tab: "Singer Library"**

Location: `ACE-Step-1.5_/acestep/gradio_ui/tabs/singer_library_tab.py`

```python
import gradio as gr
import os
import json
from pathlib import Path

def create_singer_library_tab(handler, singers_dir="singers"):
    
    with gr.Tab("🎤 Singer Library"):
        
        gr.Markdown("## Singer Voice Adapters")
        gr.Markdown(
            "Extract voice timbre from acapella recordings. "
            "Use the extracted singer in any generation by selecting it below."
        )
        
        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("### Extract New Singer")
                
                audio_input = gr.File(
                    label="Acapella Audio Files (WAV/FLAC, clean vocals only)",
                    file_count="multiple",
                    file_types=[".wav", ".flac", ".mp3"],
                )
                singer_name_input = gr.Textbox(
                    label="Singer Name",
                    placeholder="e.g. My Voice, Female Sensual, Male Trap"
                )
                singer_description = gr.Textbox(
                    label="Description (optional)",
                    placeholder="Short description of the vocal style",
                    lines=2,
                )
                vocal_tags_input = gr.Textbox(
                    label="Style Tags (comma-separated)",
                    placeholder="male, breathy, reggaeton, melodic"
                )
                language_input = gr.Dropdown(
                    label="Primary Language",
                    choices=["es", "en", "pt", "fr", "unknown"],
                    value="es",
                )
                extract_btn = gr.Button("Extract Timbre Embedding", variant="primary")
                extract_status = gr.Textbox(label="Status", interactive=False)
                
            with gr.Column(scale=1):
                gr.Markdown("### Available Singers")
                
                singers_table = gr.Dataframe(
                    headers=["ID", "Name", "Type", "Tags", "Duration"],
                    label="Singer Library",
                    interactive=False,
                )
                refresh_btn = gr.Button("Refresh List")
                
                selected_singer = gr.Dropdown(
                    label="Singer to Test/Delete",
                    choices=[],
                )
                singer_strength = gr.Slider(
                    label="Voice Strength",
                    minimum=0.0, maximum=1.0, step=0.05, value=0.7,
                )
                
                with gr.Row():
                    test_btn = gr.Button("Test Singer (quick gen)")
                    delete_btn = gr.Button("Delete Singer", variant="stop")
                
                test_audio = gr.Audio(label="Test Output", type="filepath")
        
        # Wire up events
        extract_btn.click(
            fn=extract_singer_from_gradio,
            inputs=[audio_input, singer_name_input, singer_description,
                    vocal_tags_input, language_input],
            outputs=[extract_status],
        )
        
        refresh_btn.click(
            fn=lambda: load_singer_table(singers_dir),
            outputs=[singers_table, selected_singer],
        )


def extract_singer_from_gradio(audio_files, name, description, tags, language):
    """Called when user clicks Extract in Gradio."""
    if not audio_files or not name:
        return "Error: Provide at least one audio file and a name."
    
    output_dir = os.path.join("singers", name.lower().replace(" ", "_"))
    audio_paths = [f.name for f in audio_files]
    
    try:
        from scripts.extract_singer_embedding import extract_timbre_embedding
        meta = extract_timbre_embedding(
            audio_paths=audio_paths,
            checkpoint_dir="checkpoints",
            output_dir=output_dir,
            singer_name=name,
        )
        # Update JSON with user-provided extras
        meta["description"] = description
        meta["vocal_style_tags"] = [t.strip() for t in tags.split(",") if t.strip()]
        meta["language"] = language
        with open(os.path.join(output_dir, "singer.json"), "w") as f:
            json.dump(meta, f, indent=2)
        
        return f"✅ Singer '{name}' extracted successfully!\nSaved to: {output_dir}"
    except Exception as e:
        return f"❌ Error: {str(e)}"


def load_singer_table(singers_dir):
    """Scan singers/ directory and return table data + dropdown choices."""
    rows = []
    choices = []
    
    if not os.path.exists(singers_dir):
        return rows, choices
    
    for item in sorted(os.listdir(singers_dir)):
        meta_path = os.path.join(singers_dir, item, "singer.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                meta = json.load(f)
            rows.append([
                meta["id"],
                meta["name"],
                meta["adapter_type"],
                ", ".join(meta.get("vocal_style_tags", [])[:4]),
                f"{meta.get('source_duration_seconds', 0):.0f}s",
            ])
            choices.append(meta["id"])
    
    return rows, gr.Dropdown(choices=choices)
```

**Integration in main Gradio app:**

```python
# In ACE-Step-1.5_/acestep/gradio_ui/app.py (or equivalent):
# Add singer_library_tab to the tab list

with gr.Blocks() as demo:
    with gr.Tabs():
        create_generate_tab(handler)
        create_training_tab(handler)
        create_singer_library_tab(handler)   # ← NEW
```

**Singer selector in Generate tab:**

```python
# Add to the existing generation form:
singer_selector = gr.Dropdown(
    label="🎤 Singer Voice (optional)",
    choices=["None"] + get_available_singers(),
    value="None",
    info="Select a voice adapter from your Singer Library"
)
singer_strength_slider = gr.Slider(
    label="Voice Strength",
    minimum=0.0, maximum=1.0, step=0.05, value=0.7,
    visible=False,  # Show only when singer is selected
)
singer_selector.change(
    fn=lambda s: gr.Slider(visible=(s != "None")),
    inputs=[singer_selector],
    outputs=[singer_strength_slider],
)
```

---

## 9. Training Pipeline Integration

### 9.1 Gradio Training Tab — Voice LoRA Mode

In the existing Step 1 (Dataset Settings), add:

```python
training_mode = gr.Radio(
    label="Training Mode",
    choices=["Music Style LoRA", "Voice Timbre LoRA"],
    value="Music Style LoRA",
)
```

When **"Voice Timbre LoRA"** is selected:
- Target layers default to `timbre_attention, cross_attention_kv` (not MLP)
- Rank defaults to 32 (not 64)
- Caption template changes to vocal description format
- `all_instrumental` is forced to False
- After training, option to also extract timbre embedding and save to `singers/`

### 9.2 Required Hyperparameter Adjustments

```python
VOICE_LORA_DEFAULTS = {
    "rank": 32,
    "alpha": 64,
    "dropout": 0.05,
    "lr": 1e-4,
    "epochs": 500,
    "batch_size": 1,
    "gradient_accumulation": 4,
    "shift": 1.0,                       # SFT shift, not turbo
    "target_layers": [
        "timbre_attention",             # TimbreEncoder attention
        "cross_attention_q",            # Query in cross-attention
        "cross_attention_kv",           # Key/Value in cross-attention
    ],
    "cfg_ratio": 0.15,
    "save_every": 50,
}
```

---

## 10. API Changes (port 8001)

New endpoints needed in `acestep/api_server.py`:

```python
# GET  /v1/singers                    — List all singer adapters
# POST /v1/singers/extract            — Extract embedding from audio
# GET  /v1/singers/{id}               — Get singer metadata
# DELETE /v1/singers/{id}             — Delete singer adapter

# Modified existing:
# POST /v1/generate                   — Add optional singer_id and singer_strength params

class GenerationRequest(BaseModel):
    prompt: str
    lyrics: str = ""
    # ... existing params ...
    singer_id: Optional[str] = None          # NEW: ID from singers/ directory
    singer_strength: float = 0.7             # NEW: Timbre injection strength
    lora_path: Optional[str] = None          # Existing music LoRA
    # If both singer_id and lora_path provided → stacked (voice + style)
```

---

## 11. Implementation Roadmap

### Phase 1 — Type A (Embedding only, read: fastest to build)
- [ ] `scripts/extract_singer_embedding.py`
- [ ] `singers/` directory structure
- [ ] `singer.json` schema
- [ ] Model change: `refer_audio_precomputed_embedding` parameter in `prepare_condition()`
- [ ] Gradio "Singer Library" tab (extract + list + test)
- [ ] ace-step-ui `SingerSelector` component
- [ ] API endpoint `GET /v1/singers` + modified `POST /v1/generate`

**Estimated complexity:** Medium — mostly Python scripting + UI components, no new training

### Phase 2 — Type B (Voice LoRA training)
- [ ] Training mode switch in Gradio training tab
- [ ] Voice-specific hyperparameter presets
- [ ] Target layer configuration for vocal timbre
- [ ] Export voice LoRA to `singers/` folder post-training

**Estimated complexity:** Medium-High — modifies training pipeline

### Phase 3 — Combined + Quality Improvements
- [ ] Type A + Type B stacking at inference
- [ ] Voice strength interpolation (morph between singers)
- [ ] Preview generation per singer
- [ ] Singer sharing format (portable `.singeradapter` bundle)

---

## 12. Open Questions for ACE-Step Team

1. **TimbreEncoder output dimension**: What is the exact shape of the timbre vector injected into cross-attention? (Needed to verify embedding compatibility across model versions)

2. **Timbre injection strength**: Is there an existing mechanism to scale the timbre conditioning, or would it need to be added explicitly?

3. **Multi-singer interpolation**: Is it feasible to interpolate between two timbre embeddings at generation time? (Would require testing)

4. **Voice LoRA target layers**: Which specific attention layers have the most influence on vocal timbre vs musical style?

5. **Minimum viable acapella duration**: What is the minimum clean vocal audio needed for a meaningful timbre embedding? (Hypothesis: 60 seconds minimum, 5+ minutes ideal)

---

## 13. Potential GitHub Contribution

This feature could be submitted as a PR to the upstream `ACE-Step/ACE-Step-1.5` repository:

- `scripts/extract_singer_embedding.py` — standalone utility, easy to review
- `singers/` directory convention — analogous to existing patterns
- Model change in `prepare_condition()` — backwards compatible (new optional param)
- Gradio tab — optional UI addition

**Suggested PR title:** `feat: Singer Library — voice timbre adapter system (Type A embedding)`

Start with Type A only (no training required) for a clean, focused PR. Type B (training) can be a follow-up PR.

---

*Spec authored by Walki-bass, 2026-02-21. Implementation to be assigned to AI coding agent with full context of ace-step-ui and ACE-Step-1.5 codebases.*
