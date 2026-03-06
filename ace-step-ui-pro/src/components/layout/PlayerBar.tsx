import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, Download, Heart,
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
}

export default memo(function PlayerBar({
  song, songs, isPlaying, onPlayPause, onNext, onPrevious,
  audioRef, onSongEnd, isLiked, onToggleLike,
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
  const progressRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const now = performance.now();
      if (now - lastUpdateRef.current < 250) return;
      lastUpdateRef.current = now;
      if (audio.duration && isFinite(audio.duration)) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        onSongEnd();
      }
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioRef, onSongEnd, repeatMode]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem('ace_volume', String(volume));
  }, [volume, isMuted, audioRef]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
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
      <div className="h-[72px] border-t border-surface-200/60 glass flex items-center justify-center">
        <span className="text-sm text-surface-500">{t('player.noSong')}</span>
      </div>
    );
  }

  return (
    <div className="h-[72px] border-t border-surface-200/60 glass flex flex-col">
      {/* Progress bar */}
      <div
        ref={progressRef}
        className="h-1 bg-surface-200 cursor-pointer group relative"
        onClick={handleSeek}
      >
        <div
          className="h-full bg-gradient-to-r from-accent-500 to-brand-500"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent-400 shadow-lg shadow-accent-500/50 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%`, transform: `translateX(-50%) translateY(-50%)` }}
        />
      </div>

      <div className="flex items-center flex-1 px-4 gap-4">
        {/* Song info */}
        <div className="flex items-center gap-3 w-1/4 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-surface-200 flex-shrink-0 overflow-hidden">
            {song.coverUrl ? (
              <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent-500/20 to-brand-500/20" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-surface-900 truncate">{song.title || 'Untitled'}</p>
            <p className="text-xs text-surface-500 truncate">{song.style || song.creator || ''}</p>
          </div>
          {onToggleLike && (
            <button onClick={onToggleLike} className="ml-1 flex-shrink-0">
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : 'text-surface-400 hover:text-surface-600'}`} />
            </button>
          )}
        </div>

        {/* Center controls */}
        <div className="flex flex-col items-center flex-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShuffle(p => !p)}
              className={`p-1 rounded ${shuffle ? 'text-accent-400' : 'text-surface-400 hover:text-surface-700'}`}
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button onClick={onPrevious} className="p-1 text-surface-500 hover:text-surface-900 transition-colors">
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={onPlayPause}
              className="w-9 h-9 rounded-full bg-surface-950 text-surface-0 flex items-center justify-center hover:scale-105 transition-transform shadow-md"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button onClick={onNext} className="p-1 text-surface-500 hover:text-surface-900 transition-colors">
              <SkipForward className="w-5 h-5" />
            </button>
            <button
              onClick={cycleRepeat}
              className={`p-1 rounded ${repeatMode !== 'none' ? 'text-accent-400' : 'text-surface-400 hover:text-surface-700'}`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-surface-500 mt-0.5">
            <span className="w-10 text-right tabular-nums">{fmt(currentTime)}</span>
            <span>/</span>
            <span className="w-10 tabular-nums">{fmt(duration)}</span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 w-1/4 justify-end">
          <button
            onClick={() => setIsMuted(p => !p)}
            className="p-1 text-surface-400 hover:text-surface-700 transition-colors"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
            className="w-20 h-1"
          />
          <button onClick={handleDownload} className="p-1 text-surface-400 hover:text-surface-700 transition-colors" title={t('player.download')}>
            <Download className="w-4 h-4" />
          </button>
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
