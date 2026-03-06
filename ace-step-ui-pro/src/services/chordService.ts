import type { ChordQuality, ScaleType, ChordPreset, ProgressionMood } from '../types';

export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export const NOTE_NAMES: NoteName[] = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major: [0,2,4,5,7,9,11],
  minor: [0,2,3,5,7,8,10],
};

const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0,4,7], minor: [0,3,7], dim: [0,3,6], aug: [0,4,8],
  maj7: [0,4,7,11], min7: [0,3,7,10], dom7: [0,4,7,10],
  dim7: [0,3,6,9], sus2: [0,2,7], sus4: [0,5,7],
};

export interface ChordToken {
  degree: number;
  quality: ChordQuality;
  roman: string;
  isMinor: boolean;
  directRoot?: NoteName;
}

export interface ResolvedChord {
  name: string;
  root: NoteName;
  rootMidi: number;
  notes: number[];
  quality: ChordQuality;
  roman: string;
}

const ROMAN_MAP: Record<string, number> = {
  I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7,
  i:1, ii:2, iii:3, iv:4, v:5, vi:6, vii:7,
};

export function parseRoman(token: string): ChordToken {
  const trimmed = token.trim();

  // Direct chord name (Am, C#dim, Gsus4, etc.)
  const directMatch = trimmed.match(/^([A-G]#?)(m|dim|aug|maj7|min7|dom7|dim7|sus2|sus4|7)?$/);
  if (directMatch) {
    const [, noteName, qualStr] = directMatch;
    let quality: ChordQuality = 'major';
    let isMinor = false;
    if (qualStr === 'm') { quality = 'minor'; isMinor = true; }
    else if (qualStr === 'dim') { quality = 'dim'; isMinor = true; }
    else if (qualStr === 'aug') quality = 'aug';
    else if (qualStr === '7') quality = 'dom7';
    else if (qualStr === 'maj7') quality = 'maj7';
    else if (qualStr === 'min7') { quality = 'min7'; isMinor = true; }
    else if (qualStr === 'dom7') quality = 'dom7';
    else if (qualStr === 'dim7') { quality = 'dim7'; isMinor = true; }
    else if (qualStr === 'sus2') quality = 'sus2';
    else if (qualStr === 'sus4') quality = 'sus4';
    return { degree: 0, quality, roman: trimmed, isMinor, directRoot: noteName as NoteName };
  }

  const match = trimmed.match(/^(#{0,2}|b{0,2})?(I{1,3}V?|IV|V?I{0,3}|i{1,3}v?|iv|v?i{0,3})(dim|aug|maj7|min7|dom7|dim7|sus2|sus4|7|m)?$/i);
  if (!match) return { degree: 1, quality: 'major', roman: trimmed, isMinor: false };

  const [, , numeral, qual] = match;
  const upper = numeral.toUpperCase();
  const degree = ROMAN_MAP[upper] || 1;
  const isMinor = numeral === numeral.toLowerCase();

  let quality: ChordQuality = isMinor ? 'minor' : 'major';
  if (qual) {
    const q = qual.toLowerCase();
    if (q === '7') quality = isMinor ? 'min7' : 'dom7';
    else if (q === 'm') quality = 'minor';
    else quality = q as ChordQuality;
  }

  return { degree, quality, roman: trimmed, isMinor };
}

export function resolveChord(token: ChordToken, key: string, scale: ScaleType): ResolvedChord {
  // Direct chord name — bypass scale degree resolution
  if (token.directRoot) {
    const rootIdx = NOTE_NAMES.indexOf(token.directRoot);
    const rootMidi = 60 + (rootIdx >= 0 ? rootIdx : 0);
    const ci = QUALITY_INTERVALS[token.quality] || QUALITY_INTERVALS.major;
    const notes = ci.map(i => rootMidi + i);
    const ql = token.quality === 'major' ? '' : token.quality === 'minor' ? 'm' :
      token.quality === 'dim' ? '°' : token.quality === 'aug' ? '+' :
      token.quality === 'dom7' ? '7' : token.quality;
    return { name: `${token.directRoot}${ql}`, root: token.directRoot, rootMidi, notes, quality: token.quality, roman: token.roman };
  }

  const keyIdx = NOTE_NAMES.indexOf(key as NoteName);
  if (keyIdx < 0) return { name: token.roman, root: 'C', rootMidi: 60, notes: [60,64,67], quality: token.quality, roman: token.roman };

  const intervals = SCALE_INTERVALS[scale];
  const rootSemitones = intervals[(token.degree - 1) % 7];
  const rootIdx = (keyIdx + rootSemitones) % 12;
  const root = NOTE_NAMES[rootIdx];
  const rootMidi = 60 + rootIdx;

  const chordIntervals = QUALITY_INTERVALS[token.quality] || QUALITY_INTERVALS.major;
  const notes = chordIntervals.map(i => rootMidi + i);

  const qualLabel = token.quality === 'major' ? '' : token.quality === 'minor' ? 'm' :
    token.quality === 'dim' ? '°' : token.quality === 'aug' ? '+' :
    token.quality === 'dom7' ? '7' : token.quality;
  const name = `${root}${qualLabel}`;

  return { name, root, rootMidi, notes, quality: token.quality, roman: token.roman };
}

export function resolveProgression(romanStr: string, key: string, scale: ScaleType): ResolvedChord[] {
  if (!romanStr.trim()) return [];
  return romanStr.split(/\s*-\s*/).map(t => resolveChord(parseRoman(t), key, scale));
}

export function formatProgressionForGeneration(romanStr: string, key: string, scale: ScaleType) {
  const chords = resolveProgression(romanStr, key, scale);
  if (chords.length === 0) return { styleTag: '', lyricsTag: '', keyScaleTag: '' };

  const chordNames = chords.map(c => c.name).join(' - ');
  const keyScale = `${key} ${scale === 'major' ? 'Major' : 'Minor'}`;

  return {
    styleTag: `${keyScale} key, chord progression ${chordNames}, harmonic structure`,
    lyricsTag: '',
    keyScaleTag: `${key} ${scale}`,
  };
}

export const CHORD_PRESETS: ChordPreset[] = [
  // Romantic
  { id:'pop-canon', name:'Pop Canon', key:'C', scale:'major', roman:'I - V - vi - IV', mood:'romantic', description:'The most famous pop progression', emoji:'💕' },
  { id:'emotional-pop', name:'Emotional Pop', key:'G', scale:'major', roman:'vi - IV - I - V', mood:'romantic', description:'Emotional & nostalgic', emoji:'🥹' },
  { id:'ballad', name:'Classic Ballad', key:'C', scale:'major', roman:'I - vi - IV - V', mood:'romantic', description:'50s-style ballad', emoji:'💌' },
  { id:'dreamy', name:'Dreamy', key:'F', scale:'major', roman:'I - iii - vi - IV', mood:'romantic', description:'Ethereal & floating', emoji:'✨' },
  { id:'wedding', name:'Wedding March', key:'C', scale:'major', roman:'I - IV - V - I', mood:'romantic', description:'Classic resolution', emoji:'💒' },
  // Dark
  { id:'minor-drama', name:'Minor Drama', key:'A', scale:'minor', roman:'i - VI - III - VII', mood:'dark', description:'Dark & dramatic', emoji:'🌑' },
  { id:'haunted', name:'Haunted', key:'D', scale:'minor', roman:'i - iv - v - i', mood:'dark', description:'Eerie & unsettling', emoji:'👻' },
  { id:'gothic', name:'Gothic Power', key:'E', scale:'minor', roman:'i - VII - VI - V', mood:'dark', description:'Powerful descent', emoji:'⚔️' },
  { id:'tension', name:'Rising Tension', key:'C', scale:'minor', roman:'i - iv - VII - III', mood:'dark', description:'Building suspense', emoji:'🎭' },
  // Upbeat
  { id:'rock-anthem', name:'Rock Anthem', key:'G', scale:'major', roman:'I - IV - vi - V', mood:'upbeat', description:'Stadium rock', emoji:'🎸' },
  { id:'punk-pop', name:'Punk Pop', key:'C', scale:'major', roman:'I - V - vi - IV', mood:'upbeat', description:'Energetic & catchy', emoji:'⚡' },
  { id:'happy-clap', name:'Happy Clap', key:'D', scale:'major', roman:'I - V - ii - IV', mood:'upbeat', description:'Feel-good & uplifting', emoji:'👏' },
  // Jazz
  { id:'jazz-251', name:'Jazz ii-V-I', key:'C', scale:'major', roman:'ii - V - I - I', mood:'jazz', description:'Classic jazz cadence', emoji:'🎷' },
  { id:'jazz-turnaround', name:'Jazz Turnaround', key:'C', scale:'major', roman:'I - vi - ii - V', mood:'jazz', description:'Standard turnaround', emoji:'🎹' },
  { id:'bossa', name:'Bossa Nova', key:'C', scale:'major', roman:'I - ii - iii - IV', mood:'jazz', description:'Brazilian bossa', emoji:'🌴' },
  // Latin
  { id:'reggaeton', name:'Reggaeton', key:'A', scale:'minor', roman:'i - iv - VII - III', mood:'latin', description:'Classic reggaeton', emoji:'🔥' },
  { id:'bachata', name:'Bachata', key:'D', scale:'minor', roman:'i - V - iv - i', mood:'latin', description:'Romantic bachata', emoji:'💃' },
  { id:'salsa', name:'Salsa', key:'C', scale:'major', roman:'I - IV - V - IV', mood:'latin', description:'Salsa rhythm', emoji:'🪘' },
  // Lo-fi
  { id:'lofi-chill', name:'Lo-fi Chill', key:'C', scale:'major', roman:'I - iii - vi - IV', mood:'lofi', description:'Chill study beats', emoji:'📚' },
  { id:'lofi-jazzy', name:'Lo-fi Jazzy', key:'F', scale:'major', roman:'ii - V - I - vi', mood:'lofi', description:'Jazzy lo-fi', emoji:'☕' },
  // Epic
  { id:'epic-trailer', name:'Epic Trailer', key:'D', scale:'minor', roman:'i - VII - VI - VII', mood:'epic', description:'Cinematic trailer', emoji:'🎬' },
  { id:'orchestral', name:'Orchestral Rise', key:'C', scale:'minor', roman:'i - iv - VI - V', mood:'epic', description:'Building orchestral', emoji:'🎻' },
  // Folk
  { id:'folk-simple', name:'Simple Folk', key:'G', scale:'major', roman:'I - IV - V - I', mood:'folk', description:'Traditional folk', emoji:'🪕' },
  { id:'celtic', name:'Celtic', key:'D', scale:'minor', roman:'i - VII - VI - VII', mood:'folk', description:'Celtic mood', emoji:'🍀' },
];

export const AVAILABLE_KEYS = NOTE_NAMES;

// Simple synth for chord preview
export class ChordAudioEngine {
  private ctx: AudioContext | null = null;
  private activeNodes: OscillatorNode[] = [];

  private getCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  playChord(notes: number[], duration = 0.6) {
    this.stop();
    const ctx = this.getCtx();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    gain.connect(ctx.destination);

    notes.forEach(midi => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      this.activeNodes.push(osc);
    });
  }

  async playProgression(chords: ResolvedChord[], bpm: number, beatsPerChord: number) {
    this.stop();
    const beatDuration = 60 / bpm;
    for (const chord of chords) {
      this.playChord(chord.notes, beatDuration * beatsPerChord * 0.9);
      await new Promise(r => setTimeout(r, beatDuration * beatsPerChord * 1000));
    }
  }

  playNote(midi: number, duration = 0.3) {
    const ctx = this.getCtx();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  stop() {
    this.activeNodes.forEach(n => { try { n.stop(); } catch {} });
    this.activeNodes = [];
  }

  dispose() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
  }
}

// Helper functions for piano roll
export function noteNameToMidi(name: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(name as NoteName);
  return idx >= 0 ? (octave + 1) * 12 + idx : 60;
}

export function midiToNoteName(midi: number): { name: NoteName; octave: number } {
  const octave = Math.floor(midi / 12) - 1;
  const idx = midi % 12;
  return { name: NOTE_NAMES[idx], octave };
}

export function identifyChord(midiNotes: number[]): string {
  if (midiNotes.length === 0) return '';
  if (midiNotes.length === 1) return NOTE_NAMES[midiNotes[0] % 12];
  const sorted = [...midiNotes].sort((a, b) => a - b);
  const rootName = NOTE_NAMES[sorted[0] % 12];
  const intervals = sorted.map(n => ((n - sorted[0]) % 12 + 12) % 12);
  const unique = [...new Set(intervals)].sort((a, b) => a - b);
  for (const [quality, qi] of Object.entries(QUALITY_INTERVALS)) {
    if (unique.length === qi.length && unique.every((v, i) => v === qi[i])) {
      const label = quality === 'major' ? '' : quality === 'minor' ? 'm' :
        quality === 'dim' ? 'dim' : quality === 'aug' ? 'aug' : quality;
      return `${rootName}${label}`;
    }
  }
  return rootName;
}
