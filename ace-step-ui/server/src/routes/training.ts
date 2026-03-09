import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getGradioClient } from '../services/gradio-client.js';
import { config } from '../config/index.js';
import { resolvePythonPath } from '../services/acestep.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// --- Audio upload via multer disk storage ---
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg', '.opus'];

const audioStorage = multer.diskStorage({
  destination: async (_req: Request, _file, cb) => {
    const datasetName = (_req.body?.datasetName as string) || 'default';
    const dest = path.join(config.datasets.uploadsDir, datasetName);
    try {
      await mkdir(dest, { recursive: true });
      cb(null, dest);
    } catch (err) {
      cb(err as Error, dest);
    }
  },
  filename: (_req, file, cb) => {
    // Preserve original filename but ensure uniqueness
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext);
    const safeName = base.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    cb(null, `${safeName}${ext}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (AUDIO_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${AUDIO_EXTENSIONS.join(', ')}`));
    }
  },
});

// Get audio duration via ffprobe
function getAudioDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? 0 : Math.round(duration);
  } catch {
    return 0;
  }
}

// Resolve ACE-Step base directory
function getAceStepDir(): string {
  const envPath = process.env.ACESTEP_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(config.datasets.dir, '..');
}

// ================== NEW ROUTES ==================

// POST /api/training/upload-audio — Upload audio files for a dataset
router.post('/upload-audio', authMiddleware, audioUpload.array('audio', 50), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No audio files uploaded' });
      return;
    }

    const datasetName = (req.body?.datasetName as string) || 'default';
    const uploadDir = path.join(config.datasets.uploadsDir, datasetName);

    res.json({
      files: files.map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        size: f.size,
        path: f.path,
      })),
      uploadDir,
      count: files.length,
    });
  } catch (error) {
    console.error('[Training] Upload audio error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
});

// POST /api/training/build-dataset — Scan audio directory + create dataset JSON
router.post('/build-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      datasetName = 'my_lora_dataset',
      customTag = '',
      tagPosition = 'prepend',
      allInstrumental = true,
    } = req.body;

    const audioDir = path.join(config.datasets.uploadsDir, datasetName);
    if (!existsSync(audioDir)) {
      res.status(400).json({ error: `Audio directory not found: uploads/${datasetName}` });
      return;
    }

    // Scan for audio files
    const entries = readdirSync(audioDir);
    const audioFiles = entries.filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (audioFiles.length === 0) {
      res.status(400).json({ error: 'No audio files found in directory' });
      return;
    }

    // Build samples in Gradio's exact format
    const samples = audioFiles.map(filename => {
      const audioPath = path.join(audioDir, filename);
      const duration = getAudioDuration(audioPath);
      const baseName = path.basename(filename, path.extname(filename));

      // Check for companion .txt lyrics file
      let rawLyrics = '';
      const lyricsPath = path.join(audioDir, `${baseName}.txt`);
      if (existsSync(lyricsPath)) {
        try {
          rawLyrics = readFileSync(lyricsPath, 'utf-8').trim();
        } catch { /* ignore */ }
      }

      const isInstrumental = allInstrumental || !rawLyrics;

      return {
        id: randomUUID().slice(0, 8),
        audio_path: audioPath,
        filename,
        caption: '',
        genre: '',
        lyrics: isInstrumental ? '[Instrumental]' : rawLyrics,
        raw_lyrics: rawLyrics,
        formatted_lyrics: '',
        bpm: null as number | null,
        keyscale: '',
        timesignature: '',
        duration,
        language: isInstrumental ? 'instrumental' : 'unknown',
        is_instrumental: isInstrumental,
        custom_tag: customTag,
        labeled: false,
        prompt_override: null as string | null,
      };
    });

    // Build dataset JSON
    const dataset = {
      metadata: {
        name: datasetName,
        custom_tag: customTag,
        tag_position: tagPosition,
        created_at: new Date().toISOString(),
        num_samples: samples.length,
        all_instrumental: allInstrumental,
        genre_ratio: 0,
      },
      samples,
    };

    // Save JSON to datasets dir
    await mkdir(config.datasets.dir, { recursive: true });
    const jsonPath = path.join(config.datasets.dir, `${datasetName}.json`);
    await writeFile(jsonPath, JSON.stringify(dataset, null, 2), 'utf-8');

    // Now load into Gradio state via the existing endpoint
    try {
      const client = await getGradioClient();
      const result = await client.predict('/load_existing_dataset_for_preprocess', [jsonPath]);
      const data = result.data as unknown[];

      res.json({
        status: data[0],
        dataframe: data[1],
        sampleCount: samples.length,
        sample: {
          index: data[2],
          audio: data[3],
          filename: data[4],
          caption: data[5],
          genre: data[6],
          promptOverride: data[7],
          lyrics: data[8],
          bpm: data[9],
          key: data[10],
          timeSignature: data[11],
          duration: data[12],
          language: data[13],
          instrumental: data[14],
          rawLyrics: data[15],
        },
        settings: {
          datasetName: data[16],
          customTag: data[17],
          tagPosition: data[18],
          allInstrumental: data[19],
          genreRatio: data[20],
        },
        datasetPath: jsonPath,
      });
    } catch (gradioError) {
      // Gradio may not be running — still return dataset info
      console.warn('[Training] Gradio load failed, returning dataset JSON only:', gradioError);
      res.json({
        status: `Dataset saved (${samples.length} samples). Gradio not available for live preview.`,
        dataframe: null,
        sampleCount: samples.length,
        sample: samples.length > 0 ? {
          index: 0,
          audio: null,
          filename: samples[0].filename,
          caption: samples[0].caption,
          genre: samples[0].genre,
          promptOverride: null,
          lyrics: samples[0].lyrics,
          bpm: samples[0].bpm,
          key: samples[0].keyscale,
          timeSignature: samples[0].timesignature,
          duration: samples[0].duration,
          language: samples[0].language,
          instrumental: samples[0].is_instrumental,
          rawLyrics: samples[0].raw_lyrics,
        } : null,
        settings: {
          datasetName,
          customTag,
          tagPosition,
          allInstrumental,
          genreRatio: 0,
        },
        datasetPath: jsonPath,
      });
    }
  } catch (error) {
    console.error('[Training] Build dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build dataset' });
  }
});

