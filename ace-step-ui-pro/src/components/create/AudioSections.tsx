import React, { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, Volume2 } from 'lucide-react';

interface AudioSectionProps {
  label: string;
  description: string;
  audioUrl: string | undefined;
  audioTitle: string | undefined;
  onUpload: (file: File) => void;
  onClear: () => void;
  onRecord?: () => void;
  strength?: number;
  onStrengthChange?: (v: number) => void;
  accept?: string;
}

function AudioSection({
  label, description, audioUrl, audioTitle,
  onUpload, onClear, onRecord, strength, onStrengthChange, accept = 'audio/*',
}: AudioSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('audio/')) onUpload(file);
  }, [onUpload]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 justify-between">
        <span className="text-xs font-medium text-surface-700">{label}</span>
        {audioTitle && (
          <button onClick={onClear} className="text-surface-400 hover:text-red-400 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {audioUrl ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-100 border border-surface-300">
          <Volume2 className="w-4 h-4 text-accent-400 shrink-0" />
          <span className="text-xs text-surface-700 truncate flex-1">{audioTitle}</span>
          <audio src={audioUrl} controls className="h-7 max-w-[160px]" />
        </div>
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

      {strength !== undefined && onStrengthChange && audioUrl && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-surface-500 w-12">Strength</span>
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
    </div>
  );
}

interface AudioSectionsProps {
  referenceAudioUrl?: string;
  referenceAudioTitle?: string;
  onReferenceUpload: (file: File) => void;
  onReferenceClear: () => void;
  referenceStrength?: number;
  onReferenceStrengthChange?: (v: number) => void;

  coverAudioUrl?: string;
  coverAudioTitle?: string;
  onCoverUpload: (file: File) => void;
  onCoverClear: () => void;
  coverStrength?: number;
  onCoverStrengthChange?: (v: number) => void;

  vocalAudioUrl?: string;
  vocalAudioTitle?: string;
  onVocalUpload: (file: File) => void;
  onVocalClear: () => void;
  vocalStrength?: number;
  onVocalStrengthChange?: (v: number) => void;

  onRecord?: () => void;
}

export default function AudioSections(props: AudioSectionsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'reference' | 'cover' | 'vocal'>('reference');

  const tabs = [
    { id: 'reference' as const, label: t('audio.reference', 'Reference'), hasFile: !!props.referenceAudioUrl },
    { id: 'cover' as const, label: t('audio.cover', 'Cover'), hasFile: !!props.coverAudioUrl },
    { id: 'vocal' as const, label: t('audio.vocal', 'Vocal'), hasFile: !!props.vocalAudioUrl },
  ];

  return (
    <div className="rounded-xl border border-surface-300 bg-surface-50 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-surface-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-accent-400 bg-surface-100'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            {tab.label}
            {tab.hasFile && (
              <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3">
        {activeTab === 'reference' && (
          <AudioSection
            label={t('audio.referenceLabel', 'Reference Audio')}
            description={t('audio.referenceDrop', 'Drop reference audio or click to upload')}
            audioUrl={props.referenceAudioUrl}
            audioTitle={props.referenceAudioTitle}
            onUpload={props.onReferenceUpload}
            onClear={props.onReferenceClear}
            strength={props.referenceStrength}
            onStrengthChange={props.onReferenceStrengthChange}
          />
        )}
        {activeTab === 'cover' && (
          <AudioSection
            label={t('audio.coverLabel', 'Cover Audio')}
            description={t('audio.coverDrop', 'Drop cover audio or click to upload')}
            audioUrl={props.coverAudioUrl}
            audioTitle={props.coverAudioTitle}
            onUpload={props.onCoverUpload}
            onClear={props.onCoverClear}
            strength={props.coverStrength}
            onStrengthChange={props.onCoverStrengthChange}
          />
        )}
        {activeTab === 'vocal' && (
          <AudioSection
            label={t('audio.vocalLabel', 'Vocal Audio')}
            description={t('audio.vocalDrop', 'Drop vocal audio or click to upload')}
            audioUrl={props.vocalAudioUrl}
            audioTitle={props.vocalAudioTitle}
            onUpload={props.onVocalUpload}
            onClear={props.onVocalClear}
            strength={props.vocalStrength}
            onStrengthChange={props.onVocalStrengthChange}
            onRecord={props.onRecord}
          />
        )}
      </div>
    </div>
  );
}
