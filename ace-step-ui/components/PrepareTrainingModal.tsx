import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  X, Play, Pause, Scissors, Database, Loader2, Music2,
  ChevronDown, Plus, Check, AlertCircle, Sparkles, Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { trainingApi } from '../services/api';
import { Song } from '../types';

const LANGUAGES = [
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'unknown', label: 'Unknown' },
];

interface PrepareTrainingModalProps {
  song: Song;
  onClose: () => void;
}

export const PrepareTrainingModal: React.FC<PrepareTrainingModalProps> = ({ song, onClose }) => {
  const { token } = useAuth();
  const { t } = useI18n();

  // Audio player
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0); // 0 = use full duration

  // Metadata fields (pre-filled from song)
  const gp = song.generationParams;
  const [caption, setCaption] = useState(song.style || gp?.style || '');
  const [genre, setGenre] = useState('');
  const [customTag, setCustomTag] = useState(gp?.loraTriggerTag || '');
  const [lyrics, setLyrics] = useState(() => {
    const l = song.lyrics || gp?.lyrics || '';
    return /^\[instrumental\]$/i.test(l.trim()) ? '' : l;
  });
  const [isInstrumental, setIsInstrumental] = useState(() => {
    const l = song.lyrics || gp?.lyrics || '';
    return !l || l.trim().length === 0 || /^\[instrumental\]$/i.test(l.trim());
  });
  const [bpm, setBpm] = useState<number | null>(() => gp?.bpm || null);
  const [keyscale, setKeyscale] = useState(gp?.keyScale || '');
  const [timesignature, setTimesignature] = useState(gp?.timeSignature || '');
  const [language, setLanguage] = useState(() => gp?.vocalLanguage || (isInstrumental ? 'instrumental' : 'unknown'));

  // Dataset selection
  const [datasets, setDatasets] = useState<Array<{ name: string; sampleCount: number }>>([]);
  const [selectedDataset, setSelectedDataset] = useState('my_lora_dataset');
  const [newDatasetName, setNewDatasetName] = useState('');
  const [showNewDataset, setShowNewDataset] = useState(false);

  // AI auto-label
  const [isAutoLabeling, setIsAutoLabeling] = useState(false);
  const [autoLabelError, setAutoLabelError] = useState('');

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Load datasets on mount
  useEffect(() => {
    if (!token) return;
    trainingApi.listDatasets(token).then(result => {
      setDatasets(result.datasets || []);
    }).catch(() => { /* ignore */ });
  }, [token]);

  // Set trimEnd when audio duration loads
  useEffect(() => {
    if (audioDuration > 0 && trimEnd === 0) {
      setTrimEnd(Math.round(audioDuration));
    }
  }, [audioDuration, trimEnd]);

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const effectiveDatasetName = showNewDataset && newDatasetName.trim()
    ? newDatasetName.trim().replace(/[^a-zA-Z0-9_\-]/g, '_')
    : selectedDataset;

  const handleSubmit = async () => {
    if (!token || !song.audioUrl) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitStatus('Adding to dataset...');

    try {
      const result = await trainingApi.addToDataset({
        audioPath: song.audioUrl,
        datasetName: effectiveDatasetName,
        caption,
        genre,
        lyrics: isInstrumental ? '[Instrumental]' : lyrics,
        bpm,
        keyscale,
        timesignature,
        duration: audioDuration > 0 ? Math.round(audioDuration) : 0,
        language: isInstrumental ? 'instrumental' : language,
        isInstrumental,
        customTag,
        trimStart: trimStart > 0 ? trimStart : undefined,
        trimEnd: trimEnd > 0 && trimEnd < audioDuration ? trimEnd : undefined,
      }, token);

      setSubmitStatus(result.status);
      // Refresh datasets list
      const refreshed = await trainingApi.listDatasets(token);
      setDatasets(refreshed.datasets || []);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to add sample');
      setSubmitStatus('');
    } finally {
      setSubmitting(false);
    }
  };

  // Trim region visualization
  const trimStartPercent = audioDuration > 0 ? (trimStart / audioDuration) * 100 : 0;
  const trimEndPercent = audioDuration > 0 ? ((trimEnd || audioDuration) / audioDuration) * 100 : 100;
  const currentPercent = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={(e) => e.stopPropagation()} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Database size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Prepare for Training</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xs">{song.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={song.audioUrl || undefined}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
          />

          {/* Audio Player + Trim Section */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-3 border border-zinc-200 dark:border-zinc-700/50">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <Music2 size={14} />
              Audio Preview & Trim
            </div>

            {/* Player controls */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 hover:scale-105 transition-transform"
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                  {song.title || 'Untitled'}
                </div>
                <div className="text-[10px] text-zinc-400 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(audioDuration)}
                </div>
              </div>
            </div>

            {/* Timeline with trim region */}
            <div className="relative">
              {/* Full track */}
              <div
                className="h-8 rounded-lg bg-zinc-200 dark:bg-zinc-700 cursor-pointer relative overflow-hidden"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  seekTo(percent * audioDuration);
                }}
              >
                {/* Trim region highlight */}
                <div
                  className="absolute inset-y-0 bg-violet-500/20 dark:bg-violet-400/15 border-l-2 border-r-2 border-violet-500"
                  style={{
                    left: `${trimStartPercent}%`,
                    width: `${trimEndPercent - trimStartPercent}%`,
                  }}
                />
                {/* Playhead */}
                <div
                  className="absolute inset-y-0 w-0.5 bg-white dark:bg-zinc-300 shadow"
                  style={{ left: `${currentPercent}%` }}
                />
              </div>
            </div>

            {/* Trim controls */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <Scissors size={10} /> Trim Start (s)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, (trimEnd || audioDuration) - 1)}
                    step={1}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, (trimEnd || audioDuration) - 1)}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Math.max(0, Number(e.target.value)))}
                    className="w-14 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded px-1.5 py-0.5 text-xs text-center text-zinc-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <Scissors size={10} /> Trim End (s)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={trimStart + 1}
                    max={Math.ceil(audioDuration) || 300}
                    step={1}
                    value={trimEnd || Math.ceil(audioDuration)}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                  <input
                    type="number"
                    min={trimStart + 1}
                    max={Math.ceil(audioDuration) || 300}
                    value={trimEnd || Math.ceil(audioDuration)}
                    onChange={(e) => setTrimEnd(Math.max(trimStart + 1, Number(e.target.value)))}
                    className="w-14 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded px-1.5 py-0.5 text-xs text-center text-zinc-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div className="text-[10px] text-zinc-400">
              Selected region: {formatTime(trimStart)} — {formatTime(trimEnd || audioDuration)} ({Math.round((trimEnd || audioDuration) - trimStart)}s)
            </div>
          </div>

          {/* AI Auto-Label Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!token || !song.audioUrl) return;
                setIsAutoLabeling(true);
                setAutoLabelError('');
                try {
                  const result = await trainingApi.autoLabelSingle(
                    song.audioUrl,
                    !isInstrumental,
                    token,
                  );
                  if (result.success && result.metadata) {
                    const m = result.metadata;
                    if (m.caption) setCaption(m.caption);
                    if (m.genre) setGenre(m.genre);
                    if (m.bpm) setBpm(m.bpm);
                    if (m.key) setKeyscale(m.key);
                    if (m.timeSignature) setTimesignature(m.timeSignature);
                    if (m.language) setLanguage(m.language);
                    if (m.lyrics && !isInstrumental) setLyrics(m.lyrics);
                    if (m.instrumental) {
                      setIsInstrumental(true);
                      setLanguage('instrumental');
                    }
                  } else {
                    setAutoLabelError(result.error || result.hint || 'Auto-label failed');
                  }
                } catch (err) {
                  setAutoLabelError(
                    err instanceof Error ? err.message : 'Auto-label failed. Is the LLM initialized?'
                  );
                } finally {
                  setIsAutoLabeling(false);
                }
              }}
              disabled={isAutoLabeling || !song.audioUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-semibold shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isAutoLabeling ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {isAutoLabeling ? 'Analyzing audio...' : 'AI Auto-Label'}
            </button>
            <span className="text-[10px] text-zinc-400">Detect genre, caption, BPM, key, language & lyrics using AI (requires LLM initialized)</span>
          </div>
          {autoLabelError && (
            <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg space-y-1">
              <div className="flex items-center gap-2">
                <AlertCircle size={12} /> {autoLabelError}
              </div>
              <div className="text-[10px] text-amber-500 dark:text-amber-500">
                Tip: Initialize the model with LLM enabled in the Gradio service tab, then try again.
              </div>
            </div>
          )}

          {/* Caption / Style */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Caption / Style</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Lo-fi ambient electronic, dreamy pads, soft beats"
              className="w-full h-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-xl p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
            />
          </div>

          {/* Genre */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Genre</label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="e.g. electronic, ambient, lo-fi"
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          {/* Custom Tag */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Custom Tag (LoRA trigger)</label>
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="e.g. mystyle, artist_x"
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
            <p className="text-[10px] text-zinc-400">This tag will be prepended to the caption during training. Use it as a trigger word for the LoRA.</p>
          </div>

          {/* Instrumental toggle + Lyrics */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Lyrics</label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInstrumental}
                  onChange={(e) => {
                    setIsInstrumental(e.target.checked);
                    if (e.target.checked) setLanguage('instrumental');
                  }}
                  className="w-3.5 h-3.5 rounded border-zinc-300 text-violet-500 focus:ring-violet-500"
                />
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Instrumental (no lyrics)</span>
              </label>
            </div>
            {!isInstrumental && (
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste or type lyrics here..."
                className="w-full h-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-xl p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-y font-mono"
              />
            )}
          </div>

          {/* Music parameters row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">BPM</label>
              <input
                type="number"
                min={0}
                max={300}
                value={bpm ?? ''}
                onChange={(e) => setBpm(e.target.value ? Number(e.target.value) : null)}
                placeholder="—"
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white text-center focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Key</label>
              <input
                type="text"
                value={keyscale}
                onChange={(e) => setKeyscale(e.target.value)}
                placeholder="e.g. C major"
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Time Sig</label>
              <input
                type="text"
                value={timesignature}
                onChange={(e) => setTimesignature(e.target.value)}
                placeholder="e.g. 4"
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white text-center focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isInstrumental}
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg px-1 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none disabled:opacity-40"
              >
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dataset selection */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-3 border border-zinc-200 dark:border-zinc-700/50">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <Database size={14} />
              Target Dataset
            </div>

            {!showNewDataset ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none"
                >
                  <option value="my_lora_dataset">my_lora_dataset</option>
                  {datasets.filter(d => d.name !== 'my_lora_dataset').map(d => (
                    <option key={d.name} value={d.name}>{d.name} ({d.sampleCount} samples)</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewDataset(true)}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium transition-colors"
                >
                  <Plus size={12} /> New
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                  placeholder="dataset_name"
                  autoFocus
                  className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <button
                  type="button"
                  onClick={() => { setShowNewDataset(false); setNewDatasetName(''); }}
                  className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {datasets.length > 0 && (
              <div className="text-[10px] text-zinc-400">
                {datasets.length} dataset(s) available. Samples will be appended to the selected dataset.
              </div>
            )}
          </div>
        </div>

        {/* Footer with actions */}
        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30 space-y-2">
          {/* Status messages */}
          {submitStatus && (
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
              <Check size={14} /> {submitStatus}
            </div>
          )}
          {submitError && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle size={14} /> {submitError}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !song.audioUrl || !effectiveDatasetName}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Database size={16} />
              )}
              {submitting ? 'Adding...' : `Add to "${effectiveDatasetName}"`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