// GET /api/training/audio — Proxy audio files from datasets directory
router.get('/audio', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let filePath: string;
    const aceStepDir = getAceStepDir();

    if (req.query.path) {
      filePath = req.query.path as string;
    } else if (req.query.file) {
      // Relative path within datasets dir
      filePath = path.join(config.datasets.dir, req.query.file as string);
    } else {
      res.status(400).json({ error: 'path or file parameter required' });
      return;
    }

    // Path traversal protection
    const resolved = path.resolve(filePath);
    if (resolved.includes('..') || !resolved.startsWith(aceStepDir)) {
      res.status(403).json({ error: 'Access denied: path outside ACE-Step directory' });
      return;
    }

    if (!existsSync(resolved)) {
      res.status(404).json({ error: 'Audio file not found' });
      return;
    }

    // Determine content type
    const ext = path.extname(resolved).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.sendFile(resolved);
  } catch (error) {
    console.error('[Training] Audio proxy error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to serve audio' });
  }
});

// POST /api/training/preprocess — Spawn Python preprocessing script
router.post('/preprocess', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetPath, outputDir } = req.body;
    if (!datasetPath) {
      res.status(400).json({ error: 'datasetPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();
    const scriptPath = path.resolve(__dirname, '../../scripts/preprocess_dataset.py');
    const pythonPath = resolvePythonPath(aceStepDir);
    const resolvedOutput = outputDir || path.join(config.datasets.dir, 'preprocessed_tensors');

    // Ensure output dir exists
    await mkdir(resolvedOutput, { recursive: true });

    // Spawn Python process
    const child = spawn(pythonPath, [
      scriptPath,
      '--dataset', datasetPath,
      '--output', resolvedOutput,
      '--json',
    ], {
      cwd: aceStepDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        // Try to parse JSON output
        try {
          const result = JSON.parse(stdout.trim().split('\n').pop() || '{}');
          res.json({ status: 'Preprocessing complete', ...result });
        } catch {
          res.json({ status: 'Preprocessing complete', output: stdout.trim() });
        }
      } else {
        res.status(500).json({
          error: 'Preprocessing failed',
          code,
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        });
      }
    });

    child.on('error', (err: Error) => {
      res.status(500).json({ error: `Failed to spawn process: ${err.message}` });
    });
  } catch (error) {
    console.error('[Training] Preprocess error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Preprocessing failed' });
  }
});

// POST /api/training/scan-directory — Scan a directory for audio files (Node.js implementation)
router.post('/scan-directory', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      audioDir,
      datasetName = 'my_lora_dataset',
      customTag = '',
      tagPosition = 'prepend',
      allInstrumental = true,
    } = req.body;

    if (!audioDir || typeof audioDir !== 'string') {
      res.status(400).json({ error: 'audioDir is required' });
      return;
    }

    // Resolve path — if relative, resolve from ACE-Step dir
    const aceStepDir = getAceStepDir();
    const resolvedDir = path.isAbsolute(audioDir)
      ? audioDir
      : path.resolve(aceStepDir, audioDir);

    if (!existsSync(resolvedDir)) {
      res.status(400).json({ error: `Directory not found: ${audioDir}` });
      return;
    }

    // Scan for audio files
    const entries = readdirSync(resolvedDir);
    const audioFiles = entries.filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (audioFiles.length === 0) {
      res.status(400).json({ error: 'No audio files found in directory' });
      return;
    }

    // Build table data matching Gradio's format: [#, Filename, Duration, Lyrics, Labeled, BPM, Key, Caption]
    const tableHeaders = ['#', 'Filename', 'Duration', 'Lyrics', 'Labeled', 'BPM', 'Key', 'Caption'];
    const tableData = audioFiles.map((filename, i) => {
      const audioPath = path.join(resolvedDir, filename);
      const duration = getAudioDuration(audioPath);
      const baseName = path.basename(filename, path.extname(filename));

      // Check for companion .txt lyrics file
      let lyrics = allInstrumental ? '[Instrumental]' : '';
      const lyricsPath = path.join(resolvedDir, `${baseName}.txt`);
      if (existsSync(lyricsPath)) {
        try {
          lyrics = readFileSync(lyricsPath, 'utf-8').trim().slice(0, 50) + '...';
        } catch { /* ignore */ }
      }

      return [i + 1, filename, `${duration}s`, lyrics, '❌', '', '', ''];
    });

    res.json({
      status: `Found ${audioFiles.length} audio files`,
      dataframe: {
        headers: tableHeaders,
        data: tableData,
      },
      sampleCount: audioFiles.length,
      audioDir: resolvedDir,
    });
  } catch (error) {
    console.error('[Training] Scan directory error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to scan directory' });
  }
});

// POST /api/training/auto-label — Auto-label dataset samples
// NOTE: Auto-labeling requires the DIT model + LLM to be loaded in Gradio.
// This endpoint attempts to call the Gradio handler. If the Gradio app does not
// expose auto_label_all as a named API, this will fail and the user should use
// the Gradio UI directly.
router.post('/auto-label', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      skipMetas = false,
      formatLyrics = false,
      transcribeLyrics = false,
      onlyUnlabeled = false,
    } = req.body;

    // auto_label_all is a lambda-wrapped handler in Gradio, so it may not be accessible
    // by name. We try the likely endpoint name; if it fails, return a helpful message.
    const client = await getGradioClient();
    try {
      const result = await client.predict('/auto_label_all', [
        skipMetas,
        formatLyrics,
        transcribeLyrics,
        onlyUnlabeled,
      ]);
      const data = result.data as unknown[];
      res.json({
        dataframe: data[0],
        status: data[1],
      });
    } catch (gradioError) {
      // Lambda endpoints aren't named — suggest using Gradio UI
      res.status(501).json({
        error: 'Auto-labeling requires the Gradio UI. The model must be initialized and the dataset loaded in the Gradio training tab.',
        hint: 'Use the Gradio UI at the ACE-Step server URL to auto-label your dataset, then reload it here.',
      });
    }
  } catch (error) {
    console.error('[Training] Auto-label error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Auto-label failed' });
  }
});

