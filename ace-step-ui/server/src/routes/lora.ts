import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getGradioClient } from '../services/gradio-client.js';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';

const router = Router();

// Local LoRA state tracking (enriched with trigger_tag from Gradio)
let loraState: {
  loaded: boolean;
  active: boolean;
  scale: number;
  path: string;
  trigger_tag: string;
  tag_position: string;
  name: string;
  rank: number;
  alpha: number;
} = {
  loaded: false,
  active: false,
  scale: 1.0,
  path: '',
  trigger_tag: '',
  tag_position: 'prepend',
  name: '',
  rank: 0,
  alpha: 0,
};

/**
 * Fetch full LoRA status from Gradio API (includes trigger_tag, rank, etc.)
 */
async function fetchGradioLoraStatus(): Promise<void> {
  try {
    const client = await getGradioClient();
    const result = await client.predict('/get_lora_status', []);
    const data = (result.data as unknown[])[0] as Record<string, unknown>;
    if (data && typeof data === 'object') {
      loraState.loaded = !!data.loaded;
      loraState.active = !!data.active;
      loraState.scale = typeof data.scale === 'number' ? data.scale : loraState.scale;
      loraState.path = (data.path as string) || loraState.path;
      loraState.trigger_tag = (data.trigger_tag as string) || '';
      loraState.tag_position = (data.tag_position as string) || 'prepend';
      loraState.name = (data.name as string) || '';
      loraState.rank = typeof data.rank === 'number' ? data.rank : 0;
      loraState.alpha = typeof data.alpha === 'number' ? data.alpha : 0;
    }
  } catch (error) {
    console.warn('[LoRA] Could not fetch status from Gradio:', error instanceof Error ? error.message : error);
  }
}

// POST /api/lora/load — Load a LoRA adapter
router.post('/load', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lora_path } = req.body;
    if (!lora_path || typeof lora_path !== 'string') {
      res.status(400).json({ error: 'lora_path is required' });
      return;
    }

    const client = await getGradioClient();
    const result = await client.predict('/load_lora', [lora_path]);
    const status = (result.data as unknown[])[0] as string;

    // Fetch full status from Gradio (includes trigger_tag, rank, etc.)
    loraState = { ...loraState, loaded: true, active: true, path: lora_path };
    await fetchGradioLoraStatus();

    res.json({ message: status, lora_path, loaded: true, trigger_tag: loraState.trigger_tag });
  } catch (error) {
    console.error('[LoRA] Load error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load LoRA' });
  }
});

// POST /api/lora/unload — Unload the current LoRA adapter
router.post('/unload', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await getGradioClient();
    const result = await client.predict('/unload_lora', []);
    const status = (result.data as unknown[])[0] as string;

    loraState = { loaded: false, active: false, scale: 1.0, path: '', trigger_tag: '', tag_position: 'prepend', name: '', rank: 0, alpha: 0 };

    res.json({ message: status });
  } catch (error) {
    console.error('[LoRA] Unload error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to unload LoRA' });
  }
});

// POST /api/lora/scale — Set LoRA scale (0.0 - 2.0)
router.post('/scale', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { scale } = req.body;
    if (typeof scale !== 'number' || scale < 0 || scale > 2) {
      res.status(400).json({ error: 'scale must be a number between 0 and 2' });
      return;
    }

    const client = await getGradioClient();
    const result = await client.predict('/set_lora_scale', [scale]);
    const status = (result.data as unknown[])[0] as string;

    loraState.scale = scale;

    res.json({ message: status, scale });
  } catch (error) {
    console.error('[LoRA] Scale error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to set LoRA scale' });
  }
});

// POST /api/lora/toggle — Toggle LoRA on/off
router.post('/toggle', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    const useLoRA = typeof enabled === 'boolean' ? enabled : !loraState.active;

    const client = await getGradioClient();
    const result = await client.predict('/set_use_lora', [useLoRA]);
    const status = (result.data as unknown[])[0] as string;

    loraState.active = useLoRA;

    res.json({ message: status, active: useLoRA });
  } catch (error) {
    console.error('[LoRA] Toggle error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to toggle LoRA' });
  }
});

