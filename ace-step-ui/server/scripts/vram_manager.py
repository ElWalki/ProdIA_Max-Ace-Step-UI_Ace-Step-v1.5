#!/usr/bin/env python3
"""
VRAM monitoring and memory purge utility for ACE-Step.

Usage:
  python vram_manager.py --action status   # Get VRAM usage info
  python vram_manager.py --action purge    # Force garbage collection + CUDA cache clear

Output: JSON with VRAM stats.
"""

import argparse
import json
import gc
import sys
import subprocess
import os


def get_vram_nvidia_smi():
    """Get VRAM info using nvidia-smi (works even without torch loaded)."""
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=memory.used,memory.total,memory.free,gpu_name,temperature.gpu,utilization.gpu',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            gpus = []
            for i, line in enumerate(lines):
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 6:
                    used = int(parts[0])
                    total = int(parts[1])
                    free = int(parts[2])
                    name = parts[3]
                    temp = int(parts[4]) if parts[4].isdigit() else 0
                    util = int(parts[5]) if parts[5].isdigit() else 0
                    gpus.append({
                        'index': i,
                        'name': name,
                        'used_mb': used,
                        'total_mb': total,
                        'free_mb': free,
                        'usage_percent': round((used / total) * 100, 1) if total > 0 else 0,
                        'temperature': temp,
                        'utilization': util,
                    })
            return gpus
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass
    return []


def get_vram_torch():
    """Get VRAM info using PyTorch CUDA (more accurate for torch allocations)."""
    try:
        import torch
        if not torch.cuda.is_available():
            return None

        device = torch.cuda.current_device()
        allocated = torch.cuda.memory_allocated(device) / (1024 * 1024)  # MB
        reserved = torch.cuda.memory_reserved(device) / (1024 * 1024)  # MB
        max_allocated = torch.cuda.max_memory_allocated(device) / (1024 * 1024)  # MB
        max_reserved = torch.cuda.max_memory_reserved(device) / (1024 * 1024)  # MB

        return {
            'allocated_mb': round(allocated, 1),
            'reserved_mb': round(reserved, 1),
            'max_allocated_mb': round(max_allocated, 1),
            'max_reserved_mb': round(max_reserved, 1),
            'fragmentation_mb': round(reserved - allocated, 1),
        }
    except ImportError:
        return None
    except Exception:
        return None


def purge_memory():
    """Aggressive memory cleanup: gc + torch CUDA cache."""
    freed_info = {
        'gc_collected': 0,
        'cuda_cache_cleared': False,
        'cuda_memory_reset': False,
    }

    # Python garbage collection
    gc.collect()
    gc.collect()
    freed_info['gc_collected'] = gc.collect()

    # PyTorch CUDA cleanup
    try:
        import torch
        if torch.cuda.is_available():
            before_reserved = torch.cuda.memory_reserved() / (1024 * 1024)

            torch.cuda.empty_cache()
            freed_info['cuda_cache_cleared'] = True

            # Reset peak memory stats for fresh tracking
            torch.cuda.reset_peak_memory_stats()
            freed_info['cuda_memory_reset'] = True

            after_reserved = torch.cuda.memory_reserved() / (1024 * 1024)
            freed_info['freed_mb'] = round(before_reserved - after_reserved, 1)
    except ImportError:
        freed_info['note'] = 'torch not available in this environment'
    except Exception as e:
        freed_info['error'] = str(e)

    return freed_info


def main():
    parser = argparse.ArgumentParser(description='VRAM monitoring and memory purge')
    parser.add_argument('--action', choices=['status', 'purge'], required=True)
    parser.add_argument('--json', action='store_true', default=True)
    args = parser.parse_args()

    result = {}

    if args.action == 'status':
        gpus = get_vram_nvidia_smi()
        torch_info = get_vram_torch()
        result = {
            'success': True,
            'gpus': gpus,
            'torch': torch_info,
            'gpu_count': len(gpus),
            'primary_gpu': gpus[0] if gpus else None,
        }

    elif args.action == 'purge':
        # Get before stats
        gpus_before = get_vram_nvidia_smi()
        before_used = gpus_before[0]['used_mb'] if gpus_before else 0

        purge_info = purge_memory()

        # Get after stats
        gpus_after = get_vram_nvidia_smi()
        after_used = gpus_after[0]['used_mb'] if gpus_after else 0

        result = {
            'success': True,
            'purge': purge_info,
            'before_used_mb': before_used,
            'after_used_mb': after_used,
            'nvidia_freed_mb': before_used - after_used,
            'gpus': gpus_after,
            'primary_gpu': gpus_after[0] if gpus_after else None,
        }

    print(json.dumps(result))


if __name__ == '__main__':
    main()
