"""
Gradio API Routes Module
Add API endpoints compatible with api_server.py and CustomAceStep to Gradio application
"""
import json
import os
import random
import time
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Depends, Header
from fastapi.responses import FileResponse

# API Key storage (set via setup_api_routes)
_api_key: Optional[str] = None


def set_api_key(key: Optional[str]):
    """Set the API key for authentication"""
    global _api_key
    _api_key = key


def _wrap_response(data: Any, code: int = 200, error: Optional[str] = None) -> Dict[str, Any]:
    """Wrap response data in standard format compatible with CustomAceStep."""
    return {
        "data": data,
        "code": code,
        "error": error,
        "timestamp": int(time.time() * 1000),
        "extra": None,
    }


def verify_token_from_request(body: dict, authorization: Optional[str] = None) -> Optional[str]:
    """
    Verify API key from request body (ai_token) or Authorization header.
    Returns the token if valid, None if no auth required.
    """
    if _api_key is None:
        return None  # No auth required

    # Try ai_token from body first
    ai_token = body.get("ai_token") if body else None
    if ai_token:
        if ai_token == _api_key:
            return ai_token
        raise HTTPException(status_code=401, detail="Invalid ai_token")

    # Fallback to Authorization header
    if authorization:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
        else:
            token = authorization
        if token == _api_key:
            return token
        raise HTTPException(status_code=401, detail="Invalid API key")

    # No token provided but auth is required
    raise HTTPException(status_code=401, detail="Missing ai_token or Authorization header")


async def verify_api_key(authorization: Optional[str] = Header(None)):
    """Verify API key from Authorization header (legacy, for non-body endpoints)"""
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


# Use diskcache to store results
try:
    import diskcache
    _cache_dir = os.path.join(os.path.dirname(__file__), ".cache", "api_results")
    os.makedirs(_cache_dir, exist_ok=True)
    _result_cache = diskcache.Cache(_cache_dir)
    DISKCACHE_AVAILABLE = True
except ImportError:
    _result_cache = {}
    DISKCACHE_AVAILABLE = False

RESULT_EXPIRE_SECONDS = 7 * 24 * 60 * 60  # 7 days expiration
RESULT_KEY_PREFIX = "ace_step_v1.5_"

# =============================================================================
# Example Data for Random Sample
# =============================================================================