// GET /api/lora/status — Get current LoRA state (with trigger_tag)
router.get('/status', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  // Optionally refresh from Gradio if LoRA is loaded
  if (loraState.loaded) {
    await fetchGradioLoraStatus();
  }
  res.json(loraState);
});

// POST /api/lora/tag-position — Change trigger tag injection mode (prepend/append/off)
router.post('/tag-position', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tag_position } = req.body;
    const valid = ['prepend', 'append', 'off'];
    if (!tag_position || !valid.includes(tag_position)) {
      res.status(400).json({ error: `tag_position must be one of: ${valid.join(', ')}` });
      return;
    }

    const client = await getGradioClient();
    const result = await client.predict('/set_tag_position', [tag_position]);
    const status = (result.data as unknown[])[0] as string;

    loraState.tag_position = tag_position;

    res.json({ message: status, tag_position });
  } catch (error) {
    console.error('[LoRA] Tag position error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to set tag position' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/lora/list — Scan lora_library/ and lora_output*/ to build a
//   structured list of available LoRAs with their checkpoints.
//   Body: { directories?: string[] } — optional custom directories to scan
//   Returns: { loras: LoraEntry[], defaultDirectory: string }
// ──────────────────────────────────────────────────────────────────────────────

interface LoraVariant {
  label: string;        // e.g. "final", "epoch_50", "epoch_100"
  path: string;         // absolute path to the adapter directory
  epoch?: number;       // numeric epoch for sorting (undefined for "final")
}

interface LoraEntry {
  name: string;                 // display name (folder name)
  source: 'library' | 'output'; // where it was found
  sourceDir: string;            // parent directory name (e.g. "lora_library", "lora_output_walki-bassv3")
  variants: LoraVariant[];      // available variants (final + checkpoints)
  metadata?: Record<string, unknown>; // from lora_metadata.json if present
  baseModel?: string;           // from adapter_config.json "base_model_name_or_path"
}

function resolveAcestepDir(): string {
  return process.env.ACESTEP_PATH || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../../ACE-Step-1.5');
}

/**
 * Read JSON file safely, returns null on failure.
 */
function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

/**
 * Check if a directory contains a PEFT adapter (adapter_config.json).
 */
function isAdapterDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'adapter_config.json'));
}

/**
 * Scan a lora_library/-style directory.
 * Handles BOTH:
 *   1) Simple adapters: child folder directly contains adapter_config.json
 *   2) Training outputs: child folder contains final/ or checkpoints/ subdirectories
 */
function scanLibrary(libraryDir: string): LoraEntry[] {
  if (!fs.existsSync(libraryDir)) return [];
  const entries: LoraEntry[] = [];
  for (const name of fs.readdirSync(libraryDir)) {
    const full = path.join(libraryDir, name);
    if (!fs.statSync(full).isDirectory()) continue;
    
    // Case 1: Simple adapter (adapter_config.json at root)
    if (isAdapterDir(full)) {
      const metadata = readJsonSafe(path.join(full, 'lora_metadata.json'));
      const adapterCfg = readJsonSafe(path.join(full, 'adapter_config.json'));
      entries.push({
        name,
        source: 'library',
        sourceDir: path.basename(libraryDir),
        variants: [{ label: 'final', path: full }],
        metadata: metadata ?? undefined,
        baseModel: adapterCfg?.base_model_name_or_path as string | undefined,
      });
      continue;
    }
    
    // Case 2: Training output structure (has final/, best/, checkpoints/, etc.)
    const hasFinal = fs.existsSync(path.join(full, 'final')) || fs.existsSync(path.join(full, 'final_lora')) || fs.existsSync(path.join(full, 'best'));
    const hasCheckpoints = fs.existsSync(path.join(full, 'checkpoints'));
    if (hasFinal || hasCheckpoints) {
      // Use scanOutputDir but override source to 'library'
      const outputEntries = scanOutputDir(full, name);
      for (const entry of outputEntries) {
        entry.source = 'library';
        entry.sourceDir = path.basename(libraryDir);
      }
      entries.push(...outputEntries);
    }
  }
  return entries;
}

