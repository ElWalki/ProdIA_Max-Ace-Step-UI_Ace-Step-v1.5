import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square, Play, Pause, RotateCcw, Check, X, FileText, PenLine } from 'lucide-react';

interface MicRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (blob: Blob, filename: string) => void;
  targetSection?: 'reference' | 'cover' | 'vocal';
  lyrics?: string;
  onLyricsChange?: (lyrics: string) => void;
}

export default function MicRecorder({ isOpen, onClose, onAccept, targetSection = 'vocal', lyrics = '', onLyricsChange }: MicRecorderProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [duration, setDuration] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [showLyrics, setShowLyrics] = useState(!!lyrics);
  const [localLyrics, setLocalLyrics] = useState(lyrics);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      setState('idle');
      setDuration(0);
      blobRef.current = null;
    } else {
      setLocalLyrics(lyrics);
      setShowLyrics(!!lyrics);
    }
  }, [isOpen, lyrics]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current!);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      ctx.fillStyle = 'rgba(10,10,12,0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6366f1';
      ctx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: 'audio/webm' });
        setState('recorded');
        cancelAnimationFrame(animFrameRef.current!);
        streamRef.current?.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 0.1), 100);
      drawWaveform();
    } catch {
      // Mic permission denied — do nothing
    }
  }, [drawWaveform]);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const togglePlayback = useCallback(() => {
    if (!blobRef.current) return;
    if (isPlayingBack) {
      audioRef.current?.pause();
      setIsPlayingBack(false);
      return;
    }
    const url = URL.createObjectURL(blobRef.current);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { setIsPlayingBack(false); setPlaybackTime(0); };
    audio.ontimeupdate = () => setPlaybackTime(audio.currentTime);
    audio.play();
    setIsPlayingBack(true);
  }, [isPlayingBack]);

  const handleAccept = useCallback(() => {
    if (!blobRef.current) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${targetSection}-${timestamp}.webm`;
    onAccept(blobRef.current, filename);
    onClose();
  }, [onAccept, onClose, targetSection]);

  const handleRetry = useCallback(() => {
    audioRef.current?.pause();
    setIsPlayingBack(false);
    blobRef.current = null;
    setState('idle');
    setDuration(0);
    setPlaybackTime(0);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-surface-50 border border-surface-300 rounded-2xl ${showLyrics ? 'w-[680px]' : 'w-96'} p-6 animate-scale-in flex gap-4`}>
        {/* Recorder side */}
        <div className={`${showLyrics ? 'w-1/2' : 'w-full'} space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
              <Mic className="w-4 h-4 text-accent-400" />
              {t('mic.title', 'Record Audio')}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowLyrics(!showLyrics)}
                className={`p-1.5 rounded-md transition-colors ${showLyrics ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-700'}`}
                title={t('mic.toggleLyrics', 'Toggle Lyrics Panel')}
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              <button onClick={onClose} className="text-surface-400 hover:text-surface-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

        <div className="text-[10px] text-surface-500 text-center uppercase tracking-wider">
          {t(`audio.${targetSection}Label`, targetSection)}
        </div>

        {/* Waveform */}
        <canvas
          ref={canvasRef}
          width={340}
          height={80}
          className="w-full h-20 rounded-lg bg-surface-0 border border-surface-200"
        />

        {/* Timer */}
        <div className="text-center text-2xl font-mono text-surface-800 tabular-nums">
          {state === 'recorded' && isPlayingBack ? formatTime(playbackTime) : formatTime(duration)}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          {state === 'idle' && (
            <button
              onClick={startRecording}
              className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center
                hover:bg-red-400 transition-colors shadow-lg shadow-red-500/30"
            >
              <Mic className="w-6 h-6" />
            </button>
          )}

          {state === 'recording' && (
            <button
              onClick={stopRecording}
              className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center
                hover:bg-red-400 transition-colors shadow-lg shadow-red-500/30 animate-pulse"
            >
              <Square className="w-5 h-5" />
            </button>
          )}

          {state === 'recorded' && (
            <>
              <button
                onClick={handleRetry}
                className="w-10 h-10 rounded-full bg-surface-100 text-surface-500 flex items-center justify-center
                  hover:bg-surface-200 transition-colors border border-surface-300"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlayback}
                className="w-12 h-12 rounded-full bg-accent-500/10 text-accent-400 flex items-center justify-center
                  hover:bg-accent-500/20 transition-colors border border-accent-500/30"
              >
                {isPlayingBack ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                onClick={handleAccept}
                className="w-10 h-10 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center
                  hover:bg-green-500/20 transition-colors border border-green-500/30"
              >
                <Check className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        </div>

        {/* Lyrics side panel */}
        {showLyrics && (
          <div className="w-1/2 flex flex-col space-y-2 border-l border-surface-200 pl-4">
            <div className="flex items-center gap-1.5">
              <PenLine className="w-3.5 h-3.5 text-surface-500" />
              <span className="text-xs font-semibold text-surface-600">{t('mic.lyricsPanel', 'Lyrics / Notes')}</span>
            </div>
            <textarea
              value={localLyrics}
              onChange={e => {
                setLocalLyrics(e.target.value);
                onLyricsChange?.(e.target.value);
              }}
              placeholder={t('mic.lyricsPlaceholder', 'Write or paste lyrics here to follow while recording...')}
              className="flex-1 w-full bg-surface-100 border border-surface-200 rounded-lg px-3 py-2 text-xs text-surface-800
                placeholder:text-surface-400 font-mono leading-relaxed resize-none focus:ring-1 focus:ring-accent-500 focus:outline-none"
              style={{ minHeight: '260px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