// POST /api/training/init-model — Initialize or change model for training
// NOTE: Model initialization requires the Gradio app. This endpoint attempts to
// call the init_service_wrapper. Since it's a lambda, this may not be accessible.
router.post('/init-model', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      checkpoint,
      configPath,
      device = 'auto',
      initLlm = false,
      lmModelPath = '',
      backend = 'pt',
      useFlashAttention = false,
      offloadToCpu = false,
      offloadDitToCpu = false,
      compileModel = false,
      quantization = false,
    } = req.body;

    const client = await getGradioClient();
    try {
      // Try calling by function name (may work if Gradio auto-names it)
      const result = await client.predict('/init_service_wrapper', [
        checkpoint ?? '',
        configPath ?? '',
        device,
        initLlm,
        lmModelPath,
        backend,
        useFlashAttention,
        offloadToCpu,
        offloadDitToCpu,
        compileModel,
        quantization,
      ]);
      const data = result.data as unknown[];
      res.json({
        status: data[0],
        modelReady: !!data[1],
      });
    } catch (gradioError) {
      // Lambda endpoints aren't named — suggest using Gradio UI
      res.status(501).json({
        error: 'Model initialization requires the Gradio UI.',
        hint: 'Initialize the model in the ACE-Step Gradio UI service configuration section, then return here for training.',
      });
    }
  } catch (error) {
    console.error('[Training] Init model error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Model init failed' });
  }
});

// GET /api/training/checkpoints — List available model checkpoints
router.get('/checkpoints', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const aceStepDir = getAceStepDir();
    const checkpointDir = path.join(aceStepDir, 'checkpoints');
    if (!existsSync(checkpointDir)) {
      res.json({ checkpoints: [], configs: [] });
      return;
    }

    // List checkpoint directories
    const entries = readdirSync(checkpointDir);
    const checkpoints = entries.filter(e => {
      const fullPath = path.join(checkpointDir, e);
      return statSync(fullPath).isDirectory();
    });

    // List config directories (acestep-v15-*)
    const configDirs = entries.filter(e =>
      e.startsWith('acestep-v15') && statSync(path.join(checkpointDir, e)).isDirectory()
    );

    res.json({ checkpoints, configs: configDirs });
  } catch (error) {
    console.error('[Training] List checkpoints error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list checkpoints' });
  }
});

// GET /api/training/lora-checkpoints — List LoRA training checkpoints in output dir
router.get('/lora-checkpoints', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const outputDir = (req.query.dir as string) || './lora_output';
    const aceStepDir = getAceStepDir();
    const resolvedDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.resolve(aceStepDir, outputDir);

    if (!existsSync(resolvedDir)) {
      res.json({ checkpoints: [] });
      return;
    }

    const entries = readdirSync(resolvedDir);
    const checkpointsDir = path.join(resolvedDir, 'checkpoints');
    const checkpoints: string[] = [];

    if (existsSync(checkpointsDir)) {
      const cpEntries = readdirSync(checkpointsDir);
      cpEntries.forEach(e => {
        if (statSync(path.join(checkpointsDir, e)).isDirectory()) {
          checkpoints.push(path.join(checkpointsDir, e));
        }
      });
    }

    // Also check for "final" directory
    const finalDir = path.join(resolvedDir, 'final');
    if (existsSync(finalDir)) {
      checkpoints.push(finalDir);
    }

    res.json({ checkpoints, outputDir: resolvedDir });
  } catch (error) {
    console.error('[Training] List LoRA checkpoints error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list checkpoints' });
  }
});

// ================== EXISTING ROUTES ==================

// POST /api/training/load-dataset — Load an existing dataset JSON for preprocessing
router.post('/load-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetPath } = req.body;
    if (!datasetPath || typeof datasetPath !== 'string') {
      res.status(400).json({ error: 'datasetPath is required' });
      return;
    }
    // Reject path traversal
    if (datasetPath.includes('..')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const client = await getGradioClient();
    const result = await client.predict('/load_existing_dataset_for_preprocess', [datasetPath]);
    const data = result.data as unknown[];

    // Returns: [status, dataframe, sampleIdx, audioPreview, filename, caption, genre,
    //           promptOverride, lyrics, bpm, key, timesig, duration, language, instrumental,
    //           rawLyrics, datasetName, customTag, tagPosition, allInstrumental, genreRatio]
    res.json({
      status: data[0],
      dataframe: data[1],
      sampleCount: Array.isArray((data[1] as any)?.data) ? (data[1] as any).data.length : 0,
      sample: {
        index: data[2],
        audio: data[3],
        filename: data[4],
        caption: data[5],
        genre: data[6],
        promptOverride: data[7],
        lyrics: data[8],
        bpm: data[9],
        key: data[10],
        timeSignature: data[11],
        duration: data[12],
        language: data[13],
        instrumental: data[14],
        rawLyrics: data[15],
      },
      settings: {
        datasetName: data[16],
        customTag: data[17],
        tagPosition: data[18],
        allInstrumental: data[19],
        genreRatio: data[20],
      },
    });
  } catch (error) {
    console.error('[Training] Load dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load dataset' });
  }
});

// GET /api/training/sample-preview — Get preview data for a specific sample
router.get('/sample-preview', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const idx = parseInt(req.query.idx as string) || 0;

    const client = await getGradioClient();
    const result = await client.predict('/get_sample_preview', [idx]);
    const data = result.data as unknown[];

    // Returns: [audio, filename, caption, genre, promptOverride, lyrics, bpm, key, timesig, duration, language, instrumental, rawLyrics]
    res.json({
      audio: data[0],
      filename: data[1],
      caption: data[2],
      genre: data[3],
      promptOverride: data[4],
      lyrics: data[5],
      bpm: data[6],
      key: data[7],
      timeSignature: data[8],
      duration: data[9],
      language: data[10],
      instrumental: data[11],
      rawLyrics: data[12],
    });
  } catch (error) {
    console.error('[Training] Sample preview error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get sample preview' });
  }
});

// POST /api/training/save-sample — Save edits to a dataset sample
router.post('/save-sample', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sampleIdx, caption, genre, promptOverride, lyrics, bpm, key, timeSignature, language, instrumental } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/save_sample_edit', [
      sampleIdx ?? 0,
      caption ?? '',
      genre ?? '',
      promptOverride ?? 'Use Global Ratio',
      lyrics ?? '',
      bpm ?? 120,
      key ?? '',
      timeSignature ?? '',
      language ?? 'instrumental',
      instrumental ?? true,
    ]);
    const data = result.data as unknown[];

    // Returns: [dataframe, editStatus]
    res.json({
      dataframe: data[0],
      status: data[1],
    });
  } catch (error) {
    console.error('[Training] Save sample error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save sample edit' });
  }
});

// POST /api/training/update-settings — Update dataset global settings
router.post('/update-settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customTag, tagPosition, allInstrumental, genreRatio } = req.body;

    const client = await getGradioClient();
    await client.predict('/update_settings', [
      customTag ?? '',
      tagPosition ?? 'replace',
      allInstrumental ?? true,
      genreRatio ?? 0,
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('[Training] Update settings error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update settings' });
  }
});