/**
 * Scan a lora_output/-style directory.
 * Structure:
 *   <outputDir>/final_lora/adapter/adapter_config.json   → "final"
 *   <outputDir>/final/adapter/adapter_config.json         → "final"
 *   <outputDir>/checkpoints/epoch_X/adapter/adapter_config.json   → "epoch_X"
 *
 * We also handle the nested case: <outputDir>/lora_output/<same structure>
 */
function scanOutputDir(outputDir: string, sourceDir?: string): LoraEntry[] {
  if (!fs.existsSync(outputDir)) return [];
  const entries: LoraEntry[] = [];

  const dirName = sourceDir || path.basename(outputDir);

  // Collect variants
  const variants: LoraVariant[] = [];

  // Check for final adapter in multiple possible locations
  const finalCandidates = [
    path.join(outputDir, 'final_lora', 'adapter'),
    path.join(outputDir, 'final_lora'),
    path.join(outputDir, 'final', 'adapter'),
    path.join(outputDir, 'final'),
  ];
  for (const candidate of finalCandidates) {
    if (isAdapterDir(candidate)) {
      variants.push({ label: 'final', path: candidate });
      break;
    }
  }

  // Check for "best" adapter (Side-Step trainer output)
  const bestCandidates = [
    path.join(outputDir, 'best', 'adapter'),
    path.join(outputDir, 'best'),
  ];
  for (const candidate of bestCandidates) {
    if (isAdapterDir(candidate)) {
      variants.push({ label: 'best', path: candidate });
      break;
    }
  }

  // Check for checkpoints
  const checkpointsDir = path.join(outputDir, 'checkpoints');
  if (fs.existsSync(checkpointsDir) && fs.statSync(checkpointsDir).isDirectory()) {
    for (const epochName of fs.readdirSync(checkpointsDir)) {
      const epochDir = path.join(checkpointsDir, epochName);
      if (!fs.statSync(epochDir).isDirectory()) continue;
      if (!epochName.startsWith('epoch_')) continue;

      // Adapter might be at epochDir/adapter/ or directly at epochDir
      const adapterPath = isAdapterDir(path.join(epochDir, 'adapter'))
        ? path.join(epochDir, 'adapter')
        : isAdapterDir(epochDir) ? epochDir : null;

      if (adapterPath) {
        const epochNum = parseInt(epochName.replace('epoch_', ''), 10);
        variants.push({ label: epochName, path: adapterPath, epoch: isNaN(epochNum) ? undefined : epochNum });
      }
    }
  }

  // Sort checkpoints by epoch number
  variants.sort((a, b) => {
    if (a.label === 'final') return -1;
    if (b.label === 'final') return 1;
    if (a.label === 'best') return -1;
    if (b.label === 'best') return 1;
    return (a.epoch ?? 0) - (b.epoch ?? 0);
  });

  if (variants.length > 0) {
    // Try to read metadata from the first variant
    const firstPath = variants[0].path;
    const metadata = readJsonSafe(path.join(firstPath, 'lora_metadata.json'));
    const adapterCfg = readJsonSafe(path.join(firstPath, 'adapter_config.json'));

    entries.push({
      name: dirName,
      source: 'output',
      sourceDir: dirName,
      variants,
      metadata: metadata ?? undefined,
      baseModel: adapterCfg?.base_model_name_or_path as string | undefined,
    });
  }

  // Also scan nested lora_output/ inside this directory
  const nestedOutput = path.join(outputDir, 'lora_output');
  if (fs.existsSync(nestedOutput) && fs.statSync(nestedOutput).isDirectory()) {
    const nested = scanOutputDir(nestedOutput, `${dirName}/lora_output`);
    entries.push(...nested);
  }

  // Check for sub-directories that look like separate training runs (e.g. final_lora_test_v3_Walki-bass/)
  for (const child of fs.readdirSync(outputDir)) {
    if (child === 'checkpoints' || child === 'logs' || child === 'lora_output' || child === 'final' || child === 'final_lora' || child === 'best') continue;
    const childPath = path.join(outputDir, child);
    if (!fs.statSync(childPath).isDirectory()) continue;
    // Check if this looks like a training output (has adapter/ subfolder or checkpoints/)
    const childHasAdapter = isAdapterDir(path.join(childPath, 'adapter'));
    const childHasCheckpoints = fs.existsSync(path.join(childPath, 'checkpoints'));
    if (childHasAdapter || childHasCheckpoints) {
      const sub = scanOutputDir(childPath, `${dirName}/${child}`);
      entries.push(...sub);
    }
  }

  return entries;
}

