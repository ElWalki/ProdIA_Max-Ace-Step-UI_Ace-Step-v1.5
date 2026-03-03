import { Router, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { resolvePythonPath } from '../services/acestep.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

function resolveAceStepDir(): string {
  const envPath = process.env.ACESTEP_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(__dirname, '../../../ACE-Step-1.5');
}

/**
 * Run the vram_manager.py script with a given action.
 */
function runVramScript(action: 'status' | 'purge'): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const ACESTEP_DIR = resolveAceStepDir();
    let pythonPath: string;
    try {
      pythonPath = resolvePythonPath(ACESTEP_DIR);
    } catch {
      pythonPath = 'python';
    }

    const scriptPath = path.join(SCRIPTS_DIR, 'vram_manager.py');
    const args = [scriptPath, '--action', action, '--json'];

    const proc = spawn(pythonPath, args, {
      cwd: ACESTEP_DIR,
      env: { ...process.env, ACESTEP_PATH: ACESTEP_DIR },
      timeout: 15000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        const lines = stdout.trim().split('\n');
        let jsonStr = '';
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].startsWith('{')) { jsonStr = lines[i]; break; }
        }
        try {
          const parsed = JSON.parse(jsonStr || stdout);
          resolve({ success: true, data: parsed });
        } catch {
          resolve({ success: false, error: 'Failed to parse VRAM status output' });
        }
      } else {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      // If python is not available, try nvidia-smi directly as fallback
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Fallback: get VRAM status via nvidia-smi directly (no Python needed).
 */
function getNvidiaSmiStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('nvidia-smi', [
      '--query-gpu=memory.used,memory.total,memory.free,gpu_name,temperature.gpu,utilization.gpu',
      '--format=csv,noheader,nounits',
    ], { timeout: 10000 });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        const lines = stdout.trim().split('\n');
        const gpus = lines.map((line, i) => {
          const parts = line.split(',').map(s => s.trim());
          const used = parseInt(parts[0]) || 0;
          const total = parseInt(parts[1]) || 0;
          const free = parseInt(parts[2]) || 0;
          return {
            index: i,
            name: parts[3] || 'Unknown GPU',
            used_mb: used,
            total_mb: total,
            free_mb: free,
            usage_percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
            temperature: parseInt(parts[4]) || 0,
            utilization: parseInt(parts[5]) || 0,
          };
        });
        resolve({
          success: true,
          data: {
            success: true,
            gpus,
            gpu_count: gpus.length,
            primary_gpu: gpus[0] || null,
            torch: null,
          },
        });
      } else {
        resolve({ success: false, error: stderr || 'nvidia-smi not available' });
      }
    });

    proc.on('error', () => {
      resolve({ success: false, error: 'nvidia-smi not found' });
    });
  });
}

// GET /api/vram/status — Get current VRAM usage
router.get('/status', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Try Python script first (has torch info), fallback to nvidia-smi
    let result = await runVramScript('status');
    if (!result.success) {
      result = await getNvidiaSmiStatus();
    }

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[VRAM] Status error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/vram/purge — Force garbage collection + CUDA cache clear
router.post('/purge', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await runVramScript('purge');
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[VRAM] Purge error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