// POST /api/training/save-dataset — Save the dataset to a JSON file
router.post('/save-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { savePath, datasetName } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/save_dataset', [
      savePath ?? './datasets/my_lora_dataset.json',
      datasetName ?? 'my_lora_dataset',
    ]);
    const data = result.data as unknown[];

    // Returns: [saveStatus, savePath]
    res.json({
      status: data[0],
      path: data[1],
    });
  } catch (error) {
    console.error('[Training] Save dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save dataset' });
  }
});

// POST /api/training/load-tensors — Load preprocessed tensors for training
router.post('/load-tensors', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tensorDir } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/load_training_dataset', [
      tensorDir ?? './datasets/preprocessed_tensors',
    ]);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Load tensors error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load training dataset' });
  }
});

// POST /api/training/start — Start LoRA training
router.post('/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      tensorDir, rank, alpha, dropout, learningRate,
      epochs, batchSize, gradientAccumulation, saveEvery,
      shift, seed, outputDir, resumeCheckpoint,
    } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/training_wrapper', [
      tensorDir ?? './datasets/preprocessed_tensors',
      rank ?? 64,
      alpha ?? 128,
      dropout ?? 0.1,
      learningRate ?? 0.0003,
      epochs ?? 1000,
      batchSize ?? 1,
      gradientAccumulation ?? 1,
      saveEvery ?? 200,
      shift ?? 3.0,
      seed ?? 42,
      outputDir ?? './lora_output',
      resumeCheckpoint ?? null,
    ]);
    const data = result.data as unknown[];

    // Returns: [trainingProgress, trainingLog, lineplotData]
    res.json({
      progress: data[0],
      log: data[1],
      metrics: data[2],
    });
  } catch (error) {
    console.error('[Training] Start training error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start training' });
  }
});

// POST /api/training/stop — Stop current training
router.post('/stop', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await getGradioClient();
    const result = await client.predict('/stop_training', []);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Stop training error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop training' });
  }
});

// POST /api/training/export — Export trained LoRA weights
router.post('/export', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { exportPath, loraOutputDir } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/export_lora', [
      exportPath ?? './lora_output/final_lora',
      loraOutputDir ?? './lora_output',
    ]);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Export LoRA error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to export LoRA' });
  }
});

// POST /api/training/import-dataset — Import train/test split
router.post('/import-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetType } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/import_dataset', [
      datasetType ?? 'train',
    ]);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Import dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to import dataset' });
  }
});

// ================== DATASET PREPARATION FROM UI ==================

// POST /api/training/trim-audio — Trim an audio file using ffmpeg
router.post('/trim-audio', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioPath, startTime, endTime, outputDir } = req.body;
    if (!audioPath) {
      res.status(400).json({ error: 'audioPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();

    // Resolve audio path (could be a local /audio/ URL or absolute path)
    let resolvedAudio = audioPath;
    if (audioPath.startsWith('/audio/')) {
      resolvedAudio = path.join(__dirname, '../../public', audioPath);
    } else if (!path.isAbsolute(audioPath)) {
      resolvedAudio = path.resolve(aceStepDir, audioPath);
    }

    if (!existsSync(resolvedAudio)) {
      res.status(404).json({ error: `Audio file not found: ${audioPath}` });
      return;
    }

    // If no trim needed, just return the original path
    if ((startTime === undefined || startTime <= 0) && (endTime === undefined || endTime <= 0)) {
      res.json({ trimmedPath: resolvedAudio, trimmed: false });
      return;
    }

    // Build output path
    const trimDir = outputDir || path.join(config.datasets.uploadsDir, '_trimmed');
    await mkdir(trimDir, { recursive: true });
    const ext = path.extname(resolvedAudio);
    const baseName = path.basename(resolvedAudio, ext);
    const trimmedName = `${baseName}_trim_${Math.round(startTime || 0)}s-${Math.round(endTime || 0)}s${ext}`;
    const trimmedPath = path.join(trimDir, trimmedName);

    // Build ffmpeg command
    const ffmpegArgs: string[] = ['-y', '-i', resolvedAudio];
    if (startTime !== undefined && startTime > 0) {
      ffmpegArgs.push('-ss', String(startTime));
    }
    if (endTime !== undefined && endTime > 0) {
      ffmpegArgs.push('-to', String(endTime));
    }
    ffmpegArgs.push('-c', 'copy', trimmedPath);

    execSync(`ffmpeg ${ffmpegArgs.map(a => `"${a}"`).join(' ')}`, { timeout: 30000 });

    const duration = getAudioDuration(trimmedPath);
    res.json({ trimmedPath, duration, trimmed: true });
  } catch (error) {
    console.error('[Training] Trim audio error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Trim failed' });
  }
});

// POST /api/training/convert-to-codes — Convert audio to LM codes via Gradio
router.post('/convert-to-codes', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioPath } = req.body;
    if (!audioPath) {
      res.status(400).json({ error: 'audioPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();
    let resolvedAudio = audioPath;
    if (audioPath.startsWith('/audio/')) {
      resolvedAudio = path.join(__dirname, '../../public', audioPath);
    } else if (!path.isAbsolute(audioPath)) {
      resolvedAudio = path.resolve(aceStepDir, audioPath);
    }

    if (!existsSync(resolvedAudio)) {
      res.status(404).json({ error: `Audio file not found: ${audioPath}` });
      return;
    }

    // Try Gradio first
    try {
      const client = await getGradioClient();
      const result = await client.predict('/convert_src_audio_to_codes_wrapper', [
        { path: resolvedAudio, orig_name: path.basename(resolvedAudio) },
      ]);
      const codes = (result.data as unknown[])[0] as string;
      res.json({ codes, source: 'gradio' });
      return;
    } catch (gradioError) {
      // Gradio endpoint not available — try Python fallback
      console.warn('[Training] Gradio convert-to-codes failed, trying Python fallback:', gradioError instanceof Error ? gradioError.message : gradioError);
    }

    // Python fallback: spawn a script that loads the model and converts
    const scriptPath = path.resolve(__dirname, '../../scripts/convert_to_codes.py');
    if (!existsSync(scriptPath)) {
      res.status(501).json({
        error: 'Convert to codes requires the Gradio service running, or the convert_to_codes.py script.',
        hint: 'Start the ACE-Step Gradio server or use the Gradio UI directly.',
      });
      return;
    }

    const pythonPath = resolvePythonPath(aceStepDir);
    const child = spawn(pythonPath, [scriptPath, '--audio', resolvedAudio, '--json'], {
      cwd: aceStepDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim().split('\n').pop() || '{}');
          res.json({ codes: result.codes || stdout.trim(), source: 'python' });
        } catch {
          res.json({ codes: stdout.trim(), source: 'python' });
        }
      } else {
        res.status(500).json({ error: 'Conversion failed', stderr: stderr.trim() });
      }
    });
  } catch (error) {
    console.error('[Training] Convert to codes error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Conversion failed' });
  }
});

