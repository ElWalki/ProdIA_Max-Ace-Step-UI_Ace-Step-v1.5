import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Play, Plus, Minus, RotateCcw, ZoomIn, ZoomOut, Piano } from 'lucide-react';
import {
  ChordAudioEngine, NOTE_NAMES, noteNameToMidi, midiToNoteName, identifyChord,
} from '../../services/chordService';
import type { NoteName } from '../../services/chordService';

interface PianoRollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChord: (notes: number[], label: string) => void;
  engine: ChordAudioEngine;
}

// FL Studio style: bottom = low notes, top = high notes
// Piano roll covers C2 (36) to B5 (83) = 4 octaves = 48 notes
const LOWEST_MIDI = 36;  // C2
const HIGHEST_MIDI = 83; // B5
const TOTAL_NOTES = HIGHEST_MIDI - LOWEST_MIDI + 1;
const DEFAULT_GRID_COLS = 16;
const MIN_GRID_COLS = 4;
const MAX_GRID_COLS = 64;
const COL_WIDTH = 48;

const BLACK_NOTE_INDICES = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A#

interface PlacedNote {
  midi: number;
  col: number;
  id: string;
}

let _nid = 0;
const nid = () => `n-${++_nid}`;

export default function PianoRollModal({ isOpen, onClose, onAddChord, engine }: PianoRollModalProps) {
  const { t } = useTranslation();
  const [placedNotes, setPlacedNotes] = useState<PlacedNote[]>([]);
  const [rowHeight, setRowHeight] = useState(14);
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_COLS);
  const gridRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);

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
      engine.playNote(midi, 0.2);
      return [...prev, { midi, col, id: nid() }];
    });
  }, [engine]);

  const handlePianoKeyClick = useCallback((midi: number) => {
    engine.playNote(midi, 0.4);
  }, [engine]);

  const handlePreview = useCallback(() => {
    if (placedNotes.length === 0) return;
    // Play all unique MIDI notes as a chord
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

  const handleClear = useCallback(() => { setPlacedNotes([]); }, []);

  const chordName = useMemo(() => {
    if (placedNotes.length < 2) return '';
    const uniqueMidi = [...new Set(placedNotes.map(n => n.midi))].sort((a, b) => a - b);
    return identifyChord(uniqueMidi);
  }, [placedNotes]);

  if (!isOpen) return null;

  // Rows from top (high) to bottom (low)
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
            className="flex-1 overflow-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#444 #1a1a2e' }}
            onScroll={e => {
              if (keysRef.current) keysRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
            }}
          >
            <div style={{ minWidth: gridCols * COL_WIDTH }}>
              {rows.map(midi => {
                const isBlack = isBlackKey(midi);
                const isC = isCNote(midi);
                return (
                  <div
                    key={midi}
                    style={{ height: rowHeight }}
                    className={`flex border-b ${
                      isBlack ? 'border-[#222]' : isC ? 'border-[#333]' : 'border-[#2a2a3a]'
                    }`}
                  >
                    {Array.from({ length: gridCols }, (_, col) => {
                      const hasNote = placedNotes.some(n => n.midi === midi && n.col === col);
                      const isBeat = col % 4 === 0;
                      return (
                        <div
                          key={col}
                          onClick={() => toggleCell(midi, col)}
                          style={{ width: COL_WIDTH, height: rowHeight }}
                          className={`shrink-0 border-r cursor-pointer transition-all
                            ${isBeat ? 'border-[#333]' : 'border-[#222]'}
                            ${hasNote
                              ? 'bg-accent-500 shadow-[0_0_6px_rgba(99,102,241,0.5)] rounded-sm'
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
          <div className="flex items-center gap-1 flex-wrap max-w-[40%] overflow-hidden">
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
            <button onClick={handlePreview} disabled={placedNotes.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-[#2a2a4a]
                text-[#ccc] hover:bg-[#3a3a5a] disabled:opacity-40 transition-colors">
              <Play className="w-3 h-3" />
              {t('chords.previewChord', 'Preview')}
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
