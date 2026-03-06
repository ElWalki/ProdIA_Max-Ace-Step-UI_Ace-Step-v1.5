# ProdIA Max v2 — UI

<p align="center">
  <strong>Professional AI Music Production Suite</strong><br>
  React interface for <a href="https://github.com/ElWalki/Ace-Step-MAX">Ace-Step MAX</a> (ACE-Step v1.5 engine)
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" />
  <img src="https://img.shields.io/badge/Vite-6-646cff?logo=vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript" />
  <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" />
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20ES-green" />
</p>

---

## Features

- 🎵 **Full Music Generation** — Text-to-music, covers, vocal cloning, repaint
- 🎹 **Chord Progression Composer** — Drag-and-drop + Piano Roll modal
- 🎛️ **Simple & Advanced Modes** — Quick creation or full parameter control
- 🤖 **Model Switcher** — Auto / SFT / Base / Turbo DiT model selection
- 💾 **Template System** — Save/load parameter presets (localStorage)
- 🎤 **Voice Recording** — In-app mic recording with lyrics panel
- 📚 **Song Library** — Browse, search, sort, like, context menu actions
- 🧬 **LoRA Manager** — Load, unload, adjust scale for custom models
- 🔊 **Stem Separation** — Vocals, drums, bass, other (UVR5 models)
- 📊 **GPU Monitor** — Live VRAM usage, temperature, utilization
- 💬 **AI Assistant** — Streaming chat for style/lyrics/params help
- ⚙️ **Settings** — AI providers (OpenAI, Ollama, LM Studio, OpenRouter)
- 🌍 **i18n** — English & Spanish (Chinese, German, French, Arabic planned)
- 🎨 **Dark Theme** — Professional design with accent/brand color system

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Ace-Step MAX](https://github.com/ElWalki/Ace-Step-MAX) backend running on `localhost:7860`

### Install & Run

```bash
# Clone
git clone https://github.com/ElWalki/ProdIA-Max-UI.git
cd ProdIA-Max-UI

# Install dependencies
npm install

# Development server (http://localhost:5173)
npm run dev

# Production build
npm run build
npm run preview
```

The UI connects to the backend via relative URLs (`/api/...`). In development, Vite proxies all `/api` requests to `http://localhost:7860`.

## Project Structure

```
src/
├── App.tsx                        # Root — routing, state, modals
├── main.tsx                       # Entry point — React DOM render
├── index.css                      # Global styles, Tailwind imports
├── i18n.ts                        # Translations (EN/ES)
├── types.ts                       # TypeScript interfaces & defaults
│
├── services/
│   ├── api.ts                     # 21 API endpoints (songs, generate, lora, GPU, etc.)
│   └── chordService.ts            # Chord naming & detection logic
│
├── utils/
│   └── coverArt.ts                # Procedural cover art generator (canvas)
│
├── context/
│   ├── AuthContext.tsx             # User authentication context
│   └── ResponsiveContext.tsx       # Responsive breakpoints provider
│
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx              # Header — logo, nav, language, theme, settings
│   │   └── PlayerBar.tsx           # Bottom player — playback, volume, speed, waveform
│   │
│   ├── create/
│   │   ├── CreatePanel.tsx         # Main creation — params, lyrics, model switcher, templates
│   │   ├── AudioSections.tsx       # Reference/cover/vocal audio upload tabs
│   │   ├── ChordEditor.tsx         # Chord progression composer with drag-and-drop
│   │   ├── PianoRollModal.tsx      # FL Studio-style grid for custom chords
│   │   ├── QuickParamsPanel.tsx    # Expert pinnable parameter cards
│   │   ├── GpuMiniBar.tsx          # Mini VRAM bar inside create panel
│   │   ├── LoraManager.tsx         # LoRA loading/unloading/scale control
│   │   ├── MicRecorder.tsx         # Voice recording with lyrics panel
│   │   ├── ResultsPanel.tsx        # Generation results display
│   │   ├── SectionControls.tsx     # Section tag bar ([Verse], [Chorus], etc.)
│   │   └── SongCard.tsx            # Song result card with actions
│   │
│   ├── views/
│   │   ├── LibraryView.tsx         # Song library — grid, search, sort, pagination
│   │   ├── TrainingView.tsx        # Training datasets & LoRA management
│   │   ├── ExploreView.tsx         # Genre/template discovery
│   │   └── GpuMonitorView.tsx      # Full GPU monitoring dashboard
│   │
│   ├── assistant/
│   │   └── FloatingAssistant.tsx   # Draggable AI chat — streaming, markdown, tabs
│   │
│   └── ui/
│       ├── SettingsModal.tsx       # Settings — providers, model status, about/credits
│       ├── MetadataModal.tsx       # Song metadata viewer/editor
│       ├── SongDetailPanel.tsx     # Detailed song view
│       ├── SongContextMenu.tsx     # Right-click context menu
│       ├── StemSeparator.tsx       # Stem separation modal
│       ├── CollapsibleSection.tsx  # Animated collapsible container
│       ├── SliderField.tsx         # Reusable slider with label/value
│       ├── SelectField.tsx         # Reusable dropdown select
│       ├── ToggleField.tsx         # Reusable toggle switch
│       ├── PaginationBar.tsx       # Page navigation component
│       ├── Toast.tsx               # Notification toasts
│       └── ErrorBoundary.tsx       # React error boundary
```

## API Endpoints

All endpoints are relative (`/api/...`) — the UI is backend-agnostic.

| Endpoint | Method | Description |
|---|---|---|
| `/api/songs` | GET | List all songs |
| `/api/songs` | POST | Create song |
| `/api/songs/:id` | PUT | Update song |
| `/api/songs/:id` | PATCH | Partial update |
| `/api/songs/:id` | DELETE | Delete song |
| `/api/generate` | POST | Start generation |
| `/api/generate/status/:id` | GET | Poll generation status |
| `/api/generate/cancel/:id` | POST | Cancel generation |
| `/api/upload-audio` | POST | Upload audio file |
| `/api/extract-audio-codes` | POST | Extract audio tokens |
| `/api/backend-status` | GET | Backend health check |
| `/api/format` | POST | Format text |
| `/api/random-description` | GET | Random style description |
| `/api/lora/list` | GET | List available LoRAs |
| `/api/lora/load` | POST | Load LoRA model |
| `/api/lora/unload` | POST | Unload LoRA |
| `/api/lora/status` | GET | LoRA status |
| `/api/lora/scale` | POST | Set LoRA scale |
| `/api/lora/toggle` | POST | Toggle LoRA |
| `/api/lora/tag-position` | POST | Set LoRA tag position |
| `/api/lora/validate-dir` | POST | Validate LoRA directory |
| `/api/training/separate-stems` | POST | Stem separation |
| `/api/vram/status` | GET | VRAM usage |
| `/api/vram/purge` | POST | Purge VRAM cache |

## Generation Parameters

<details>
<summary><strong>~65 parameters available</strong> (click to expand)</summary>

### Core
| Parameter | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | `""` | Style/genre description |
| `lyrics` | string | `""` | Song lyrics with section tags |
| `title` | string | `""` | Song title |
| `instrumental` | boolean | `false` | Instrumental only (no vocals) |

### Musical
| Parameter | Type | Default | Description |
|---|---|---|---|
| `bpm` | number | `120` | Beats per minute |
| `key` | string | `"C major"` | Musical key |
| `timeSignature` | string | `"4/4"` | Time signature |
| `duration` | number | `0` | Duration in seconds (0=auto) |

### DiT Model
| Parameter | Type | Default | Description |
|---|---|---|---|
| `ditModel` | string | `""` | Model variant: `""` (auto), `ace-step-v1-5-sft`, `ace-step-v1-5-base`, `ace-step-v1-5-turbo` |
| `guidanceScale` | number | `15` | How closely DiT follows text |
| `guidanceRescale` | number | `0` | Rescale factor |
| `inferenceSteps` | number | `60` | Denoising steps |
| `shift` | number | `6.5` | Noise schedule shift |
| `seed` | number | `-1` | Random seed (-1=random) |

### Language Model (5Hz LM)
| Parameter | Type | Default | Description |
|---|---|---|---|
| `thinkingMode` | boolean | `false` | Enable chain-of-thought |
| `enhanceMode` | boolean | `false` | Auto-enhance prompt |
| `lmTemperature` | number | `0.8` | LM creativity |
| `lmCfgScale` | number | `1` | LM guidance scale |
| `lmTopK` | number | `200` | Top-K sampling |
| `lmTopP` | number | `0.95` | Nucleus sampling |
| `lmRepetitionPenalty` | number | `1.1` | Repetition penalty |
| `noRepeatNgramSize` | number | `0` | N-gram repeat block |

### Audio Reference
| Parameter | Type | Default | Description |
|---|---|---|---|
| `taskType` | string | `"text2music"` | Task: text2music, cover, repaint |
| `referenceAudio` | File/null | `null` | Reference audio file |
| `coverAudio` | File/null | `null` | Cover source audio |
| `coverStrength` | number | `0.5` | Cover influence strength |
| `repaintStart` | number | `0` | Repaint region start |
| `repaintEnd` | number | `0` | Repaint region end |

### Advanced (APG)
| Parameter | Type | Default | Description |
|---|---|---|---|
| `apgNormThreshold` | number | `0` | Adaptive projected guidance norm |
| `apgMomentum` | number | `0` | APG momentum |
| `apgEta` | number | `0` | APG learning rate |

</details>

## Tech Stack

- **React 19** — UI framework
- **Vite 6** — Build tool & dev server
- **TypeScript 5.6** — Type safety
- **Tailwind CSS 4** — Styling
- **lucide-react** — Icons
- **i18next** — Internationalization
- **localStorage** — Settings & template persistence

## Credits

- **[ElWalki](https://github.com/ElWalki)** — Creator & Lead Developer
- **[Scruffy](https://github.com/scruffynerf)** — Contributed the i18n internationalization system (EN/ES)
- **[ACE-Step](https://github.com/ace-step)** — Core music generation engine

## License

MIT