// POST /api/training/add-to-dataset — Add a single sample to a dataset JSON
router.post('/add-to-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      audioPath,
      datasetName = 'my_lora_dataset',
      caption = '',
      genre = '',
      lyrics = '[Instrumental]',
      bpm = null,
      keyscale = '',
      timesignature = '',
      duration = 0,
      language = 'instrumental',
      isInstrumental = true,
      customTag = '',
      trimStart,
      trimEnd,
    } = req.body;

    if (!audioPath) {
      res.status(400).json({ error: 'audioPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();

    // Resolve the audio file path
    let resolvedAudio = audioPath;
    if (audioPath.startsWith('/audio/')) {
      resolvedAudio = path.join(__dirname, '../../public', audioPath);
    } else if (!path.isAbsolute(audioPath)) {
      resolvedAudio = path.resolve(aceStepDir, audioPath);
    }

    if (!existsSync(resolvedAudio)) {
      res.status(404).json({ error: `Audio file not found: ${audioPath}` });
      return;
    }

    // If trimming is requested, trim first
    let finalAudioPath = resolvedAudio;
    if ((trimStart !== undefined && trimStart > 0) || (trimEnd !== undefined && trimEnd > 0)) {
      const trimDir = path.join(config.datasets.uploadsDir, datasetName);
      await mkdir(trimDir, { recursive: true });
      const ext = path.extname(resolvedAudio);
      const baseName = path.basename(resolvedAudio, ext);
      const trimmedName = `${baseName}_trim${ext}`;
      const trimmedPath = path.join(trimDir, trimmedName);

      const ffmpegArgs: string[] = ['-y', '-i', resolvedAudio];
      if (trimStart > 0) ffmpegArgs.push('-ss', String(trimStart));
      if (trimEnd > 0) ffmpegArgs.push('-to', String(trimEnd));
      ffmpegArgs.push('-c', 'copy', trimmedPath);
      execSync(`ffmpeg ${ffmpegArgs.map(a => `"${a}"`).join(' ')}`, { timeout: 30000 });
      finalAudioPath = trimmedPath;
    }

    // Also copy the audio to the dataset uploads directory if it's not already there
    const datasetAudioDir = path.join(config.datasets.uploadsDir, datasetName);
    await mkdir(datasetAudioDir, { recursive: true });
    const destFilename = path.basename(finalAudioPath);
    const destPath = path.join(datasetAudioDir, destFilename);
    if (finalAudioPath !== destPath) {
      const { copyFile } = await import('fs/promises');
      await copyFile(finalAudioPath, destPath);
      finalAudioPath = destPath;
    }

    // Load or create dataset JSON
    const datasetDir = config.datasets.dir;
    await mkdir(datasetDir, { recursive: true });
    const jsonPath = path.join(datasetDir, `${datasetName}.json`);

    let dataset: { metadata: Record<string, unknown>; samples: Record<string, unknown>[] };
    if (existsSync(jsonPath)) {
      const raw = await readFile(jsonPath, 'utf-8');
      dataset = JSON.parse(raw);
    } else {
      dataset = {
        metadata: {
          name: datasetName,
          custom_tag: customTag,
          tag_position: 'prepend',
          created_at: new Date().toISOString(),
          num_samples: 0,
          all_instrumental: false,
          genre_ratio: 0,
        },
        samples: [],
      };
    }

    // Compute actual duration
    const actualDuration = duration > 0 ? duration : getAudioDuration(finalAudioPath);

    // Create sample entry
    const sampleId = randomUUID().slice(0, 8);
    const sample = {
      id: sampleId,
      audio_path: finalAudioPath,
      filename: destFilename,
      caption,
      genre,
      lyrics: isInstrumental ? '[Instrumental]' : lyrics,
      raw_lyrics: lyrics,
      formatted_lyrics: '',
      bpm,
      keyscale,
      timesignature,
      duration: actualDuration,
      language: isInstrumental ? 'instrumental' : language,
      is_instrumental: isInstrumental,
      custom_tag: customTag,
      labeled: !!(caption || genre || (!isInstrumental && lyrics)),
      prompt_override: null,
    };

    dataset.samples.push(sample);
    (dataset.metadata as any).num_samples = dataset.samples.length;

    // Save dataset JSON
    await writeFile(jsonPath, JSON.stringify(dataset, null, 2), 'utf-8');

    // Also save lyrics as companion .txt file
    if (lyrics && !isInstrumental) {
      const lyricsPath = path.join(datasetAudioDir, `${path.basename(destFilename, path.extname(destFilename))}.txt`);
      await writeFile(lyricsPath, lyrics, 'utf-8');
    }

    res.json({
      status: `Added sample to dataset "${datasetName}" (${dataset.samples.length} total)`,
      sampleId,
      sampleCount: dataset.samples.length,
      datasetPath: jsonPath,
      audioPath: finalAudioPath,
    });
  } catch (error) {
    console.error('[Training] Add to dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add sample' });
  }
});

// GET /api/training/datasets — List available dataset JSON files
router.get('/datasets', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const datasetDir = config.datasets.dir;
    if (!existsSync(datasetDir)) {
      res.json({ datasets: [] });
      return;
    }
    const entries = readdirSync(datasetDir);
    const datasets = entries
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const raw = readFileSync(path.join(datasetDir, f), 'utf-8');
          const data = JSON.parse(raw);
          return {
            name: data.metadata?.name || path.basename(f, '.json'),
            filename: f,
            path: path.join(datasetDir, f),
            sampleCount: data.samples?.length || 0,
            createdAt: data.metadata?.created_at,
          };
        } catch {
          return { name: path.basename(f, '.json'), filename: f, path: path.join(datasetDir, f), sampleCount: 0 };
        }
      });
    res.json({ datasets });
  } catch (error) {
    console.error('[Training] List datasets error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list datasets' });
  }
});

