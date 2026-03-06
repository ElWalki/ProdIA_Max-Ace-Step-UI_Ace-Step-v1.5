import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { promises as fsp } from 'fs';
import { spawn } from 'child_process';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import { config } from '../config/index.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getGradioClient } from '../services/gradio-client.js';
import {
  generateMusicViaAPI,
  generateSectionsViaAPI,
  getJobStatus,
  getAudioStream,
  discoverEndpoints,
  checkSpaceHealth,
  getBackendStatus,
  swapLlmModel,
  cleanupJob,
  cancelJob,
  reinitializeServer,
  getJobRawResponse,
  downloadAudioToBuffer,
  resolvePythonPath,
} from '../services/acestep.js';
import { tagAudioBuffer } from '../services/audioMetadata.js';
import { getStorageProvider } from '../services/storage/factory.js';

const router = Router();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3', // Alternative MIME type for MP3
      'audio/mpeg3',
      'audio/x-mpeg-3',
      'audio/wav',
      'audio/x-wav',
      'audio/flac',
      'audio/x-flac',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'video/mp4',
    ];

    // Also check file extension as fallback
    const allowedExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.mp4', '.aac', '.ogg', '.webm', '.opus'];
    const fileExt = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];

    if (allowedTypes.includes(file.mimetype) || (fileExt && allowedExtensions.includes(fileExt))) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only common audio formats are allowed. Received: ${file.mimetype} (${file.originalname})`));
    }
  }
});

interface GenerateBody {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  lyrics: string;
  style: string;
  title: string;

  // Common
  instrumental: boolean;
  vocalLanguage?: string;

  // Music Parameters
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;

  // Generation Settings
  inferenceSteps?: number;
  guidanceScale?: number;
  batchSize?: number;
  randomSeed?: boolean;
  seed?: number;
  thinking?: boolean;
  audioFormat?: 'mp3' | 'flac';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;
  alignToMeasures?: boolean;
  sectionMeasures?: number;
  melodicVariation?: number;
  lmRepetitionPenalty?: number;

  // LoRA state at generation time
  loraLoaded?: boolean;
  loraPath?: string;
  loraName?: string;
  loraScale?: number;
  loraEnabled?: boolean;
  loraTriggerTag?: string;
  loraTagPosition?: string;
}

router.post('/upload-audio', authMiddleware, (req: AuthenticatedRequest, res: Response, next: Function) => {
  audioUpload.single('audio')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Invalid file upload' });
      return;
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Audio file is required' });
      return;
    }

    const storage = getStorageProvider();
    const extFromName = path.extname(req.file.originalname || '').toLowerCase();
    const extFromType = (() => {
      switch (req.file.mimetype) {
        case 'audio/mpeg':
          return '.mp3';
        case 'audio/wav':
        case 'audio/x-wav':
          return '.wav';
        case 'audio/flac':
        case 'audio/x-flac':
          return '.flac';
        case 'audio/ogg':
          return '.ogg';
        case 'audio/mp4':
        case 'audio/x-m4a':
        case 'audio/aac':
          return '.m4a';
        case 'audio/webm':
          return '.webm';
        case 'video/mp4':
          return '.mp4';
        default:
          return '';
      }
    })();
    const ext = extFromName || extFromType || '.audio';
    const key = `references/${req.user!.id}/${Date.now()}-${generateUUID()}${ext}`;
    const storedKey = await storage.upload(key, req.file.buffer, req.file.mimetype);
    const publicUrl = storage.getPublicUrl(storedKey);

    res.json({ url: publicUrl, key: storedKey });
  } catch (error) {
    console.error('Upload reference audio error:', error);
    res.status(500).json({ error: 'Failed to upload audio' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      customMode,
      songDescription,
      lyrics,
      style,
      title,
      instrumental,
      vocalLanguage,
      duration,
      bpm,
      keyScale,
      timeSignature,
      inferenceSteps,
      guidanceScale,
      batchSize,
      randomSeed,
      seed,
      thinking,
      audioFormat,
      inferMethod,
      shift,
      lmTemperature,
      lmCfgScale,
      lmTopK,
      lmTopP,
      lmNegativePrompt,
      lmBackend,
      lmModel,
      referenceAudioUrl,
      sourceAudioUrl,
      referenceAudioTitle,
      sourceAudioTitle,
      audioCodes,
      repaintingStart,
      repaintingEnd,
      instruction,
      audioCoverStrength,
      taskType,
      useAdg,
      cfgIntervalStart,
      cfgIntervalEnd,
      customTimesteps,
      useCotMetas,
      useCotCaption,
      useCotLanguage,
      autogen,
      constrainedDecodingDebug,
      allowLmBatch,
      alignToMeasures,
      getScores,
      getLrc,
      scoreScale,
      lmBatchChunkSize,
      trackName,
      completeTrackClasses,
      isFormatCaption,
      loraLoaded,
      loraPath,
      loraName,
      loraScale,
      loraEnabled,
      loraTriggerTag,
      loraTagPosition,
    } = req.body as GenerateBody;

    if (!customMode && !songDescription) {
      res.status(400).json({ error: 'Song description required for simple mode' });
      return;
    }

    if (customMode && !style && !lyrics && !referenceAudioUrl) {
      res.status(400).json({ error: 'Style, lyrics, or reference audio required for custom mode' });
      return;
    }

    const params = {
      customMode,
      songDescription,
      lyrics,
      style,
      title,
      instrumental,
      vocalLanguage,
      duration,
      bpm,
      keyScale,
      timeSignature,
      inferenceSteps,
      guidanceScale,
      batchSize,
      randomSeed,
      seed,
      thinking,
      audioFormat,
      inferMethod,
      shift,
      lmTemperature,
      lmCfgScale,
      lmTopK,
      lmTopP,
      lmNegativePrompt,
      lmBackend,
      lmModel,
      referenceAudioUrl,
      sourceAudioUrl,
      referenceAudioTitle,
      sourceAudioTitle,
      audioCodes,
      repaintingStart,
      repaintingEnd,
      instruction,
      audioCoverStrength,
      taskType,
      useAdg,
      cfgIntervalStart,
      cfgIntervalEnd,
      customTimesteps,
      useCotMetas,
      useCotCaption,
      useCotLanguage,
      autogen,
      constrainedDecodingDebug,
      allowLmBatch,
      alignToMeasures,
      getScores,
      getLrc,
      scoreScale,
      lmBatchChunkSize,
      trackName,
      completeTrackClasses,
      isFormatCaption,
      loraLoaded,
      loraPath,
      loraName,
      loraScale,
      loraEnabled,
      loraTriggerTag,
      loraTagPosition,
    };

    // Create job record in database
    const localJobId = generateUUID();
    await pool.query(
      `INSERT INTO generation_jobs (id, user_id, status, params, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, datetime('now'), datetime('now'))`,
      [localJobId, req.user!.id, JSON.stringify(params)]
    );

    // Start generation
    const { jobId: hfJobId } = await generateMusicViaAPI(params);

    // Update job with ACE-Step task ID
    await pool.query(
      `UPDATE generation_jobs SET acestep_task_id = ?, status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [hfJobId, localJobId]
    );

    res.json({
      jobId: localJobId,
      status: 'queued',
      queuePosition: 1,
    });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: (error as Error).message || 'Generation failed' });
  }
});

