import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, AlignCenter } from 'lucide-react';

interface SectionControlsProps {
  sectionMode: boolean;
  onSectionModeChange: (v: boolean) => void;
  sectionMeasures: number;
  onSectionMeasuresChange: (v: number) => void;
  alignToMeasures: boolean;
  onAlignToMeasuresChange: (v: boolean) => void;
  onInsertTag?: (tag: string) => void;
}

export const SECTION_TAGS = [
  { tag: '[Intro]', color: 'text-blue-400', hex: '#60a5fa' },
  { tag: '[Verse]', color: 'text-green-400', hex: '#4ade80' },
  { tag: '[Pre-Chorus]', color: 'text-yellow-400', hex: '#facc15' },
  { tag: '[Chorus]', color: 'text-accent-400', hex: '#818cf8' },
  { tag: '[Bridge]', color: 'text-brand-400', hex: '#c084fc' },
  { tag: '[Outro]', color: 'text-orange-400', hex: '#fb923c' },
  { tag: '[Rap]', color: 'text-red-400', hex: '#f87171' },
  { tag: '[Break]', color: 'text-surface-500', hex: '#71717a' },
];

const MEASURE_OPTIONS = [4, 8, 16, 32];

export default function SectionControls({
  sectionMode, onSectionModeChange,
  sectionMeasures, onSectionMeasuresChange,
  alignToMeasures, onAlignToMeasuresChange,
  onInsertTag,
}: SectionControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      {/* Section mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-3.5 h-3.5 text-surface-500" />
          <span className="text-xs font-medium text-surface-700">
            {t('section.mode', 'Section Mode')}
          </span>
        </div>
        <button
          onClick={() => onSectionModeChange(!sectionMode)}
          className={`w-9 h-5 rounded-full transition-colors relative ${
            sectionMode ? 'bg-accent-500' : 'bg-surface-300'
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            sectionMode ? 'left-[18px]' : 'left-0.5'
          }`} />
        </button>
      </div>

      {sectionMode && (
        <>
          {/* Measures per section */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-surface-500 w-20">{t('section.measures', 'Measures')}</span>
            <div className="flex rounded-lg overflow-hidden border border-surface-300">
              {MEASURE_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => onSectionMeasuresChange(m)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    sectionMeasures === m
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Align to measures */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlignCenter className="w-3.5 h-3.5 text-surface-500" />
              <span className="text-[10px] text-surface-500">
                {t('section.align', 'Align to Measures')}
              </span>
            </div>
            <button
              onClick={() => onAlignToMeasuresChange(!alignToMeasures)}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                alignToMeasures ? 'bg-accent-500' : 'bg-surface-300'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                alignToMeasures ? 'left-[18px]' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Section tag buttons */}
          {onInsertTag && (
            <div className="flex flex-wrap gap-1">
              {SECTION_TAGS.map(({ tag, color }) => (
                <button
                  key={tag}
                  onClick={() => onInsertTag(tag)}
                  className={`px-2 py-1 rounded-md bg-surface-100 border border-surface-300 text-[10px]
                    font-medium ${color} hover:bg-surface-200 transition-colors`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
