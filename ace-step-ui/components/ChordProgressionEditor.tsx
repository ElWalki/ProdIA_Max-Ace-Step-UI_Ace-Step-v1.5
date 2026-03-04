/**
 * ChordProgressionEditor.tsx — Visual chord progression editor with audio preview.
 *
 * Features:
 *   - Interactive chord slots (click to edit, visual highlight on playback)
 *   - Key & scale selector
 *   - Preset browser organized by mood
 *   - Live audio preview via Web Audio API
 *   - "Apply to generation" → injects into style + lyrics
 *   - Compact inline mode for chat & full panel mode
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, PointerEvent as RPointerEvent } from 'react';
import {
  Music, Play, Pause, Square, Plus, X, ChevronDown, ChevronRight,
  Zap, Shuffle, Trash2, Copy, Check, Volume2, VolumeX, GripVertical, Piano,
  ChevronLeft
} from 'lucide-react';
import {
  CHORD_PRESETS, ChordPreset, MOOD_INFO, ALL_MOODS, ProgressionMood,
  AVAILABLE_KEYS, displayKey,
  resolveProgression, resolveChord, parseRoman, ResolvedChord,
  formatForCaption, formatProgressionForGeneration,
  getChordEngine, ChordAudioEngine, ScaleType,
} from '../services/chordService';
import { useI18n } from '../context/I18nContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChordProgressionState {
  key: string;
  scale: ScaleType;
  roman: string;      // "I - V - vi - IV"
  bpm: number;
  /** Beats each chord occupies: 1 = every beat, 2 = every half-bar, 4 = full bar in 4/4 */
  beatsPerChord: number;
}

