import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Play, Square, Plus, Sparkles, ChevronDown, ChevronUp, Trash2, Piano, X } from 'lucide-react';
import type { ChordProgressionState, ScaleType, ProgressionMood } from '../../types';
import {
  resolveProgression, resolveChord, parseRoman, CHORD_PRESETS, AVAILABLE_KEYS,
  ChordAudioEngine, formatProgressionForGeneration,
} from '../../services/chordService';
import PianoRollModal from './PianoRollModal';

interface ChordEditorProps {
  value: ChordProgressionState;
  onChange: (state: ChordProgressionState) => void;
  onApply?: (data: { styleTag: string; lyricsTag: string; keyScaleTag: string }) => void;
}

interface PlacedChord {
  id: string;
  roman: string;
  octaveShift: number;
}

const QUICK_CHORDS_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const QUICK_CHORDS_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

const MOOD_LABELS: Record<ProgressionMood, { label: string; emoji: string }> = {
  romantic: { label: 'Romantic', emoji: '💕' },
  dark: { label: 'Dark', emoji: '🌑' },
  upbeat: { label: 'Upbeat', emoji: '⚡' },
  jazz: { label: 'Jazz', emoji: '🎷' },
  latin: { label: 'Latin', emoji: '🔥' },
  lofi: { label: 'Lo-Fi', emoji: '☕' },
  epic: { label: 'Epic', emoji: '🎬' },
  folk: { label: 'Folk', emoji: '🪕' },
};

let _pcId = 0;
const uid = () => `pc-${++_pcId}-${Date.now()}`;