router.post('/list', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ACESTEP_DIR = resolveAcestepDir();
    const allEntries: LoraEntry[] = [];

    // Custom directories from request body (array of absolute paths)
    const customDirs: string[] = Array.isArray(req.body?.directories) ? req.body.directories : [];

    // Default library directory
    const defaultLibraryDir = path.join(ACESTEP_DIR, 'lora_library');

    // 1) Scan the default lora_library/
    allEntries.push(...scanLibrary(defaultLibraryDir));

    // 2) Scan all lora_output*/ directories at root level
    if (fs.existsSync(ACESTEP_DIR)) {
      for (const child of fs.readdirSync(ACESTEP_DIR)) {
        if (!child.startsWith('lora_output')) continue;
        const childPath = path.join(ACESTEP_DIR, child);
        if (!fs.statSync(childPath).isDirectory()) continue;
        allEntries.push(...scanOutputDir(childPath));
      }
    }

    // 3) Scan custom directories (absolute paths from user)
    for (const customDir of customDirs) {
      if (!customDir || typeof customDir !== 'string') continue;
      // Skip if it's the same as default library (avoid duplicates)
      if (path.resolve(customDir) === path.resolve(defaultLibraryDir)) continue;
      if (!fs.existsSync(customDir)) continue;
      if (!fs.statSync(customDir).isDirectory()) continue;
      
      // Case 1: The directory IS itself an adapter (has adapter_config.json)
      if (isAdapterDir(customDir)) {
        const dirName = path.basename(customDir);
        const parentDir = path.basename(path.dirname(customDir));
        const metadata = readJsonSafe(path.join(customDir, 'lora_metadata.json'));
        const adapterCfg = readJsonSafe(path.join(customDir, 'adapter_config.json'));
        allEntries.push({
          name: parentDir === 'adapter' ? path.basename(path.dirname(path.dirname(customDir))) || dirName : `${parentDir}/${dirName}`,
          source: 'library',
          sourceDir: path.basename(path.dirname(customDir)),
          variants: [{ label: 'final', path: customDir }],
          metadata: metadata ?? undefined,
          baseModel: adapterCfg?.base_model_name_or_path as string | undefined,
        });
      } else {
        // Case 2: Directory CONTAINS LoRA folders - scan as library-style
        const customEntries = scanLibrary(customDir);
        allEntries.push(...customEntries);
      }
    }

    res.json({ loras: allEntries, defaultDirectory: defaultLibraryDir });
  } catch (error) {
    console.error('[LoRA] List error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list LoRAs' });
  }
});

// POST /api/lora/validate-dir — Check if a directory exists and is valid for LoRA scanning
router.post('/validate-dir', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { directory } = req.body;
    if (!directory || typeof directory !== 'string') {
      res.status(400).json({ valid: false, error: 'directory is required' });
      return;
    }
    const exists = fs.existsSync(directory);
    const isDir = exists && fs.statSync(directory).isDirectory();
    
    // Check if directory IS an adapter or CONTAINS adapters
    const isDirectAdapter = isDir && isAdapterDir(directory);
    const containsAdapters = isDir ? scanLibrary(directory).length : 0;
    const loraCount = isDirectAdapter ? 1 : containsAdapters;
    
    res.json({ 
      valid: isDir && (isDirectAdapter || containsAdapters > 0), 
      exists, 
      loraCount, 
      directory,
      isDirectAdapter,
    });
  } catch (error) {
    res.status(500).json({ valid: false, error: error instanceof Error ? error.message : 'Validation failed' });
  }
});

