import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Shuffle, Repeat, Repeat1, Download, Heart, ChevronUp, ChevronDown,
  Music, Cpu, MessageSquare, Mic, Clock, Disc3,
} from 'lucide-react';
import type { Song } from '../../types';

interface PlayerBarProps {
  song: Song | null;
  songs: Song[];
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onSongEnd: () => void;
  isLiked?: boolean;
  onToggleLike?: () => void;
  onClickTitle?: () => void;
  onAddToPlaylist?: () => void;
}

export default memo(function PlayerBar({
  song, songs, isPlaying, onPlayPause, onNext, onPrevious,
  audioRef, onSongEnd, isLiked, onToggleLike, onClickTitle, onAddToPlaylist,
}: PlayerBarProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('ace_volume');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('none');
  const [expanded, setExpanded] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const seekingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // rAF-based playback progress loop (smooth 60fps)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let running = false;

    const tick = () => {
      if (audio.duration && isFinite(audio.duration) && !seekingRef.current) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
      if (running) animRef.current = requestAnimationFrame(tick);
    };

    const onPlay = () => { running = true; animRef.current = requestAnimationFrame(tick); };
    const onPause = () => { running = false; cancelAnimationFrame(animRef.current); tick(); };
    const onEnded = () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        onSongEnd();
      }
    };
    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onTimeUpdate = () => {
      if (!running && audio.duration && isFinite(audio.duration) && !seekingRef.current) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    if (!audio.paused) onPlay();

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [audioRef, onSongEnd, repeatMode]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem('ace_volume', String(volume));
  }, [volume, isMuted, audioRef]);

  // Drag-to-seek on progress bar
  const handleSeekMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !audio.duration) return;
    e.preventDefault();
    e.stopPropagation();
    seekingRef.current = true;

    const updateSeek = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
      setProgress(pct * 100);
      setCurrentTime(pct * audio.duration);
    };

    updateSeek(e.clientX);

    const onMove = (ev: MouseEvent) => updateSeek(ev.clientX);
    const onUp = () => {
      seekingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [audioRef]);

  const handleDownload = useCallback(() => {
    if (!song?.audioUrl) return;
    const a = document.createElement('a');
    a.href = song.audioUrl;
    a.download = `${song.title || 'song'}.mp3`;
    a.click();
  }, [song]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode(p => p === 'none' ? 'all' : p === 'all' ? 'one' : 'none');
  }, []);

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  if (!song) {
    return (
      <div className="h-16 flex items-center justify-center">
        <span className="text-sm text-surface-500">{t('player.noSong')}</span>
      </div>
    );
  }

  const gp = song.generationParams;

  return (
    <div className="relative z-30">
      {/* ── Expanded detail panel (slides up behind the bar) ── */}
      <div
        className="absolute bottom-full left-0 right-0 transition-all duration-500 ease-out origin-bottom"
        style={{
          maxHeight: expanded ? '60vh' : '0px',
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? 'auto' : 'none',
          transform: expanded ? 'translateY(0)' : 'translateY(16px)',
        }}
      >
        <div
          className="mx-4 rounded-t-2xl border border-b-0 border-surface-200/30 overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, var(--color-surface-50) 0%, var(--color-surface-100) 100%)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
          }}
        >
          {/* Header row: Cover + Title + Actions */}
          <div className="flex items-start gap-4 p-5 pb-3">
            {/* Large cover */}
            <div className="w-20 h-20 rounded-xl bg-surface-200 flex-shrink-0 overflow-hidden shadow-lg">
              {song.coverUrl ? (
                <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-accent-500/30 to-brand-500/30" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-surface-900 truncate">{song.title || 'Untitled'}</h2>
              <p className="text-sm text-surface-500 truncate mt-0.5">{song.creator || song.style || ''}</p>
              {gp?.songDescription && (
                <p className="text-xs text-surface-400 mt-1.5 line-clamp-2">{gp.songDescription}</p>
              )}
            </div>
            {/* Top-right icons (overlaid) */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {onToggleLike && (
                <button onClick={onToggleLike} className="p-2 rounded-lg hover:bg-surface-200/50 transition-colors">
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-surface-400 hover:text-pink-400'}`} />
                </button>
              )}
              <button onClick={handleDownload} className="p-2 rounded-lg hover:bg-surface-200/50 transition-colors" title={t('player.download')}>
                <Download className="w-5 h-5 text-surface-400 hover:text-surface-700" />
              </button>
              <button
                onClick={() => setExpanded(false)}
                className="p-2 rounded-lg hover:bg-surface-200/50 transition-colors"
              >
                <ChevronDown className="w-5 h-5 text-surface-400" />
              </button>
            </div>
          </div>

          {/* Two-column content */}
          <div className="flex gap-4 px-5 pb-4 max-h-[calc(60vh-140px)] overflow-y-auto">
            {/* Left: Lyrics */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-accent-400" />
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{t('create.lyrics', 'Lyrics')}</span>
              </div>
              <div className="text-sm text-surface-700 font-mono leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin">
                {song.lyrics || gp?.lyrics || <span className="text-surface-400 italic">{t('player.noLyrics', 'Instrumental')}</span>}
              </div>
            </div>

            {/* Right: Model & Generation info */}
            <div className="w-[260px] flex-shrink-0 space-y-3">
              {/* Prompt */}
              {(gp?.prompt || song.prompt) && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Music className="w-4 h-4 text-brand-400" />
                    <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Prompt</span>
                  </div>
                  <p className="text-xs text-surface-600 leading-relaxed line-clamp-4">{gp?.prompt || song.prompt}</p>
                </div>
              )}

              {/* Style */}
              {(gp?.style || song.style) && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Disc3 className="w-4 h-4 text-accent-400" />
                    <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{t('create.style', 'Style')}</span>
                  </div>
                  <p className="text-xs text-surface-600">{gp?.style || song.style}</p>
                </div>
              )}

              {/* Active models */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Cpu className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{t('create.models', 'Models')}</span>
                </div>
                <div className="space-y-1">
                  {(gp?.ditModel || song.ditModel) && (
                    <InfoPill label="DIT" value={gp?.ditModel || song.ditModel || ''} />
                  )}
                  {gp?.lmBackend && (
                    <InfoPill label="LLM" value={`${(gp.lmBackend || '').toUpperCase()}${gp.lmModel ? ` · ${gp.lmModel}` : ''}`} />
                  )}
                  {gp?.inferMethod && (
                    <InfoPill label="Method" value={gp.inferMethod.toUpperCase()} />
                  )}
                </div>
              </div>

              {/* Generation params grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {gp?.singer && <ParamItem icon={<Mic className="w-3 h-3" />} label="Singer" value={gp.singer} />}
                {gp?.duration != null && <ParamItem icon={<Clock className="w-3 h-3" />} label="Duration" value={`${gp.duration}s`} />}
                {gp?.bpm != null && gp.bpm > 0 && <ParamItem label="BPM" value={String(gp.bpm)} />}
                {gp?.keyScale && <ParamItem label="Key" value={gp.keyScale} />}
                {gp?.timeSignature && <ParamItem label="Time" value={gp.timeSignature} />}
                {gp?.seed != null && <ParamItem label="Seed" value={String(gp.seed)} />}
                {gp?.guidanceScale != null && <ParamItem label="CFG" value={String(gp.guidanceScale)} />}
                {gp?.inferenceSteps != null && <ParamItem label="Steps" value={String(gp.inferenceSteps)} />}
                {gp?.audioFormat && <ParamItem label="Format" value={gp.audioFormat.toUpperCase()} />}
                {gp?.shift != null && gp.shift > 0 && <ParamItem label="Shift" value={String(gp.shift)} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Compact PlayerBar ── */}
      <div className="px-4 pb-3 pt-1">
        <div
          className="relative mx-auto rounded-2xl border border-surface-200/30 transition-all duration-300 ease-out"
          style={{
            background: 'linear-gradient(180deg, var(--color-surface-100) 0%, var(--color-surface-50) 100%)',
            boxShadow: '0 -4px 30px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.05) inset',
          }}
        >
          {/* Glow trail at top edge */}
          <div
            className="absolute top-0 left-4 right-4 h-[2px] rounded-full"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--color-accent-500), var(--color-brand-400))',
              boxShadow: '0 0 8px var(--color-accent-500), 0 0 20px var(--color-brand-500)',
            }}
          />

          {/* Progress bar + time (always visible, thin) */}
          <div className="px-5 pt-2.5 pb-0">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-surface-500 tabular-nums w-9 text-right select-none">{fmt(currentTime)}</span>
              <div
                ref={progressRef}
                className="flex-1 h-[4px] bg-surface-200/40 rounded-full cursor-pointer relative group"
                onMouseDown={handleSeekMouseDown}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--color-accent-500), var(--color-brand-400))',
                  }}
                />
                <div
                  className="absolute top-1/2 w-3 h-3 rounded-full bg-white shadow-lg shadow-accent-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
                />
              </div>
              <span className="text-[10px] text-surface-500 tabular-nums w-9 select-none">{fmt(duration)}</span>
            </div>
          </div>

          {/* Main compact row */}
          <div className="flex items-center h-[56px] px-4 gap-3">
            {/* Album art + info */}
            <div
              className="flex items-center gap-3 min-w-0 flex-shrink-0 cursor-pointer select-none"
              onClick={() => setExpanded(e => !e)}
            >
              <div className="relative w-10 h-10 rounded-xl bg-surface-200 flex-shrink-0 overflow-hidden shadow-md group">
                {song.coverUrl ? (
                  <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-accent-500/30 to-brand-500/30" />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronUp className={`w-4 h-4 text-white transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
              <div className="min-w-0 max-w-[180px]">
                <p
                  className={`text-sm font-semibold text-surface-900 truncate ${onClickTitle ? 'hover:text-accent-400 transition-colors' : ''}`}
                  onClick={e => { if (onClickTitle) { e.stopPropagation(); onClickTitle(); } }}
                >
                  {song.title || 'Untitled'}
                </p>
                <p className="text-xs text-surface-500 truncate">{song.creator || song.style || ''}</p>
              </div>
            </div>

            {/* Center controls */}
            <div className="flex items-center justify-center flex-1 gap-4">
              <button
                onClick={() => setShuffle(p => !p)}
                className={`p-1 transition-colors ${shuffle ? 'text-accent-400' : 'text-surface-400 hover:text-surface-700'}`}
              >
                <Shuffle className="w-[18px] h-[18px]" />
              </button>
              <button onClick={onPrevious} className="p-1 text-surface-400 hover:text-surface-800 transition-colors">
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={onPlayPause}
                className="w-10 h-10 rounded-full border border-surface-300/50 bg-transparent hover:bg-surface-200/50 flex items-center justify-center transition-all active:scale-95"
              >
                {isPlaying ?
                  <Pause className="w-5 h-5 text-surface-900" /> :
                  <Play className="w-5 h-5 text-surface-900 ml-0.5" />
                }
              </button>
              <button onClick={onNext} className="p-1 text-surface-400 hover:text-surface-800 transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`p-1 transition-colors ${repeatMode !== 'none' ? 'text-accent-400' : 'text-surface-400 hover:text-surface-700'}`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-[18px] h-[18px]" /> : <Repeat className="w-[18px] h-[18px]" />}
              </button>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Inline volume slider */}
              <VolumeIcon
                className="w-4 h-4 text-surface-400 hover:text-surface-700 cursor-pointer flex-shrink-0 transition-colors"
                onClick={() => setIsMuted(m => !m)}
              />
              <input
                type="range"
                min="0" max="1" step="0.01"
                value={isMuted ? 0 : volume}
                onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                className="w-16 h-1 accent-accent-500 flex-shrink-0"
              />

              {onToggleLike && (
                <button onClick={onToggleLike} className="p-1.5 transition-colors">
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-surface-400 hover:text-pink-400'}`} />
                </button>
              )}

              <button
                onClick={handleDownload}
                className="p-1.5 text-surface-400 hover:text-surface-700 transition-colors"
                title={t('player.download')}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
})

/* ── helper sub-components ── */

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="px-1.5 py-0.5 rounded bg-surface-200/60 text-surface-500 font-mono text-[10px] uppercase">{label}</span>
      <span className="text-surface-700 truncate">{value}</span>
    </div>
  );
}

function ParamItem({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-surface-500">
      {icon}
      <span className="truncate">{label}: <span className="text-surface-700 font-medium">{value}</span></span>
    </div>
  );
}

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
