import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Scissors, Download, Loader2, Music, Mic2, Drum, Guitar, Piano } from 'lucide-react';
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

const MODELS = [
  { value: 'htdemucs_ft', label: 'HTDemucs Fine-Tuned (Best)' },
  { value: 'htdemucs', label: 'HTDemucs' },
  { value: 'htdemucs_6s', label: 'HTDemucs 6-Stem' },
  { value: 'mdx_extra', label: 'MDX Extra' },
];

const STEM_ICONS: Record<string, React.ReactNode> = {
  vocals: <Mic2 className="w-4 h-4" />,
  drums: <Drum className="w-4 h-4" />,
  bass: <Guitar className="w-4 h-4" />,
  other: <Music className="w-4 h-4" />,
  guitar: <Guitar className="w-4 h-4" />,
  piano: <Piano className="w-4 h-4" />,
};

const STEM_COLORS: Record<string, string> = {
  vocals: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  drums: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  bass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  other: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  guitar: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  piano: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
};

export default function StemSeparator({ song, onClose }: StemSeparatorProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [model, setModel] = useState('htdemucs_ft');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stems, setStems] = useState<StemResult[]>([]);
  const [error, setError] = useState('');

  const handleSeparate = useCallback(async () => {
    if (!song?.audioUrl || !token) return;
    setProcessing(true);
    setProgress(10);
    setError('');
    setStems([]);

    // Simulate progress while waiting
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 5, 90));
    }, 2000);

    try {
      const res = await generateApi.separateStems({
        audioUrl: song.audioUrl,
        model,
        quality: 'high',
      }, token);

      clearInterval(progressInterval);
      setProgress(100);

      if (res.success && res.allStems) {
        setStems(res.allStems.map((s: any) => ({
          name: s.name || s.stem || 'unknown',
          url: s.url || s.path || '',
        })));
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

  if (!song) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-50 border border-surface-300 rounded-2xl w-[440px] max-h-[80vh] flex flex-col animate-scale-in shadow-2xl">
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

          {/* Model selector */}
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
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

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

          {/* Results */}
          {stems.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                {t('stems.results', 'Separated Stems')}
              </span>
              {stems.map(stem => {
                const colorClass = STEM_COLORS[stem.name] || STEM_COLORS.other;
                return (
                  <div
                    key={stem.name}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${colorClass} transition-colors`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5">
                      {STEM_ICONS[stem.name] || <Music className="w-4 h-4" />}
                    </div>
                    <span className="flex-1 text-sm font-medium capitalize">{stem.name}</span>
                    <button
                      onClick={() => handleDownloadStem(stem)}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      title={t('common.download')}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
