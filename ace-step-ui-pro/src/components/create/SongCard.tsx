import React, { useState, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Play, Pause, Loader2, Clock, MoreVertical } from 'lucide-react';
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
}

export default memo(function SongCard({ song, isPlaying, isCurrent, onPlay, onDelete, onMenuAction, onSelect }: SongCardProps) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const coverStyle = useMemo(() => getCoverStyle(song.id), [song.id]);

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

  return (
    <>
      <div
        className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isCurrent
            ? 'bg-accent-500/10 border border-accent-500/30'
            : 'hover:bg-surface-100 border border-transparent'
        }`}
        onClick={() => { if (onSelect) onSelect(); }}
        onContextMenu={handleContextMenu}
      >
        {/* Cover / Play button */}
        <div
          className="relative w-10 h-10 rounded-lg bg-surface-200 flex-shrink-0 overflow-hidden cursor-pointer"
          onClick={(e) => { e.stopPropagation(); if (!song.isGenerating) onPlay(); }}
        >
          {song.coverUrl ? (
            <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={coverStyle}>
              <Music className="w-4 h-4 text-white/50" />
            </div>
          )}
          {song.isGenerating ? (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
              {isCurrent && isPlaying ? (
                <Pause className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
              ) : (
                <Play className="w-4 h-4 text-white ml-0.5 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-surface-900 truncate">{song.title || 'Untitled'}</p>
            {/* Model badge */}
            {(song.ditModel || song.generationParams?.ditModel) && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium shrink-0 leading-none">
                {song.ditModel || song.generationParams?.ditModel}
              </span>
            )}
            {/* LoRA badge */}
            {song.generationParams?.loraName && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-brand-500/10 text-brand-400 font-medium shrink-0 leading-none truncate max-w-[80px]">
                {song.generationParams.loraName}
                {song.generationParams.loraScale !== undefined && song.generationParams.loraScale !== 1
                  ? ` ×${song.generationParams.loraScale.toFixed(1)}`
                  : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-surface-500">
            {song.style && <span className="truncate max-w-[120px]">{song.style}</span>}
            {song.isGenerating && song.progress !== undefined && (
              <span className="text-accent-400">{song.progress}%</span>
            )}
            {song.isGenerating && !song.progress && (
              <span className="text-accent-400 truncate">{t('create.generatingSong', 'Generando canción...')}</span>
            )}
            {song.isGenerating && song.stage && (
              <span className="text-accent-400 truncate">{song.stage}</span>
            )}
            {!song.isGenerating && song.createdAt && (
              <span className="text-[10px] text-surface-400 shrink-0">
                {new Date(song.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' '}
                {new Date(song.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Duration + menu */}
        <div className="flex items-center gap-1">
          {!song.isGenerating && (
            <span className="text-xs text-surface-500 tabular-nums">
              <Clock className="w-3 h-3 inline mr-0.5" />
              {song.duration || '0:00'}
            </span>
          )}
          <button
            onClick={handleMoreClick}
            className="p-1 rounded-lg text-surface-400 hover:text-surface-800 hover:bg-surface-200 opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
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
