import React, { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, Volume2, Clock } from 'lucide-react';
import WaveformPlayer from './WaveformPlayer';

export type AudioTab = 'reference' | 'cover' | 'vocal' | 'extend';

export interface AudioHistoryItem {
  url: string;
  title: string;
  timestamp: number;
}

interface AudioSectionProps {
  label: string;
  description: string;
  audioUrl: string | undefined;
  audioTitle: string | undefined;
  onUpload: (file: File) => void;
  onClear: () => void;
  onSongDrop?: (url: string, title: string) => void;
  accept?: string;
  audioHistory?: AudioHistoryItem[];
  onHistorySelect?: (item: AudioHistoryItem) => void;
  regionMode?: boolean;
  regionStart?: number;
  regionEnd?: number;
  onRegionChange?: (start: number, end: number) => void;
  strength?: number;
  strengthLabel?: string;
  onStrengthChange?: (v: number) => void;
}

function AudioSection({
  label, description, audioUrl, audioTitle,
  onUpload, onClear, onSongDrop, accept = 'audio/*',
  audioHistory, onHistorySelect,
  regionMode, regionStart, regionEnd, onRegionChange,
  strength, strengthLabel, onStrengthChange,
}: AudioSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const songUrl = e.dataTransfer.getData('text/song-audio-url');
    const songTitle = e.dataTransfer.getData('text/song-title');
    if (songUrl && onSongDrop) {
      onSongDrop(songUrl, songTitle || 'Untitled');
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('audio/')) onUpload(file);
  }, [onUpload, onSongDrop]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 justify-between">
        <span className="text-xs font-medium text-surface-700">{label}</span>
        <div className="flex items-center gap-1">
          {audioHistory && audioHistory.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowHistory(!showHistory)} className="text-surface-400 hover:text-accent-400 transition-colors" title="Recent">
                <Clock className="w-3.5 h-3.5" />
              </button>
              {showHistory && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-surface-100 border border-surface-300 rounded-lg shadow-2xl z-50 overflow-hidden">
                  <div className="max-h-36 overflow-y-auto">
                    {audioHistory.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => { onHistorySelect?.(item); setShowHistory(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-200 transition-colors"
                      >
                        <Volume2 className="w-3 h-3 text-accent-400 shrink-0" />
                        <span className="text-[11px] text-surface-700 truncate">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {audioTitle && (
            <button onClick={onClear} className="text-surface-400 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {audioUrl ? (
        <WaveformPlayer
          src={audioUrl}
          title={audioTitle}
          regionMode={regionMode}
          regionStart={regionStart}
          regionEnd={regionEnd}
          onRegionChange={onRegionChange}
        />
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center gap-1 p-3 rounded-lg border border-dashed cursor-pointer
            transition-colors ${isDragging
              ? 'border-accent-500 bg-accent-500/5'
              : 'border-surface-300 hover:border-surface-400 bg-surface-50'
            }`}
        >
          <Upload className="w-4 h-4 text-surface-400" />
          <span className="text-[10px] text-surface-400">{description}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
        className="hidden"
      />

      {/* Contextual strength slider */}
      {strength !== undefined && onStrengthChange && audioUrl && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-surface-500 w-16">{strengthLabel || 'Strength'}</span>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={strength}
            onChange={e => onStrengthChange(parseFloat(e.target.value))}
            className="flex-1 accent-accent-500 h-1"
          />
          <span className="text-[10px] text-surface-500 w-7 text-right">{(strength * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* Region info for repaint */}
      {regionMode && audioUrl && (
        <div className="flex items-center gap-3 text-[10px] text-purple-400">
          <span>Start: {((regionStart ?? 0) * 100).toFixed(0)}%</span>
          <span>End: {((regionEnd ?? 1) * 100).toFixed(0)}%</span>
          <span className="text-surface-400 ml-auto">Drag handles to select region</span>
        </div>
      )}
    </div>
  );
}

interface AudioSectionsProps {
  referenceAudioUrl?: string;
  referenceAudioTitle?: string;
  onReferenceUpload: (file: File) => void;
  onReferenceClear: () => void;
  onReferenceSongDrop?: (url: string, title: string) => void;

  coverAudioUrl?: string;
  coverAudioTitle?: string;
  onCoverUpload: (file: File) => void;
  onCoverClear: () => void;
  onCoverSongDrop?: (url: string, title: string) => void;

  vocalAudioUrl?: string;
  vocalAudioTitle?: string;
  onVocalUpload: (file: File) => void;
  onVocalClear: () => void;
  onVocalSongDrop?: (url: string, title: string) => void;

  // Extend reuses sourceAudioUrl with taskType='complete'
  onExtendUpload: (file: File) => void;
  onExtendClear: () => void;
  onExtendSongDrop?: (url: string, title: string) => void;

  onRecord?: () => void;

  activeTab?: AudioTab;
  onActiveTabChange?: (tab: AudioTab) => void;

  // Task context
  taskType?: string;

  // Cover/vocal strength
  audioCoverStrength?: number;
  onAudioCoverStrengthChange?: (v: number) => void;

  // Repaint region
  repaintingStart?: number;
  repaintingEnd?: number;
  onRepaintingChange?: (start: number, end: number) => void;

  audioHistory?: AudioHistoryItem[];
  onHistorySelect?: (item: AudioHistoryItem, target: 'reference' | 'source' | 'vocal') => void;
}

export default function AudioSections(props: AudioSectionsProps) {
  const { t } = useTranslation();
  const [internalTab, setInternalTab] = useState<AudioTab>('reference');
  const activeTab = props.activeTab ?? internalTab;
  const setActiveTab = (tab: AudioTab) => {
    setInternalTab(tab);
    props.onActiveTabChange?.(tab);
  };

  const isRepaint = props.taskType === 'repaint';

  const tabs = [
    { id: 'reference' as const, label: t('audio.reference', 'Reference'), hasFile: !!props.referenceAudioUrl },
    { id: 'cover' as const, label: t('audio.cover', 'Cover'), hasFile: !!props.coverAudioUrl },
    { id: 'vocal' as const, label: t('audio.vocal', 'Vocal'), hasFile: !!props.vocalAudioUrl },
    { id: 'extend' as const, label: t('audio.extend', 'Extend'), hasFile: !!props.coverAudioUrl },
  ];

  return (
    <div className="rounded-xl border border-surface-300 bg-surface-50 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-surface-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-accent-400 bg-surface-100'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            {tab.label}
            {tab.hasFile && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-green-500" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3">
        {activeTab === 'reference' && (
          <AudioSection
            label={t('audio.referenceLabel', 'Reference Audio')}
            description={t('audio.referenceDrop', 'Drop reference audio or drag a song')}
            audioUrl={props.referenceAudioUrl}
            audioTitle={props.referenceAudioTitle}
            onUpload={props.onReferenceUpload}
            onClear={props.onReferenceClear}
            onSongDrop={props.onReferenceSongDrop}
            audioHistory={props.audioHistory}
            onHistorySelect={item => props.onHistorySelect?.(item, 'reference')}
          />
        )}
        {activeTab === 'cover' && (
          <AudioSection
            label={isRepaint ? t('audio.repaintLabel', 'Repaint Source') : t('audio.coverLabel', 'Cover Audio')}
            description={isRepaint ? t('audio.repaintDrop', 'Drop audio to repaint a section') : t('audio.coverDrop', 'Drop cover audio or drag a song')}
            audioUrl={props.coverAudioUrl}
            audioTitle={props.coverAudioTitle}
            onUpload={props.onCoverUpload}
            onClear={props.onCoverClear}
            onSongDrop={props.onCoverSongDrop}
            regionMode={isRepaint}
            regionStart={props.repaintingStart}
            regionEnd={props.repaintingEnd}
            onRegionChange={props.onRepaintingChange}
            strength={props.coverAudioUrl ? props.audioCoverStrength : undefined}
            strengthLabel={isRepaint ? 'Repaint' : 'Cover'}
            onStrengthChange={props.onAudioCoverStrengthChange}
            audioHistory={props.audioHistory}
            onHistorySelect={item => props.onHistorySelect?.(item, 'source')}
          />
        )}
        {activeTab === 'vocal' && (
          <AudioSection
            label={t('audio.vocalLabel', 'Vocal / Acapella')}
            description={t('audio.vocalDrop', 'Drop vocal audio or drag a song')}
            audioUrl={props.vocalAudioUrl}
            audioTitle={props.vocalAudioTitle}
            onUpload={props.onVocalUpload}
            onClear={props.onVocalClear}
            onSongDrop={props.onVocalSongDrop}
            strength={props.vocalAudioUrl ? props.audioCoverStrength : undefined}
            strengthLabel="Vocal"
            onStrengthChange={props.onAudioCoverStrengthChange}
            audioHistory={props.audioHistory}
            onHistorySelect={item => props.onHistorySelect?.(item, 'vocal')}
          />
        )}
        {activeTab === 'extend' && (
          <AudioSection
            label={t('audio.extendLabel', 'Extend Audio')}
            description={t('audio.extendDrop', 'Drop audio to continue generating from')}
            audioUrl={props.coverAudioUrl}
            audioTitle={props.coverAudioTitle}
            onUpload={props.onExtendUpload}
            onClear={props.onExtendClear}
            onSongDrop={props.onExtendSongDrop}
            regionMode
            regionStart={props.repaintingStart}
            regionEnd={props.repaintingEnd}
            onRegionChange={props.onRepaintingChange}
            audioHistory={props.audioHistory}
            onHistorySelect={item => props.onHistorySelect?.(item, 'source')}
          />
        )}
      </div>
    </div>
  );
}