interface Props {
  /** Current progression state (controlled). */
  value: ChordProgressionState;
  /** Called when user changes the progression. */
  onChange: (state: ChordProgressionState) => void;
  /** Called when user clicks "Apply" — receives style + lyrics tags. */
  onApply?: (data: { styleTag: string; lyricsTag: string; description: string; bpmTag?: number; keyScaleTag: string }) => void;
  /** Compact mode for inline chat usage. */
  compact?: boolean;
  /** Show apply button. */
  showApply?: boolean;
  /** Optional BPM from main UI to sync preview tempo. */
  externalBpm?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALE_OPTIONS: { value: ScaleType; label: string }[] = [
  { value: 'major', label: 'chordEditor.scaleMajor' },
  { value: 'minor', label: 'chordEditor.scaleMinor' },
];

/** Split roman string into tokens. */
function splitRoman(roman: string): string[] {
  return roman.split(/\s*-\s*/).filter(t => t.trim().length > 0);
}

/** Join tokens back to string. */
function joinRoman(tokens: string[]): string {
  return tokens.join(' - ');
}

/** Common roman numerals for quick add. */
const QUICK_CHORDS_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const QUICK_CHORDS_MINOR = ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'VII'];
const QUALITY_MODS = ['', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChordProgressionEditor({ value, onChange, onApply, compact = false, showApply = true, externalBpm }: Props) {
  // Local state
  const { t } = useI18n();
  const [activeChordIdx, setActiveChordIdx] = useState(-1); // currently playing/highlighted
  const [editingIdx, setEditingIdx] = useState<number | null>(null); // chord being edited
  const [presetFilter, setPresetFilter] = useState<ProgressionMood | 'all'>('all');
  const [showPresets, setShowPresets] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const engineRef = useRef<ChordAudioEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const slotsScrollRef = useRef<HTMLDivElement>(null);

  // Derived
  const tokens = useMemo(() => splitRoman(value.roman), [value.roman]);
  const resolved = useMemo(
    () => resolveProgression(value.roman, value.key, value.scale),
    [value.roman, value.key, value.scale]
  );
  const bpm = externalBpm || value.bpm || 120;

  // Engine lifecycle
  useEffect(() => {
    engineRef.current = getChordEngine();
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  const handlePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (engine.isPlaying) {
      engine.stop();
      setActiveChordIdx(-1);
      return;
    }

    if (resolved.length === 0) return;

    engine.onBeat = (idx) => {
      setActiveChordIdx(idx);
    };
    engine.playProgression(resolved, bpm, false, value.beatsPerChord || 2);
  }, [resolved, bpm, value.beatsPerChord]);

  const handlePlaySingle = useCallback((idx: number) => {
    if (isMuted) return;
    const engine = engineRef.current;
    if (!engine || !resolved[idx]) return;
    engine.playChord(resolved[idx].notes, 0.8);
  }, [resolved, isMuted]);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
    setActiveChordIdx(-1);
  }, []);

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  const updateToken = useCallback((idx: number, newToken: string) => {
    const newTokens = [...tokens];
    newTokens[idx] = newToken;
    onChange({ ...value, roman: joinRoman(newTokens) });
    // Keep selector open so user can audition multiple options
  }, [tokens, value, onChange]);

  /** Play a single chord by roman numeral (for audition before state updates) */
  const auditionChord = useCallback((roman: string) => {
    if (isMuted) return;
    const engine = engineRef.current;
    if (!engine) return;
    const chords = resolveProgression(roman, value.key, value.scale);
    if (chords.length > 0) engine.playChord(chords[0].notes, 0.8);
  }, [isMuted, value.key, value.scale]);

  // --- Drag-and-drop reorder state ---
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback((targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newTokens = [...tokens];
    const [moved] = newTokens.splice(dragIdx, 1);
    newTokens.splice(targetIdx, 0, moved);
    onChange({ ...value, roman: joinRoman(newTokens) });
    setDragIdx(null);
    setDragOverIdx(null);
    setEditingIdx(null);
  }, [dragIdx, tokens, value, onChange]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  const addChord = useCallback((token: string) => {
    const newTokens = [...tokens, token];
    onChange({ ...value, roman: joinRoman(newTokens) });
    // Auto-scroll to end after adding
    requestAnimationFrame(() => {
      if (slotsScrollRef.current) {
        slotsScrollRef.current.scrollLeft = slotsScrollRef.current.scrollWidth;
      }
    });
  }, [tokens, value, onChange]);

  const removeChord = useCallback((idx: number) => {
    const newTokens = tokens.filter((_, i) => i !== idx);
    onChange({ ...value, roman: joinRoman(newTokens) });
    setEditingIdx(null);
  }, [tokens, value, onChange]);

  const applyPreset = useCallback((preset: ChordPreset) => {
    onChange({
      key: preset.key,
      scale: preset.scale,
      roman: preset.roman,
      bpm: value.bpm,
      beatsPerChord: value.beatsPerChord || 2,
    });
    setShowPresets(false);
    handleStop();
  }, [onChange, value.bpm, handleStop]);

  const randomize = useCallback(() => {
    const randomPreset = CHORD_PRESETS[Math.floor(Math.random() * CHORD_PRESETS.length)];
    applyPreset(randomPreset);
  }, [applyPreset]);

  const handleApply = useCallback(() => {
    if (!onApply) return;
    const data = formatProgressionForGeneration(value.roman, value.key, value.scale, value.bpm);
    onApply(data);
  }, [onApply, value]);

  const handleCopy = useCallback(() => {
    const desc = formatForCaption(resolved, value.key, value.scale);
    navigator.clipboard.writeText(desc).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [resolved, value.key, value.scale]);

  // ---------------------------------------------------------------------------
  // Filtered presets
  // ---------------------------------------------------------------------------

  const filteredPresets = useMemo(() => {
    if (presetFilter === 'all') return CHORD_PRESETS;
    return CHORD_PRESETS.filter(p => p.mood === presetFilter);
  }, [presetFilter]);

  // Quick chord options based on scale
  const quickChords = value.scale === 'major' ? QUICK_CHORDS_MAJOR : QUICK_CHORDS_MINOR;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isPlaying = engineRef.current?.isPlaying ?? false;

  return (
    <div ref={containerRef} className={`${compact ? '' : 'bg-zinc-900/80 rounded-2xl border border-zinc-700/30 overflow-hidden'}`}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/30 bg-gradient-to-r from-violet-900/20 to-purple-900/20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-600/30 flex items-center justify-center">
              <Music size={14} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white">{t('chordEditor.panelTitle')}</h3>
              <p className="text-[10px] text-zinc-500">{t('chordEditor.panelSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleCopy} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors" title={t('chordEditor.copyTooltip')}>
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors" title={isMuted ? t('chordEditor.unmuteTooltip') : t('chordEditor.muteTooltip')}>
              {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
          </div>
        </div>
      )}

      <div className={`${compact ? '' : 'p-4'} space-y-3`}>
        {/* Key / Scale / BPM selector row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Key selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500 font-medium">{t('chordEditor.keyLabel')}</span>
            <select
              value={value.key}
              onChange={(e) => { onChange({ ...value, key: e.target.value }); handleStop(); }}
              className="bg-zinc-800 text-[11px] text-white border border-zinc-700/40 rounded-lg px-2 py-1.5 outline-none focus:border-violet-500/50 cursor-pointer"
            >
              {AVAILABLE_KEYS.map(k => (
                <option key={k} value={k}>{displayKey(k)}</option>
              ))}
            </select>
          </div>

          {/* Scale selector */}
          <div className="flex items-center bg-zinc-800 rounded-lg border border-zinc-700/30 overflow-hidden">
            {SCALE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange({ ...value, scale: opt.value }); handleStop(); }}
                className={`px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                  value.scale === opt.value
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {opt.value === 'major' ? t('chordEditor.scaleMajor') : t('chordEditor.scaleMinor')}
              </button>
            ))}
          </div>

          {/* BPM (only in full mode) */}
          {!compact && !externalBpm && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-500 font-medium">{t('chordEditor.bpmLabel')}</span>
              <input
                type="number"
                min={40}
                max={240}
                value={value.bpm || ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onChange({ ...value, bpm: 0 });
                    return;
                  }
                  const num = parseInt(raw);
                  if (!isNaN(num)) {
                    onChange({ ...value, bpm: Math.max(40, Math.min(240, num)) });
                  }
                }}
                onBlur={() => {
                  if (!value.bpm || value.bpm < 40) onChange({ ...value, bpm: 120 });
                }}
                className="w-14 bg-zinc-800 text-[11px] text-white border border-zinc-700/40 rounded-lg px-2 py-1.5 outline-none focus:border-violet-500/50 text-center"
              />
            </div>
          )}

          {/* Spacer + quick actions */}
          <div className="flex-1" />
          <button
            onClick={randomize}
            className="p-1.5 text-zinc-500 hover:text-violet-400 rounded-lg hover:bg-zinc-800/80 transition-colors"
            title={t('chordEditor.randomizeTooltip')}
          >
            <Shuffle size={13} />
          </button>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded-lg transition-colors border ${
              showPresets
                ? 'bg-violet-600/20 text-violet-400 border-violet-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-white border-zinc-700/30'
            }`}
          >
            {showPresets ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {t('chordEditor.presetsButton')}
          </button>
        </div>

        {/* Chord slots — horizontal scroll container */}
        <div className="relative group/slots">
          {/* Left scroll arrow */}
          {tokens.length > 6 && (
            <button
              onClick={() => {
                if (slotsScrollRef.current) slotsScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
              }}
              className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-zinc-900 to-transparent z-10 flex items-center justify-start opacity-0 group-hover/slots:opacity-100 transition-opacity"
            >
              <ChevronLeft size={14} className="text-zinc-400" />
            </button>
          )}
          {/* Right scroll arrow */}
          {tokens.length > 6 && (
            <button
              onClick={() => {
                if (slotsScrollRef.current) slotsScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
              }}
              className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent z-10 flex items-center justify-end opacity-0 group-hover/slots:opacity-100 transition-opacity"
            >
              <ChevronRight size={14} className="text-zinc-400" />
            </button>
          )}

          <div
            ref={slotsScrollRef}
            className="flex items-stretch gap-1.5 min-h-[72px] overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent scroll-smooth"
          >
            {tokens.map((token, idx) => {
              const chord = resolved[idx];
              const isActive = activeChordIdx === idx;
              const isEditing = editingIdx === idx;
              const isDragging = dragIdx === idx;
              const isDragOver = dragOverIdx === idx && dragIdx !== idx;

              return (
                <div
                  key={`${idx}-${token}`}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={`relative flex-shrink-0 w-[60px] rounded-xl border-2 transition-all duration-200 cursor-pointer select-none
                    ${isDragging ? 'opacity-40 scale-95' : ''}
                    ${isDragOver ? 'border-violet-400 border-dashed bg-violet-600/10' : ''}
                    ${!isDragging && !isDragOver && isActive
                      ? 'border-violet-400 bg-violet-600/20 shadow-lg shadow-violet-500/20 scale-105'
                      : !isDragging && !isDragOver && isEditing
                        ? 'border-purple-400 bg-purple-600/10'
                        : !isDragging && !isDragOver
                          ? 'border-zinc-700/40 bg-zinc-800/60 hover:border-zinc-600 hover:bg-zinc-800'
                          : ''
                    }
                  `}
                  onClick={() => {
                    handlePlaySingle(idx);
                    if (!isEditing) setEditingIdx(idx);
                  }}
                >
                  {/* Drag handle */}
                  <div className="absolute top-0.5 left-1/2 -translate-x-1/2 text-zinc-600 opacity-0 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                    <GripVertical size={10} />
                  </div>

                  {/* Delete button */}
                  {isEditing && tokens.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeChord(idx); }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center z-10 hover:bg-red-500"
                    >
                      <X size={8} className="text-white" />
                    </button>
                  )}

                  <div className="flex flex-col items-center justify-center h-full py-2 px-1">
                    {/* Roman numeral */}
                    <span className={`text-[13px] font-bold ${isActive ? 'text-violet-300' : 'text-white'}`}>
                      {token}
                    </span>
                    {/* Resolved chord name */}
                    {chord && (
                      <span className={`text-[9px] mt-0.5 ${isActive ? 'text-violet-400' : 'text-zinc-500'}`}>
                        {chord.name}
                      </span>
                    )}
                    {/* Degree indicator dots */}
                    <div className="flex gap-[2px] mt-1">
                      {(chord?.notes || []).slice(0, 4).map((_, ni) => (
                        <div
                          key={ni}
                          className={`w-1 h-1 rounded-full ${isActive ? 'bg-violet-400' : 'bg-zinc-600'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add chord button */}
            {tokens.length < 32 && (
              <button
                onClick={() => {
                  const defaultChord = value.scale === 'major' ? 'I' : 'i';
                  addChord(defaultChord);
                }}
                className="flex-shrink-0 w-[44px] rounded-xl border-2 border-dashed border-zinc-700/40 bg-zinc-800/30 hover:border-violet-500/40 hover:bg-violet-600/5 flex items-center justify-center transition-colors"
                title={t('chordEditor.addChordTooltip')}
              >
                <Plus size={16} className="text-zinc-600" />
              </button>
            )}
          </div>

          {/* Chord count indicator */}
          {tokens.length > 6 && (
            <div className="text-center mt-0.5">
              <span className="text-[8px] text-zinc-600">{tokens.length} acordes · arrastra para desplazar →</span>
            </div>
          )}
        </div>

        {/* Chord editor panel (when a slot is selected) */}
        {editingIdx !== null && editingIdx < tokens.length && (
          <div className="p-2.5 bg-zinc-800/50 rounded-xl border border-zinc-700/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 font-medium">
                Slot {editingIdx + 1} — Selecciona acorde:
              </span>
              <button onClick={() => setEditingIdx(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={12} />
              </button>
            </div>
            {/* Quick chord buttons — audition: plays the chord immediately, keeps selector open */}
            <div className="flex flex-wrap gap-1">
              {quickChords.map(qc => (
                <button
                  key={qc}
                  onClick={() => { updateToken(editingIdx, qc); auditionChord(qc); }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                    tokens[editingIdx] === qc
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  {qc}
                </button>
              ))}
            </div>
            {/* Quality modifiers — audition mode */}
            <div className="flex flex-wrap gap-1">
              {QUALITY_MODS.filter(m => m !== '').map(mod => {
                const base = tokens[editingIdx].replace(/[0-9a-z°+]+$/i, '');
                const combined = base + mod;
                return (
                  <button
                    key={mod}
                    onClick={() => { updateToken(editingIdx, combined); auditionChord(combined); }}
                    className={`px-1.5 py-0.5 text-[9px] font-mono rounded transition-colors ${
                      tokens[editingIdx] === combined
                        ? 'bg-purple-600/40 text-purple-300 border border-purple-500/30'
                        : 'bg-zinc-700/60 text-zinc-400 hover:text-white hover:bg-zinc-600'
                    }`}
                  >
                    +{mod}
                  </button>
                );
              })}
            </div>
            {/* Manual input */}
            <input
              type="text"
              value={tokens[editingIdx]}
              onChange={(e) => {
                const newTokens = [...tokens];
                newTokens[editingIdx] = e.target.value;
                onChange({ ...value, roman: joinRoman(newTokens) });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingIdx(null); }}
              className="w-full bg-zinc-900 text-[11px] text-white border border-zinc-700/40 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-500/50 font-mono"
              placeholder="Ej: IV, vi7, IImaj7..."
            />
          </div>
        )}

        {/* Playback controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePlay}
            disabled={resolved.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
              isPlaying
                ? 'bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30'
                : 'bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30'
            }`}
          >
            {isPlaying ? <Square size={11} /> : <Play size={11} />}
            {isPlaying ? t('chordEditor.stopButton') : t('chordEditor.playButton')}
          </button>

          {/* Beats per chord — musical bar notation */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-500 font-medium">{t('chordEditor.barLabel')}</span>
            <div className="flex items-center bg-zinc-800 rounded-lg border border-zinc-700/30 overflow-hidden">
              {([1, 2, 4] as const).map(beats => {
                const label = `${beats}/4`;
                const desc = beats === 1 ? t('chordEditor.beatFast') : beats === 2 ? t('chordEditor.beatNormal') : t('chordEditor.beatSlow');
                return (
                  <button
                    key={beats}
                    onClick={() => {
                      onChange({ ...value, beatsPerChord: beats });
                      // If playing, restart with new rhythm
                      if (isPlaying) {
                        const engine = engineRef.current;
                        if (engine) {
                          engine.stop();
                          setActiveChordIdx(-1);
                          setTimeout(() => {
                            engine.onBeat = (idx) => setActiveChordIdx(idx);
                            engine.playProgression(resolved, bpm, false, beats);
                          }, 50);
                        }
                      }
                    }}
                    className={`px-2 py-1 text-[9px] font-bold transition-colors ${
                      (value.beatsPerChord || 2) === beats
                        ? 'bg-violet-600 text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title={`${beats} beat${beats > 1 ? 's' : ''} por acorde (${desc})`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progression text summary */}
          <div className="flex-1 text-[10px] text-zinc-500 font-mono truncate min-w-0">
            {value.key} {value.scale === 'major' ? 'Mayor' : 'Menor'}: {resolved.map(c => c.name).join(' → ')}
          </div>

          {/* Apply button */}
          {showApply && onApply && (
            <button
              onClick={handleApply}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg transition-colors"
            >
              <Zap size={11} />
              {t('chordEditor.applyButton')}
            </button>
          )}
        </div>

        {/* Preset browser */}
        {showPresets && (
          <div className="space-y-2 pt-1">
            {/* Mood filter tabs */}
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setPresetFilter('all')}
                className={`px-2 py-1 text-[9px] font-medium rounded-md transition-colors ${
                  presetFilter === 'all' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t('chordEditor.allPresetsFilter')}
              </button>
              {ALL_MOODS.map(mood => (
                <button
                  key={mood}
                  onClick={() => setPresetFilter(mood)}
                  className={`px-2 py-1 text-[9px] font-medium rounded-md transition-colors ${
                    presetFilter === mood
                      ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {MOOD_INFO[mood].emoji} {MOOD_INFO[mood].label}
                </button>
              ))}
            </div>

            {/* Preset list */}
            <div className="max-h-[200px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
              {filteredPresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg border border-zinc-700/20 hover:border-zinc-600 transition-colors text-left group"
                >
                  <span className="text-[14px] flex-shrink-0">{preset.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-white">{preset.name}</span>
                      <span className="text-[9px] text-zinc-600 font-mono">{preset.key}{preset.scale === 'minor' ? 'm' : ''}</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 truncate">{preset.roman}</p>
                    <p className="text-[9px] text-zinc-600 truncate">{preset.description}</p>
                  </div>
                  <Play size={10} className="text-zinc-600 group-hover:text-violet-400 flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chord Modal — opened from Sidebar, full-featured standalone editor
// ---------------------------------------------------------------------------

const CHORD_STORAGE_KEY = 'chord-standalone-state';

const DEFAULT_CHORD_STATE: ChordProgressionState = {
  key: 'C',
  scale: 'major',
  roman: 'I - V - vi - IV',
  bpm: 120,
  beatsPerChord: 2,
};

export interface ChordModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called when "Aplicar" is clicked. Receives text tags (style, lyrics, bpm, keyScale)
   * AND a rendered WAV Blob of the progression for automatic reference audio injection.
   */
  onApplyFull?: (data: {
    styleTag: string;
    lyricsTag: string;
    description: string;
    bpmTag?: number;
    keyScaleTag: string;
    referenceBlob: Blob;
    referenceTitle: string;
  }) => Promise<void>;
  /** Current project BPM from CreatePanel (for sync) */
  projectBpm?: number;
}

export function ChordModal({ isOpen, onClose, onApplyFull, projectBpm }: ChordModalProps) {
  const { t } = useI18n();
  const [chordState, setChordState] = useState<ChordProgressionState>(() => {
    try {
      const stored = localStorage.getItem(CHORD_STORAGE_KEY);
      return stored ? { ...DEFAULT_CHORD_STATE, ...JSON.parse(stored) } : DEFAULT_CHORD_STATE;
    } catch { return DEFAULT_CHORD_STATE; }
  });
  const [isApplying, setIsApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const [useAutoReference, setUseAutoReference] = useState<boolean>(() => {
    try { return localStorage.getItem('chord-auto-ref') !== 'false'; } catch { return true; }
  });
  // Track reference strength
  const [refStrength, setRefStrength] = useState<number>(() => {
    try {
      const v = localStorage.getItem('chord-ref-strength');
      return v ? parseFloat(v) : 0.5;
    } catch { return 0.5; }
  });

  // Resizable modal dimensions
  const MIN_W = 440;
  const MIN_H = 380;
  const MAX_W = typeof window !== 'undefined' ? window.innerWidth * 0.95 : 1400;
  const MAX_H = typeof window !== 'undefined' ? window.innerHeight * 0.92 : 900;

  const [modalSize, setModalSize] = useState<{ w: number; h: number }>(() => {
    try {
      const stored = localStorage.getItem('chord-modal-size');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { w: Math.max(MIN_W, parsed.w || 520), h: Math.max(MIN_H, parsed.h || 500) };
      }
    } catch {}
    return { w: 560, h: 520 };
  });

  const resizeRef = useRef<{
    edge: 'left' | 'right' | 'bottom' | 'top' | 'bl' | 'br' | 'tl' | 'tr' | null;
    startX: number; startY: number; startW: number; startH: number;
  } | null>(null);

  // Persist modal size
  useEffect(() => {
    localStorage.setItem('chord-modal-size', JSON.stringify(modalSize));
  }, [modalSize]);

  // Resize pointer handlers
  const handleResizeStart = useCallback((
    e: RPointerEvent<HTMLDivElement>,
    edge: 'left' | 'right' | 'bottom' | 'top' | 'bl' | 'br' | 'tl' | 'tr'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: modalSize.w,
      startH: modalSize.h,
    };
  }, [modalSize]);

  const handleResizeMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const { edge, startX, startY, startW, startH } = resizeRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newW = startW;
    let newH = startH;

    if (edge === 'right' || edge === 'br' || edge === 'tr') newW = startW + dx;
    if (edge === 'left' || edge === 'bl' || edge === 'tl') newW = startW - dx;
    if (edge === 'bottom' || edge === 'bl' || edge === 'br') newH = startH + dy;
    if (edge === 'top' || edge === 'tl' || edge === 'tr') newH = startH - dy;

    setModalSize({
      w: Math.max(MIN_W, Math.min(MAX_W, newW)),
      h: Math.max(MIN_H, Math.min(MAX_H, newH)),
    });
  }, [MAX_W, MAX_H]);

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
  }, []);

  // Persist chord state
  useEffect(() => {
    localStorage.setItem(CHORD_STORAGE_KEY, JSON.stringify(chordState));
  }, [chordState]);

  // Persist auto-reference toggle
  useEffect(() => {
    localStorage.setItem('chord-auto-ref', String(useAutoReference));
  }, [useAutoReference]);

  // Persist ref strength
  useEffect(() => {
    localStorage.setItem('chord-ref-strength', String(refStrength));
  }, [refStrength]);

  // Sync BPM from project when opening
  useEffect(() => {
    if (isOpen && projectBpm && projectBpm > 0) {
      setChordState(prev => ({ ...prev, bpm: projectBpm }));
    }
  }, [isOpen, projectBpm]);

  /**
   * MAIN APPLY — text injection + automatic WAV render + reference upload.
   * All in one click. User doesn't need to do anything extra.
   */
  const handleFullApply = useCallback(async (textData: {
    styleTag: string; lyricsTag: string; description: string;
    bpmTag?: number; keyScaleTag: string;
  }) => {
    if (!onApplyFull) return;
    setIsApplying(true);
    setApplyStatus(t('chordEditor.statusRendering'));

    try {
      const chords = resolveProgression(chordState.roman, chordState.key, chordState.scale);
      if (chords.length === 0) {
        setApplyStatus(t('chordEditor.statusNoChords'));
        setTimeout(() => setApplyStatus(null), 2000);
        setIsApplying(false);
        return;
      }

      // Render WAV (always, even if user has autoRef off — let the callback decide)
      const engine = getChordEngine();
      const bpc = chordState.beatsPerChord || 2;
      const blob = await engine.renderToBlob(chords, chordState.bpm || 120, 2, bpc);
      const scaleLabel = chordState.scale === 'major' ? 'Mayor' : 'Menor';
      const barLabel = `${bpc}x4`;
      const title = `Chords_${chordState.key}_${scaleLabel}_${chordState.bpm || 120}bpm_${barLabel}`;

      setApplyStatus(t('chordEditor.statusApplying'));
      await onApplyFull({
        ...textData,
        referenceBlob: blob,
        referenceTitle: title,
      });

      setApplyStatus(t('chordEditor.statusApplied'));
      setTimeout(() => setApplyStatus(null), 3000);
    } catch (err: any) {
      setApplyStatus(`❌ Error: ${err?.message || 'fallo'}`);
      setTimeout(() => setApplyStatus(null), 4000);
    } finally {
      setIsApplying(false);
    }
  }, [onApplyFull, chordState, t]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — resizable */}
      <div
        className="relative bg-zinc-900 rounded-2xl border border-zinc-700/40 shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200"
        style={{ width: modalSize.w, height: modalSize.h, maxWidth: '95vw', maxHeight: '92vh' }}
      >
        {/* Resize handles */}
        {/* Left edge */}
        <div
          className="absolute left-0 top-4 bottom-4 w-1.5 cursor-col-resize z-20 hover:bg-violet-500/30 active:bg-violet-500/50 rounded-r transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'left')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        {/* Right edge */}
        <div
          className="absolute right-0 top-4 bottom-4 w-1.5 cursor-col-resize z-20 hover:bg-violet-500/30 active:bg-violet-500/50 rounded-l transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'right')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        {/* Bottom edge */}
        <div
          className="absolute bottom-0 left-4 right-4 h-1.5 cursor-row-resize z-20 hover:bg-violet-500/30 active:bg-violet-500/50 rounded-t transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'bottom')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        {/* Top edge */}
        <div
          className="absolute top-0 left-4 right-4 h-1.5 cursor-row-resize z-20 hover:bg-violet-500/30 active:bg-violet-500/50 rounded-b transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'top')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        {/* Corner handles */}
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-30 hover:bg-violet-500/40 active:bg-violet-500/60 rounded-tl transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'br')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        <div
          className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-30 hover:bg-violet-500/40 active:bg-violet-500/60 rounded-tr transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'bl')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        <div
          className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-30 hover:bg-violet-500/40 active:bg-violet-500/60 rounded-bl transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'tr')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        <div
          className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-30 hover:bg-violet-500/40 active:bg-violet-500/60 rounded-br transition-colors"
          onPointerDown={(e) => handleResizeStart(e, 'tl')}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-700/30 bg-gradient-to-r from-violet-900/25 to-purple-900/15 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600/30 flex items-center justify-center">
              <Piano size={16} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white">{t('chordEditor.modalTitle')}</h2>
              <p className="text-[10px] text-zinc-500">
                {t('chordEditor.modalSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-zinc-600 mr-1">{modalSize.w}×{modalSize.h}</span>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
          <ChordProgressionEditor
            value={chordState}
            onChange={setChordState}
            onApply={handleFullApply}
            showApply={!!onApplyFull}
          />
        </div>

        {/* Footer — Auto-reference controls + status */}
        <div className="border-t border-zinc-700/30 px-5 py-3 bg-zinc-900/90 flex-shrink-0 space-y-2">
          {/* Auto-reference toggle row */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useAutoReference}
                onChange={(e) => setUseAutoReference(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-violet-600 focus:ring-violet-500/30 cursor-pointer"
              />
              <span className="text-[10px] text-zinc-400 font-medium">
                {t('chordEditor.autoReferenceToggle')}
              </span>
            </label>

            {useAutoReference && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[9px] text-zinc-500">{t('chordEditor.refStrengthLabel')}</span>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={refStrength}
                  onChange={(e) => setRefStrength(parseFloat(e.target.value))}
                  className="w-20 h-1 accent-violet-500"
                />
                <span className="text-[9px] text-zinc-400 font-mono w-6 text-right">{Math.round(refStrength * 100)}%</span>
              </div>
            )}
          </div>

          {/* Status + info */}
          <div className="flex items-center gap-2">
            {applyStatus && (
              <span className={`text-[10px] font-medium animate-in fade-in duration-200 ${
                applyStatus.startsWith('✅') ? 'text-green-400' :
                applyStatus.startsWith('❌') ? 'text-red-400' :
                applyStatus.startsWith('⚠️') ? 'text-amber-400' :
                'text-zinc-400'
              }`}>
                {isApplying && !applyStatus.startsWith('✅') && !applyStatus.startsWith('❌') && (
                  <span className="inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />
                )}
                {applyStatus}
              </span>
            )}
            <div className="flex-1" />
            <span className="text-[9px] text-zinc-600 max-w-[220px] text-right leading-tight">
              {useAutoReference
                ? 'Al "Aplicar": inyecta tags + renderiza WAV como audio de referencia para que el modelo siga tu progresión'
                : 'Al "Aplicar": solo inyecta tags de texto en estilo y letra'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact inline version for chat messages
// ---------------------------------------------------------------------------

interface InlineChordProps {
  roman: string;
  keyName: string;
  scale: ScaleType;
  onApply?: (data: { styleTag: string; lyricsTag: string; description: string; bpmTag?: number; keyScaleTag: string }) => void;
}

export function InlineChordPreview({ roman, keyName, scale, onApply }: InlineChordProps) {
  const { t } = useI18n();
  const [activeIdx, setActiveIdx] = useState(-1);
  const engineRef = useRef<ChordAudioEngine | null>(null);

  const resolved = useMemo(
    () => resolveProgression(roman, keyName, scale),
    [roman, keyName, scale]
  );

  useEffect(() => {
    engineRef.current = getChordEngine();
    return () => { engineRef.current?.stop(); };
  }, []);

  const handlePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPlaying) {
      engine.stop();
      setActiveIdx(-1);
      return;
    }
    engine.onBeat = setActiveIdx;
    engine.playProgression(resolved, 120, false);
  };

  const handleApply = () => {
    if (!onApply) return;
    onApply(formatProgressionForGeneration(roman, keyName, scale));
  };

  const isPlaying = engineRef.current?.isPlaying ?? false;

  return (
    <div className="mt-2 p-2.5 bg-violet-900/15 rounded-xl border border-violet-500/20">
      <div className="flex items-center gap-1.5 mb-2">
        <Music size={11} className="text-violet-400" />
        <span className="text-[10px] font-semibold text-violet-400">
          Progresión: {keyName} {scale === 'major' ? 'Mayor' : 'Menor'}
        </span>
      </div>

      {/* Compact chord row */}
      <div className="flex gap-1 mb-2">
        {resolved.map((chord, i) => (
          <div
            key={i}
            className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
              activeIdx === i
                ? 'bg-violet-600/30 border border-violet-400 scale-105'
                : 'bg-zinc-800/60 border border-zinc-700/30'
            }`}
          >
            <span className={`text-[11px] font-bold ${activeIdx === i ? 'text-violet-300' : 'text-white'}`}>
              {chord.name}
            </span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-1.5">
        <button
          onClick={handlePlay}
          className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
            isPlaying
              ? 'bg-red-600/20 text-red-400 border border-red-500/20'
              : 'bg-violet-600/20 text-violet-400 border border-violet-500/20 hover:bg-violet-600/30'
          }`}
        >
          {isPlaying ? <Square size={9} /> : <Play size={9} />}
          {isPlaying ? t('chordEditor.inlineStopButton') : t('chordEditor.inlinePlayButton')}
        </button>
        {onApply && (
          <button
            onClick={handleApply}
            className="flex-1 py-1.5 text-[10px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors flex items-center justify-center gap-1"
          >
            <Zap size={9} />
            {t('chordEditor.inlineApplyButton')}
          </button>
        )}
      </div>
    </div>
  );
}
