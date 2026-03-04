import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { songsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { X, Save, Loader2 } from 'lucide-react';

interface EditMetadataModalProps {
  song: Song;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updatedSong: Partial<Song>) => void;
}

const KEY_OPTIONS = [
  '', 'C major', 'C minor', 'C# major', 'C# minor',
  'Db major', 'Db minor', 'D major', 'D minor',
  'D# major', 'D# minor', 'Eb major', 'Eb minor',
  'E major', 'E minor', 'F major', 'F minor',
  'F# major', 'F# minor', 'Gb major', 'Gb minor',
  'G major', 'G minor', 'G# major', 'G# minor',
  'Ab major', 'Ab minor', 'A major', 'A minor',
  'A# major', 'A# minor', 'Bb major', 'Bb minor',
  'B major', 'B minor',
];

const TIME_SIG_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: '1', label: '1/4' },
  { value: '2', label: '2/4' },
  { value: '3', label: '3/4' },
  { value: '4', label: '4/4' },
  { value: '6', label: '6/8' },
];

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({
  song,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { token } = useAuth();
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract current values from song or generationParams
  const gp = song.generationParams || {};

  const [title, setTitle] = useState(song.title || '');
  const [style, setStyle] = useState(song.style || '');
  const [bpm, setBpm] = useState<string>(String(gp.bpm || ''));
  const [keyScale, setKeyScale] = useState<string>(gp.keyScale || '');
  const [timeSig, setTimeSig] = useState<string>(gp.timeSignature || '');

  // Reset form when song changes
  useEffect(() => {
    const p = song.generationParams || {};
    setTitle(song.title || '');
    setStyle(song.style || '');
    setBpm(String(p.bpm || ''));
    setKeyScale(p.keyScale || '');
    setTimeSig(p.timeSignature || '');
    setError(null);
  }, [song.id, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (title !== song.title) body.title = title;
      if (style !== song.style) body.style = style;

      const bpmNum = bpm ? parseInt(bpm, 10) : null;
      if (bpmNum !== null && !isNaN(bpmNum)) body.bpm = bpmNum;
      else if (!bpm) body.bpm = null;

      if (keyScale !== (gp.keyScale || '')) body.key_scale = keyScale || null;
      if (timeSig !== (gp.timeSignature || '')) body.time_signature = timeSig || null;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      await songsApi.updateSong(song.id, body, token);

      onSaved({
        ...song,
        title: title || song.title,
        style: style || song.style,
        generationParams: {
          ...gp,
          bpm: bpmNum || gp.bpm,
          keyScale: keyScale || gp.keyScale,
          timeSignature: timeSig || gp.timeSignature,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('editMetadata.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 w-[420px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{t('editMetadata.modalTitle')}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Style / Genre */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('editMetadata.styleGenreLabel')}</label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* BPM + Key row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('bpm')}</label>
              <input
                type="number"
                min={30}
                max={300}
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                placeholder={t('auto')}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('editMetadata.keyLabel')}</label>
              <select
                value={keyScale}
                onChange={(e) => setKeyScale(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                <option value="">{t('auto')}</option>
                {KEY_OPTIONS.filter(k => k).map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Time Signature */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('timeSignature')}</label>
            <select
              value={timeSig}
              onChange={(e) => setTimeSig(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              {TIME_SIG_OPTIONS.map(ts => (
                <option key={ts.value} value={ts.value}>{ts.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};