// POST /api/training/auto-label-single — AI auto-label a single audio file
// Uses the Gradio understand_audio_from_codes endpoint to detect genre, caption, BPM, key, etc.
router.post('/auto-label-single', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioPath, transcribeLyrics = true } = req.body;
    if (!audioPath) {
      res.status(400).json({ error: 'audioPath is required' });
      return;
    }

    // Resolve audio path
    let resolvedPath = audioPath;
    if (audioPath.startsWith('/api/audio/')) {
      const uploadsDir = path.resolve(process.cwd(), '..', 'uploads');
      resolvedPath = path.join(uploadsDir, path.basename(audioPath));
    } else if (audioPath.startsWith('/output/') || audioPath.startsWith('/api/output/')) {
      const outputDir = path.resolve(process.cwd(), '..', 'output');
      const filename = path.basename(audioPath);
      resolvedPath = path.join(outputDir, filename);
    }

    if (!existsSync(resolvedPath)) {
      res.status(404).json({ error: `Audio file not found: ${resolvedPath}` });
      return;
    }

    const client = await getGradioClient();

    // Step 1: Convert audio to codes using the Gradio endpoint
    let audioCodes = '';
    try {
      const codesResult = await client.predict('/convert_src_audio_to_codes', [
        { path: resolvedPath, orig_name: path.basename(resolvedPath) },
      ]);
      const codesData = codesResult.data as unknown[];
      audioCodes = (codesData[0] as string) || '';
    } catch {
      // Try alternate endpoint name
      try {
        const codesResult = await client.predict('/convert_src_audio_to_codes_wrapper', [
          { path: resolvedPath, orig_name: path.basename(resolvedPath) },
        ]);
        const codesData = codesResult.data as unknown[];
        audioCodes = (codesData[0] as string) || '';
      } catch (e2) {
        res.status(501).json({
          error: 'Failed to convert audio to codes via Gradio.',
          hint: 'Ensure the model is initialized in the Gradio service.',
          details: e2 instanceof Error ? e2.message : String(e2),
        });
        return;
      }
    }

    if (!audioCodes || audioCodes.startsWith('❌')) {
      res.status(500).json({ error: audioCodes || 'Failed to encode audio to codes' });
      return;
    }

    // Step 2: Use LLM to understand the audio from codes
    try {
      const labelResult = await client.predict('/understand_audio', [
        audioCodes,
        transcribeLyrics,
        0.7,  // temperature
        true, // use_constrained_decoding
      ]);
      const labelData = labelResult.data as unknown[];
      // The understand_audio endpoint typically returns metadata as a JSON string or dict
      const rawResult = labelData[0];
      let metadata: Record<string, unknown> = {};
      
      if (typeof rawResult === 'string') {
        try {
          metadata = JSON.parse(rawResult);
        } catch {
          // If it's not JSON, try to parse the status text
          metadata = { raw: rawResult };
        }
      } else if (typeof rawResult === 'object' && rawResult !== null) {
        metadata = rawResult as Record<string, unknown>;
      }

      res.json({
        success: true,
        metadata: {
          caption: metadata.caption || '',
          genre: metadata.genres || metadata.genre || '',
          bpm: metadata.bpm || null,
          key: metadata.keyscale || metadata.key || '',
          timeSignature: metadata.timesignature || metadata.time_signature || '',
          language: metadata.vocal_language || metadata.language || '',
          lyrics: metadata.lyrics || '',
          instrumental: metadata.instrumental || false,
        },
        audioCodes,
      });
    } catch (labelError) {
      // Try alternate endpoint
      try {
        const labelResult = await client.predict('/understand_audio_from_codes_wrapper', [
          audioCodes,
          transcribeLyrics,
        ]);
        const labelData = labelResult.data as unknown[];
        const rawResult = labelData[0];
        let metadata: Record<string, unknown> = {};

        if (typeof rawResult === 'string') {
          try { metadata = JSON.parse(rawResult); } catch { metadata = { raw: rawResult }; }
        } else if (typeof rawResult === 'object' && rawResult !== null) {
          metadata = rawResult as Record<string, unknown>;
        }

        res.json({
          success: true,
          metadata: {
            caption: metadata.caption || '',
            genre: metadata.genres || metadata.genre || '',
            bpm: metadata.bpm || null,
            key: metadata.keyscale || metadata.key || '',
            timeSignature: metadata.timesignature || metadata.time_signature || '',
            language: metadata.vocal_language || metadata.language || '',
            lyrics: metadata.lyrics || '',
            instrumental: metadata.instrumental || false,
          },
          audioCodes,
        });
      } catch (e2) {
        res.status(501).json({
          error: 'Auto-labeling requires the LLM to be initialized.',
          hint: 'Initialize the model with LLM enabled in the Gradio service configuration.',
          details: e2 instanceof Error ? e2.message : String(e2),
        });
      }
    }
  } catch (error) {
    console.error('[Training] Auto-label-single error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Auto-label failed' });
  }
});

