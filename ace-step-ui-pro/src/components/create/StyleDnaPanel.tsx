import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dna, Zap, Music2, Sun, Waves, MicVocal, Layers, Hash } from 'lucide-react';
import SliderField from '../ui/SliderField';
import ToggleField from '../ui/ToggleField';
import CollapsibleSection from '../ui/CollapsibleSection';
import { StyleDna, buildStyleDnaTags, TagCadence, DENSITY_LABELS } from '../../types';
import { SECTION_TAGS } from './SectionControls';

interface StyleDnaPanelProps {
  dna: StyleDna;
  onChange: (dna: StyleDna) => void;
  isOpen: boolean;
  onToggle: () => void;
  lyrics?: string;
  tagCadences?: Record<string, TagCadence>;
  onTagCadencesChange?: (cadences: Record<string, TagCadence>) => void;
}

// Simple syllable counter (approximation)
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-záéíóúàèìòùüñ]/g, '');
  if (!w) return 0;
  const vowelGroups = w.match(/[aeiouyáéíóúàèìòù]+/gi);
  return vowelGroups ? vowelGroups.length : 1;
}

interface LineCadence {
  text: string;
  words: number;
  syllables: number;
  isTag: boolean;
  sectionTag?: string;
}

function analyzeLyrics(lyrics: string): LineCadence[] {
  if (!lyrics.trim()) return [];
  let currentTag = '';
  return lyrics.split('\n').map(line => {
    const trimmed = line.trim();
    const isTag = /^\[.+\]$/.test(trimmed);
    if (isTag) {
      currentTag = trimmed;
      return { text: trimmed, words: 0, syllables: 0, isTag: true, sectionTag: trimmed };
    }
    if (!trimmed) return { text: '', words: 0, syllables: 0, isTag: true };
    const words = trimmed.split(/\s+/).filter(Boolean);
    const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
    return { text: trimmed, words: words.length, syllables, isTag: false, sectionTag: currentTag || undefined };
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

const DENSITIES: TagCadence['density'][] = ['sparse', 'normal', 'dense', 'rapid'];

export default function StyleDnaPanel({
  dna, onChange, isOpen, onToggle, lyrics,
  tagCadences, onTagCadencesChange,
}: StyleDnaPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en';

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

  // Detect which section tags are actually used in lyrics
  const usedTags = useMemo(() => {
    if (!lyrics) return new Set<string>();
    const tags = new Set<string>();
    for (const line of lyrics.split('\n')) {
      const m = line.trim().match(/^\[.+\]$/);
      if (m) tags.add(m[0]);
    }
    return tags;
  }, [lyrics]);

  const set = <K extends keyof StyleDna>(key: K, value: StyleDna[K]) => {
    onChange({ ...dna, [key]: value });
  };

  const updateTagCadence = (tag: string, updates: Partial<TagCadence>) => {
    if (!tagCadences || !onTagCadencesChange) return;
    onTagCadencesChange({
      ...tagCadences,
      [tag]: { ...tagCadences[tag], tag, ...updates },
    });
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

            {/* Per-tag cadence controls */}
            {tagCadences && onTagCadencesChange && (
              <div className="rounded-lg bg-surface-100/60 border border-surface-300/40 p-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <Hash className="w-3 h-3 text-accent-400" />
                  <span className="text-[10px] text-surface-400 font-medium">
                    {t('create.styleDna.tagCadenceTitle', 'Per-Section Cadence')}
                  </span>
                </div>
                <p className="text-[9px] text-surface-400/70 mb-2">
                  {t('create.styleDna.tagCadenceDesc', 'Set target words/line and delivery density for each section')}
                </p>

                <div className="space-y-1.5">
                  {SECTION_TAGS.map(({ tag, hex }) => {
                    const cad = tagCadences[tag];
                    if (!cad) return null;
                    const inUse = usedTags.has(tag);

                    return (
                      <div
                        key={tag}
                        className={`flex items-center gap-2 py-1 px-1.5 rounded-md transition-colors ${
                          inUse ? 'bg-surface-200/50' : 'opacity-50'
                        }`}
                      >
                        {/* Tag label */}
                        <span
                          className="text-[10px] font-bold w-[72px] shrink-0 truncate"
                          style={{ color: hex }}
                        >
                          {tag}
                        </span>

                        {/* Words/line slider */}
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <input
                            type="range"
                            min={0}
                            max={16}
                            value={cad.wordsPerLine}
                            onChange={e => updateTagCadence(tag, { wordsPerLine: Number(e.target.value) })}
                            className="flex-1 h-1 accent-accent-500 min-w-[40px]"
                          />
                          <span className="text-[9px] text-surface-500 w-5 text-right tabular-nums shrink-0">
                            {cad.wordsPerLine === 0
                              ? t('create.styleDna.autoWords', 'Auto')
                              : cad.wordsPerLine}
                          </span>
                        </div>

                        {/* Density selector */}
                        <div className="flex rounded overflow-hidden border border-surface-300/60 shrink-0">
                          {DENSITIES.map(d => (
                            <button
                              key={d}
                              onClick={() => updateTagCadence(tag, { density: d })}
                              className={`px-1 py-0.5 text-[8px] font-medium transition-colors ${
                                cad.density === d
                                  ? 'bg-accent-500/25 text-accent-400'
                                  : 'text-surface-500 hover:bg-surface-200'
                              }`}
                              title={DENSITY_LABELS[d][lang]}
                            >
                              {DENSITY_LABELS[d][lang].slice(0, 3)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
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

                {/* Per-line bars — with target marker when tag cadence is set */}
                <div className="space-y-0.5 max-h-[120px] overflow-y-auto no-scrollbar">
                  {cadence.lines.map((line, i) => {
                    if (line.isTag) {
                      if (!line.text) return null;
                      const tagInfo = SECTION_TAGS.find(s => s.tag === line.text);
                      const tagCad = tagCadences?.[line.text];
                      return (
                        <div key={i} className="flex items-center gap-1.5 mt-1">
                          <span className="text-[9px] font-bold" style={{ color: tagInfo?.hex || 'var(--color-accent-400)' }}>
                            {line.text}
                          </span>
                          {tagCad && tagCad.wordsPerLine > 0 && (
                            <span className="text-[8px] text-surface-400 opacity-60">
                              ({tagCad.wordsPerLine} w/l)
                            </span>
                          )}
                        </div>
                      );
                    }
                    const pct = cadence.maxSyllables > 0 ? (line.syllables / cadence.maxSyllables) * 100 : 0;
                    // Show target marker if section has a cadence target
                    const sectionCad = line.sectionTag && tagCadences ? tagCadences[line.sectionTag] : null;
                    const targetPct = sectionCad && sectionCad.wordsPerLine > 0 && cadence.maxSyllables > 0
                      ? Math.min(100, (sectionCad.wordsPerLine * 1.5 / cadence.maxSyllables) * 100) // ~1.5 syl/word estimate
                      : null;

                    return (
                      <div key={i} className="flex items-center gap-1.5 group/line">
                        <div className="flex-1 h-2 bg-surface-200 rounded-full overflow-hidden relative">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, var(--color-accent-500), var(--color-brand-500))`,
                            }}
                          />
                          {targetPct !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-yellow-400/60"
                              style={{ left: `${targetPct}%` }}
                              title={`Target: ${sectionCad!.wordsPerLine} words`}
                            />
                          )}
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
