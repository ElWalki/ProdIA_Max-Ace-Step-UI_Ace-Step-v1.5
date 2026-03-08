export interface Song {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  coverUrl: string;
  duration: string;
  createdAt: Date;
  isGenerating?: boolean;
  queuePosition?: number;
  progress?: number;
  stage?: string;
  generationParams?: GenerationParams;
  tags: string[];
  audioUrl?: string;
  isPublic?: boolean;
  likeCount?: number;
  viewCount?: number;
  userId?: string;
  creator?: string;
  ditModel?: string;
  liked?: boolean;
  prompt?: string;
}

export interface StyleDna {
  enabled: boolean;
  energy: number;         // 0-100: calm → intense
  danceability: number;   // 0-100: ambient → groovy
  valence: number;        // 0-100: dark → bright
  acousticness: number;   // 0-100: electronic → acoustic
  vocalIntensity: number; // 0-100: whisper → belting
  complexity: number;     // 0-100: minimal → dense
}

export const DEFAULT_STYLE_DNA: StyleDna = {
  enabled: false,
  energy: 50,
  danceability: 50,
  valence: 50,
  acousticness: 50,
  vocalIntensity: 50,
  complexity: 50,
};

// Maps StyleDna slider values to descriptive tags injected into caption
export function buildStyleDnaTags(dna: StyleDna): string {
  if (!dna.enabled) return '';
  const tags: string[] = [];

  // Energy
  if (dna.energy <= 20) tags.push('calm', 'mellow', 'relaxed');
  else if (dna.energy <= 40) tags.push('laid-back', 'smooth');
  else if (dna.energy >= 80) tags.push('energetic', 'powerful', 'intense', 'driving');
  else if (dna.energy >= 60) tags.push('upbeat', 'lively');

  // Danceability
  if (dna.danceability <= 20) tags.push('ambient', 'ethereal');
  else if (dna.danceability <= 40) tags.push('contemplative', 'flowing');
  else if (dna.danceability >= 80) tags.push('danceable', 'groovy', 'rhythmic');
  else if (dna.danceability >= 60) tags.push('bouncy', 'catchy');

  // Valence (mood)
  if (dna.valence <= 20) tags.push('dark', 'melancholic', 'somber');
  else if (dna.valence <= 40) tags.push('moody', 'introspective');
  else if (dna.valence >= 80) tags.push('uplifting', 'happy', 'euphoric');
  else if (dna.valence >= 60) tags.push('bright', 'cheerful');

  // Acousticness
  if (dna.acousticness <= 20) tags.push('electronic', 'synthesized', 'digital');
  else if (dna.acousticness <= 40) tags.push('processed', 'polished');
  else if (dna.acousticness >= 80) tags.push('acoustic', 'organic', 'unplugged');
  else if (dna.acousticness >= 60) tags.push('natural', 'warm');

  // Vocal intensity
  if (dna.vocalIntensity <= 20) tags.push('soft vocal', 'whispered', 'gentle singing');
  else if (dna.vocalIntensity <= 40) tags.push('smooth vocal', 'tender');
  else if (dna.vocalIntensity >= 80) tags.push('powerful vocal', 'belting', 'soaring');
  else if (dna.vocalIntensity >= 60) tags.push('strong vocal', 'expressive');

  // Complexity / arrangement
  if (dna.complexity <= 20) tags.push('minimal', 'sparse');
  else if (dna.complexity <= 40) tags.push('simple', 'clean');
  else if (dna.complexity >= 80) tags.push('complex', 'layered', 'dense arrangement');
  else if (dna.complexity >= 60) tags.push('rich', 'textured');

  return tags.join(', ');
}

// Derive model-level parameters from StyleDna
export function styleDnaToModelParams(dna: StyleDna): {
  lmRepetitionPenalty?: number;
  noRepeatNgramSize?: number;
  apgEta?: number;
} {
  if (!dna.enabled) return {};
  const out: { lmRepetitionPenalty?: number; noRepeatNgramSize?: number; apgEta?: number } = {};

  // Complexity → repetition penalty (more complex = higher penalty = more variation)
  // Range: 1.0 (simple/repetitive) → 1.5 (complex/varied)
  out.lmRepetitionPenalty = 1.0 + (dna.complexity / 100) * 0.5;

  // Danceability + complexity → n-gram blocking
  // High danceability = allow more repetition (lower ngram), high complexity = block more repeats
  if (dna.complexity >= 70 && dna.danceability < 50) {
    out.noRepeatNgramSize = 3;
  }

  // Energy → APG eta (higher energy = amplify pitch patterns)
  if (dna.energy >= 60) {
    out.apgEta = (dna.energy - 50) / 100 * 0.4; // 0 → 0.2 range
  }

  return out;
}