// POST /api/generate/sections — Section-based "Suno-style" generation
// Parses lyrics structure tags, plans section durations, generates each section sequentially
router.post('/sections', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      customMode, songDescription, lyrics, style, title, instrumental,
      vocalLanguage, duration, bpm, keyScale, timeSignature,
      inferenceSteps, guidanceScale, batchSize, randomSeed, seed,
      thinking, audioFormat, inferMethod, shift,
      lmTemperature, lmCfgScale, lmTopK, lmTopP, lmNegativePrompt,
      lmBackend, lmModel,
      referenceAudioUrl, sourceAudioUrl, referenceAudioTitle, sourceAudioTitle,
      audioCodes, repaintingStart, repaintingEnd, instruction, audioCoverStrength,
      taskType, useAdg, cfgIntervalStart, cfgIntervalEnd, customTimesteps,
      useCotMetas, useCotCaption, useCotLanguage, autogen,
      constrainedDecodingDebug, allowLmBatch, alignToMeasures,
      sectionMeasures, melodicVariation, lmRepetitionPenalty,
      getScores, getLrc, scoreScale, lmBatchChunkSize, trackName,
      completeTrackClasses, isFormatCaption,
      loraLoaded, loraPath, loraName, loraScale, loraEnabled,
      loraTriggerTag, loraTagPosition,
    } = req.body as GenerateBody;

    if (!lyrics || !lyrics.trim()) {
      res.status(400).json({ error: 'Lyrics with section tags (e.g. [Verse], [Chorus]) are required for section-based generation' });
      return;
    }

    const params = {
      customMode, songDescription, lyrics, style, title, instrumental,
      vocalLanguage, duration, bpm, keyScale, timeSignature,
      inferenceSteps, guidanceScale, batchSize, randomSeed, seed,
      thinking, audioFormat, inferMethod, shift,
      lmTemperature, lmCfgScale, lmTopK, lmTopP, lmNegativePrompt,
      lmBackend, lmModel,
      referenceAudioUrl, sourceAudioUrl, referenceAudioTitle, sourceAudioTitle,
      audioCodes, repaintingStart, repaintingEnd, instruction, audioCoverStrength,
      taskType, useAdg, cfgIntervalStart, cfgIntervalEnd, customTimesteps,
      useCotMetas, useCotCaption, useCotLanguage, autogen,
      constrainedDecodingDebug, allowLmBatch, alignToMeasures,
      sectionMeasures, melodicVariation, lmRepetitionPenalty,
      getScores, getLrc, scoreScale, lmBatchChunkSize, trackName,
      completeTrackClasses, isFormatCaption,
      loraLoaded, loraPath, loraName, loraScale, loraEnabled,
      loraTriggerTag, loraTagPosition,
    };

    // Create job record in database
    const localJobId = generateUUID();
    await pool.query(
      `INSERT INTO generation_jobs (id, user_id, status, params, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, datetime('now'), datetime('now'))`,
      [localJobId, req.user!.id, JSON.stringify({ ...params, _sectionMode: true })]
    );

    // Start section-based generation
    const { jobId: hfJobId } = await generateSectionsViaAPI(params);

    // Update job with ACE-Step task ID
    await pool.query(
      `UPDATE generation_jobs SET acestep_task_id = ?, status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [hfJobId, localJobId]
    );

    res.json({
      jobId: localJobId,
      status: 'queued',
      queuePosition: 1,
      sectionMode: true,
    });
  } catch (error) {
    console.error('Section generate error:', error);
    res.status(500).json({ error: (error as Error).message || 'Section generation failed' });
  }
});

// GET /api/generate/vram/diagnostic — Deep VRAM scan from Gradio process
router.get('/vram/diagnostic', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const apiUrl = config.acestep?.apiUrl || 'http://127.0.0.1:7860';
    const resp = await fetch(`${apiUrl}/v1/vram/diagnostic`);
    const data = await resp.json();
    res.json(data);
  } catch (error) {
    console.error('[VRAM Diagnostic] Error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/generate/vram/force-cleanup — Nuclear VRAM cleanup via Gradio
router.post('/vram/force-cleanup', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const apiUrl = config.acestep?.apiUrl || 'http://127.0.0.1:7860';
    const resp = await fetch(`${apiUrl}/v1/vram/force_cleanup`, { method: 'POST' });
    const data = await resp.json();
    res.json(data);
  } catch (error) {
    console.error('[VRAM Force Cleanup] Error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/generate/reinitialize — Emergency server reset: cancel all jobs, reset Gradio, purge VRAM
router.post('/reinitialize', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = reinitializeServer();
    res.json(result);
  } catch (error) {
    console.error('[Reinitialize] Route error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/generate/cancel/:jobId — Cancel a running or queued generation
router.post('/cancel/:jobId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Verify job ownership
    const jobResult = await pool.query(
      'SELECT user_id FROM generation_jobs WHERE id = ?',
      [jobId]
    );
    if (jobResult.rows.length > 0 && jobResult.rows[0].user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Cancel the in-memory job
    const result = cancelJob(jobId);

    // Update DB status
    if (result.success) {
      await pool.query(
        `UPDATE generation_jobs SET status = 'failed', error = 'Cancelled by user' WHERE id = ? AND status IN ('pending', 'queued', 'running')`,
        [jobId]
      );
    }

    res.json(result);
  } catch (error) {
    console.error('[Cancel] Route error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/status/:jobId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobResult = await pool.query(
      `SELECT id, user_id, acestep_task_id, status, params, result, error, created_at
       FROM generation_jobs
       WHERE id = ?`,
      [req.params.jobId]
    );

    if (jobResult.rows.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = jobResult.rows[0];

    if (job.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // If job is still running, check ACE-Step status
    if (['pending', 'queued', 'running'].includes(job.status) && job.acestep_task_id) {
      try {
        const aceStatus = await getJobStatus(job.acestep_task_id);

        // Stale job: in-memory job was lost (server restart). Auto-mark as failed in DB.
        if (aceStatus.status === 'failed' && aceStatus.error === 'Job not found') {
          await pool.query(
            `UPDATE generation_jobs SET status = 'failed', error = 'Server restarted — job lost', updated_at = datetime('now') WHERE id = ? AND status IN ('pending','queued','running')`,
            [req.params.jobId]
          );
          res.json({ status: 'failed', error: 'Server restarted — job lost' });
          return;
        }

        if (aceStatus.status !== job.status) {
          // Use optimistic lock: only update if status hasn't changed (prevents duplicate song creation)
          let updateQuery = `UPDATE generation_jobs SET status = ?, updated_at = datetime('now')`;
          const updateParams: unknown[] = [aceStatus.status];

          if (aceStatus.status === 'succeeded' && aceStatus.result) {
            updateQuery += `, result = ?`;
            updateParams.push(JSON.stringify(aceStatus.result));
          } else if (aceStatus.status === 'failed' && aceStatus.error) {
            updateQuery += `, error = ?`;
            updateParams.push(aceStatus.error);
          }

          updateQuery += ` WHERE id = ? AND status = ?`;
          updateParams.push(req.params.jobId, job.status);

          const updateResult = await pool.query(updateQuery, updateParams);
          const wasUpdated = updateResult.rowCount > 0;

          // If succeeded AND we were the first to update (optimistic lock), create song records
          if (aceStatus.status === 'succeeded' && aceStatus.result && wasUpdated) {
            const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
            // Inject the actual seed used by the generation engine
            if (aceStatus.result.actualSeed !== undefined) {
              params.actualSeed = aceStatus.result.actualSeed;
            }
            const audioUrls = aceStatus.result.audioUrls.filter((url: string) => {
              const lower = url.toLowerCase();
              return lower.endsWith('.mp3') || lower.endsWith('.flac') || lower.endsWith('.wav');
            });
            const localPaths: string[] = [];
            const storage = getStorageProvider();

            for (let i = 0; i < audioUrls.length; i++) {
              const audioUrl = audioUrls[i];
              const variationSuffix = audioUrls.length > 1 ? ` (v${i + 1})` : '';
              const songTitle = (params.title || 'Untitled') + variationSuffix;

              const songId = generateUUID();

              try {
                const { buffer: rawBuffer } = await downloadAudioToBuffer(audioUrl);
                const ext = audioUrl.includes('.flac') ? '.flac' : '.mp3';
                const format = ext === '.flac' ? 'flac' : 'mp3';

                // Tag audio with metadata
                const finalBpm = aceStatus.result.bpm || params.bpm;
                const finalKey = aceStatus.result.keyScale || params.keyScale;
                const finalTimeSig = aceStatus.result.timeSignature || params.timeSignature;
                const buffer = tagAudioBuffer(rawBuffer, format, {
                  title: songTitle,
                  artist: req.user!.username || 'Unknown',
                  album: 'ProdIA pro',
                  bpm: finalBpm ? Number(finalBpm) : undefined,
                  key: finalKey || undefined,
                  timeSignature: finalTimeSig || undefined,
                  genre: params.style || 'AI Generated',
                  comment: undefined,
                });

                const storageKey = `${req.user!.id}/${songId}${ext}`;
                await storage.upload(storageKey, buffer, `audio/${ext.slice(1)}`);
                const storedPath = storage.getPublicUrl(storageKey);

                await pool.query(
                  `INSERT INTO songs (id, user_id, title, lyrics, style, caption, audio_url,
                                      duration, bpm, key_scale, time_signature, tags, is_public, generation_params,
                                      created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
                  [
                    songId,
                    req.user!.id,
                    songTitle,
                    params.instrumental ? '[Instrumental]' : params.lyrics,
                    params.style,
                    params.style,
                    storedPath,
                    aceStatus.result.duration && aceStatus.result.duration > 0 ? aceStatus.result.duration : (params.duration && params.duration > 0 ? params.duration : 120),
                    aceStatus.result.bpm || params.bpm,
                    aceStatus.result.keyScale || params.keyScale,
                    aceStatus.result.timeSignature || params.timeSignature,
                    JSON.stringify([]),
                    JSON.stringify(params),
                  ]
                );

                localPaths.push(storedPath);
              } catch (downloadError) {
                console.error(`Failed to download audio ${i + 1}:`, downloadError);
                // Still create song record with remote URL
                await pool.query(
                  `INSERT INTO songs (id, user_id, title, lyrics, style, caption, audio_url,
                                      duration, bpm, key_scale, time_signature, tags, is_public, generation_params,
                                      created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
                  [
                    songId,
                    req.user!.id,
                    songTitle,
                    params.instrumental ? '[Instrumental]' : params.lyrics,
                    params.style,
                    params.style,
                    audioUrl,
                    aceStatus.result.duration && aceStatus.result.duration > 0 ? aceStatus.result.duration : (params.duration && params.duration > 0 ? params.duration : 120),
                    aceStatus.result.bpm || params.bpm,
                    aceStatus.result.keyScale || params.keyScale,
                    aceStatus.result.timeSignature || params.timeSignature,
                    JSON.stringify([]),
                    JSON.stringify(params),
                  ]
                );
                localPaths.push(audioUrl);
              }
            }

            aceStatus.result.audioUrls = localPaths;
            cleanupJob(job.acestep_task_id);
          }
        }

        res.json({
          jobId: req.params.jobId,
          status: aceStatus.status,
          queuePosition: aceStatus.queuePosition,
          etaSeconds: aceStatus.etaSeconds,
          progress: aceStatus.progress,
          stage: aceStatus.stage,
          result: aceStatus.result,
          error: aceStatus.error,
        });
        return;
      } catch (aceError) {
        console.error('ACE-Step status check error:', aceError);
      }
    }

    // Return stored status
    res.json({
      jobId: req.params.jobId,
      status: job.status,
      progress: undefined,
      stage: undefined,
      result: job.result && typeof job.result === 'string' ? JSON.parse(job.result) : job.result,
      error: job.error,
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Audio proxy endpoint
router.get('/audio', async (req, res: Response) => {
  try {
    const audioPath = req.query.path as string;
    if (!audioPath) {
      res.status(400).json({ error: 'Path required' });
      return;
    }

    const audioResponse = await getAudioStream(audioPath);

    if (!audioResponse.ok) {
      res.status(audioResponse.status).json({ error: 'Failed to fetch audio' });
      return;
    }

    const contentType = audioResponse.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const contentLength = audioResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const reader = audioResponse.body?.getReader();
    if (!reader) {
      res.status(500).json({ error: 'Failed to read audio stream' });
      return;
    }

    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      return pump();
    };

    await pump();
  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, acestep_task_id, status, params, result, error, created_at
       FROM generation_jobs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.id]
    );

    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/endpoints', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const endpoints = await discoverEndpoints();
    res.json({ endpoints });
  } catch (error) {
    console.error('Discover endpoints error:', error);
    res.status(500).json({ error: 'Failed to discover endpoints' });
  }
});

router.get('/models', async (_req, res: Response) => {
  try {
    const checkpointsDir = resolveCheckpointsDir();

    // All known DiT models from Gradio's model_downloader.py registry:
    // - MAIN_MODEL_COMPONENTS includes "acestep-v15-turbo" (bundled with main download)
    // - SUBMODEL_REGISTRY includes the rest (separate HuggingFace repos, auto-downloaded on init)
    const ALL_DIT_MODELS = [
      'acestep-v15-turbo',             // default, from main model repo
      'acestep-v15-base',              // submodel
      'acestep-v15-sft',               // submodel
      'acestep-v15-turbo-shift1',      // submodel
      'acestep-v15-turbo-shift3',      // submodel
      'acestep-v15-turbo-continuous',   // submodel
    ];

    // Query Gradio /v1/models to get the currently loaded/active model
    let activeModel: string | null = null;
    try {
      const apiRes = await fetch(`${config.acestep.apiUrl}/v1/models`);
      if (apiRes.ok) {
        const data = await apiRes.json() as any;
        const gradioModels = data?.data?.models || data?.models || [];
        if (gradioModels.length > 0) {
          activeModel = gradioModels[0]?.name || null;
        }
      }
    } catch {
      // Gradio API unavailable
    }

    // Check which models are downloaded (exist on disk)
    // Matches Gradio's handler.py check_model_exists() and get_available_acestep_v15_models()
    const { existsSync, statSync } = await import('fs');
    const downloaded = new Set<string>();
    for (const model of ALL_DIT_MODELS) {
      const modelPath = path.join(checkpointsDir, model);
      try {
        if (existsSync(modelPath) && statSync(modelPath).isDirectory()) {
          downloaded.add(model);
        }
      } catch { /* skip */ }
    }

    // Also scan for any additional acestep-v15-* models on disk not in the registry
    // (e.g. user-trained or community models)
    try {
      const { readdirSync } = await import('fs');
      for (const entry of readdirSync(checkpointsDir)) {
        if (entry.startsWith('acestep-v15-') && statSync(path.join(checkpointsDir, entry)).isDirectory()) {
          downloaded.add(entry);
          if (!ALL_DIT_MODELS.includes(entry)) {
            ALL_DIT_MODELS.push(entry);
          }
        }
      }
    } catch { /* checkpoints dir may not exist */ }

    const models = ALL_DIT_MODELS.map(name => ({
      name,
      is_active: name === activeModel,
      is_preloaded: downloaded.has(name),
    }));

    // Sort: active first, then downloaded, then alphabetical
    models.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.is_preloaded !== b.is_preloaded) return a.is_preloaded ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ models });
  } catch (error) {
    console.error('Models error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// In-memory tracking of active model downloads
const activeDownloads = new Map<string, { status: 'downloading' | 'done' | 'error'; progress: string; error?: string }>();

// Custom checkpoints path override (set by user via Settings UI)
let customCheckpointsPath: string | null = null;

function resolveCheckpointsDir(): string {
  if (customCheckpointsPath) return customCheckpointsPath;
  const ACESTEP_DIR = process.env.ACESTEP_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ACE-Step-1.5');
  return path.join(ACESTEP_DIR, 'checkpoints');
}

function resolveAcestepDir(): string {
  return process.env.ACESTEP_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ACE-Step-1.5');
}

// POST /api/generate/models/download — Download a model from HuggingFace
router.post('/models/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { modelName } = req.body;
    if (!modelName || typeof modelName !== 'string') {
      res.status(400).json({ error: 'modelName is required' });
      return;
    }

    // Check if already downloading
    const existing = activeDownloads.get(modelName);
    if (existing && existing.status === 'downloading') {
      res.json({ status: 'downloading', message: `Already downloading ${modelName}`, progress: existing.progress });
      return;
    }

    const ACESTEP_DIR = resolveAcestepDir();
    const pythonPath = resolvePythonPath(ACESTEP_DIR);
    const downloaderScript = path.join(ACESTEP_DIR, 'acestep', 'model_downloader.py');

    // Check script exists
    const { existsSync: fsExistsSync } = await import('fs');
    if (!fsExistsSync(downloaderScript)) {
      res.status(500).json({ error: 'model_downloader.py not found' });
      return;
    }

    // Mark as downloading
    activeDownloads.set(modelName, { status: 'downloading', progress: 'Starting download...' });

    // Spawn the download process asynchronously
    const { spawn } = await import('child_process');
    const proc = spawn(pythonPath, [downloaderScript, '--model', modelName, '--skip-main'], {
      cwd: ACESTEP_DIR,
      env: { ...process.env, ACESTEP_PATH: ACESTEP_DIR, PYTHONUNBUFFERED: '1' },
    });

    let lastOutput = '';
    proc.stdout.on('data', (data) => {
      lastOutput = data.toString().trim();
      activeDownloads.set(modelName, { status: 'downloading', progress: lastOutput });
    });
    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        lastOutput = line;
        activeDownloads.set(modelName, { status: 'downloading', progress: lastOutput });
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        activeDownloads.set(modelName, { status: 'done', progress: 'Download complete!' });
      } else {
        activeDownloads.set(modelName, { status: 'error', progress: lastOutput, error: `Download failed (exit code ${code})` });
      }
      // Clean up after 5 minutes
      setTimeout(() => activeDownloads.delete(modelName), 5 * 60 * 1000);
    });

    proc.on('error', (err) => {
      activeDownloads.set(modelName, { status: 'error', progress: '', error: err.message });
      setTimeout(() => activeDownloads.delete(modelName), 5 * 60 * 1000);
    });

    res.json({ status: 'downloading', message: `Started downloading ${modelName}` });
  } catch (error) {
    console.error('Model download error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/generate/models/download/:modelName — Check download status
router.get('/models/download/:modelName', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { modelName } = req.params;
    const status = activeDownloads.get(modelName);
    if (!status) {
      res.json({ status: 'idle', message: 'No active download' });
      return;
    }
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/generate/checkpoints-path — Return the resolved checkpoints directory
router.get('/checkpoints-path', async (_req, res: Response) => {
  try {
    const checkpointsDir = resolveCheckpointsDir();
    const { existsSync } = await import('fs');
    res.json({
      path: checkpointsDir,
      acestepDir: resolveAcestepDir(),
      exists: existsSync(checkpointsDir),
      isCustom: !!customCheckpointsPath,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/generate/checkpoints-path — Set a custom checkpoints directory
router.post('/checkpoints-path', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { path: newPath } = req.body;
    if (!newPath || typeof newPath !== 'string') {
      // Reset to default
      customCheckpointsPath = null;
      res.json({ path: resolveCheckpointsDir(), isCustom: false });
      return;
    }
    const { existsSync } = await import('fs');
    if (!existsSync(newPath)) {
      res.status(400).json({ error: 'Directory does not exist' });
      return;
    }
    customCheckpointsPath = newPath;
    res.json({ path: newPath, isCustom: true, exists: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/generate/models/load — Load/swap a DiT model via Gradio
router.post('/models/load', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { model } = req.body;
    if (!model || typeof model !== 'string') {
      res.status(400).json({ error: 'model name is required' });
      return;
    }
    const apiUrl = config.acestep?.apiUrl || 'http://127.0.0.1:7860';
    const gradioRes = await fetch(`${apiUrl}/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(120000), // 2min timeout for model loading
    });
    if (!gradioRes.ok) {
      const err = await gradioRes.text();
      res.status(gradioRes.status).json({ error: err || 'Failed to load model' });
      return;
    }
    const data = await gradioRes.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/generate/models/download-main — Download the main model from HuggingFace
