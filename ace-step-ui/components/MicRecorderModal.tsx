/**
 * MicRecorderModal.tsx — Record voice from microphone and use as reference audio.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Play, Pause, X, Upload, Music, Waves, Trash2, Timer, FileText, Type, Languages, Cpu, Download, Info, Check, ChevronDown } from 'lucide-react';
import { generateApi } from '../services/api';
import { useI18n } from '../context/I18nContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecordingMode = 'reference' | 'cover';

export interface MicRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user applies the recording — provides the blob + chosen mode + strength + lyrics + codes */
  onApply?: (data: {
    blob: Blob;
    title: string;
    mode: RecordingMode;
    strength: number;
    lyrics: string;
    audioCodes?: string;
  }) => Promise<void>;
  /** Pre-populate lyrics from current Create Panel state */
  initialLyrics?: string;
  /** Auth token for API calls (Whisper transcription) */
  token?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MicRecorderModal({ isOpen, onClose, onApply, initialLyrics, token }: MicRecorderModalProps) {
  const { t } = useI18n();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isApplying, setIsApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Whisper transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [whisperModels, setWhisperModels] = useState<Array<{ name: string; size: string; params: string; downloaded: boolean }>>([]);
  const [selectedWhisperModel, setSelectedWhisperModel] = useState(() => {
    try { return localStorage.getItem('whisper-model') || 'base'; } catch { return 'base'; }
  });
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Processing state (upload + extract audio codes)
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [extractedCodes, setExtractedCodes] = useState<string | null>(null);

  // Lyrics editor
  const [lyrics, setLyrics] = useState(initialLyrics || '');
  const lyricsInitialized = useRef(false);

  // Settings
  const [mode, setMode] = useState<RecordingMode>(() => {
    try { return (localStorage.getItem('mic-mode') as RecordingMode) || 'reference'; } catch { return 'reference'; }
  });
  const [strength, setStrength] = useState(() => {
    try { return parseFloat(localStorage.getItem('mic-strength') || '0.6'); } catch { return 0.6; }
  });
  const [recordingTitle, setRecordingTitle] = useState(t('voiceRecording', 'Voice Recording'));

  // Sync lyrics from Create Panel when modal opens
  useEffect(() => {
    if (isOpen && initialLyrics !== undefined && !lyricsInitialized.current) {
      setLyrics(initialLyrics);
      lyricsInitialized.current = true;
    }
    if (!isOpen) {
      lyricsInitialized.current = false;
    }
  }, [isOpen, initialLyrics]);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('mic-mode', mode);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem('mic-strength', String(strength));
  }, [strength]);

  // Persist whisper model selection
  useEffect(() => {
    localStorage.setItem('whisper-model', selectedWhisperModel);
  }, [selectedWhisperModel]);

  // Check Whisper availability + models when modal opens
  useEffect(() => {
    if (isOpen && token && whisperAvailable === null) {
      generateApi.getWhisperModels(token)
        .then(r => {
          setWhisperAvailable(r.available);
          if (r.models) setWhisperModels(r.models);
        })
        .catch(() => setWhisperAvailable(false));
    }
  }, [isOpen, token, whisperAvailable]);

  // Cleanup on unmount / close
  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      stopPlayback();
    }
    return () => {
      stopRecording();
      stopPlayback();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => { });
      }
    };
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Waveform visualization
  // ---------------------------------------------------------------------------

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!analyserRef.current) return;
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = 'rgba(24, 24, 27, 0.3)';
      ctx.fillRect(0, 0, w, h);

      ctx.lineWidth = 2;
      ctx.strokeStyle = isRecording ? '#ef4444' : '#818cf8';
      ctx.beginPath();

      const sliceWidth = w / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(w, h / 2);
      ctx.stroke();
    };

    draw();
  }, [isRecording]);

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });

      setHasPermission(true);
      streamRef.current = stream;
      chunksRef.current = [];

      // Setup analyser for waveform
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
      };

      mediaRecorder.start(100); // collect data every 100ms
      setIsRecording(true);
      setRecordedBlob(null);
      setRecordingDuration(0);

      // Timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - startTime) / 1000);
      }, 100);

      // Start visualization
      drawWaveform();

    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setHasPermission(false);
      setApplyStatus(`❌ ${t('micAccessDenied', 'Could not access microphone')}`);
      setTimeout(() => setApplyStatus(null), 3000);
    }
  }, [drawWaveform, t]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => { });
      audioCtxRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  const togglePlayback = useCallback(() => {
    if (!recordedBlob) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    const url = URL.createObjectURL(recordedBlob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.ontimeupdate = () => setPlaybackTime(audio.currentTime);
    audio.onended = () => {
      setIsPlaying(false);
      setPlaybackTime(0);
      URL.revokeObjectURL(url);
    };

    audio.play();
    setIsPlaying(true);
  }, [recordedBlob, isPlaying]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackTime(0);
  }, []);

  const deleteRecording = useCallback(() => {
    stopPlayback();
    setRecordedBlob(null);
    setRecordingDuration(0);
    setUploadedUrl(null);
    setIsProcessed(false);
    setExtractedCodes(null);
  }, [stopPlayback]);

  // ---------------------------------------------------------------------------
  // Process audio — upload WAV + extract semantic audio codes
  // ---------------------------------------------------------------------------

  const uploadAndGetUrl = useCallback(async (): Promise<string> => {
    if (uploadedUrl) return uploadedUrl;
    if (!recordedBlob || !token) throw new Error('No recording or token');

    const arrayBuffer = await recordedBlob.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 44100 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(audioBuffer);
    audioCtx.close().catch(() => { });

    const safeName = recordingTitle.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const file = new File([wavBlob], `${safeName}.wav`, { type: 'audio/wav' });
    const result = await generateApi.uploadAudio(file, token);
    setUploadedUrl(result.url);
    return result.url;
  }, [recordedBlob, token, uploadedUrl, recordingTitle]);

  const handleProcess = useCallback(async (withWhisper: boolean) => {
    if (!recordedBlob || !token) return;

    setIsProcessing(true);
    setApplyStatus(`⚙️ ${t('uploadingAudio', 'Uploading audio...')}`);

    try {
      const url = await uploadAndGetUrl();

      // Extract audio codes (semantic tokens for melody/rhythm conditioning)
      setApplyStatus(`🧠 ${t('extractingCodes', 'Extracting semantic codes...')}`);
      try {
        const codesResult = await generateApi.extractAudioCodes(url, token);
        if (codesResult.audioCodes && codesResult.codeCount > 0) {
          setExtractedCodes(codesResult.audioCodes);
          setApplyStatus(`✅ ${t('codesExtracted', { count: codesResult.codeCount, defaultValue: '{{count}} codes extracted' })}`);
        } else {
          setApplyStatus(`⚠️ ${t('codesFailedTimbreOnly', 'Could not extract codes (timbre only)')}`);
        }
      } catch (codeErr) {
        console.warn('Audio code extraction failed:', codeErr);
        setApplyStatus(`⚠️ ${t('codesExtractionError', 'Code extraction failed (timbre only)')}`);
      }

      setIsProcessed(true);

      // Whisper transcription if requested
      if (withWhisper && whisperAvailable) {
        setIsTranscribing(true);
        setApplyStatus(`🎙️ ${t('whisperTranscribing', 'Whispers transcribing...')}`);
        try {
          const result = await generateApi.transcribeAudio(url, token, undefined, selectedWhisperModel);
          if (result.transcript) {
            setLyrics(prev => {
              const trimmed = prev.trim();
              if (!trimmed) return result.transcript;
              return `${trimmed}\n\n${result.transcript}`;
            });
            setApplyStatus(`✅ ${t('transcriptionSuccess', { count: result.transcript.length, defaultValue: 'Processed + transcribed ({{count}} chars)' })}`);
          } else {
            setApplyStatus(`✅ ${t('transcriptionNoText', 'Processed — Whisper detected no text')}`);
          }
        } catch (err: any) {
          console.error('Whisper transcription failed:', err);
          const msg = err?.message || 'error';
          if (msg.includes('501') || msg.includes('not found')) {
            setApplyStatus(`✅ ${t('whisperModelNotFound', 'Processed — Whisper model not downloaded')}`);
          } else {
            setApplyStatus(`✅ ${t('transcriptionError', { error: msg, defaultValue: 'Processed — transcription failed: {{error}}' })}`);
          }
        } finally {
          setIsTranscribing(false);
        }
      } else if (!withWhisper) {
        // Keep success message for a bit
      }

      setTimeout(() => setApplyStatus(null), 4000);
    } catch (err: any) {
      console.error('Processing failed:', err);
      setApplyStatus(`❌ ${t('processingError', { error: err?.message || 'failure', defaultValue: 'Error processing: {{error}}' })}`);
      setTimeout(() => setApplyStatus(null), 5000);
    } finally {
      setIsProcessing(false);
    }
  }, [recordedBlob, token, uploadAndGetUrl, whisperAvailable, selectedWhisperModel, t]);

  // ---------------------------------------------------------------------------
  // Apply — auto-process if needed (extract codes + optional whisper), then send to parent
  // ---------------------------------------------------------------------------

  const handleApply = useCallback(async () => {
    if (!recordedBlob || !onApply) return;

    setIsApplying(true);

    try {
      let codes = extractedCodes;

      // Auto-process if not yet processed: upload + extract codes + optional whisper
      if (!isProcessed && token) {
        setApplyStatus(`⚙️ ${t('uploadingAudio', 'Uploading audio...')}`);
        const url = await uploadAndGetUrl();

        // Extract audio codes
        setApplyStatus(`🧠 ${t('extractingCodes', 'Extracting semantic codes...')}`);
        try {
          const codesResult = await generateApi.extractAudioCodes(url, token);
          if (codesResult.audioCodes && codesResult.codeCount > 0) {
            codes = codesResult.audioCodes;
            setExtractedCodes(codes);
            setApplyStatus(`✅ ${t('codesExtracted', { count: codesResult.codeCount, defaultValue: '{{count}} codes extracted' })}`);
          }
        } catch (codeErr) {
          console.warn('Audio code extraction failed:', codeErr);
          // Continue without codes — timbre-only reference still works
        }

        // Whisper transcription if available and no lyrics yet
        if (whisperAvailable && !lyrics.trim()) {
          setApplyStatus(`🎙️ ${t('whisperTranscribing', 'Transcribing...')}`);
          try {
            const result = await generateApi.transcribeAudio(url, token, undefined, selectedWhisperModel);
            if (result.transcript) {
              setLyrics(result.transcript);
            }
          } catch {
            // Transcription is optional — continue
          }
        }

        setIsProcessed(true);
      }

      // Convert webm to WAV
      setApplyStatus(t('processingRecording', 'Processing recording...'));
      const arrayBuffer = await recordedBlob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 44100 });
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const wavBlob = audioBufferToWav(audioBuffer);
      audioCtx.close().catch(() => { });

      setApplyStatus(t('uploadingRecording', 'Uploading recording...'));
      await onApply({
        blob: wavBlob,
        title: recordingTitle || t('voiceRecording', 'Voice Recording'),
        mode,
        strength,
        lyrics: lyrics.trim(),
        audioCodes: codes || undefined,
      });

      setApplyStatus(`✅ ${t('recordingApplied', 'Recording applied!')}`);
      setTimeout(() => setApplyStatus(null), 2000);
    } catch (err: any) {
      console.error('Apply recording error:', err);
      setApplyStatus(`❌ ${t('error', 'Error')}: ${err?.message || t('failure', 'failure')}`);
      setTimeout(() => setApplyStatus(null), 4000);
    } finally {
      setIsApplying(false);
    }
  }, [recordedBlob, onApply, recordingTitle, mode, strength, lyrics, extractedCodes, isProcessed, token, uploadAndGetUrl, whisperAvailable, selectedWhisperModel, t]);

  // ---------------------------------------------------------------------------
  // WAV encoder (16-bit PCM)
  // ---------------------------------------------------------------------------

  function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = Math.min(buffer.numberOfChannels, 2);
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = 2; // 16-bit
    const dataLength = length * numChannels * bytesPerSample;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const wav = new ArrayBuffer(totalLength);
    const view = new DataView(wav);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true);  // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([wav], { type: 'audio/wav' });
  }

  function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  const fileSizeKb = recordedBlob ? Math.round(recordedBlob.size / 1024) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — two-column layout */}
      <div className="relative w-[820px] max-w-[95vw] max-h-[90vh] bg-zinc-900 rounded-2xl border border-zinc-700/40 shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-700/30 bg-gradient-to-r from-red-900/20 to-orange-900/15 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-600/30 flex items-center justify-center">
              <Mic size={16} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white">{t('recordVoice', 'Record Voice')}</h2>
              <p className="text-[10px] text-zinc-500">
                {t('recordVoiceSubtitle', 'Record and use as reference or vocal for generation')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — two columns: lyrics left, recorder right */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT: Lyrics editor */}
          <div className="w-[300px] flex-shrink-0 border-r border-zinc-700/30 flex flex-col">
            <div className="px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/80 flex items-center gap-2 flex-shrink-0">
              <FileText size={13} className="text-zinc-500" />
              <span className="text-[11px] font-semibold text-zinc-300">{t('lyrics', 'Lyrics')}</span>
              <span className="text-[9px] text-zinc-600 ml-auto">
                {t('linesCount', { count: lyrics.split('\n').filter(l => l.trim()).length, defaultValue: '{{count}} lines' })}
              </span>
            </div>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={t('lyricsMicPlaceholder', '[Verse]\nWrite lyrics here...\n\n[Chorus]\nThe chorus goes here...\n\nWhile recording, you can read the lyrics\nand it will be injected into the panel when applying.')}
              className="flex-1 w-full bg-transparent text-[11px] text-zinc-300 px-4 py-3 resize-none outline-none scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent font-mono leading-relaxed placeholder:text-zinc-700"
              spellCheck={false}
            />
            <div className="px-4 py-1.5 border-t border-zinc-800/40 flex-shrink-0">
              <p className="text-[8px] text-zinc-600 leading-tight">
                {t('recordTip', 'Tip: Use [Verse], [Chorus], [Bridge] to structure. When applying, this will replace the create panel lyrics.')}
              </p>
            </div>
          </div>

          {/* RIGHT: Recorder + settings */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            <div className="p-5 space-y-4">
              {/* Waveform canvas */}
              <div className="relative rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800/60">
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={80}
                  className="w-full h-20"
                />
                {/* Recording indicator */}
                {isRecording && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] text-red-400 font-mono font-bold">
                      REC {formatTime(recordingDuration)}
                    </span>
                  </div>
                )}
                {/* Idle state */}
                {!isRecording && !recordedBlob && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] text-zinc-600">
                      {hasPermission === false
                        ? `⚠️ ${t('micAccessDenied', 'Microphone access denied')}`
                        : t('pressToRecord', 'Press record to start')}
                    </span>
                  </div>
                )}
                {/* Recorded state */}
                {!isRecording && recordedBlob && (
                  <div className="absolute inset-0 flex items-center justify-center gap-3">
                    <Waves size={14} className="text-indigo-400" />
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {formatTime(recordingDuration)} · {fileSizeKb} KB
                    </span>
                  </div>
                )}
              </div>

              {/* Recording controls */}
              <div className="flex items-center justify-center gap-3">
                {!isRecording && !recordedBlob && (
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium text-[12px] transition-colors shadow-lg shadow-red-600/20"
                  >
                    <Mic size={14} />
                    {t('record', 'Record')}
                  </button>
                )}

                {isRecording && (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-medium text-[12px] transition-colors animate-pulse"
                  >
                    <Square size={14} />
                    {t('stop', 'Stop')} ({formatTime(recordingDuration)})
                  </button>
                )}

                {!isRecording && recordedBlob && (
                  <>
                    <button
                      onClick={togglePlayback}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-medium text-[11px] transition-colors ${isPlaying
                        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700/40'
                        }`}
                    >
                      {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                      {isPlaying ? formatTime(playbackTime) : t('listen', 'Listen')}
                    </button>

                    <button
                      onClick={() => { setUploadedUrl(null); setIsProcessed(false); setExtractedCodes(null); startRecording(); }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-xl font-medium text-[11px] hover:bg-red-600/30 transition-colors"
                    >
                      <Mic size={12} />
                      {t('reRecord', 'Re-record')}
                    </button>

                    <button
                      onClick={deleteRecording}
                      className="p-2 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800 transition-colors"
                      title={t('deleteRecording', 'Delete recording')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>

              {/* Step 2: Process + Whisper buttons (after recording) */}
              {!isRecording && recordedBlob && !isProcessed && (
                <div className="space-y-3">
                  {/* Whisper model selector */}
                  {whisperAvailable && whisperModels.length > 0 && (
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Languages size={12} className="text-emerald-400" />
                        <span className="text-[10px] font-medium text-zinc-400">{t('whisperModel', 'Whisper Model:')}</span>
                      </div>
                      <button
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800/80 border border-zinc-700/40 rounded-lg text-[11px] text-zinc-300 hover:border-zinc-600 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          {whisperModels.find(m => m.name === selectedWhisperModel)?.downloaded
                            ? <Check size={10} className="text-emerald-400" />
                            : <Download size={10} className="text-amber-400" />
                          }
                          {selectedWhisperModel} ({whisperModels.find(m => m.name === selectedWhisperModel)?.size || '?'})
                        </span>
                        <ChevronDown size={12} className={`transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                      </button>
                      {showModelDropdown && (
                        <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700/60 rounded-lg shadow-xl overflow-hidden">
                          {whisperModels.map(m => (
                            <button
                              key={m.name}
                              onClick={() => { setSelectedWhisperModel(m.name); setShowModelDropdown(false); }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-[11px] hover:bg-zinc-700/60 transition-colors ${m.name === selectedWhisperModel ? 'bg-zinc-700/40 text-white' : 'text-zinc-300'
                                }`}
                            >
                              <span className="flex items-center gap-2">
                                {m.downloaded
                                  ? <Check size={10} className="text-emerald-400" />
                                  : <Download size={10} className="text-zinc-600" />
                                }
                                <span className="font-medium">{m.name}</span>
                                <span className="text-zinc-500">{m.size}</span>
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.downloaded
                                ? 'bg-emerald-600/20 text-emerald-400'
                                : 'bg-zinc-700 text-zinc-500'
                                }`}>
                                {m.downloaded ? t('downloaded', 'downloaded') : t('notDownloaded', 'not downloaded')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleProcess(true)}
                      disabled={isProcessing || isTranscribing}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-[11px] transition-all border ${isProcessing || isTranscribing
                        ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20 animate-pulse cursor-wait'
                        : 'bg-gradient-to-r from-emerald-600/20 to-cyan-600/20 text-emerald-300 border-emerald-500/30 hover:from-emerald-600/30 hover:to-cyan-600/30 hover:border-emerald-500/50'
                        }`}
                      title={t('processWhisperTooltip', 'Upload, extract semantic codes and transcribe with Whisper')}
                    >
                      <Cpu size={13} />
                      {isProcessing && !isTranscribing ? t('processing', 'Processing...') : isTranscribing ? t('transcribing', 'Transcribing...') : t('processWhisper', 'Process + Whisper')}
                    </button>

                    <button
                      onClick={() => handleProcess(false)}
                      disabled={isProcessing || isTranscribing}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-[11px] transition-all border ${isProcessing
                        ? 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30 animate-pulse cursor-wait'
                        : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/40 hover:bg-zinc-700/60 hover:border-zinc-600'
                        }`}
                      title={t('onlyProcessTooltip', 'Only upload and extract semantic codes (no transcription)')}
                    >
                      <Cpu size={13} />
                      {isProcessing ? t('processing', 'Processing...') : t('onlyProcess', 'Only Process')}
                    </button>
                  </div>
                </div>
              )}

              {/* Processed indicator */}
              {isProcessed && !isRecording && recordedBlob && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-600/10 border border-emerald-500/20 rounded-xl">
                  <Check size={13} className="text-emerald-400" />
                  <span className="text-[10px] text-emerald-300 font-medium">{t('audioProcessed', 'Audio processed')}</span>
                  {extractedCodes && (
                    <span className="text-[9px] text-emerald-500 ml-auto">
                      {t('semanticCodesCount', { count: extractedCodes.split(' ').length, defaultValue: '{{count}} semantic codes' })}
                    </span>
                  )}
                </div>
              )}

              {/* Title input */}
              {recordedBlob && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 font-medium w-12">{t('titleLabel', 'Title:')}</span>
                    <input
                      type="text"
                      value={recordingTitle}
                      onChange={(e) => setRecordingTitle(e.target.value)}
                      className="flex-1 bg-zinc-800 text-[11px] text-white border border-zinc-700/40 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500/50"
                      placeholder={t('recordingTitlePlaceholder', 'Recording name...')}
                    />
                  </div>

                  {/* Mode selector */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-500 font-medium">{t('useAsLabel', 'Use as:')}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setMode('reference')}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${mode === 'reference'
                          ? 'border-indigo-500 bg-indigo-600/10'
                          : 'border-zinc-700/40 bg-zinc-800/50 hover:border-zinc-600'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Music size={13} className={mode === 'reference' ? 'text-indigo-400' : 'text-zinc-500'} />
                          <span className={`text-[11px] font-bold ${mode === 'reference' ? 'text-indigo-300' : 'text-zinc-300'}`}>
                            {t('referenceAudio', 'Reference Audio')}
                          </span>
                        </div>
                        <p className="text-[9px] text-zinc-500 leading-tight">
                          {t('referenceAudioDesc', 'Model generates music inspired by your recording (melody, rhythm, tone)')}
                        </p>
                      </button>

                      <button
                        onClick={() => setMode('cover')}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${mode === 'cover'
                          ? 'border-orange-500 bg-orange-600/10'
                          : 'border-zinc-700/40 bg-zinc-800/50 hover:border-zinc-600'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Mic size={13} className={mode === 'cover' ? 'text-orange-400' : 'text-zinc-500'} />
                          <span className={`text-[11px] font-bold ${mode === 'cover' ? 'text-orange-300' : 'text-zinc-300'}`}>
                            {t('vocalCover', 'Vocal / Cover')}
                          </span>
                        </div>
                        <p className="text-[9px] text-zinc-500 leading-tight">
                          {t('vocalCoverDesc', 'Generates music that follows your voice as the main vocal guide')}
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Strength slider */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-zinc-500 font-medium w-12">{t('strengthLabel', 'Strength:')}</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={strength}
                      onChange={(e) => setStrength(parseFloat(e.target.value))}
                      className={`flex-1 h-1 ${mode === 'reference' ? 'accent-indigo-500' : 'accent-orange-500'}`}
                    />
                    <span className="text-[10px] text-zinc-400 font-mono w-8 text-right">
                      {Math.round(strength * 100)}%
                    </span>
                  </div>

                  <p className="text-[9px] text-zinc-600 leading-tight">
                    {mode === 'reference'
                      ? t('strengthRefDesc', {
                        strength: Math.round(strength * 100),
                        level: strength < 0.4 ? t('subtleInspiration', 'subtle inspiration') : strength < 0.7 ? t('followStructure', 'follow structure') : t('faithfullyCopy', 'faithfully copy'),
                        defaultValue: 'Strength {{strength}}%: {{level}} the recording.'
                      })
                      : t('strengthVocalDesc', {
                        strength: Math.round(strength * 100),
                        level: strength < 0.4 ? t('vagueVocal', 'vague vocal') : strength < 0.7 ? t('followVoice', 'follow your voice') : t('replicateVoice', 'replicate your voice closely'),
                        defaultValue: 'Strength {{strength}}%: {{level}}.'
                      })
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — Apply + status */}
        <div className="border-t border-zinc-700/30 px-5 py-3 bg-zinc-900/90 flex-shrink-0">
          <div className="flex items-center gap-3">
            {applyStatus && (
              <span className={`text-[10px] font-medium animate-in fade-in duration-200 ${applyStatus.startsWith('✅') ? 'text-green-400' :
                applyStatus.startsWith('❌') ? 'text-red-400' :
                  'text-zinc-400'
                }`}>
                {isApplying && !applyStatus.startsWith('✅') && !applyStatus.startsWith('❌') && (
                  <span className="inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />
                )}
                {applyStatus}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={handleApply}
              disabled={!recordedBlob || isApplying || isRecording || isProcessing}
              className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium rounded-lg transition-all ${recordedBlob && !isApplying && !isProcessing
                ? mode === 'reference'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white'
                  : 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
            >
              <Upload size={12} />
              {isApplying
                ? t('applying', 'Applying...')
                : mode === 'reference'
                  ? t('useAsReference', 'Use as Reference')
                  : t('useAsVocal', 'Use as Vocal')
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