def _get_project_root() -> str:
    """Get project root directory"""
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_all_examples(sample_mode: str = "simple_mode") -> List[Dict[str, Any]]:
    """Load all example JSON files from examples directory"""
    project_root = _get_project_root()
    if sample_mode == "simple_mode":
        examples_dir = os.path.join(project_root, "examples", "simple_mode")
    else:
        examples_dir = os.path.join(project_root, "examples", "text2music")

    if not os.path.isdir(examples_dir):
        return []

    all_examples = []
    for filename in os.listdir(examples_dir):
        if filename.endswith(".json"):
            filepath = os.path.join(examples_dir, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        all_examples.extend(data)
                    elif isinstance(data, dict):
                        all_examples.append(data)
            except Exception:
                pass
    return all_examples


# Pre-load example data
SIMPLE_EXAMPLE_DATA = _load_all_examples("simple_mode")
CUSTOM_EXAMPLE_DATA = _load_all_examples("custom_mode")


def store_result(task_id: str, result: dict, status: str = "succeeded"):
    """Store result to diskcache"""
    data = {
        "result": result,
        "created_at": time.time(),
        "status": status
    }
    key = f"{RESULT_KEY_PREFIX}{task_id}"
    if DISKCACHE_AVAILABLE:
        _result_cache.set(key, data, expire=RESULT_EXPIRE_SECONDS)
    else:
        _result_cache[key] = data


def get_result(task_id: str) -> Optional[dict]:
    """Get result from diskcache"""
    key = f"{RESULT_KEY_PREFIX}{task_id}"
    if DISKCACHE_AVAILABLE:
        return _result_cache.get(key)
    else:
        return _result_cache.get(key)


router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return _wrap_response({
        "status": "ok",
        "service": "ACE-Step Gradio API",
        "version": "1.0",
    })


@router.get("/v1/status")
async def service_status(request: Request):
    """Get service status including DiT and LLM model info"""
    dit_handler = getattr(request.app.state, 'dit_handler', None)
    llm_handler = getattr(request.app.state, 'llm_handler', None)

    dit_info = None
    if dit_handler and dit_handler.model is not None:
        config_path = getattr(dit_handler, 'config_path', '') or ''
        dit_info = {
            "loaded": True,
            "model": os.path.basename(config_path.rstrip("/\\")) if config_path else "unknown",
            "is_turbo": getattr(getattr(dit_handler, 'config', None), 'is_turbo', False),
        }
    else:
        dit_info = {"loaded": False, "model": None, "is_turbo": False}

    llm_info = None
    if llm_handler:
        llm_info = {
            "loaded": getattr(llm_handler, 'llm_initialized', False),
            "model": getattr(llm_handler, 'lm_model_name', None),
            "backend": getattr(llm_handler, 'llm_backend', None),
        }
    else:
        llm_info = {"loaded": False, "model": None, "backend": None}

    return _wrap_response({
        "dit": dit_info,
        "llm": llm_info,
    })


@router.post("/v1/llm/swap")
async def swap_llm_model(request: Request):
    """Hot-swap the LLM model: unload current, load new one.
    
    Body JSON: { "model": "acestep-5Hz-lm-0.6B", "backend": "pt" }
    """
    llm_handler = getattr(request.app.state, 'llm_handler', None)
    if llm_handler is None:
        return _wrap_response({"error": "LLM handler not available"}, code=500)

    try:
        body = await request.json()
    except Exception:
        return _wrap_response({"error": "Invalid JSON body"}, code=400)

    model_name = body.get("model")
    backend = body.get("backend", "pt")

    if not model_name:
        return _wrap_response({"error": "Missing 'model' field"}, code=400)

    # Validate model name
    available = llm_handler.get_available_5hz_lm_models()
    if model_name not in available:
        return _wrap_response({
            "error": f"Model '{model_name}' not found. Available: {available}"
        }, code=404)

    # Perform the swap (blocking — takes 30-90s)
    status_msg, success = llm_handler.swap_model(model_name, backend=backend)

    return _wrap_response({
        "success": success,
        "message": status_msg,
        "model": model_name if success else None,
        "backend": llm_handler.llm_backend if success else None,
    }, code=200 if success else 500)


@router.get("/v1/models")
async def list_models(request: Request, _: None = Depends(verify_api_key)):
    """List available DiT models"""
    dit_handler = request.app.state.dit_handler

    models = []
    if dit_handler and dit_handler.model is not None:
        # Get current loaded model name
        config_path = getattr(dit_handler, 'config_path', '') or ''
        model_name = os.path.basename(config_path.rstrip("/\\")) if config_path else "unknown"
        models.append({
            "name": model_name,
            "is_default": True,
        })

    return _wrap_response({
        "models": models,
        "default_model": models[0]["name"] if models else None,
    })


@router.post("/v1/models/load")
async def load_model(request: Request, authorization: Optional[str] = Header(None)):
    """Load a DiT model by config directory name (hot-swap).

    Body: { "model": "acestep-v15-turbo" }
    """
    content_type = (request.headers.get("content-type") or "").lower()

    if "json" in content_type:
        body = await request.json()
    else:
        form = await request.form()
        body = {k: v for k, v in form.items()}

    verify_token_from_request(body, authorization)

    model_name = body.get("model")
    if not model_name:
        raise HTTPException(status_code=400, detail="Missing 'model' in request body")

    dit_handler = request.app.state.dit_handler
    if dit_handler is None:
        raise HTTPException(status_code=500, detail="DiT handler not initialized")

    try:
        # Re-initialize service with the requested model config path.
        # Preserve current device/offload settings where possible.
        project_root = dit_handler._get_project_root() if hasattr(dit_handler, '_get_project_root') else _get_project_root()
        device = getattr(dit_handler, 'device', 'auto')
        offload_to_cpu = getattr(dit_handler, 'offload_to_cpu', False)
        offload_dit_to_cpu = getattr(dit_handler, 'offload_dit_to_cpu', False)

        status_msg, enable_generate = dit_handler.initialize_service(
            project_root,
            model_name,
            device=device,
            use_flash_attention=False,
            compile_model=False,
            offload_to_cpu=offload_to_cpu,
            offload_dit_to_cpu=offload_dit_to_cpu,
        )

        if not enable_generate:
            # Report failure from initialize_service
            raise HTTPException(status_code=500, detail=status_msg)

        return _wrap_response({"status": status_msg, "model": model_name})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v1/audio")
async def get_audio(path: str, _: None = Depends(verify_api_key)):
    """Download audio file"""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Audio file not found: {path}")

    ext = os.path.splitext(path)[1].lower()
    media_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
    }
    media_type = media_types.get(ext, "audio/mpeg")

    return FileResponse(path, media_type=media_type)