export default function ChordEditor({ value, onChange, onApply }: ChordEditorProps) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [presetMood, setPresetMood] = useState<ProgressionMood>('romantic');
  const [formatMode, setFormatMode] = useState<'roman' | 'letter'>('roman');
  const [showPianoRoll, setShowPianoRoll] = useState(false);

  // DnD state
  const [placedChords, setPlacedChords] = useState<PlacedChord[]>([]);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<'palette' | 'timeline' | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [deleteHover, setDeleteHover] = useState(false);

  const lastSyncedRoman = useRef<string>('');
  const engineRef = useRef<ChordAudioEngine | null>(null);

  useEffect(() => {
    return () => { engineRef.current?.dispose(); };
  }, []);

  const getEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new ChordAudioEngine();
    return engineRef.current;
  }, []);

  // Sync parent → internal (presets, manual input, external changes)
  useEffect(() => {
    if (value.roman !== lastSyncedRoman.current) {
      const slots = value.roman.split(/\s*-\s*/).filter(Boolean);
      setPlacedChords(slots.map(r => ({ id: uid(), roman: r.trim(), octaveShift: 0 })));
      lastSyncedRoman.current = value.roman;
    }
  }, [value.roman]);

  // Sync internal → parent
  const syncToParent = useCallback((chords: PlacedChord[]) => {
    const roman = chords.map(c => c.roman).join(' - ');
    lastSyncedRoman.current = roman;
    onChange({ ...value, roman });
  }, [value, onChange]);

  const resolved = useMemo(
    () => resolveProgression(value.roman, value.key, value.scale),
    [value.roman, value.key, value.scale],
  );

  // Resolve with per-chord octave shifts for preview
  const resolvedPlaced = useMemo(() =>
    placedChords.map(pc => {
      const token = parseRoman(pc.roman);
      const chord = resolveChord(token, value.key, value.scale);
      if (pc.octaveShift !== 0) {
        return {
          ...chord,
          notes: chord.notes.map(n => n + pc.octaveShift * 12),
          rootMidi: chord.rootMidi + pc.octaveShift * 12,
        };
      }
      return chord;
    }),
    [placedChords, value.key, value.scale],
  );

  const quickChords = value.scale === 'minor' ? QUICK_CHORDS_MINOR : QUICK_CHORDS_MAJOR;

  // ── Chord operations ─────────────────────────────────────────────
  const insertChordAt = useCallback((index: number, roman: string) => {
    const updated = [...placedChords];
    updated.splice(index, 0, { id: uid(), roman, octaveShift: 0 });
    setPlacedChords(updated);
    syncToParent(updated);
  }, [placedChords, syncToParent]);

  const addChord = useCallback((roman: string) => {
    insertChordAt(placedChords.length, roman);
  }, [insertChordAt, placedChords.length]);

  const removeChord = useCallback((index: number) => {
    const updated = placedChords.filter((_, i) => i !== index);
    setPlacedChords(updated);
    syncToParent(updated);
  }, [placedChords, syncToParent]);

  const moveChord = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const updated = [...placedChords];
    const [moved] = updated.splice(fromIdx, 1);
    const dest = toIdx > fromIdx ? toIdx - 1 : toIdx;
    updated.splice(dest, 0, moved);
    setPlacedChords(updated);
    syncToParent(updated);
  }, [placedChords, syncToParent]);

  const setOctaveShift = useCallback((index: number, shift: number) => {
    setPlacedChords(prev => prev.map((pc, i) =>
      i === index ? { ...pc, octaveShift: Math.max(-2, Math.min(2, shift)) } : pc,
    ));
  }, []);

  // ── Audio handlers ────────────────────────────────────────────────
  const handlePreviewChord = useCallback((notes: number[]) => {
    getEngine().playChord(notes, 0.5);
  }, [getEngine]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) { getEngine().stop(); setIsPlaying(false); return; }
    if (resolvedPlaced.length === 0) return;
    setIsPlaying(true);
    const beatDur = 60 / value.bpm;
    for (const chord of resolvedPlaced) {
      getEngine().playChord(chord.notes, beatDur * value.beatsPerChord * 0.9);
      await new Promise(r => setTimeout(r, beatDur * value.beatsPerChord * 1000));
    }
    setIsPlaying(false);
  }, [isPlaying, resolvedPlaced, value.bpm, value.beatsPerChord, getEngine]);

  const handleApply = useCallback(() => {
    const data = formatProgressionForGeneration(value.roman, value.key, value.scale);
    onApply?.(data);
  }, [value, onApply]);

  const handlePresetSelect = useCallback((preset: typeof CHORD_PRESETS[0]) => {
    onChange({
      key: preset.key,
      scale: preset.scale,
      roman: preset.roman,
      bpm: value.bpm,
      beatsPerChord: value.beatsPerChord,
    });
    setShowPresets(false);
  }, [onChange, value.bpm, value.beatsPerChord]);

  const handlePianoRollAdd = useCallback((_notes: number[], label: string) => {
    addChord(label);
  }, [addChord]);

  // ── DnD handlers ─────────────────────────────────────────────────
  const onPaletteDragStart = useCallback((e: React.DragEvent, chord: string) => {
    e.dataTransfer.setData('text/chord-palette', chord);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingFrom('palette');
  }, []);

  const onTimelineDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/chord-index', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingFrom('timeline');
    setDraggingIndex(index);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingFrom(null);
    setDraggingIndex(null);
    setDropIndex(null);
    setDeleteHover(false);
  }, []);

  const onDropZoneOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingFrom === 'palette' ? 'copy' : 'move';
    setDropIndex(idx);
  }, [draggingFrom]);

  const onDropZoneLeave = useCallback(() => { setDropIndex(null); }, []);

  const onDropZoneDrop = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const fromPalette = e.dataTransfer.getData('text/chord-palette');
    if (fromPalette) insertChordAt(idx, fromPalette);
    const reIdx = e.dataTransfer.getData('text/chord-index');
    if (reIdx !== '') moveChord(parseInt(reIdx, 10), idx);
    setDropIndex(null);
    setDraggingFrom(null);
    setDraggingIndex(null);
  }, [insertChordAt, moveChord]);

  const onDeleteOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDeleteHover(true);
  }, []);

  const onDeleteDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const idx = e.dataTransfer.getData('text/chord-index');
    if (idx !== '') removeChord(parseInt(idx, 10));
    setDeleteHover(false);
    setDraggingFrom(null);
    setDraggingIndex(null);
  }, [removeChord]);

  // ── Render helpers ────────────────────────────────────────────────
  const renderDropZone = (idx: number) => (
    <div
      key={`dz-${idx}`}
      onDragOver={e => onDropZoneOver(e, idx)}
      onDragLeave={onDropZoneLeave}
      onDrop={e => onDropZoneDrop(e, idx)}
      className={`w-1.5 self-stretch rounded-full transition-all shrink-0
        ${dropIndex === idx
          ? 'bg-accent-500 shadow-[0_0_8px_theme(colors.accent.500/50)]'
          : 'bg-transparent'
        }`}
    />
  );

  return (
    <div className="space-y-3">
      {/* ── Key / Scale / Format ────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={value.key}
          onChange={e => onChange({ ...value, key: e.target.value })}
          className="bg-surface-100 border border-surface-300 rounded-lg px-2 py-1.5 text-xs text-surface-900 w-16"
        >
          {AVAILABLE_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <div className="flex rounded-lg overflow-hidden border border-surface-300">
          {(['major', 'minor'] as ScaleType[]).map(s => (
            <button
              key={s}
              onClick={() => onChange({ ...value, scale: s })}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                value.scale === s ? 'bg-accent-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
              }`}
            >
              {s === 'major' ? t('chords.major', 'Major') : t('chords.minor', 'Minor')}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-surface-300 ml-auto">
          <button
            onClick={() => setFormatMode('roman')}
            className={`px-2 py-1.5 text-xs font-medium transition-colors ${
              formatMode === 'roman' ? 'bg-accent-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
            }`}
            title="Roman numerals"
          >I-IV-V</button>
          <button
            onClick={() => setFormatMode('letter')}
            className={`px-2 py-1.5 text-xs font-medium transition-colors ${
              formatMode === 'letter' ? 'bg-accent-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
            }`}
            title="Letter names"
          >C-Am-G</button>
        </div>
      </div>

      {/* ── Chord Palette (drag source) ────────── */}
      <div className="rounded-xl border border-surface-300 bg-surface-50 p-2 space-y-1.5">
        <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
          {t('chords.palette', 'Chord Palette')}
        </span>
        <div className="flex flex-wrap gap-1">
          {quickChords.map(c => {
            const token = parseRoman(c);
            const rc = resolveChord(token, value.key, value.scale);
            return (
              <button
                key={c}
                draggable
                onDragStart={e => onPaletteDragStart(e, c)}
                onDragEnd={onDragEnd}
                onClick={() => handlePreviewChord(rc.notes)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-100 border border-surface-300 text-xs
                  text-surface-700 hover:bg-accent-500/10 hover:text-accent-400 hover:border-accent-500/30
                  active:scale-95 transition-all cursor-grab active:cursor-grabbing select-none"
                title={`${c} (${rc.name}) — click to preview, drag to place`}
              >
                <span className="font-bold">{c}</span>
                <span className="ml-1 text-[10px] text-surface-400">{rc.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {['7', 'maj7', 'sus2', 'sus4'].map(q => (
            <button
              key={q}
              onClick={() => {
                if (placedChords.length > 0) {
                  const updated = [...placedChords];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = { ...last, roman: last.roman + q };
                  setPlacedChords(updated);
                  syncToParent(updated);
                }
              }}
              className="px-2 py-1 rounded-md bg-surface-150 text-[10px] text-surface-500
                hover:bg-brand-500/10 hover:text-brand-400 transition-colors"
            >
              +{q}
            </button>
          ))}
          <button
            onClick={() => setShowPianoRoll(true)}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md bg-surface-150 text-[10px]
              text-surface-500 hover:bg-accent-500/10 hover:text-accent-400 transition-colors"
            title={t('chords.pianoRollBtn', 'Custom chord via Piano Roll')}
          >
            <Piano className="w-3 h-3" />
            {t('chords.pianoRoll', 'Piano Roll')}
          </button>
        </div>
      </div>

      {/* ── Progression Timeline (drop target) ────────── */}
      <div className="rounded-xl border border-surface-300 bg-surface-50 p-2">
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
            {t('chords.progression', 'Progression')}
          </span>
          <span className="text-[10px] text-surface-400 ml-auto">
            {placedChords.length} {t('chords.chordsCount', 'chords')}
          </span>
        </div>

        <div className="flex items-center gap-0 overflow-x-auto pb-1 min-h-[68px]">
          {renderDropZone(0)}

          {resolvedPlaced.map((chord, i) => {
            const pc = placedChords[i];
            if (!pc) return null;
            const isDragging = draggingIndex === i;
            return (
              <React.Fragment key={pc.id}>
                <div
                  draggable
                  onDragStart={e => onTimelineDragStart(e, i)}
                  onDragEnd={onDragEnd}
                  onClick={() => handlePreviewChord(chord.notes)}
                  className={`relative flex flex-col items-center px-3 py-2 rounded-lg border
                    min-w-[56px] group transition-all select-none cursor-grab active:cursor-grabbing
                    ${isDragging ? 'opacity-30 scale-95' : 'hover:border-accent-500/50 hover:bg-surface-100'}
                    bg-surface-100 border-surface-300`}
                >
                  {/* X delete */}
                  <button
                    onClick={e => { e.stopPropagation(); removeChord(i); }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white
                      flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity
                      hover:bg-red-400 z-10"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>

                  <span className="text-xs font-bold text-accent-400">
                    {formatMode === 'roman' ? chord.roman : chord.name}
                  </span>
                  <span className="text-[9px] text-surface-500">
                    {formatMode === 'roman' ? chord.name : chord.roman}
                  </span>

                  {/* Octave control */}
                  <div className="flex items-center gap-0.5 mt-1">
                    <button
                      onClick={e => { e.stopPropagation(); setOctaveShift(i, pc.octaveShift - 1); }}
                      disabled={pc.octaveShift <= -2}
                      className="w-3.5 h-3.5 rounded flex items-center justify-center
                        text-surface-400 hover:text-accent-400 hover:bg-accent-500/10
                        disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                    {pc.octaveShift !== 0 && (
                      <span className="text-[8px] font-mono text-accent-400 min-w-[14px] text-center">
                        {pc.octaveShift > 0 ? `+${pc.octaveShift}` : pc.octaveShift}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setOctaveShift(i, pc.octaveShift + 1); }}
                      disabled={pc.octaveShift >= 2}
                      className="w-3.5 h-3.5 rounded flex items-center justify-center
                        text-surface-400 hover:text-accent-400 hover:bg-accent-500/10
                        disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
                {renderDropZone(i + 1)}
              </React.Fragment>
            );
          })}

          {placedChords.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-4 text-xs text-surface-400 italic">
              {t('chords.dragHint', 'Drag chords here or click palette to add')}
            </div>
          )}
        </div>

        {/* Delete zone — visible only while dragging from timeline */}
        {draggingFrom === 'timeline' && (
          <div
            onDragOver={onDeleteOver}
            onDragLeave={() => setDeleteHover(false)}
            onDrop={onDeleteDrop}
            className={`mt-2 py-2 rounded-lg border-2 border-dashed flex items-center justify-center gap-1.5
              text-xs transition-all ${
                deleteHover
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : 'border-surface-300 text-surface-400'
              }`}
          >
            <Trash2 className="w-3 h-3" />
            {t('chords.dropToDelete', 'Drop here to remove')}
          </div>
        )}
      </div>

      {/* ── Manual input ────────── */}
      <input
        value={value.roman}
        onChange={e => onChange({ ...value, roman: e.target.value })}
        placeholder="I - V - vi - IV"
        className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-1.5 text-xs
          text-surface-900 placeholder:text-surface-400 font-mono"
      />

      {/* ── Controls ────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-surface-500">{t('chords.beats', 'Beats')}:</span>
          {[1, 2, 4].map(b => (
            <button
              key={b}
              onClick={() => onChange({ ...value, beatsPerChord: b })}
              className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                value.beatsPerChord === b
                  ? 'bg-accent-500 text-white'
                  : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        <button
          onClick={handlePlay}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isPlaying
              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
              : 'bg-accent-500/10 text-accent-400 border border-accent-500/30 hover:bg-accent-500/20'
          }`}
        >
          {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isPlaying ? t('chords.stop', 'Stop') : t('chords.preview', 'Preview')}
        </button>

        <button
          onClick={() => setShowPresets(!showPresets)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
            bg-surface-100 text-surface-500 border border-surface-300 hover:bg-surface-200
            transition-colors ml-auto"
        >
          <Sparkles className="w-3 h-3" />
          {t('chords.presets', 'Presets')}
          <ChevronDown className={`w-3 h-3 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </button>

        {onApply && (
          <button
            onClick={handleApply}
            disabled={resolved.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
              bg-gradient-to-r from-accent-600 to-brand-600 text-white
              hover:from-accent-500 hover:to-brand-500 disabled:opacity-40 transition-all"
          >
            <Music className="w-3 h-3" />
            {t('chords.apply', 'Apply')}
          </button>
        )}
      </div>

      {/* ── Presets browser ────────── */}
      {showPresets && (
        <div className="rounded-xl border border-surface-300 bg-surface-50 overflow-hidden animate-scale-in">
          <div className="flex gap-1 px-2 py-2 overflow-x-auto border-b border-surface-200">
            {(Object.keys(MOOD_LABELS) as ProgressionMood[]).map(mood => (
              <button
                key={mood}
                onClick={() => setPresetMood(mood)}
                className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                  presetMood === mood
                    ? 'bg-accent-500 text-white'
                    : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                }`}
              >
                {MOOD_LABELS[mood].emoji} {MOOD_LABELS[mood].label}
              </button>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto p-2 space-y-1">
            {CHORD_PRESETS.filter(p => p.mood === presetMood).map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg
                  hover:bg-surface-100 transition-colors text-left group"
              >
                <span className="text-sm">{preset.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-surface-800 truncate">{preset.name}</p>
                  <p className="text-[10px] text-surface-500 font-mono truncate">{preset.roman}</p>
                </div>
                <span className="text-[10px] text-surface-400">{preset.key} {preset.scale}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Piano Roll Modal ────────── */}
      <PianoRollModal
        isOpen={showPianoRoll}
        onClose={() => setShowPianoRoll(false)}
        onAddChord={handlePianoRollAdd}
        engine={getEngine()}
      />
    </div>
  );
}
