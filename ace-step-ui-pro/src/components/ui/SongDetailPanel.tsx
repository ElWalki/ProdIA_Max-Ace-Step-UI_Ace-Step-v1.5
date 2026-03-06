import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Copy, Download, Share2, Music, Clock, Tag,
  Heart, Cpu, FileText, ChevronDown, ChevronUp, CheckCheck,
} from 'lucide-react';
import type { Song } from '../../types';
import { getCoverStyle } from '../../utils/coverArt';

interface SongDetailPanelProps {
  song: Song | null;
  onClose: () => void;
  onPlay: (song: Song) => void;
  onDownload: (song: Song) => void;
  onLike: (id: string) => void;
}

export default function SongDetailPanel({ song, onClose, onPlay, onDownload, onLike }: SongDetailPanelProps) {
  const { t } = useTranslation();
  const [expandLyrics, setExpandLyrics] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  if (!song) return null;

  const gp = song.generationParams;
  const promptText = song.prompt || gp?.style || gp?.prompt || song.style || '';
  const hasCover = !!song.coverUrl;

  return (
    <div className="w-[320px] min-w-[280px] border-l border-surface-200 bg-surface-50/80 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200">
        <span className="text-xs font-semibold text-surface-600 uppercase tracking-wider">
          {t('detail.title', 'Song Details')}
        </span>
        <button onClick={onClose} className="p-1 rounded-md text-surface-400 hover:text-surface-700 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Cover Art */}
        <div className="relative aspect-square mx-4 mt-4 rounded-xl overflow-hidden shadow-xl">
          {hasCover ? (
            <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={getCoverStyle(song.id)}>
              <Music className="w-16 h-16 text-white/40" />
            </div>
          )}
          {/* Overlay gradient */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="text-white font-bold text-lg truncate drop-shadow-lg">{song.title || 'Untitled'}</h3>
            {song.duration && (
              <span className="text-white/70 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" /> {song.duration}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 mt-3">
          <button
            onClick={() => onPlay(song)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-accent-600 text-white hover:bg-accent-500 transition-colors"
          >
            {t('common.play')}
          </button>
          <button
            onClick={() => onLike(song.id)}
            className={`p-2 rounded-lg border transition-colors ${
              song.liked
                ? 'bg-pink-500/10 border-pink-500/30 text-pink-400'
                : 'bg-surface-100 border-surface-300 text-surface-400 hover:text-pink-400'
            }`}
          >
            <Heart className={`w-4 h-4 ${song.liked ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={() => onDownload(song)}
            className="p-2 rounded-lg bg-surface-100 border border-surface-300 text-surface-400 hover:text-surface-700 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Style / Prompt */}
        {promptText && (
          <div className="mx-4 mt-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1">
                <Tag className="w-3 h-3" /> {t('detail.prompt', 'Prompt / Style')}
              </span>
              <button
                onClick={() => copyText(promptText, 'prompt')}
                className="p-1 rounded text-surface-400 hover:text-accent-400 transition-colors"
                title={t('detail.copy', 'Copy')}
              >
                {copied === 'prompt' ? <CheckCheck className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <p className="text-xs text-surface-700 leading-relaxed bg-surface-100 rounded-lg p-2 border border-surface-200">
              {promptText}
            </p>
          </div>
        )}

        {/* Tags */}
        {Array.isArray(song.tags) && song.tags.length > 0 && (
          <div className="mx-4 mt-3 flex flex-wrap gap-1">
            {song.tags.map((tag, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-accent-600/10 text-accent-400 text-[10px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Lyrics */}
        {song.lyrics && (
          <div className="mx-4 mt-4 space-y-1">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setExpandLyrics(!expandLyrics)}
                className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1 hover:text-surface-700"
              >
                <FileText className="w-3 h-3" />
                {t('meta.lyrics', 'Lyrics')}
                {expandLyrics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <button
                onClick={() => copyText(song.lyrics, 'lyrics')}
                className="p-1 rounded text-surface-400 hover:text-accent-400 transition-colors"
                title={t('detail.copy', 'Copy')}
              >
                {copied === 'lyrics' ? <CheckCheck className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <div
              className={`text-xs text-surface-600 font-mono leading-relaxed bg-surface-100 rounded-lg p-2 border border-surface-200
                overflow-hidden transition-all ${expandLyrics ? 'max-h-[500px] overflow-y-auto' : 'max-h-24'}`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {song.lyrics}
            </div>
          </div>
        )}

        {/* Generation info */}
        {gp && (
          <div className="mx-4 mt-4 mb-4 space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1">
              <Cpu className="w-3 h-3" /> {t('meta.generation', 'Generation')}
            </span>
            <div className="rounded-lg border border-surface-200 divide-y divide-surface-200 overflow-hidden text-xs">
              {gp.ditModel && (
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-surface-500">{t('meta.model', 'Model')}</span>
                  <span className="text-surface-800 font-medium truncate ml-2 max-w-[140px]">{gp.ditModel}</span>
                </div>
              )}
              {gp.bpm > 0 && (
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-surface-500">BPM</span>
                  <span className="text-surface-800 font-medium">{gp.bpm}</span>
                </div>
              )}
              {gp.keyScale && (
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-surface-500">{t('meta.key', 'Key')}</span>
                  <span className="text-surface-800 font-medium">{gp.keyScale}</span>
                </div>
              )}
              <div className="flex justify-between px-2.5 py-1.5">
                <span className="text-surface-500">{t('meta.steps', 'Steps')}</span>
                <span className="text-surface-800 font-medium">{gp.inferenceSteps}</span>
              </div>
              <div className="flex justify-between px-2.5 py-1.5">
                <span className="text-surface-500">{t('meta.guidance', 'Guidance')}</span>
                <span className="text-surface-800 font-medium">{gp.guidanceScale}</span>
              </div>
              {gp.seed !== undefined && !gp.randomSeed && (
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-surface-500">{t('meta.seed', 'Seed')}</span>
                  <span className="text-surface-800 font-medium font-mono">{gp.seed}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