// POST /api/training/separate-stems — Separate audio into stems using Demucs or UVR (MDX-Net)
router.post('/separate-stems', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioPath, quality = 'alta', backend = 'demucs', model, stems = 2 } = req.body;

    if (!audioPath || typeof audioPath !== 'string') {
      res.status(400).json({ error: 'audioPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();

    // Resolve audio path
    let resolvedAudio = audioPath;
    if (audioPath.startsWith('/audio/')) {
      resolvedAudio = path.join(__dirname, '../../public', audioPath);
    } else if (!path.isAbsolute(audioPath)) {
      resolvedAudio = path.resolve(aceStepDir, audioPath);
    }

    if (!existsSync(resolvedAudio)) {
      res.status(404).json({ error: `Audio file not found: ${audioPath}` });
      return;
    }

    // Output directory for separated stems
    const stemsDir = path.join(__dirname, '../../public/audio/stems');
    await mkdir(stemsDir, { recursive: true });

    const scriptPath = path.resolve(__dirname, '../../scripts/separate_audio.py');
    if (!existsSync(scriptPath)) {
      res.status(500).json({ error: 'separate_audio.py script not found' });
      return;
    }

    const pythonPath = resolvePythonPath(aceStepDir);

    // Validate parameters
    const validQualities = ['rapida', 'alta', 'maxima'];
    const safeQuality = validQualities.includes(quality) ? quality : 'alta';
    const validBackends = ['demucs', 'uvr'];
    const safeBackend = validBackends.includes(backend) ? backend : 'demucs';
    const safeStems = [2, 4].includes(Number(stems)) ? Number(stems) : 2;

    // --- Cache check: skip re-processing if stems already exist ---
    const baseName = path.basename(resolvedAudio, path.extname(resolvedAudio));
    const cachePrefix = `${baseName}_`;
    const expectedStems = safeStems >= 4
      ? ['vocals', 'drums', 'bass', 'other']
      : ['vocals', 'instrumental'];
    const cachedEntries: Record<string, { url: string; path: string; filename: string }> = {};
    let allCached = true;
    for (const stemName of expectedStems) {
      const stemFile = `${cachePrefix}${stemName}.wav`;
      const stemFullPath = path.join(stemsDir, stemFile);
      if (existsSync(stemFullPath)) {
        cachedEntries[stemName] = {
          url: `/audio/stems/${stemFile}`,
          path: stemFullPath,
          filename: stemFile,
        };
      } else {
        allCached = false;
        break;
      }
    }

    if (allCached && !req.body.force) {
      console.log(`[Training] Using cached stems for: ${baseName}`);
      const response: any = {
        success: true,
        cached: true,
        backend: safeBackend,
        stemCount: Object.keys(cachedEntries).length,
        allStems: cachedEntries,
        elapsed: 0,
      };
      if (cachedEntries.vocals) response.vocals = cachedEntries.vocals;
      if (cachedEntries.instrumental) response.instrumental = cachedEntries.instrumental;
      res.json(response);
      return;
    }

    console.log(`[Training] Separating stems: ${resolvedAudio} (backend: ${safeBackend}, quality: ${safeQuality}, stems: ${safeStems}${model ? ', model: ' + model : ''})`);

    const pyArgs = [
      scriptPath,
      '--audio', resolvedAudio,
      '--output', stemsDir,
      '--backend', safeBackend,
      '--quality', safeQuality,
      '--stems', String(safeStems),
      '--json',
    ];

    // Add model flag for UVR backend
    if (safeBackend === 'uvr' && model && typeof model === 'string') {
      pyArgs.push('--model', model);
    }

    const child = spawn(pythonPath, pyArgs, {
      cwd: aceStepDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      // Log progress lines (non-JSON) for monitoring
      const lines = text.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        if (!line.startsWith('{')) {
          console.log(`[Separator] ${line}`);
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error(`[Training] Separator exited with code ${code}:`, stderr);
        res.status(500).json({ error: `Separation failed (exit code ${code})`, details: stderr.slice(-500) });
        return;
      }

      // Parse JSON from last line of stdout
      try {
        const lines = stdout.trim().split('\n');
        const jsonLine = lines[lines.length - 1];
        const result = JSON.parse(jsonLine);

        if (!result.success) {
          res.status(500).json({ error: result.error || 'Separation failed' });
          return;
        }

        // Convert absolute paths to relative URLs for the frontend
        // result.stems is a dict: { vocals: path, instrumental: path, drums?: path, bass?: path, other?: path }
        const stemEntries: Record<string, { url: string; path: string; filename: string }> = {};
        for (const [stemName, stemPath] of Object.entries(result.stems as Record<string, string>)) {
          const filename = path.basename(stemPath);
          stemEntries[stemName] = {
            url: `/audio/stems/${filename}`,
            path: stemPath,
            filename,
          };
        }

        // Backward-compatible response: always include top-level vocals/instrumental if present
        const response: any = {
          success: true,
          backend: result.backend,
          stemCount: result.stem_count,
          allStems: stemEntries,
          duration: result.duration,
          elapsed: result.elapsed_seconds,
        };

        // Add top-level convenient accessors for backward compat
        if (stemEntries.vocals) response.vocals = stemEntries.vocals;
        if (stemEntries.instrumental) response.instrumental = stemEntries.instrumental;

        res.json(response);
      } catch (parseErr) {
        console.error('[Training] Failed to parse separator output:', stdout);
        res.status(500).json({ error: 'Failed to parse separation result' });
      }
    });

    child.on('error', (err: Error) => {
      console.error('[Training] Failed to spawn separator:', err);
      res.status(500).json({ error: `Failed to start separator: ${err.message}` });
    });

  } catch (error) {
    console.error('[Training] Separate-stems error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Separation failed' });
  }
});

// GET /api/training/separator-models — List available UVR models
router.get('/separator-models', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const models = [
      { name: 'UVR-MDX-NET-Inst_HQ_3', description: 'MDX-Net Inst HQ 3 — best overall', stems: 2 },
      { name: 'UVR-MDX-NET-Voc_FT', description: 'MDX-Net Vocal FT — vocal-focused', stems: 2 },
      { name: 'UVR_MDXNET_KARA_2', description: 'MDX-Net Karaoke 2 — karaoke-grade', stems: 2 },
      { name: 'Kim_Vocal_2', description: 'Kim Vocal 2 — popular vocal extraction', stems: 2 },
      { name: 'UVR-MDX-NET-Inst_3', description: 'MDX-Net Inst 3 — clean instrumental', stems: 2 },
    ];
    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list models' });
  }
});

// ---------------------------------------------------------------------------
//  POST /api/training/detect-bpm-key — Detect BPM and musical key from audio
// ---------------------------------------------------------------------------
router.post('/detect-bpm-key', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioPath, normalizeBpm = true } = req.body;

    if (!audioPath || typeof audioPath !== 'string') {
      res.status(400).json({ error: 'audioPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();

    // Resolve audio path (support /audio/ prefix, relative, or absolute)
    let resolvedAudio = audioPath;
    if (audioPath.startsWith('/audio/')) {
      resolvedAudio = path.join(__dirname, '../../public', audioPath);
    } else if (!path.isAbsolute(audioPath)) {
      resolvedAudio = path.resolve(aceStepDir, audioPath);
    }

    if (!existsSync(resolvedAudio)) {
      res.status(404).json({ error: `Audio file not found: ${audioPath}` });
      return;
    }

    const scriptPath = path.resolve(__dirname, '../../scripts/detect_bpm_key.py');
    if (!existsSync(scriptPath)) {
      res.status(500).json({ error: 'detect_bpm_key.py script not found' });
      return;
    }

    const pythonPath = resolvePythonPath(aceStepDir);

    console.log(`[Training] Detecting BPM/Key: ${path.basename(resolvedAudio)}`);

    const pyArgs = [
      scriptPath,
      '--audio', resolvedAudio,
      '--json',
    ];
    if (!normalizeBpm) {
      pyArgs.push('--no-normalize-bpm');
    }

    const child = spawn(pythonPath, pyArgs, {
      cwd: aceStepDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error(`[Training] BPM/Key detection failed (code ${code}):`, stderr);
        res.status(500).json({ error: `Detection failed (exit code ${code})`, details: stderr.slice(-500) });
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const jsonLine = lines[lines.length - 1];
        const result = JSON.parse(jsonLine);

        if (!result.success) {
          res.status(500).json({ error: result.error || 'Detection failed' });
          return;
        }

        console.log(`[Training] BPM/Key detected: BPM=${result.bpm} Key=${result.key_scale} (${result.confidence}%)`);
        res.json(result);
      } catch (parseErr) {
        console.error('[Training] Failed to parse BPM/Key output:', stdout);
        res.status(500).json({ error: 'Failed to parse detection result' });
      }
    });

    child.on('error', (err: Error) => {
      console.error('[Training] Failed to spawn BPM/Key detector:', err);
      res.status(500).json({ error: `Failed to start detector: ${err.message}` });
    });

  } catch (error) {
    console.error('[Training] Detect-BPM-Key error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Detection failed' });
  }
});