// POST /api/lora/browse — Browse directories to find LoRA adapters
router.post('/browse', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { dirPath } = req.body;
    const { existsSync, readdirSync, statSync } = await import('fs');

    // Resolve the base ACE-Step directory
    const ACESTEP_DIR = process.env.ACESTEP_PATH || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../../ACE-Step-1.5');

    // Default to lora_output if no path given
    let browsePath: string;
    if (!dirPath || dirPath === '' || dirPath === '.') {
      browsePath = path.join(ACESTEP_DIR, 'lora_library');
    } else if (path.isAbsolute(dirPath)) {
      browsePath = dirPath;
    } else {
      browsePath = path.resolve(ACESTEP_DIR, dirPath);
    }

    if (!existsSync(browsePath)) {
      res.json({ currentPath: browsePath, parentPath: path.dirname(browsePath), entries: [], error: 'Directory not found' });
      return;
    }

    const stat = statSync(browsePath);
    if (!stat.isDirectory()) {
      res.json({ currentPath: browsePath, parentPath: path.dirname(browsePath), entries: [], error: 'Not a directory' });
      return;
    }

    const entries: { name: string; type: 'dir' | 'file'; fullPath: string; isAdapter: boolean }[] = [];

    for (const entry of readdirSync(browsePath)) {
      try {
        const fullPath = path.join(browsePath, entry);
        const entryStat = statSync(fullPath);
        const isDir = entryStat.isDirectory();

        // Check if this directory contains adapter files (adapter_config.json or adapter_model.safetensors)
        let isAdapter = false;
        if (isDir) {
          isAdapter = existsSync(path.join(fullPath, 'adapter_config.json')) ||
                      existsSync(path.join(fullPath, 'adapter_model.safetensors')) ||
                      existsSync(path.join(fullPath, 'adapter_model.bin'));
        }

        entries.push({
          name: entry,
          type: isDir ? 'dir' : 'file',
          fullPath,
          isAdapter,
        });
      } catch { /* skip inaccessible entries */ }
    }

    // Sort: adapter dirs first, then dirs, then files
    entries.sort((a, b) => {
      if (a.isAdapter !== b.isAdapter) return a.isAdapter ? -1 : 1;
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Compute relative path for display
    const relativePath = path.relative(ACESTEP_DIR, browsePath) || '.';

    res.json({
      currentPath: browsePath,
      relativePath: relativePath.startsWith('..') ? browsePath : './' + relativePath.replace(/\\/g, '/'),
      parentPath: path.dirname(browsePath),
      entries,
    });
  } catch (error) {
    console.error('[LoRA] Browse error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Browse failed' });
  }
});

// POST /api/lora/open-folder — Open a LoRA folder in the OS file explorer
router.post('/open-folder', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || typeof folderPath !== 'string') {
      res.status(400).json({ error: 'folderPath is required' });
      return;
    }

    // Resolve to absolute path
    const ACESTEP_DIR = resolveAcestepDir();
    const resolved = path.isAbsolute(folderPath)
      ? folderPath
      : path.resolve(ACESTEP_DIR, folderPath);

    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Folder not found', path: resolved });
      return;
    }

    const { exec } = await import('child_process');
    const platform = process.platform;

    let cmd: string;
    if (platform === 'win32') {
      cmd = `explorer "${resolved}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${resolved}"`;
    } else {
      cmd = `xdg-open "${resolved}"`;
    }

    exec(cmd, (err) => {
      if (err) {
        console.warn('[LoRA] Could not open folder:', err.message);
      }
    });

    res.json({ success: true, path: resolved });
  } catch (error) {
    console.error('[LoRA] Open folder error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to open folder' });
  }
});

export default router;
