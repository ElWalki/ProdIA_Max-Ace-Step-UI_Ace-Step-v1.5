# ACE-Step API Client Documentation

**Language / 语言 / 言語:** [English](API.md) | [中文](../zh/API.md) | [日本語](../ja/API.md)

---

This service provides an HTTP-based asynchronous music generation API.

**Basic Workflow**:
1. Call `POST /v1/music/generate` to submit a task and obtain a `job_id`.
2. Call `GET /v1/jobs/{job_id}` to poll the task status until `status` is `succeeded` or `failed`.
3. Download audio files via `GET /v1/audio?path=...` URLs returned in the result.

---

## Table of Contents

- [Task Status Description](#1-task-status-description)
- [Create Generation Task](#2-create-generation-task)
- [Query Task Results](#3-query-task-results)
- [Random Sample Generation](#4-random-sample-generation)
- [List Available Models](#5-list-available-models)
- [Download Audio Files](#6-download-audio-files)
- [Health Check](#7-health-check)
- [Environment Variables](#8-environment-variables)

---

## 1. Task Status Description

Task status (`status`) includes the following types:

- `queued`: Task has entered the queue and is waiting to be executed. You can check `queue_position` and `eta_seconds` at this time.
- `running`: Generation is in progress.
- `succeeded`: Generation succeeded, results are in the `result` field.
- `failed`: Generation failed, error information is in the `error` field.

---

## 2. Create Generation Task

### 2.1 API Definition

- **URL**: `/v1/music/generate`
- **Method**: `POST`
- **Content-Type**: `application/json`, `multipart/form-data`, or `application/x-www-form-urlencoded`

### 2.2 Request Parameters

#### Parameter Naming Convention

The API supports both **snake_case** and **camelCase** naming for most parameters. For example:
- `audio_duration` / `duration` / `audioDuration`
- `key_scale` / `keyscale` / `keyScale`
- `time_signature` / `timesignature` / `timeSignature`
- `sample_query` / `sampleQuery` / `description` / `desc`
- `use_format` / `useFormat` / `format`

Additionally, metadata can be passed in a nested object (`metas`, `metadata`, or `user_metadata`).

#### Method A: JSON Request (application/json)

Suitable for passing only text parameters, or referencing audio file paths that already exist on the server.

**Basic Parameters**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `caption` | string | `""` | Music description prompt |
| `lyrics` | string | `""` | Lyrics content |
| `thinking` | bool | `false` | Whether to use 5Hz LM to generate audio codes (lm-dit behavior). |
| `vocal_language` | string | `"en"` | Lyrics language (en, zh, ja, etc.) |
| `audio_format` | string | `"mp3"` | Output format (mp3, wav, flac) |

**Sample/Description Mode Parameters**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `sample_mode` | bool | `false` | Enable random sample generation mode (auto-generates caption/lyrics/metas via LM). |
| `sample_query` | string | `""` | Natural language description for sample generation (e.g., "a soft Bengali love song"). Aliases: `description`, `desc`. |
| `use_format` | bool | `false` | Use LM to enhance/format the provided caption and lyrics. Alias: `format`. |

**Multi-Model Support**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `model` | string | null | Select which DiT model to use (e.g., `"acestep-v15-turbo"`, `"acestep-v15-turbo-shift3"`). Use `/v1/models` to list available models. If not specified, uses the default model. |

**thinking Semantics (Important)**:

- `thinking=false`:
  - The server will **NOT** use 5Hz LM to generate `audio_code_string`.
  - DiT runs in **text2music** mode and **ignores** any provided `audio_code_string`.
- `thinking=true`:
  - The server will use 5Hz LM to generate `audio_code_string` (lm-dit behavior).
  - DiT runs with LM-generated codes for enhanced music quality.

**Metadata Auto-Completion (Conditional)**:

When `use_cot_caption=true` or `use_cot_language=true` or metadata fields are missing, the server may call 5Hz LM to fill the missing fields based on `caption`/`lyrics`:

- `bpm`
- `key_scale`
- `time_signature`
- `audio_duration`

User-provided values always win; LM only fills the fields that are empty/missing.

**Music Attribute Parameters**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `bpm` | int | null | Specify tempo (BPM), range 30-300 |
| `key_scale` | string | `""` | Key/scale (e.g., "C Major", "Am"). Aliases: `keyscale`, `keyScale` |
| `time_signature` | string | `""` | Time signature (2, 3, 4, 6 for 2/4, 3/4, 4/4, 6/8). Aliases: `timesignature`, `timeSignature` |
| `audio_duration` | float | null | Generation duration (seconds), range 10-600. Aliases: `duration`, `target_duration` |

**Audio Codes (Optional)**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `audio_code_string` | string or string[] | `""` | Audio semantic tokens (5Hz) for `llm_dit`. Alias: `audioCodeString` |

**Generation Control Parameters**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `inference_steps` | int | `8` | Number of inference steps. Turbo model: 1-20 (recommended 8). Base model: 1-200 (recommended 32-64). |
| `guidance_scale` | float | `7.0` | Prompt guidance coefficient. Only effective for base model. |
| `use_random_seed` | bool | `true` | Whether to use random seed |
| `seed` | int | `-1` | Specify seed (when use_random_seed=false) |
| `batch_size` | int | `2` | Batch generation count (max 8) |

**Advanced DiT Parameters**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `shift` | float | `3.0` | Timestep shift factor (range 1.0-5.0). Only effective for base models, not turbo models. |
| `infer_method` | string | `"ode"` | Diffusion inference method: `"ode"` (Euler, faster) or `"sde"` (stochastic). |
| `timesteps` | string | null | Custom timesteps as comma-separated values (e.g., `"0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0"`). Overrides `inference_steps` and `shift`. |
| `use_adg` | bool | `false` | Use Adaptive Dual Guidance (base model only) |
| `cfg_interval_start` | float | `0.0` | CFG application start ratio (0.0-1.0) |
| `cfg_interval_end` | float | `1.0` | CFG application end ratio (0.0-1.0) |

**5Hz LM Parameters (Optional, server-side)**:

These parameters control 5Hz LM sampling, used for metadata auto-completion and (when `thinking=true`) codes generation.

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `lm_model_path` | string | null | 5Hz LM checkpoint dir name (e.g. `acestep-5Hz-lm-0.6B`) |
| `lm_backend` | string | `"vllm"` | `vllm` or `pt` |
| `lm_temperature` | float | `0.85` | Sampling temperature |
| `lm_cfg_scale` | float | `2.5` | CFG scale (>1 enables CFG) |
| `lm_negative_prompt` | string | `"NO USER INPUT"` | Negative prompt used by CFG |
| `lm_top_k` | int | null | Top-k (0/null disables) |
| `lm_top_p` | float | `0.9` | Top-p (>=1 will be treated as disabled) |
| `lm_repetition_penalty` | float | `1.0` | Repetition penalty |

**LM CoT (Chain-of-Thought) Parameters**:

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `use_cot_caption` | bool | `true` | Let LM rewrite/enhance the input caption via CoT reasoning. Aliases: `cot_caption`, `cot-caption` |
| `use_cot_language` | bool | `true` | Let LM detect vocal language via CoT. Aliases: `cot_language`, `cot-language` |
| `constrained_decoding` | bool | `true` | Enable FSM-based constrained decoding for structured LM output. Aliases: `constrainedDecoding`, `constrained` |
| `constrained_decoding_debug` | bool | `false` | Enable debug logging for constrained decoding |

**Edit/Reference Audio Parameters** (requires absolute path on server):

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `reference_audio_path` | string | null | Reference audio path (Style Transfer) |
| `src_audio_path` | string | null | Source audio path (Repainting/Cover) |
| `task_type` | string | `"text2music"` | Task type: `text2music`, `cover`, `repaint`, `lego`, `extract`, `complete` |
| `instruction` | string | auto | Edit instruction (auto-generated based on task_type if not provided) |
| `repainting_start` | float | `0.0` | Repainting start time (seconds) |
| `repainting_end` | float | null | Repainting end time (seconds), -1 for end of audio |
| `audio_cover_strength` | float | `1.0` | Cover strength (0.0-1.0). Lower values (0.2) for style transfer. |

#### Method B: File Upload (multipart/form-data)

Use this when you need to upload local audio files as reference or source audio.

In addition to supporting all the above fields as Form Fields, the following file fields are also supported:

- `reference_audio`: (File) Upload reference audio file
- `src_audio`: (File) Upload source audio file

> **Note**: After uploading files, the corresponding `_path` parameters will be automatically ignored, and the system will use the temporary file path after upload.

### 2.3 Response Example

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "queue_position": 1
}
```

### 2.4 Usage Examples (cURL)

**Basic JSON Method**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "upbeat pop song",
    "lyrics": "Hello world",
    "inference_steps": 8
  }'
```

**With thinking=true (LM generates codes + fills missing metas)**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "upbeat pop song",
    "lyrics": "Hello world",
    "thinking": true,
    "lm_temperature": 0.85,
    "lm_cfg_scale": 2.5
  }'
```

**Description-driven generation (sample_query)**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "sample_query": "a soft Bengali love song for a quiet evening",
    "thinking": true
  }'
```

**With format enhancement (use_format=true)**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "pop rock",
    "lyrics": "[Verse 1]\nWalking down the street...",
    "use_format": true,
    "thinking": true
  }'
```

**Select specific model**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "electronic dance music",
    "model": "acestep-v15-turbo",
    "thinking": true
  }'
```

**With custom timesteps**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "jazz piano trio",
    "timesteps": "0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0",
    "thinking": true
  }'
```

**With thinking=false (DiT only, but fill missing metas)**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "slow emotional ballad",
    "lyrics": "...",
    "thinking": false,
    "bpm": 72
  }'
```

**File Upload Method**:

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -F "caption=remix this song" \
  -F "src_audio=@/path/to/local/song.mp3" \
  -F "task_type=repaint"
```

---

## 3. Query Task Results

### 3.1 API Definition

- **URL**: `/v1/jobs/{job_id}`
- **Method**: `GET`

### 3.2 Response Parameters

The response contains basic task information, queue status, and final results.

**Main Fields**:

- `status`: Current status
- `queue_position`: Current queue position (0 means running or completed)
- `eta_seconds`: Estimated remaining wait time (seconds)
- `avg_job_seconds`: Average job duration (for ETA estimation)
- `result`: Result object when successful
  - `audio_paths`: List of generated audio file URLs (use with `/v1/audio` endpoint)
  - `first_audio_path`: First audio path (URL)
  - `second_audio_path`: Second audio path (URL, if batch_size >= 2)
  - `generation_info`: Generation parameter details
  - `status_message`: Brief result description
  - `seed_value`: Comma-separated seed values used
  - `metas`: Complete metadata dict
  - `bpm`: Detected/used BPM
  - `duration`: Detected/used duration
  - `keyscale`: Detected/used key scale
  - `timesignature`: Detected/used time signature
  - `genres`: Detected genres (if available)
  - `lm_model`: Name of the LM model used
  - `dit_model`: Name of the DiT model used
- `error`: Error information when failed

### 3.3 Response Examples

**Queued**:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "created_at": 1700000000.0,
  "queue_position": 5,
  "eta_seconds": 25.0,
  "avg_job_seconds": 5.0,
  "result": null,
  "error": null
}
```

**Execution Successful**:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "succeeded",
  "created_at": 1700000000.0,
  "started_at": 1700000001.0,
  "finished_at": 1700000010.0,
  "queue_position": 0,
  "result": {
    "first_audio_path": "/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc123.mp3",
    "second_audio_path": "/v1/audio?path=%2Ftmp%2Fapi_audio%2Fdef456.mp3",
    "audio_paths": [
      "/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc123.mp3",
      "/v1/audio?path=%2Ftmp%2Fapi_audio%2Fdef456.mp3"
    ],
    "generation_info": "🎵 Generated 2 audios\n⏱️ Total: 8.5s\n🎲 Seeds: 12345,67890",
    "status_message": "✅ Generation completed successfully!",
    "seed_value": "12345,67890",
    "metas": {
      "bpm": 120,
      "duration": 30,
      "keyscale": "C Major",
      "timesignature": "4",
      "caption": "upbeat pop song with catchy melody"
    },
    "bpm": 120,
    "duration": 30,
    "keyscale": "C Major",
    "timesignature": "4",
    "genres": null,
    "lm_model": "acestep-5Hz-lm-0.6B",
    "dit_model": "acestep-v15-turbo"
  },
  "error": null
}
```

---

## 4. Random Sample Generation

### 4.1 API Definition

- **URL**: `/v1/music/random`
- **Method**: `POST`

This endpoint creates a sample-mode job that auto-generates caption, lyrics, and metadata via the 5Hz LM.

### 4.2 Request Parameters

| Parameter Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `thinking` | bool | `true` | Whether to also generate audio codes via LM |

### 4.3 Response Example

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "queue_position": 1
}
```

### 4.4 Usage Example

```bash
curl -X POST http://localhost:8001/v1/music/random \
  -H 'Content-Type: application/json' \
  -d '{"thinking": true}'
```

---

## 5. List Available Models

### 5.1 API Definition

- **URL**: `/v1/models`
- **Method**: `GET`

Returns a list of available DiT models loaded on the server.

### 5.2 Response Example

```json
{
  "models": [
    {
      "name": "acestep-v15-turbo",
      "is_default": true
    },
    {
      "name": "acestep-v15-turbo-shift3",
      "is_default": false
    }
  ],
  "default_model": "acestep-v15-turbo"
}
```

### 5.3 Usage Example

```bash
curl http://localhost:8001/v1/models
```

---

## 6. Download Audio Files

### 6.1 API Definition

- **URL**: `/v1/audio`
- **Method**: `GET`

Download generated audio files by path.

### 6.2 Request Parameters

| Parameter Name | Type | Description |
| :--- | :--- | :--- |
| `path` | string | URL-encoded path to the audio file |

### 6.3 Usage Example

```bash
# Download using the URL from job result
curl "http://localhost:8001/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc123.mp3" -o output.mp3
```

---

## 7. Health Check

### 7.1 API Definition

- **URL**: `/health`
- **Method**: `GET`

Returns service health status.

### 7.2 Response Example

```json
{
  "status": "ok",
  "service": "ACE-Step API",
  "version": "1.0"
}
```

---

## 8. Environment Variables

The API server can be configured using environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `ACESTEP_API_HOST` | `127.0.0.1` | Server bind host |
| `ACESTEP_API_PORT` | `8001` | Server bind port |
| `ACESTEP_CONFIG_PATH` | `acestep-v15-turbo` | Primary DiT model path |
| `ACESTEP_CONFIG_PATH2` | (empty) | Secondary DiT model path (optional) |
| `ACESTEP_CONFIG_PATH3` | (empty) | Third DiT model path (optional) |
| `ACESTEP_DEVICE` | `auto` | Device for model loading |
| `ACESTEP_USE_FLASH_ATTENTION` | `true` | Enable flash attention |
| `ACESTEP_OFFLOAD_TO_CPU` | `false` | Offload models to CPU when idle |
| `ACESTEP_OFFLOAD_DIT_TO_CPU` | `false` | Offload DiT specifically to CPU |
| `ACESTEP_LM_MODEL_PATH` | `acestep-5Hz-lm-0.6B` | Default 5Hz LM model |
| `ACESTEP_LM_BACKEND` | `vllm` | LM backend (vllm or pt) |
| `ACESTEP_LM_DEVICE` | (same as ACESTEP_DEVICE) | Device for LM |
| `ACESTEP_LM_OFFLOAD_TO_CPU` | `false` | Offload LM to CPU |
| `ACESTEP_QUEUE_MAXSIZE` | `200` | Maximum queue size |
| `ACESTEP_QUEUE_WORKERS` | `1` | Number of queue workers |
| `ACESTEP_AVG_JOB_SECONDS` | `5.0` | Initial average job duration estimate |
| `ACESTEP_TMPDIR` | `.cache/acestep/tmp` | Temporary directory for files |

---

## Error Handling

**HTTP Status Codes**:

- `200`: Success
- `400`: Invalid request (bad JSON, missing fields)
- `404`: Job not found
- `415`: Unsupported Content-Type
- `429`: Server busy (queue is full)
- `500`: Internal server error

**Error Response Format**:

```json
{
  "detail": "Error message describing the issue"
}
```

---

## Best Practices

1. **Use `thinking=true`** for best quality results with LM-enhanced generation.

2. **Use `sample_query`/`description`** for quick generation from natural language descriptions.

3. **Use `use_format=true`** when you have caption/lyrics but want LM to enhance them.

4. **Poll job status** with reasonable intervals (e.g., every 1-2 seconds) to avoid overloading the server.

5. **Check `avg_job_seconds`** in the response to estimate wait times.

6. **Use multi-model support** by setting `ACESTEP_CONFIG_PATH2` and `ACESTEP_CONFIG_PATH3` environment variables, then select with the `model` parameter.

7. **For production**, always set proper Content-Type headers to avoid 415 errors.