// ---------------------------------------------------------------------------
//  POST /api/training/detect-bpm-key-batch — Detect BPM/key for all samples in a dataset
// ---------------------------------------------------------------------------
router.post('/detect-bpm-key-batch', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioPaths } = req.body as { audioPaths?: string[] };

    if (!audioPaths || !Array.isArray(audioPaths) || audioPaths.length === 0) {
      res.status(400).json({ error: 'audioPaths array is required' });
      return;
    }

    const aceStepDir = getAceStepDir();
    const scriptPath = path.resolve(__dirname, '../../scripts/detect_bpm_key.py');
    if (!existsSync(scriptPath)) {
      res.status(500).json({ error: 'detect_bpm_key.py script not found' });
      return;
    }

    const pythonPath = resolvePythonPath(aceStepDir);

    // Resolve all paths
    const resolvedPaths = audioPaths.map(p => {
      if (p.startsWith('/audio/')) return path.join(__dirname, '../../public', p);
      if (!path.isAbsolute(p)) return path.resolve(aceStepDir, p);
      return p;
    }).filter(p => existsSync(p));

    if (resolvedPaths.length === 0) {
      res.status(404).json({ error: 'No valid audio files found' });
      return;
    }

    console.log(`[Training] Batch BPM/Key detection: ${resolvedPaths.length} files`);

    const pyArgs = [
      scriptPath,
      '--audio', resolvedPaths.join(','),
      '--json',
    ];

    const child = spawn(pythonPath, pyArgs, {
      cwd: aceStepDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      // Log progress
      const lines = text.split('\n').filter((l: string) => l.trim() && !l.startsWith('{'));
      for (const line of lines) {
        console.log(`[BPM/Key] ${line}`);
      }
    });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        res.status(500).json({ error: `Batch detection failed (exit code ${code})`, details: stderr.slice(-500) });
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const jsonLine = lines[lines.length - 1];
        const result = JSON.parse(jsonLine);
        res.json(result);
      } catch (parseErr) {
        res.status(500).json({ error: 'Failed to parse batch detection result' });
      }
    });

    child.on('error', (err: Error) => {
      res.status(500).json({ error: `Failed to start detector: ${err.message}` });
    });

  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Batch detection failed' });
  }
});

// ---------------------------------------------------------------------------
//  POST /api/training/transcribe-enhanced — Enhanced Whisper transcription
//  with anti-hallucination, structure detection, and faster-whisper support
// ---------------------------------------------------------------------------
router.post('/transcribe-enhanced', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioPath, model = 'base', language, structure = false, backend = 'auto' } = req.body;

    if (!audioPath || typeof audioPath !== 'string') {
      res.status(400).json({ error: 'audioPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();

    // Resolve audio path
    let resolvedAudio = audioPath;
    if (audioPath.startsWith('/audio/')) {
      resolvedAudio = path.join(__dirname, '../../public', audioPath);
    } else if (audioPath.startsWith('http')) {
      try {
        const parsed = new URL(audioPath);
        if (parsed.pathname.startsWith('/audio/')) {
          resolvedAudio = path.join(__dirname, '../../public', parsed.pathname);
        }
      } catch { /* fall through */ }
    } else if (!path.isAbsolute(audioPath)) {
      resolvedAudio = path.resolve(aceStepDir, audioPath);
    }

    if (!existsSync(resolvedAudio)) {
      res.status(404).json({ error: `Audio file not found: ${audioPath}` });
      return;
    }

    const scriptPath = path.resolve(__dirname, '../../scripts/whisper_transcribe.py');
    if (!existsSync(scriptPath)) {
      res.status(500).json({ error: 'whisper_transcribe.py script not found' });
      return;
    }

    const pythonPath = resolvePythonPath(aceStepDir);

    const validModels = ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3', 'turbo'];
    const safeModel = validModels.includes(model) ? model : 'base';
    const validBackends = ['auto', 'openai', 'faster'];
    const safeBackend = validBackends.includes(backend) ? backend : 'auto';

    console.log(`[Training] Enhanced transcription: ${path.basename(resolvedAudio)} (model=${safeModel}, backend=${safeBackend}, structure=${structure})`);

    const pyArgs = [
      scriptPath,
      '--audio', resolvedAudio,
      '--model', safeModel,
      '--backend', safeBackend,
      '--json',
    ];
    if (language) pyArgs.push('--language', language);
    if (structure) pyArgs.push('--structure');

    const child = spawn(pythonPath, pyArgs, {
      cwd: aceStepDir,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      const lines = text.split('\n').filter((l: string) => l.trim() && !l.startsWith('{'));
      for (const line of lines) {
        console.log(`[Whisper] ${line}`);
      }
    });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error(`[Training] Whisper failed (code ${code}):`, stderr);
        res.status(500).json({ error: `Transcription failed (exit code ${code})`, details: stderr.slice(-500) });
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const jsonLine = lines[lines.length - 1];
        const result = JSON.parse(jsonLine);

        if (!result.success) {
          res.status(500).json({ error: result.error || 'Transcription failed' });
          return;
        }

        console.log(`[Training] Transcription done: ${result.segment_count} segments, ${result.filtered_count} filtered (${result.elapsed_seconds}s)`);
        res.json({
          transcript: result.text,
          structured_transcript: result.structured_text,
          language: result.language,
          segments: result.segment_count,
          filtered: result.filtered_count,
          backend: result.backend,
          model: result.model,
          elapsed: result.elapsed_seconds,
        });
      } catch (parseErr) {
        console.error('[Training] Failed to parse Whisper output:', stdout);
        res.status(500).json({ error: 'Failed to parse transcription result' });
      }
    });

    child.on('error', (err: Error) => {
      res.status(500).json({ error: `Failed to start Whisper: ${err.message}` });
    });

  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Transcription failed' });
  }
});

export default router;
