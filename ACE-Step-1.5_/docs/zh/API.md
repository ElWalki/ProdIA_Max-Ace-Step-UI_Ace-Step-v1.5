# ACE-Step API 客户端文档

**Language / 语言 / 言語:** [English](../en/API.md) | [中文](API.md) | [日本語](../ja/API.md)

---

本服务提供基于 HTTP 的异步音乐生成 API。

**基本工作流程**：
1. 调用 `POST /v1/music/generate` 提交任务并获取 `job_id`。
2. 调用 `GET /v1/jobs/{job_id}` 轮询任务状态，直到 `status` 为 `succeeded` 或 `failed`。
3. 通过结果中返回的 `GET /v1/audio?path=...` URL 下载音频文件。

---

## 目录

- [任务状态说明](#1-任务状态说明)
- [创建生成任务](#2-创建生成任务)
- [查询任务结果](#3-查询任务结果)
- [随机样本生成](#4-随机样本生成)
- [列出可用模型](#5-列出可用模型)
- [下载音频文件](#6-下载音频文件)
- [健康检查](#7-健康检查)
- [环境变量](#8-环境变量)

---

## 1. 任务状态说明

任务状态（`status`）包括以下类型：

- `queued`：任务已进入队列，等待执行。此时可以查看 `queue_position` 和 `eta_seconds`。
- `running`：生成正在进行中。
- `succeeded`：生成成功，结果在 `result` 字段中。
- `failed`：生成失败，错误信息在 `error` 字段中。

---

## 2. 创建生成任务

### 2.1 API 定义

- **URL**：`/v1/music/generate`
- **方法**：`POST`
- **Content-Type**：`application/json`、`multipart/form-data` 或 `application/x-www-form-urlencoded`

### 2.2 请求参数

#### 参数命名约定

API 支持大多数参数的 **snake_case** 和 **camelCase** 命名。例如：
- `audio_duration` / `duration` / `audioDuration`
- `key_scale` / `keyscale` / `keyScale`
- `time_signature` / `timesignature` / `timeSignature`
- `sample_query` / `sampleQuery` / `description` / `desc`
- `use_format` / `useFormat` / `format`

此外，元数据可以通过嵌套对象传递（`metas`、`metadata` 或 `user_metadata`）。

#### 方法 A：JSON 请求（application/json）

适用于仅传递文本参数，或引用服务器上已存在的音频文件路径。

**基本参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `caption` | string | `""` | 音乐描述提示词 |
| `lyrics` | string | `""` | 歌词内容 |
| `thinking` | bool | `false` | 是否使用 5Hz LM 生成音频代码（lm-dit 行为）|
| `vocal_language` | string | `"en"` | 歌词语言（en、zh、ja 等）|
| `audio_format` | string | `"mp3"` | 输出格式（mp3、wav、flac）|

**样本/描述模式参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `sample_mode` | bool | `false` | 启用随机样本生成模式（通过 LM 自动生成 caption/lyrics/metas）|
| `sample_query` | string | `""` | 用于样本生成的自然语言描述（例如"一首柔和的孟加拉情歌"）。别名：`description`、`desc` |
| `use_format` | bool | `false` | 使用 LM 增强/格式化提供的 caption 和 lyrics。别名：`format` |

**多模型支持**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `model` | string | null | 选择使用哪个 DiT 模型（例如 `"acestep-v15-turbo"`、`"acestep-v15-turbo-shift3"`）。使用 `/v1/models` 列出可用模型。如果未指定，使用默认模型。|

**thinking 语义（重要）**：

- `thinking=false`：
  - 服务器**不会**使用 5Hz LM 生成 `audio_code_string`。
  - DiT 以 **text2music** 模式运行，**忽略**任何提供的 `audio_code_string`。
- `thinking=true`：
  - 服务器将使用 5Hz LM 生成 `audio_code_string`（lm-dit 行为）。
  - DiT 使用 LM 生成的代码运行，以增强音乐质量。

**元数据自动补全（条件性）**：

当 `use_cot_caption=true` 或 `use_cot_language=true` 或元数据字段缺失时，服务器可能会调用 5Hz LM 根据 `caption`/`lyrics` 填充缺失的字段：

- `bpm`
- `key_scale`
- `time_signature`
- `audio_duration`

用户提供的值始终优先；LM 只填充空/缺失的字段。

**音乐属性参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `bpm` | int | null | 指定节奏（BPM），范围 30-300 |
| `key_scale` | string | `""` | 调性（例如"C Major"、"Am"）。别名：`keyscale`、`keyScale` |
| `time_signature` | string | `""` | 拍号（2、3、4、6 分别表示 2/4、3/4、4/4、6/8）。别名：`timesignature`、`timeSignature` |
| `audio_duration` | float | null | 生成时长（秒），范围 10-600。别名：`duration`、`target_duration` |

**音频代码（可选）**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `audio_code_string` | string 或 string[] | `""` | 用于 `llm_dit` 的音频语义令牌（5Hz）。别名：`audioCodeString` |

**生成控制参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `inference_steps` | int | `8` | 推理步数。Turbo 模型：1-20（推荐 8）。Base 模型：1-200（推荐 32-64）|
| `guidance_scale` | float | `7.0` | 提示引导系数。仅对 base 模型有效 |
| `use_random_seed` | bool | `true` | 是否使用随机种子 |
| `seed` | int | `-1` | 指定种子（当 use_random_seed=false 时）|
| `batch_size` | int | `2` | 批量生成数量（最多 8）|

**高级 DiT 参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `shift` | float | `3.0` | 时间步偏移因子（范围 1.0-5.0）。仅对 base 模型有效，对 turbo 模型无效 |
| `infer_method` | string | `"ode"` | 扩散推理方法：`"ode"`（Euler，更快）或 `"sde"`（随机）|
| `timesteps` | string | null | 自定义时间步，逗号分隔值（例如 `"0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0"`）。覆盖 `inference_steps` 和 `shift` |
| `use_adg` | bool | `false` | 使用自适应双引导（仅 base 模型）|
| `cfg_interval_start` | float | `0.0` | CFG 应用起始比例（0.0-1.0）|
| `cfg_interval_end` | float | `1.0` | CFG 应用结束比例（0.0-1.0）|

**5Hz LM 参数（可选，服务器端）**：

这些参数控制 5Hz LM 采样，用于元数据自动补全和（当 `thinking=true` 时）代码生成。

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `lm_model_path` | string | null | 5Hz LM 检查点目录名（例如 `acestep-5Hz-lm-0.6B`）|
| `lm_backend` | string | `"vllm"` | `vllm` 或 `pt` |
| `lm_temperature` | float | `0.85` | 采样温度 |
| `lm_cfg_scale` | float | `2.5` | CFG 比例（>1 启用 CFG）|
| `lm_negative_prompt` | string | `"NO USER INPUT"` | CFG 使用的负面提示 |
| `lm_top_k` | int | null | Top-k（0/null 禁用）|
| `lm_top_p` | float | `0.9` | Top-p（>=1 将被视为禁用）|
| `lm_repetition_penalty` | float | `1.0` | 重复惩罚 |

**LM CoT（思维链）参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `use_cot_caption` | bool | `true` | 让 LM 通过 CoT 推理重写/增强输入 caption。别名：`cot_caption`、`cot-caption` |
| `use_cot_language` | bool | `true` | 让 LM 通过 CoT 检测人声语言。别名：`cot_language`、`cot-language` |
| `constrained_decoding` | bool | `true` | 启用基于 FSM 的约束解码以获得结构化 LM 输出。别名：`constrainedDecoding`、`constrained` |
| `constrained_decoding_debug` | bool | `false` | 启用约束解码的调试日志 |

**编辑/参考音频参数**（需要服务器上的绝对路径）：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `reference_audio_path` | string | null | 参考音频路径（风格迁移）|
| `src_audio_path` | string | null | 源音频路径（重绘/翻唱）|
| `task_type` | string | `"text2music"` | 任务类型：`text2music`、`cover`、`repaint`、`lego`、`extract`、`complete` |
| `instruction` | string | auto | 编辑指令（如未提供则根据 task_type 自动生成）|
| `repainting_start` | float | `0.0` | 重绘开始时间（秒）|
| `repainting_end` | float | null | 重绘结束时间（秒），-1 表示音频末尾 |
| `audio_cover_strength` | float | `1.0` | 翻唱强度（0.0-1.0）。风格迁移使用较小值（0.2）|

#### 方法 B：文件上传（multipart/form-data）

当需要上传本地音频文件作为参考或源音频时使用。

除了支持上述所有字段作为表单字段外，还支持以下文件字段：

- `reference_audio`：（文件）上传参考音频文件
- `src_audio`：（文件）上传源音频文件

> **注意**：上传文件后，相应的 `_path` 参数将被自动忽略，系统将使用上传后的临时文件路径。

### 2.3 响应示例

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "queue_position": 1
}
```

### 2.4 使用示例（cURL）

**基本 JSON 方法**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "欢快的流行歌曲",
    "lyrics": "你好世界",
    "inference_steps": 8
  }'
```

**使用 thinking=true（LM 生成代码 + 填充缺失元数据）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "欢快的流行歌曲",
    "lyrics": "你好世界",
    "thinking": true,
    "lm_temperature": 0.85,
    "lm_cfg_scale": 2.5
  }'
```

**描述驱动生成（sample_query）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "sample_query": "一首适合安静夜晚的柔和孟加拉情歌",
    "thinking": true
  }'
```

**使用格式增强（use_format=true）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "流行摇滚",
    "lyrics": "[Verse 1]\n走在街上...",
    "use_format": true,
    "thinking": true
  }'
```

**选择特定模型**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "电子舞曲",
    "model": "acestep-v15-turbo",
    "thinking": true
  }'
```

**使用自定义时间步**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "爵士钢琴三重奏",
    "timesteps": "0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0",
    "thinking": true
  }'
```

**使用 thinking=false（仅 DiT，但填充缺失元数据）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "缓慢的情感民谣",
    "lyrics": "...",
    "thinking": false,
    "bpm": 72
  }'
```

**文件上传方法**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -F "caption=重新混音这首歌" \
  -F "src_audio=@/path/to/local/song.mp3" \
  -F "task_type=repaint"
```

---

## 3. 查询任务结果

### 3.1 API 定义

- **URL**：`/v1/jobs/{job_id}`
- **方法**：`GET`

### 3.2 响应参数

响应包含基本任务信息、队列状态和最终结果。

**主要字段**：

- `status`：当前状态
- `queue_position`：当前队列位置（0 表示正在运行或已完成）
- `eta_seconds`：预计剩余等待时间（秒）
- `avg_job_seconds`：平均任务持续时间（用于 ETA 估算）
- `result`：成功时的结果对象
  - `audio_paths`：生成的音频文件 URL 列表（配合 `/v1/audio` 端点使用）
  - `first_audio_path`：第一个音频路径（URL）
  - `second_audio_path`：第二个音频路径（URL，如果 batch_size >= 2）
  - `generation_info`：生成参数详情
  - `status_message`：简短结果描述
  - `seed_value`：使用的种子值，逗号分隔
  - `metas`：完整元数据字典
  - `bpm`：检测到/使用的 BPM
  - `duration`：检测到/使用的时长
  - `keyscale`：检测到/使用的调性
  - `timesignature`：检测到/使用的拍号
  - `genres`：检测到的风格（如果可用）
  - `lm_model`：使用的 LM 模型名称
  - `dit_model`：使用的 DiT 模型名称
- `error`：失败时的错误信息

### 3.3 响应示例

**排队中**：

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

**执行成功**：

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
    "generation_info": "🎵 生成了 2 个音频\n⏱️ 总计：8.5s\n🎲 种子：12345,67890",
    "status_message": "✅ 生成成功完成！",
    "seed_value": "12345,67890",
    "metas": {
      "bpm": 120,
      "duration": 30,
      "keyscale": "C Major",
      "timesignature": "4",
      "caption": "欢快的流行歌曲，旋律动听"
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

## 4. 随机样本生成

### 4.1 API 定义

- **URL**：`/v1/music/random`
- **方法**：`POST`

此端点创建一个样本模式任务，通过 5Hz LM 自动生成 caption、lyrics 和元数据。

### 4.2 请求参数

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `thinking` | bool | `true` | 是否同时通过 LM 生成音频代码 |

### 4.3 响应示例

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "queue_position": 1
}
```

### 4.4 使用示例

```bash
curl -X POST http://localhost:8001/v1/music/random \
  -H 'Content-Type: application/json' \
  -d '{"thinking": true}'
```

---

## 5. 列出可用模型

### 5.1 API 定义

- **URL**：`/v1/models`
- **方法**：`GET`

返回服务器上加载的可用 DiT 模型列表。

### 5.2 响应示例

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

### 5.3 使用示例

```bash
curl http://localhost:8001/v1/models
```

---

## 6. 下载音频文件

### 6.1 API 定义

- **URL**：`/v1/audio`
- **方法**：`GET`

通过路径下载生成的音频文件。

### 6.2 请求参数

| 参数名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `path` | string | URL 编码的音频文件路径 |

### 6.3 使用示例

```bash
# 使用任务结果中的 URL 下载
curl "http://localhost:8001/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc123.mp3" -o output.mp3
```

---

## 7. 健康检查

### 7.1 API 定义

- **URL**：`/health`
- **方法**：`GET`

返回服务健康状态。

### 7.2 响应示例

```json
{
  "status": "ok",
  "service": "ACE-Step API",
  "version": "1.0"
}
```

---

## 8. 环境变量

API 服务器可以通过环境变量进行配置：

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ACESTEP_API_HOST` | `127.0.0.1` | 服务器绑定主机 |
| `ACESTEP_API_PORT` | `8001` | 服务器绑定端口 |
| `ACESTEP_CONFIG_PATH` | `acestep-v15-turbo` | 主 DiT 模型路径 |
| `ACESTEP_CONFIG_PATH2` | （空）| 辅助 DiT 模型路径（可选）|
| `ACESTEP_CONFIG_PATH3` | （空）| 第三个 DiT 模型路径（可选）|
| `ACESTEP_DEVICE` | `auto` | 模型加载设备 |
| `ACESTEP_USE_FLASH_ATTENTION` | `true` | 启用 flash attention |
| `ACESTEP_OFFLOAD_TO_CPU` | `false` | 空闲时将模型卸载到 CPU |
| `ACESTEP_OFFLOAD_DIT_TO_CPU` | `false` | 专门将 DiT 卸载到 CPU |
| `ACESTEP_LM_MODEL_PATH` | `acestep-5Hz-lm-0.6B` | 默认 5Hz LM 模型 |
| `ACESTEP_LM_BACKEND` | `vllm` | LM 后端（vllm 或 pt）|
| `ACESTEP_LM_DEVICE` | （与 ACESTEP_DEVICE 相同）| LM 设备 |
| `ACESTEP_LM_OFFLOAD_TO_CPU` | `false` | 将 LM 卸载到 CPU |
| `ACESTEP_QUEUE_MAXSIZE` | `200` | 最大队列大小 |
| `ACESTEP_QUEUE_WORKERS` | `1` | 队列工作者数量 |
| `ACESTEP_AVG_JOB_SECONDS` | `5.0` | 初始平均任务持续时间估算 |
| `ACESTEP_TMPDIR` | `.cache/acestep/tmp` | 临时文件目录 |

---

## 错误处理

**HTTP 状态码**：

- `200`：成功
- `400`：无效请求（错误的 JSON、缺少字段）
- `404`：找不到任务
- `415`：不支持的 Content-Type
- `429`：服务器繁忙（队列已满）
- `500`：内部服务器错误

**错误响应格式**：

```json
{
  "detail": "描述问题的错误消息"
}
```

---

## 最佳实践

1. **使用 `thinking=true`** 以获得 LM 增强生成的最佳质量结果。

2. **使用 `sample_query`/`description`** 从自然语言描述快速生成。

3. **使用 `use_format=true`** 当你有 caption/lyrics 但希望 LM 增强它们时。

4. **轮询任务状态** 时使用合理的间隔（例如每 1-2 秒），以避免服务器过载。

5. **检查 `avg_job_seconds`** 响应来估算等待时间。

6. **使用多模型支持** 通过设置 `ACESTEP_CONFIG_PATH2` 和 `ACESTEP_CONFIG_PATH3` 环境变量，然后通过 `model` 参数选择。

7. **生产环境** 中，始终设置正确的 Content-Type 头以避免 415 错误。
