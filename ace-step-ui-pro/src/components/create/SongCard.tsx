import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Play, Pause, Loader2, ThumbsUp, ThumbsDown, Share2, Video, ListPlus, MoreVertical, Disc3 } from 'lucide-react';
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
}

// Deterministic avatar color from string
function avatarColor(name: string) {
  const colors = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export default memo(function SongCard({ song, isPlaying, isCurrent, onPlay, onDelete, onMenuAction, onSelect, onRename, onLike }: SongCardProps) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
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
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold shrink-0 leading-none">
                {ditLabel}
              </span>
            )}
            {loraName && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-300/30 text-surface-400 font-medium shrink-0 leading-none truncate max-w-[120px]">
                LoRA: {loraName}{loraScale !== undefined && loraScale !== 1 ? ` ×${loraScale.toFixed(1)}` : ''}
              </span>
            )}
            {seed !== undefined && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-300/20 text-surface-500 font-medium shrink-0 leading-none">
                seed: {seed}
              </span>
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
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              style={{ backgroundColor: avatarColor(creatorName) }}
            >
              {creatorInitial}
            </span>
            <span className="text-xs text-surface-500">{creatorName}</span>
          </div>

          {/* Row 3: Style tags */}
          {song.style && (
            <p className="text-xs text-surface-500 leading-snug line-clamp-1">{song.style}</p>
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
