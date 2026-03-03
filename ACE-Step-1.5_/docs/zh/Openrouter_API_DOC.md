# ACE-Step OpenRouter API 文档

> 兼容 OpenAI Chat Completions 格式的 AI 音乐生成接口

**Base URL:** `http://{host}:{port}` (默认 `http://127.0.0.1:8002`)

---

## 目录

- [认证](#认证)
- [接口列表](#接口列表)
  - [POST /v1/chat/completions - 生成音乐](#1-生成音乐)
  - [GET /api/v1/models - 模型列表](#2-模型列表)
  - [GET /health - 健康检查](#3-健康检查)
- [输入模式](#输入模式)
- [流式响应](#流式响应)
- [完整示例](#完整示例)
- [错误码](#错误码)

---

## 认证

如果服务端配置了 API Key（环境变量 `OPENROUTER_API_KEY` 或启动参数 `--api-key`），所有请求需在 Header 中携带：

```
Authorization: Bearer <your-api-key>
```

未配置 API Key 时无需认证。

---

## 接口列表

### 1. 生成音乐

**POST** `/v1/chat/completions`

通过聊天消息生成音乐，返回音频数据和 LM 生成的元信息。

#### 请求参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `model` | string | 否 | `"acemusic/acestep-v1.5-turbo"` | 模型 ID |
| `messages` | array | **是** | - | 聊天消息列表，见 [输入模式](#输入模式) |
| `stream` | boolean | 否 | `false` | 是否启用流式返回，见 [流式响应](#流式响应) |
| `temperature` | float | 否 | `0.85` | LM 采样温度 |
| `top_p` | float | 否 | `0.9` | LM nucleus sampling |
| `lyrics` | string | 否 | `""` | 直接传入歌词（优先级高于 messages 中解析的歌词） |
| `duration` | float | 否 | `null` | 音频时长（秒），不传由 LM 自动决定 |
| `bpm` | integer | 否 | `null` | 每分钟节拍数，不传由 LM 自动决定 |
| `vocal_language` | string | 否 | `"en"` | 歌词语言代码（如 `"zh"`, `"en"`, `"ja"`） |
| `instrumental` | boolean | 否 | `false` | 是否为纯器乐（无人声） |
| `thinking` | boolean | 否 | `false` | 是否启用 LLM thinking 模式（更深度推理） |
| `use_cot_metas` | boolean | 否 | `true` | 是否通过 CoT 自动生成 BPM/时长/调号等元信息 |
| `use_cot_caption` | boolean | 否 | `true` | 是否通过 CoT 改写/增强音乐描述 |
| `use_cot_language` | boolean | 否 | `true` | 是否通过 CoT 自动检测歌词语言 |
| `use_format` | boolean | 否 | `true` | 当用户直接提供 prompt/lyrics 时，是否先通过 LLM 格式化增强 |

> **关于 LM 参数的说明：** `use_format` 在用户提供了明确的 prompt/lyrics 时生效，会通过 LLM 优化描述和歌词格式。`use_cot_*` 参数控制音频生成阶段的 Phase 1 CoT 推理。当 `use_format` 或 sample 模式已生成 duration 时，`use_cot_metas` 会自动跳过以避免重复。

#### messages 格式

```json
{
  "messages": [
    {
      "role": "user",
      "content": "你的输入内容"
    }
  ]
}
```

`role` 固定为 `"user"`，`content` 为文本内容。系统根据 content 自动判断输入模式，详见 [输入模式](#输入模式)。

---

#### 非流式响应 (`stream: false`)

```json
{
  "id": "chatcmpl-a1b2c3d4e5f6g7h8",
  "object": "chat.completion",
  "created": 1706688000,
  "model": "acemusic/acestep-v1.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "## Metadata\n**Caption:** Upbeat pop song...\n**BPM:** 120\n**Duration:** 30s\n**Key:** C major\n\n## Lyrics\n[Verse 1]\nHello world...",
        "audio": [
          {
            "type": "audio_url",
            "audio_url": {
              "url": "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAA..."
            }
          }
        ]
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 100,
    "total_tokens": 110
  }
}
```

**响应字段说明：**

| 字段 | 说明 |
|---|---|
| `choices[0].message.content` | LM 生成的文本信息，包含 Metadata（Caption/BPM/Duration/Key/Time Signature/Language）和 Lyrics。如果 LM 未参与，返回 `"Music generated successfully."` |
| `choices[0].message.audio` | 音频数据数组，每项包含 `type` (`"audio_url"`) 和 `audio_url.url`（Base64 Data URL，格式 `data:audio/mpeg;base64,...`） |
| `choices[0].finish_reason` | `"stop"` 表示正常完成 |

**音频解码格式：**

`audio_url.url` 值为 Data URL 格式：`data:audio/mpeg;base64,<base64_data>`

客户端提取 base64 数据部分后解码即可得到 MP3 文件：

```python
import base64

url = response["choices"][0]["message"]["audio"][0]["audio_url"]["url"]
# 去掉 "data:audio/mpeg;base64," 前缀
b64_data = url.split(",", 1)[1]
audio_bytes = base64.b64decode(b64_data)

with open("output.mp3", "wb") as f:
    f.write(audio_bytes)
```

```javascript
const url = response.choices[0].message.audio[0].audio_url.url;
const b64Data = url.split(",")[1];
const audioBytes = atob(b64Data);
// 或直接用于 <audio> 标签
const audio = new Audio(url);
audio.play();
```

---

### 2. 模型列表

**GET** `/api/v1/models`

返回可用模型信息。

#### 响应

```json
{
  "data": [
    {
      "id": "acemusic/acestep-v1.5-turbo",
      "name": "ACE-Step",
      "created": 1706688000,
      "description": "High-performance text-to-music generation model...",
      "input_modalities": ["text"],
      "output_modalities": ["audio"],
      "context_length": 4096,
      "pricing": {
        "prompt": "0",
        "completion": "0",
        "request": "0"
      },
      "supported_sampling_parameters": ["temperature", "top_p"]
    }
  ]
}
```

---

### 3. 健康检查

**GET** `/health`

#### 响应

```json
{
  "status": "ok",
  "service": "ACE-Step OpenRouter API",
  "version": "1.0"
}
```

---

## 输入模式

系统根据 `messages` 中最后一条 `user` 消息的内容自动选择输入模式：

### 模式 1: 标签模式（推荐）

使用 `<prompt>` 和 `<lyrics>` 标签明确指定音乐描述和歌词：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "<prompt>A gentle acoustic ballad in C major, 80 BPM, female vocal</prompt>\n<lyrics>[Verse 1]\nSunlight through the window\nA brand new day begins\n\n[Chorus]\nWe are the dreamers\nWe are the light</lyrics>"
    }
  ]
}
```

- `<prompt>...</prompt>` — 音乐风格/场景描述（即 caption）
- `<lyrics>...</lyrics>` — 歌词内容
- 两个标签可以只传其中一个
- 当 `use_format=true` 时，LLM 会自动增强 prompt 和 lyrics

### 模式 2: 自然语言模式（Sample 模式）

直接用自然语言描述想要的音乐，系统自动通过 LLM 生成 prompt 和 lyrics：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "帮我生成一首欢快的中文流行歌曲，关于夏天和旅行"
    }
  ]
}
```

触发条件：消息内容不包含标签，且不像歌词（无 `[Verse]`/`[Chorus]` 等标记，行数少或单行较长）。

### 模式 3: 纯歌词模式

直接传入带结构标记的歌词，系统自动识别：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "[Verse 1]\nWalking down the street\nFeeling the beat\n\n[Chorus]\nDance with me tonight\nUnder the moonlight"
    }
  ]
}
```

触发条件：消息内容包含 `[Verse]`、`[Chorus]` 等标记，或有多行短文本结构。

### 器乐模式

设置 `instrumental: true` 或歌词为 `[inst]`：

```json
{
  "instrumental": true,
  "messages": [
    {
      "role": "user",
      "content": "<prompt>Epic orchestral cinematic score, dramatic and powerful</prompt>"
    }
  ]
}
```

---

## 流式响应

设置 `"stream": true` 启用 SSE（Server-Sent Events）流式返回。

### 事件格式

每个事件以 `data: ` 开头，后跟 JSON，以双换行 `\n\n` 结尾：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{...},"finish_reason":null}]}

```

### 流式事件顺序

| 阶段 | delta 内容 | 说明 |
|---|---|---|
| 1. 初始化 | `{"role":"assistant","content":""}` | 建立连接 |
| 2. LM 内容（可选） | `{"content":"## Metadata\n..."}` | LM 生成的 metadata 和 lyrics |
| 3. 心跳 | `{"content":"."}` | 音频生成期间每 2 秒发送，保持连接 |
| 4. 音频数据 | `{"audio":[{"type":"audio_url","audio_url":{"url":"data:..."}}]}` | 生成完成的音频 |
| 5. 结束 | `finish_reason: "stop"` | 生成完成 |
| 6. 终止 | `data: [DONE]` | 流结束标记 |

### 流式响应示例

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"content":"\n\n## Metadata\n**Caption:** Upbeat pop\n**BPM:** 120"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"content":"."},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"audio":[{"type":"audio_url","audio_url":{"url":"data:audio/mpeg;base64,..."}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

### 客户端处理流式响应

```python
import json
import httpx

with httpx.stream("POST", "http://127.0.0.1:8002/v1/chat/completions", json={
    "messages": [{"role": "user", "content": "生成一首轻快的吉他曲"}],
    "stream": True
}) as response:
    content_parts = []
    audio_url = None

    for line in response.iter_lines():
        if not line or not line.startswith("data: "):
            continue
        if line == "data: [DONE]":
            break

        chunk = json.loads(line[6:])
        delta = chunk["choices"][0]["delta"]

        if "content" in delta and delta["content"]:
            content_parts.append(delta["content"])

        if "audio" in delta and delta["audio"]:
            audio_url = delta["audio"][0]["audio_url"]["url"]

        if chunk["choices"][0].get("finish_reason") == "stop":
            print("Generation complete!")

    print("Content:", "".join(content_parts))
    if audio_url:
        # 解码音频
        b64_data = audio_url.split(",", 1)[1]
        import base64
        with open("output.mp3", "wb") as f:
            f.write(base64.b64decode(b64_data))
```

```javascript
const response = await fetch("http://127.0.0.1:8002/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "生成一首轻快的吉他曲" }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let audioUrl = null;
let content = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

    const chunk = JSON.parse(line.slice(6));
    const delta = chunk.choices[0].delta;

    if (delta.content) content += delta.content;
    if (delta.audio) audioUrl = delta.audio[0].audio_url.url;
  }
}

// audioUrl 可直接用于 <audio src="...">
```

---

## 完整示例

### 示例 1: 自然语言生成（最简用法）

```bash
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "一首温柔的中文民谣，关于故乡和回忆"}
    ],
    "vocal_language": "zh"
  }'
```

### 示例 2: 标签模式 + 指定参数

```bash
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "<prompt>Energetic EDM track with heavy bass drops and synth leads</prompt><lyrics>[Verse 1]\nFeel the rhythm in your soul\nLet the music take control\n\n[Drop]\n(instrumental break)</lyrics>"
      }
    ],
    "bpm": 128,
    "duration": 60,
    "vocal_language": "en"
  }'
```

### 示例 3: 纯器乐 + 关闭 LM 增强

```bash
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "<prompt>Peaceful piano solo, slow tempo, jazz harmony</prompt>"
      }
    ],
    "instrumental": true,
    "use_format": false,
    "use_cot_caption": false,
    "duration": 45
  }'
```

### 示例 4: 流式请求

```bash
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "messages": [
      {"role": "user", "content": "Generate a happy birthday song"}
    ],
    "stream": true
  }'
```

---

## 错误码

| HTTP 状态码 | 说明 |
|---|---|
| 400 | 请求格式错误或缺少有效输入 |
| 401 | API Key 缺失或无效 |
| 500 | 音乐生成过程中发生内部错误 |
| 503 | 模型尚未初始化完成 |

错误响应格式：

```json
{
  "detail": "错误描述信息"
}
```

---

## 环境变量配置

以下环境变量可用于配置服务端（供运维参考）：

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `OPENROUTER_API_KEY` | 无 | API 认证密钥 |
| `OPENROUTER_HOST` | `127.0.0.1` | 监听地址 |
| `OPENROUTER_PORT` | `8002` | 监听端口 |
| `ACESTEP_CONFIG_PATH` | `acestep-v15-turbo` | DiT 模型配置路径 |
| `ACESTEP_DEVICE` | `auto` | 推理设备 |
| `ACESTEP_LM_MODEL_PATH` | `acestep-5Hz-lm-0.6B` | LLM 模型路径 |
| `ACESTEP_LM_BACKEND` | `vllm` | LLM 推理后端 |