export interface GenerationParams {
  customMode: boolean;
  songDescription?: string;
  prompt: string;
  lyrics: string;
  style: string;
  title: string;
  styleDna?: StyleDna;
  ditModel?: string;
  instrumental: boolean;
  singer: '' | 'male' | 'female';
  vocalLanguage: string;
  bpm: number;
  keyScale: string;
  timeSignature: string;
  duration: number;
  inferenceSteps: number;
  guidanceScale: number;
  batchSize: number;
  randomSeed: boolean;
  seed: number;
  thinking: boolean;
  enhance?: boolean;
  audioFormat: 'mp3' | 'flac';
  inferMethod: 'ode' | 'sde';
  shift: number;
  lmTemperature: number;
  lmCfgScale: number;
  lmTopK: number;
  lmTopP: number;
  lmNegativePrompt: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;
  lmRepetitionPenalty?: number;
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  vocalAudioUrl?: string;
  vocalAudioTitle?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;
  alignToMeasures?: boolean;
  sectionMode?: boolean;
  sectionMeasures?: number;
  melodicVariation?: number;
  apgNormThreshold?: number;
  apgMomentum?: number;
  apgEta?: number;
  noRepeatNgramSize?: number;
  loraLoaded?: boolean;
  loraPath?: string;
  loraName?: string;
  loraScale?: number;
  loraEnabled?: boolean;
  loraTriggerTag?: string;
  loraTagPosition?: string;
}

export interface GenerationJob {
  jobId: string;
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  progress?: number;
  stage?: string;
  result?: {
    audioUrls: string[];
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
  };
  error?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  songIds?: string[];
  isPublic?: boolean;
  songs?: Song[];
}

export interface User {
  id: string;
  username: string;
  isAdmin?: boolean;
  avatar_url?: string;
}

export type ChordQuality = 'major' | 'minor' | 'dim' | 'aug' | 'maj7' | 'min7' | 'dom7' | 'dim7' | 'sus2' | 'sus4';
export type ScaleType = 'major' | 'minor';
export type ProgressionMood = 'romantic' | 'dark' | 'upbeat' | 'jazz' | 'latin' | 'lofi' | 'epic' | 'folk';

export interface ChordProgressionState {
  key: string;
  scale: ScaleType;
  roman: string;
  bpm: number;
  beatsPerChord: number;
}

export interface ChordPreset {
  id: string;
  name: string;
  key: string;
  scale: ScaleType;
  roman: string;
  mood: ProgressionMood;
  description: string;
  emoji: string;
}

export type View = 'create' | 'library' | 'training' | 'explore' | 'gpu' | 'studio' | 'features';

export const DEFAULT_PARAMS: GenerationParams = {
  customMode: false,
  songDescription: '',
  prompt: '',
  lyrics: '',
  style: '',
  title: '',
  instrumental: false,
  singer: '',
  vocalLanguage: 'en',
  bpm: 120,
  keyScale: '',
  timeSignature: '4',
  duration: 120,
  inferenceSteps: 60,
  guidanceScale: 15,
  batchSize: 1,
  randomSeed: true,
  seed: 0,
  thinking: false,
  enhance: false,
  audioFormat: 'mp3',
  inferMethod: 'ode',
  shift: 3,
  lmTemperature: 0.85,
  lmCfgScale: 1.5,
  lmTopK: 100,
  lmTopP: 0.95,
  lmNegativePrompt: '',
};

export const KEY_SIGNATURES = [
  '', 'C major', 'C minor', 'C# major', 'C# minor', 'Db major', 'Db minor',
  'D major', 'D minor', 'D# major', 'D# minor', 'Eb major', 'Eb minor',
  'E major', 'E minor', 'F major', 'F minor', 'F# major', 'F# minor',
  'Gb major', 'Gb minor', 'G major', 'G minor', 'G# major', 'G# minor',
  'Ab major', 'Ab minor', 'A major', 'A minor', 'A# major', 'A# minor',
  'Bb major', 'Bb minor', 'B major', 'B minor',
];

export const TIME_SIGNATURES = [
  { value: '', label: 'Auto' },
  { value: '1', label: '1/1' },
  { value: '2', label: '2/4' },
  { value: '3', label: '3/4' },
  { value: '4', label: '4/4' },
  { value: '5', label: '5/4' },
  { value: '6', label: '6/8' },
  { value: '7', label: '7/4' },
  { value: '8', label: '8/4' },
];

export const VOCAL_LANGUAGES = [
  { code: '', label: 'Auto' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'no', label: 'Norsk' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'he', label: 'עברית' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'uk', label: 'Українська' },
  { code: 'ro', label: 'Română' },
  { code: 'hu', label: 'Magyar' },
  { code: 'cs', label: 'Čeština' },
  { code: 'bg', label: 'Български' },
  { code: 'hr', label: 'Hrvatski' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'la', label: 'Latin' },
  { code: 'yue', label: '粵語' },
];