@router.post("/create_random_sample")
async def create_random_sample(request: Request, authorization: Optional[str] = Header(None)):
    """Get random sample parameters from pre-loaded example data"""
    content_type = (request.headers.get("content-type") or "").lower()

    if "json" in content_type:
        body = await request.json()
    else:
        form = await request.form()
        body = {k: v for k, v in form.items()}

    verify_token_from_request(body, authorization)
    sample_type = body.get("sample_type", "simple_mode") or "simple_mode"

    if sample_type == "simple_mode":
        example_data = SIMPLE_EXAMPLE_DATA
    else:
        example_data = CUSTOM_EXAMPLE_DATA

    if not example_data:
        return _wrap_response(None, code=500, error="No example data available")

    random_example = random.choice(example_data)
    return _wrap_response(random_example)


@router.post("/query_result")
async def query_result(request: Request, authorization: Optional[str] = Header(None)):
    """Batch query task results"""
    content_type = (request.headers.get("content-type") or "").lower()

    if "json" in content_type:
        body = await request.json()
    else:
        form = await request.form()
        body = {k: v for k, v in form.items()}

    verify_token_from_request(body, authorization)
    task_ids = body.get("task_id_list", [])

    if isinstance(task_ids, str):
        try:
            task_ids = json.loads(task_ids)
        except Exception:
            task_ids = []

    results = []
    for task_id in task_ids:
        data = get_result(task_id)
        if data and data.get("status") == "succeeded":
            results.append({
                "task_id": task_id,
                "status": 1,
                "result": json.dumps(data["result"], ensure_ascii=False)
            })
        else:
            results.append({
                "task_id": task_id,
                "status": 0,
                "result": "[]"
            })

    return _wrap_response(results)


@router.post("/format_input")
async def format_input(request: Request, authorization: Optional[str] = Header(None)):
    """Format and enhance lyrics/caption via LLM"""
    llm_handler = request.app.state.llm_handler

    if not llm_handler or not llm_handler.llm_initialized:
        return _wrap_response(None, code=500, error="LLM not initialized")

    content_type = (request.headers.get("content-type") or "").lower()
    if "json" in content_type:
        body = await request.json()
    else:
        form = await request.form()
        body = {k: v for k, v in form.items()}

    verify_token_from_request(body, authorization)

    caption = body.get("prompt", "") or ""
    lyrics = body.get("lyrics", "") or ""
    temperature = float(body.get("temperature", 0.85))

    from acestep.inference import format_sample

    try:
        result = format_sample(
            llm_handler=llm_handler,
            caption=caption,
            lyrics=lyrics,
            temperature=temperature,
            use_constrained_decoding=True,
        )

        if not result.success:
            return _wrap_response(None, code=500, error=result.status_message)

        return _wrap_response({
            "caption": result.caption or caption,
            "lyrics": result.lyrics or lyrics,
            "bpm": result.bpm,
            "key_scale": result.keyscale,
            "time_signature": result.timesignature,
            "duration": result.duration,
            "vocal_language": result.language or "unknown",
        })
    except Exception as e:
        return _wrap_response(None, code=500, error=str(e))


