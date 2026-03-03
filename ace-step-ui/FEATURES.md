# ProdIA pro V0.1.0 — Features & Status

> Last updated: 2026-03-01

---

## Legend

| Icon | Meaning |
|------|---------|
| ✅ | Stable / Working |
| 🧪 | Beta / Experimental |
| 🚧 | In Progress |
| 📋 | Planned |

---

## New Features (MAX Fork)

### ✅ Branding — ProdIA pro V0.1.0

All user-facing text has been renamed from "ACE-Step UI" to "ProdIA pro".

- Page title, meta tags, sidebar, translations (EN/ZH/JA/KO)
- `package.json` name and version updated

---

### ✅ Audio Metadata Tagging (ID3)

Generated MP3 files are automatically tagged with metadata before being saved.

**Tags embedded:**
| Tag | Value |
|-----|-------|
| Title | Song title |
| Artist | Your username |
| Album | "ProdIA pro" |
| BPM | Detected or user-specified BPM |
| Initial Key | Musical key (e.g. "G major") |
| Genre | Style/genre tags used for generation |
| Encoded By | "ProdIA pro V0.1.0" |
| Comment | Summary of generation params |

**How it works:**
- Automatic — no action needed. Every newly generated MP3 gets tagged.
- Tags are written server-side using `node-id3` before the file is stored.
- FLAC files pass through untagged for now (FLAC tagging planned).

**Files involved:**
- `server/src/services/audioMetadata.ts` — tagging utility
- `server/src/routes/generate.ts` — integration point

---

### ✅ Edit Metadata (Song Context Menu)

Edit a song's metadata after generation directly from the song list.

