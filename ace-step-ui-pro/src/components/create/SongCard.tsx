import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Play, Pause, Loader2, ThumbsUp, ThumbsDown, Share2, Video, ListPlus, MoreVertical, Disc3, Copy, Check } from 'lucide-react';
import type { Song } from '../../types';
import SongContextMenu from '../ui/SongContextMenu';
import { getCoverStyle } from '../../utils/coverArt';

interface SongCardProps {
  song: Song;
  isPlaying: boolean;
  isCurrent: boolean;
  onPlay: () => void;
  onDelete?: () => void;
  onMenuAction?: (key: string) => void;
  onSelect?: () => void;
  onRename?: (newTitle: string) => void;
  onLike?: () => void;
  audioRef?: React.RefObject<HTMLAudioElement>;
  onCopySeed?: (seed: number) => void;
}

// Deterministic avatar color from string
function avatarColor(name: string) {
  const colors = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

// Deterministic waveform bars from song ID (fallback when audio not decoded yet)
function generateBars(id: string, count: number): number[] {
  const bars: number[] = [];
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    bars.push(0.15 + 0.85 * ((seed >> 16) & 0x7fff) / 0x7fff);
  }
  return bars;
}

const BAR_COUNT = 500;

/** Inline mini waveform – professional DAW-style mirrored bars, seekable via click/drag */
function MiniWaveform({ songId, isPlaying, isCurrent, audioRef }: {
  songId: string; isPlaying: boolean; isCurrent: boolean;
  audioRef?: React.RefObject<HTMLAudioElement>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bars = useMemo(() => generateBars(songId, BAR_COUNT), [songId]);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      const barW = w / bars.length;
      const midY = h / 2;
      const maxHalf = h * 0.48;

      let progress = 0;
      if (isCurrent && audioRef?.current) {
        const a = audioRef.current;
        if (a.duration && isFinite(a.duration)) progress = a.currentTime / a.duration;
      }

      const isLight = document.documentElement.classList.contains('light');
      const playedColor = isLight ? 'rgba(99,102,241,0.85)' : 'rgba(139,92,246,0.9)';
      const mutedColor = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.13)';

      // Dense mirrored columns — raw WAV style
      for (let i = 0; i < bars.length; i++) {
        const x = Math.round(i * barW);
        const nextX = Math.round((i + 1) * barW);
        const colW = Math.max(1, nextX - x);
        const halfH = Math.max(0.5, bars[i] * maxHalf);
        const pct = (i + 0.5) / bars.length;
        ctx.fillStyle = (isCurrent && progress > 0 && pct <= progress) ? playedColor : mutedColor;
        ctx.fillRect(x, midY - halfH, colW, halfH);
        ctx.fillRect(x, midY, colW, halfH);
      }

      // Playhead
      if (isCurrent && progress > 0) {
        const px = progress * w;
        ctx.fillStyle = isLight ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.55)';
        ctx.fillRect(Math.round(px) - 0.5, 0, 1, h);
      }
    };

    // Initial draw
    draw();

    // rAF loop — guarded by mutable ref so cleanup always stops it
    activeRef.current = isPlaying;
    if (isPlaying) {
      const loop = () => {
        if (!activeRef.current) return;
        draw();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    // Redraw on timeupdate when paused but current (shows seek position)
    const audio = audioRef?.current;
    const onTime = () => { if (isCurrent && !activeRef.current) draw(); };
    audio?.addEventListener('timeupdate', onTime);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      audio?.removeEventListener('timeupdate', onTime);
    };
  }, [songId, isPlaying, isCurrent, audioRef, bars]);

  // Seek on click/drag
  const handleSeekStart = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCurrent || !audioRef?.current) return;
    e.stopPropagation();
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !audio.duration) return;

    const seek = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    };
    seek(e.clientX);

    const onMove = (ev: MouseEvent) => { seek(ev.clientX); };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isCurrent, audioRef]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-8 rounded-md ${isCurrent ? 'cursor-pointer' : 'cursor-default'}`}
      onMouseDown={handleSeekStart}
    />
  );
}

export default memo(function SongCard({ song, isPlaying, isCurrent, onPlay, onDelete, onMenuAction, onSelect, onRename, onLike, audioRef, onCopySeed }: SongCardProps) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [seedCopied, setSeedCopied] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const coverStyle = useMemo(() => getCoverStyle(song.id), [song.id]);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRename) {
      setEditTitle(song.title || '');
      setIsEditing(true);
    }
  }, [onRename, song.title]);

  const commitRename = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== song.title && onRename) onRename(trimmed);
    setIsEditing(false);
  }, [editTitle, song.title, onRename]);

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: rect.right, y: rect.bottom + 4 });
  }, []);

  const handleAction = useCallback((key: string) => {
    if (key === 'play') { onPlay(); return; }
    if (key === 'delete' && onDelete) { onDelete(); return; }
    onMenuAction?.(key);
  }, [onPlay, onDelete, onMenuAction]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (song.isGenerating || !song.audioUrl) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/song-audio-url', song.audioUrl);
    e.dataTransfer.setData('text/song-title', song.title || 'Untitled');
    e.dataTransfer.setData('text/song-id', song.id);
    e.dataTransfer.effectAllowed = 'copy';
  }, [song]);

  const handleSeedClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const s = song.generationParams?.seed;
    if (s === undefined) return;
    navigator.clipboard.writeText(String(s));
    setSeedCopied(true);
    onCopySeed?.(s);
    setTimeout(() => setSeedCopied(false), 1500);
  }, [song.generationParams?.seed, onCopySeed]);

  const creatorName = song.creator || song.userId || 'User';
  const creatorInitial = creatorName.charAt(0).toUpperCase();
  const ditLabel = song.ditModel || song.generationParams?.ditModel;
  const loraName = song.generationParams?.loraName;
  const loraScale = song.generationParams?.loraScale;
  const seed = song.generationParams?.seed;
  const inferMethod = song.generationParams?.inferMethod;
  const isVllm = song.generationParams?.lmBackend === 'vllm';

  return (
    <>
      <div
        draggable={!song.isGenerating && !!song.audioUrl}
        onDragStart={handleDragStart}
        className={`group flex items-start gap-4 px-4 py-4 rounded-xl cursor-pointer transition-all ${
          isCurrent
            ? 'bg-accent-500/10 border border-accent-500/30'
            : 'hover:bg-surface-100/60 border border-transparent hover:border-surface-300/40'
        }`}
        onClick={() => onSelect?.()}
        onContextMenu={handleContextMenu}
      >
        {/* Thumbnail / play overlay — 64×64 */}
        <div
          className="relative w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (!song.isGenerating) onPlay(); }}
        >
          {song.coverUrl ? (
            <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={coverStyle}>
              {isCurrent && isPlaying ? (
                <Disc3 className="w-6 h-6 text-white/70 animate-spin" />
              ) : (
                <Music className="w-6 h-6 text-white/50" />
              )}
            </div>
          )}
          {song.isGenerating ? (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 flex items-center justify-center transition-colors">
              {isCurrent && isPlaying ? (
                <Pause className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
              ) : (
                <Play className="w-5 h-5 text-white ml-0.5 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1">

          {/* Row 1: Title + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {isEditing ? (
              <input
                ref={titleInputRef}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setIsEditing(false); }}
                className="text-sm font-bold text-surface-900 bg-surface-100 border border-accent-500/40 rounded px-1 py-0 w-full min-w-0 outline-none select-text"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="text-sm font-bold text-accent-400 hover:text-accent-300 transition-colors truncate cursor-text"
                onClick={handleTitleClick}
                title={t('create.clickToRename', 'Click to rename')}
              >
                {song.title || 'Untitled'}
              </span>
            )}
            {ditLabel && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-500/25 to-accent-500/25 text-violet-300 font-bold shrink-0 leading-none border border-violet-500/30 tracking-wide uppercase">
                {ditLabel}
              </span>
            )}
            {loraName && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-300/30 text-surface-400 font-medium shrink-0 leading-none truncate max-w-[120px]">
                LoRA: {loraName}{loraScale !== undefined && loraScale !== 1 ? ` ×${loraScale.toFixed(1)}` : ''}
              </span>
            )}
            {seed !== undefined && (
              <button
                onClick={handleSeedClick}
                className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-surface-300/20 text-surface-500 font-medium shrink-0 leading-none hover:bg-surface-300/40 hover:text-surface-700 transition-colors cursor-pointer"
                title={t('create.copySeed', 'Click to copy seed')}
              >
                {seedCopied ? <Check className="w-2.5 h-2.5 text-green-400" /> : <Copy className="w-2.5 h-2.5" />}
                seed: {seed}
              </button>
            )}
            {inferMethod && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 font-medium shrink-0 leading-none uppercase">
                {inferMethod}
              </span>
            )}
            {isVllm && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium shrink-0 leading-none">
                vLLM
              </span>
            )}
          </div>

          {/* Row 2: Creator */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onMenuAction?.('openProfile'); }}
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 hover:ring-2 hover:ring-accent-500/50 transition-all cursor-pointer"
              style={{ backgroundColor: avatarColor(creatorName) }}
            >
              {creatorInitial}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMenuAction?.('openProfile'); }}
              className="text-xs text-surface-500 hover:text-accent-400 transition-colors cursor-pointer"
            >
              {creatorName}
            </button>
          </div>

          {/* Row 3: Style tags */}
          {song.style && (
            <p className="text-xs text-surface-500 leading-snug line-clamp-1">{song.style}</p>
          )}

          {/* Row 4: Waveform */}
          {!song.isGenerating && song.audioUrl && (
            <MiniWaveform
              songId={song.id}
              isPlaying={isPlaying}
              isCurrent={isCurrent}
              audioRef={audioRef}
            />
          )}

          {song.isGenerating && (
            <p className="text-xs text-accent-400">
              {song.stage || t('create.generatingSong', 'Generating...')}
              {song.progress !== undefined ? ` ${song.progress}%` : ''}
            </p>
          )}

          {/* Row 4: Action buttons */}
          <div className="flex items-center gap-1 pt-0.5">
            {/* Like */}
            <button
              onClick={(e) => { e.stopPropagation(); onLike?.(); }}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                song.liked
                  ? 'bg-accent-500/20 text-accent-400'
                  : 'text-surface-500 hover:text-surface-800 hover:bg-surface-200'
              }`}
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${song.liked ? 'fill-accent-400' : ''}`} />
              {song.likeCount ? <span>{song.likeCount}</span> : null}
            </button>
            {/* Dislike */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Set as disliked: if already liked, toggle back; otherwise mark as not-liked
                onLike?.();
              }}
              className="p-1 rounded-full text-surface-500 hover:text-surface-800 hover:bg-surface-200 transition-colors"
              title={t('common.dislike', 'Dislike')}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            {/* Share */}
            <button
              onClick={(e) => { e.stopPropagation(); onMenuAction?.('share'); }}
              className="p-1 rounded-full text-surface-500 hover:text-surface-800 hover:bg-surface-200 transition-colors"
              title={t('common.share', 'Share')}
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            {/* Video */}
            <button
              onClick={(e) => { e.stopPropagation(); onMenuAction?.('createVideo'); }}
              className="p-1 rounded-full text-surface-500 hover:text-surface-800 hover:bg-surface-200 transition-colors"
              title={t('common.createVideo', 'Create Video')}
            >
              <Video className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: duration + ≡ + ··· */}
        <div className="flex flex-col items-end justify-between h-16 flex-shrink-0 gap-1">
          <span className="text-xs text-surface-500 tabular-nums">
            {song.isGenerating ? '—' : (song.duration || '0:00')}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onMenuAction?.('addToPlaylist'); }}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-800 hover:bg-surface-200 transition-colors"
              title={t('common.addToWorkspace', 'Add to Workspace')}
            >
              <ListPlus className="w-4 h-4" />
            </button>
            <button
              onClick={handleMoreClick}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-800 hover:bg-surface-200 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {menu && (
        <SongContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onAction={handleAction}
          hasAudioUrl={!!song.audioUrl}
        />
      )}
    </>
  );
})
