import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dna, Zap, Music2, Sun, Waves, MicVocal, Layers } from 'lucide-react';
import SliderField from '../ui/SliderField';
import ToggleField from '../ui/ToggleField';
import CollapsibleSection from '../ui/CollapsibleSection';
import { StyleDna, buildStyleDnaTags } from '../../types';

interface StyleDnaPanelProps {
  dna: StyleDna;
  onChange: (dna: StyleDna) => void;
  isOpen: boolean;
  onToggle: () => void;
  lyrics?: string;
}

// Simple syllable counter (approximation)
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-záéíóúàèìòùüñ]/g, '');
  if (!w) return 0;
  // Spanish/English heuristic: count vowel groups
  const vowelGroups = w.match(/[aeiouyáéíóúàèìòù]+/gi);
  return vowelGroups ? vowelGroups.length : 1;
}

interface LineCadence {
  text: string;
  words: number;
  syllables: number;
  isTag: boolean;
}

function analyzeLyrics(lyrics: string): LineCadence[] {
  if (!lyrics.trim()) return [];
  return lyrics.split('\n').map(line => {
    const trimmed = line.trim();
    const isTag = /^\[.+\]$/.test(trimmed);
    if (isTag || !trimmed) return { text: trimmed, words: 0, syllables: 0, isTag: true };
    const words = trimmed.split(/\s+/).filter(Boolean);
    const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
    return { text: trimmed, words: words.length, syllables, isTag: false };
  });
}

const SLIDERS = [
  { key: 'energy' as const, icon: Zap, color: 'text-orange-400' },
  { key: 'danceability' as const, icon: Music2, color: 'text-pink-400' },
  { key: 'valence' as const, icon: Sun, color: 'text-yellow-400' },
  { key: 'acousticness' as const, icon: Waves, color: 'text-emerald-400' },
  { key: 'vocalIntensity' as const, icon: MicVocal, color: 'text-blue-400' },
  { key: 'complexity' as const, icon: Layers, color: 'text-purple-400' },
] as const;

export default function StyleDnaPanel({ dna, onChange, isOpen, onToggle, lyrics }: StyleDnaPanelProps) {
  const { t } = useTranslation();

  const tags = useMemo(() => buildStyleDnaTags(dna), [dna]);

  const cadence = useMemo(() => {
    if (!lyrics) return null;
    const lines = analyzeLyrics(lyrics);
    const textLines = lines.filter(l => !l.isTag && l.words > 0);
    if (textLines.length === 0) return null;
    const totalSyl = textLines.reduce((s, l) => s + l.syllables, 0);
    const totalWords = textLines.reduce((s, l) => s + l.words, 0);
    return {
      lines,
      textLineCount: textLines.length,
      avgSyllables: (totalSyl / textLines.length).toFixed(1),
      avgWords: (totalWords / textLines.length).toFixed(1),
      maxSyllables: Math.max(...textLines.map(l => l.syllables)),
    };
  }, [lyrics]);

  const set = <K extends keyof StyleDna>(key: K, value: StyleDna[K]) => {
    onChange({ ...dna, [key]: value });
  };

  return (
    <CollapsibleSection
      title={t('create.sections.styleDna', 'Style DNA')}
      isOpen={isOpen}
      onToggle={onToggle}
      badge={dna.enabled ? 'ON' : undefined}
    >
      <div className="space-y-3">
        {/* Master toggle */}
        <ToggleField
          label={t('create.styleDna.enable', 'Enable Style DNA')}
          value={dna.enabled}
          onChange={v => set('enabled', v)}
          tooltip="Inject style descriptors into the prompt based on slider values"
        />

        {/* Sliders — only visible when enabled */}
        {dna.enabled && (
          <>
            <div className="space-y-2">
              {SLIDERS.map(({ key, icon: Icon, color }) => (
                <div key={key} className="group">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`w-3 h-3 ${color}`} />
                    <SliderField
                      label={t(`create.styleDna.${key}`, key)}
                      value={dna[key]}
                      onChange={v => set(key, v)}
                      min={0}
                      max={100}
                      step={5}
                      tooltip={t(`create.styleDna.${key}Desc`)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Tags preview */}
            {tags && (
              <div className="rounded-lg bg-surface-100/60 border border-surface-300/40 p-2">
                <span className="text-[10px] text-surface-400 font-medium block mb-1">
                  {t('create.styleDna.preview', 'Tags Preview')}
                </span>
                <div className="flex flex-wrap gap-1">
                  {tags.split(', ').map((tag, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded-md bg-accent-500/15 text-accent-400 text-[10px] font-medium border border-accent-500/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Cadence analysis */}
            {cadence && (
              <div className="rounded-lg bg-surface-100/60 border border-surface-300/40 p-2">
                <span className="text-[10px] text-surface-400 font-medium block mb-1.5">
                  <Dna className="w-3 h-3 inline mr-1" />
                  {t('create.styleDna.cadenceTitle', 'Cadence Analysis')}
                </span>

                {/* Summary stats */}
                <div className="flex gap-3 mb-2 text-[10px]">
                  <span className="text-surface-500">
                    {cadence.textLineCount} {t('create.styleDna.linesAnalyzed', 'lines')}
                  </span>
                  <span className="text-accent-400">
                    {t('create.styleDna.avgDensity', 'Avg density')}: {cadence.avgSyllables} {t('create.styleDna.syllables', 'syl')}/line
                  </span>
                </div>

                {/* Per-line bars */}
                <div className="space-y-0.5 max-h-[120px] overflow-y-auto no-scrollbar">
                  {cadence.lines.map((line, i) => {
                    if (line.isTag) {
                      return line.text ? (
                        <div key={i} className="text-[9px] font-bold text-accent-400/70 mt-1">
                          {line.text}
                        </div>
                      ) : null;
                    }
                    const pct = cadence.maxSyllables > 0 ? (line.syllables / cadence.maxSyllables) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-1.5 group/line">
                        <div className="flex-1 h-2 bg-surface-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, var(--color-accent-500), var(--color-brand-500))`,
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-surface-400 w-6 text-right tabular-nums shrink-0">
                          {line.syllables}
                        </span>
                        <span className="text-[8px] text-surface-300 truncate max-w-[80px] opacity-0 group-hover/line:opacity-100 transition-opacity">
                          {line.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}
