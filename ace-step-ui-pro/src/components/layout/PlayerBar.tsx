import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, Download, Heart, ListPlus, Share2, MessageCircle,
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
  const [showVolume, setShowVolume] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const seekingRef = useRef(false);

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

    if (!audio.paused) onPlay();

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onMeta);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onMeta);
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

  if (!song) {
    return (
      <div className="h-16 flex items-center justify-center">
        <span className="text-sm text-surface-500">{t('player.noSong')}</span>
      </div>
    );
  }

  return (
    <div className="px-4 pb-3 pt-1">
      <div
        className="relative mx-auto max-w-4xl rounded-2xl border border-surface-200/30 overflow-hidden transition-all duration-300 ease-out"
        style={{
          background: 'linear-gradient(180deg, var(--color-surface-100) 0%, var(--color-surface-50) 100%)',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.05) inset',
        }}
      >
        {/* ── Glow trail at top edge ── */}
        <div
          className="absolute top-0 left-0 h-[2px] transition-all duration-100"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--color-accent-500), var(--color-brand-400))',
            boxShadow: `0 0 8px var(--color-accent-500), 0 0 20px var(--color-brand-500)`,
          }}
        />

        {/* ── Expanded: seekable progress + time ── */}
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{ maxHeight: expanded ? '48px' : '0px', opacity: expanded ? 1 : 0 }}
        >
          <div className="px-5 pt-3 pb-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-surface-500 tabular-nums w-11 text-right select-none">{fmt(currentTime)}</span>
              <div
                ref={progressRef}
                className="flex-1 h-[6px] bg-surface-200/60 rounded-full cursor-pointer relative group"
                onMouseDown={handleSeekMouseDown}
              >
                {/* Played fill with glow */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--color-accent-500), var(--color-brand-400))',
                    boxShadow: '0 0 6px var(--color-accent-500)',
                  }}
                />
                {/* Seek thumb */}
                <div
                  className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg shadow-accent-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
                />
              </div>
              <span className="text-xs text-surface-500 tabular-nums w-11 select-none">{fmt(duration)}</span>
            </div>
          </div>
        </div>

        {/* ── Main compact row ── */}
        <div className="flex items-center h-[64px] px-4 gap-3">
          {/* Album art + info */}
          <div
            className="flex items-center gap-3 min-w-0 flex-shrink-0 cursor-pointer select-none"
            onClick={() => setExpanded(e => !e)}
          >
            <div className="w-11 h-11 rounded-xl bg-surface-200 flex-shrink-0 overflow-hidden shadow-md">
              {song.coverUrl ? (
                <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-accent-500/30 to-brand-500/30" />
              )}
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
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Volume popover */}
            <div className="relative">
              <button
                onClick={() => setShowVolume(v => !v)}
                className="p-1.5 text-surface-400 hover:text-surface-700 transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              {showVolume && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface-100 border border-surface-200/50 rounded-xl p-2 shadow-xl"
                  onMouseLeave={() => setShowVolume(false)}
                >
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                    className="w-20 h-1 accent-accent-500"
                    style={{ writingMode: 'horizontal-tb' }}
                  />
                </div>
              )}
            </div>

            {onToggleLike && (
              <button
                onClick={onToggleLike}
                className="p-1.5 transition-colors"
              >
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-surface-400 hover:text-pink-400'}`} />
              </button>
            )}

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 h-9 rounded-full border border-surface-300/40 text-surface-800 text-sm font-medium hover:bg-surface-200/50 transition-all active:scale-95"
              title={t('player.download')}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
})

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