@router.post("/release_task")
async def release_task(request: Request, authorization: Optional[str] = Header(None)):
    """Create music generation task"""
    dit_handler = request.app.state.dit_handler
    llm_handler = request.app.state.llm_handler

    if not dit_handler or dit_handler.model is None:
        raise HTTPException(status_code=500, detail="DiT model not initialized")

    content_type = (request.headers.get("content-type") or "").lower()
    if "json" in content_type:
        body = await request.json()
    else:
        form = await request.form()
        body = {k: v for k, v in form.items()}

    verify_token_from_request(body, authorization)
    task_id = str(uuid4())

    from acestep.inference import generate_music, GenerationParams, GenerationConfig, create_sample, format_sample

    # Parse param_obj if provided
    param_obj = body.get("param_obj", {})
    if isinstance(param_obj, str):
        try:
            param_obj = json.loads(param_obj)
        except Exception:
            param_obj = {}

    # Helper to get param with aliases
    def get_param(key, *aliases, default=None):
        for k in [key] + list(aliases):
            if k in body and body[k] is not None:
                return body[k]
            if k in param_obj and param_obj[k] is not None:
                return param_obj[k]
        return default

    def to_bool(val, default=False):
        if val is None:
            return default
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() in ("true", "1", "yes")
        return bool(val)

    try:
        # Get sample_mode and sample_query parameters
        sample_mode = to_bool(get_param("sample_mode", "sampleMode"), False)
        sample_query = get_param("sample_query", "sampleQuery", "description", "desc", default="") or ""
        use_format = to_bool(get_param("use_format", "useFormat"), False)
        has_sample_query = bool(sample_query and sample_query.strip())

        # Get base parameters
        caption = get_param("prompt", "caption", default="") or ""
        lyrics = get_param("lyrics", default="") or ""
        vocal_language = get_param("vocal_language", "language", default="en") or "en"
        lm_temperature = float(get_param("lm_temperature", "temperature", default=0.85) or 0.85)

        # Process sample_mode: use LLM to auto-generate caption/lyrics/metas
        if sample_mode or has_sample_query:
            if not llm_handler or not llm_handler.llm_initialized:
                raise HTTPException(status_code=500, detail="sample_mode requires LLM to be initialized")

            query = sample_query if has_sample_query else "NO USER INPUT"
            sample_result = create_sample(
                llm_handler=llm_handler,
                query=query,
                vocal_language=vocal_language if vocal_language not in ("en", "unknown", "") else None,
                temperature=lm_temperature,
            )

            if not sample_result.success:
                raise HTTPException(status_code=500, detail=sample_result.error or sample_result.status_message)

            # Use generated values
            caption = sample_result.caption or caption
            lyrics = sample_result.lyrics or lyrics
            # Override metas from sample result if available
            sample_bpm = sample_result.bpm
            sample_duration = sample_result.duration
            sample_keyscale = sample_result.keyscale
            sample_timesignature = sample_result.timesignature
            sample_language = sample_result.language or vocal_language
        else:
            sample_bpm = None
            sample_duration = None
            sample_keyscale = None
            sample_timesignature = None
            sample_language = vocal_language

        # Process use_format: enhance caption/lyrics via LLM
        if use_format and not sample_mode and not has_sample_query:
            if llm_handler and llm_handler.llm_initialized:
                format_result = format_sample(
                    llm_handler=llm_handler,
                    caption=caption,
                    lyrics=lyrics,
                    temperature=lm_temperature,
                )
                if format_result.success:
                    caption = format_result.caption or caption
                    lyrics = format_result.lyrics or lyrics
                    if format_result.bpm:
                        sample_bpm = format_result.bpm
                    if format_result.duration:
                        sample_duration = format_result.duration
                    if format_result.keyscale:
                        sample_keyscale = format_result.keyscale
                    if format_result.timesignature:
                        sample_timesignature = format_result.timesignature
                    if format_result.language:
                        sample_language = format_result.language

        # Build generation params with alias support
        params = GenerationParams(
            task_type=get_param("task_type", default="text2music"),
            caption=caption,
            lyrics=lyrics,
            bpm=sample_bpm or get_param("bpm"),
            keyscale=sample_keyscale or get_param("key_scale", "keyscale", "key", default=""),
            timesignature=sample_timesignature or get_param("time_signature", "timesignature", default=""),
            duration=sample_duration or get_param("audio_duration", "duration", default=-1),
            vocal_language=sample_language,
            inference_steps=get_param("inference_steps", default=8),
            guidance_scale=float(get_param("guidance_scale", default=7.0) or 7.0),
            seed=int(get_param("seed", default=-1) or -1),
            thinking=to_bool(get_param("thinking"), False),
            lm_temperature=lm_temperature,
            lm_cfg_scale=float(get_param("lm_cfg_scale", default=2.0) or 2.0),
            lm_negative_prompt=get_param("lm_negative_prompt", default="NO USER INPUT") or "NO USER INPUT",
            lm_repetition_penalty=float(get_param("lm_repetition_penalty", default=1.2) or 1.2),
            lm_no_repeat_ngram_size=int(get_param("lm_no_repeat_ngram_size", default=0) or 0),
            apg_norm_threshold=float(get_param("apg_norm_threshold", default=2.5) or 2.5),
            apg_momentum=float(get_param("apg_momentum", default=-0.75) or -0.75),
            apg_eta=float(get_param("apg_eta", default=0.0) or 0.0),
        )

        config = GenerationConfig(
            batch_size=get_param("batch_size", default=2),
            use_random_seed=get_param("use_random_seed", default=True),
            audio_format=get_param("audio_format", default="mp3"),
        )

        # Get temp directory
        import tempfile
        save_dir = tempfile.gettempdir()

        # Call generation function
        result = generate_music(
            dit_handler=dit_handler,
            llm_handler=llm_handler if llm_handler and llm_handler.llm_initialized else None,
            params=params,
            config=config,
            save_dir=save_dir,
        )

        if not result.success:
            raise HTTPException(status_code=500, detail=result.error or result.status_message)

        # Extract audio paths
        audio_paths = [a["path"] for a in result.audios if a.get("path")]

        # Build result data with download URLs
        from urllib.parse import urlencode
        result_data = [{
            "file": p,
            "url": f"/v1/audio?{urlencode({'path': p})}",
            "status": 1,
            "create_time": int(time.time()),
        } for p in audio_paths]

        # Store result
        store_result(task_id, result_data)

        return _wrap_response({"task_id": task_id, "status": "succeeded"})

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lora_status")
async def lora_status(request: Request):
    """Get current LoRA status including trigger tag and metadata.
    
    Returns JSON with:
    - loaded: bool
    - active: bool
    - scale: float
    - trigger_tag: str (empty if none)
    - tag_position: str (prepend/append)
    - name: str
    - rank: int
    - alpha: int
    - path: str
    """
    dit_handler = request.app.state.dit_handler
    
    if not dit_handler:
        return _wrap_response({
            "loaded": False,
            "active": False,
            "scale": 1.0,
            "trigger_tag": "",
            "tag_position": "prepend",
            "name": "",
            "path": "",
        })
    
    try:
        status = dit_handler.get_lora_status()
        return _wrap_response(status)
    except Exception as e:
        return _wrap_response(None, code=500, error=str(e))