router.post('/models/download-main', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = activeDownloads.get('__main__');
    if (existing && existing.status === 'downloading') {
      res.json({ status: 'downloading', message: 'Already downloading main model', progress: existing.progress });
      return;
    }

    const ACESTEP_DIR = resolveAcestepDir();
    const pythonPath = resolvePythonPath(ACESTEP_DIR);
    const downloaderScript = path.join(ACESTEP_DIR, 'acestep', 'model_downloader.py');

    const { existsSync: fsExistsSync } = await import('fs');
    if (!fsExistsSync(downloaderScript)) {
      res.status(500).json({ error: 'model_downloader.py not found' });
      return;
    }

    activeDownloads.set('__main__', { status: 'downloading', progress: 'Starting main model download...' });

    const { spawn } = await import('child_process');
    const proc = spawn(pythonPath, [downloaderScript, '--download-main'], {
      cwd: ACESTEP_DIR,
      env: { ...process.env, ACESTEP_PATH: ACESTEP_DIR, PYTHONUNBUFFERED: '1' },
    });

    let lastOutput = '';
    proc.stdout.on('data', (data) => {
      lastOutput = data.toString().trim();
      activeDownloads.set('__main__', { status: 'downloading', progress: lastOutput });
    });
    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        lastOutput = line;
        activeDownloads.set('__main__', { status: 'downloading', progress: lastOutput });
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        activeDownloads.set('__main__', { status: 'done', progress: 'Main model download complete!' });
      } else {
        activeDownloads.set('__main__', { status: 'error', progress: lastOutput, error: `Download failed (exit code ${code})` });
      }
      setTimeout(() => activeDownloads.delete('__main__'), 5 * 60 * 1000);
    });

    proc.on('error', (err) => {
      activeDownloads.set('__main__', { status: 'error', progress: '', error: err.message });
      setTimeout(() => activeDownloads.delete('__main__'), 5 * 60 * 1000);
    });

    res.json({ status: 'downloading', message: 'Started downloading main model (ACE-Step/Ace-Step1.5)' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/generate/random-description — Load a random simple description from Gradio
router.get('/random-description', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await getGradioClient();
    const result = await client.predict('/load_random_simple_description', []);
    const data = result.data as unknown[];
    // Returns [description, instrumental, vocal_language]
    res.json({
      description: data[0] || '',
      instrumental: data[1] || false,
      vocalLanguage: data[2] || 'unknown',
    });
  } catch (error) {
    console.error('Random description error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/health', async (_req, res: Response) => {
  try {
    const healthy = await checkSpaceHealth();
    res.json({ healthy });
  } catch (error) {
    res.json({ healthy: false, error: (error as Error).message });
  }
});

// Backend status — returns DiT + LLM model info from Gradio /v1/status
router.get('/backend-status', async (_req, res: Response) => {
  try {
    const status = await getBackendStatus();
    res.json(status);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// Swap LLM model — unloads current, loads new one
router.post('/llm/swap', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { model, backend } = req.body || {};
    if (!model) {
      res.status(400).json({ error: 'Missing "model" field' });
      return;
    }
    const result = await swapLlmModel(model, backend || 'pt');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/limits', async (_req, res: Response) => {
  try {
    const { spawn } = await import('child_process');
    const ACESTEP_DIR = process.env.ACESTEP_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ACE-Step-1.5');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
    const LIMITS_SCRIPT = path.join(SCRIPTS_DIR, 'get_limits.py');
    const pythonPath = resolvePythonPath(ACESTEP_DIR);

    const result = await new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
      const proc = spawn(pythonPath, [LIMITS_SCRIPT], {
        cwd: ACESTEP_DIR,
        env: {
          ...process.env,
          ACESTEP_PATH: ACESTEP_DIR,
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          try {
            const parsed = JSON.parse(stdout);
            resolve({ success: true, data: parsed });
          } catch {
            resolve({ success: false, error: 'Failed to parse limits result' });
          }
        } else {
          resolve({ success: false, error: stderr || 'Failed to read limits' });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    if (result.success && result.data) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error || 'Failed to load limits' });
    }
  } catch (error) {
    console.error('Limits error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/debug/:taskId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawResponse = getJobRawResponse(req.params.taskId);
    if (!rawResponse) {
      res.status(404).json({ error: 'Job not found or no raw response available' });
      return;
    }
    res.json({ rawResponse });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Format endpoint - uses LLM to enhance style/lyrics
router.post('/format', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { caption, lyrics, bpm, duration, keyScale, timeSignature, temperature, topK, topP, lmModel, lmBackend } = req.body;

    if (!caption) {
      res.status(400).json({ error: 'Caption/style is required' });
      return;
    }

    const { spawn } = await import('child_process');

    const ACESTEP_DIR = process.env.ACESTEP_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ACE-Step-1.5');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
    const FORMAT_SCRIPT = path.join(SCRIPTS_DIR, 'format_sample.py');
    const pythonPath = resolvePythonPath(ACESTEP_DIR);

    const args = [
      FORMAT_SCRIPT,
      '--caption', caption,
      '--json',
    ];

    if (lyrics) args.push('--lyrics', lyrics);
    if (bpm && bpm > 0) args.push('--bpm', String(bpm));
    if (duration && duration > 0) args.push('--duration', String(duration));
    if (keyScale) args.push('--key-scale', keyScale);
    if (timeSignature) args.push('--time-signature', timeSignature);
    if (temperature !== undefined) args.push('--temperature', String(temperature));
    if (topK && topK > 0) args.push('--top-k', String(topK));
    if (topP !== undefined) args.push('--top-p', String(topP));
    if (lmModel) args.push('--lm-model', lmModel);
    if (lmBackend) args.push('--lm-backend', lmBackend);

    console.log(`[Format] Running: ${pythonPath} ${args.join(' ')}`);
    console.log(`[Format] CWD: ${ACESTEP_DIR}`);
    const result = await new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
      const proc = spawn(pythonPath, args, {
        cwd: ACESTEP_DIR,
        env: {
          ...process.env,
          ACESTEP_PATH: ACESTEP_DIR,
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          // stdout may contain log lines before the JSON — extract last JSON line
          const lines = stdout.trim().split('\n');
          let jsonStr = '';
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].startsWith('{')) { jsonStr = lines[i]; break; }
          }
          try {
            const parsed = JSON.parse(jsonStr || stdout);
            resolve({ success: true, data: parsed });
          } catch {
            console.error('[Format] Failed to parse stdout:', stdout.slice(0, 500));
            resolve({ success: false, error: 'Failed to parse format result' });
          }
        } else {
          console.error(`[Format] Process exited with code ${code}`);
          if (stdout) console.error('[Format] stdout:', stdout.slice(0, 1000));
          if (stderr) console.error('[Format] stderr:', stderr.slice(0, 1000));
          resolve({ success: false, error: stderr || stdout || `Format process exited with code ${code}` });
        }
      });

      proc.on('error', (err) => {
        console.error('[Format] Spawn error:', err.message);
        resolve({ success: false, error: err.message });
      });
    });

    if (result.success && result.data) {
      res.json(result.data);
    } else {
      console.error('[Format] Python error:', result.error);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[Format] Route error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Random Reference Folder: list audio files from a directory ---
router.post('/list-audio-folder', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || typeof folderPath !== 'string') {
      return res.status(400).json({ error: 'folderPath is required' });
    }

    const fs = await import('fs');
    const resolvedPath = path.resolve(folderPath);

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      return res.status(404).json({ error: 'Folder not found', path: resolvedPath });
    }

    const audioExtensions = ['.wav', '.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.webm'];
    const files: { name: string; path: string; size: number }[] = [];

    const scanDir = (dir: string, depth: number = 0) => {
      if (depth > 2) return; // max 2 levels deep
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() && depth < 2) {
            scanDir(fullPath, depth + 1);
          } else if (stat.isFile()) {
            const ext = path.extname(entry).toLowerCase();
            if (audioExtensions.includes(ext)) {
              files.push({ name: entry, path: fullPath, size: stat.size });
            }
          }
        } catch { /* skip inaccessible */ }
      }
    };

    scanDir(resolvedPath);
    res.json({ folder: resolvedPath, files, count: files.length });
  } catch (error) {
    console.error('[ListAudioFolder] Error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});
// ---------------------------------------------------------------------------
// Extract semantic audio codes from an uploaded audio file
// Uses the Gradio /convert_src_audio_to_codes endpoint to extract 5Hz semantic
// tokens that capture melody/rhythm structure much more faithfully than raw
// reference audio alone.
// ---------------------------------------------------------------------------
router.post('/extract-codes', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioUrl } = req.body as { audioUrl?: string };
    if (!audioUrl || typeof audioUrl !== 'string') {
      return res.status(400).json({ error: 'audioUrl is required and must be a string' });
    }

    // Resolve the stored audio URL to a local file path
    const resolveAudioPath = (url: string): string => {
      if (url.startsWith('/audio/')) {
        return path.join(config.audioDir, url.replace('/audio/', ''));
      }
      if (url.startsWith('http')) {
        try {
          const parsed = new URL(url);
          if (parsed.pathname.startsWith('/audio/')) {
            return path.join(config.audioDir, parsed.pathname.replace('/audio/', ''));
          }
        } catch { /* fall through */ }
      }
      return url;
    };

    const resolvedPath = resolveAudioPath(audioUrl);

    const fs = await import('fs');
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Audio file not found: ${resolvedPath}` });
    }

    const client = await getGradioClient();
    let audioCodes = '';

    // Try both possible endpoint names
    try {
      const result = await client.predict('/convert_src_audio_to_codes', [
        { path: resolvedPath, orig_name: path.basename(resolvedPath) },
      ]);
      const data = result.data as unknown[];
      audioCodes = (data[0] as string) || '';
    } catch {
      try {
        const result = await client.predict('/convert_src_audio_to_codes_wrapper', [
          { path: resolvedPath, orig_name: path.basename(resolvedPath) },
        ]);
        const data = result.data as unknown[];
        audioCodes = (data[0] as string) || '';
      } catch (e2) {
        return res.status(501).json({
          error: 'Failed to extract audio codes via Gradio',
          hint: 'Ensure the model is initialized in the Gradio service.',
          details: e2 instanceof Error ? e2.message : String(e2),
        });
      }
    }

    if (!audioCodes || audioCodes.startsWith('❌')) {
      return res.status(500).json({ error: audioCodes || 'Failed to encode audio to codes' });
    }

    const codeCount = (audioCodes.match(/<\|audio_code_\d+\|>/g) || []).length;
    console.log(`[ExtractCodes] Extracted ${codeCount} semantic tokens from ${path.basename(resolvedPath)}`);

    res.json({ audioCodes, codeCount });
  } catch (error) {
    console.error('[ExtractCodes] Error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Whisper transcription — transcribe an uploaded audio file to text
// Uses Python + openai-whisper library to extract lyrics/speech from audio.
// Falls back to whisper CLI if available.
// ---------------------------------------------------------------------------

/** Whisper model sizes with approximate disk sizes */
const WHISPER_MODELS = [
  { name: 'tiny',     size: '~75 MB',  params: '39M'  },
  { name: 'base',     size: '~145 MB', params: '74M'  },
  { name: 'small',    size: '~465 MB', params: '244M' },
  { name: 'medium',   size: '~1.5 GB', params: '769M' },
  { name: 'large',    size: '~3 GB',   params: '1550M' },
  { name: 'large-v2', size: '~3 GB',   params: '1550M' },
  { name: 'large-v3', size: '~3 GB',   params: '1550M' },
  { name: 'turbo',    size: '~1.6 GB', params: '809M' },
];

/**
 * Find a working Python executable that has whisper installed.
 * Checks ACE-Step venv first, then system PATH.
 */
const findWhisperPython = async (): Promise<string | null> => {
  // 1. Direct override
  if (process.env.WHISPER_CMD) return process.env.WHISPER_CMD;

  // 2. ACE-Step venv Python (most likely location)
  const venvPythons = [
    path.resolve(config.audioDir, '../../../ACE-Step-1.5_/.venv/Scripts/python.exe'),
    path.resolve(config.audioDir, '../../../ACE-Step-1.5_/.venv/bin/python'),
    path.resolve(config.audioDir, '../../../ACE-Step-1.5_/python_embeded/python.exe'),
  ];
  for (const pyPath of venvPythons) {
    try {
      await fsp.access(pyPath);
      // Verify whisper is importable
      const checkResult = await new Promise<boolean>((resolve) => {
        const proc = spawn(pyPath, ['-c', 'import whisper; print("ok")'], { stdio: 'pipe' });
        let output = '';
        proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
        proc.on('close', (code) => resolve(code === 0 && output.includes('ok')));
        proc.on('error', () => resolve(false));
        setTimeout(() => { proc.kill(); resolve(false); }, 10000);
      });
      if (checkResult) return pyPath;
    } catch { /* ignore */ }
  }

  // 3. Check whisper CLI in PATH as fallback
  const pathEntries = (process.env.PATH || '').split(path.delimiter);
  for (const entry of pathEntries) {
    for (const name of ['whisper', 'whisper.exe']) {
      const candidate = path.join(entry, name);
      try {
        await fsp.access(candidate);
        return `CLI:${candidate}`; // prefix to distinguish CLI mode
      } catch { /* ignore */ }
    }
  }
  return null;
};

router.post('/transcribe', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioUrl, language, model } = req.body as { audioUrl?: string; language?: string; model?: string };
    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl is required' });
    }

    // Validate model name if provided
    const whisperModel = model && WHISPER_MODELS.some(m => m.name === model) ? model : 'base';

    // Resolve audio URL → local file path
    const resolveAudioPath = (url: string): string => {
      if (url.startsWith('/audio/')) {
        return path.join(config.audioDir, url.replace('/audio/', ''));
      }
      if (url.startsWith('http')) {
        try {
          const parsed = new URL(url);
          if (parsed.pathname.startsWith('/audio/')) {
            return path.join(config.audioDir, parsed.pathname.replace('/audio/', ''));
          }
        } catch { /* fall through */ }
      }
      return url;
    };

    const resolvedPath = resolveAudioPath(audioUrl);

    const fsSync = await import('fs');
    if (!fsSync.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Audio file not found: ${resolvedPath}` });
    }

    const whisperPython = await findWhisperPython();
    if (!whisperPython) {
      return res.status(501).json({
        error: 'Whisper not found',
        hint: 'Install whisper: pip install openai-whisper (in ACE-Step venv)',
      });
    }

    console.log(`[Transcribe] Using: ${whisperPython} model=${whisperModel} for ${path.basename(resolvedPath)}`);

    let transcript = '';

    if (whisperPython.startsWith('CLI:')) {
      // CLI mode — use whisper executable directly
      const cmd = whisperPython.slice(4);
      const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'whisper-'));
      const outputDir = path.join(tempDir, 'out');
      try {
        await fsp.mkdir(outputDir, { recursive: true });
        const args = [resolvedPath, '--model', whisperModel, '--output_format', 'txt',
                      '--output_dir', outputDir, '--fp16', 'False'];
        if (language) args.push('--language', language);

        await new Promise<void>((resolve, reject) => {
          const proc = spawn(cmd, args, { stdio: 'pipe' });
          let stderr = '';
          proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
          proc.on('error', (err) => reject(new Error(`whisper error: ${err.message}`)));
          proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Whisper exited ${code}: ${stderr.slice(-500)}`));
          });
        });

        const files = await fsp.readdir(outputDir);
        const txtFile = files.find((f) => f.endsWith('.txt'));
        if (txtFile) {
          transcript = (await fsp.readFile(path.join(outputDir, txtFile), 'utf8')).trim();
        }
      } finally {
        try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    } else {
      // Python library mode — run whisper via Python inline script
      const langArg = language ? `"${language}"` : 'None';
      const escapedPath = resolvedPath.replace(/\\/g, '\\\\');
      const pyScript = `
import whisper, json, sys
try:
    model = whisper.load_model("${whisperModel}")
    result = model.transcribe("${escapedPath}", language=${langArg}, fp16=False)
    print(json.dumps({"text": result["text"].strip(), "language": result.get("language", "auto")}))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`.trim();

      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn(whisperPython, ['-c', pyScript], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('error', (err) => reject(new Error(`python error: ${err.message}`)));
        proc.on('close', (code) => {
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`Whisper failed (code ${code}): ${stderr.slice(-500)}`));
        });
      });

      try {
        const parsed = JSON.parse(output);
        transcript = parsed.text || '';
      } catch {
        transcript = output; // fallback to raw output
      }
    }

    if (!transcript) {
      return res.status(500).json({ error: 'Whisper produced no output' });
    }

    console.log(`[Transcribe] Success: ${transcript.length} chars from ${path.basename(resolvedPath)}`);
    res.json({ transcript, language: language || 'auto' });
  } catch (error) {
    console.error('[Transcribe] Error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Check if Whisper is available
router.get('/transcribe/available', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const whisperPython = await findWhisperPython();
    res.json({ available: !!whisperPython, path: whisperPython });
  } catch {
    res.json({ available: false });
  }
});

// List available Whisper models with download status
router.get('/transcribe/models', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const whisperPython = await findWhisperPython();
    if (!whisperPython || whisperPython.startsWith('CLI:')) {
      // Can't check download status in CLI mode — return all as unknown
      return res.json({
        available: !!whisperPython,
        models: WHISPER_MODELS.map(m => ({ ...m, downloaded: false })),
      });
    }

    // Use Python to check which models are cached
    const pyScript = `
import json, os, sys
try:
    cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "whisper")
    downloaded = set()
    if os.path.isdir(cache_dir):
        for f in os.listdir(cache_dir):
            if f.endswith(".pt"):
                downloaded.add(f.replace(".pt", ""))
    # Also check XDG_CACHE_HOME
    xdg = os.environ.get("XDG_CACHE_HOME")
    if xdg:
        alt = os.path.join(xdg, "whisper")
        if os.path.isdir(alt):
            for f in os.listdir(alt):
                if f.endswith(".pt"):
                    downloaded.add(f.replace(".pt", ""))
    print(json.dumps(list(downloaded)))
except Exception as e:
    print(json.dumps([]), file=sys.stderr)
    sys.exit(1)
`.trim();

    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn(whisperPython, ['-c', pyScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      let stdout = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.on('error', () => resolve('[]'));
      proc.on('close', (code) => resolve(stdout.trim() || '[]'));
      setTimeout(() => { proc.kill(); resolve('[]'); }, 10000);
    });

    let downloaded: string[] = [];
    try { downloaded = JSON.parse(output); } catch { /* ignore */ }

    const models = WHISPER_MODELS.map(m => ({
      ...m,
      downloaded: downloaded.includes(m.name),
    }));

    res.json({ available: true, models });
  } catch (error) {
    console.error('[Whisper Models] Error:', error);
    res.json({ available: false, models: WHISPER_MODELS.map(m => ({ ...m, downloaded: false })) });
  }
});

export default router;
