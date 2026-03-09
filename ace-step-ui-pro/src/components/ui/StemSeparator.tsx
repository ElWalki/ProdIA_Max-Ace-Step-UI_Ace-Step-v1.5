import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Scissors, Download, Loader2, Music, Mic2, Drum, Guitar, Piano, Play, Pause, Volume2, VolumeX, DownloadCloud, RotateCcw } from 'lucide-react';
import type { Song } from '../../types';
import { generateApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface StemSeparatorProps {
  song: Song | null;
  onClose: () => void;
}

interface StemResult {
  name: string;
  url: string;
}

interface StemPlayerState {
  muted: boolean;
  solo: boolean;
  volume: number;
}

const MODELS = [
  { value: 'htdemucs_ft', label: 'HTDemucs Fine-Tuned', desc: 'Mejor calidad · 4 stems', stems: 4 },
  { value: 'htdemucs', label: 'HTDemucs', desc: 'Rápido · 4 stems', stems: 4 },
  { value: 'htdemucs_6s', label: 'HTDemucs 6-Stem', desc: 'Guitarra + Piano separados · 6 stems', stems: 6 },
];

const QUALITIES = [
  { value: 'rapida', label: 'Rápida', desc: 'Procesado ligero — más rápido' },
  { value: 'alta', label: 'Alta', desc: 'Buen balance calidad/velocidad' },
  { value: 'maxima', label: 'Máxima', desc: 'Menos residuos — más lento' },
];

const STEM_ICONS_MAP: Record<string, React.FC<{ className?: string }>> = {
  vocals: Mic2,
  drums: Drum,
  bass: Guitar,
  other: Music,
  guitar: Guitar,
  piano: Piano,
  instrumental: Music,
};

const STEM_COLORS: Record<string, { text: string; bg: string; border: string; bar: string }> = {
  vocals:       { text: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    bar: 'bg-pink-500' },
  drums:        { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  bar: 'bg-orange-500' },
  bass:         { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bar: 'bg-emerald-500' },
  other:        { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    bar: 'bg-blue-500' },
  guitar:       { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   bar: 'bg-amber-500' },
  piano:        { text: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  bar: 'bg-violet-500' },
  instrumental: { text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    bar: 'bg-cyan-500' },
};

const DEFAULT_COLOR = STEM_COLORS.other;

function parseStemsFromResponse(allStems: any): StemResult[] {
  if (Array.isArray(allStems)) {
    return allStems.map((s: any) => ({
      name: s.name || s.stem || 'unknown',
      url: s.url || s.path || '',
    }));
  }
  if (allStems && typeof allStems === 'object') {
    return Object.entries(allStems).map(([name, data]: [string, any]) => ({
      name,
      url: data.url || data.path || '',
    }));
  }
  return [];
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function StemSeparator({ song, onClose }: StemSeparatorProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [model, setModel] = useState('htdemucs_ft');
  const [quality, setQuality] = useState('alta');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stems, setStems] = useState<StemResult[]>([]);
  const [error, setError] = useState('');

  // Multi-track player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerStates, setPlayerStates] = useState<Record<string, StemPlayerState>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const seekBarRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // Initialize player states when stems arrive
  useEffect(() => {
    if (stems.length > 0) {
      const initial: Record<string, StemPlayerState> = {};
      stems.forEach(s => { initial[s.name] = { muted: false, solo: false, volume: 1 }; });
      setPlayerStates(initial);
    }
    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, [stems]);

  // Sync mute/solo/volume to audio elements
  useEffect(() => {
    const hasSolo = Object.values(playerStates).some(s => s.solo);
    for (const stem of stems) {
      const audio = audioRefs.current[stem.name];
      if (!audio) continue;
      const state = playerStates[stem.name];
      if (!state) continue;
      if (hasSolo) {
        audio.muted = !state.solo;
      } else {
        audio.muted = state.muted;
      }
      audio.volume = state.volume;
    }
  }, [playerStates, stems]);

  const updateTime = useCallback(() => {
    const first = Object.values(audioRefs.current)[0];
    if (first) {
      setCurrentTime(first.currentTime);
      if (first.duration && isFinite(first.duration)) setDuration(first.duration);
    }
    animFrameRef.current = requestAnimationFrame(updateTime);
  }, []);

  const handlePlayPause = useCallback(() => {
    const audios = Object.values(audioRefs.current);
    if (audios.length === 0) return;
    if (isPlaying) {
      audios.forEach(a => a.pause());
      cancelAnimationFrame(animFrameRef.current);
      setIsPlaying(false);
    } else {
      // Sync all to the same time before playing
      const time = audios[0]?.currentTime || 0;
      audios.forEach(a => { a.currentTime = time; a.play(); });
      animFrameRef.current = requestAnimationFrame(updateTime);
      setIsPlaying(true);
    }
  }, [isPlaying, updateTime]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    Object.values(audioRefs.current).forEach(a => { a.currentTime = newTime; });
    setCurrentTime(newTime);
  }, [duration]);

  const toggleMute = useCallback((name: string) => {
    setPlayerStates(prev => ({ ...prev, [name]: { ...prev[name], muted: !prev[name].muted, solo: false } }));
  }, []);

  const toggleSolo = useCallback((name: string) => {
    setPlayerStates(prev => {
      const wasSolo = prev[name].solo;
      const next = { ...prev };
      // Turn off all solos, then toggle this one
      for (const k of Object.keys(next)) { next[k] = { ...next[k], solo: false }; }
      if (!wasSolo) next[name] = { ...next[name], solo: true, muted: false };
      return next;
    });
  }, []);

  const setVolume = useCallback((name: string, volume: number) => {
    setPlayerStates(prev => ({ ...prev, [name]: { ...prev[name], volume } }));
  }, []);

  const handleSeparate = useCallback(async () => {
    if (!song?.audioUrl || !token) return;
    setProcessing(true);
    setProgress(10);
    setError('');
    setStems([]);
    setIsPlaying(false);
    // Clean up previous audio elements
    Object.values(audioRefs.current).forEach(a => { a.pause(); a.src = ''; });
    audioRefs.current = {};

    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 5, 90));
    }, 2000);

    try {
      const modelInfo = MODELS.find(m => m.value === model);
      const stemCount = modelInfo?.stems ?? 4;
      const res = await generateApi.separateStems({
        audioUrl: song.audioUrl,
        model,
        quality,
        stems: stemCount,
      }, token);

      clearInterval(progressInterval);
      setProgress(100);

      if (res.success && res.allStems) {
        const parsed = parseStemsFromResponse(res.allStems);
        setStems(parsed);
      }
    } catch (e: any) {
      clearInterval(progressInterval);
      setError(e.message || t('common.error'));
    } finally {
      setProcessing(false);
    }
  }, [song, token, model, t]);

  const handleDownloadStem = useCallback((stem: StemResult) => {
    const a = document.createElement('a');
    a.href = stem.url;
    a.download = `${song?.title || 'song'}_${stem.name}.wav`;
    a.click();
  }, [song]);

  const handleDownloadAll = useCallback(() => {
    stems.forEach((stem, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = stem.url;
        a.download = `${song?.title || 'song'}_${stem.name}.wav`;
        a.click();
      }, i * 300);
    });
  }, [stems, song]);

  const handleNewSeparation = useCallback(() => {
    Object.values(audioRefs.current).forEach(a => { a.pause(); a.src = ''; });
    audioRefs.current = {};
    cancelAnimationFrame(animFrameRef.current);
    setStems([]);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError('');
  }, []);

  // When an audio ends, stop playback
  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  if (!song) return null;

  const hasSolo = Object.values(playerStates).some(s => s.solo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-surface-50 border border-surface-300 rounded-2xl ${stems.length > 0 ? 'w-[560px]' : 'w-[440px]'} max-h-[85vh] flex flex-col animate-scale-in shadow-2xl`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
            <Scissors className="w-4 h-4 text-accent-400" />
            {t('stems.title', 'Stem Separation')}
          </h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Song info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-100 border border-surface-200">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-500/20 to-brand-500/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-surface-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 truncate">{song.title || 'Untitled'}</p>
              <p className="text-xs text-surface-500">{song.duration || '—'}</p>
            </div>
          </div>

          {/* Model & Quality selectors — hide after separation */}
          {stems.length === 0 && (
            <div className="space-y-3">
              {/* Model */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-surface-600">{t('stems.model', 'Separation Model')}</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  disabled={processing}
                  className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900
                    focus:outline-none focus:border-accent-500 transition-colors disabled:opacity-50"
                >
                  {MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                  ))}
                </select>
              </div>
              {/* Quality */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-surface-600">{t('stems.quality', 'Processing Quality')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {QUALITIES.map(q => (
                    <button
                      key={q.value}
                      onClick={() => setQuality(q.value)}
                      disabled={processing}
                      className={`flex flex-col items-center px-2 py-2 rounded-lg border text-xs transition-all disabled:opacity-50
                        ${quality === q.value
                          ? 'border-accent-500 bg-accent-500/10 text-accent-400 font-semibold'
                          : 'border-surface-300 bg-surface-100 text-surface-500 hover:border-surface-400'}`}
                    >
                      <span>{q.label}</span>
                      <span className="text-[10px] opacity-70 mt-0.5">{q.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Separate button */}
          {stems.length === 0 && (
            <button
              onClick={handleSeparate}
              disabled={processing || !song.audioUrl}
              className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2
                bg-gradient-to-r from-accent-600 to-brand-600 text-white hover:from-accent-500 hover:to-brand-500
                shadow-lg shadow-accent-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('stems.processing', 'Separating...')} {progress}%
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4" />
                  {t('stems.separate', 'Separate Stems')}
                </>
              )}
            </button>
          )}

          {/* Progress bar */}
          {processing && (
            <div className="w-full h-1.5 rounded-full bg-surface-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-500 to-brand-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{error}</p>
          )}

          {/* ===== Multi-track Stem Player ===== */}
          {stems.length > 0 && (
            <div className="space-y-3">
              {/* Transport bar */}
              <div className="flex items-center gap-3 p-2 rounded-xl bg-surface-100 border border-surface-200">
                <button
                  onClick={handlePlayPause}
                  className="w-9 h-9 rounded-lg bg-gradient-to-r from-accent-600 to-brand-600 text-white
                    flex items-center justify-center hover:from-accent-500 hover:to-brand-500 transition-all shadow-md"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <span className="text-xs font-mono text-surface-500 w-10 text-right">{formatTime(currentTime)}</span>
                <div
                  ref={seekBarRef}
                  onClick={handleSeek}
                  className="flex-1 h-2 rounded-full bg-surface-300 cursor-pointer relative group"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent-500 to-brand-500 transition-[width] duration-100"
                    style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md
                      opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0' }}
                  />
                </div>
                <span className="text-xs font-mono text-surface-500 w-10">{formatTime(duration)}</span>
              </div>

              {/* Stem tracks */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                    {t('stems.results', 'Separated Stems')} ({stems.length})
                  </span>
                  <span className="text-[10px] text-surface-400">
                    {t('stems.clickSolo', 'Click name = Solo')}
                  </span>
                </div>
                {stems.map(stem => {
                  const colors = STEM_COLORS[stem.name] || DEFAULT_COLOR;
                  const Icon = STEM_ICONS_MAP[stem.name] || Music;
                  const state = playerStates[stem.name];
                  const isMuted = state ? (hasSolo ? !state.solo : state.muted) : false;

                  return (
                    <div
                      key={stem.name}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all
                        ${isMuted ? 'opacity-40 border-surface-300 bg-surface-100' : `${colors.bg} ${colors.border}`}`}
                    >
                      {/* Icon */}
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors.bg} ${colors.text}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>

                      {/* Name (click = solo) */}
                      <button
                        onClick={() => toggleSolo(stem.name)}
                        className={`text-sm font-medium capitalize min-w-[80px] text-left transition-colors
                          ${state?.solo ? 'text-yellow-400' : colors.text}
                          hover:underline`}
                        title={state?.solo ? t('stems.unsolo', 'Unsolo') : t('stems.solo', 'Solo')}
                      >
                        {stem.name}
                        {state?.solo && <span className="ml-1 text-[9px] font-bold uppercase">S</span>}
                      </button>

                      {/* Volume slider */}
                      <input
                        type="range"
                        min="0" max="1" step="0.01"
                        value={state?.volume ?? 1}
                        onChange={e => setVolume(stem.name, parseFloat(e.target.value))}
                        className="flex-1 h-1 appearance-none bg-surface-300 rounded-full cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                      />

                      {/* Mute toggle */}
                      <button
                        onClick={() => toggleMute(stem.name)}
                        className={`p-1.5 rounded-lg transition-colors ${state?.muted ? 'text-red-400 bg-red-500/10' : 'text-surface-400 hover:text-surface-600 hover:bg-surface-200'}`}
                        title={state?.muted ? t('stems.unmute', 'Unmute') : t('stems.mute', 'Mute')}
                      >
                        {state?.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>

                      {/* Download individual */}
                      <button
                        onClick={() => handleDownloadStem(stem)}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-200 transition-colors"
                        title={t('common.download', 'Download')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {/* Hidden audio element */}
                      <audio
                        ref={el => { if (el) audioRefs.current[stem.name] = el; }}
                        src={stem.url}
                        preload="auto"
                        onEnded={handleAudioEnded}
                        onLoadedMetadata={e => {
                          const d = (e.target as HTMLAudioElement).duration;
                          if (d && isFinite(d) && d > duration) setDuration(d);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Bottom actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadAll}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5
                    bg-gradient-to-r from-accent-600 to-brand-600 text-white hover:from-accent-500 hover:to-brand-500
                    shadow-lg shadow-accent-500/25 transition-all"
                >
                  <DownloadCloud className="w-3.5 h-3.5" />
                  {t('stems.downloadAll', 'Download All Stems')}
                </button>
                <button
                  onClick={handleNewSeparation}
                  className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5
                    bg-surface-200 text-surface-600 hover:bg-surface-300 transition-colors"
                  title={t('stems.reseparate', 'New separation')}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
