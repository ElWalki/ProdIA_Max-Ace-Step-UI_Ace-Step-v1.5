"""OpenRouter-compatible API server for ACE-Step V1.5.

Provides OpenAI Chat Completions API format for text-to-music generation.

Endpoints:
- GET  /api/v1/models       List available models with pricing
- POST /v1/chat/completions Generate music from text prompt
- GET  /health              Health check

Usage:
    python -m openrouter.openrouter_api_server --host 0.0.0.0 --port 8002
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import functools
import json
import os
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env file from project root
from dotenv import load_dotenv
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_project_root, ".env"))

from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import (
    GenerationParams,
    GenerationConfig,
    generate_music,
    format_sample,
)

# =============================================================================
# Constants
# =============================================================================

MODEL_ID = "acemusic/acestep-v1.5-turbo"
MODEL_NAME = "ACE-Step"
MODEL_CREATED = 1706688000  # Unix timestamp

# Pricing (USD per token/unit) - adjust as needed
PRICING_PROMPT = "0"
PRICING_COMPLETION = "0"
PRICING_REQUEST = "0"

# =============================================================================
# API Key Authentication
# =============================================================================

_api_key: Optional[str] = None


def set_api_key(key: Optional[str]):
    """Set the API key for authentication"""
    global _api_key
    _api_key = key


async def verify_api_key(authorization: Optional[str] = Header(None)):
    """Verify API key from Authorization header"""
    if _api_key is None:
        return  # No auth required

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    # Support "Bearer <key>" format
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization

    if token != _api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


# =============================================================================
# Request/Response Models (OpenAI Compatible)
# =============================================================================

class ChatMessage(BaseModel):
    role: str = "user"
    content: str = ""


class ChatCompletionRequest(BaseModel):
    model: str = MODEL_ID
    messages: List[ChatMessage] = Field(default_factory=list)
    modalities: List[str] = Field(default=["audio"])
    stream: bool = False  # Enable streaming response
    temperature: float = 0.85
    top_p: float = 0.9
    max_tokens: Optional[int] = None
    # ACE-Step specific parameters (optional)
    lyrics: str = ""
    duration: Optional[float] = None
    bpm: Optional[int] = None
    vocal_language: str = "en"
    instrumental: bool = False
    # LM / CoT control parameters
    thinking: bool = False
    use_cot_metas: bool = True
    use_cot_caption: bool = True
    use_cot_language: bool = True
    use_format: bool = True


class AudioUrlContent(BaseModel):
    """Audio URL content in OpenRouter format."""
    url: str = ""


class AudioOutputItem(BaseModel):
    """Single audio output item in OpenRouter format."""
    type: str = "audio_url"
    audio_url: AudioUrlContent = Field(default_factory=AudioUrlContent)


class ResponseMessage(BaseModel):
    role: str = "assistant"
    content: Optional[str] = None
    audio: Optional[List[AudioOutputItem]] = None  # OpenRouter format: list of audio items


class Choice(BaseModel):
    index: int = 0
    message: ResponseMessage
    finish_reason: str = "stop"


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionResponse(BaseModel):
    id: str = ""
    object: str = "chat.completion"
    created: int = 0
    model: str = MODEL_ID
    choices: List[Choice] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)


# Streaming response models
class DeltaContent(BaseModel):
    """Delta content for streaming responses."""
    role: Optional[str] = None
    content: Optional[str] = None
    audio: Optional[List[AudioOutputItem]] = None


class StreamChoice(BaseModel):
    """Single choice in streaming response."""
    index: int = 0
    delta: DeltaContent = Field(default_factory=DeltaContent)
    finish_reason: Optional[str] = None


class ChatCompletionChunk(BaseModel):
    """Streaming chunk response."""
    id: str = ""
    object: str = "chat.completion.chunk"
    created: int = 0
    model: str = MODEL_ID
    choices: List[StreamChoice] = Field(default_factory=list)


class ModelInfo(BaseModel):
    id: str
    name: str
    created: int
    description: str
    input_modalities: List[str]
    output_modalities: List[str]
    context_length: int
    pricing: Dict[str, str]
    supported_sampling_parameters: List[str]


class ModelsResponse(BaseModel):
    data: List[ModelInfo]


# =============================================================================
# Helper Functions
# =============================================================================

def _get_project_root() -> str:
    """Get the project root directory."""
    current_file = os.path.abspath(__file__)
    return os.path.dirname(os.path.dirname(current_file))


def _env_bool(name: str, default: bool) -> bool:
    """Parse boolean from environment variable."""
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "y", "on"}


import re


def _looks_like_lyrics(text: str) -> bool:
    """
    Heuristic to detect if text looks like song lyrics.
    """
    if not text:
        return False

    # Check for common lyrics markers
    lyrics_markers = [
        "[verse", "[chorus", "[bridge", "[intro", "[outro",
        "[hook", "[pre-chorus", "[refrain", "[inst",
    ]
    text_lower = text.lower()
    for marker in lyrics_markers:
        if marker in text_lower:
            return True

    # Check line structure (lyrics tend to have many short lines)
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if len(lines) >= 4:
        avg_line_length = sum(len(l) for l in lines) / len(lines)
        if avg_line_length < 60:
            return True

    return False


def _extract_tagged_content(text: str) -> tuple[str, str, str]:
    """
    Extract content from <prompt> and <lyrics> tags.

    Returns:
        (prompt, lyrics, remaining_text)
    """
    prompt = None
    lyrics = None
    remaining = text

    # Extract <prompt>...</prompt>
    prompt_match = re.search(r'<prompt>(.*?)</prompt>', text, re.DOTALL | re.IGNORECASE)
    if prompt_match:
        prompt = prompt_match.group(1).strip()
        remaining = remaining.replace(prompt_match.group(0), '').strip()

    # Extract <lyrics>...</lyrics>
    lyrics_match = re.search(r'<lyrics>(.*?)</lyrics>', text, re.DOTALL | re.IGNORECASE)
    if lyrics_match:
        lyrics = lyrics_match.group(1).strip()
        remaining = remaining.replace(lyrics_match.group(0), '').strip()

    return prompt, lyrics, remaining


def _extract_prompt_and_lyrics(messages: List[ChatMessage]) -> tuple[str, str, str]:
    """
    Extract prompt (caption), lyrics, and sample_query from messages.

    Processing logic:
    1. If <prompt> and/or <lyrics> tags present: extract tagged content
    2. If no tags: use heuristic detection
       - If text looks like lyrics -> set as lyrics
       - If text doesn't look like lyrics -> set as sample_query (for LLM sample mode)

    Returns:
        (prompt, lyrics, sample_query)
    """
    prompt = ""
    lyrics = ""
    sample_query = ""

    # Get the last user message
    for msg in reversed(messages):
        if msg.role == "user" and msg.content:
            content = msg.content.strip()

            # Try to extract tagged content first
            tagged_prompt, tagged_lyrics, remaining = _extract_tagged_content(content)

            if tagged_prompt is not None or tagged_lyrics is not None:
                # Tags found - use tagged content
                prompt = tagged_prompt or ""
                lyrics = tagged_lyrics or ""
                # If there's remaining text and no prompt, use remaining as prompt
                if remaining and not prompt:
                    prompt = remaining
            else:
                # No tags - use heuristic detection
                if _looks_like_lyrics(content):
                    # Looks like lyrics
                    lyrics = content
                else:
                    # Doesn't look like lyrics - use as sample_query for LLM
                    sample_query = content
            break

    return prompt, lyrics, sample_query


def _read_audio_as_base64(file_path: str) -> str:
    """Read audio file and return Base64 encoded string."""
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _audio_to_base64_url(audio_path: str, audio_format: str = "mp3") -> str:
    """Convert audio file to base64 data URL (OpenRouter format)."""
    if not audio_path or not os.path.exists(audio_path):
        return ""

    mime_types = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "flac": "audio/flac",
        "ogg": "audio/ogg",
        "m4a": "audio/mp4",
        "aac": "audio/aac",
    }
    mime_type = mime_types.get(audio_format.lower(), "audio/mpeg")

    with open(audio_path, "rb") as f:
        audio_data = f.read()

    b64_data = base64.b64encode(audio_data).decode("utf-8")
    return f"data:{mime_type};base64,{b64_data}"


def _format_lm_content(result: Dict[str, Any]) -> str:
    """
    Format LM generation result as content string.

    If LM was used, returns formatted metadata and lyrics.
    Otherwise returns a simple success message.
    """
    if not result.get("lm_used"):
        return "Music generated successfully."

    metadata = result.get("metadata", {})
    lyrics = result.get("lyrics", "")

    parts = []

    # Add metadata section
    meta_lines = []
    if metadata.get("caption"):
        meta_lines.append(f"**Caption:** {metadata['caption']}")
    if metadata.get("bpm"):
        meta_lines.append(f"**BPM:** {metadata['bpm']}")
    if metadata.get("duration"):
        meta_lines.append(f"**Duration:** {metadata['duration']}s")
    if metadata.get("keyscale"):
        meta_lines.append(f"**Key:** {metadata['keyscale']}")
    if metadata.get("timesignature"):
        meta_lines.append(f"**Time Signature:** {metadata['timesignature']}/4")
    if metadata.get("language"):
        meta_lines.append(f"**Language:** {metadata['language']}")

    if meta_lines:
        parts.append("## Metadata\n" + "\n".join(meta_lines))

    # Add lyrics section
    if lyrics and lyrics.strip() and lyrics.strip().lower() not in ("[inst]", "[instrumental]"):
        parts.append(f"## Lyrics\n{lyrics}")

    if parts:
        return "\n\n".join(parts)
    else:
        return "Music generated successfully."


def _make_stream_chunk(
    completion_id: str,
    created: int,
    model_id: str,
    content: Optional[str] = None,
    role: Optional[str] = None,
    audio: Optional[List[AudioOutputItem]] = None,
    finish_reason: Optional[str] = None,
) -> str:
    """Build SSE chunk JSON string."""
    delta = DeltaContent()
    if role:
        delta.role = role
    if content is not None:
        delta.content = content
    if audio is not None:
        delta.audio = audio

    chunk = ChatCompletionChunk(
        id=completion_id,
        created=created,
        model=model_id,
        choices=[
            StreamChoice(
                index=0,
                delta=delta,
                finish_reason=finish_reason,
            )
        ],
    )
    return f"data: {chunk.model_dump_json()}\n\n"


# =============================================================================
# Application Factory
# =============================================================================

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    
    # API Key from environment
    api_key = os.getenv("OPENROUTER_API_KEY", None)
    set_api_key(api_key)
    
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Application lifespan: initialize and cleanup resources."""

        # Setup cache directories
        project_root = _get_project_root()
        cache_root = os.path.join(project_root, ".cache", "openrouter")
        tmp_root = os.path.join(cache_root, "tmp")

        for p in [cache_root, tmp_root]:
            os.makedirs(p, exist_ok=True)

        # Initialize handlers
        handler = AceStepHandler()
        llm_handler = LLMHandler()

        app.state.handler = handler
        app.state.llm_handler = llm_handler
        app.state._initialized = False
        app.state._init_error = None
        app.state._llm_initialized = False
        app.state.temp_audio_dir = tmp_root

        # Thread pool for blocking operations
        executor = ThreadPoolExecutor(max_workers=1)
        app.state.executor = executor

        # =================================================================
        # Initialize models at startup
        # =================================================================
        print("[OpenRouter API] Initializing models at startup...")

        config_path = os.getenv("ACESTEP_CONFIG_PATH", "acestep-v15-turbo")
        device = os.getenv("ACESTEP_DEVICE", "auto")
        use_flash_attention = _env_bool("ACESTEP_USE_FLASH_ATTENTION", True)
        offload_to_cpu = _env_bool("ACESTEP_OFFLOAD_TO_CPU", False)
        offload_dit_to_cpu = _env_bool("ACESTEP_OFFLOAD_DIT_TO_CPU", False)

        # Initialize DiT model
        print(f"[OpenRouter API] Loading DiT model: {config_path}")
        status_msg, ok = handler.initialize_service(
            project_root=project_root,
            config_path=config_path,
            device=device,
            use_flash_attention=use_flash_attention,
            compile_model=False,
            offload_to_cpu=offload_to_cpu,
            offload_dit_to_cpu=offload_dit_to_cpu,
        )

        if not ok:
            app.state._init_error = status_msg
            print(f"[OpenRouter API] ERROR: DiT model failed: {status_msg}")
            raise RuntimeError(status_msg)

        app.state._initialized = True
        print(f"[OpenRouter API] DiT model loaded successfully")

        # Initialize LLM
        print("[OpenRouter API] Loading LLM model...")
        checkpoint_dir = os.path.join(project_root, "checkpoints")
        lm_model_path = os.getenv("ACESTEP_LM_MODEL_PATH", "acestep-5Hz-lm-0.6B")
        backend = os.getenv("ACESTEP_LM_BACKEND", "vllm")
        lm_offload = _env_bool("ACESTEP_LM_OFFLOAD_TO_CPU", False)

        try:
            lm_status, lm_ok = llm_handler.initialize(
                checkpoint_dir=checkpoint_dir,
                lm_model_path=lm_model_path,
                backend=backend,
                device=device,
                offload_to_cpu=lm_offload,
                dtype=handler.dtype,
            )
            app.state._llm_initialized = lm_ok
            if lm_ok:
                print(f"[OpenRouter API] LLM model loaded: {lm_model_path}")
            else:
                print(f"[OpenRouter API] Warning: LLM failed: {lm_status}")
        except Exception as e:
            app.state._llm_initialized = False
            print(f"[OpenRouter API] Warning: LLM init error: {e}")

        print("[OpenRouter API] All models initialized!")

        try:
            yield
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
    
    app = FastAPI(
        title="ACE-Step OpenRouter API",
        version="1.0",
        description="OpenRouter-compatible API for text-to-music generation",
        lifespan=lifespan,
    )
    
    # -------------------------------------------------------------------------
    # Endpoints
    # -------------------------------------------------------------------------
    
    @app.get("/api/v1/models", response_model=ModelsResponse)
    async def list_models(_: None = Depends(verify_api_key)) -> ModelsResponse:
        """List available models with capabilities and pricing."""
        return ModelsResponse(
            data=[
                ModelInfo(
                    id=MODEL_ID,
                    name=MODEL_NAME,
                    created=MODEL_CREATED,
                    description="High-performance text-to-music generation model. Supports multiple styles, lyrics input, and various audio durations.",
                    input_modalities=["text"],
                    output_modalities=["audio"],
                    context_length=4096,
                    pricing={
                        "prompt": PRICING_PROMPT,
                        "completion": PRICING_COMPLETION,
                        "request": PRICING_REQUEST,
                    },
                    supported_sampling_parameters=["temperature", "top_p"],
                )
            ]
        )
    
    @app.post("/v1/chat/completions")
    async def chat_completions(
        request: ChatCompletionRequest,
        _: None = Depends(verify_api_key),
    ):
        """
        Generate music from text prompt (OpenAI Chat Completions format).

        Input processing:
        - With tags: use <prompt>...</prompt> and <lyrics>...</lyrics>
        - Without tags: heuristic detection (lyrics vs sample_query for LLM)

        Supports streaming mode when request.stream=True.
        """
        # Check if model is initialized
        if not app.state._initialized:
            raise HTTPException(status_code=503, detail="Model not initialized")

        # Extract prompt, lyrics, and sample_query from messages
        prompt, lyrics_from_msg, sample_query = _extract_prompt_and_lyrics(request.messages)
        lyrics = request.lyrics or lyrics_from_msg

        # Validate input
        if not prompt and not lyrics and not sample_query:
            raise HTTPException(status_code=400, detail="No input provided in messages")

        # Determine if instrumental
        instrumental = request.instrumental or not lyrics

        # Generate unique IDs
        completion_id = f"chatcmpl-{os.urandom(8).hex()}"
        created_timestamp = int(time.time())

        def _run_lm_sample() -> Dict[str, Any]:
            """Run LLM sample generation or format_sample (blocking)."""
            nonlocal prompt, lyrics, instrumental

            llm = app.state.llm_handler if app.state._llm_initialized else None
            lm_result = {
                "prompt": prompt,
                "lyrics": lyrics,
                "instrumental": instrumental,
                "lm_used": False,
                "metadata": {},
                "format_has_duration": False,
            }

            if sample_query and llm:
                # Sample mode: LLM generates prompt and lyrics from query
                try:
                    sample_result, status_msg = llm.create_sample_from_query(
                        query=sample_query,
                        instrumental=instrumental,
                        vocal_language=request.vocal_language,
                        temperature=request.temperature,
                        top_p=request.top_p,
                    )
                    if sample_result:
                        lm_result["prompt"] = sample_result.get("caption", "") or prompt
                        lm_result["lyrics"] = sample_result.get("lyrics", "") or lyrics
                        lm_result["instrumental"] = sample_result.get("instrumental", instrumental)
                        lm_result["lm_used"] = True
                        lm_result["format_has_duration"] = bool(sample_result.get("duration"))
                        lm_result["metadata"] = {
                            "caption": lm_result["prompt"],
                            "bpm": sample_result.get("bpm"),
                            "duration": sample_result.get("duration"),
                            "keyscale": sample_result.get("keyscale"),
                            "timesignature": sample_result.get("timesignature"),
                            "language": sample_result.get("language") or request.vocal_language,
                        }
                        print(f"[OpenRouter API] Sample mode: {status_msg}")
                except Exception as e:
                    print(f"[OpenRouter API] Warning: create_sample_from_query failed: {e}")
                    if not prompt:
                        lm_result["prompt"] = sample_query

            elif (prompt or lyrics) and llm and request.use_format:
                # Format mode: use format_sample to enhance caption and lyrics
                try:
                    user_metadata = {}
                    if request.bpm is not None:
                        user_metadata["bpm"] = request.bpm
                    if request.duration:
                        user_metadata["duration"] = float(request.duration)
                    if request.vocal_language and request.vocal_language != "unknown":
                        user_metadata["language"] = request.vocal_language

                    format_result = format_sample(
                        llm_handler=llm,
                        caption=prompt,
                        lyrics=lyrics,
                        user_metadata=user_metadata if user_metadata else None,
                        temperature=request.temperature,
                        top_p=request.top_p,
                        use_constrained_decoding=True,
                    )

                    if format_result.success:
                        lm_result["prompt"] = format_result.caption or prompt
                        lm_result["lyrics"] = format_result.lyrics or lyrics
                        lm_result["lm_used"] = True
                        lm_result["format_has_duration"] = bool(format_result.duration)
                        lm_result["metadata"] = {
                            "caption": lm_result["prompt"],
                            "bpm": format_result.bpm or request.bpm,
                            "duration": format_result.duration or request.duration,
                            "keyscale": format_result.keyscale or None,
                            "timesignature": format_result.timesignature or None,
                            "language": format_result.language or request.vocal_language,
                        }
                        print(f"[OpenRouter API] Format mode: {format_result.status_message}")
                    else:
                        print(f"[OpenRouter API] Warning: format_sample failed: {format_result.error}")
                except Exception as e:
                    print(f"[OpenRouter API] Warning: format_sample error: {e}")

            return lm_result

        def _run_audio_generation(lm_result: Dict[str, Any]) -> Dict[str, Any]:
            """Run audio generation (blocking)."""
            h: AceStepHandler = app.state.handler
            llm = app.state.llm_handler if app.state._llm_initialized else None

            gen_prompt = lm_result["prompt"]
            gen_lyrics = lm_result["lyrics"]
            gen_instrumental = lm_result["instrumental"]

            # Use metadata from LM/format if available, fallback to request params
            lm_meta = lm_result.get("metadata", {})
            gen_bpm = lm_meta.get("bpm") or request.bpm
            gen_duration = lm_meta.get("duration") or (request.duration if request.duration else -1.0)
            gen_keyscale = lm_meta.get("keyscale") or ""
            gen_timesignature = lm_meta.get("timesignature") or ""
            gen_language = lm_meta.get("language") or request.vocal_language

            # If sample/format already generated duration, skip Phase 1 CoT metas
            is_sample_mode = bool(sample_query and lm_result.get("lm_used"))
            format_has_duration = lm_result.get("format_has_duration", False)

            # Default timesteps for turbo model (8 steps)
            default_timesteps = [0.97, 0.76, 0.615, 0.5, 0.395, 0.28, 0.18, 0.085, 0.0]

            # Build generation parameters
            params = GenerationParams(
                task_type="text2music",
                caption=gen_prompt,
                lyrics=gen_lyrics,
                instrumental=gen_instrumental,
                vocal_language=gen_language,
                bpm=gen_bpm,
                keyscale=gen_keyscale,
                timesignature=gen_timesignature,
                duration=gen_duration if gen_duration else -1.0,
                inference_steps=8,
                guidance_scale=7.0,
                lm_temperature=request.temperature,
                lm_top_p=request.top_p,
                thinking=request.thinking,
                use_cot_metas=request.use_cot_metas and not is_sample_mode and not format_has_duration,
                use_cot_caption=request.use_cot_caption,
                use_cot_language=request.use_cot_language,
                timesteps=default_timesteps,
            )

            config = GenerationConfig(
                batch_size=1,
                use_random_seed=True,
                audio_format="mp3",
            )

            result = generate_music(
                dit_handler=h,
                llm_handler=llm,
                params=params,
                config=config,
                save_dir=app.state.temp_audio_dir,
            )

            if not result.success:
                raise RuntimeError(result.error or "Music generation failed")

            # Get first audio path
            audio_path = None
            if result.audios and result.audios[0].get("path"):
                audio_path = result.audios[0]["path"]

            if not audio_path or not os.path.exists(audio_path):
                raise RuntimeError("No audio file generated")

            # Build metadata
            metadata = lm_result.get("metadata", {})
            if not metadata:
                metadata = {
                    "caption": gen_prompt,
                    "bpm": request.bpm,
                    "duration": request.duration,
                    "keyscale": None,
                    "timesignature": None,
                    "language": request.vocal_language,
                    "instrumental": gen_instrumental,
                }

            # Extract LM metadata from result if available
            lm_metadata = result.extra_outputs.get("lm_metadata", {}) if hasattr(result, 'extra_outputs') else {}
            if lm_metadata:
                for key in ["caption", "bpm", "duration", "keyscale", "timesignature", "language"]:
                    if lm_metadata.get(key):
                        metadata[key] = lm_metadata.get(key)

            return {
                "audio_path": audio_path,
                "lyrics": gen_lyrics,
                "metadata": metadata,
                "lm_used": lm_result.get("lm_used", False),
            }

        # Handle streaming mode
        if request.stream:
            async def stream_generator():
                """Generate SSE stream."""
                loop = asyncio.get_running_loop()
                executor = app.state.executor

                # Send initial role chunk
                yield _make_stream_chunk(
                    completion_id, created_timestamp, request.model,
                    role="assistant", content=""
                )
                await asyncio.sleep(0)

                # Step 1: Run LM sample generation
                print("[OpenRouter API] Stream: Running LM sample...")
                try:
                    lm_result = await loop.run_in_executor(executor, _run_lm_sample)
                except Exception as e:
                    print(f"[OpenRouter API] Stream: LM error: {e}")
                    lm_result = {
                        "prompt": prompt or sample_query,
                        "lyrics": lyrics,
                        "instrumental": instrumental,
                        "lm_used": False,
                        "metadata": {},
                    }

                # If LM was used, stream the content
                if lm_result.get("lm_used"):
                    lm_content = _format_lm_content({
                        "lm_used": True,
                        "lyrics": lm_result.get("lyrics", ""),
                        "metadata": lm_result.get("metadata", {}),
                    })
                    # Stream LM content in chunks
                    yield _make_stream_chunk(
                        completion_id, created_timestamp, request.model,
                        content=f"\n\n{lm_content}"
                    )
                    await asyncio.sleep(0)
                    print("[OpenRouter API] Stream: LM content sent")

                # Step 2: Run audio generation with heartbeats
                print("[OpenRouter API] Stream: Starting audio generation...")
                audio_future = loop.run_in_executor(
                    executor,
                    functools.partial(_run_audio_generation, lm_result)
                )

                # Send heartbeat while waiting
                heartbeat_interval = 2.0
                dot_count = 0
                while not audio_future.done():
                    try:
                        await asyncio.wait_for(asyncio.shield(audio_future), timeout=heartbeat_interval)
                        break
                    except asyncio.TimeoutError:
                        dot_count += 1
                        yield _make_stream_chunk(
                            completion_id, created_timestamp, request.model,
                            content="."
                        )
                        await asyncio.sleep(0)
                        print(f"[OpenRouter API] Stream: Heartbeat {dot_count}")

                # Get audio result
                try:
                    audio_result = await audio_future
                    print(f"[OpenRouter API] Stream: Audio generation completed")
                except Exception as e:
                    print(f"[OpenRouter API] Stream: Audio generation error: {e}")
                    yield _make_stream_chunk(
                        completion_id, created_timestamp, request.model,
                        content=f"\n\nError: {str(e)}"
                    )
                    yield _make_stream_chunk(
                        completion_id, created_timestamp, request.model,
                        finish_reason="error"
                    )
                    yield "data: [DONE]\n\n"
                    return

                # Send audio data
                audio_path = audio_result.get("audio_path")
                if audio_path and os.path.exists(audio_path):
                    b64_url = _audio_to_base64_url(audio_path, "mp3")
                    if b64_url:
                        audio_list = [
                            AudioOutputItem(
                                type="audio_url",
                                audio_url=AudioUrlContent(url=b64_url)
                            )
                        ]
                        yield _make_stream_chunk(
                            completion_id, created_timestamp, request.model,
                            audio=audio_list
                        )
                        await asyncio.sleep(0)
                        print("[OpenRouter API] Stream: Audio data sent")
                    else:
                        yield _make_stream_chunk(
                            completion_id, created_timestamp, request.model,
                            content="\n\nError: Failed to encode audio"
                        )
                else:
                    yield _make_stream_chunk(
                        completion_id, created_timestamp, request.model,
                        content="\n\nError: Audio file not found"
                    )

                # Send finish
                yield _make_stream_chunk(
                    completion_id, created_timestamp, request.model,
                    finish_reason="stop"
                )
                yield "data: [DONE]\n\n"
                print("[OpenRouter API] Stream: Complete")

            return StreamingResponse(
                stream_generator(),
                media_type="text/event-stream",
            )

        # Non-streaming mode
        def _blocking_generate() -> Dict[str, Any]:
            """Run full generation in thread pool."""
            lm_result = _run_lm_sample()
            return _run_audio_generation(lm_result)

        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(app.state.executor, _blocking_generate)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

        # Format content with LM results
        text_content = _format_lm_content(result)

        # Build audio in OpenRouter format
        audio_list = None
        audio_path = result.get("audio_path")
        if audio_path and os.path.exists(audio_path):
            b64_url = _audio_to_base64_url(audio_path, "mp3")
            if b64_url:
                audio_list = [
                    AudioOutputItem(
                        type="audio_url",
                        audio_url=AudioUrlContent(url=b64_url)
                    )
                ]

        response = ChatCompletionResponse(
            id=completion_id,
            created=created_timestamp,
            model=request.model,
            choices=[
                Choice(
                    index=0,
                    message=ResponseMessage(
                        role="assistant",
                        content=text_content,
                        audio=audio_list,
                    ),
                    finish_reason="stop",
                )
            ],
            usage=Usage(
                prompt_tokens=len(prompt.split()) if prompt else 0,
                completion_tokens=100,
                total_tokens=(len(prompt.split()) if prompt else 0) + 100,
            ),
        )

        return response
    
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {
            "status": "ok",
            "service": "ACE-Step OpenRouter API",
            "version": "1.0",
        }
    
    return app


# Create app instance
app = create_app()


def main() -> None:
    """Run the server."""
    import uvicorn
    
    parser = argparse.ArgumentParser(description="ACE-Step OpenRouter API server")
    parser.add_argument(
        "--host",
        default=os.getenv("OPENROUTER_HOST", "127.0.0.1"),
        help="Bind host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("OPENROUTER_PORT", "8002")),
        help="Bind port (default: 8002)",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=os.getenv("OPENROUTER_API_KEY"),
        help="API key for authentication",
    )
    args = parser.parse_args()
    
    if args.api_key:
        os.environ["OPENROUTER_API_KEY"] = args.api_key
    
    uvicorn.run(
        "openrouter.openrouter_api_server:app",
        host=str(args.host),
        port=int(args.port),
        reload=False,
        workers=1,
    )


if __name__ == "__main__":
    main()
