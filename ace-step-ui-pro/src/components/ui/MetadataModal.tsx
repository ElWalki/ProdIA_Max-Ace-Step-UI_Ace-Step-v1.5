import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Music, Clock, Cpu, Sliders, FileText, Tag } from 'lucide-react';
import type { Song } from '../../types';

interface MetadataModalProps {
  song: Song | null;
  onClose: () => void;
}

interface MetaRow {
  label: string;
  value: string | number | boolean | undefined;
  icon?: React.ReactNode;
}

export default function MetadataModal({ song, onClose }: MetadataModalProps) {
  const { t } = useTranslation();

  if (!song) return null;

  const formatDate = (d?: Date | string) => {
    if (!d) return '—';
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d instanceof Date ? d : new Date(d)); }
    catch { return String(d); }
  };

  const gp = song.generationParams;

  const sections: { title: string; icon: React.ReactNode; rows: MetaRow[] }[] = [
    {
      title: t('meta.general', 'General'),
      icon: <Music className="w-3.5 h-3.5" />,
      rows: [
        { label: t('meta.title', 'Title'), value: song.title },
        { label: t('meta.style', 'Style'), value: Array.isArray(song.tags) ? song.tags.join(', ') : song.tags },
        { label: t('meta.duration', 'Duration'), value: song.duration || undefined },
        { label: t('meta.created', 'Created'), value: formatDate(song.createdAt) },
      ],
    },
    {
      title: t('meta.generation', 'Generation'),
      icon: <Cpu className="w-3.5 h-3.5" />,
      rows: [
        { label: t('meta.model', 'Model'), value: gp?.ditModel },
        { label: 'BPM', value: gp?.bpm },
        { label: t('meta.key', 'Key'), value: gp?.keyScale },
        { label: t('meta.instrumental', 'Instrumental'), value: gp?.instrumental ? 'Yes' : 'No' },
      ],
    },
    {
      title: t('meta.params', 'Parameters'),
      icon: <Sliders className="w-3.5 h-3.5" />,
      rows: [
        { label: t('meta.steps', 'Steps'), value: gp?.inferenceSteps },
        { label: t('meta.guidance', 'Guidance'), value: gp?.guidanceScale },
        { label: t('meta.seed', 'Seed'), value: gp?.seed },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-50 border border-surface-300 rounded-2xl w-[400px] max-h-[70vh] flex flex-col
        animate-scale-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-400" />
            {t('meta.title_modal', 'Song Metadata')}
          </h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {sections.map(section => {
            const visibleRows = section.rows.filter(r => r.value !== undefined && r.value !== '');
            if (visibleRows.length === 0) return null;
            return (
              <div key={section.title} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-surface-500">
                  {section.icon}
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{section.title}</span>
                </div>
                <div className="rounded-lg border border-surface-200 divide-y divide-surface-200 overflow-hidden">
                  {visibleRows.map(row => (
                    <div key={row.label} className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-surface-500">{row.label}</span>
                      <span className="text-xs text-surface-800 font-medium text-right max-w-[60%] truncate">
                        {String(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Lyrics */}
          {song.lyrics && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-surface-500">
                <Tag className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {t('meta.lyrics', 'Lyrics')}
                </span>
              </div>
              <pre className="text-xs text-surface-700 bg-surface-100 rounded-lg border border-surface-200
                p-3 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                {song.lyrics}
              </pre>
            </div>
          )}

          {/* Tags */}
          {song.tags && song.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(Array.isArray(song.tags) ? song.tags : [song.tags]).map((tag: string, i: number) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-surface-100 border border-surface-200
                    text-[10px] text-surface-600"
                >
                  {tag.trim()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-surface-200">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-surface-100 text-xs font-medium text-surface-600
              hover:bg-surface-200 transition-colors"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
