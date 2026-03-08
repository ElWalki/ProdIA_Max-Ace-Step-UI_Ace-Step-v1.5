import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Play, Square, Plus, Minus, RotateCcw, ZoomIn, ZoomOut, Piano, Repeat } from 'lucide-react';
import {
  ChordAudioEngine, NOTE_NAMES, noteNameToMidi, midiToNoteName, identifyChord,
} from '../../services/chordService';
import type { NoteName } from '../../services/chordService';

interface PianoRollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChord: (notes: number[], label: string) => void;
  engine: ChordAudioEngine;
  bpm?: number;
}

const LOWEST_MIDI = 36;  // C2
const HIGHEST_MIDI = 83; // B5
const DEFAULT_GRID_COLS = 16;
const MIN_GRID_COLS = 4;
const MAX_GRID_COLS = 64;
const COL_WIDTH = 48;

const BLACK_NOTE_INDICES = new Set([1, 3, 6, 8, 10]);

interface PlacedNote {
  midi: number;
  col: number;
  /** Duration in steps (default 1) */
  duration: number;
  id: string;
}

let _nid = 0;
const nid = () => `n-${++_nid}`;

export default function PianoRollModal({ isOpen, onClose, onAddChord, engine, bpm = 120 }: PianoRollModalProps) {
  const { t } = useTranslation();
  const [placedNotes, setPlacedNotes] = useState<PlacedNote[]>([]);
  const [rowHeight, setRowHeight] = useState(14);
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_COLS);
  const gridRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);

  // Sequential playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCol, setPlayCol] = useState(-1);
  const [loopMode, setLoopMode] = useState(false);
  const stopRef = useRef(false);
  const playheadRef = useRef<HTMLDivElement>(null);

  // Note resize dragging
  const [resizingNote, setResizingNote] = useState<string | null>(null);

  const isBlackKey = useCallback((midi: number) => BLACK_NOTE_INDICES.has(midi % 12), []);
  const noteLabel = useCallback((midi: number) => {
    const { name, octave } = midiToNoteName(midi);
    return `${name}${octave}`;
  }, []);
  const isCNote = useCallback((midi: number) => midi % 12 === 0, []);

  const toggleCell = useCallback((midi: number, col: number) => {
    setPlacedNotes(prev => {
      const existing = prev.find(n => n.midi === midi && n.col === col);
      if (existing) return prev.filter(n => n !== existing);
      // Also remove notes that span over this cell
      const filtered = prev.filter(n => !(n.midi === midi && n.col < col && n.col + n.duration > col));
      engine.playNote(midi, 0.2);
      return [...filtered, { midi, col, duration: 1, id: nid() }];
    });
  }, [engine]);

  const handlePianoKeyClick = useCallback((midi: number) => {
    engine.playNote(midi, 0.4);
  }, [engine]);

  // Sequential playback — plays column by column like a DAW
  const handlePlay = useCallback(async () => {
    if (isPlaying) { stopRef.current = true; setIsPlaying(false); setPlayCol(-1); return; }
    if (placedNotes.length === 0) return;
    stopRef.current = false;
    setIsPlaying(true);

    const stepDuration = (60 / bpm) * 0.5; // Each step = half a beat (16th note feel at 4/4)

    const playOnce = async () => {
      for (let col = 0; col < gridCols; col++) {
        if (stopRef.current) return false;
        setPlayCol(col);
        // Find notes that START at this column
        const notesAtCol = placedNotes.filter(n => n.col === col);
        if (notesAtCol.length > 0) {
          // Find max duration among notes starting here
          const maxDur = Math.max(...notesAtCol.map(n => n.duration));
          const playDur = stepDuration * maxDur * 0.9;
          engine.playChord(notesAtCol.map(n => n.midi), playDur);
        }
        await new Promise(r => setTimeout(r, stepDuration * 1000));
      }
      return true;
    };

    do {
      const completed = await playOnce();
      if (!completed || stopRef.current) break;
    } while (loopMode && !stopRef.current);

    setIsPlaying(false);
    setPlayCol(-1);
  }, [isPlaying, placedNotes, gridCols, bpm, engine, loopMode]);

  // Scroll playhead into view
  useEffect(() => {
    if (playCol >= 0 && playheadRef.current && gridRef.current) {
      const scrollLeft = playCol * COL_WIDTH - gridRef.current.clientWidth / 2;
      gridRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  }, [playCol]);

  const handlePreview = useCallback(() => {
    if (placedNotes.length === 0) return;
    const uniqueMidi = [...new Set(placedNotes.map(n => n.midi))].sort((a, b) => a - b);
    engine.playChord(uniqueMidi, 0.8);
  }, [placedNotes, engine]);

  const handleAdd = useCallback(() => {
    if (placedNotes.length < 2) return;
    const uniqueMidi = [...new Set(placedNotes.map(n => n.midi))].sort((a, b) => a - b);
    const label = identifyChord(uniqueMidi);
    onAddChord(uniqueMidi, label);
    setPlacedNotes([]);
    onClose();
  }, [placedNotes, onAddChord, onClose]);

  const handleClear = useCallback(() => { setPlacedNotes([]); setPlayCol(-1); }, []);

  // Extend note duration by dragging right edge
  const handleNoteResizeStart = useCallback((e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingNote(noteId);

    const startX = e.clientX;
    const note = placedNotes.find(n => n.id === noteId);
    if (!note) return;
    const startDur = note.duration;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newDur = Math.max(1, Math.min(gridCols - note.col, Math.round(startDur + dx / COL_WIDTH)));
      setPlacedNotes(prev => prev.map(n => n.id === noteId ? { ...n, duration: newDur } : n));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizingNote(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [placedNotes, gridCols]);

  const chordName = useMemo(() => {
    if (placedNotes.length < 2) return '';
    const uniqueMidi = [...new Set(placedNotes.map(n => n.midi))].sort((a, b) => a - b);
    return identifyChord(uniqueMidi);
  }, [placedNotes]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && isPlaying) {
      stopRef.current = true;
      setIsPlaying(false);
      setPlayCol(-1);
    }
  }, [isOpen, isPlaying]);

  if (!isOpen) return null;

  const rows: number[] = [];
  for (let m = HIGHEST_MIDI; m >= LOWEST_MIDI; m--) rows.push(m);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a2e] rounded-2xl shadow-2xl border border-[#333] flex flex-col
          w-[900px] max-w-[96vw] h-[600px] max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#333] bg-[#16162a] rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2">
            <Piano className="w-4 h-4 text-accent-400" />
            <span className="text-xs font-semibold text-[#ddd] tracking-wide">
              {t('chords.pianoRollTitle', 'Piano Roll')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {chordName && (
              <span className="px-2.5 py-1 rounded-md bg-accent-500/20 text-accent-300 text-xs font-bold">
                {chordName}
              </span>
            )}
            <span className="text-[10px] text-[#888]">
              {placedNotes.length} {t('chords.notesPlaced', 'notes')}
            </span>
            <span className="text-[10px] text-[#666]">|</span>
            <span className="text-[10px] text-[#888] font-mono">{bpm} BPM</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Steps +/- */}
            <span className="text-[9px] text-[#666] mr-1">{gridCols} steps</span>
            <button onClick={() => setGridCols(c => Math.max(MIN_GRID_COLS, c - 4))}
              className="p-1 rounded text-[#888] hover:text-white hover:bg-[#333] transition-colors"
              title={t('chords.removeSteps', 'Remove steps')}>
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setGridCols(c => Math.min(MAX_GRID_COLS, c + 4))}
              className="p-1 rounded text-[#888] hover:text-white hover:bg-[#333] transition-colors"
              title={t('chords.addSteps', 'Add steps')}>
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-[#333] mx-1" />
            {/* Zoom */}
            <button onClick={() => setRowHeight(h => Math.max(8, h - 2))}
              className="p-1 rounded text-[#888] hover:text-white hover:bg-[#333] transition-colors">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setRowHeight(h => Math.min(24, h + 2))}
              className="p-1 rounded text-[#888] hover:text-white hover:bg-[#333] transition-colors">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-[#333] mx-1" />
            <button onClick={onClose}
              className="p-1 rounded text-[#888] hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Grid area ── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Piano keys column */}
          <div className="w-14 shrink-0 border-r border-[#333] overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
            ref={el => {
              (keysRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              if (el && gridRef.current) {
                el.onscroll = () => { if (gridRef.current) gridRef.current.scrollTop = el.scrollTop; };
              }
            }}
          >
            {rows.map(midi => {
              const isBlack = isBlackKey(midi);
              const isC = isCNote(midi);
              return (
                <div
                  key={midi}
                  onClick={() => handlePianoKeyClick(midi)}
                  style={{ height: rowHeight }}
                  className={`flex items-center justify-end pr-1.5 text-[9px] font-mono cursor-pointer
                    border-b select-none transition-colors
                    ${isBlack
                      ? 'bg-[#1a1a2e] text-[#888] border-[#222] hover:bg-[#2a2a4a]'
                      : isC
                        ? 'bg-[#252540] text-[#ccc] border-[#333] hover:bg-[#353560] font-semibold'
                        : 'bg-[#20203a] text-[#999] border-[#2a2a3a] hover:bg-[#303050]'
                    }`}
                >
                  {isC || isBlack ? noteLabel(midi) : ''}
                </div>
              );
            })}
          </div>

          {/* Grid columns */}
          <div
            ref={gridRef}
            className="flex-1 overflow-auto relative"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#444 #1a1a2e' }}
            onScroll={e => {
              if (keysRef.current) keysRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
            }}
          >
            {/* Beat markers at top */}
            <div className="sticky top-0 z-20 flex border-b border-[#444] bg-[#16162a]"
              style={{ minWidth: gridCols * COL_WIDTH }}>
              {Array.from({ length: gridCols }, (_, col) => {
                const isBeat = col % 4 === 0;
                const barNum = Math.floor(col / 4) + 1;
                return (
                  <div
                    key={col}
                    style={{ width: COL_WIDTH, height: 16 }}
                    className={`shrink-0 border-r flex items-center justify-center
                      ${isBeat ? 'border-[#444]' : 'border-[#2a2a3a]'}`}
                  >
                    {isBeat && (
                      <span className="text-[8px] font-mono text-[#666]">{barNum}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ minWidth: gridCols * COL_WIDTH }} className="relative">
              {/* Playhead line */}
              {playCol >= 0 && (
                <div
                  ref={playheadRef}
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none transition-[left] duration-75"
                  style={{ left: playCol * COL_WIDTH + COL_WIDTH / 2 }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-[3px] -mt-0.5" />
                </div>
              )}

              {rows.map(midi => {
                const isBlack = isBlackKey(midi);
                const isC = isCNote(midi);
                return (
                  <div
                    key={midi}
                    style={{ height: rowHeight }}
                    className={`flex border-b relative ${
                      isBlack ? 'border-[#222]' : isC ? 'border-[#333]' : 'border-[#2a2a3a]'
                    }`}
                  >
                    {Array.from({ length: gridCols }, (_, col) => {
                      const note = placedNotes.find(n => n.midi === midi && n.col === col);
                      const isCoveredBy = !note && placedNotes.find(n => n.midi === midi && n.col < col && n.col + n.duration > col);
                      const isBeat = col % 4 === 0;
                      const isPlayingCol = playCol === col;

                      if (isCoveredBy) {
                        // This cell is part of an extended note — don't render a clickable cell
                        return (
                          <div
                            key={col}
                            style={{ width: COL_WIDTH, height: rowHeight }}
                            className={`shrink-0 border-r ${isBeat ? 'border-[#333]' : 'border-[#222]'}
                              bg-accent-500/80 ${isPlayingCol ? 'brightness-150' : ''}`}
                          />
                        );
                      }

                      if (note) {
                        // Render the note block spanning its duration
                        return (
                          <div
                            key={col}
                            onClick={() => toggleCell(midi, col)}
                            style={{ width: COL_WIDTH * note.duration, height: rowHeight }}
                            className={`shrink-0 relative cursor-pointer transition-all
                              bg-accent-500 rounded-sm shadow-[0_0_6px_rgba(99,102,241,0.4)]
                              ${isPlayingCol ? 'brightness-150 shadow-[0_0_12px_rgba(99,102,241,0.8)]' : 'hover:brightness-110'}
                              border-r ${isBeat ? 'border-[#333]' : 'border-[#222]'}`}
                          >
                            {/* Note label for longer notes */}
                            {note.duration >= 2 && (
                              <span className="absolute left-1 top-0 text-[7px] font-mono text-white/70 leading-none"
                                style={{ lineHeight: `${rowHeight}px` }}>
                                {noteLabel(midi)}
                              </span>
                            )}
                            {/* Resize handle on right edge */}
                            <div
                              onMouseDown={e => handleNoteResizeStart(e, note.id)}
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-r-sm"
                            />
                          </div>
                        );
                      }

                      return (
                        <div
                          key={col}
                          onClick={() => toggleCell(midi, col)}
                          style={{ width: COL_WIDTH, height: rowHeight }}
                          className={`shrink-0 border-r cursor-pointer transition-all
                            ${isBeat ? 'border-[#333]' : 'border-[#222]'}
                            ${isPlayingCol
                              ? 'bg-red-500/10'
                              : isBlack
                                ? 'bg-[#16162a] hover:bg-[#252550]'
                                : 'bg-[#1e1e38] hover:bg-[#2a2a50]'
                            }`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Bottom toolbar ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#333] bg-[#16162a] rounded-b-2xl shrink-0">
          <div className="flex items-center gap-1 flex-wrap max-w-[30%] overflow-hidden">
            {[...new Set(placedNotes.map(n => n.midi))].sort((a, b) => a - b).map(m => (
              <span key={m} className="px-1.5 py-0.5 rounded bg-[#2a2a4a] text-[9px] font-mono text-[#aaa]">
                {noteLabel(m)}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleClear}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[#888]
                hover:bg-[#333] hover:text-white transition-colors">
              <RotateCcw className="w-3 h-3" />
              {t('chords.clear', 'Clear')}
            </button>
            <button
              onClick={() => setLoopMode(l => !l)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                loopMode
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-[#2a2a4a] text-[#666] hover:text-[#aaa]'
              }`}
              title="Loop playback"
            >
              <Repeat className="w-3 h-3" />
            </button>
            <button onClick={handlePlay}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                isPlaying
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-[#2a2a4a] text-[#ccc] hover:bg-[#3a3a5a]'
              } ${placedNotes.length === 0 ? 'opacity-40' : ''}`}
              disabled={placedNotes.length === 0 && !isPlaying}
            >
              {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isPlaying ? t('chords.stop', 'Stop') : t('chords.playSequence', 'Play')}
            </button>
            <button onClick={handlePreview} disabled={placedNotes.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-[#2a2a4a]
                text-[#ccc] hover:bg-[#3a3a5a] disabled:opacity-40 transition-colors"
              title="Play all notes as one chord">
              <Piano className="w-3 h-3" />
              {t('chords.previewChord', 'Chord')}
            </button>
            <button onClick={handleAdd} disabled={placedNotes.length < 2}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-accent-500 text-white
                hover:bg-accent-400 disabled:opacity-40 transition-colors">
              <Plus className="w-3 h-3" />
              {t('chords.addCustom', 'Add Chord')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