**How to use:**
1. Right-click (or click `⋯`) on any song you own
2. Select **"Edit Metadata"** (Tag icon)
3. Modify any field:
   - **Title**
   - **Style / Genre**
   - **BPM** (30–300)
   - **Key** (dropdown: C major, A minor, F# minor, etc.)
   - **Time Signature** (2/4, 3/4, 4/4, 6/8)
4. Click **Save**

**Notes:**
- Only available for songs you own (isOwner)
- Changes are saved to the database immediately
- The song list and right sidebar update in real-time
- Does NOT re-tag the audio file — only updates the database record

**Files involved:**
- `components/EditMetadataModal.tsx` — the modal UI
- `components/SongDropdownMenu.tsx` — menu item
- `server/src/routes/songs.ts` — PATCH endpoint accepts `bpm`, `key_scale`, `time_signature`

---

### ✅ LoRA Quick Unload Button

Unload all active LoRA adapters with one click, even when the LoRA panel is collapsed.

**How to use:**
1. When a LoRA is loaded, a **green pulsing dot** appears next to "LoRA" in the header
2. A red **"Unload"** button appears to the right of the LoRA section header
3. Click it to immediately unload all LoRA adapters from the model

**Why this exists:**
- On page refresh, previously loaded LoRAs remain active on the backend
- This button lets you quickly clear them without expanding the LoRA panel

**Files involved:**
- `components/CreatePanel.tsx` — LoRA header section (~line 2800)

---

### ✅ Time Signature Dropdown Labels

The Time Signature field now shows proper musical notation instead of raw numbers.

| Display | Value sent to backend |
|---------|----------------------|
| Auto | (empty) |
| 2/4 | 2 |
| 3/4 | 3 |
| 4/4 | 4 |
| 6/8 | 6 |

Available in both Simple and Expert modes.

---

### ✅ Key Scale Dropdown Fix

The Key field correctly captures both note and mode (e.g. "G major", "C# minor") and properly extracts the value from `onChange` events in both modes.

---

### 🧪 Vocal Separation (Demucs)

Separate vocals and instrumentals from any audio file using Facebook's Demucs model.

**How to use:**
1. In the audio section, switch to the **Vocal** tab
2. Two options:
   - **"Separate from Library"** — pick a song from your library; Demucs will extract the vocals
   - **"Upload Acapella"** — upload a pre-separated vocal file directly
3. Wait for separation to complete (progress shown in UI)
4. The separated vocal becomes available as a reference

**Options:**
- **"Use vocal as Reference"** checkbox — auto-applies the separated vocal as reference audio
- **"Use instrumental as Source/Cover"** checkbox — auto-applies the instrumental for cover mode

**VRAM safety:**
- Generation is **disabled** while Demucs is running (they share VRAM)
- The generate button shows "Separating audio..." during separation

**Backend:**
- Uses `htdemucs_ft` model (high quality)
- Python script: `server/scripts/separate_audio.py`
- API endpoint: `POST /api/training/separate-stems`

**Status:** Beta — works but may need tuning for edge cases.

**Files involved:**
- `server/scripts/separate_audio.py` — Demucs wrapper
- `server/src/routes/training.ts` — API endpoint
- `components/CreatePanel.tsx` — Vocal tab UI

---

### 🧪 Prepare for Training

Quick button to prepare a song for LoRA training data.

**How to use:**
1. Right-click any song → **"Prepare for Training"**
2. A modal opens with the song details
3. Configure training parameters

**Status:** Beta — UI exists but training pipeline integration is experimental.

**Files involved:**
- `components/PrepareTrainingModal.tsx`

---

### ✅ Generation Config Viewer

View the exact parameters used to generate any song.

**How to use:**
1. Right-click any song → **"Generation Config"**
2. A modal shows all parameters: model, steps, seed, BPM, key, etc.

**Files involved:**
- `components/GenerationConfigModal.tsx`

---

### ✅ Cover Mode Bugfix

Fixed a bug where `taskType` remained set to `'cover'` after clearing the source audio, causing generation to fail with: `task_type='cover' requires a source audio or audio codes`.

**Fix:**
- Clearing source audio now resets `taskType` to `'text2music'`
- Safety guards in both Simple and Expert mode generate calls auto-correct `taskType` if no source audio exists

---

## Base Features (from upstream ACE-Step UI)

All original features remain fully functional:

- ✅ Full song generation (text2music, cover, repainting)
- ✅ Instrumental mode
- ✅ Custom BPM, key, duration, inference steps
- ✅ AI Enhance & Thinking Mode (LLM-powered)
- ✅ Batch generation & bulk queue
- ✅ Reference audio & source audio
- ✅ LoRA loading/unloading
- ✅ Spotify-inspired UI with dark/light mode
- ✅ Library management (search, filter, likes, playlists)
- ✅ Audio editor (AudioMass integration)
- ✅ Stem extraction (Demucs web UI)
- ✅ Video generator (Pexels backgrounds)
- ✅ Gradient album covers (procedural, no internet)
- ✅ LAN access
- ✅ Multi-language (EN, ZH, JA, KO)
- ✅ SQLite local-first database

---

### ✅ Floating LoRA Manager Panel

A professional floating, draggable panel for managing all LoRA adapters — inspired by Suno's UI.

**How to use:**
1. In Custom/Expert mode, click the **purple database icon** next to the LoRA section header
2. A floating panel appears that you can **drag anywhere** on screen
3. Browse all available LoRAs with search, favorites, and variant/checkpoint selection
4. **Right-click** any LoRA for context menu options

**Features:**
| Feature | Description |
|---------|-------------|
| Drag & Drop | Grab the header bar to move the panel anywhere on screen |
| Search | Filter LoRAs by name, trigger tag, or base model |
| Favorites | Click ★ to mark favorites — they always appear first |
| Base Model Badges | Auto-detects `turbo`, `sft`, `base` from adapter config |
| Variant/Checkpoint Selection | Expand any LoRA to see all available checkpoints (final, epoch_X) |
| Right-Click Context Menu | Activate, Add/Remove Favorite, Open Folder in OS Explorer |
| Activation Confirmation | Dialog with LoRA scale slider (0–1.0 max) before loading |
| Active LoRA Controls | ON/OFF toggle, Unload button, scale slider, trigger tag position |
| Green Highlight | Active LoRA is highlighted in green with a pulsing dot |

**Functions added:**

| Function | File | Description |
|----------|------|-------------|
| `LoraManager` component | `components/LoraManager.tsx` | Main floating panel React component |
| `getModelType()` | `components/LoraManager.tsx` | Detects turbo/sft/base from `baseModel` string |
| `loadFavorites()` / `saveFavorites()` | `components/LoraManager.tsx` | Persist favorites to localStorage |
| `handleLoraLoadFromManager()` | `components/CreatePanel.tsx` | Loads a LoRA by path/name/variant from the Manager panel |
| `openLoraFolder()` | `services/api.ts` | Frontend API method for opening folders |
| `POST /api/lora/open-folder` | `server/src/routes/lora.ts` | Backend endpoint: opens LoRA folder in OS file explorer (Windows/macOS/Linux) |

**Files involved:**
- `components/LoraManager.tsx` — Full floating panel component (new file)
- `components/CreatePanel.tsx` — Toggle button, state wiring, `handleLoraLoadFromManager()`
- `services/api.ts` — `openLoraFolder()` API method
- `server/src/routes/lora.ts` — `POST /api/lora/open-folder` endpoint

---

### ✅ LoRA Scale Slider Limited to 1.0

The LoRA scale slider in both the main panel and the LoRA Manager is now capped at **1.0** (was 5.0).

**Reason:** LoRA scales above 1.0 have no useful effect and can produce artifacts.

**Changes:**
- `components/CreatePanel.tsx` — `EditableSlider` max changed from 5 → 1, step from 0.1 → 0.05
- `components/LoraManager.tsx` — Scale slider in activation dialog and active controls: max=1, step=0.05

---

### ✅ Extended Preset System (v2)

The preset save/load system now captures **all** generation parameters, not just the basic ones.

**New parameters saved in presets (v2):**

| Parameter | Type | Default |
|-----------|------|---------|
| `instruction` | string | `'Fill the audio semantic mask...'` |
| `seed` | number | `-1` |
| `randomSeed` | boolean | `true` |
| `melodicVariation` | number | `0.0` |
| `lmRepetitionPenalty` | number | `1.0` |
| `useCotMetas` | boolean | `true` |
| `useCotCaption` | boolean | `true` |
| `useCotLanguage` | boolean | `true` |
| `useAdg` | boolean | `false` |
| `cfgIntervalStart` | number | `0.0` |
| `cfgIntervalEnd` | number | `1.0` |
| `taskType` | string | `'text2music'` |
| `repaintingStart` | number | `0` |
| `repaintingEnd` | number | `-1` |
| `audioCoverStrength` | number | `1.0` |
| `constrainedDecodingDebug` | boolean | `false` |
| `allowLmBatch` | boolean | `true` |
| `getScores` | boolean | `false` |
| `getLrc` | boolean | `false` |
| `scoreScale` | number | `0.5` |
| `lmBatchChunkSize` | number | `8` |

**Backward compatible:** Old presets without these fields load fine — defaults are used for missing values.

**Files involved:**
- `components/CreatePanel.tsx` — `Preset` interface, `savePreset()`, `loadPreset()`

---

### ✅ Backend Robustness Fixes

Several critical backend issues were identified and fixed:

**1. Gradio Client Stale Connection Auto-Reset**

| Before | After |
|--------|-------|
| Cached client never validated after initial connection | Client auto-validates after 5 minutes of inactivity |
| Stale connection caused silent failures | `isGradioAvailable()` check triggers reconnection |

**Functions modified:**
- `getGradioClient()` in `server/src/services/gradio-client.ts` — Added `lastConnectTime` tracking and `CLIENT_MAX_AGE_MS` (5 min) validation
- `resetGradioClient()` — Now also resets `lastConnectTime`

**2. Queue Deadlock Fix**

| Before | After |
|--------|-------|
| `processQueue()` set `isProcessingQueue = true` but only reset at end of loop | Wrapped in `try/finally` — flag **always** resets even if unexpected error occurs |
| Unhandled throw could permanently block the queue | Queue recovers from any error |

**Functions modified:**
- `processQueue()` in `server/src/services/acestep.ts` — Added `try/finally` wrapper

**3. Failed Job Status Marking**

| Before | After |
|--------|-------|
| Jobs that threw inside `processGeneration()` could remain in `'queued'` state | Catch block checks `job.status` and marks as `'failed'` with error message |

**Functions modified:**
- `processQueue()` catch block — Added `currentStatus` type assertion + `job.status = 'failed'` fallback

**4. Gradio Client Reset on Predict Failures**

| Before | After |
|--------|-------|
| Failed `predict()` call kept potentially broken client cached | `resetGradioClient()` called after Gradio generation failure |
| Next generation attempt would reuse broken connection | Fresh connection established for fallback/retry |

**Functions modified:**
- `processGeneration()` in `server/src/services/acestep.ts` — Added `resetGradioClient()` in catch block

**Files involved:**
- `server/src/services/gradio-client.ts` — Connection management
- `server/src/services/acestep.ts` — Queue processing and generation pipeline

---

## ACE-Step-1.5_ Backend Modifications

The following functions were added or modified in the Python backend (`ACE-Step-1.5_/acestep/`):

### ✅ LoRA Management Functions (`handler.py`)

| Function | Description |
|----------|-------------|
| `load_lora(lora_path)` | Loads a LoRA adapter into the decoder. Reads metadata, validates base model compatibility, applies adapter with PEFT, backs up base decoder to CPU for VRAM savings (~10GB). |
| `unload_lora()` | Unloads LoRA adapter, restores base decoder from CPU backup, clears VRAM. |
| `get_lora_status()` | Returns full LoRA state dict: loaded, active, scale, path, trigger_tag, tag_position, name, rank, alpha, num_layers, trainable_params. |
| `set_tag_position(mode)` | Changes trigger tag injection mode at runtime: `prepend`, `append`, or `off`. |
| `_read_lora_metadata(path)` | Reads `adapter_config.json` and `lora_metadata.json` to extract LoRA metadata (rank, alpha, base model, trigger tag, etc.). |
| `_count_lora_layers()` | Counts LoRA layers and total trainable parameters in the loaded adapter. |

### ✅ VRAM Optimization

| Feature | Description |
|---------|-------------|
| CPU Backup | Base decoder weights stored on CPU when LoRA is loaded, freeing ~10GB GPU VRAM |
| Auto-Purge | `autoPurgeVram()` runs `gc.collect()` + `torch.cuda.empty_cache()` after every generation |
| Cleanup on Unload | VRAM fully reclaimed when LoRA is unloaded or model switches |

### ✅ VRAM Diagnostic API (`api_routes.py`)

| Endpoint | Description |
|----------|-------------|
| `GET /v1/vram/diagnostic` | Deep VRAM diagnostic: scans all model components on GPU, lists sizes, detects LoRA stacking |
| `POST /v1/vram/cleanup` | Force VRAM cleanup: `gc.collect()` + `torch.cuda.empty_cache()` |

---

### ✅ LoRA List & Browse API (`server/src/routes/lora.ts`)

Complete backend for discovering and managing LoRA adapters:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lora/list` | GET | Scans `lora_library/` and `lora_output*/` directories for LoRA adapters. Returns structured list with variants, checkpoints, metadata, and base model info. |
| `/api/lora/browse` | POST | Browse arbitrary directories to find LoRA adapters. Shows adapter indicators. |
| `/api/lora/load` | POST | Load a LoRA adapter by path via Gradio backend. |
| `/api/lora/unload` | POST | Unload the current LoRA adapter. |
| `/api/lora/scale` | POST | Set LoRA scale (0–1.0). |
| `/api/lora/toggle` | POST | Enable/disable LoRA without unloading. |
| `/api/lora/status` | GET | Get current LoRA status from Gradio backend. |
| `/api/lora/tag-position` | POST | Set trigger tag injection mode. |
| `/api/lora/open-folder` | POST | Open LoRA folder in OS file explorer (cross-platform). |

**Helper functions in `lora.ts`:**

| Function | Description |
|----------|-------------|
| `scanLibrary(dir)` | Scans `lora_library/`-style directory for LoRA adapters with `adapter_config.json` |
| `scanOutputDir(dir)` | Scans `lora_output/`-style directory for training outputs with checkpoints |
| `isAdapterDir(dir)` | Checks if a directory contains a PEFT adapter |
| `readJsonSafe(path)` | Safe JSON file reader with error handling |
| `resolveAcestepDir()` | Resolves the ACE-Step base directory from env or default path |

---

### ✅ Section-by-Section Generation (`section-planner.ts`)

Generate songs section-by-section (Verse → Chorus → Bridge) for better structural alignment.

| Function | Description |
|----------|-------------|
| `planSections(lyrics)` | Parses `[Verse]`, `[Chorus]`, `[Bridge]` etc. from lyrics and creates a generation plan |
| `processSectionGeneration()` | Processes each section sequentially through the Gradio pipeline |

---

## Planned / TODO

| Feature | Priority | Notes |
|---------|----------|-------|
| 📋 Cover art in ID3 tags | Medium | Embed generated album art into MP3 files |
| 📋 FLAC metadata tagging | Low | Vorbis comments for FLAC files |
| 📋 Re-tag existing songs | Medium | Batch re-tag already generated files with current metadata |
| 📋 Audio codes import/export | Low | Share generation codes between users |
| 📋 Training pipeline integration | Medium | End-to-end LoRA training from the UI |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, TailwindCSS, Vite |
| Backend | Express.js, SQLite (better-sqlite3), node-id3 |
| AI Engine | ACE-Step 1.5 (Gradio API) |
| Audio Tools | AudioMass, Demucs, FFmpeg |
| Separation | Demucs htdemucs_ft (Python) |
