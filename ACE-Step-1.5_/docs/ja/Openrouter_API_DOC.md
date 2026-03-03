# ACE-Step OpenRouter API ドキュメント

> OpenAI Chat Completions 互換の AI 音楽生成 API

**ベース URL:** `http://{host}:{port}`（デフォルト `http://127.0.0.1:8002`）

---

## 目次

- [認証](#認証)
- [エンドポイント一覧](#エンドポイント一覧)
  - [POST /v1/chat/completions - 音楽生成](#1-音楽生成)
  - [GET /api/v1/models - モデル一覧](#2-モデル一覧)
  - [GET /health - ヘルスチェック](#3-ヘルスチェック)
- [入力モード](#入力モード)
- [ストリーミングレスポンス](#ストリーミングレスポンス)
- [リクエスト例](#リクエスト例)
- [エラーコード](#エラーコード)

---

## 認証

サーバーに API キーが設定されている場合（環境変数 `OPENROUTER_API_KEY` または起動パラメータ `--api-key`）、すべてのリクエストに以下のヘッダーが必要です：

```
Authorization: Bearer <your-api-key>
```

API キーが未設定の場合、認証は不要です。

---

## エンドポイント一覧

### 1. 音楽生成

**POST** `/v1/chat/completions`

チャットメッセージから音楽を生成し、オーディオデータと LM が生成したメタ情報を返します。

#### リクエストパラメータ

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `model` | string | いいえ | `"acemusic/acestep-v1.5-turbo"` | モデル ID |
| `messages` | array | **はい** | - | チャットメッセージリスト。[入力モード](#入力モード)を参照 |
| `stream` | boolean | いいえ | `false` | ストリーミングレスポンスを有効にする。[ストリーミングレスポンス](#ストリーミングレスポンス)を参照 |
| `temperature` | float | いいえ | `0.85` | LM サンプリング温度 |
| `top_p` | float | いいえ | `0.9` | LM nucleus sampling パラメータ |
| `lyrics` | string | いいえ | `""` | 歌詞を直接指定（messages から解析された歌詞より優先） |
| `duration` | float | いいえ | `null` | オーディオの長さ（秒）。省略時は LM が自動決定 |
| `bpm` | integer | いいえ | `null` | テンポ（BPM）。省略時は LM が自動決定 |
| `vocal_language` | string | いいえ | `"en"` | ボーカル言語コード（例: `"zh"`, `"en"`, `"ja"`） |
| `instrumental` | boolean | いいえ | `false` | インストゥルメンタル（ボーカルなし）で生成するかどうか |
| `thinking` | boolean | いいえ | `false` | LLM の thinking モード（深い推論）を有効にする |
| `use_cot_metas` | boolean | いいえ | `true` | CoT で BPM・長さ・キー・拍子などのメタ情報を自動生成する |
| `use_cot_caption` | boolean | いいえ | `true` | CoT で音楽説明文を書き換え・強化する |
| `use_cot_language` | boolean | いいえ | `true` | CoT でボーカル言語を自動検出する |
| `use_format` | boolean | いいえ | `true` | ユーザーが prompt/lyrics を直接提供した場合、LLM でフォーマット・強化する |

> **LM パラメータに関する補足:** `use_format` はユーザーが明示的に prompt/lyrics を提供した場合（タグモードまたは歌詞モード）に適用され、LLM による説明文と歌詞のフォーマット強化を行います。`use_cot_*` パラメータはオーディオ生成段階の Phase 1 CoT 推論を制御します。`use_format` または sample モードで既に duration が生成されている場合、`use_cot_metas` は重複を避けるため自動的にスキップされます。

#### messages フォーマット

```json
{
  "messages": [
    {
      "role": "user",
      "content": "入力内容"
    }
  ]
}
```

`role` は `"user"` に設定し、`content` にテキスト入力を指定します。システムは content の内容に基づいて入力モードを自動判定します。詳細は[入力モード](#入力モード)を参照してください。

---

#### 非ストリーミングレスポンス (`stream: false`)

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

**レスポンスフィールド説明:**

| フィールド | 説明 |
|---|---|
| `choices[0].message.content` | LM が生成したテキスト情報。Metadata（Caption/BPM/Duration/Key/Time Signature/Language）と Lyrics を含む。LM が関与していない場合は `"Music generated successfully."` を返す |
| `choices[0].message.audio` | オーディオデータ配列。各項目に `type`（`"audio_url"`）と `audio_url.url`（Base64 Data URL、形式: `data:audio/mpeg;base64,...`）を含む |
| `choices[0].finish_reason` | `"stop"` は正常完了を示す |

**オーディオのデコード方法:**

`audio_url.url` の値は Data URL 形式です: `data:audio/mpeg;base64,<base64_data>`

カンマ以降の base64 データ部分を抽出してデコードすると MP3 ファイルが得られます：

```python
import base64

url = response["choices"][0]["message"]["audio"][0]["audio_url"]["url"]
# "data:audio/mpeg;base64," プレフィックスを除去
b64_data = url.split(",", 1)[1]
audio_bytes = base64.b64decode(b64_data)

with open("output.mp3", "wb") as f:
    f.write(audio_bytes)
```

```javascript
const url = response.choices[0].message.audio[0].audio_url.url;
const b64Data = url.split(",")[1];
const audioBytes = atob(b64Data);
// Data URL を直接 <audio> タグで使用可能
const audio = new Audio(url);
audio.play();
```

---

### 2. モデル一覧

**GET** `/api/v1/models`

利用可能なモデル情報を返します。

#### レスポンス

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

### 3. ヘルスチェック

**GET** `/health`

#### レスポンス

```json
{
  "status": "ok",
  "service": "ACE-Step OpenRouter API",
  "version": "1.0"
}
```

---

## 入力モード

システムは最後の `user` メッセージの内容に基づいて、入力モードを自動選択します：

### モード 1: タグモード（推奨）

`<prompt>` と `<lyrics>` タグを使用して、音楽の説明と歌詞を明示的に指定します：

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

- `<prompt>...</prompt>` — 音楽のスタイル・シーンの説明（キャプション）
- `<lyrics>...</lyrics>` — 歌詞の内容
- どちらか一方のタグだけでも使用可能
- `use_format=true` の場合、LLM が prompt と lyrics を自動的に強化

### モード 2: 自然言語モード（サンプルモード）

自然言語で欲しい音楽を記述すると、システムが LLM を使って prompt と lyrics を自動生成します：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "夏と旅行をテーマにした明るい日本語のポップソングを作ってください"
    }
  ]
}
```

**トリガー条件:** メッセージにタグが含まれず、歌詞らしくない内容（`[Verse]`/`[Chorus]` などのマーカーがない、行数が少ない、または1行が長い）の場合。

### モード 3: 歌詞のみモード

構造マーカー付きの歌詞を直��渡すと、システムが自動認識します：

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

**トリガー条件:** メッセージに `[Verse]`、`[Chorus]` などのマーカーが含まれている、または複数行の短いテキスト構造を持つ場合。

### インストゥルメンタルモード

`instrumental: true` を設定するか、歌詞に `[inst]` を指定します：

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

## ストリーミングレスポンス

`"stream": true` を設定すると SSE（Server-Sent Events）ストリーミングが有効になります。

### イベントフォーマット

各イベントは `data: ` で始まり、JSON が続き、二重改行 `\n\n` で終了します：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{...},"finish_reason":null}]}

```

### ストリーミングイベントの順序

| フェーズ | delta の内容 | 説明 |
|---|---|---|
| 1. 初期化 | `{"role":"assistant","content":""}` | 接続の確立 |
| 2. LM コンテンツ（任意） | `{"content":"## Metadata\n..."}` | LM が生成したメタデータと歌詞 |
| 3. ハートビート | `{"content":"."}` | オーディオ生成中に2秒ごとに送信（接続維持） |
| 4. オーディオデータ | `{"audio":[{"type":"audio_url","audio_url":{"url":"data:..."}}]}` | 生成されたオーディオ |
| 5. 完了 | `finish_reason: "stop"` | 生成完了 |
| 6. 終了 | `data: [DONE]` | ストリーム終了マーカー |

### ストリーミングレスポンス例

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"content":"\n\n## Metadata\n**Caption:** Upbeat pop\n**BPM:** 120"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"content":"."},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{"audio":[{"type":"audio_url","audio_url":{"url":"data:audio/mpeg;base64,..."}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706688000,"model":"acemusic/acestep-v1.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

### クライアント側のストリーミング処理

```python
import json
import httpx

with httpx.stream("POST", "http://127.0.0.1:8002/v1/chat/completions", json={
    "messages": [{"role": "user", "content": "明るいギター曲を生成してください"}],
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
            print("生成完了！")

    print("Content:", "".join(content_parts))
    if audio_url:
        import base64
        b64_data = audio_url.split(",", 1)[1]
        with open("output.mp3", "wb") as f:
            f.write(base64.b64decode(b64_data))
```

```javascript
const response = await fetch("http://127.0.0.1:8002/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "明るいギター曲を生成してください" }],
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

// audioUrl は <audio src="..."> で直接使用可能
```

---

## リクエスト例

### 例 1: 自然言語生成（最もシンプルな使い方）

```bash
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "故郷と思い出についての優しい日本語のフォークソング"}
    ],
    "vocal_language": "ja"
  }'
```

### 例 2: タグモード + パラメータ指定

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

### 例 3: インストゥルメンタル + LM 強化無効

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

### 例 4: ストリーミングリクエスト

```bash
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "messages": [
      {"role": "user", "content": "誕生日おめでとうの歌を作ってください"}
    ],
    "stream": true
  }'
```

### 例 5: 全パラメータ指定

```bash
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "<prompt>Dreamy lo-fi hip hop beat with vinyl crackle</prompt><lyrics>[inst]</lyrics>"
      }
    ],
    "temperature": 0.9,
    "top_p": 0.95,
    "bpm": 85,
    "duration": 30,
    "instrumental": true,
    "thinking": false,
    "use_cot_metas": true,
    "use_cot_caption": true,
    "use_cot_language": false,
    "use_format": true
  }'
```

---

## エラーコード

| HTTP ステータス | 説明 |
|---|---|
| 400 | リクエスト形式が不正、または有効な入力がない |
| 401 | API キーが未指定、または無効 |
| 500 | 音楽生成中に内部エラーが発生 |
| 503 | モデルがまだ初期化されていない |

エラーレスポンス形式：

```json
{
  "detail": "エラーの説明メッセージ"
}
```

---

## サーバー設定（環境変数）

以下の環境変数でサーバーを設定できます（運用担当者向け）：

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `OPENROUTER_API_KEY` | なし | API 認証キー |
| `OPENROUTER_HOST` | `127.0.0.1` | リッスンアドレス |
| `OPENROUTER_PORT` | `8002` | リッスンポート |
| `ACESTEP_CONFIG_PATH` | `acestep-v15-turbo` | DiT モデル設定パス |
| `ACESTEP_DEVICE` | `auto` | 推論デバイス |
| `ACESTEP_LM_MODEL_PATH` | `acestep-5Hz-lm-0.6B` | LLM モデルパス |
| `ACESTEP_LM_BACKEND` | `vllm` | LLM 推論バックエンド |
