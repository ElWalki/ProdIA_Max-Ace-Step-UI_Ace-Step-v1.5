# ACE-Step API クライアントドキュメント

**Language / 语言 / 言語:** [English](../en/API.md) | [中文](../zh/API.md) | [日本語](API.md)

---

本サービスはHTTPベースの非同期音楽生成APIを提供します。

**基本的なワークフロー**：
1. `POST /v1/music/generate` を呼び出してタスクを送信し、`job_id` を取得します。
2. `GET /v1/jobs/{job_id}` を呼び出してタスクステータスをポーリングし、`status` が `succeeded` または `failed` になるまで待ちます。
3. 結果で返された `GET /v1/audio?path=...` URL から音声ファイルをダウンロードします。

---

## 目次

- [タスクステータスの説明](#1-タスクステータスの説明)
- [生成タスクの作成](#2-生成タスクの作成)
- [タスク結果の照会](#3-タスク結果の照会)
- [ランダムサンプル生成](#4-ランダムサンプル生成)
- [利用可能なモデルの一覧](#5-利用可能なモデルの一覧)
- [音声ファイルのダウンロード](#6-音声ファイルのダウンロード)
- [ヘルスチェック](#7-ヘルスチェック)
- [環境変数](#8-環境変数)

---

## 1. タスクステータスの説明

タスクステータス（`status`）には以下の種類があります：

- `queued`：タスクがキューに入り、実行待ちです。この時点で `queue_position` と `eta_seconds` を確認できます。
- `running`：生成が進行中です。
- `succeeded`：生成が成功し、結果は `result` フィールドにあります。
- `failed`：生成が失敗し、エラー情報は `error` フィールドにあります。

---

## 2. 生成タスクの作成

### 2.1 API 定義

- **URL**：`/v1/music/generate`
- **メソッド**：`POST`
- **Content-Type**：`application/json`、`multipart/form-data`、または `application/x-www-form-urlencoded`

### 2.2 リクエストパラメータ

#### パラメータ命名規則

APIはほとんどのパラメータで **snake_case** と **camelCase** の両方の命名をサポートしています。例：
- `audio_duration` / `duration` / `audioDuration`
- `key_scale` / `keyscale` / `keyScale`
- `time_signature` / `timesignature` / `timeSignature`
- `sample_query` / `sampleQuery` / `description` / `desc`
- `use_format` / `useFormat` / `format`

また、メタデータはネストされたオブジェクト（`metas`、`metadata`、または `user_metadata`）で渡すことができます。

#### 方法 A：JSONリクエスト（application/json）

テキストパラメータのみを渡す場合、またはサーバー上に既に存在する音声ファイルパスを参照する場合に適しています。

**基本パラメータ**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `caption` | string | `""` | 音楽の説明プロンプト |
| `lyrics` | string | `""` | 歌詞の内容 |
| `thinking` | bool | `false` | 5Hz LMを使用してオーディオコードを生成するかどうか（lm-dit動作）|
| `vocal_language` | string | `"en"` | 歌詞の言語（en、zh、jaなど）|
| `audio_format` | string | `"mp3"` | 出力形式（mp3、wav、flac）|

**サンプル/説明モードパラメータ**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `sample_mode` | bool | `false` | ランダムサンプル生成モードを有効にする（LM経由でcaption/lyrics/metasを自動生成）|
| `sample_query` | string | `""` | サンプル生成のための自然言語の説明（例：「静かな夜のための柔らかいベンガルのラブソング」）。別名：`description`、`desc` |
| `use_format` | bool | `false` | LMを使用して提供されたcaptionとlyricsを強化/フォーマットする。別名：`format` |

**マルチモデルサポート**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `model` | string | null | 使用するDiTモデルを選択（例：`"acestep-v15-turbo"`、`"acestep-v15-turbo-shift3"`）。`/v1/models` で利用可能なモデルを一覧表示。指定しない場合はデフォルトモデルを使用。|

**thinkingのセマンティクス（重要）**：

- `thinking=false`：
  - サーバーは5Hz LMを使用して `audio_code_string` を生成**しません**。
  - DiTは **text2music** モードで実行され、提供された `audio_code_string` を**無視**します。
- `thinking=true`：
  - サーバーは5Hz LMを使用して `audio_code_string` を生成します（lm-dit動作）。
  - DiTはLM生成のコードで実行され、音楽品質が向上します。

**メタデータの自動補完（条件付き）**：

`use_cot_caption=true` または `use_cot_language=true` またはメタデータフィールドが欠落している場合、サーバーは `caption`/`lyrics` に基づいて5Hz LMを呼び出し、欠落しているフィールドを補完することがあります：

- `bpm`
- `key_scale`
- `time_signature`
- `audio_duration`

ユーザー提供の値が常に優先されます。LMは空/欠落しているフィールドのみを補完します。

**音楽属性パラメータ**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `bpm` | int | null | テンポ（BPM）を指定、範囲30-300 |
| `key_scale` | string | `""` | キー/スケール（例：「C Major」、「Am」）。別名：`keyscale`、`keyScale` |
| `time_signature` | string | `""` | 拍子記号（2、3、4、6はそれぞれ2/4、3/4、4/4、6/8）。別名：`timesignature`、`timeSignature` |
| `audio_duration` | float | null | 生成時間（秒）、範囲10-600。別名：`duration`、`target_duration` |

**オーディオコード（オプション）**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `audio_code_string` | string または string[] | `""` | `llm_dit` 用のオーディオセマンティックトークン（5Hz）。別名：`audioCodeString` |

**生成制御パラメータ**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `inference_steps` | int | `8` | 推論ステップ数。Turboモデル：1-20（推奨8）。Baseモデル：1-200（推奨32-64）|
| `guidance_scale` | float | `7.0` | プロンプトガイダンス係数。baseモデルのみ有効 |
| `use_random_seed` | bool | `true` | ランダムシードを使用するかどうか |
| `seed` | int | `-1` | シードを指定（use_random_seed=falseの場合）|
| `batch_size` | int | `2` | バッチ生成数（最大8）|

**高度なDiTパラメータ**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `shift` | float | `3.0` | タイムステップシフト係数（範囲1.0-5.0）。baseモデルのみ有効、turboモデルには無効 |
| `infer_method` | string | `"ode"` | 拡散推論方法：`"ode"`（Euler、より高速）または `"sde"`（確率的）|
| `timesteps` | string | null | カンマ区切りのカスタムタイムステップ（例：`"0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0"`）。`inference_steps` と `shift` をオーバーライド |
| `use_adg` | bool | `false` | 適応デュアルガイダンスを使用（baseモデルのみ）|
| `cfg_interval_start` | float | `0.0` | CFG適用開始比率（0.0-1.0）|
| `cfg_interval_end` | float | `1.0` | CFG適用終了比率（0.0-1.0）|

**5Hz LMパラメータ（オプション、サーバー側）**：

これらのパラメータは5Hz LMサンプリングを制御し、メタデータの自動補完と（`thinking=true` の場合）コード生成に使用されます。

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `lm_model_path` | string | null | 5Hz LMチェックポイントディレクトリ名（例：`acestep-5Hz-lm-0.6B`）|
| `lm_backend` | string | `"vllm"` | `vllm` または `pt` |
| `lm_temperature` | float | `0.85` | サンプリング温度 |
| `lm_cfg_scale` | float | `2.5` | CFGスケール（>1でCFGを有効化）|
| `lm_negative_prompt` | string | `"NO USER INPUT"` | CFGで使用するネガティブプロンプト |
| `lm_top_k` | int | null | Top-k（0/nullで無効）|
| `lm_top_p` | float | `0.9` | Top-p（>=1は無効として扱われる）|
| `lm_repetition_penalty` | float | `1.0` | 繰り返しペナルティ |

**LM CoT（思考の連鎖）パラメータ**：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `use_cot_caption` | bool | `true` | LMにCoT推論で入力captionを書き換え/強化させる。別名：`cot_caption`、`cot-caption` |
| `use_cot_language` | bool | `true` | LMにCoTでボーカル言語を検出させる。別名：`cot_language`、`cot-language` |
| `constrained_decoding` | bool | `true` | 構造化されたLM出力のためのFSMベースの制約付きデコーディングを有効にする。別名：`constrainedDecoding`、`constrained` |
| `constrained_decoding_debug` | bool | `false` | 制約付きデコーディングのデバッグログを有効にする |

**編集/参照オーディオパラメータ**（サーバー上の絶対パスが必要）：

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `reference_audio_path` | string | null | 参照オーディオパス（スタイル転送）|
| `src_audio_path` | string | null | ソースオーディオパス（リペイント/カバー）|
| `task_type` | string | `"text2music"` | タスクタイプ：`text2music`、`cover`、`repaint`、`lego`、`extract`、`complete` |
| `instruction` | string | auto | 編集指示（提供されない場合はtask_typeに基づいて自動生成）|
| `repainting_start` | float | `0.0` | リペイント開始時間（秒）|
| `repainting_end` | float | null | リペイント終了時間（秒）、-1でオーディオの終端 |
| `audio_cover_strength` | float | `1.0` | カバー強度（0.0-1.0）。スタイル転送には小さい値（0.2）を使用 |

#### 方法 B：ファイルアップロード（multipart/form-data）

参照またはソースオーディオとしてローカルオーディオファイルをアップロードする必要がある場合に使用します。

上記のすべてのフィールドをフォームフィールドとしてサポートすることに加えて、以下のファイルフィールドもサポートしています：

- `reference_audio`：（ファイル）参照オーディオファイルをアップロード
- `src_audio`：（ファイル）ソースオーディオファイルをアップロード

> **注意**：ファイルをアップロードすると、対応する `_path` パラメータは自動的に無視され、システムはアップロード後の一時ファイルパスを使用します。

### 2.3 レスポンス例

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "queue_position": 1
}
```

### 2.4 使用例（cURL）

**基本的なJSONメソッド**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "アップビートなポップソング",
    "lyrics": "Hello world",
    "inference_steps": 8
  }'
```

**thinking=trueの場合（LMがコードを生成 + 欠落メタを補完）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "アップビートなポップソング",
    "lyrics": "Hello world",
    "thinking": true,
    "lm_temperature": 0.85,
    "lm_cfg_scale": 2.5
  }'
```

**説明駆動型生成（sample_query）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "sample_query": "静かな夜のための柔らかいベンガルのラブソング",
    "thinking": true
  }'
```

**フォーマット強化（use_format=true）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "ポップロック",
    "lyrics": "[Verse 1]\n街を歩いて...",
    "use_format": true,
    "thinking": true
  }'
```

**特定のモデルを選択**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "エレクトロニックダンスミュージック",
    "model": "acestep-v15-turbo",
    "thinking": true
  }'
```

**カスタムタイムステップを使用**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "ジャズピアノトリオ",
    "timesteps": "0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0",
    "thinking": true
  }'
```

**thinking=falseの場合（DiTのみ、ただし欠落メタを補完）**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "caption": "ゆっくりとした感情的なバラード",
    "lyrics": "...",
    "thinking": false,
    "bpm": 72
  }'
```

**ファイルアップロードメソッド**：

```bash
curl -X POST http://localhost:8001/v1/music/generate \
  -F "caption=この曲をリミックス" \
  -F "src_audio=@/path/to/local/song.mp3" \
  -F "task_type=repaint"
```

---

## 3. タスク結果の照会

### 3.1 API 定義

- **URL**：`/v1/jobs/{job_id}`
- **メソッド**：`GET`

### 3.2 レスポンスパラメータ

レスポンスには基本的なタスク情報、キューステータス、最終結果が含まれます。

**主要フィールド**：

- `status`：現在のステータス
- `queue_position`：現在のキュー位置（0は実行中または完了を意味）
- `eta_seconds`：推定残り待ち時間（秒）
- `avg_job_seconds`：平均ジョブ時間（ETA推定用）
- `result`：成功時の結果オブジェクト
  - `audio_paths`：生成されたオーディオファイルURLのリスト（`/v1/audio` エンドポイントと併用）
  - `first_audio_path`：最初のオーディオパス（URL）
  - `second_audio_path`：2番目のオーディオパス（URL、batch_size >= 2の場合）
  - `generation_info`：生成パラメータの詳細
  - `status_message`：簡潔な結果説明
  - `seed_value`：使用されたシード値（カンマ区切り）
  - `metas`：完全なメタデータ辞書
  - `bpm`：検出/使用されたBPM
  - `duration`：検出/使用された長さ
  - `keyscale`：検出/使用されたキー
  - `timesignature`：検出/使用された拍子
  - `genres`：検出されたジャンル（利用可能な場合）
  - `lm_model`：使用されたLMモデルの名前
  - `dit_model`：使用されたDiTモデルの名前
- `error`：失敗時のエラー情報

### 3.3 レスポンス例

**キュー中**：

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

**実行成功**：

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
    "generation_info": "🎵 2つのオーディオを生成\n⏱️ 合計：8.5s\n🎲 シード：12345,67890",
    "status_message": "✅ 生成が正常に完了しました！",
    "seed_value": "12345,67890",
    "metas": {
      "bpm": 120,
      "duration": 30,
      "keyscale": "C Major",
      "timesignature": "4",
      "caption": "キャッチーなメロディのアップビートなポップソング"
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

## 4. ランダムサンプル生成

### 4.1 API 定義

- **URL**：`/v1/music/random`
- **メソッド**：`POST`

このエンドポイントは5Hz LM経由でcaption、lyrics、メタデータを自動生成するサンプルモードジョブを作成します。

### 4.2 リクエストパラメータ

| パラメータ名 | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| `thinking` | bool | `true` | LM経由でオーディオコードも生成するかどうか |

### 4.3 レスポンス例

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "queue_position": 1
}
```

### 4.4 使用例

```bash
curl -X POST http://localhost:8001/v1/music/random \
  -H 'Content-Type: application/json' \
  -d '{"thinking": true}'
```

---

## 5. 利用可能なモデルの一覧

### 5.1 API 定義

- **URL**：`/v1/models`
- **メソッド**：`GET`

サーバーにロードされている利用可能なDiTモデルのリストを返します。

### 5.2 レスポンス例

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

### 5.3 使用例

```bash
curl http://localhost:8001/v1/models
```

---

## 6. 音声ファイルのダウンロード

### 6.1 API 定義

- **URL**：`/v1/audio`
- **メソッド**：`GET`

パスで生成されたオーディオファイルをダウンロードします。

### 6.2 リクエストパラメータ

| パラメータ名 | 型 | 説明 |
| :--- | :--- | :--- |
| `path` | string | URLエンコードされたオーディオファイルパス |

### 6.3 使用例

```bash
# ジョブ結果のURLを使用してダウンロード
curl "http://localhost:8001/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc123.mp3" -o output.mp3
```

---

## 7. ヘルスチェック

### 7.1 API 定義

- **URL**：`/health`
- **メソッド**：`GET`

サービスのヘルスステータスを返します。

### 7.2 レスポンス例

```json
{
  "status": "ok",
  "service": "ACE-Step API",
  "version": "1.0"
}
```

---

## 8. 環境変数

APIサーバーは環境変数で設定できます：

| 変数 | デフォルト | 説明 |
| :--- | :--- | :--- |
| `ACESTEP_API_HOST` | `127.0.0.1` | サーバーバインドホスト |
| `ACESTEP_API_PORT` | `8001` | サーバーバインドポート |
| `ACESTEP_CONFIG_PATH` | `acestep-v15-turbo` | プライマリDiTモデルパス |
| `ACESTEP_CONFIG_PATH2` | （空）| セカンダリDiTモデルパス（オプション）|
| `ACESTEP_CONFIG_PATH3` | （空）| 3番目のDiTモデルパス（オプション）|
| `ACESTEP_DEVICE` | `auto` | モデルロードデバイス |
| `ACESTEP_USE_FLASH_ATTENTION` | `true` | flash attentionを有効化 |
| `ACESTEP_OFFLOAD_TO_CPU` | `false` | アイドル時にモデルをCPUにオフロード |
| `ACESTEP_OFFLOAD_DIT_TO_CPU` | `false` | DiTを特にCPUにオフロード |
| `ACESTEP_LM_MODEL_PATH` | `acestep-5Hz-lm-0.6B` | デフォルト5Hz LMモデル |
| `ACESTEP_LM_BACKEND` | `vllm` | LMバックエンド（vllmまたはpt）|
| `ACESTEP_LM_DEVICE` | （ACESTEP_DEVICEと同じ）| LMデバイス |
| `ACESTEP_LM_OFFLOAD_TO_CPU` | `false` | LMをCPUにオフロード |
| `ACESTEP_QUEUE_MAXSIZE` | `200` | 最大キューサイズ |
| `ACESTEP_QUEUE_WORKERS` | `1` | キューワーカー数 |
| `ACESTEP_AVG_JOB_SECONDS` | `5.0` | 初期平均ジョブ時間推定 |
| `ACESTEP_TMPDIR` | `.cache/acestep/tmp` | 一時ファイルディレクトリ |

---

## エラー処理

**HTTPステータスコード**：

- `200`：成功
- `400`：無効なリクエスト（不正なJSON、フィールドの欠落）
- `404`：ジョブが見つからない
- `415`：サポートされていないContent-Type
- `429`：サーバービジー（キューが満杯）
- `500`：内部サーバーエラー

**エラーレスポンス形式**：

```json
{
  "detail": "問題を説明するエラーメッセージ"
}
```

---

## ベストプラクティス

1. **`thinking=true` を使用** してLM強化生成で最高品質の結果を得る。

2. **`sample_query`/`description` を使用** して自然言語の説明から素早く生成。

3. **`use_format=true` を使用** してcaption/lyricsがあるがLMに強化してもらいたい場合。

4. **ジョブステータスのポーリング** は適切な間隔（例：1-2秒ごと）で行い、サーバーの過負荷を避ける。

5. **`avg_job_seconds` を確認** してレスポンスで待ち時間を推定。

6. **マルチモデルサポートを使用** するには `ACESTEP_CONFIG_PATH2` と `ACESTEP_CONFIG_PATH3` 環境変数を設定し、`model` パラメータで選択。

7. **本番環境** では常に適切なContent-Typeヘッダーを設定して415エラーを回避。