@router.get("/v1/vram/diagnostic")
async def vram_diagnostic(request: Request):
    """Deep VRAM diagnostic: scan all model components on GPU, list sizes, detect LoRA stacking."""
    import torch
    import gc

    dit_handler = request.app.state.dit_handler
    report = {
        "cuda_available": torch.cuda.is_available(),
        "components": [],
        "lora_state": {},
        "warnings": [],
        "summary": {},
    }

    if not torch.cuda.is_available():
        return _wrap_response(report)

    device = torch.cuda.current_device()
    report["summary"]["allocated_mb"] = round(torch.cuda.memory_allocated(device) / 1048576, 1)
    report["summary"]["reserved_mb"] = round(torch.cuda.memory_reserved(device) / 1048576, 1)
    report["summary"]["max_allocated_mb"] = round(torch.cuda.max_memory_allocated(device) / 1048576, 1)

    # nvidia-smi total
    try:
        import subprocess
        r = subprocess.run(
            ['nvidia-smi', '--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0:
            parts = r.stdout.strip().split(',')
            report["summary"]["nvidia_used_mb"] = int(parts[0].strip())
            report["summary"]["nvidia_total_mb"] = int(parts[1].strip())
    except Exception:
        pass

    def count_params_on_device(module, target="cuda"):
        """Count params on a specific device and their memory."""
        total_params = 0
        total_bytes = 0
        for p in module.parameters():
            if p.device.type == target:
                total_params += p.numel()
                total_bytes += p.numel() * p.element_size()
        return total_params, total_bytes

    def detect_peft_layers(module):
        """Detect PEFT/LoRA layers in a module."""
        lora_layers = []
        peft_wrappers = 0
        try:
            for name, m in module.named_modules():
                cls_name = type(m).__name__
                if 'Lora' in cls_name or 'lora' in cls_name:
                    params = sum(p.numel() for p in m.parameters())
                    on_gpu = sum(p.numel() for p in m.parameters() if p.device.type == "cuda")
                    lora_layers.append({"name": name, "type": cls_name, "params": params, "on_gpu": on_gpu})
                if cls_name == "PeftModel" or cls_name == "PeftModelForCausalLM":
                    peft_wrappers += 1
        except Exception:
            pass
        return lora_layers, peft_wrappers

    if dit_handler:
        # Main model (DiT)
        if dit_handler.model is not None:
            gpu_params, gpu_bytes = count_params_on_device(dit_handler.model, "cuda")
            cpu_params, cpu_bytes = count_params_on_device(dit_handler.model, "cpu")
            report["components"].append({
                "name": "DiT Model (self.model)",
                "gpu_params": gpu_params,
                "gpu_mb": round(gpu_bytes / 1048576, 1),
                "cpu_params": cpu_params,
                "cpu_mb": round(cpu_bytes / 1048576, 1),
            })

            # Check decoder specifically
            if hasattr(dit_handler.model, 'decoder'):
                dec = dit_handler.model.decoder
                dec_gpu_p, dec_gpu_b = count_params_on_device(dec, "cuda")
                dec_cpu_p, dec_cpu_b = count_params_on_device(dec, "cpu")
                lora_layers, peft_wrappers = detect_peft_layers(dec)
                report["components"].append({
                    "name": "  └─ Decoder",
                    "gpu_params": dec_gpu_p,
                    "gpu_mb": round(dec_gpu_b / 1048576, 1),
                    "cpu_params": dec_cpu_p,
                    "cpu_mb": round(dec_cpu_b / 1048576, 1),
                    "type": type(dec).__name__,
                    "lora_layers_count": len(lora_layers),
                    "peft_wrappers": peft_wrappers,
                })
                if lora_layers:
                    total_lora_gpu = sum(l["on_gpu"] for l in lora_layers)
                    report["lora_state"]["active_lora_layers"] = len(lora_layers)
                    report["lora_state"]["lora_gpu_params"] = total_lora_gpu
                    report["lora_state"]["lora_gpu_mb"] = round(total_lora_gpu * 2 / 1048576, 1)  # bf16 = 2 bytes
                if peft_wrappers > 1:
                    report["warnings"].append(f"CRITICAL: {peft_wrappers} PeftModel wrappers detected! LoRAs are STACKING.")
                if len(lora_layers) > 200:
                    report["warnings"].append(f"Excessive LoRA layers ({len(lora_layers)}) — possible stacking of multiple adapters.")

        # VAE
        if dit_handler.vae is not None:
            gpu_params, gpu_bytes = count_params_on_device(dit_handler.vae, "cuda")
            report["components"].append({
                "name": "VAE",
                "gpu_params": gpu_params,
                "gpu_mb": round(gpu_bytes / 1048576, 1),
            })

        # Text encoder
        if dit_handler.text_encoder is not None:
            gpu_params, gpu_bytes = count_params_on_device(dit_handler.text_encoder, "cuda")
            report["components"].append({
                "name": "Text Encoder",
                "gpu_params": gpu_params,
                "gpu_mb": round(gpu_bytes / 1048576, 1),
            })

        # Base decoder backup
        if dit_handler._base_decoder is not None:
            cpu_params, cpu_bytes = count_params_on_device(dit_handler._base_decoder, "cpu")
            gpu_params, gpu_bytes = count_params_on_device(dit_handler._base_decoder, "cuda")
            report["components"].append({
                "name": "_base_decoder (LoRA backup)",
                "gpu_params": gpu_params,
                "gpu_mb": round(gpu_bytes / 1048576, 1),
                "cpu_params": cpu_params,
                "cpu_mb": round(cpu_bytes / 1048576, 1),
            })
            if gpu_bytes > 0:
                report["warnings"].append(f"_base_decoder has {round(gpu_bytes/1048576,1)} MB still on GPU! Should be on CPU only.")
        
        # LoRA flags
        report["lora_state"]["lora_loaded_flag"] = getattr(dit_handler, 'lora_loaded', False)
        report["lora_state"]["use_lora_flag"] = getattr(dit_handler, 'use_lora', False)
        report["lora_state"]["lora_scale"] = getattr(dit_handler, 'lora_scale', 1.0)
        report["lora_state"]["has_base_decoder_backup"] = dit_handler._base_decoder is not None

    # Count all CUDA tensors in the process (gc-tracked objects)
    cuda_tensor_count = 0
    cuda_tensor_bytes = 0
    for obj in gc.get_objects():
        try:
            if torch.is_tensor(obj) and obj.is_cuda:
                cuda_tensor_count += 1
                cuda_tensor_bytes += obj.numel() * obj.element_size()
        except Exception:
            pass
    report["summary"]["gc_cuda_tensors"] = cuda_tensor_count
    report["summary"]["gc_cuda_mb"] = round(cuda_tensor_bytes / 1048576, 1)

    total_component_gpu = sum(c.get("gpu_mb", 0) for c in report["components"])
    report["summary"]["total_component_gpu_mb"] = round(total_component_gpu, 1)

    if not report["warnings"]:
        report["warnings"].append("No issues detected.")

    return _wrap_response(report)


@router.post("/v1/vram/force_cleanup")
async def vram_force_cleanup(request: Request):
    """Nuclear VRAM cleanup: force-unload LoRA, delete stale references, gc, empty cache."""
    import torch
    import gc

    dit_handler = request.app.state.dit_handler
    actions = []

    if dit_handler:
        # Force-unload LoRA if loaded
        if getattr(dit_handler, 'lora_loaded', False) or dit_handler._base_decoder is not None:
            try:
                # If decoder is wrapped in PeftModel, try to merge and unload
                try:
                    from peft import PeftModel
                    if isinstance(dit_handler.model.decoder, PeftModel):
                        dit_handler.model.decoder = dit_handler.model.decoder.merge_and_unload()
                        actions.append("Merged PeftModel and unloaded adapter layers")
                except Exception as e:
                    actions.append(f"PeftModel merge failed: {e}")

                # Restore from backup if available
                if dit_handler._base_decoder is not None:
                    import copy
                    old_decoder = dit_handler.model.decoder
                    dit_handler.model.decoder = copy.deepcopy(dit_handler._base_decoder)
                    dit_handler.model.decoder = dit_handler.model.decoder.to(dit_handler.device).to(dit_handler.dtype)
                    dit_handler.model.decoder.eval()
                    # Free old decoder
                    try:
                        old_decoder.to("cpu")
                    except Exception:
                        pass
                    del old_decoder
                    actions.append("Restored base decoder from backup")

                    # Free backup
                    del dit_handler._base_decoder
                    dit_handler._base_decoder = None
                    actions.append("Freed _base_decoder backup")

                dit_handler.lora_loaded = False
                dit_handler.use_lora = False
                dit_handler.lora_scale = 1.0
                actions.append("Reset LoRA flags")
            except Exception as e:
                actions.append(f"LoRA cleanup error: {e}")

    # Aggressive GC
    gc.collect()
    gc.collect()
    gc.collect()
    actions.append(f"GC collected: {gc.collect()} objects")

    if torch.cuda.is_available():
        before = torch.cuda.memory_allocated() / 1048576
        torch.cuda.empty_cache()
        after = torch.cuda.memory_allocated() / 1048576
        torch.cuda.reset_peak_memory_stats()
        actions.append(f"CUDA cache cleared, freed {round(before - after, 1)} MB allocated")

    return _wrap_response({"actions": actions, "success": True})


def setup_api_routes_to_app(app, dit_handler, llm_handler, api_key: Optional[str] = None):
    """
    Mount API routes to a FastAPI application (for use with gr.mount_gradio_app)

    Args:
        app: FastAPI application instance
        dit_handler: DiT handler
        llm_handler: LLM handler
        api_key: Optional API key for authentication
    """
    set_api_key(api_key)
    app.state.dit_handler = dit_handler
    app.state.llm_handler = llm_handler
    app.include_router(router)


def setup_api_routes(demo, dit_handler, llm_handler, api_key: Optional[str] = None):
    """
    Mount API routes to Gradio application

    Args:
        demo: Gradio Blocks instance
        dit_handler: DiT handler
        llm_handler: LLM handler
        api_key: Optional API key for authentication
    """
    set_api_key(api_key)
    app = demo.app
    app.state.dit_handler = dit_handler
    app.state.llm_handler = llm_handler
    app.include_router(router)

