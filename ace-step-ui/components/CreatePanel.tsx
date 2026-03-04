import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Sparkles, ChevronDown, Settings2, Trash2, Music2, Sliders, Dices, Hash, RefreshCw, Plus, Upload, Play, Pause, Loader2, Download, FolderOpen, ArrowLeft, Check, FolderSearch, Database, Mic, FileText, Guitar, AlertTriangle, X, Save, User, Layers, Info } from 'lucide-react';
import { GenerationParams, Song } from '../types';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { generateApi, trainingApi, voicesApi, vramApi } from '../services/api';
import { uiBridge, UIAction, UIState } from '../services/uiBridge';
import { MAIN_STYLES } from '../data/genres';
import { EditableSlider } from './EditableSlider';
import { SongLyricsModal } from './SongLyricsModal';
import { LoraManager } from './LoraManager';

interface ReferenceTrack {
  id: string;
  filename: string;
  storage_key: string;
  duration: number | null;
  file_size_bytes: number | null;
  tags: string[] | null;
  created_at: string;
  audio_url: string;
}

interface CreatePanelProps {
  onGenerate: (params: GenerationParams) => void;
  isGenerating: boolean;
  activeJobCount?: number;
  maxConcurrentJobs?: number;
  initialData?: { song: Song, timestamp: number } | null;
  createdSongs?: Song[];
  pendingAudioSelection?: { target: 'reference' | 'source'; url: string; title?: string } | null;
  onAudioSelectionApplied?: () => void;
  pendingLyrics?: { text: string; mode: 'overwrite' | 'append' } | null;
  onLyricsApplied?: () => void;
  onPrepareTraining?: (song: Song) => void;
  onShowInfo?: (info: { title: string; content: string }) => void;
}

const KEY_SIGNATURES = [
  '',
  'C major', 'C minor',
  'C# major', 'C# minor',
  'Db major', 'Db minor',
  'D major', 'D minor',
  'D# major', 'D# minor',
  'Eb major', 'Eb minor',
  'E major', 'E minor',
  'F major', 'F minor',
  'F# major', 'F# minor',
  'Gb major', 'Gb minor',
  'G major', 'G minor',
  'G# major', 'G# minor',
  'Ab major', 'Ab minor',
  'A major', 'A minor',
  'A# major', 'A# minor',
  'Bb major', 'Bb minor',
  'B major', 'B minor'
];

const TIME_SIGNATURES = [
  { value: '', label: 'Auto' },
  { value: '1', label: '1/4' },
  { value: '2', label: '2/4' },
  { value: '3', label: '3/4' },
  { value: '4', label: '4/4' },
  { value: '5', label: '5/4' },
  { value: '6', label: '6/8' },
  { value: '7', label: '7/8' },
  { value: '8', label: '8/8' },
];

const TRACK_NAMES = [
  'woodwinds', 'brass', 'fx', 'synth', 'strings', 'percussion',
  'keyboard', 'guitar', 'bass', 'drums', 'backing_vocals', 'vocals',
];

const VOCAL_LANGUAGE_KEYS = [
  { value: 'unknown', key: 'autoInstrumental' as const },
  { value: 'ar', key: 'vocalArabic' as const },
  { value: 'az', key: 'vocalAzerbaijani' as const },
  { value: 'bg', key: 'vocalBulgarian' as const },
  { value: 'bn', key: 'vocalBengali' as const },
  { value: 'ca', key: 'vocalCatalan' as const },
  { value: 'cs', key: 'vocalCzech' as const },
  { value: 'da', key: 'vocalDanish' as const },
  { value: 'de', key: 'vocalGerman' as const },
  { value: 'el', key: 'vocalGreek' as const },
  { value: 'en', key: 'vocalEnglish' as const },
  { value: 'es', key: 'vocalSpanish' as const },
  { value: 'fa', key: 'vocalPersian' as const },
  { value: 'fi', key: 'vocalFinnish' as const },
  { value: 'fr', key: 'vocalFrench' as const },
  { value: 'he', key: 'vocalHebrew' as const },
  { value: 'hi', key: 'vocalHindi' as const },
  { value: 'hr', key: 'vocalCroatian' as const },
  { value: 'ht', key: 'vocalHaitianCreole' as const },
  { value: 'hu', key: 'vocalHungarian' as const },
  { value: 'id', key: 'vocalIndonesian' as const },
  { value: 'is', key: 'vocalIcelandic' as const },
  { value: 'it', key: 'vocalItalian' as const },
  { value: 'ja', key: 'vocalJapanese' as const },
  { value: 'ko', key: 'vocalKorean' as const },
  { value: 'la', key: 'vocalLatin' as const },
  { value: 'lt', key: 'vocalLithuanian' as const },
  { value: 'ms', key: 'vocalMalay' as const },
  { value: 'ne', key: 'vocalNepali' as const },
  { value: 'nl', key: 'vocalDutch' as const },
  { value: 'no', key: 'vocalNorwegian' as const },
  { value: 'pa', key: 'vocalPunjabi' as const },
  { value: 'pl', key: 'vocalPolish' as const },
  { value: 'pt', key: 'vocalPortuguese' as const },
  { value: 'ro', key: 'vocalRomanian' as const },
  { value: 'ru', key: 'vocalRussian' as const },
  { value: 'sa', key: 'vocalSanskrit' as const },
  { value: 'sk', key: 'vocalSlovak' as const },
  { value: 'sr', key: 'vocalSerbian' as const },
  { value: 'sv', key: 'vocalSwedish' as const },
  { value: 'sw', key: 'vocalSwahili' as const },
  { value: 'ta', key: 'vocalTamil' as const },
  { value: 'te', key: 'vocalTelugu' as const },
  { value: 'th', key: 'vocalThai' as const },
  { value: 'tl', key: 'vocalTagalog' as const },
  { value: 'tr', key: 'vocalTurkish' as const },
  { value: 'uk', key: 'vocalUkrainian' as const },
  { value: 'ur', key: 'vocalUrdu' as const },
  { value: 'vi', key: 'vocalVietnamese' as const },
  { value: 'yue', key: 'vocalCantonese' as const },
  { value: 'zh', key: 'vocalChineseMandarin' as const },
];

export const CreatePanel: React.FC<CreatePanelProps> = ({
  onGenerate,
  isGenerating,
  activeJobCount = 0,
  maxConcurrentJobs = 4,
  initialData,
  createdSongs = [],
  pendingAudioSelection,
  onAudioSelectionApplied,
  pendingLyrics,
  onLyricsApplied,
  onPrepareTraining,
  onShowInfo,
}) => {
  const { isAuthenticated, token, user } = useAuth();
  const { t } = useI18n();

  // Mode
  const [customMode, setCustomMode] = useState(true);

  // Simple Mode
  const [songDescription, setSongDescription] = useState('');

  // Custom Mode
  const [lyrics, setLyrics] = useState('');
  const [style, setStyle] = useState('');
  const [title, setTitle] = useState('');

  // --- Expanded Tag System ---
  const PREMIUM_TAGS: string[] = [
    'energetic vocals', 'melancholic', 'aggressive', 'chill vibes', 'euphoric', 'dark mood',
    'uplifting', 'dreamy atmosphere', 'intense', 'romantic', 'nostalgic', 'powerful',
    'heavy bass', 'stereo', 'wide stereo mix', 'lo-fi production', 'crisp mix',
    'reverb vocals', 'distorted', 'clean production', 'analog warmth', 'punchy drums',
    'sub bass', 'sidechained', 'compressed', 'saturated', 'dynamic range',
    'male vocals', 'female vocals', 'deep voice', 'high pitch vocals', 'raspy vocals',
    'autotune', 'vocal chops', 'whispered vocals', 'choir', 'harmonies', 'ad-libs',
    'dynamic melody', 'changing pitch patterns', 'melodic variation', 'complex melody',
    'catchy hook', 'call and response', 'syncopated rhythm', 'polyrhythmic',
    'melodic guitar', 'piano melody', 'synth lead', 'brass section',
    'slow tempo', 'fast tempo', 'double time', 'half time', 'swing feel',
    'straight rhythm', 'bouncy', 'groovy', 'laid back',
    'build up', 'drop', 'breakdown', 'ambient intro', 'fade out',
  ];

  const [musicTags, setMusicTags] = useState<{ label: string; tier: 'default' | 'premium' }[]>([]);

  // Use a ref to read current style without closure dependency
  const styleRef = useRef(style);
  styleRef.current = style;

  const refreshMusicTags = useCallback(() => {
    const currentStyle = (styleRef.current || '').toLowerCase();
    const usedTags = new Set(currentStyle.split(',').map(t => t.trim().toLowerCase()).filter(Boolean));

    const availableDefault = MAIN_STYLES.filter(t => !usedTags.has(t.toLowerCase()));
    const shuffledDefault = [...availableDefault].sort(() => Math.random() - 0.5);
    const defaultPicks = shuffledDefault.slice(0, 4).map(label => ({ label, tier: 'default' as const }));

    const availablePremium = PREMIUM_TAGS.filter(t => !usedTags.has(t.toLowerCase()));
    const shuffledPremium = [...availablePremium].sort(() => Math.random() - 0.5);
    const premiumPicks = shuffledPremium.slice(0, 4).map(label => ({ label, tier: 'premium' as const }));

    setMusicTags([...defaultPicks, ...premiumPicks]);
  }, []);

  // Initialize tags on mount
  useEffect(() => {
    refreshMusicTags();
  }, [refreshMusicTags]);

  // Common
  const [instrumental, setInstrumental] = useState(false);
  const [vocalLanguage, setVocalLanguage] = useState('en');
  const [vocalGender, setVocalGender] = useState<'male' | 'female' | ''>('');

  // Music Parameters
  const [bpm, setBpm] = useState(0);
  const [keyScale, setKeyScale] = useState('');
  const [timeSignature, setTimeSignature] = useState('');

  // Section & Variation Controls
  const [sectionMeasures, setSectionMeasures] = useState(8); // bars per section block (4, 8, 16, 32)
  const [melodicVariation, setMelodicVariation] = useState(0.0); // 0 = default, 0.1-1.0 = experimental variation

  // APG Melodic Controls (base model only — fine-grained pitch/melody shaping)
  const [apgNormThreshold, setApgNormThreshold] = useState(2.5);
  const [apgMomentum, setApgMomentum] = useState(-0.75);
  const [apgEta, setApgEta] = useState(0.0);

  // Note Change Speed (LM-level — blocks repeating audio code patterns)
  const [noRepeatNgramSize, setNoRepeatNgramSize] = useState(0);

  // Vocal Style Injection (caption-level — influences how the model sings)
  const [vocalRange, setVocalRange] = useState(0);       // 0=default, 1=narrow, 2=moderate, 3=wide, 4=extreme
  const [vocalStyle, setVocalStyle] = useState(0);        // 0=default, 1=legato, 2=melismatic, 3=staccato, 4=breathy, 5=powerful
  const [noteSustain, setNoteSustain] = useState(0);      // 0=default, 1=short, 2=moderate, 3=long, 4=very long

  // Advanced Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [duration, setDuration] = useState(-1);
  const [batchSize, setBatchSize] = useState(() => {
    const stored = localStorage.getItem('ace-batchSize');
    return stored ? Number(stored) : 1;
  });
  const [bulkCount, setBulkCount] = useState(() => {
    const stored = localStorage.getItem('ace-bulkCount');
    return stored ? Number(stored) : 1;
  });
  const [guidanceScale, setGuidanceScale] = useState(9.0);
  const [randomSeed, setRandomSeed] = useState(true);
  const [seed, setSeed] = useState(-1);
  const [thinking, setThinking] = useState(false); // Default false for GPU compatibility
  const [enhance, setEnhance] = useState(false); // AI Enhance: uses LLM to enrich caption & generate metadata
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'flac'>('mp3');
  const [inferenceSteps, setInferenceSteps] = useState(12);
  const [inferMethod, setInferMethod] = useState<'ode' | 'sde'>('ode');
  const [lmBackend, setLmBackend] = useState<'pt' | 'vllm'>('pt');
  const [lmModel, setLmModel] = useState(() => {
    return localStorage.getItem('ace-lmModel') || 'acestep-5Hz-lm-0.6B';
  });
  const [shift, setShift] = useState(3.0);

  // LLM status tracking (from backend)
  const [llmStatus, setLlmStatus] = useState<{ loaded: boolean; model: string | null; backend: string | null } | null>(null);
  const [llmSwapping, setLlmSwapping] = useState(false);

  // LM Parameters (under Expert)
  const [showLmParams, setShowLmParams] = useState(false);
  const [showQuickLmParams, setShowQuickLmParams] = useState(false);
  const [lmTemperature, setLmTemperature] = useState(0.8);
  const [lmCfgScale, setLmCfgScale] = useState(2.2);
  const [lmTopK, setLmTopK] = useState(0);
  const [lmTopP, setLmTopP] = useState(0.92);
  const [lmNegativePrompt, setLmNegativePrompt] = useState('NO USER INPUT');

  // Expert Parameters (now in Advanced section)
  const [referenceAudioUrl, setReferenceAudioUrl] = useState('');
  const [sourceAudioUrl, setSourceAudioUrl] = useState('');
  const [referenceAudioTitle, setReferenceAudioTitle] = useState('');
  const [sourceAudioTitle, setSourceAudioTitle] = useState('');
  const [audioCodes, setAudioCodes] = useState('');
  const [isConvertingCodes, setIsConvertingCodes] = useState(false);
  const [repaintingStart, setRepaintingStart] = useState(0);
  const [repaintingEnd, setRepaintingEnd] = useState(-1);
  const [instruction, setInstruction] = useState('Fill the audio semantic mask based on the given conditions:');
  const [audioCoverStrength, setAudioCoverStrength] = useState(1.0); // reference strength
  const [sourceStrength, setSourceStrength] = useState(1.0); // source/cover strength (independent)
  const [taskType, setTaskType] = useState('text2music');

  // Variation Mode (advanced controls for cover mode)
  const [variationMode, setVariationMode] = useState(false);
  const [audioInfluence, setAudioInfluence] = useState(75); // 0-100%, how much to resemble original audio
  const [styleInfluence, setStyleInfluence] = useState(50); // 0-100%, how much to match style description
  const [weirdness, setWeirdness] = useState(30); // 0-100%, creative randomness

  // Repaint & Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [editAction, setEditAction] = useState<'repaint' | 'extend'>('repaint'); // repaint a section or extend after end
  const [editTarget, setEditTarget] = useState<'both' | 'vocals' | 'instrumental'>('both'); // what to regenerate
  const [editStart, setEditStart] = useState(0); // seconds
  const [editEnd, setEditEnd] = useState(-1); // -1 = until end

  // Random Reference Folder Mode
  const [randomRefMode, setRandomRefMode] = useState(false);
  const [randomRefFolder, setRandomRefFolder] = useState('');
  const [randomRefFiles, setRandomRefFiles] = useState<{ name: string; path: string; size: number }[]>([]);
  const [isLoadingRefFolder, setIsLoadingRefFolder] = useState(false);
  const [randomRefError, setRandomRefError] = useState<string | null>(null);
  const [randomRefSignal, setRandomRefSignal] = useState(50); // 0-100%, signal strength from random ref songs
  const [useAdg, setUseAdg] = useState(false);
  const [cfgIntervalStart, setCfgIntervalStart] = useState(0.0);
  const [cfgIntervalEnd, setCfgIntervalEnd] = useState(1.0);
  const [customTimesteps, setCustomTimesteps] = useState('');
  const [useCotMetas, setUseCotMetas] = useState(true);
  const [useCotCaption, setUseCotCaption] = useState(true);
  const [useCotLanguage, setUseCotLanguage] = useState(true);
  const [autogen, setAutogen] = useState(false);
  const [constrainedDecodingDebug, setConstrainedDecodingDebug] = useState(false);
  const [allowLmBatch, setAllowLmBatch] = useState(true);
  const [getScores, setGetScores] = useState(false);
  const [getLrc, setGetLrc] = useState(false);
  const [scoreScale, setScoreScale] = useState(0.5);
  const [lmBatchChunkSize, setLmBatchChunkSize] = useState(8);
  const [trackName, setTrackName] = useState('');
  const [completeTrackClasses, setCompleteTrackClasses] = useState('');
  const [isFormatCaption, setIsFormatCaption] = useState(false);
  const [alignToMeasures, setAlignToMeasures] = useState(false);
  const [maxDurationWithLm, setMaxDurationWithLm] = useState(240);
  const [maxDurationWithoutLm, setMaxDurationWithoutLm] = useState(240);

  // LoRA Parameters
  const [showLoraPanel, setShowLoraPanel] = useState(false);
  const [loraPath, setLoraPath] = useState('./lora_library');
  const [loraLoaded, setLoraLoaded] = useState(false);
  const [loraEnabled, setLoraEnabled] = useState(true);
  const [loraScale, setLoraScale] = useState(1.0);
  const [loraError, setLoraError] = useState<string | null>(null);
  const [isLoraLoading, setIsLoraLoading] = useState(false);
  const [loraTriggerTag, setLoraTriggerTag] = useState<string>('');
  const [loraTagPosition, setLoraTagPosition] = useState<string>('prepend');

  // LoRA list (dropdown selector)
  type LoraVariant = { label: string; path: string; epoch?: number };
  type LoraListEntry = {
    name: string;
    source: 'library' | 'output';
    sourceDir: string;
    variants: LoraVariant[];
    metadata?: { trigger_tag?: string; tag_position?: string; [key: string]: unknown };
    baseModel?: string;
  };
  const [loraList, setLoraList] = useState<LoraListEntry[]>([]);
  const [loraListLoading, setLoraListLoading] = useState(false);
  const [selectedLoraName, setSelectedLoraName] = useState<string>('');
  const [selectedLoraVariant, setSelectedLoraVariant] = useState<string>('');

  // Model download state
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set());
  const [downloadStatus, setDownloadStatus] = useState<Record<string, { status: string; progress: string; error?: string }>>({});

  // Floating LoRA Manager
  const [showLoraManager, setShowLoraManager] = useState(false);

  // LoRA browser state
  const [showLoraBrowser, setShowLoraBrowser] = useState(false);
  const [loraBrowsePath, setLoraBrowsePath] = useState('');
  const [loraBrowseEntries, setLoraBrowseEntries] = useState<{ name: string; type: 'dir' | 'file'; fullPath: string; isAdapter: boolean }[]>([]);
  const [loraBrowseParent, setLoraBrowseParent] = useState('');
  const [loraBrowseCurrentPath, setLoraBrowseCurrentPath] = useState('');
  const [loraBrowseRelativePath, setLoraBrowseRelativePath] = useState('');
  const [loraBrowseLoading, setLoraBrowseLoading] = useState(false);

  // Model selection
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ace-model') || 'acestep-v15-turbo-shift3';
  });
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuPortalRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const previousModelRef = useRef<string>(selectedModel);
  const loraScaleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Available models fetched from backend
  const [fetchedModels, setFetchedModels] = useState<{ name: string; is_active: boolean; is_preloaded: boolean }[]>([]);

  // Fallback model list when backend is unavailable
  const availableModels = useMemo(() => {
    if (fetchedModels.length > 0) {
      return fetchedModels.map(m => ({ id: m.name, name: m.name }));
    }
    return [
      { id: 'acestep-v15-base', name: 'acestep-v15-base' },
      { id: 'acestep-v15-sft', name: 'acestep-v15-sft' },
      { id: 'acestep-v15-turbo', name: 'acestep-v15-turbo' },
      { id: 'acestep-v15-turbo-shift1', name: 'acestep-v15-turbo-shift1' },
      { id: 'acestep-v15-turbo-shift3', name: 'acestep-v15-turbo-shift3' },
      { id: 'acestep-v15-turbo-continuous', name: 'acestep-v15-turbo-continuous' },
    ];
  }, [fetchedModels]);

  // Map model ID to short display name
  const getModelDisplayName = (modelId: string): string => {
    const mapping: Record<string, string> = {
      'acestep-v15-base': '1.5B',
      'acestep-v15-sft': '1.5S',
      'acestep-v15-turbo-shift1': '1.5TS1',
      'acestep-v15-turbo-shift3': '1.5TS3',
      'acestep-v15-turbo-continuous': '1.5TC',
      'acestep-v15-turbo': '1.5T',
    };
    return mapping[modelId] || modelId;
  };

  // Check if model is a turbo variant
  const isTurboModel = (modelId: string): boolean => {
    return modelId.includes('turbo');
  };

  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isTranscribingReference, setIsTranscribingReference] = useState(false);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isFormattingStyle, setIsFormattingStyle] = useState(false);
  const [isFormattingLyrics, setIsFormattingLyrics] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragKind, setDragKind] = useState<'file' | 'audio' | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const vocalInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioModalTarget, setAudioModalTarget] = useState<'reference' | 'source'>('reference');
  const [tempAudioUrl, setTempAudioUrl] = useState('');
  const [audioTab, setAudioTab] = useState<'reference' | 'source' | 'vocal'>('reference');
  const referenceAudioRef = useRef<HTMLAudioElement>(null);
  const sourceAudioRef = useRef<HTMLAudioElement>(null);
  const vocalAudioRef = useRef<HTMLAudioElement>(null);
  const [referencePlaying, setReferencePlaying] = useState(false);
  const [sourcePlaying, setSourcePlaying] = useState(false);
  const [vocalPlaying, setVocalPlaying] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [sourceTime, setSourceTime] = useState(0);
  const [vocalTime, setVocalTime] = useState(0);
  const [referenceDuration, setReferenceDuration] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [vocalDuration, setVocalDuration] = useState(0);

  // Vocal separation state
  const [vocalAudioUrl, setVocalAudioUrl] = useState('');
  const [vocalAudioTitle, setVocalAudioTitle] = useState('');
  const [instrumentalAudioUrl, setInstrumentalAudioUrl] = useState('');
  const [isSeparating, setIsSeparating] = useState(false);
  const [separationQuality, setSeparationQuality] = useState<'rapida' | 'alta' | 'maxima'>('alta');
  const [useVocalAsReference, setUseVocalAsReference] = useState(true);
  const [useInstrumentalAsSource, setUseInstrumentalAsSource] = useState(false);
  
  // Vocal workflow modals
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [showCoverSongModal, setShowCoverSongModal] = useState(false);

  // Voice presets
  const [voicePresets, setVoicePresets] = useState<Array<{
    id: string; name: string; audio_url: string; thumbnail_url: string | null; duration: number | null; created_at: string;
  }>>([]);
  const [showVoicePresets, setShowVoicePresets] = useState(false);
  const [isSavingVoicePreset, setIsSavingVoicePreset] = useState(false);
  const [showSaveVoiceInput, setShowSaveVoiceInput] = useState(false);
  const [voicePresetName, setVoicePresetName] = useState('');
  const [presetWaveforms, setPresetWaveforms] = useState<Record<string, number[]>>({});

  // VRAM monitor
  const [vramStatus, setVramStatus] = useState<{
    used_mb: number; total_mb: number; free_mb: number; usage_percent: number;
    name: string; temperature: number; utilization: number;
  } | null>(null);
  const [vramExpanded, setVramExpanded] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [vramWarning, setVramWarning] = useState(false);
  const [lastPurgeResult, setLastPurgeResult] = useState<string | null>(null);
  const vramPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reference tracks modal state
  const [referenceTracks, setReferenceTracks] = useState<ReferenceTrack[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playingTrackSource, setPlayingTrackSource] = useState<'uploads' | 'created' | null>(null);
  const modalAudioRef = useRef<HTMLAudioElement>(null);
  const [modalTrackTime, setModalTrackTime] = useState(0);
  const [modalTrackDuration, setModalTrackDuration] = useState(0);
  const [libraryTab, setLibraryTab] = useState<'uploads' | 'created'>('uploads');

  const createdTrackOptions = useMemo(() => {
    return createdSongs
      .filter(song => !song.isGenerating)
      .filter(song => (user ? song.userId === user.id : true))
      .filter(song => Boolean(song.audioUrl))
      .map(song => ({
        id: song.id,
        title: song.title || 'Untitled',
        audio_url: song.audioUrl!,
        duration: song.duration,
      }));
  }, [createdSongs, user]);

  const getAudioLabel = (url: string) => {
    try {
      const parsed = new URL(url);
      const name = decodeURIComponent(parsed.pathname.split('/').pop() || parsed.hostname);
      return name.replace(/\.[^/.]+$/, '') || name;
    } catch {
      const parts = url.split('/');
      const name = decodeURIComponent(parts[parts.length - 1] || url);
      return name.replace(/\.[^/.]+$/, '') || name;
    }
  };

  // Preset system
  interface Preset {
    name: string;
    createdAt: string;
    config: {
      customMode: boolean;
      songDescription: string;
      lyrics: string;
      style: string;
      title: string;
      instrumental: boolean;
      vocalLanguage: string;
      vocalGender: string;
      bpm: number;
      keyScale: string;
      timeSignature: string;
      duration: number;
      batchSize: number;
      guidanceScale: number;
      inferenceSteps: number;
      inferMethod: string;
      shift: number;
      audioFormat: string;
      thinking: boolean;
      enhance: boolean;
      lmBackend: string;
      lmModel: string;
      lmTemperature: number;
      lmCfgScale: number;
      lmTopK: number;
      lmTopP: number;
      lmNegativePrompt: string;
      selectedModel: string;
      loraPath: string;
      loraScale: number;
      loraEnabled: boolean;
      loraTriggerTag: string;
      loraTagPosition: string;
      // Extended params (v2)
      instruction?: string;
      seed?: number;
      randomSeed?: boolean;
      melodicVariation?: number;
      lmRepetitionPenalty?: number;
      noRepeatNgramSize?: number;
      useCotMetas?: boolean;
      useCotCaption?: boolean;
      useCotLanguage?: boolean;
      useAdg?: boolean;
      cfgIntervalStart?: number;
      cfgIntervalEnd?: number;
      taskType?: string;
      repaintingStart?: number;
      repaintingEnd?: number;
      audioCoverStrength?: number;
      constrainedDecodingDebug?: boolean;
      allowLmBatch?: boolean;
      getScores?: boolean;
      getLrc?: boolean;
      scoreScale?: number;
      lmBatchChunkSize?: number;
    };
  }

  const [presets, setPresets] = useState<Preset[]>(() => {
    try {
      const stored = localStorage.getItem('ace-presets');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement>(null);

  const savePreset = (name: string) => {
    const preset: Preset = {
      name,
      createdAt: new Date().toISOString(),
      config: {
        customMode, songDescription, lyrics, style, title, instrumental,
        vocalLanguage, vocalGender, bpm, keyScale, timeSignature, duration,
        batchSize, guidanceScale, inferenceSteps, inferMethod, shift,
        audioFormat, thinking, enhance, lmBackend, lmModel, lmTemperature,
        lmCfgScale, lmTopK, lmTopP, lmNegativePrompt, selectedModel,
        loraPath, loraScale, loraEnabled, loraTriggerTag, loraTagPosition,
        // Extended params (v2)
        instruction, seed, randomSeed, melodicVariation,
        lmRepetitionPenalty: 1.0 + melodicVariation * 0.5,
        useCotMetas, useCotCaption, useCotLanguage,
        useAdg, cfgIntervalStart, cfgIntervalEnd,
        taskType, repaintingStart, repaintingEnd, audioCoverStrength,
        constrainedDecodingDebug, allowLmBatch,
        getScores, getLrc, scoreScale, lmBatchChunkSize,
      },
    };
    const updated = [preset, ...presets.filter(p => p.name !== name)];
    setPresets(updated);
    localStorage.setItem('ace-presets', JSON.stringify(updated));
    setShowSavePreset(false);
    setPresetName('');
  };

  const loadPreset = (preset: Preset) => {
    const c = preset.config;
    setCustomMode(c.customMode);
    setSongDescription(c.songDescription || '');
    setLyrics(c.lyrics || '');
    setStyle(c.style || '');
    setTitle(c.title || '');
    setInstrumental(c.instrumental);
    setVocalLanguage(c.vocalLanguage || 'en');
    setVocalGender(c.vocalGender as any || '');
    setBpm(c.bpm ?? 0);
    setKeyScale(c.keyScale || '');
    setTimeSignature(c.timeSignature || '');
    setDuration(c.duration ?? -1);
    setBatchSize(c.batchSize ?? 1);
    setGuidanceScale(c.guidanceScale ?? 9);
    setInferenceSteps(c.inferenceSteps ?? 12);
    setInferMethod(c.inferMethod as any || 'ode');
    setShift(c.shift ?? 3);
    setAudioFormat(c.audioFormat as any || 'mp3');
    setThinking(c.thinking ?? false);
    setEnhance(c.enhance ?? false);
    setLmBackend(c.lmBackend as any || 'pt');
    setLmModel(c.lmModel || 'acestep-5Hz-lm-0.6B');
    setLmTemperature(c.lmTemperature ?? 0.8);
    setLmCfgScale(c.lmCfgScale ?? 2.2);
    setLmTopK(c.lmTopK ?? 0);
    setLmTopP(c.lmTopP ?? 0.92);
    setLmNegativePrompt(c.lmNegativePrompt || 'NO USER INPUT');
    setSelectedModel(c.selectedModel || 'acestep-v15-turbo-shift3');
    setLoraPath(c.loraPath || './lora_library');
    setLoraScale(c.loraScale ?? 1.0);
    setLoraEnabled(c.loraEnabled ?? true);
    setLoraTriggerTag(c.loraTriggerTag || '');
    setLoraTagPosition(c.loraTagPosition || 'prepend');
    // Extended params (v2) — with backward-compat defaults
    if (c.instruction !== undefined) setInstruction(c.instruction);
    if (c.seed !== undefined) setSeed(c.seed);
    if (c.randomSeed !== undefined) setRandomSeed(c.randomSeed);
    if (c.melodicVariation !== undefined) setMelodicVariation(c.melodicVariation);
    if (c.useCotMetas !== undefined) setUseCotMetas(c.useCotMetas);
    if (c.useCotCaption !== undefined) setUseCotCaption(c.useCotCaption);
    if (c.useCotLanguage !== undefined) setUseCotLanguage(c.useCotLanguage);
    if (c.useAdg !== undefined) setUseAdg(c.useAdg);
    if (c.cfgIntervalStart !== undefined) setCfgIntervalStart(c.cfgIntervalStart);
    if (c.cfgIntervalEnd !== undefined) setCfgIntervalEnd(c.cfgIntervalEnd);
    if (c.taskType !== undefined) setTaskType(c.taskType);
    if (c.repaintingStart !== undefined) setRepaintingStart(c.repaintingStart);
    if (c.repaintingEnd !== undefined) setRepaintingEnd(c.repaintingEnd);
    if (c.audioCoverStrength !== undefined) setAudioCoverStrength(c.audioCoverStrength);
    if (c.constrainedDecodingDebug !== undefined) setConstrainedDecodingDebug(c.constrainedDecodingDebug);
    if (c.allowLmBatch !== undefined) setAllowLmBatch(c.allowLmBatch);
    if (c.getScores !== undefined) setGetScores(c.getScores);
    if (c.getLrc !== undefined) setGetLrc(c.getLrc);
    if (c.scoreScale !== undefined) setScoreScale(c.scoreScale);
    if (c.lmBatchChunkSize !== undefined) setLmBatchChunkSize(c.lmBatchChunkSize);
    setShowPresetMenu(false);
  };

  const deletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    localStorage.setItem('ace-presets', JSON.stringify(updated));
  };

  // Resize Logic
  const [lyricsHeight, setLyricsHeight] = useState(() => {
    const saved = localStorage.getItem('acestep_lyrics_height');
    return saved ? parseInt(saved, 10) : 144; // Default h-36 is 144px (9rem * 16)
  });
  const [isResizing, setIsResizing] = useState(false);
  const lyricsRef = useRef<HTMLDivElement>(null);


  // ═══ UIBridge: bidirectional sync with ChatAssistant ═══

  // Ref-based state provider (avoids re-registering on every render)
  const getUIStateRef = useRef<() => UIState>(() => ({} as UIState));
  getUIStateRef.current = (): UIState => ({
    customMode, songDescription, lyrics, style, title, instrumental, vocalLanguage, vocalGender,
    bpm, keyScale, timeSignature,
    inferenceSteps, guidanceScale, shift, inferMethod, thinking, enhance, audioFormat,
    duration, batchSize, bulkCount, randomSeed, seed,
    taskType, selectedModel, lmBackend, lmModel,
    lmTemperature, lmCfgScale, lmTopK, lmTopP, lmNegativePrompt,
    referenceAudioUrl, referenceAudioTitle, sourceAudioUrl, sourceAudioTitle,
    audioCoverStrength, sourceStrength, audioCodes,
    repaintingStart, repaintingEnd, instruction,
    editMode, editAction, editTarget, editStart, editEnd,
    loraPath, loraLoaded, loraEnabled, loraScale, loraTriggerTag, loraTagPosition,
    selectedLoraName, selectedLoraVariant,
    loraList: loraList.map(l => ({ name: l.name, source: l.source, variants: l.variants?.map(v => v.label), metadata: l.metadata })),
    variationMode, audioInfluence, styleInfluence, weirdness,
    sectionMeasures, melodicVariation,
    apgNormThreshold, apgMomentum, apgEta,
    noRepeatNgramSize, vocalRange, vocalStyle, noteSustain,
    useAdg, cfgIntervalStart, cfgIntervalEnd,
    useCotMetas, useCotCaption, useCotLanguage, autogen,
    getScores, getLrc, scoreScale, lmBatchChunkSize,
    alignToMeasures, isFormatCaption,
    maxDurationWithLm, maxDurationWithoutLm,
    trackName, completeTrackClasses,
    vocalAudioUrl, vocalAudioTitle, instrumentalAudioUrl,
    separationQuality, useVocalAsReference, useInstrumentalAsSource,
    fetchedModels: fetchedModels.map(m => ({ name: m.name, is_active: m.is_active, is_preloaded: m.is_preloaded })),
    vramStatus: vramStatus ? { used_mb: vramStatus.used_mb, total_mb: vramStatus.total_mb, free_mb: vramStatus.free_mb, percent: vramStatus.usage_percent } : null,
    llmStatus: llmStatus ? { loaded: llmStatus.loaded, model: llmStatus.model || '', backend: llmStatus.backend || '' } : null,
    musicTags: musicTags.map(t => ({ label: t.label, tier: t.tier })),
  });

  // Register state provider once
  useEffect(() => {
    uiBridge.registerStateProvider(() => getUIStateRef.current());
    return () => uiBridge.unregisterStateProvider();
  }, []);

  // Subscribe to actions from ChatAssistant
  useEffect(() => {
    const unsub = uiBridge.onAction((action: UIAction) => {
      if (action.type === 'set') {
        const p = action.params;
        // Core fields
        if (p.customMode !== undefined) setCustomMode(p.customMode);
        if (p.songDescription !== undefined) setSongDescription(p.songDescription);
        if (p.lyrics !== undefined) setLyrics(p.lyrics);
        if (p.style !== undefined) setStyle(p.style);
        if (p.title !== undefined) setTitle(p.title);
        if (p.instrumental !== undefined) setInstrumental(p.instrumental);
        if (p.vocalLanguage !== undefined) setVocalLanguage(p.vocalLanguage);
        if (p.vocalGender !== undefined) setVocalGender(p.vocalGender as any);
        // Music theory
        if (p.bpm !== undefined) setBpm(Number(p.bpm));
        if (p.keyScale !== undefined) setKeyScale(p.keyScale);
        if (p.timeSignature !== undefined) setTimeSignature(p.timeSignature);
        // Quality
        if (p.inferenceSteps !== undefined) setInferenceSteps(Number(p.inferenceSteps));
        if (p.guidanceScale !== undefined) setGuidanceScale(Number(p.guidanceScale));
        if (p.shift !== undefined) setShift(Number(p.shift));
        if (p.inferMethod !== undefined) setInferMethod(p.inferMethod as any);
        if (p.thinking !== undefined) setThinking(p.thinking);
        if (p.enhance !== undefined) setEnhance(p.enhance);
        if (p.audioFormat !== undefined) setAudioFormat(p.audioFormat as any);
        // Duration / batch
        if (p.duration !== undefined) setDuration(Number(p.duration));
        if (p.batchSize !== undefined) setBatchSize(Number(p.batchSize));
        if (p.bulkCount !== undefined) setBulkCount(Number(p.bulkCount));
        if (p.randomSeed !== undefined) setRandomSeed(p.randomSeed);
        if (p.seed !== undefined) setSeed(Number(p.seed));
        // Task type
        if (p.taskType !== undefined) setTaskType(p.taskType);
        // Model
        if (p.selectedModel !== undefined) setSelectedModel(p.selectedModel);
        if (p.lmBackend !== undefined) setLmBackend(p.lmBackend as any);
        if (p.lmModel !== undefined) setLmModel(p.lmModel);
        // LM sampling
        if (p.lmTemperature !== undefined) setLmTemperature(Number(p.lmTemperature));
        if (p.lmCfgScale !== undefined) setLmCfgScale(Number(p.lmCfgScale));
        if (p.lmTopK !== undefined) setLmTopK(Number(p.lmTopK));
        if (p.lmTopP !== undefined) setLmTopP(Number(p.lmTopP));
        if (p.lmNegativePrompt !== undefined) setLmNegativePrompt(p.lmNegativePrompt);
        // Audio references
        if (p.referenceAudioUrl !== undefined) setReferenceAudioUrl(p.referenceAudioUrl);
        if (p.referenceAudioTitle !== undefined) setReferenceAudioTitle(p.referenceAudioTitle);
        if (p.sourceAudioUrl !== undefined) setSourceAudioUrl(p.sourceAudioUrl);
        if (p.sourceAudioTitle !== undefined) setSourceAudioTitle(p.sourceAudioTitle);
        if (p.audioCoverStrength !== undefined) setAudioCoverStrength(Number(p.audioCoverStrength));
        if (p.sourceStrength !== undefined) setSourceStrength(Number(p.sourceStrength));
        // Repaint / edit
        if (p.repaintingStart !== undefined) setRepaintingStart(Number(p.repaintingStart));
        if (p.repaintingEnd !== undefined) setRepaintingEnd(Number(p.repaintingEnd));
        if (p.instruction !== undefined) setInstruction(p.instruction);
        if (p.editMode !== undefined) setEditMode(p.editMode);
        if (p.editAction !== undefined) setEditAction(p.editAction as any);
        if (p.editTarget !== undefined) setEditTarget(p.editTarget as any);
        if (p.editStart !== undefined) setEditStart(Number(p.editStart));
        if (p.editEnd !== undefined) setEditEnd(Number(p.editEnd));
        // LoRA
        if (p.loraPath !== undefined) setLoraPath(p.loraPath);
        if (p.loraEnabled !== undefined) setLoraEnabled(p.loraEnabled);
        if (p.loraScale !== undefined) setLoraScale(Number(p.loraScale));
        if (p.loraTriggerTag !== undefined) setLoraTriggerTag(p.loraTriggerTag);
        if (p.loraTagPosition !== undefined) setLoraTagPosition(p.loraTagPosition);
        if (p.selectedLoraName !== undefined) setSelectedLoraName(p.selectedLoraName);
        if (p.selectedLoraVariant !== undefined) setSelectedLoraVariant(p.selectedLoraVariant);
        // Variation mode
        if (p.variationMode !== undefined) setVariationMode(p.variationMode);
        if (p.audioInfluence !== undefined) setAudioInfluence(Number(p.audioInfluence));
        if (p.styleInfluence !== undefined) setStyleInfluence(Number(p.styleInfluence));
        if (p.weirdness !== undefined) setWeirdness(Number(p.weirdness));
        // Melodic / APG
        if (p.sectionMeasures !== undefined) setSectionMeasures(Number(p.sectionMeasures));
        if (p.melodicVariation !== undefined) setMelodicVariation(Number(p.melodicVariation));
        if (p.apgNormThreshold !== undefined) setApgNormThreshold(Number(p.apgNormThreshold));
        if (p.apgMomentum !== undefined) setApgMomentum(Number(p.apgMomentum));
        if (p.apgEta !== undefined) setApgEta(Number(p.apgEta));
        if (p.noRepeatNgramSize !== undefined) setNoRepeatNgramSize(Number(p.noRepeatNgramSize));
        if (p.vocalRange !== undefined) setVocalRange(Number(p.vocalRange));
        if (p.vocalStyle !== undefined) setVocalStyle(Number(p.vocalStyle));
        if (p.noteSustain !== undefined) setNoteSustain(Number(p.noteSustain));
        // Advanced toggles
        if (p.useAdg !== undefined) setUseAdg(p.useAdg);
        if (p.cfgIntervalStart !== undefined) setCfgIntervalStart(Number(p.cfgIntervalStart));
        if (p.cfgIntervalEnd !== undefined) setCfgIntervalEnd(Number(p.cfgIntervalEnd));
        if (p.useCotMetas !== undefined) setUseCotMetas(p.useCotMetas);
        if (p.useCotCaption !== undefined) setUseCotCaption(p.useCotCaption);
        if (p.useCotLanguage !== undefined) setUseCotLanguage(p.useCotLanguage);
        if (p.autogen !== undefined) setAutogen(p.autogen);
        if (p.getScores !== undefined) setGetScores(p.getScores);
        if (p.getLrc !== undefined) setGetLrc(p.getLrc);
        if (p.scoreScale !== undefined) setScoreScale(Number(p.scoreScale));
        if (p.lmBatchChunkSize !== undefined) setLmBatchChunkSize(Number(p.lmBatchChunkSize));
        if (p.alignToMeasures !== undefined) setAlignToMeasures(p.alignToMeasures);
        if (p.isFormatCaption !== undefined) setIsFormatCaption(p.isFormatCaption);
        if (p.trackName !== undefined) setTrackName(p.trackName);
        if (p.completeTrackClasses !== undefined) setCompleteTrackClasses(p.completeTrackClasses);
        // Vocal separation
        if (p.separationQuality !== undefined) setSeparationQuality(p.separationQuality as any);
        if (p.useVocalAsReference !== undefined) setUseVocalAsReference(p.useVocalAsReference);
        if (p.useInstrumentalAsSource !== undefined) setUseInstrumentalAsSource(p.useInstrumentalAsSource);
      } else if (action.type === 'swapModel') {
        setSelectedModel(action.model);
        localStorage.setItem('ace-model', action.model);
      } else if (action.type === 'generate') {
        // Programmatic generation trigger — will be handled by clicking the generate button
        // We emit a custom event that the generate button can listen to
        document.dispatchEvent(new CustomEvent('ace-bridge-generate'));
      }
    });
    return unsub;
  }, []);

  // ═══ End UIBridge ═══

  // Close model menu when clicking outside (checks both button wrapper and portal)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inButton = modelMenuRef.current?.contains(target);
      const inPortal = modelMenuPortalRef.current?.contains(target);
      if (!inButton && !inPortal) {
        setShowModelMenu(false);
      }
    };

    if (showModelMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelMenu]);

  // Close preset menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(event.target as Node)) {
        setShowPresetMenu(false);
        setShowSavePreset(false);
      }
    };
    if (showPresetMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPresetMenu]);

  // Auto-unload LoRA when model changes
  useEffect(() => {
    if (previousModelRef.current !== selectedModel && loraLoaded) {
      void handleLoraUnload();
    }
    previousModelRef.current = selectedModel;
  }, [selectedModel, loraLoaded]);

  // Auto-disable thinking and ADG when LoRA is loaded
  useEffect(() => {
    if (loraLoaded) {
      if (thinking) setThinking(false);
      if (useAdg) setUseAdg(false);
    }
  }, [loraLoaded]);

  // Sync LoRA state from backend on mount (fixes desync after browser refresh)
  useEffect(() => {
    if (!token) return;
    const syncLoraState = async () => {
      try {
        const status = await generateApi.getLoraStatus(token);
        if (status.loaded) {
          setLoraLoaded(true);
          setLoraEnabled(status.active);
          setLoraScale(status.scale ?? 1.0);
          if (status.path) setLoraPath(status.path);
          if (status.trigger_tag) setLoraTriggerTag(status.trigger_tag);
          if (status.tag_position) setLoraTagPosition(status.tag_position === 'replace' ? 'prepend' : status.tag_position);
          // Try to match to a LoRA list entry by name
          if (status.name) setSelectedLoraName(status.name);
          console.log('[LoRA] Synced state from backend: loaded, scale=' + status.scale);
        }
      } catch {
        // Backend not available — keep defaults
      }
    };
    void syncLoraState();
  }, [token]);

  // Voice presets — load on mount
  useEffect(() => {
    if (!token) return;
    voicesApi.list(token).then(setVoicePresets).catch(err => console.error('Failed to load voice presets:', err));
  }, [token]);

  // Fetch backend LLM status on mount and when lmModel changes
  const fetchLlmStatus = useCallback(async () => {
    try {
      const status = await generateApi.getBackendStatus();
      setLlmStatus(status.llm);
    } catch {
      // Backend not available
    }
  }, []);
  useEffect(() => { void fetchLlmStatus(); }, [fetchLlmStatus]);

  // Handler to swap LLM model
  const handleLlmSwap = useCallback(async () => {
    if (!token || llmSwapping) return;
    setLlmSwapping(true);
    try {
      const result = await generateApi.swapLlmModel(lmModel, lmBackend, token);
      if (result.success) {
        setLlmStatus({ loaded: true, model: result.model, backend: result.backend });
      } else {
        alert(`LLM swap failed: ${result.message}`);
      }
    } catch (err) {
      alert(`LLM swap error: ${(err as Error).message}`);
    } finally {
      setLlmSwapping(false);
    }
  }, [token, lmModel, lmBackend, llmSwapping]);

  const fetchVoicePresets = useCallback(async () => {
    if (!token) return;
    try {
      const presets = await voicesApi.list(token);
      setVoicePresets(presets);
    } catch (err) {
      console.error('Failed to fetch voice presets:', err);
    }
  }, [token]);

  const saveVoicePreset = async () => {
    if (!token || !vocalAudioUrl || !voicePresetName.trim()) return;
    setIsSavingVoicePreset(true);
    try {
      const preset = await voicesApi.create(voicePresetName.trim(), vocalAudioUrl, vocalDuration || undefined, token);
      setVoicePresets(prev => [preset, ...prev]);
      setShowSaveVoiceInput(false);
      setVoicePresetName('');
      // Generate waveform for the new preset
      generateWaveformForUrl(preset.audio_url, preset.id);
    } catch (err) {
      console.error('Failed to save voice preset:', err);
    } finally {
      setIsSavingVoicePreset(false);
    }
  };

  const deleteVoicePreset = async (id: string) => {
    if (!token) return;
    try {
      await voicesApi.delete(id, token);
      setVoicePresets(prev => prev.filter(p => p.id !== id));
      setPresetWaveforms(prev => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      console.error('Failed to delete voice preset:', err);
    }
  };

  const loadVoicePreset = (preset: { name: string; audio_url: string; duration: number | null }) => {
    setVocalAudioUrl(preset.audio_url);
    setVocalAudioTitle(preset.name);
    setVocalTime(0);
    setVocalDuration(preset.duration || 0);
    setShowVoicePresets(false);
  };

  // Waveform generation from audio URL using offline decoding
  const generateWaveformForUrl = useCallback((url: string, presetId: string) => {
    const NUM_BARS = 24;
    fetch(url)
      .then(res => res.arrayBuffer())
      .then(arrayBuffer => {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        return ctx.decodeAudioData(arrayBuffer).then(audioBuffer => {
          const channelData = audioBuffer.getChannelData(0);
          const blockSize = Math.floor(channelData.length / NUM_BARS);
          const bars: number[] = [];
          for (let i = 0; i < NUM_BARS; i++) {
            let sum = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(channelData[start + j]);
            }
            bars.push(sum / blockSize);
          }
          // Normalize to 0-1
          const max = Math.max(...bars, 0.001);
          const normalized = bars.map(v => v / max);
          setPresetWaveforms(prev => ({ ...prev, [presetId]: normalized }));
          ctx.close();
        });
      })
      .catch(() => {
        // Fallback: seeded pseudo-random waveform based on presetId hash
        const seed = presetId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const fallback = Array.from({ length: NUM_BARS }, (_, i) => 0.2 + (Math.sin(seed + i * 1.7) * 0.5 + 0.5) * 0.6);
        setPresetWaveforms(prev => ({ ...prev, [presetId]: fallback }));
      });
  }, []);

  // Generate waveforms for loaded presets
  useEffect(() => {
    voicePresets.forEach(preset => {
      if (!presetWaveforms[preset.id]) {
        generateWaveformForUrl(preset.audio_url, preset.id);
      }
    });
  }, [voicePresets, presetWaveforms, generateWaveformForUrl]);

  // VRAM monitoring — poll every 10s when visible, 30s when collapsed
  const VRAM_WARNING_THRESHOLD = 90; // percent

  const fetchVramStatus = useCallback(async () => {
    if (!token) return;
    try {
      const data = await vramApi.status(token);
      if (data.primary_gpu) {
        setVramStatus(data.primary_gpu);
        const high = data.primary_gpu.usage_percent >= VRAM_WARNING_THRESHOLD;
        setVramWarning(high);
      }
    } catch {
      // Silently fail — GPU monitoring is optional
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    // Initial fetch
    fetchVramStatus();
    // Poll interval
    const interval = vramExpanded ? 10000 : 30000;
    vramPollRef.current = setInterval(fetchVramStatus, interval);
    return () => {
      if (vramPollRef.current) clearInterval(vramPollRef.current);
    };
  }, [token, vramExpanded, fetchVramStatus]);

  const handleVramPurge = async () => {
    if (!token || isPurging) return;
    setIsPurging(true);
    setLastPurgeResult(null);
    try {
      const result = await vramApi.purge(token);
      const freed = result.nvidia_freed_mb;
      setLastPurgeResult(freed > 0 ? `Freed ${freed} MB` : 'Cache cleared');
      // Refresh status
      await fetchVramStatus();
      // Clear the result message after 4s
      setTimeout(() => setLastPurgeResult(null), 4000);
    } catch (err) {
      setLastPurgeResult('Purge failed');
      setTimeout(() => setLastPurgeResult(null), 4000);
    } finally {
      setIsPurging(false);
    }
  };

  // LoRA API handlers
  const handleLoraToggle = async () => {
    if (!token) {
      setLoraError('Please sign in to use LoRA');
      return;
    }
    if (!loraPath.trim()) {
      setLoraError('Please enter a LoRA path');
      return;
    }

    setIsLoraLoading(true);
    setLoraError(null);

    try {
      if (loraLoaded) {
        await handleLoraUnload();
      } else {
        const result = await generateApi.loadLora({ lora_path: loraPath }, token);
        setLoraLoaded(true);
        // Extract trigger_tag and tag_position from response
        if (result?.trigger_tag) {
          setLoraTriggerTag(result.trigger_tag);
          console.log('LoRA trigger tag:', result.trigger_tag);
        } else {
          setLoraTriggerTag('');
        }
        // Fetch full status to get tag_position
        try {
          const status = await generateApi.getLoraStatus(token);
          if (status?.tag_position) {
            setLoraTagPosition(status.tag_position === 'replace' ? 'prepend' : status.tag_position);
          }
        } catch { /* ignore */ }
        console.log('LoRA loaded:', result?.message);
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : 'LoRA operation failed';
      // Make error messages more user-friendly
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        message = 'ACE-Step Gradio backend is not running. Start it first (port 8001).';
      }
      setLoraError(message);
      console.error('LoRA error:', err);
    } finally {
      setIsLoraLoading(false);
    }
  };

  const handleLoraLoadFromManager = async (path: string, name: string, variant: string) => {
    if (!token) {
      setLoraError('Please sign in to use LoRA');
      return;
    }
    setIsLoraLoading(true);
    setLoraError(null);
    try {
      // Unload existing LoRA first if loaded
      if (loraLoaded) {
        await generateApi.unloadLora(token);
        setLoraLoaded(false);
      }
      setLoraPath(path);
      setSelectedLoraName(name);
      setSelectedLoraVariant(variant);
      const result = await generateApi.loadLora({ lora_path: path }, token);
      setLoraLoaded(true);
      setLoraScale(1.0);  // Reset scale to 1.0 on new LoRA load
      setLoraEnabled(true);  // Enable LoRA by default
      if (result?.trigger_tag) {
        setLoraTriggerTag(result.trigger_tag);
      } else {
        setLoraTriggerTag('');
      }
      try {
        const status = await generateApi.getLoraStatus(token);
        if (status?.tag_position) {
          setLoraTagPosition(status.tag_position === 'replace' ? 'prepend' : status.tag_position);
        }
      } catch { /* ignore */ }
    } catch (err) {
      let message = err instanceof Error ? err.message : 'LoRA operation failed';
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        message = 'ACE-Step Gradio backend is not running. Start it first (port 8001).';
      }
      setLoraError(message);
    } finally {
      setIsLoraLoading(false);
    }
  };

  const handleLoraUnload = async () => {
    if (!token) return;
    
    setIsLoraLoading(true);
    setLoraError(null);

    try {
      const result = await generateApi.unloadLora(token);
      setLoraLoaded(false);
      setLoraScale(1.0);
      setLoraTriggerTag('');
      setLoraTagPosition('prepend');
      console.log('LoRA unloaded:', result?.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unload LoRA';
      setLoraError(message);
      console.error('Unload error:', err);
    } finally {
      setIsLoraLoading(false);
    }
  };

  const handleLoraScaleChange = (newScale: number) => {
    setLoraScale(newScale);

    if (!token || !loraLoaded) return;

    // Debounce API call to prevent artifacts from rapid slider changes
    if (loraScaleDebounceRef.current) clearTimeout(loraScaleDebounceRef.current);
    loraScaleDebounceRef.current = setTimeout(async () => {
      try {
        await generateApi.setLoraScale({ scale: newScale }, token);
      } catch (err) {
        console.error('Failed to set LoRA scale:', err);
      }
    }, 300);
  };

  const handleLoraEnabledToggle = async () => {
    if (!token || !loraLoaded) return;
    const newEnabled = !loraEnabled;
    setLoraEnabled(newEnabled);
    try {
      await generateApi.toggleLora({ enabled: newEnabled }, token);
    } catch (err) {
      console.error('Failed to toggle LoRA:', err);
      setLoraEnabled(!newEnabled); // revert on error
    }
  };

  // Model download handler
  const handleModelDownload = async (modelName: string) => {
    
    setDownloadingModels(prev => new Set(prev).add(modelName));
    setDownloadStatus(prev => ({ ...prev, [modelName]: { status: 'downloading', progress: 'Starting...' } }));

    try {
      await generateApi.downloadModel({ modelName }, token || '');

      // Poll for status every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const status = await generateApi.getDownloadStatus(modelName, token || '');
          setDownloadStatus(prev => ({ ...prev, [modelName]: { status: status.status, progress: status.progress || '', error: status.error } }));

          if (status.status === 'done') {
            clearInterval(pollInterval);
            setDownloadingModels(prev => {
              const next = new Set(prev);
              next.delete(modelName);
              return next;
            });
            // Refresh models list
            await refreshModels();
          } else if (status.status === 'error') {
            clearInterval(pollInterval);
            setDownloadingModels(prev => {
              const next = new Set(prev);
              next.delete(modelName);
              return next;
            });
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch (err) {
      console.error('Model download error:', err);
      setDownloadingModels(prev => {
        const next = new Set(prev);
        next.delete(modelName);
        return next;
      });
      setDownloadStatus(prev => ({ ...prev, [modelName]: { status: 'error', progress: '', error: err instanceof Error ? err.message : 'Download failed' } }));
    }
  };

  // LoRA list fetch handler
  const fetchLoraList = async () => {
    if (!token) return;
    setLoraListLoading(true);
    try {
      const result = await generateApi.listLoras(token);
      setLoraList(result.loras || []);
    } catch (err) {
      console.error('Failed to fetch LoRA list:', err);
    } finally {
      setLoraListLoading(false);
    }
  };

  // When LoRA name is selected from dropdown, auto-select first variant and set loraPath
  const handleLoraNameSelect = (name: string) => {
    setSelectedLoraName(name);
    const entry = loraList.find(l => l.name === name);
    if (entry && entry.variants.length > 0) {
      const firstVariant = entry.variants[0];
      setSelectedLoraVariant(firstVariant.label);
      setLoraPath(firstVariant.path);
    } else {
      setSelectedLoraVariant('');
      setLoraPath('');
    }
  };

  // When variant is selected from dropdown, update loraPath
  const handleLoraVariantSelect = (variantLabel: string) => {
    setSelectedLoraVariant(variantLabel);
    const entry = loraList.find(l => l.name === selectedLoraName);
    if (entry) {
      const variant = entry.variants.find(v => v.label === variantLabel);
      if (variant) {
        setLoraPath(variant.path);
      }
    }
  };

  // Get variants for the currently selected LoRA
  const selectedLoraEntry = loraList.find(l => l.name === selectedLoraName);

  // LoRA browse handler
  const handleLoraBrowse = async (dirPath?: string) => {
    if (!token) return;
    setLoraBrowseLoading(true);
    try {
      const result = await generateApi.browseLora({ dirPath: dirPath || '' }, token);
      setLoraBrowseEntries(result.entries || []);
      setLoraBrowseParent(result.parentPath || '');
      setLoraBrowseCurrentPath(result.currentPath || '');
      setLoraBrowseRelativePath(result.relativePath || result.currentPath || '');
      if (result.error) {
        console.warn('Browse warning:', result.error);
      }
    } catch (err) {
      console.error('Browse error:', err);
    } finally {
      setLoraBrowseLoading(false);
    }
  };

  const handleLoraBrowseOpen = () => {
    setShowLoraBrowser(true);
    handleLoraBrowse(loraPath || '');
  };

  const handleLoraBrowseSelect = (fullPath: string) => {
    setLoraPath(fullPath);
    setShowLoraBrowser(false);
  };

  // Load generation parameters from JSON file
  const handleLoadParamsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.lyrics !== undefined) setLyrics(data.lyrics);
        if (data.style !== undefined) setStyle(data.style);
        if (data.title !== undefined) setTitle(data.title);
        if (data.caption !== undefined) setStyle(data.caption);
        if (data.instrumental !== undefined) setInstrumental(data.instrumental);
        if (data.vocal_language !== undefined) setVocalLanguage(data.vocal_language);
        if (data.bpm !== undefined) setBpm(data.bpm);
        if (data.key_scale !== undefined) setKeyScale(data.key_scale);
        if (data.time_signature !== undefined) setTimeSignature(data.time_signature);
        if (data.duration !== undefined) setDuration(data.duration);
        if (data.inference_steps !== undefined) setInferenceSteps(data.inference_steps);
        if (data.guidance_scale !== undefined) setGuidanceScale(data.guidance_scale);
        if (data.audio_format !== undefined) setAudioFormat(data.audio_format);
        if (data.infer_method !== undefined) setInferMethod(data.infer_method);
        if (data.seed !== undefined) { setSeed(data.seed); setRandomSeed(false); }
        if (data.shift !== undefined) setShift(data.shift);
        if (data.lm_temperature !== undefined) setLmTemperature(data.lm_temperature);
        if (data.lm_cfg_scale !== undefined) setLmCfgScale(data.lm_cfg_scale);
        if (data.lm_top_k !== undefined) setLmTopK(data.lm_top_k);
        if (data.lm_top_p !== undefined) setLmTopP(data.lm_top_p);
        if (data.lm_negative_prompt !== undefined) setLmNegativePrompt(data.lm_negative_prompt);
        if (data.task_type !== undefined) setTaskType(data.task_type);
        if (data.audio_codes !== undefined) setAudioCodes(data.audio_codes);
        if (data.repainting_start !== undefined) setRepaintingStart(data.repainting_start);
        if (data.repainting_end !== undefined) setRepaintingEnd(data.repainting_end);
        if (data.instruction !== undefined) setInstruction(data.instruction);
        if (data.audio_cover_strength !== undefined) setAudioCoverStrength(data.audio_cover_strength);
      } catch {
        console.error('Failed to parse parameters JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be reloaded
  };

  // Reuse Effect - must be after all state declarations
  useEffect(() => {
    if (initialData) {
      const song = initialData.song;
      const gp = song.generationParams;
      setCustomMode(true);

      // Detect instrumental: DB stores '[Instrumental]' as lyrics for instrumental songs
      const isInstr = !song.lyrics || song.lyrics.trim().length === 0 || /^\[instrumental\]$/i.test(song.lyrics.trim());
      setInstrumental(isInstr);

      // Lyrics: use song.lyrics unless it's instrumental placeholder, then try generationParams
      const effectiveLyrics = isInstr ? '' : (song.lyrics || gp?.lyrics || '');
      setLyrics(effectiveLyrics);

      // Style: use song.style, fallback to generationParams.style
      const effectiveStyle = song.style || gp?.style || '';
      setStyle(effectiveStyle);

      setTitle(song.title);

      // Restore seed and other params from the original generation
      if (gp) {
        const reuseSeed = gp.actualSeed ?? (gp.seed >= 0 && !gp.randomSeed ? gp.seed : undefined);
        if (reuseSeed !== undefined) {
          setSeed(reuseSeed);
          setRandomSeed(false);
        }
        if (gp.vocalLanguage) setVocalLanguage(gp.vocalLanguage);
        if (gp.vocalGender) setVocalGender(gp.vocalGender as any);
        if (gp.bpm !== undefined) setBpm(gp.bpm);
        if (gp.keyScale) setKeyScale(gp.keyScale);
        if (gp.timeSignature) setTimeSignature(gp.timeSignature);
        if (gp.duration !== undefined && gp.duration > 0) setDuration(gp.duration);
        if (gp.inferenceSteps) setInferenceSteps(gp.inferenceSteps);
        if (gp.guidanceScale) setGuidanceScale(gp.guidanceScale);
        if (gp.inferMethod) setInferMethod(gp.inferMethod as any);
        if (gp.shift !== undefined) setShift(gp.shift);
        if (gp.ditModel) setSelectedModel(gp.ditModel);
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (!pendingAudioSelection) return;
    applyAudioTargetUrl(
      pendingAudioSelection.target,
      pendingAudioSelection.url,
      pendingAudioSelection.title
    );
    // Auto-open advanced settings when loading source audio (cover mode)
    if (pendingAudioSelection.target === 'source') {
      setShowAdvanced(true);
    }
    onAudioSelectionApplied?.();
  }, [pendingAudioSelection, onAudioSelectionApplied]);

  // Consume pending lyrics from ChatAssistant
  useEffect(() => {
    if (!pendingLyrics) return;
    if (pendingLyrics.mode === 'overwrite') {
      setLyrics(pendingLyrics.text);
    } else {
      setLyrics(prev => prev ? prev + '\n\n' + pendingLyrics.text : pendingLyrics.text);
    }
    onLyricsApplied?.();
  }, [pendingLyrics, onLyricsApplied]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate new height based on mouse position relative to the lyrics container top
      // We can't easily get the container top here without a ref to it, 
      // but we can use dy (delta y) from the previous position if we tracked it,
      // OR simpler: just update based on movement if we track the start.
      //
      // Better approach for absolute sizing: 
      // 1. Get the bounding rect of the textarea wrapper on mount/resize start? 
      //    We can just rely on the fact that we are dragging the bottom.
      //    So new height = currentMouseY - topOfElement.

      if (lyricsRef.current) {
        const rect = lyricsRef.current.getBoundingClientRect();
        const newHeight = e.clientY - rect.top;
        // detailed limits: min 96px (h-24), max 600px
        if (newHeight > 96 && newHeight < 600) {
          setLyricsHeight(newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      // Save height to localStorage
      localStorage.setItem('acestep_lyrics_height', String(lyricsHeight));
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  const refreshModels = useCallback(async () => {
    try {
      const modelsRes = await fetch('/api/generate/models');
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        const models = data.models || [];
        if (models.length > 0) {
          setFetchedModels(models);
          // Always sync to the backend's active model
          const active = models.find((m: any) => m.is_active);
          if (active) {
            setSelectedModel(active.name);
            localStorage.setItem('ace-model', active.name);
          }
        }
      }
    } catch {
      // ignore - will use fallback model list
    }
  }, []);

  useEffect(() => {
    const loadModelsAndLimits = async () => {
      await refreshModels();

      // Fetch limits
      try {
        const response = await fetch('/api/generate/limits');
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.max_duration_with_lm === 'number') {
          setMaxDurationWithLm(data.max_duration_with_lm);
        }
        if (typeof data.max_duration_without_lm === 'number') {
          setMaxDurationWithoutLm(data.max_duration_without_lm);
        }
      } catch {
        // ignore limits fetch failures
      }
    };

    loadModelsAndLimits();
  }, []);

  // Re-fetch models after generation completes to update active model
  const prevIsGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    if (prevIsGeneratingRef.current && !isGenerating) {
      void refreshModels();
    }
    prevIsGeneratingRef.current = isGenerating;
  }, [isGenerating, refreshModels]);

  const activeMaxDuration = thinking ? maxDurationWithLm : maxDurationWithoutLm;

  useEffect(() => {
    if (duration > activeMaxDuration) {
      setDuration(activeMaxDuration);
    }
  }, [duration, activeMaxDuration]);

  useEffect(() => {
    const getDragKind = (e: DragEvent): 'file' | 'audio' | null => {
      if (!e.dataTransfer) return null;
      const types = Array.from(e.dataTransfer.types);
      // If the drag includes a full song (for the chat assistant), ignore it here
      if (types.includes('application/x-ace-song')) return null;
      if (types.includes('Files')) return 'file';
      if (types.includes('application/x-ace-audio')) return 'audio';
      return null;
    };

    const handleDragEnter = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      dragDepthRef.current += 1;
      setIsDraggingFile(true);
      setDragKind(kind);
      e.preventDefault();
    };

    const handleDragOver = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      setDragKind(kind);
      e.preventDefault();
    };

    const handleDragLeave = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingFile(false);
        setDragKind(null);
      }
    };

    const handleDrop = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
      setDragKind(null);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'reference' | 'source') => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadReferenceTrack(file, target);
    }
    e.target.value = '';
  };

  // Format handler - uses LLM to enhance style/lyrics and auto-fill parameters
  const handleFormat = async (target: 'style' | 'lyrics', overrideCaption?: string) => {
    const caption = overrideCaption || style.trim();
    if (!token || !caption) return;
    if (target === 'style') {
      setIsFormattingStyle(true);
    } else {
      setIsFormattingLyrics(true);
    }
    try {
      const result = await generateApi.formatInput({
        caption: caption,
        lyrics: lyrics,
        bpm: bpm > 0 ? bpm : undefined,
        duration: duration > 0 ? duration : undefined,
        keyScale: keyScale || undefined,
        timeSignature: timeSignature || undefined,
        temperature: lmTemperature,
        topK: lmTopK > 0 ? lmTopK : undefined,
        topP: lmTopP,
        lmModel: lmModel || 'acestep-5Hz-lm-0.6B',
        lmBackend: lmBackend || 'pt',
      }, token);

      if (result.caption || result.lyrics || result.bpm || result.duration) {
        // Update fields with LLM-generated values
        if (target === 'style' && result.caption) setStyle(result.caption);
        if (target === 'lyrics' && result.lyrics) setLyrics(result.lyrics);
        if (result.bpm && result.bpm > 0) setBpm(result.bpm);
        if (result.duration && result.duration > 0) setDuration(result.duration);
        if (result.key_scale) setKeyScale(result.key_scale);
        if (result.time_signature) {
          const ts = String(result.time_signature);
          setTimeSignature(ts.includes('/') ? ts : `${ts}/4`);
        }
        if (result.vocal_language) setVocalLanguage(result.vocal_language);
        if (target === 'style') setIsFormatCaption(true);
      } else {
        console.error('Format failed:', result.error || result.status_message);
        alert(result.error || result.status_message || 'Format failed. Make sure the LLM is initialized.');
      }
    } catch (err) {
      console.error('Format error:', err);
      alert('Format failed. The LLM may not be available.');
    } finally {
      if (target === 'style') {
        setIsFormattingStyle(false);
      } else {
        setIsFormattingLyrics(false);
      }
    }
  };

  // AI-assisted full workflow: generate structured lyrics in Spanish, then auto-create the song
  const handleAIGenerateAndCreate = async () => {
    if (!token || isAIGenerating || activeJobCount >= maxConcurrentJobs) return;
    setIsAIGenerating(true);

    // Ensure we have a style/caption
    const caption = style.trim() || 'pop, reggaeton, latino';
    if (!style.trim()) setStyle(caption);

    // Build an enhanced prompt that forces structured Spanish lyrics
    const structuredPrompt = `${caption}. Write full song lyrics in Spanish with proper song structure sections: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Pre-Chorus], [Chorus], [Bridge], [Chorus], [Outro]. Each section must have multiple lines of lyrics in Spanish. Do NOT generate instrumental-only sections. The lyrics MUST be entirely in Spanish.`;

    try {
      const result = await generateApi.formatInput({
        caption: structuredPrompt,
        lyrics: '', // empty so LLM generates from scratch
        bpm: bpm > 0 ? bpm : undefined,
        duration: duration > 0 ? duration : undefined,
        keyScale: keyScale || undefined,
        timeSignature: timeSignature || undefined,
        temperature: lmTemperature,
        topK: lmTopK > 0 ? lmTopK : undefined,
        topP: lmTopP,
        lmModel: lmModel || 'acestep-5Hz-lm-0.6B',
        lmBackend: lmBackend || 'pt',
      }, token);

      if (result.lyrics) {
        // Update lyrics with AI result
        setLyrics(result.lyrics);
        if (result.caption) setStyle(result.caption);
        if (result.bpm && result.bpm > 0) setBpm(result.bpm);
        if (result.duration && result.duration > 0) setDuration(result.duration);
        if (result.key_scale) setKeyScale(result.key_scale);
        if (result.time_signature) {
          const ts = String(result.time_signature);
          setTimeSignature(ts.includes('/') ? ts : `${ts}/4`);
        }
        if (result.vocal_language) setVocalLanguage(result.vocal_language);
        setInstrumental(false);

        // Auto-trigger song generation with the new lyrics
        triggerGeneration(result.lyrics, result.caption || caption, result.vocal_language || vocalLanguage || 'es', result.bpm || bpm, result.key_scale || keyScale, result.time_signature ? (String(result.time_signature).includes('/') ? String(result.time_signature) : `${result.time_signature}/4`) : timeSignature, result.duration || duration);
      } else {
        // LLM returned no lyrics — fall back to normal generation without AI lyrics
        console.warn('[AI Generate] No lyrics returned, falling back to normal generation');
        triggerGeneration('', caption, vocalLanguage, bpm, keyScale, timeSignature, duration);
      }
    } catch (err) {
      // LLM unavailable — fall back to normal generation
      console.warn('[AI Generate] LLM error, falling back to normal generation:', err);
      triggerGeneration('', caption, vocalLanguage, bpm, keyScale, timeSignature, duration);
    } finally {
      setIsAIGenerating(false);
    }
  };

  // Helper: trigger song generation with specific params (used by AI workflow + fallback)

  // Build vocal style descriptors to inject into caption
  const buildVocalDescriptors = (): string => {
    const parts: string[] = [];

    // Vocal Range
    const rangeDesc: Record<number, string> = {
      1: 'narrow vocal range, monotone',
      2: 'moderate vocal range',
      3: 'wide vocal range, soaring vocals, dynamic melody',
      4: 'extreme vocal range, dramatic pitch changes, vocal acrobatics',
    };
    if (rangeDesc[vocalRange]) parts.push(rangeDesc[vocalRange]);

    // Vocal Style
    const styleDesc: Record<number, string> = {
      1: 'legato vocals, smooth connected notes',
      2: 'melismatic vocals, vocal runs, ornamental singing',
      3: 'staccato vocals, rhythmic detached notes',
      4: 'breathy vocals, intimate, airy tone',
      5: 'powerful vocals, belting, strong projection',
    };
    if (styleDesc[vocalStyle]) parts.push(styleDesc[vocalStyle]);

    // Note Sustain
    const sustainDesc: Record<number, string> = {
      1: 'short notes, quick phrasing, rapid delivery',
      2: 'moderate sustain, balanced phrasing',
      3: 'long sustained notes, drawn-out phrases, legato phrasing',
      4: 'very long sustained notes, slow vocal delivery, extended phrases',
    };
    if (sustainDesc[noteSustain]) parts.push(sustainDesc[noteSustain]);

    return parts.join(', ');
  };

  // Append vocal descriptors + gender to a style/caption string
  const buildFullStyle = (baseStyle: string): string => {
    const parts = [baseStyle.trim()];
    const vocalDesc = buildVocalDescriptors();
    if (vocalDesc) parts.push(vocalDesc);
    if (vocalGender) {
      parts.push(vocalGender === 'male' ? 'Male vocals' : 'Female vocals');
    }
    return parts.filter(Boolean).join(', ');
  };

  const triggerGeneration = (lyricsToUse: string, captionToUse: string, lang: string, bpmVal: number, keyVal: string, tsVal: string, durVal: number) => {
    const styleWithGender = buildFullStyle(captionToUse);

    let jobSeed = -1;
    if (!randomSeed) jobSeed = seed;

    // Random reference folder: pick a random song as source
    const randomPick = (randomRefMode && randomRefFiles.length > 0) ? pickRandomRef() : null;
    // When random folder is active: use random pick as source (or nothing if signal=0%)
    // When random folder is inactive: use normal cover source
    const effectiveSourceUrl = randomPick
      ? (randomRefSignal > 0 ? randomPick.path : '') // signal=0% → no source audio (pure text2music)
      : sourceAudioUrl.trim();
    let effectiveTaskType = randomPick
      ? (randomRefSignal > 0 ? 'cover' : 'text2music') // signal=0% → text2music
      : taskType;

    // Edit mode overrides: repaint/lego/extend
    let effectiveRepaintStart = repaintingStart;
    let effectiveRepaintEnd = repaintingEnd;
    let effectiveTrackName = '';
    if (editMode && effectiveSourceUrl) {
      if (editAction === 'extend') {
        effectiveTaskType = 'repaint';
        effectiveRepaintStart = sourceDuration > 0 ? sourceDuration : 0;
        effectiveRepaintEnd = -1;
      } else if (editTarget === 'both') {
        effectiveTaskType = 'repaint';
        effectiveRepaintStart = editStart;
        effectiveRepaintEnd = editEnd;
      } else {
        effectiveTaskType = 'lego';
        effectiveTrackName = editTarget; // 'vocals' or 'instrumental'
        effectiveRepaintStart = editStart;
        effectiveRepaintEnd = editEnd;
      }
    }

    // Compute variation-mode overrides
    const isVariationActive = variationMode && effectiveSourceUrl;
    // Signal strength priority: randomRefSignal (when random pick) → audioInfluence (when variation) → sourceStrength
    const baseSourceStrength = randomPick ? randomRefSignal / 100 : sourceStrength;
    const effectiveSourceStrength = isVariationActive ? audioInfluence / 100 : baseSourceStrength;
    const effectiveGuidanceScale = isVariationActive ? 1.0 + (styleInfluence / 100) * 14.0 : guidanceScale;
    // Melodic variation: primary effect is repetition_penalty (1.0 → 1.5), secondary is mild temp boost
    const variationTempBoost = melodicVariation > 0 ? melodicVariation * 0.15 : 0; // mild: up to +0.15
    const effectiveLmTemp = isVariationActive ? 0.5 + (weirdness / 100) * 1.2 : lmTemperature + variationTempBoost;
    const effectiveShift = isVariationActive ? 1.0 + (weirdness / 100) * 4.0 : shift;
    const effectiveInferMethod = (isVariationActive && weirdness > 60) ? 'sde' as const : inferMethod;
    // Core melodic variation: repetition penalty penalizes repeated audio codes in the LM
    const effectiveRepetitionPenalty = 1.0 + melodicVariation * 0.5; // 0% → 1.0 (off), 100% → 1.5 (strong)
    // APG melodic variation: use direct slider values

    onGenerate({
      customMode: true,
      prompt: lyricsToUse,
      lyrics: lyricsToUse,
      style: styleWithGender,
      title: randomPick ? `${title || 'AI Generated'} [${randomPick.name}]` : (title || 'AI Generated'),
      ditModel: selectedModel,
      instrumental: !lyricsToUse,
      vocalLanguage: lang,
      bpm: bpmVal,
      keyScale: keyVal,
      timeSignature: tsVal,
      duration: durVal,
      inferenceSteps,
      guidanceScale: effectiveGuidanceScale,
      batchSize,
      randomSeed,
      seed: jobSeed,
      thinking,
      enhance,
      audioFormat,
      inferMethod: effectiveInferMethod,
      lmBackend,
      lmModel,
      shift: effectiveShift,
      lmTemperature: effectiveLmTemp,
      lmCfgScale,
      lmTopK,
      lmTopP,
      lmNegativePrompt,
      referenceAudioUrl: referenceAudioUrl.trim() || undefined,
      sourceAudioUrl: effectiveSourceUrl || undefined,
      audioCoverStrength,
      sourceStrength: effectiveSourceStrength,
      repaintingStart: effectiveRepaintStart,
      repaintingEnd: effectiveRepaintEnd,
      taskType: (effectiveTaskType === 'cover' && !effectiveSourceUrl) ? 'text2music' : effectiveTaskType,
      trackName: effectiveTrackName || undefined,
      loraPath,
      loraScale,
      loraEnabled,
      loraTriggerTag,
      loraTagPosition,
      alignToMeasures,
      sectionMeasures,
      melodicVariation,
      lmRepetitionPenalty: effectiveRepetitionPenalty,
      noRepeatNgramSize,
      apgNormThreshold,
      apgMomentum,
      apgEta,
    });
  };

  const loadRandomRefFolder = async (folder: string) => {
    if (!token || !folder.trim()) return;
    setIsLoadingRefFolder(true);
    setRandomRefError(null);
    try {
      const result = await generateApi.listAudioFolder({ folderPath: folder.trim() }, token);
      if (result.error) {
        setRandomRefError(result.error);
        setRandomRefFiles([]);
      } else {
        setRandomRefFiles(result.files || []);
        if (result.count === 0) setRandomRefError('No audio files found in folder');
      }
    } catch (err) {
      setRandomRefError((err as Error).message);
      setRandomRefFiles([]);
    } finally {
      setIsLoadingRefFolder(false);
    }
  };

  const pickRandomRef = useCallback(() => {
    if (randomRefFiles.length === 0) return null;
    const idx = Math.floor(Math.random() * randomRefFiles.length);
    return randomRefFiles[idx];
  }, [randomRefFiles]);

  const openAudioModal = (target: 'reference' | 'source', tab: 'uploads' | 'created' = 'uploads') => {
    setAudioModalTarget(target);
    setTempAudioUrl('');
    setLibraryTab(tab);
    setShowAudioModal(true);
    void fetchReferenceTracks();
  };

  const fetchReferenceTracks = useCallback(async () => {
    if (!token) return;
    setIsLoadingTracks(true);
    try {
      const response = await fetch('/api/reference-tracks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setReferenceTracks(data.tracks || []);
      }
    } catch (err) {
      console.error('Failed to fetch reference tracks:', err);
    } finally {
      setIsLoadingTracks(false);
    }
  }, [token]);

  const uploadReferenceTrack = async (file: File, target?: 'reference' | 'source') => {
    if (!token) {
      setUploadError('Please sign in to upload audio.');
      return;
    }
    setUploadError(null);
    setIsUploadingReference(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/reference-tracks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await response.json();
      setReferenceTracks(prev => [data.track, ...prev]);

      // Also set as current reference/source
      const selectedTarget = target ?? audioModalTarget;
      applyAudioTargetUrl(selectedTarget, data.track.audio_url, data.track.filename);
      if (data.whisper_available && data.track?.id) {
        void transcribeReferenceTrack(data.track.id).then(() => undefined);
      } else {
        setShowAudioModal(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(message);
    } finally {
      setIsUploadingReference(false);
    }
  };

  const transcribeReferenceTrack = async (trackId: string) => {
    if (!token) return;
    setIsTranscribingReference(true);
    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    try {
      const response = await fetch(`/api/reference-tracks/${trackId}/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Failed to transcribe');
      }
      const data = await response.json();
      if (data.lyrics) {
        setLyrics(prev => prev || data.lyrics);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Transcription failed:', err);
    } finally {
      if (transcribeAbortRef.current === controller) {
        transcribeAbortRef.current = null;
      }
      setIsTranscribingReference(false);
    }
  };

  const cancelTranscription = () => {
    if (transcribeAbortRef.current) {
      transcribeAbortRef.current.abort();
      transcribeAbortRef.current = null;
    }
    setIsTranscribingReference(false);
  };

  const deleteReferenceTrack = async (trackId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/reference-tracks/${trackId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setReferenceTracks(prev => prev.filter(t => t.id !== trackId));
        if (playingTrackId === trackId && playingTrackSource === 'uploads') {
          setPlayingTrackId(null);
          setPlayingTrackSource(null);
          if (modalAudioRef.current) {
            modalAudioRef.current.pause();
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  };

  const useReferenceTrack = (track: { audio_url: string; title?: string }) => {
    // If cover song modal is active, set song as source and vocal as reference
    if (showCoverSongModal && vocalAudioUrl) {
      setSourceAudioUrl(track.audio_url);
      setSourceAudioTitle(track.title || 'Song');
      setSourceTime(0);
      setSourceDuration(0);
      setReferenceAudioUrl(vocalAudioUrl);
      setReferenceAudioTitle(`${vocalAudioTitle || 'Vocal'} (Style Ref)`);
      setReferenceTime(0);
      setReferenceDuration(0);
      setTaskType('cover');
      // Auto-adjust duration to match vocal length
      if (vocalDuration > 0) {
        const rounded = Math.ceil(vocalDuration);
        setDuration(Math.min(240, Math.max(5, rounded)));
      }
      setShowCoverSongModal(false);
      setShowAudioModal(false);
      setPlayingTrackId(null);
      setPlayingTrackSource(null);
      return;
    }
    
    // If vocal tab is active, trigger Demucs separation instead of setting as reference
    if (audioTab === 'vocal') {
      setShowAudioModal(false);
      setPlayingTrackId(null);
      setPlayingTrackSource(null);
      const title = track.title || 'Track';
      void handleSeparateStems(track.audio_url, title);
      return;
    }
    applyAudioTargetUrl(audioModalTarget, track.audio_url, track.title);
    setShowAudioModal(false);
    setPlayingTrackId(null);
    setPlayingTrackSource(null);
  };

  const toggleModalTrack = (track: { id: string; audio_url: string; source: 'uploads' | 'created' }) => {
    if (playingTrackId === track.id) {
      if (modalAudioRef.current) {
        modalAudioRef.current.pause();
      }
      setPlayingTrackId(null);
      setPlayingTrackSource(null);
    } else {
      setPlayingTrackId(track.id);
      setPlayingTrackSource(track.source);
      if (modalAudioRef.current) {
        modalAudioRef.current.src = track.audio_url;
        modalAudioRef.current.play().catch(() => undefined);
      }
    }
  };

  const applyAudioUrl = () => {
    if (!tempAudioUrl.trim()) return;
    applyAudioTargetUrl(audioModalTarget, tempAudioUrl.trim());
    setShowAudioModal(false);
    setTempAudioUrl('');
  };

  const applyAudioTargetUrl = (target: 'reference' | 'source', url: string, title?: string) => {
    const derivedTitle = title ? title.replace(/\.[^/.]+$/, '') : getAudioLabel(url);
    if (target === 'reference') {
      setReferenceAudioUrl(url);
      setReferenceAudioTitle(derivedTitle);
      setReferenceTime(0);
      setReferenceDuration(0);
    } else {
      setSourceAudioUrl(url);
      setSourceAudioTitle(derivedTitle);
      setSourceTime(0);
      setSourceDuration(0);
      if (taskType === 'text2music') {
        setTaskType('cover');
      }
    }
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || time <= 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const toggleAudio = (target: 'reference' | 'source' | 'vocal') => {
    const audio = target === 'reference' ? referenceAudioRef.current : target === 'source' ? sourceAudioRef.current : vocalAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, target: 'reference' | 'source') => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void uploadReferenceTrack(file, target);
      return;
    }
    const payload = e.dataTransfer.getData('application/x-ace-audio');
    if (payload) {
      try {
        const data = JSON.parse(payload);
        if (data?.url) {
          applyAudioTargetUrl(target, data.url, data.title);
        }
      } catch {
        // ignore
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleVocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    e.target.value = '';
    setIsUploadingReference(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      const response = await fetch('/api/reference-tracks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }
      const data = await response.json();
      const title = file.name.replace(/\.[^/.]+$/, '');
      setVocalAudioUrl(data.track.audio_url);
      setVocalAudioTitle(title);
      setVocalTime(0);
      setVocalDuration(0);
      // Also set as reference if option is on
      if (useVocalAsReference) {
        setReferenceAudioUrl(data.track.audio_url);
        setReferenceAudioTitle(`${title} (Vocal)`);
        setReferenceTime(0);
        setReferenceDuration(0);
      }
    } catch (err) {
      console.error('Vocal upload error:', err);
    } finally {
      setIsUploadingReference(false);
    }
  };

  const handleSeparateStems = async (audioUrl: string, title: string) => {
    if (isSeparating) return;
    setIsSeparating(true);
    try {
      const result = await trainingApi.separateStems(audioUrl, separationQuality, token || undefined);
      if (result.success) {
        // Set vocal audio
        setVocalAudioUrl(result.vocals.url);
        setVocalAudioTitle(`${title} (Vocal)`);
        // Store instrumental URL
        setInstrumentalAudioUrl(result.instrumental.url);

        // Auto-apply based on user preferences
        if (useVocalAsReference) {
          setReferenceAudioUrl(result.vocals.url);
          setReferenceAudioTitle(`${title} (Vocal)`);
          setReferenceTime(0);
          setReferenceDuration(0);
        }
        if (useInstrumentalAsSource) {
          setSourceAudioUrl(result.instrumental.url);
          setSourceAudioTitle(`${title} (Instrumental)`);
          setSourceTime(0);
          setSourceDuration(0);
          if (taskType === 'text2music') {
            setTaskType('cover');
          }
        }
      } else {
        console.error('Separation failed:', result.error);
      }
    } catch (err) {
      console.error('Separation error:', err);
    } finally {
      setIsSeparating(false);
    }
  };

  const handleWorkspaceDrop = (e: React.DragEvent<HTMLDivElement>) => {
    // Skip drags that include full song data (those go to the chat assistant)
    if (e.dataTransfer.types.includes('application/x-ace-song')) return;
    if (e.dataTransfer.files?.length || e.dataTransfer.types.includes('application/x-ace-audio')) {
      handleDrop(e, audioTab);
    }
  };

  const handleWorkspaceDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Skip drags that include full song data (those go to the chat assistant)
    if (e.dataTransfer.types.includes('application/x-ace-song')) return;
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-ace-audio')) {
      e.preventDefault();
    }
  };

  const handleGenerate = () => {
    const styleWithGender = buildFullStyle(style);

    // Bulk generation: loop bulkCount times
    for (let i = 0; i < bulkCount; i++) {
      // Seed handling: first job uses user's seed, rest get random seeds
      let jobSeed = -1;
      if (!randomSeed && i === 0) {
        jobSeed = seed;
      } else if (!randomSeed && i > 0) {
        // Subsequent jobs get random seeds for variety
        jobSeed = Math.floor(Math.random() * 4294967295);
      }

      // Random reference folder: pick a random song for each bulk iteration
      const bulkRandomPick = (randomRefMode && randomRefFiles.length > 0) ? pickRandomRef() : null;
      // When random folder is active: use random pick as source (or nothing if signal=0%)
      // When random folder is inactive: use normal cover source
      const bulkSourceUrl = bulkRandomPick
        ? (randomRefSignal > 0 ? bulkRandomPick.path : '') // signal=0% → no source audio
        : sourceAudioUrl.trim();
      let bulkTaskType = bulkRandomPick
        ? (randomRefSignal > 0 ? 'cover' : 'text2music') // signal=0% → text2music
        : taskType;

      // Edit mode overrides for bulk generate
      let bulkRepaintStart = repaintingStart;
      let bulkRepaintEnd = repaintingEnd;
      let bulkTrackName = trackName.trim();
      if (editMode && bulkSourceUrl) {
        if (editAction === 'extend') {
          bulkTaskType = 'repaint';
          bulkRepaintStart = sourceDuration > 0 ? sourceDuration : 0;
          bulkRepaintEnd = -1;
        } else if (editTarget === 'both') {
          bulkTaskType = 'repaint';
          bulkRepaintStart = editStart;
          bulkRepaintEnd = editEnd;
        } else {
          bulkTaskType = 'lego';
          bulkTrackName = editTarget;
          bulkRepaintStart = editStart;
          bulkRepaintEnd = editEnd;
        }
      }

      // Compute variation-mode overrides for bulk generate
      const isVarActive = variationMode && bulkSourceUrl;
      const bulkBaseStrength = bulkRandomPick ? randomRefSignal / 100 : sourceStrength;
      const varSourceStrength = isVarActive ? audioInfluence / 100 : bulkBaseStrength;
      const varGuidanceScale = isVarActive ? 1.0 + (styleInfluence / 100) * 14.0 : guidanceScale;
      const varLmTemp = isVarActive ? 0.5 + (weirdness / 100) * 1.2 : lmTemperature;
      const varShift = isVarActive ? 1.0 + (weirdness / 100) * 4.0 : shift;
      const varInferMethod = isVarActive && weirdness > 60 ? 'sde' as const : inferMethod;

      onGenerate({
        customMode,
        songDescription: customMode ? undefined : songDescription,
        prompt: lyrics,
        lyrics,
        style: styleWithGender,
        title: bulkRandomPick
          ? `${title} (${i + 1}) [${bulkRandomPick.name}]`
          : bulkCount > 1 ? `${title} (${i + 1})` : title,
        ditModel: selectedModel,
        instrumental,
        vocalLanguage,
        bpm,
        keyScale,
        timeSignature,
        duration,
        inferenceSteps,
        guidanceScale: varGuidanceScale,
        // Force batchSize=1 when LoRA is loaded + cover mode to prevent tensor mismatch
        batchSize: (loraLoaded && taskType === 'cover') ? 1 : batchSize,
        randomSeed: randomSeed || i > 0, // Force random for subsequent bulk jobs
        seed: jobSeed,
        thinking,
        enhance,
        audioFormat,
        inferMethod: varInferMethod,
        lmBackend,
        lmModel,
        shift: varShift,
        lmTemperature: varLmTemp,
        lmCfgScale,
        lmTopK,
        lmTopP,
        lmNegativePrompt,
        referenceAudioUrl: referenceAudioUrl.trim() || undefined,
        sourceAudioUrl: bulkSourceUrl || undefined,
        referenceAudioTitle: referenceAudioTitle.trim() || undefined,
        sourceAudioTitle: bulkRandomPick ? bulkRandomPick.name : (sourceAudioTitle.trim() || undefined),
        audioCodes: audioCodes.trim() || undefined,
        repaintingStart: bulkRepaintStart,
        repaintingEnd: bulkRepaintEnd,
        instruction,
        audioCoverStrength: bulkSourceUrl ? varSourceStrength : audioCoverStrength,
        taskType: (bulkTaskType === 'cover' && !bulkSourceUrl && !audioCodes.trim()) ? 'text2music' : bulkTaskType,
        useAdg,
        cfgIntervalStart,
        cfgIntervalEnd,
        customTimesteps: customTimesteps.trim() || undefined,
        useCotMetas,
        useCotCaption,
        useCotLanguage,
        autogen,
        constrainedDecodingDebug,
        allowLmBatch,
        getScores,
        getLrc,
        scoreScale,
        lmBatchChunkSize,
        trackName: bulkTrackName || undefined,
        completeTrackClasses: (() => {
          const parsed = completeTrackClasses
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
          return parsed.length ? parsed : undefined;
        })(),
        isFormatCaption,
        alignToMeasures,
        loraLoaded,
        loraPath: loraLoaded ? loraPath : undefined,
        loraName: loraLoaded ? (selectedLoraName || undefined) : undefined,
        loraScale: loraLoaded ? loraScale : undefined,
        loraEnabled: loraLoaded ? loraEnabled : undefined,
        loraTriggerTag: loraLoaded ? (loraTriggerTag || undefined) : undefined,
        loraTagPosition: loraLoaded ? loraTagPosition : undefined,
      });
    }

    // Reset bulk count after generation
    if (bulkCount > 1) {
      setBulkCount(1);
    }
  };

  // Section-based "Suno-style" generation: uses the quick-generate path
  // but adds sectionMode flag so App.tsx routes to the sections endpoint
  const handleSectionGenerate = () => {
    if (!lyrics.trim()) {
      alert('Section-based generation requires lyrics with structure tags like [Verse], [Chorus], [Intro], etc.');
      return;
    }

    const styleWithGender = buildFullStyle(style);

    const lang = vocalLanguage;
    const bpmVal = bpm;
    const keyVal = keyScale;
    const tsVal = timeSignature;
    const durVal = duration;

    onGenerate({
      customMode: true,
      prompt: lyrics,
      lyrics,
      style: styleWithGender,
      title: `${title || 'AI Generated'} [Sections]`,
      ditModel: selectedModel,
      instrumental,
      vocalLanguage: lang,
      bpm: bpmVal,
      keyScale: keyVal,
      timeSignature: tsVal,
      duration: durVal,
      inferenceSteps,
      guidanceScale,
      batchSize: 1, // Always 1 for section generation
      randomSeed,
      seed,
      thinking,
      enhance,
      audioFormat,
      inferMethod,
      lmBackend,
      lmModel,
      shift,
      lmTemperature,
      lmCfgScale,
      lmTopK,
      lmTopP,
      lmNegativePrompt,
      referenceAudioUrl: referenceAudioUrl.trim() || undefined,
      sourceAudioUrl: sourceAudioUrl.trim() || undefined,
      audioCoverStrength,
      taskType,
      useAdg,
      cfgIntervalStart,
      cfgIntervalEnd,
      customTimesteps: customTimesteps.trim() || undefined,
      useCotMetas,
      useCotCaption,
      useCotLanguage,
      constrainedDecodingDebug,
      allowLmBatch,
      isFormatCaption,
      alignToMeasures: true, // Always align to measures in section mode
      sectionMode: true, // Routes to /generate/sections endpoint
      sectionMeasures,
      melodicVariation,
      lmRepetitionPenalty: 1.0 + melodicVariation * 0.5, // 0% → 1.0 (off), 100% → 1.5 (strong)
      noRepeatNgramSize,
      apgNormThreshold,
      apgMomentum,
      apgEta,
      loraPath,
      loraScale,
      loraEnabled,
      loraTriggerTag,
      loraTagPosition,
    });
  };

  return (
    <div
      className="relative flex flex-col h-full bg-zinc-50 dark:bg-suno-panel w-full overflow-y-auto custom-scrollbar transition-colors duration-300"
      onDrop={handleWorkspaceDrop}
      onDragOver={handleWorkspaceDragOver}
    >
      {isDraggingFile && (
        <div className="absolute inset-0 z-[90] pointer-events-none">
          <div className="absolute inset-0 bg-white/70 dark:bg-black/50 backdrop-blur-sm" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 px-6 py-5 shadow-xl">
              {dragKind !== 'audio' && (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg">
                  <Upload size={22} />
                </div>
              )}
              <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                {dragKind === 'audio' ? t('dropToUseAudio') : t('dropToUpload')}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {dragKind === 'audio'
                  ? (audioTab === 'reference' ? t('usingAsReference') : t('usingAsCover'))
                  : (audioTab === 'reference' ? t('uploadingAsReference') : t('uploadingAsCover'))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="p-4 pt-14 md:pt-4 pb-24 lg:pb-32 space-y-5">
        <input
          ref={referenceInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => handleFileSelect(e, 'reference')}
          className="hidden"
        />
        <input
          ref={sourceInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => handleFileSelect(e, 'source')}
          className="hidden"
        />
        <input
          ref={vocalInputRef}
          type="file"
          accept="audio/*"
          onChange={handleVocalFileSelect}
          className="hidden"
        />
        <audio
          ref={referenceAudioRef}
          src={referenceAudioUrl || undefined}
          onPlay={() => setReferencePlaying(true)}
          onPause={() => setReferencePlaying(false)}
          onEnded={() => setReferencePlaying(false)}
          onTimeUpdate={(e) => setReferenceTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setReferenceDuration(e.currentTarget.duration || 0)}
        />
        <audio
          ref={sourceAudioRef}
          src={sourceAudioUrl || undefined}
          onPlay={() => setSourcePlaying(true)}
          onPause={() => setSourcePlaying(false)}
          onEnded={() => setSourcePlaying(false)}
          onTimeUpdate={(e) => setSourceTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setSourceDuration(e.currentTarget.duration || 0)}
        />
        <audio
          ref={vocalAudioRef}
          src={vocalAudioUrl || undefined}
          onPlay={() => setVocalPlaying(true)}
          onPause={() => setVocalPlaying(false)}
          onEnded={() => setVocalPlaying(false)}
          onTimeUpdate={(e) => setVocalTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setVocalDuration(e.currentTarget.duration || 0)}
        />

        {/* Header - Mode Toggle & Model Selection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">ACE-Step v1.5</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex items-center bg-zinc-200 dark:bg-black/40 rounded-lg p-1 border border-zinc-300 dark:border-white/5">
              <button
                onClick={() => setCustomMode(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150 ${!customMode ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
              >
                {t('simple')}
              </button>
              <button
                onClick={() => setCustomMode(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150 ${customMode ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
              >
                {t('custom')}
              </button>
            </div>

            {/* Model Selection */}
            <div className="relative" ref={modelMenuRef}>
              <button
                ref={modelButtonRef}
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="bg-zinc-200 dark:bg-black/40 border border-zinc-300 dark:border-white/5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-black/50 transition-colors flex items-center gap-1"
                disabled={availableModels.length === 0}
              >
                {availableModels.length === 0 ? '...' : getModelDisplayName(selectedModel)}
                <ChevronDown size={10} className="text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* Model Menu Portal — rendered outside panel to avoid clipping */}
            {showModelMenu && availableModels.length > 0 && ReactDOM.createPortal(
              <div
                ref={modelMenuPortalRef}
                className="fixed z-[9999] w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
                style={(() => {
                  const rect = modelButtonRef.current?.getBoundingClientRect();
                  if (!rect) return { top: 100, left: 100 };
                  const menuWidth = 320;
                  let left = rect.left;
                  if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 8;
                  if (left < 8) left = 8;
                  return { top: rect.bottom + 4, left };
                })()}
              >
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  {availableModels.map(model => {
                    const fetchedInfo = fetchedModels.find(m => m.name === model.id);
                    const isDownloaded = fetchedInfo?.is_preloaded ?? false;
                    const isActive = fetchedInfo?.is_active ?? false;
                    const isDownloading = downloadingModels.has(model.id);
                    const dlStatus = downloadStatus[model.id];

                    return (
                      <div
                        key={model.id}
                        className={`w-full px-4 py-3 text-left border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 ${
                          selectedModel === model.id ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
                        } ${!isDownloaded && !isDownloading ? 'opacity-75' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div
                            className={`flex items-center gap-2 flex-1 min-w-0 ${isDownloaded ? 'cursor-pointer hover:opacity-80' : ''}`}
                            onClick={() => {
                              if (!isDownloaded) return;
                              setSelectedModel(model.id);
                              localStorage.setItem('ace-model', model.id);
                              if (!isTurboModel(model.id)) {
                                setInferenceSteps(20);
                                setUseAdg(true);
                              }
                              setShowModelMenu(false);
                            }}
                          >
                            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                              {getModelDisplayName(model.id)}
                            </span>
                            {isDownloaded && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shrink-0">
                                {isActive ? '● Active' : '● Ready'}
                              </span>
                            )}
                            {!isDownloaded && !isDownloading && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
                                Not downloaded
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {selectedModel === model.id && isDownloaded && (
                              <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                            {!isDownloaded && !isDownloading && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleModelDownload(model.id);
                                }}
                                className="p-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors"
                                title={`Download ${model.id}`}
                              >
                                <Download size={12} />
                              </button>
                            )}
                            {isDownloading && (
                              <div className="p-1.5">
                                <Loader2 size={12} className="animate-spin text-violet-500" />
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{model.id}</p>
                        {/* Download progress */}
                        {isDownloading && dlStatus && (
                          <div className="mt-2">
                            <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-gradient-to-r from-violet-500 to-purple-500 h-1.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                            </div>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 truncate">
                              {dlStatus.progress || 'Downloading...'}
                            </p>
                          </div>
                        )}
                        {!isDownloading && dlStatus?.status === 'error' && (
                          <p className="text-[10px] text-red-500 mt-1">{dlStatus.error || 'Download failed'}</p>
                        )}
                        {!isDownloading && dlStatus?.status === 'done' && (
                          <p className="text-[10px] text-green-500 mt-1">Download complete!</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>,
              document.body
            )}

            {/* Presets */}
            <div className="relative" ref={presetMenuRef}>
              <button
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className="bg-zinc-200 dark:bg-black/40 border border-zinc-300 dark:border-white/5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-black/50 transition-colors flex items-center gap-1"
                title="Presets"
              >
                <Settings2 size={10} />
                <ChevronDown size={10} className="text-zinc-600 dark:text-zinc-400" />
              </button>

              {showPresetMenu && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* Save new preset */}
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                    {showSavePreset ? (
                      <div className="flex gap-1">
                        <input
                          autoFocus
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && presetName.trim()) savePreset(presetName.trim()); if (e.key === 'Escape') setShowSavePreset(false); }}
                          placeholder="Preset name..."
                          className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none"
                        />
                        <button
                          onClick={() => presetName.trim() && savePreset(presetName.trim())}
                          className="px-2 py-1.5 bg-violet-500 text-white rounded-md text-xs font-semibold hover:bg-violet-600 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowSavePreset(true)}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Plus size={12} />
                        Save current as preset
                      </button>
                    )}
                  </div>

                  {/* Preset list */}
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {presets.length === 0 ? (
                      <p className="text-center py-4 text-xs text-zinc-400">No presets saved</p>
                    ) : (
                      presets.map((preset) => (
                        <div
                          key={preset.name}
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group"
                        >
                          <button
                            onClick={() => loadPreset(preset)}
                            className="flex-1 text-left min-w-0"
                          >
                            <span className="text-xs font-medium text-zinc-900 dark:text-white truncate block">{preset.name}</span>
                            <span className="text-[10px] text-zinc-400">{new Date(preset.createdAt).toLocaleDateString()}</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deletePreset(preset.name); }}
                            className="shrink-0 p-1 text-zinc-300 dark:text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete preset"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SIMPLE MODE */}
        {!customMode && (
          <div className="space-y-5">
            {/* Song Description */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
              <div className="px-3 py-2.5 flex items-center justify-between border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('describeYourSong')}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!token) return;
                    try {
                      const result = await generateApi.getRandomDescription(token);
                      setSongDescription(result.description);
                      setInstrumental(result.instrumental);
                      setVocalLanguage(result.vocalLanguage || 'unknown');
                    } catch (err) {
                      console.error('Failed to load random description:', err);
                    }
                  }}
                  title="Load random description"
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                >
                  <Dices size={14} />
                </button>
              </div>
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = Math.min(Math.max(el.scrollHeight, 128), 300) + 'px';
                  }
                }}
                value={songDescription}
                onChange={(e) => {
                  setSongDescription(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(Math.max(el.scrollHeight, 128), 300) + 'px';
                }}
                placeholder={t('songDescriptionPlaceholder')}
                className="w-full min-h-[128px] max-h-[300px] bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none overflow-y-auto"
              />
            </div>

            {/* Vocal Language (Simple) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalLanguage')}
                </label>
                <select
                  value={vocalLanguage}
                  onChange={(e) => setVocalLanguage(e.target.value)}
                  className="w-full bg-white dark:bg-suno-card border border-zinc-200 dark:border-white/5 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  {VOCAL_LANGUAGE_KEYS.map(lang => (
                    <option key={lang.value} value={lang.value}>{t(lang.key)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalGender')}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'male' ? '' : 'male')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'male' ? 'bg-violet-600 text-white border-violet-600' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('male')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'female' ? '' : 'female')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'female' ? 'bg-violet-600 text-white border-violet-600' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('female')}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Settings (Simple Mode) */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                <Sliders size={14} />
                {t('quickSettings')}
              </h3>

              {/* Duration */}
              <EditableSlider
                label={t('duration')}
                value={duration}
                min={-1}
                max={activeMaxDuration}
                step={5}
                onChange={setDuration}
                formatDisplay={(val) => val === -1 ? t('auto') : `${val}${t('seconds')}`}
                title={''}
                autoLabel={t('auto')}
              />

              {/* BPM */}
              <EditableSlider
                label="BPM"
                value={bpm}
                min={0}
                max={300}
                step={5}
                onChange={setBpm}
                formatDisplay={(val) => val === 0 ? 'Auto' : val.toString()}
                autoLabel="Auto"
              />

              {/* Key & Time Signature */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('key')}</label>
                  <select
                    value={keyScale}
                    onChange={(e) => setKeyScale(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                  >
                    <option value="">Auto</option>
                    {KEY_SIGNATURES.filter(k => k).map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('time')}</label>
                  <select
                    value={timeSignature}
                    onChange={(e) => setTimeSignature(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                  >
                    {TIME_SIGNATURES.map(ts => (
                      <option key={ts.value} value={ts.value}>{ts.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Variations */}
              <EditableSlider
                label={t('variations')}
                value={batchSize}
                min={1}
                max={4}
                step={1}
                onChange={setBatchSize}
              />
              <div style={{display: 'none'}}>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="1"
                  value={batchSize}
                  onChange={setBatchSize}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
                <p className="text-[10px] text-zinc-500">{t('numberOfVariations')}</p>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM MODE */}
        {customMode && (
          <div className="space-y-5">
            {/* Audio Section */}
            <div
              onDrop={(e) => handleDrop(e, audioTab)}
              onDragOver={handleDragOver}
              className="bg-white dark:bg-[#1a1a1f] rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden"
            >
              {/* Header with Audio label and tabs */}
              <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('audio')}</span>
                  <div className="flex items-center gap-1 bg-zinc-200/50 dark:bg-black/30 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setAudioTab('reference')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 flex items-center gap-1.5 ${
                        audioTab === 'reference'
                          ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {referenceAudioUrl && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                      {t('reference')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioTab('source')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 flex items-center gap-1.5 ${
                        audioTab === 'source'
                          ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {sourceAudioUrl && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      {t('cover')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioTab('vocal')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 flex items-center gap-1.5 ${
                        audioTab === 'vocal'
                          ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {isSeparating ? <Loader2 size={10} className="animate-spin" /> : vocalAudioUrl && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                      Vocal
                    </button>
                  </div>
                </div>
              </div>

              {/* Audio Content */}
              <div className="p-3 space-y-2">
                {/* Reference Audio Player */}
                {audioTab === 'reference' && referenceAudioUrl && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleAudio('reference')}
                      className="relative flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 hover:scale-105 transition-transform"
                    >
                      {referencePlaying ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-zinc-900 text-white px-1 py-0.5 rounded">
                        {formatTime(referenceDuration)}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1.5">
                        {referenceAudioTitle || getAudioLabel(referenceAudioUrl)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(referenceTime)}</span>
                        <div
                          className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                          onClick={(e) => {
                            if (referenceAudioRef.current && referenceDuration > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const percent = (e.clientX - rect.left) / rect.width;
                              referenceAudioRef.current.currentTime = percent * referenceDuration;
                            }
                          }}
                        >
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-[width] duration-150 relative"
                            style={{ width: referenceDuration ? `${Math.min(100, (referenceTime / referenceDuration) * 100)}%` : '0%' }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(referenceDuration)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPrepareTraining?.({
                        id: `ref_${Date.now()}`,
                        title: referenceAudioTitle || 'Reference Audio',
                        lyrics: lyrics || '',
                        style: style || '',
                        coverUrl: '',
                        duration: referenceDuration ? `${Math.floor(referenceDuration / 60)}:${String(Math.floor(referenceDuration % 60)).padStart(2, '0')}` : '0:00',
                        createdAt: new Date(),
                        tags: [],
                        audioUrl: referenceAudioUrl,
                        isPublic: false,
                      })}
                      className="p-1.5 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/30 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      title="Prepare for Training"
                    >
                      <Database size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReferenceAudioUrl(''); setReferenceAudioTitle(''); setReferencePlaying(false); setReferenceTime(0); setReferenceDuration(0); }}
                      className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                )}
                {audioTab === 'reference' && referenceAudioUrl && (
                  <EditableSlider
                    label={t('referenceStrength') || 'Reference Strength'}
                    value={Math.round(audioCoverStrength * 100)}
                    min={0}
                    max={100}
                    step={5}
                    onChange={(v: number) => setAudioCoverStrength(Math.round(v) / 100)}
                    helpText="How much the reference audio influences the result"
                    title="0% = ignore reference, 100% = maximum influence from reference audio"
                  />
                )}

                {/* Source/Cover Audio Player */}
                {audioTab === 'source' && sourceAudioUrl && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleAudio('source')}
                      className="relative flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-105 transition-transform"
                    >
                      {sourcePlaying ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-zinc-900 text-white px-1 py-0.5 rounded">
                        {formatTime(sourceDuration)}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1.5">
                        {sourceAudioTitle || getAudioLabel(sourceAudioUrl)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(sourceTime)}</span>
                        <div
                          className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                          onClick={(e) => {
                            if (sourceAudioRef.current && sourceDuration > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const percent = (e.clientX - rect.left) / rect.width;
                              sourceAudioRef.current.currentTime = percent * sourceDuration;
                            }
                          }}
                        >
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-[width] duration-150 relative"
                            style={{ width: sourceDuration ? `${Math.min(100, (sourceTime / sourceDuration) * 100)}%` : '0%' }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(sourceDuration)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPrepareTraining?.({
                        id: `src_${Date.now()}`,
                        title: sourceAudioTitle || 'Source Audio',
                        lyrics: lyrics || '',
                        style: style || '',
                        coverUrl: '',
                        duration: sourceDuration ? `${Math.floor(sourceDuration / 60)}:${String(Math.floor(sourceDuration % 60)).padStart(2, '0')}` : '0:00',
                        createdAt: new Date(),
                        tags: [],
                        audioUrl: sourceAudioUrl,
                        isPublic: false,
                      })}
                      className="p-1.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                      title="Prepare for Training"
                    >
                      <Database size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSourceAudioUrl(''); setSourceAudioTitle(''); setSourcePlaying(false); setSourceTime(0); setSourceDuration(0); if (taskType === 'cover') setTaskType('text2music'); }}
                      className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                )}
                {audioTab === 'source' && sourceAudioUrl && !variationMode && (
                  <EditableSlider
                    label={t('coverStrength') || 'Cover Strength'}
                    value={Math.round(sourceStrength * 100)}
                    min={0}
                    max={100}
                    step={5}
                    onChange={(v: number) => setSourceStrength(Math.round(v) / 100)}
                    helpText="How much the source audio shapes the cover"
                    title="0% = mostly new generation, 100% = maximum fidelity to source audio"
                  />
                )}

                {/* Repaint & Edit Mode Panel */}
                {audioTab === 'source' && sourceAudioUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">Edit Mode</span>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">Repaint / Extend</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditMode(!editMode)}
                        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                          editMode ? 'bg-cyan-500' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          editMode ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>

                    {editMode && (
                      <div className="space-y-3 p-3 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200/50 dark:border-cyan-800/30">
                        {/* Action: Repaint or Extend */}
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditAction('repaint')}
                            className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                              editAction === 'repaint'
                                ? 'bg-cyan-500 text-white shadow-sm'
                                : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'
                            }`}
                          >
                            Repaint Section
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditAction('extend')}
                            className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                              editAction === 'extend'
                                ? 'bg-cyan-500 text-white shadow-sm'
                                : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'
                            }`}
                          >
                            Extend Song
                          </button>
                        </div>

                        {/* Target: Vocals / Instrumental / Both */}
                        {editAction === 'repaint' && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Regenerate Target</label>
                            <div className="flex gap-1.5">
                              {(['both', 'vocals', 'instrumental'] as const).map((target) => (
                                <button
                                  key={target}
                                  type="button"
                                  onClick={() => setEditTarget(target)}
                                  className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                                    editTarget === target
                                      ? 'bg-cyan-500 text-white shadow-sm'
                                      : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'
                                  }`}
                                >
                                  {target === 'both' ? 'Both' : target === 'vocals' ? 'Vocals' : 'Instrumental'}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-zinc-500">
                              {editTarget === 'both' ? 'Regenerate everything in the selected region'
                                : editTarget === 'vocals' ? 'Replace only vocals, keep the instrumental'
                                : 'Replace only the instrumental, keep vocals'}
                            </p>
                          </div>
                        )}

                        {/* Region Selection (for Repaint) */}
                        {editAction === 'repaint' && (
                          <div className="space-y-2">
                            <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Region (seconds)</label>
                            {/* Visual region bar */}
                            {sourceDuration > 0 && (
                              <div className="relative h-6 rounded-lg bg-zinc-200 dark:bg-zinc-700 overflow-hidden cursor-crosshair"
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const percent = (e.clientX - rect.left) / rect.width;
                                  const time = Math.round(percent * sourceDuration * 10) / 10;
                                  if (e.shiftKey || editEnd < 0) {
                                    setEditEnd(time);
                                  } else {
                                    setEditStart(time);
                                  }
                                }}
                              >
                                <div
                                  className="absolute top-0 bottom-0 bg-cyan-400/40 dark:bg-cyan-500/30"
                                  style={{
                                    left: `${(editStart / sourceDuration) * 100}%`,
                                    width: editEnd > 0
                                      ? `${Math.max(0, ((editEnd - editStart) / sourceDuration) * 100)}%`
                                      : `${Math.max(0, ((sourceDuration - editStart) / sourceDuration) * 100)}%`,
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-300 drop-shadow-sm">
                                    {editStart.toFixed(1)}s — {editEnd > 0 ? `${editEnd.toFixed(1)}s` : 'end'}
                                  </span>
                                </div>
                              </div>
                            )}
                            <p className="text-[9px] text-zinc-400">Click to set start, Shift+click to set end</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500">Start</label>
                                <input
                                  type="number" step="0.5" min={0} max={sourceDuration || 600}
                                  value={editStart}
                                  onChange={(e) => setEditStart(Math.max(0, Number(e.target.value)))}
                                  className="w-full text-xs px-2 py-1.5 rounded-lg bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500">End (-1 = until end)</label>
                                <input
                                  type="number" step="0.5" min={-1} max={sourceDuration || 600}
                                  value={editEnd}
                                  onChange={(e) => setEditEnd(Number(e.target.value))}
                                  className="w-full text-xs px-2 py-1.5 rounded-lg bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Extend info */}
                        {editAction === 'extend' && (
                          <div className="p-2 rounded-lg bg-cyan-100/50 dark:bg-cyan-900/20 border border-cyan-200/50 dark:border-cyan-700/30">
                            <p className="text-[11px] text-cyan-700 dark:text-cyan-300 font-medium">
                              Will generate new audio starting at {sourceDuration > 0 ? `${sourceDuration.toFixed(1)}s` : 'the end'} of the current track.
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-1">
                              Set the desired total duration in the Duration field above. The new section will use your lyrics and style.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Variation Mode Panel */}
                {audioTab === 'source' && sourceAudioUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Variations</span>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">Advanced controls</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setVariationMode(!variationMode)}
                        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                          variationMode ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          variationMode ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>

                    {variationMode && (
                      <div className="space-y-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Audio Influence</label>
                            <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{audioInfluence}%</span>
                          </div>
                          <input
                            type="range" min={0} max={100} step={5} value={audioInfluence}
                            onChange={(e) => setAudioInfluence(Number(e.target.value))}
                            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                          <p className="text-[10px] text-zinc-500">Turn it up to resemble your original audio or Persona</p>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Style Influence</label>
                            <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{styleInfluence}%</span>
                          </div>
                          <input
                            type="range" min={0} max={100} step={5} value={styleInfluence}
                            onChange={(e) => setStyleInfluence(Number(e.target.value))}
                            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                          />
                          <p className="text-[10px] text-zinc-500">Turn it up to match your style description</p>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Weirdness</label>
                            <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{weirdness}%</span>
                          </div>
                          <input
                            type="range" min={0} max={100} step={5} value={weirdness}
                            onChange={(e) => setWeirdness(Number(e.target.value))}
                            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                          />
                          <p className="text-[10px] text-zinc-500">Turn it up for wild, unexpected results{weirdness > 60 && ' (SDE mode active)'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Random Reference Folder Mode */}
                {audioTab === 'source' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Random Folder</span>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">Pick random songs</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRandomRefMode(!randomRefMode)}
                        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                          randomRefMode ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          randomRefMode ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>

                    {randomRefMode && (
                      <div className="space-y-2 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={randomRefFolder}
                            onChange={(e) => setRandomRefFolder(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') loadRandomRefFolder(randomRefFolder); }}
                            placeholder="D:\my-songs\dataset"
                            className="flex-1 text-xs px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => loadRandomRefFolder(randomRefFolder)}
                            disabled={isLoadingRefFolder || !randomRefFolder.trim()}
                            className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isLoadingRefFolder ? 'Scanning...' : 'Scan'}
                          </button>
                        </div>

                        {randomRefError && (
                          <p className="text-[10px] text-rose-500">{randomRefError}</p>
                        )}

                        {randomRefFiles.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500">{randomRefFiles.length} audio files loaded</span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                Each generation picks a random song
                              </span>
                            </div>
                            <div className="max-h-24 overflow-y-auto rounded-lg bg-white/50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 p-1.5">
                              {randomRefFiles.slice(0, 50).map((f, idx) => (
                                <div key={idx} className="text-[10px] text-zinc-500 truncate py-0.5 px-1 hover:bg-zinc-100 dark:hover:bg-white/5 rounded">
                                  {f.name}
                                </div>
                              ))}
                              {randomRefFiles.length > 50 && (
                                <div className="text-[10px] text-zinc-400 italic px-1 py-0.5">
                                  ...and {randomRefFiles.length - 50} more
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-500">
                              Tip: Enable Variations above and use Bulk Generate to create different styles from random references
                            </p>
                          </div>
                        )}

                        {/* Signal Strength slider */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Signal Strength</label>
                            <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{randomRefSignal}%</span>
                          </div>
                          <input
                            type="range" min={0} max={100} step={5} value={randomRefSignal}
                            onChange={(e) => setRandomRefSignal(Number(e.target.value))}
                            className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                          <p className="text-[10px] text-zinc-500">
                            {randomRefSignal <= 20 ? 'Minimal reference — AI generates almost entirely new'
                              : randomRefSignal <= 50 ? 'Balanced blend of reference and AI generation'
                              : randomRefSignal <= 80 ? 'Strong reference — output closely follows the source song'
                              : 'Maximum fidelity — very close to the original audio'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Vocal Tab Content */}
                {audioTab === 'vocal' && vocalAudioUrl && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleAudio('vocal')}
                      className="relative flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 hover:scale-105 transition-transform"
                    >
                      {vocalPlaying ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-zinc-900 text-white px-1 py-0.5 rounded">
                        {formatTime(vocalDuration)}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1.5">
                        {vocalAudioTitle || 'Vocal'}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(vocalTime)}</span>
                        <div
                          className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                          onClick={(e) => {
                            if (vocalAudioRef.current && vocalDuration > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const percent = (e.clientX - rect.left) / rect.width;
                              vocalAudioRef.current.currentTime = percent * vocalDuration;
                            }
                          }}
                        >
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-[width] duration-150 relative"
                            style={{ width: vocalDuration ? `${Math.min(100, (vocalTime / vocalDuration) * 100)}%` : '0%' }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(vocalDuration)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSaveVoiceInput(true);
                        setVoicePresetName(vocalAudioTitle || 'Voice');
                      }}
                      className="p-1.5 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/30 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      title="Save as Voice Preset"
                    >
                      <Save size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPrepareTraining?.({
                        id: `vocal_${Date.now()}`,
                        title: vocalAudioTitle || 'Vocal',
                        lyrics: lyrics || '',
                        style: style || '',
                        coverUrl: '',
                        duration: vocalDuration ? `${Math.floor(vocalDuration / 60)}:${String(Math.floor(vocalDuration % 60)).padStart(2, '0')}` : '0:00',
                        createdAt: new Date(),
                        tags: [],
                        audioUrl: vocalAudioUrl,
                        isPublic: false,
                      })}
                      className="p-1.5 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/30 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      title="Prepare for Training"
                    >
                      <Database size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setVocalAudioUrl(''); setVocalAudioTitle(''); setInstrumentalAudioUrl(''); setVocalPlaying(false); setVocalTime(0); setVocalDuration(0); }}
                      className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                )}

                {/* Save Voice Preset inline input */}
                {audioTab === 'vocal' && showSaveVoiceInput && vocalAudioUrl && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30">
                    <User size={14} className="text-violet-500 shrink-0" />
                    <input
                      autoFocus
                      value={voicePresetName}
                      onChange={(e) => setVoicePresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && voicePresetName.trim()) saveVoicePreset();
                        if (e.key === 'Escape') { setShowSaveVoiceInput(false); setVoicePresetName(''); }
                      }}
                      placeholder="Voice preset name..."
                      className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <button
                      onClick={saveVoicePreset}
                      disabled={!voicePresetName.trim() || isSavingVoicePreset}
                      className="px-2.5 py-1 bg-violet-500 text-white rounded-md text-[10px] font-semibold hover:bg-violet-600 transition-colors disabled:opacity-50"
                    >
                      {isSavingVoicePreset ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                    </button>
                    <button
                      onClick={() => { setShowSaveVoiceInput(false); setVoicePresetName(''); }}
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Vocal → Generate workflow options */}
                {audioTab === 'vocal' && vocalAudioUrl && (
                  <div className="space-y-2">
                    {/* Active vocal config status */}
                    {(sourceAudioUrl === vocalAudioUrl || referenceAudioUrl === vocalAudioUrl || sourceAudioUrl === instrumentalAudioUrl) && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700/50">
                        <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                        <span className="text-[11px] font-medium text-violet-800 dark:text-violet-200">
                          {sourceAudioUrl === vocalAudioUrl && taskType === 'cover'
                            ? '🎤 Follow Voice mode active'
                            : referenceAudioUrl === vocalAudioUrl && !sourceAudioUrl
                            ? '✨ Voice Style Reference active'
                            : sourceAudioUrl === instrumentalAudioUrl && referenceAudioUrl === vocalAudioUrl
                            ? '🎙️ Sing over Instrumental active'
                            : sourceAudioUrl && referenceAudioUrl === vocalAudioUrl
                            ? '🎸 Cover with Voice active'
                            : 'Vocal configured'}
                          {' — Ready to Generate'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (sourceAudioUrl === vocalAudioUrl || sourceAudioUrl === instrumentalAudioUrl || sourceAudioUrl) {
                              setSourceAudioUrl('');
                              setSourceAudioTitle('');
                            }
                            if (referenceAudioUrl === vocalAudioUrl) {
                              setReferenceAudioUrl('');
                              setReferenceAudioTitle('');
                            }
                            if (taskType === 'cover') setTaskType('text2music');
                          }}
                          className="ml-auto text-[10px] font-medium text-violet-500 hover:text-violet-700 dark:hover:text-violet-300"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {/* Workflow buttons - 5 options */}
                    {sourceAudioUrl !== vocalAudioUrl && referenceAudioUrl !== vocalAudioUrl && !sourceAudioUrl && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">How to use this vocal</label>

                        {/* Option 1: Follow This Voice (Cover mode) */}
                        <button
                          type="button"
                          onClick={() => {
                            setSourceAudioUrl(vocalAudioUrl);
                            setSourceAudioTitle(`${vocalAudioTitle || 'Vocal'} (Voice)`);
                            setSourceTime(0);
                            setSourceDuration(0);
                            setTaskType('cover');
                            // Auto-adjust duration to match vocal length
                            if (vocalDuration > 0) {
                              const rounded = Math.ceil(vocalDuration);
                              setDuration(Math.min(240, Math.max(5, rounded)));
                            }
                          }}
                          disabled={loraLoaded}
                          className="w-full flex items-start gap-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/15 hover:bg-violet-100 dark:hover:bg-violet-900/25 border border-violet-200 dark:border-violet-800/30 px-3 py-2.5 text-left transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Mic size={14} className="text-violet-500 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <div className="text-[11px] font-bold text-violet-700 dark:text-violet-300 group-hover:text-violet-800 dark:group-hover:text-violet-200 flex items-center gap-1.5">
                              🎤 Follow This Voice
                              {loraLoaded && <AlertTriangle size={10} className="text-orange-500" />}
                            </div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                              Generate new instrumental following the vocal melody and rhythm.
                              {loraLoaded && <span className="text-orange-500 font-medium"> ⚠️ Unload LoRAs first to avoid errors.</span>}
                            </div>
                          </div>
                        </button>

                        {/* Option 2: Sing Custom Lyrics */}
                        <button
                          type="button"
                          onClick={() => {
                            setReferenceAudioUrl(vocalAudioUrl);
                            setReferenceAudioTitle(`${vocalAudioTitle || 'Vocal'} (Style Ref)`);
                            setReferenceTime(0);
                            setReferenceDuration(0);
                            // Focus lyrics textarea
                            setTimeout(() => {
                              const lyricsTextarea = document.querySelector('textarea[placeholder*="lyrics"]') as HTMLTextAreaElement;
                              if (lyricsTextarea) {
                                lyricsTextarea.focus();
                                lyricsTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }, 100);
                          }}
                          className="w-full flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/15 hover:bg-blue-100 dark:hover:bg-blue-900/25 border border-blue-200 dark:border-blue-800/30 px-3 py-2.5 text-left transition-colors group"
                        >
                          <FileText size={14} className="text-blue-500 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200">🎵 Sing Custom Lyrics</div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Write lyrics below — AI generates with this voice character and style.</div>
                          </div>
                        </button>

                        {/* Option 3: Sing a Song's Lyrics */}
                        <button
                          type="button"
                          onClick={() => setShowLyricsModal(true)}
                          className="w-full flex items-start gap-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/15 hover:bg-violet-100 dark:hover:bg-violet-900/25 border border-violet-200 dark:border-violet-800/30 px-3 py-2.5 text-left transition-colors group"
                        >
                          <Music2 size={14} className="text-violet-500 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-[11px] font-bold text-violet-700 dark:text-violet-300 group-hover:text-violet-800 dark:group-hover:text-violet-200">🎸 Sing a Song's Lyrics</div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Pick a song, extract lyrics, make this voice sing them.</div>
                          </div>
                        </button>

                        {/* Option 4: Cover a Song */}
                        <button
                          type="button"
                          onClick={() => {
                            setShowCoverSongModal(true);
                            setAudioModalTarget('source');
                            setShowAudioModal(true);
                            setLibraryTab('created');
                          }}
                          className="w-full flex items-start gap-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/15 hover:bg-emerald-100 dark:hover:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-800/30 px-3 py-2.5 text-left transition-colors group"
                        >
                          <Guitar size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 group-hover:text-emerald-800 dark:group-hover:text-emerald-200">🎹 Cover a Song</div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Regenerate any song with this voice character and style.</div>
                          </div>
                        </button>

                        {/* Option 5: Voice Style Reference */}
                        <button
                          type="button"
                          onClick={() => {
                            setReferenceAudioUrl(vocalAudioUrl);
                            setReferenceAudioTitle(`${vocalAudioTitle || 'Vocal'} (Style Ref)`);
                            setReferenceTime(0);
                            setReferenceDuration(0);
                          }}
                          className="w-full flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 hover:bg-amber-100 dark:hover:bg-amber-900/25 border border-amber-200 dark:border-amber-800/30 px-3 py-2.5 text-left transition-colors group"
                        >
                          <Sparkles size={14} className="text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 group-hover:text-amber-800 dark:group-hover:text-amber-200">✨ Voice Style Reference</div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Generate freely but capture the voice timbre and feel.</div>
                          </div>
                        </button>

                        {/* Option 6: Sing over Instrumental — only when instrumental is also available */}
                        {instrumentalAudioUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              // Vocal → Reference (voice timbre), Instrumental → Source (backing track)
                              setReferenceAudioUrl(vocalAudioUrl);
                              setReferenceAudioTitle(`${vocalAudioTitle || 'Vocal'} (Voice)`);
                              setReferenceTime(0);
                              setReferenceDuration(0);
                              setSourceAudioUrl(instrumentalAudioUrl);
                              setSourceAudioTitle(`${vocalAudioTitle || 'Track'} (Instrumental)`);
                              setSourceTime(0);
                              setSourceDuration(0);
                              setTaskType('cover');
                              // Auto-adjust duration to match vocal length
                              if (vocalDuration > 0) {
                                const rounded = Math.ceil(vocalDuration);
                                setDuration(Math.min(240, Math.max(5, rounded)));
                              }
                              // Focus lyrics textarea so user writes/checks lyrics
                              setTimeout(() => {
                                const lyricsTextarea = document.querySelector('textarea[placeholder*="lyrics"]') as HTMLTextAreaElement;
                                if (lyricsTextarea) {
                                  lyricsTextarea.focus();
                                  lyricsTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }, 100);
                            }}
                            disabled={loraLoaded}
                            className="w-full flex items-start gap-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/15 hover:bg-cyan-100 dark:hover:bg-cyan-900/25 border border-cyan-200 dark:border-cyan-800/30 px-3 py-2.5 text-left transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Music2 size={14} className="text-cyan-500 mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <div className="text-[11px] font-bold text-cyan-700 dark:text-cyan-300 group-hover:text-cyan-800 dark:group-hover:text-cyan-200 flex items-center gap-1.5">
                                🎙️ Sing over Instrumental
                                {loraLoaded && <AlertTriangle size={10} className="text-orange-500" />}
                              </div>
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                                Use this voice to sing your lyrics over the separated instrumental.
                                {loraLoaded && <span className="text-orange-500 font-medium"> ⚠️ Unload LoRAs first.</span>}
                              </div>
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Vocal Tab — Separation Controls */}
                {audioTab === 'vocal' && (
                  <div className="space-y-2">
                    {/* Separation progress */}
                    {isSeparating && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30">
                        <Loader2 size={14} className="animate-spin text-violet-500" />
                        <span className="text-[11px] text-violet-700 dark:text-violet-300 font-medium">
                          Separating audio with Demucs... This may take a few minutes.
                        </span>
                      </div>
                    )}

                    {/* Quality selector + Auto-apply options */}
                    {!isSeparating && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Quality</label>
                          <div className="flex items-center gap-1 bg-zinc-200/50 dark:bg-black/30 rounded-md p-0.5">
                            {(['rapida', 'alta', 'maxima'] as const).map((q) => (
                              <button
                                key={q}
                                type="button"
                                onClick={() => setSeparationQuality(q)}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                  separationQuality === q
                                    ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
                                }`}
                              >
                                {q === 'rapida' ? 'Fast' : q === 'alta' ? 'High' : 'Max'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Auto-apply toggles */}
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useVocalAsReference}
                              onChange={(e) => setUseVocalAsReference(e.target.checked)}
                              className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 text-violet-500 focus:ring-violet-500"
                            />
                            <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Use vocal as Reference Audio</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useInstrumentalAsSource}
                              onChange={(e) => setUseInstrumentalAsSource(e.target.checked)}
                              className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                            />
                            <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Use instrumental as Source/Cover</span>
                          </label>
                        </div>

                        {/* Instrumental indicator */}
                        {instrumentalAudioUrl && (
                          <div className="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400">Instrumental available</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSourceAudioUrl(instrumentalAudioUrl);
                                setSourceAudioTitle(`${vocalAudioTitle?.replace(' (Vocal)', '')} (Instrumental)`);
                                setSourceTime(0);
                                setSourceDuration(0);
                                if (taskType === 'text2music') setTaskType('cover');
                              }}
                              className="ml-auto text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              Use as Source
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons — Reference & Source tabs */}
                {audioTab !== 'vocal' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openAudioModal(audioTab as 'reference' | 'source', 'uploads')}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-3 py-2 text-xs font-medium transition-colors border border-zinc-200 dark:border-white/5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
                    </svg>
                    {t('fromLibrary')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const input = audioTab === 'reference' ? referenceInputRef.current : sourceInputRef.current;
                      input?.click();
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-3 py-2 text-xs font-medium transition-colors border border-zinc-200 dark:border-white/5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                    {t('upload')}
                  </button>
                </div>
                )}

                {/* Action buttons — Vocal tab */}
                {audioTab === 'vocal' && !isSeparating && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAudioModalTarget('reference');
                          setShowAudioModal(true);
                        }}
                        disabled={isSeparating}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-3 py-2 text-xs font-medium transition-colors border border-violet-200 dark:border-violet-800/30 disabled:opacity-40"
                      >
                        <Music2 size={14} />
                        Separate from Library
                      </button>
                      <button
                        type="button"
                        onClick={() => vocalInputRef.current?.click()}
                        disabled={isSeparating}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-3 py-2 text-xs font-medium transition-colors border border-violet-200 dark:border-violet-800/30 disabled:opacity-40"
                      >
                        <Upload size={14} />
                        Upload Acapella
                      </button>
                    </div>

                    {/* Load Voice Preset button + dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => { setShowVoicePresets(!showVoicePresets); fetchVoicePresets(); }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-3 py-2 text-xs font-medium transition-colors border border-zinc-200 dark:border-white/5"
                      >
                        <User size={14} />
                        Voice Presets
                        {voicePresets.length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 rounded-full text-[9px] font-bold">
                            {voicePresets.length}
                          </span>
                        )}
                        <ChevronDown size={12} className={`ml-auto transition-transform ${showVoicePresets ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Voice Presets Dropdown */}
                      {showVoicePresets && (
                        <div className="mt-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-xl overflow-hidden z-20 relative">
                          {voicePresets.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                              <User size={28} className="text-zinc-300 dark:text-zinc-600 mb-2" />
                              <p className="text-xs text-zinc-400 dark:text-zinc-500">No voice presets yet</p>
                              <p className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-1">Load a vocal and click <Save size={10} className="inline" /> to save it</p>
                            </div>
                          ) : (
                            <div className="max-h-52 overflow-y-auto">
                              {voicePresets.map(preset => {
                                const waveform = presetWaveforms[preset.id] || [];
                                return (
                                  <div
                                    key={preset.id}
                                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer group transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                                    onClick={() => loadVoicePreset(preset)}
                                  >
                                    {/* Waveform thumbnail */}
                                    <div className="w-10 h-8 flex items-end gap-px shrink-0 rounded bg-violet-50 dark:bg-violet-900/20 p-0.5 overflow-hidden">
                                      {waveform.length > 0 ? (
                                        waveform.map((v, i) => (
                                          <div
                                            key={i}
                                            className="flex-1 bg-violet-400 dark:bg-violet-500 rounded-t-sm"
                                            style={{ height: `${Math.max(8, v * 100)}%` }}
                                          />
                                        ))
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <Mic size={12} className="text-violet-400" />
                                        </div>
                                      )}
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                        {preset.name}
                                      </div>
                                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                        {preset.duration ? formatTime(preset.duration) : '—'}
                                      </div>
                                    </div>
                                    {/* Delete */}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); deleteVoicePreset(preset.id); }}
                                      className="p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-all"
                                      title="Delete preset"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lyrics Input */}
            <div
              ref={lyricsRef}
              className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden transition-colors group focus-within:border-zinc-400 dark:focus-within:border-white/20 relative flex flex-col"
              style={{ height: 'auto' }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/5 flex-shrink-0">
                <div>
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('lyrics')}</span>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t('leaveLyricsEmpty')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInstrumental(!instrumental)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                      instrumental
                        ? 'bg-violet-600 text-white border-violet-500'
                        : 'bg-white dark:bg-suno-card border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {instrumental ? t('instrumental') : t('vocal')}
                  </button>
                  <button
                    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors ${isFormattingLyrics ? 'text-violet-500' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                    title="AI Format - Enhance style & auto-fill parameters"
                    onClick={() => handleFormat('lyrics')}
                    disabled={isFormattingLyrics || !style.trim()}
                  >
                    {isFormattingLyrics ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
                    onClick={() => setLyrics('')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <textarea
                disabled={instrumental}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={instrumental ? t('instrumental') + ' mode' : t('lyricsPlaceholder')}
                className={`w-full bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none font-mono leading-relaxed ${instrumental ? 'opacity-30 cursor-not-allowed' : ''}`}
                style={{ height: `${lyricsHeight}px` }}
              />
              {/* AI Generate: write structured lyrics + auto-create song — only when lyrics are empty */}
              {!instrumental && !lyrics.trim() && (
                <div className="px-3 pb-2 pt-1">
                  <button
                    onClick={handleAIGenerateAndCreate}
                    disabled={isAIGenerating || activeJobCount >= maxConcurrentJobs}
                    className="w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-violet-500 to-violet-500 text-white hover:from-violet-600 hover:to-violet-600 shadow-sm"
                  >
                    {isAIGenerating ? (
                      <><Loader2 size={13} className="animate-spin" /> Generando letra y canción...</>
                    ) : (
                      <><Sparkles size={13} /> Generar letra + canción con IA</>
                    )}
                  </button>
                </div>
              )}

              {/* Resize Handle */}
              <div
                onMouseDown={startResizing}
                className="h-3 w-full cursor-ns-resize flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors absolute bottom-0 left-0 z-10"
              >
                <div className="w-8 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
              </div>
            </div>

            {/* Style Input */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden transition-colors group focus-within:border-zinc-400 dark:focus-within:border-white/20">
              <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('styleOfMusic')}</span>
                    <button
                      onClick={() => setEnhance(!enhance)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors duration-150 cursor-pointer ${enhance ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                      title={t('enhanceTooltip')}
                    >
                      <Sparkles size={9} />
                      <span>{enhance ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t('genreMoodInstruments')}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-black dark:hover:text-white"
                    title={t('refreshGenres')}
                    onClick={refreshMusicTags}
                  >
                    <Dices size={14} />
                  </button>
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
                    onClick={() => setStyle('')}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors ${isFormattingStyle ? 'text-violet-500' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                    title="AI Format - Enhance style & auto-fill parameters"
                    onClick={() => handleFormat('style')}
                    disabled={isFormattingStyle || !style.trim()}
                  >
                    {isFormattingStyle ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                </div>
              </div>
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = Math.min(Math.max(el.scrollHeight, 80), 200) + 'px';
                  }
                }}
                value={style}
                onChange={(e) => {
                  setStyle(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(Math.max(el.scrollHeight, 80), 200) + 'px';
                }}
                placeholder={t('stylePlaceholder')}
                className="w-full min-h-[80px] max-h-[200px] bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none overflow-y-auto"
              />
              <div className="px-3 pb-3 space-y-2">
                {/* Quick Tags — green = default (ACE-Step compatible), yellow = premium (experimental) */}
                <div className="flex flex-wrap gap-1.5">
                  {musicTags.map(tag => (
                    <button
                      key={tag.label}
                      onClick={() => {
                        setStyle(prev => prev ? `${prev}, ${tag.label}` : tag.label);
                        // Auto-refresh tags after a short delay so the added tag disappears
                        setTimeout(() => refreshMusicTags(), 100);
                      }}
                      className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-all duration-150 border ${
                        tag.tier === 'default'
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:border-emerald-300 dark:hover:border-emerald-500/40'
                          : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 hover:border-amber-300 dark:hover:border-amber-500/40'
                      }`}
                      title={tag.tier === 'default' ? 'ACE-Step compatible genre' : 'Premium experimental tag'}
                    >
                      {tag.tier === 'premium' && <span className="mr-0.5">✦</span>}
                      {tag.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[9px] text-zinc-400 dark:text-zinc-600">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 dark:bg-emerald-500/60"></span>Default</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 dark:bg-amber-500/60"></span>Premium</span>
                </div>
              </div>
            </div>

            {/* Section Duration & Melodic Variation — Experimental Controls */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-amber-200 dark:border-amber-500/20 overflow-hidden">
              <div className="px-3 py-2 bg-amber-50 dark:bg-amber-500/5 border-b border-amber-100 dark:border-amber-500/10 flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">✦ Structure & Variation</span>
                <span className="text-[9px] text-amber-500/60 dark:text-amber-500/40">Experimental</span>
              </div>
              <div className="p-3 space-y-3">
                {/* Section Measures */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Bars per Section</label>
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{sectionMeasures} bars</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[4, 8, 16, 32].map(v => (
                      <button
                        key={v}
                        onClick={() => setSectionMeasures(v)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-150 border ${
                          sectionMeasures === v
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                            : 'bg-zinc-50 dark:bg-black/20 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-amber-300 dark:hover:border-amber-500/30'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500">How many bars each section (Verse, Chorus, etc.) lasts. 8 = standard, 4 = short, 16/32 = extended.</p>
                </div>

                {/* Melodic Variation */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Melodic Variation</label>
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{melodicVariation === 0 ? 'OFF' : `${(melodicVariation * 100).toFixed(0)}%`}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={melodicVariation}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setMelodicVariation(val);
                      // Auto-update APG sliders when master slider changes
                      setApgNormThreshold(2.5 + val * 7.5);
                      setApgMomentum(-0.75 + val * 0.45);
                      setApgEta(val * 0.5);
                      // Auto-update note change speed: 0% → 0 (off), 50% → 3, 100% → 5
                      setNoRepeatNgramSize(Math.round(val * 5));
                    }}
                    className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-amber-500"
                  />
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500">Penalizes repeated audio codes in the LM for more diverse melodies. 0% = off (default), 50% = moderate, 100% = strong variation.</p>
                </div>

                {/* APG Fine-Tuning (base model only) */}
                <div className="mt-2 pt-2 border-t border-amber-100 dark:border-amber-500/10 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-amber-600/70 dark:text-amber-400/60 uppercase tracking-wider">🎵 APG Pitch Controls</span>
                    <span className="text-[8px] text-amber-500/40 dark:text-amber-500/30">(base model)</span>
                  </div>

                  {/* APG Norm Threshold */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Pitch Range</label>
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{apgNormThreshold.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={20}
                      step={0.5}
                      value={apgNormThreshold}
                      onChange={(e) => setApgNormThreshold(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500">How wide pitch jumps can be. Low (2.5) = constrained, High (10+) = allows big melodic leaps.</p>
                  </div>

                  {/* APG Momentum */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Melodic Smoothness</label>
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{apgMomentum.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={apgMomentum}
                      onChange={(e) => setApgMomentum(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500">Negative = jittery/oscillating, Near 0 = smooth contour, Positive = flowing melody. Default: -0.75</p>
                  </div>

                  {/* APG Eta */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Melody Amplification</label>
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{apgEta.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={apgEta}
                      onChange={(e) => setApgEta(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500">Amplifies existing melodic patterns. 0 = off (default), 0.3-0.5 = stronger melodies, 1.0 = maximum.</p>
                  </div>
                </div>

                {/* Note Change Speed (LM-level) */}
                <div className="mt-2 pt-2 border-t border-emerald-100 dark:border-emerald-500/10 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-emerald-600/70 dark:text-emerald-400/60 uppercase tracking-wider">⚡ Note Change Speed</span>
                    <span className="text-[8px] text-emerald-500/40 dark:text-emerald-500/30">(LM n-gram block)</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">No-Repeat N-gram</label>
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{noRepeatNgramSize}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={1}
                      value={noRepeatNgramSize}
                      onChange={(e) => setNoRepeatNgramSize(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-emerald-500"
                    />
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500">Blocks repeating N consecutive audio codes, forcing faster note changes. 0 = off, 3 = block 600ms patterns, 5+ = very fast changes. Higher values may reduce coherence.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* VOCAL STYLE CONTROLS — caption injection */}
            {!instrumental && (
            <div className="bg-white dark:bg-suno-card rounded-xl border border-purple-200 dark:border-purple-500/20 overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 dark:bg-purple-500/5 border-b border-purple-100 dark:border-purple-500/10 flex items-center gap-2">
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">🎤 Vocal Style</span>
                <span className="text-[9px] text-purple-500/60 dark:text-purple-500/40">Injected in caption</span>
              </div>
              <div className="p-3 space-y-3">

                {/* Vocal Range */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Vocal Range</label>
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                      {['Default', 'Narrow', 'Moderate', 'Wide', 'Extreme'][vocalRange]}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {['Off', 'Narrow', 'Mid', 'Wide', 'Max'].map((label, i) => (
                      <button
                        key={i}
                        onClick={() => setVocalRange(i)}
                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold transition-all duration-150 border ${
                          vocalRange === i
                            ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                            : 'bg-zinc-50 dark:bg-black/20 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/30'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500">How many different notes the model uses. Wide/Max = more melodic movement between pitches.</p>
                </div>

                {/* Vocal Style */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Singing Style</label>
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                      {['Default', 'Legato', 'Melismatic', 'Staccato', 'Breathy', 'Powerful'][vocalStyle]}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { label: 'Off', desc: '' },
                      { label: 'Legato', desc: 'smooth' },
                      { label: 'Melisma', desc: 'runs' },
                      { label: 'Staccato', desc: 'punchy' },
                      { label: 'Breathy', desc: 'airy' },
                      { label: 'Power', desc: 'belt' },
                    ].map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => setVocalStyle(i)}
                        className={`flex-1 min-w-[48px] py-1.5 rounded-lg text-[9px] font-bold transition-all duration-150 border ${
                          vocalStyle === i
                            ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                            : 'bg-zinc-50 dark:bg-black/20 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500">How the model delivers the vocals. Melismatic = ornamental runs on syllables ("oh-oh-oh"), Legato = smooth flowing notes.</p>
                </div>

                {/* Note Sustain */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Note Length</label>
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                      {['Default', 'Short', 'Moderate', 'Long', 'Very Long'][noteSustain]}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {['Off', 'Short', 'Mid', 'Long', 'Max'].map((label, i) => (
                      <button
                        key={i}
                        onClick={() => setNoteSustain(i)}
                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold transition-all duration-150 border ${
                          noteSustain === i
                            ? 'bg-purple-500 text-white border-purple-500 shadow-sm'
                            : 'bg-zinc-50 dark:bg-black/20 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/30'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500">How long each note lasts. Long/Max = stretched syllables with more melodic phrasing.</p>
                </div>

              </div>
            </div>
            )}

            {/* Title Input */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
              <div className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                {t('title')}
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('nameSong')}
                className="w-full bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* COMMON SETTINGS */}
        <div className="space-y-4">
          {/* Instrumental Toggle (Simple Mode) */}
          {!customMode && (
            <div className="flex items-center justify-between px-1 py-2">
              <div className="flex items-center gap-2">
                <Music2 size={14} className="text-zinc-500" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('instrumental')}</span>
              </div>
              <button
                onClick={() => setInstrumental(!instrumental)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors duration-200 px-1 border border-zinc-200 dark:border-white/5 ${instrumental ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-black/40'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${instrumental ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Vocal Language (Custom mode) */}
          {customMode && !instrumental && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalLanguage')}
                </label>
                <select
                  value={vocalLanguage}
                  onChange={(e) => setVocalLanguage(e.target.value)}
                  className="w-full bg-white dark:bg-suno-card border border-zinc-200 dark:border-white/5 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  {VOCAL_LANGUAGE_KEYS.map(lang => (
                    <option key={lang.value} value={lang.value}>{t(lang.key)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalGender')}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'male' ? '' : 'male')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'male' ? 'bg-violet-600 text-white border-violet-600' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('male')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'female' ? '' : 'female')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'female' ? 'bg-violet-600 text-white border-violet-600' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('female')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* LORA CONTROL PANEL */}
        {customMode && (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const willOpen = !showLoraPanel;
                  setShowLoraPanel(willOpen);
                  if (willOpen && loraList.length === 0) fetchLoraList();
                }}
                className="flex-1 flex items-center justify-between px-4 py-3 bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sliders size={16} className="text-zinc-500" />
                  <span>LoRA</span>
                  {loraLoaded && (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title={`Loaded: ${selectedLoraName || loraPath}`} />
                  )}
                </div>
                <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showLoraPanel ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={() => setShowLoraManager(true)}
                className="shrink-0 px-3 py-3 rounded-xl text-xs font-semibold bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/30 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                title="Open floating LoRA Manager (drag anywhere)"
              >
                <Database size={14} />
              </button>
              {loraLoaded && (
                <button
                  onClick={handleLoraUnload}
                  disabled={isLoraLoading}
                  className="shrink-0 px-3 py-3 rounded-xl text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/30 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                  title="Unload all LoRA adapters"
                >
                  {isLoraLoading ? '...' : 'Unload'}
                </button>
              )}
            </div>

            {showLoraPanel && (
              <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
                {/* LoRA Selector Dropdowns */}
                <div className="space-y-3">
                  {/* LoRA Name Dropdown */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Select LoRA</label>
                      <button
                        onClick={fetchLoraList}
                        disabled={loraListLoading}
                        className="text-[10px] text-zinc-400 hover:text-violet-500 transition-colors flex items-center gap-1"
                        title="Refresh LoRA list"
                      >
                        {loraListLoading ? <Loader2 size={10} className="animate-spin" /> : '↻'} Refresh
                      </button>
                    </div>
                    <select
                      value={selectedLoraName}
                      onChange={(e) => handleLoraNameSelect(e.target.value)}
                      disabled={loraLoaded}
                      className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white [&>optgroup]:font-bold [&>optgroup]:text-zinc-500"
                    >
                      <option value="">-- Select a LoRA --</option>
                      {loraList.filter(l => l.source === 'library').length > 0 && (
                        <optgroup label="📚 Library">
                          {loraList.filter(l => l.source === 'library').map(l => (
                            <option key={`lib-${l.name}`} value={l.name}>
                              {l.name}{l.metadata?.trigger_tag ? ` [${l.metadata.trigger_tag}]` : ''}{l.baseModel ? ` (${l.baseModel.split('/').pop()})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {loraList.filter(l => l.source === 'output').length > 0 && (
                        <optgroup label="🔧 Training Output">
                          {loraList.filter(l => l.source === 'output').map(l => (
                            <option key={`out-${l.name}`} value={l.name}>
                              {l.name} ({l.variants.length} variant{l.variants.length !== 1 ? 's' : ''})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Variant Dropdown (only when selected LoRA has multiple variants) */}
                  {selectedLoraEntry && selectedLoraEntry.variants.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Variant / Checkpoint</label>
                      <select
                        value={selectedLoraVariant}
                        onChange={(e) => handleLoraVariantSelect(e.target.value)}
                        disabled={loraLoaded}
                        className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                      >
                        {selectedLoraEntry.variants.map(v => (
                          <option key={v.label} value={v.label}>
                            {v.label === 'final' ? '⭐ Final' : `📍 ${v.label}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* LoRA info badge */}
                  {selectedLoraEntry && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedLoraEntry.baseModel && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          selectedLoraEntry.baseModel.includes('turbo')
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                        }`}>
                          🏗️ {selectedLoraEntry.baseModel.split('/').pop()}
                        </span>
                      )}
                      {selectedLoraEntry.metadata?.trigger_tag && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                          🏷️ {selectedLoraEntry.metadata.trigger_tag as string}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                        {selectedLoraEntry.source === 'library' ? '📚' : '🔧'} {selectedLoraEntry.sourceDir}
                      </span>
                    </div>
                  )}

                  {/* Adapter path input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Adapter Path</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={loraPath}
                        onChange={(e) => { setLoraPath(e.target.value); setSelectedLoraName(''); setSelectedLoraVariant(''); }}
                        placeholder="C:\Users\...\checkpoints\epoch_90  or  ./lora_library/my_adapter"
                        className="flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors font-mono"
                      />
                      <button
                        onClick={handleLoraBrowseOpen}
                        className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        title="Browse folders"
                      >
                        <FolderOpen size={14} />
                      </button>
                    </div>
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500">Paste full path to adapter directory (auto-finds adapter_config.json in subdirectories)</p>
                  </div>

                  {/* Current resolved path */}
                  {loraPath && (
                    <div className="bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">📁 Checkpoint Path</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(loraPath); }}
                          className="text-[10px] text-zinc-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
                          title="Copy path"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-700 dark:text-zinc-300 font-mono break-all leading-relaxed" title={loraPath}>
                        {loraPath}
                      </p>
                    </div>
                  )}
                </div>

                {/* LoRA Load/Unload Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        loraLoaded ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                      }`}></div>
                      <span className={`text-xs font-medium ${
                        loraLoaded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {loraLoaded ? t('loraLoaded') : t('loraUnloaded')}
                      </span>
                    </div>
                    <button
                      onClick={handleLoraToggle}
                      disabled={!loraPath.trim() || isLoraLoading}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                        loraLoaded
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/20 hover:from-green-600 hover:to-emerald-700'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {isLoraLoading ? '...' : (loraLoaded ? t('loraUnload') : t('loraLoad'))}
                    </button>
                  </div>
                  {loraError && (
                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                      {loraError}
                    </div>
                  )}
                  {loraLoaded && loraTriggerTag && (
                    <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-1.5 rounded space-y-1.5">
                      <div className="flex items-center gap-1">
                        🏷️ Trigger tag: <strong>{loraTriggerTag}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 dark:text-zinc-400">Injection:</span>
                        {(['prepend', 'append', 'off'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={async () => {
                              setLoraTagPosition(mode);
                              try {
                                await generateApi.setTagPosition({ tag_position: mode }, token || '');
                              } catch (err) {
                                console.error('Failed to set tag position:', err);
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors duration-150 ${
                              loraTagPosition === mode
                                ? 'bg-purple-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            {mode === 'prepend' ? '⬅️ Prepend' : mode === 'append' ? 'Append ➡️' : '🚫 Off'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Use LoRA Checkbox (enable/disable without unloading) */}
                <div className={`flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5 ${!loraLoaded ? 'opacity-40 pointer-events-none' : ''}`}>
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={loraEnabled}
                      onChange={handleLoraEnabledToggle}
                      disabled={!loraLoaded}
                      className="accent-violet-600"
                    />
                    Use LoRA
                  </label>
                </div>

                {/* LoRA Scale Slider */}
                <div className={loraLoaded && !loraEnabled ? 'opacity-40 pointer-events-none' : ''}>
                  <EditableSlider
                    label={t('loraScale')}
                    value={loraScale}
                    min={0}
                    max={2}
                    step={0.05}
                    onChange={handleLoraScaleChange}
                    formatDisplay={(val) => val.toFixed(2)}
                    helpText={t('loraScaleDescription')}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* MUSIC PARAMETERS */}
        <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
          <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-2">
            <Sliders size={14} />
            {t('musicParameters')}
          </h3>

          {/* BPM */}
          <EditableSlider
            label={t('bpm')}
            value={bpm}
            min={0}
            max={300}
            step={5}
            onChange={setBpm}
            formatDisplay={(val) => val === 0 ? t('auto') : val.toString()}
            autoLabel={t('auto')}
          />

          {/* Key & Time Signature */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Key</label>
              <select
                value={keyScale}
                onChange={(e) => setKeyScale(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
              >
                <option value="">Auto</option>
                {KEY_SIGNATURES.filter(k => k).map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Time</label>
              <select
                value={timeSignature}
                onChange={(e) => setTimeSignature(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
              >
                {TIME_SIGNATURES.map(ts => (
                  <option key={ts.value} value={ts.value}>{ts.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ADVANCED SETTINGS */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-zinc-500" />
            <span>{t('advancedSettings')}</span>
          </div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
            {/* Load Parameters from JSON */}
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-white/15 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer transition-colors">
              <Upload size={14} />
              Load Parameters (JSON)
              <input
                type="file"
                accept=".json"
                onChange={handleLoadParamsFile}
                className="hidden"
              />
            </label>

            {/* Duration */}
            <EditableSlider
              label={t('duration')}
              value={duration}
              min={-1}
              max={600}
              step={5}
              onChange={setDuration}
              formatDisplay={(val) => val === -1 ? t('auto') : `${val}${t('seconds')}`}
              autoLabel={t('auto')}
              helpText={`${t('auto')} - 10 ${t('min')}`}
            />

            {/* Batch Size */}
            <EditableSlider
              label={t('batchSize')}
              value={batchSize}
              min={1}
              max={4}
              step={1}
              onChange={setBatchSize}
              helpText={t('numberOfVariations')}
              title="Creates multiple variations in a single run. More variations = longer total time."
            />

            {/* Bulk Generate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('bulkGenerate')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">
                  {bulkCount} {t(bulkCount === 1 ? 'job' : 'jobs')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 5, 10].map((count) => (
                  <button
                    key={count}
                    onClick={() => { setBulkCount(count); localStorage.setItem('ace-bulkCount', String(count)); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors duration-150 ${
                      bulkCount === count
                        ? 'bg-gradient-to-r from-orange-500 to-violet-600 text-white shadow-md'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500">{t('queueMultipleJobs')}</p>
            </div>

            {/* Inference Steps */}
            <EditableSlider
              label={t('inferenceSteps')}
              value={inferenceSteps}
              min={1}
              max={isTurboModel(selectedModel) ? 100 : 500}
              step={1}
              onChange={setInferenceSteps}
              helpText={t('moreStepsBetterQuality')}
              title="More steps usually improves quality but slows generation. Turbo optimized for 8, but higher values may improve quality."
            />

            {/* Guidance Scale */}
            <EditableSlider
              label={t('guidanceScale')}
              value={guidanceScale}
              min={1}
              max={15}
              step={0.1}
              onChange={setGuidanceScale}
              formatDisplay={(val) => val.toFixed(1)}
              helpText={t('howCloselyFollowPrompt')}
              title="How strongly the model follows the prompt. Higher = stricter, lower = freer."
            />

            {/* Audio Format & Inference Method */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('audioFormat')}</label>
                <select
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value as 'mp3' | 'flac')}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  <option value="mp3">{t('mp3Smaller')}</option>
                  <option value="flac">{t('flacLossless')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Deterministic is more repeatable; stochastic adds randomness.">{t('inferMethod')}</label>
                <select
                  value={inferMethod}
                  onChange={(e) => setInferMethod(e.target.value as 'ode' | 'sde')}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  <option value="ode">{t('odeDeterministic')}</option>
                  <option value="sde">{t('sdeStochastic')}</option>
                </select>
              </div>
            </div>

            {/* LM Backend */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmBackendLabel')}</label>
              <select
                value={lmBackend}
                onChange={(e) => setLmBackend(e.target.value as 'pt' | 'vllm')}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none"
              >
                <option value="pt">{t('lmBackendPt')}</option>
                <option value="vllm">{t('lmBackendVllm')}</option>
              </select>
              <p className="text-[10px] text-zinc-500">{t('lmBackendHint')}</p>
            </div>

            {/* LM Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmModelLabel')}</label>
              <div className="flex gap-1.5">
                <select
                  value={lmModel}
                  onChange={(e) => { const v = e.target.value; setLmModel(v); localStorage.setItem('ace-lmModel', v); }}
                  className="flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none"
                  disabled={llmSwapping}
                >
                  <option value="acestep-5Hz-lm-0.6B">{t('lmModel06B')}</option>
                  <option value="acestep-5Hz-lm-1.7B">{t('lmModel17B')}</option>
                  <option value="acestep-5Hz-lm-4B">{t('lmModel4B')}</option>
                </select>
                <button
                  onClick={handleLlmSwap}
                  disabled={llmSwapping || (llmStatus?.loaded && llmStatus?.model === lmModel)}
                  title={llmSwapping ? 'Swapping...' : (llmStatus?.loaded && llmStatus?.model === lmModel) ? 'Already loaded' : 'Load this LLM model (unloads current)'}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                    llmSwapping ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-500 cursor-wait' :
                    (llmStatus?.loaded && llmStatus?.model === lmModel) ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-500 cursor-default' :
                    'bg-violet-500/20 border-violet-500/30 text-violet-400 hover:bg-violet-500/30 cursor-pointer'
                  }`}
                >
                  {llmSwapping ? <Loader2 size={12} className="animate-spin" /> :
                   (llmStatus?.loaded && llmStatus?.model === lmModel) ? <Check size={12} /> :
                   <RefreshCw size={12} />}
                  {llmSwapping ? 'Loading...' : (llmStatus?.loaded && llmStatus?.model === lmModel) ? 'Loaded' : 'Load'}
                </button>
              </div>
              {/* LLM Status Indicator */}
              {llmStatus && (
                <div className={`flex items-center gap-1.5 text-[10px] ${llmStatus.loaded ? 'text-emerald-500' : 'text-zinc-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${llmStatus.loaded ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  {llmStatus.loaded
                    ? `Active: ${llmStatus.model || 'unknown'} (${llmStatus.backend || 'pt'})`
                    : 'No LLM loaded'}
                </div>
              )}
              {/* Warning when thinking is disabled */}
              {!thinking && !enhance && (
                <div className="flex items-center gap-1 text-[10px] text-amber-500">
                  <AlertTriangle size={10} />
                  <span>Think & Enhance are off — LLM is skipped during generation</span>
                </div>
              )}
              <p className="text-[10px] text-zinc-500">{t('lmModelHint')}</p>
            </div>

            {/* Seed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dices size={14} className="text-zinc-500" />
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Fixing the seed makes results repeatable. Random is recommended for variety.">{t('seed')}</span>
                </div>
                <button
                  onClick={() => setRandomSeed(!randomSeed)}
                  className={`w-10 h-5 rounded-full flex items-center transition-colors duration-200 px-0.5 border border-zinc-200 dark:border-white/5 ${randomSeed ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-black/40'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${randomSeed ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Hash size={14} className="text-zinc-500" />
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  placeholder={t('enterFixedSeed')}
                  disabled={randomSeed}
                  className={`flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none ${randomSeed ? 'opacity-40 cursor-not-allowed' : ''}`}
                />
              </div>
              <p className="text-[10px] text-zinc-500">{randomSeed ? t('randomSeedRecommended') : t('fixedSeedReproducible')}</p>
            </div>

            {/* Thinking Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5">
              <span className={`text-xs font-medium ${loraLoaded ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-600 dark:text-zinc-400'}`} title="Lets the lyric model reason about structure and metadata. Slightly slower.">{t('thinkingCot')}</span>
              <button
                onClick={() => !loraLoaded && setThinking(!thinking)}
                disabled={loraLoaded}
                className={`w-10 h-5 rounded-full flex items-center transition-colors duration-200 px-0.5 border border-zinc-200 dark:border-white/5 ${thinking ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-black/40'} ${loraLoaded ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${thinking ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Shift */}
            <EditableSlider
              label={t('shift')}
              value={shift}
              min={1}
              max={5}
              step={0.1}
              onChange={setShift}
              formatDisplay={(val) => val.toFixed(1)}
              helpText={t('timestepShiftForBase')}
              title="Adjusts the diffusion schedule. Only affects base model."
            />

            {/* Divider */}
            <div className="border-t border-zinc-200 dark:border-white/10 pt-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mb-3">{t('expertControls')}</p>
            </div>

            {uploadError && (
              <div className="text-[11px] text-rose-500">{uploadError}</div>
            )}

            {/* LM Parameters */}
            <button
              onClick={() => setShowLmParams(!showLmParams)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/60 dark:bg-black/20 rounded-xl border border-zinc-200/70 dark:border-white/10 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Music2 size={16} className="text-zinc-500" />
                <div className="flex flex-col items-start">
                  <span title="Controls the 5Hz lyric/caption model sampling behavior.">{t('lmParameters')}</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal">{t('controlLyricGeneration')}</span>
                </div>
              </div>
              <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showLmParams ? 'rotate-180' : ''}`} />
            </button>

            {showLmParams && (
              <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
                {/* LM Temperature */}
                <EditableSlider
                  label={t('lmTemperature')}
                  value={lmTemperature}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={setLmTemperature}
                  formatDisplay={(val) => val.toFixed(2)}
                  helpText={t('higherMoreRandom')}
                  title="Higher temperature = more random word choices."
                />

                {/* LM CFG Scale */}
                <EditableSlider
                  label={t('lmCfgScale')}
                  value={lmCfgScale}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={setLmCfgScale}
                  formatDisplay={(val) => val.toFixed(1)}
                  helpText={t('noCfgScale')}
                  title="How strongly the lyric model follows the prompt."
                />

                {/* LM Top-K & Top-P */}
                <div className="grid grid-cols-2 gap-3">
                  <EditableSlider
                    label={t('topK')}
                    value={lmTopK}
                    min={0}
                    max={100}
                    step={1}
                    onChange={setLmTopK}
                    title="Restricts choices to the K most likely tokens. 0 disables."
                  />
                  <EditableSlider
                    label={t('topP')}
                    value={lmTopP}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={setLmTopP}
                    formatDisplay={(val) => val.toFixed(2)}
                    title="Samples from the smallest set whose total probability is P."
                  />
                </div>

                {/* LM Negative Prompt */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Words or ideas to steer the lyric model away from.">{t('lmNegativePrompt')}</label>
                  <textarea
                    value={lmNegativePrompt}
                    onChange={(e) => setLmNegativePrompt(e.target.value)}
                    placeholder={t('thingsToAvoid')}
                    className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
                  />
                  <p className="text-[10px] text-zinc-500">{t('useWhenCfgScaleGreater')}</p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide" title="Controls how much the output follows the input audio.">{t('transform')}</h4>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('controlSourceAudio')}</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('audioCodes')}</label>
                <button
                  type="button"
                  onClick={() => onShowInfo?.({
                    title: 'Audio Codes (Códigos Semánticos)',
                    content: `<p class="mb-1.5">Tokens semánticos a 5Hz que codifican la <span class="text-amber-300">melodía, ritmo y estructura</span> del audio. Cuando están presentes:</p><ul class="list-disc list-inside space-y-0.5 text-zinc-400"><li><span class="text-emerald-300">task_type</span> cambia automáticamente a <span class="text-orange-300">cover</span></li><li>El modelo sigue la estructura melódica de los códigos</li><li><span class="text-emerald-300">source audio</span> se ignora cuando hay códigos</li><li><span class="text-emerald-300">audio_cover_strength</span> controla la adherencia</li></ul><p class="mt-1.5 text-zinc-500">Usa "Convert to Codes" para extraer de un audio, o el Grabador de Voz que los extrae automáticamente.</p>`
                  })}
                  className="text-zinc-500 hover:text-violet-400 transition-colors"
                  title="Ver info sobre Audio Codes"
                >
                  <Info size={12} />
                </button>
              </div>
              <textarea
                value={audioCodes}
                onChange={(e) => setAudioCodes(e.target.value)}
                placeholder={t('optionalAudioCodes')}
                className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!sourceAudioUrl || !token) return;
                    setIsConvertingCodes(true);
                    try {
                      const result = await trainingApi.convertToCodes(sourceAudioUrl, token);
                      if (result.codes && !result.codes.startsWith('❌')) {
                        setAudioCodes(result.codes);
                      } else {
                        console.error('Convert to codes failed:', result.codes || result.error);
                      }
                    } catch (err) {
                      console.error('Convert to codes error:', err);
                    } finally {
                      setIsConvertingCodes(false);
                    }
                  }}
                  disabled={!sourceAudioUrl || isConvertingCodes}
                  title="Convert source audio to LM codes (requires Gradio service)"
                  className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {isConvertingCodes && <Loader2 size={10} className="animate-spin" />}
                  Convert to Codes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Transcribe audio codes to metadata — requires Gradio lambda (not exposed as API)
                    console.log('Transcribe: requires audio codes. Use Gradio UI for this feature.');
                  }}
                  disabled={!audioCodes.trim()}
                  title="Transcribe audio codes to metadata (requires audio codes)"
                  className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Transcribe
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Choose text-to-music or audio-based modes.">{t('taskType')}</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  <option value="text2music">{t('textToMusic')}</option>
                  <option value="audio2audio">{t('audio2audio')}</option>
                  <option value="cover">{t('coverTask')}</option>
                  <option value="repaint">{t('repaintTask')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="How strongly the reference audio influences the style.">Ref Strength</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={audioCoverStrength}
                  onChange={(e) => setAudioCoverStrength(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="How strongly the source/cover audio shapes the result.">Source Strength</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={sourceStrength}
                  onChange={(e) => setSourceStrength(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Start time for the region to repaint (seconds).">{t('repaintingStart')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={repaintingStart}
                  onChange={(e) => setRepaintingStart(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="End time for the region to repaint (seconds).">{t('repaintingEnd')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={repaintingEnd}
                  onChange={(e) => setRepaintingEnd(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Additional directives to guide generation.">{t('instruction')}</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
              />
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('guidance')}</h4>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('advancedCfgScheduling')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Fraction of the diffusion process to start applying guidance.">{t('cfgIntervalStart')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={cfgIntervalStart}
                  onChange={(e) => setCfgIntervalStart(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Fraction of the diffusion process to stop applying guidance.">{t('cfgIntervalEnd')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={cfgIntervalEnd}
                  onChange={(e) => setCfgIntervalEnd(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Override the default timestep schedule (advanced).">{t('customTimesteps')}</label>
              <input
                type="text"
                value={customTimesteps}
                onChange={(e) => setCustomTimesteps(e.target.value)}
                placeholder={t('timestepsPlaceholder')}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Scales score-based guidance (advanced).">{t('scoreScale')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={scoreScale}
                  onChange={(e) => setScoreScale(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Bigger chunks can be faster but use more memory.">{t('lmBatchChunkSize')}</label>
                <input
                  type="number"
                  min="1"
                  max="32"
                  step="1"
                  value={lmBatchChunkSize}
                  onChange={(e) => setLmBatchChunkSize(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('trackName')}</label>
              <select
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800"
              >
                <option value="">None</option>
                {TRACK_NAMES.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('completeTrackClasses')}</label>
              <div className="flex flex-wrap gap-2">
                {TRACK_NAMES.map(name => {
                  const selected = completeTrackClasses.split(',').map(s => s.trim()).filter(Boolean);
                  const isChecked = selected.includes(name);
                  return (
                    <label key={name} className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = isChecked
                            ? selected.filter(s => s !== name)
                            : [...selected, name];
                          setCompleteTrackClasses(next.join(','));
                        }}
                        className="accent-violet-600"
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label
                className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400"
                title="Adaptive Dual Guidance: dynamically adjusts CFG for quality. Base model only; slower."
              >
                <input type="checkbox" checked={useAdg} onChange={() => setUseAdg(!useAdg)} />
                {t('useAdg')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Allow the LM to run in larger batches for speed (more VRAM).">
                <input type="checkbox" checked={allowLmBatch} onChange={() => setAllowLmBatch(!allowLmBatch)} />
                {t('allowLmBatch')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Let the LM reason about metadata like BPM, key, duration.">
                <input type="checkbox" checked={useCotMetas} onChange={() => setUseCotMetas(!useCotMetas)} />
                {t('useCotMetas')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Let the LM reason about the caption/style text.">
                <input type="checkbox" checked={useCotCaption} onChange={() => setUseCotCaption(!useCotCaption)} />
                {t('useCotCaption')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Let the LM reason about language selection.">
                <input type="checkbox" checked={useCotLanguage} onChange={() => setUseCotLanguage(!useCotLanguage)} />
                {t('useCotLanguage')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Auto-generate missing fields when possible.">
                <input type="checkbox" checked={autogen} onChange={() => setAutogen(!autogen)} />
                {t('autogen')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Include debug info for constrained decoding.">
                <input type="checkbox" checked={constrainedDecodingDebug} onChange={() => setConstrainedDecodingDebug(!constrainedDecodingDebug)} />
                {t('constrainedDecodingDebug')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Use the formatted caption produced by the AI formatter.">
                <input type="checkbox" checked={isFormatCaption} onChange={() => setIsFormatCaption(!isFormatCaption)} />
                {t('formatCaption')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Return scorer outputs for diagnostics.">
                <input type="checkbox" checked={getScores} onChange={() => setGetScores(!getScores)} />
                {t('getScores')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Return synced lyric (LRC) output when available.">
                <input type="checkbox" checked={getLrc} onChange={() => setGetLrc(!getLrc)} />
                {t('getLrcLyrics')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Snap generation duration to complete musical measures based on BPM and time signature. Avoids cutting off mid-measure.">
                <input type="checkbox" checked={alignToMeasures} onChange={() => setAlignToMeasures(!alignToMeasures)} />
                Align to Measures
              </label>
            </div>
          </div>
        )}
      </div>

      {showAudioModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowAudioModal(false); setPlayingTrackId(null); setPlayingTrackSource(null); }}
          />
          <div className="relative w-[92%] max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">
                    {audioModalTarget === 'reference' ? t('referenceModalTitle') : t('coverModalTitle')}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    {audioModalTarget === 'reference'
                      ? t('referenceModalDescription')
                      : t('coverModalDescription')}
                  </p>
                </div>
                <button
                  onClick={() => { setShowAudioModal(false); setPlayingTrackId(null); setPlayingTrackSource(null); }}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.mp3,.wav,.flac,.m4a,.mp4,audio/*';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) void uploadReferenceTrack(file);
                  };
                  input.click();
                }}
                disabled={isUploadingReference || isTranscribingReference}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-white/20 bg-zinc-50 dark:bg-white/5 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 hover:border-zinc-400 dark:hover:border-white/30 transition-colors duration-150"
              >
                {isUploadingReference ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t('uploadingAudio')}
                  </>
                ) : isTranscribingReference ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t('transcribing')}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    {t('uploadAudio')}
                    <span className="text-xs text-zinc-400 ml-1">{t('audioFormats')}</span>
                  </>
                )}
              </button>

              {uploadError && (
                <div className="mt-2 text-xs text-rose-500">{uploadError}</div>
              )}
              {isTranscribingReference && (
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                  <span>{t('transcribingWithWhisper')}</span>
                  <button
                    type="button"
                    onClick={cancelTranscription}
                    className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                  >
                    {t('cancel')}
                  </button>
                </div>
              )}
            </div>

            {/* Library Section */}
            <div className="border-t border-zinc-100 dark:border-white/5">
              <div className="px-5 py-3 flex items-center gap-2">
                <div className="flex items-center gap-1 bg-zinc-200/60 dark:bg-white/10 rounded-full p-0.5">
                  <button
                    type="button"
                    onClick={() => setLibraryTab('uploads')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      libraryTab === 'uploads'
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }`}
                  >
                    {t('uploaded')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLibraryTab('created')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      libraryTab === 'created'
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }`}
                  >
                    {t('createdTab')}
                  </button>
                </div>
              </div>

              {/* Track List */}
              <div className="max-h-[280px] overflow-y-auto">
                {libraryTab === 'uploads' ? (
                  isLoadingTracks ? (
                    <div className="px-5 py-8 text-center">
                      <RefreshCw size={20} className="animate-spin mx-auto text-zinc-400" />
                      <p className="text-xs text-zinc-400 mt-2">{t('loadingTracks')}</p>
                    </div>
                  ) : referenceTracks.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <Music2 size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                      <p className="text-sm text-zinc-400 mt-2">{t('noTracksYet')}</p>
                      <p className="text-xs text-zinc-400 mt-1">{t('uploadAudioFilesAsReferences')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-white/5">
                      {referenceTracks.map((track) => (
                        <div
                          key={track.id}
                          className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group"
                        >
                          {/* Play Button */}
                          <button
                            type="button"
                            onClick={() => toggleModalTrack({ id: track.id, audio_url: track.audio_url, source: 'uploads' })}
                            className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors"
                          >
                            {playingTrackId === track.id && playingTrackSource === 'uploads' ? (
                              <Pause size={14} fill="currentColor" />
                            ) : (
                              <Play size={14} fill="currentColor" className="ml-0.5" />
                            )}
                          </button>

                          {/* Track Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                {track.filename.replace(/\.[^/.]+$/, '')}
                              </span>
                              {track.tags && track.tags.length > 0 && (
                                <div className="flex gap-1">
                                  {track.tags.slice(0, 2).map((tag, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Progress bar with seek - show when this track is playing */}
                            {playingTrackId === track.id && playingTrackSource === 'uploads' ? (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] text-zinc-400 tabular-nums w-8">
                                  {formatTime(modalTrackTime)}
                                </span>
                                <div
                                  className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                                  onClick={(e) => {
                                    if (modalAudioRef.current && modalTrackDuration > 0) {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const percent = (e.clientX - rect.left) / rect.width;
                                      modalAudioRef.current.currentTime = percent * modalTrackDuration;
                                    }
                                  }}
                                >
                                  <div
                                    className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full relative"
                                    style={{ width: modalTrackDuration > 0 ? `${(modalTrackTime / modalTrackDuration) * 100}%` : '0%' }}
                                  >
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                                <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">
                                  {formatTime(modalTrackDuration)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-xs text-zinc-400 mt-0.5">
                                {track.duration ? formatTime(track.duration) : '--:--'}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => useReferenceTrack({ audio_url: track.audio_url, title: track.filename })}
                              className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                            >
                              {t('useTrack')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteReferenceTrack(track.id)}
                              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : createdTrackOptions.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <Music2 size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                    <p className="text-sm text-zinc-400 mt-2">{t('noCreatedSongsYet')}</p>
                    <p className="text-xs text-zinc-400 mt-1">{t('generateSongsToReuse')}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-white/5">
                    {createdTrackOptions.map((track) => (
                      <div
                        key={track.id}
                        className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group"
                      >
                        <button
                          type="button"
                          onClick={() => toggleModalTrack({ id: track.id, audio_url: track.audio_url, source: 'created' })}
                          className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors"
                        >
                          {playingTrackId === track.id && playingTrackSource === 'created' ? (
                            <Pause size={14} fill="currentColor" />
                          ) : (
                            <Play size={14} fill="currentColor" className="ml-0.5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                            {track.title}
                          </div>
                          {playingTrackId === track.id && playingTrackSource === 'created' ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-zinc-400 tabular-nums w-8">
                                {formatTime(modalTrackTime)}
                              </span>
                              <div
                                className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                                onClick={(e) => {
                                  if (modalAudioRef.current && modalTrackDuration > 0) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const percent = (e.clientX - rect.left) / rect.width;
                                    modalAudioRef.current.currentTime = percent * modalTrackDuration;
                                  }
                                }}
                              >
                                <div
                                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full relative"
                                  style={{ width: modalTrackDuration > 0 ? `${(modalTrackTime / modalTrackDuration) * 100}%` : '0%' }}
                                >
                                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                                </div>
                              </div>
                              <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">
                                {formatTime(modalTrackDuration)}
                              </span>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-400 mt-0.5">
                              {track.duration || '--:--'}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => useReferenceTrack({ audio_url: track.audio_url, title: track.title })}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                          >
                            {t('useTrack')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hidden audio element for modal playback */}
            <audio
              ref={modalAudioRef}
              onTimeUpdate={() => {
                if (modalAudioRef.current) {
                  setModalTrackTime(modalAudioRef.current.currentTime);
                }
              }}
              onLoadedMetadata={() => {
                if (modalAudioRef.current) {
                  setModalTrackDuration(modalAudioRef.current.duration);
                  // Update track duration in database if not set
                  const track = referenceTracks.find(t => t.id === playingTrackId);
                  if (playingTrackSource === 'uploads' && track && !track.duration && token) {
                    fetch(`/api/reference-tracks/${track.id}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({ duration: Math.round(modalAudioRef.current.duration) })
                    }).then(() => {
                      setReferenceTracks(prev => prev.map(t =>
                        t.id === track.id ? { ...t, duration: Math.round(modalAudioRef.current?.duration || 0) } : t
                      ));
                    }).catch(() => undefined);
                  }
                }
              }}
              onEnded={() => setPlayingTrackId(null)}
            />
          </div>
        </div>
      )}

      {/* LoRA Adapter Browser Modal — rendered via portal to escape panel overflow */}
      {showLoraBrowser && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLoraBrowser(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 w-[480px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderSearch size={18} className="text-violet-500" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Select LoRA Adapter</h3>
              </div>
              <button onClick={() => setShowLoraBrowser(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            {/* Current path */}
            <div className="px-4 py-2 bg-zinc-50 dark:bg-black/20 border-b border-zinc-200 dark:border-zinc-700">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate" title={loraBrowseCurrentPath}>
                {loraBrowseRelativePath || loraBrowseCurrentPath}
              </p>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loraBrowseLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-violet-500" />
                </div>
              ) : (
                <div className="py-1">
                  {/* Go up */}
                  {loraBrowseParent && loraBrowseParent !== loraBrowseCurrentPath && (
                    <button
                      onClick={() => handleLoraBrowse(loraBrowseParent)}
                      className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <ArrowLeft size={14} className="text-zinc-400" />
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">..</span>
                    </button>
                  )}
                  
                  {loraBrowseEntries.length === 0 && (
                    <div className="text-center py-8 text-xs text-zinc-400">Empty directory</div>
                  )}

                  {loraBrowseEntries.map((entry) => (
                    <div
                      key={entry.fullPath}
                      className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                    >
                      {entry.type === 'dir' ? (
                        <>
                          <div className={`shrink-0 ${entry.isAdapter ? 'text-green-500' : 'text-amber-500'}`}>
                            {entry.isAdapter ? <Check size={14} /> : <FolderOpen size={14} />}
                          </div>
                          <button
                            onClick={() => entry.isAdapter ? handleLoraBrowseSelect(entry.fullPath) : handleLoraBrowse(entry.fullPath)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <span className={`text-xs font-medium truncate block ${entry.isAdapter ? 'text-green-600 dark:text-green-400' : 'text-zinc-900 dark:text-white'}`}>
                              {entry.name}
                            </span>
                            {entry.isAdapter && (
                              <span className="text-[10px] text-green-500 dark:text-green-400">LoRA adapter</span>
                            )}
                          </button>
                          {entry.isAdapter && (
                            <button
                              onClick={() => handleLoraBrowseSelect(entry.fullPath)}
                              className="shrink-0 px-2 py-1 rounded-md text-[10px] font-bold bg-green-500 text-white hover:bg-green-600 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              Select
                            </button>
                          )}
                          {!entry.isAdapter && (
                            <button
                              onClick={() => handleLoraBrowse(entry.fullPath)}
                              className="shrink-0 px-2 py-1 rounded-md text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              Open
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="shrink-0 text-zinc-300 dark:text-zinc-600">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </div>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{entry.name}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer with select current path button */}
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2">
              <button
                onClick={() => handleLoraBrowseSelect(loraBrowseCurrentPath)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Use current folder
              </button>
              <button
                onClick={() => setShowLoraBrowser(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lyrics Modal */}
      <SongLyricsModal
        isOpen={showLyricsModal}
        onClose={() => setShowLyricsModal(false)}
        onSelectSong={(song, lyrics) => {
          setReferenceAudioUrl(vocalAudioUrl);
          setReferenceAudioTitle(`${vocalAudioTitle || 'Vocal'} (Style Ref)`);
          setReferenceTime(0);
          setReferenceDuration(0);
          setLyrics(lyrics);
          setTitle(song.title);
          if (song.style) setStyle(song.style);
          if (song.generationParams?.duration) setDuration(song.generationParams.duration);
          setTimeout(() => {
            const lyricsTextarea = document.querySelector('textarea[placeholder*="lyrics"]') as HTMLTextAreaElement;
            if (lyricsTextarea) {
              lyricsTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
        }}
      />

      {/* Cover Song Modal - reuse audio modal */}
      {showCoverSongModal && showAudioModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Select Song to Cover</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  Choose a song to regenerate with the loaded voice
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCoverSongModal(false);
                  setShowAudioModal(false);
                }}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} className="text-zinc-500" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Create Button */}
      <div className="p-4 mt-auto sticky bottom-0 bg-zinc-50 dark:bg-suno-panel z-10 border-t border-zinc-200 dark:border-white/5 space-y-3">
        {/* VRAM Monitor — compact widget */}
        {vramStatus && (
          <div className="space-y-1.5">
            {/* Collapsed: compact bar */}
            <button
              type="button"
              onClick={() => setVramExpanded(!vramExpanded)}
              className="w-full flex items-center gap-2 group"
            >
              {/* GPU icon */}
              <div className={`relative shrink-0 ${vramWarning ? 'animate-pulse' : ''}`}>
                <svg className={`w-3.5 h-3.5 ${
                  vramWarning ? 'text-red-500' :
                  vramStatus.usage_percent > 70 ? 'text-amber-500' :
                  'text-zinc-400 dark:text-zinc-500'
                }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <rect x="8" y="8" width="8" height="8" rx="1" />
                  <line x1="2" y1="9" x2="4" y2="9" /><line x1="2" y1="15" x2="4" y2="15" />
                  <line x1="20" y1="9" x2="22" y2="9" /><line x1="20" y1="15" x2="22" y2="15" />
                  <line x1="9" y1="2" x2="9" y2="4" /><line x1="15" y1="2" x2="15" y2="4" />
                  <line x1="9" y1="20" x2="9" y2="22" /><line x1="15" y1="20" x2="15" y2="22" />
                </svg>
              </div>
              {/* Progress bar */}
              <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    vramWarning ? 'bg-red-500' :
                    vramStatus.usage_percent > 70 ? 'bg-amber-500' :
                    vramStatus.usage_percent > 40 ? 'bg-blue-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${vramStatus.usage_percent}%` }}
                />
              </div>
              {/* Percentage */}
              <span className={`text-[10px] font-mono font-bold tabular-nums shrink-0 ${
                vramWarning ? 'text-red-500' :
                vramStatus.usage_percent > 70 ? 'text-amber-500' :
                'text-zinc-400 dark:text-zinc-500'
              }`}>
                {Math.round(vramStatus.usage_percent)}%
              </span>
              <ChevronDown size={10} className={`text-zinc-400 transition-transform ${vramExpanded ? 'rotate-180' : ''}`} />
            </button>

            {/* VRAM Warning banner */}
            {vramWarning && !vramExpanded && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
                <AlertTriangle size={12} className="text-red-500 shrink-0" />
                <span className="text-[10px] font-medium text-red-700 dark:text-red-300 flex-1">
                  VRAM almost full — generation may fail or be slow
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleVramPurge(); }}
                  disabled={isPurging}
                  className="px-2 py-0.5 text-[9px] font-bold bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {isPurging ? <Loader2 size={10} className="animate-spin" /> : 'Purge'}
                </button>
              </div>
            )}

            {/* Expanded details */}
            {vramExpanded && (
              <div className="rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-2.5 space-y-2">
                {/* GPU name + temp */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 truncate">
                    {vramStatus.name}
                  </span>
                  {vramStatus.temperature > 0 && (
                    <span className={`text-[10px] font-mono ${
                      vramStatus.temperature > 85 ? 'text-red-500' :
                      vramStatus.temperature > 70 ? 'text-amber-500' :
                      'text-zinc-400'
                    }`}>
                      {vramStatus.temperature}°C
                    </span>
                  )}
                </div>

                {/* Usage details */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500">Used</div>
                    <div className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{(vramStatus.used_mb / 1024).toFixed(1)}G</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500">Free</div>
                    <div className="text-xs font-bold text-green-600 dark:text-green-400">{(vramStatus.free_mb / 1024).toFixed(1)}G</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500">Total</div>
                    <div className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{(vramStatus.total_mb / 1024).toFixed(1)}G</div>
                  </div>
                </div>

                {/* GPU utilization bar */}
                {vramStatus.utilization > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide w-8">GPU</span>
                    <div className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${vramStatus.utilization}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 w-8 text-right">{vramStatus.utilization}%</span>
                  </div>
                )}

                {/* Purge button */}
                <button
                  type="button"
                  onClick={handleVramPurge}
                  disabled={isPurging}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 disabled:opacity-50"
                >
                  {isPurging ? (
                    <><Loader2 size={12} className="animate-spin" /> Purging memory...</>
                  ) : (
                    <><RefreshCw size={12} /> Purge VRAM Cache</>
                  )}
                </button>

                {/* Purge result feedback */}
                {lastPurgeResult && (
                  <div className={`text-center text-[10px] font-medium ${
                    lastPurgeResult.includes('failed') ? 'text-red-500' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {lastPurgeResult}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* LoRA + Cover safety warning */}
        {loraLoaded && taskType === 'cover' && batchSize > 1 && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
            <AlertTriangle size={12} className="text-amber-500 shrink-0" />
            <span className="text-[10px] text-amber-700 dark:text-amber-300">
              LoRA + Cover: batch size forced to 1 to prevent tensor errors
            </span>
          </div>
        )}

        {/* Quick LM Parameters — collapsible */}
        <button
          type="button"
          onClick={() => setShowQuickLmParams(!showQuickLmParams)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sliders size={13} className="text-zinc-400" />
            <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">LM Parameters</span>
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono">
              T{lmTemperature.toFixed(1)} · RP{(1.0 + melodicVariation * 0.5).toFixed(2)} · S{shift.toFixed(0)} · {inferenceSteps}st · {inferMethod.toUpperCase()}
            </span>
          </div>
          <ChevronDown size={12} className={`text-zinc-400 transition-transform ${showQuickLmParams ? 'rotate-180' : ''}`} />
        </button>

        {showQuickLmParams && (
          <div className="rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/5 p-3 space-y-3">
            {/* Section: LM Sampling */}
            <div className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">LM Sampling</div>
            {/* Row 1: Temperature + CFG Scale */}
            <div className="grid grid-cols-2 gap-3">
              <EditableSlider
                label="Temperature"
                value={lmTemperature}
                min={0}
                max={2}
                step={0.05}
                onChange={setLmTemperature}
                formatDisplay={(v) => v.toFixed(2)}
                title="Controls randomness of melody/lyrics generation. Higher = more creative but less coherent."
              />
              <EditableSlider
                label="LM CFG Scale"
                value={lmCfgScale}
                min={1}
                max={5}
                step={0.1}
                onChange={setLmCfgScale}
                formatDisplay={(v) => v.toFixed(1)}
                title="How strongly the LM follows the prompt. Higher = stricter adherence."
              />
            </div>
            {/* Row 2: Top-K + Top-P */}
            <div className="grid grid-cols-2 gap-3">
              <EditableSlider
                label="Top-K"
                value={lmTopK}
                min={0}
                max={100}
                step={1}
                onChange={setLmTopK}
                title="Restricts choices to K most likely tokens. 0 = disabled."
              />
              <EditableSlider
                label="Top-P"
                value={lmTopP}
                min={0}
                max={1}
                step={0.01}
                onChange={setLmTopP}
                formatDisplay={(v) => v.toFixed(2)}
                title="Nucleus sampling: samples from smallest set totaling P probability."
              />
            </div>
            {/* Repetition Penalty */}
            <EditableSlider
              label="Repetition Penalty"
              value={1.0 + melodicVariation * 0.5}
              min={1.0}
              max={1.5}
              step={0.05}
              onChange={(v) => {
                const mv = Math.max(0, Math.min(1, (v - 1.0) / 0.5));
                setMelodicVariation(mv);
              }}
              formatDisplay={(v) => v.toFixed(2)}
              helpText="1.0 = off, 1.25 = moderate, 1.5 = strong"
              title="Penalizes repeated audio codes to increase melodic diversity."
            />
            {/* Negative Prompt */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Negative Prompt</label>
              <textarea
                value={lmNegativePrompt}
                onChange={(e) => setLmNegativePrompt(e.target.value)}
                placeholder="Things to avoid..."
                className="w-full h-12 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-[11px] text-zinc-900 dark:text-white focus:outline-none resize-none"
              />
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-200 dark:border-white/5" />

            {/* Section: Diffusion (DiT) */}
            <div className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Diffusion (DiT)</div>
            <div className="grid grid-cols-2 gap-3">
              <EditableSlider
                label="DiT Guidance"
                value={guidanceScale}
                min={1}
                max={15}
                step={0.5}
                onChange={setGuidanceScale}
                formatDisplay={(v) => v.toFixed(1)}
                title="Classifier-free guidance for the diffusion model. Higher = follows prompt more strictly but less natural."
              />
              <EditableSlider
                label="Shift"
                value={shift}
                min={1}
                max={10}
                step={0.5}
                onChange={setShift}
                formatDisplay={(v) => v.toFixed(1)}
                title="Timestep shift factor. Higher = more deviation from base model. Default 3.0 for turbo."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditableSlider
                label="Steps"
                value={inferenceSteps}
                min={4}
                max={100}
                step={1}
                onChange={setInferenceSteps}
                title="Diffusion inference steps. 8-12 for turbo, 32-100 for base model. More = higher quality but slower."
              />
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Sampler</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setInferMethod('ode')}
                    className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${
                      inferMethod === 'ode'
                        ? 'bg-violet-500/20 text-violet-500 border border-violet-500/30'
                        : 'bg-zinc-100 dark:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                    title="ODE: Deterministic, consistent results for the same seed."
                  >
                    ODE
                  </button>
                  <button
                    type="button"
                    onClick={() => setInferMethod('sde')}
                    className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${
                      inferMethod === 'sde'
                        ? 'bg-purple-500/20 text-purple-500 border border-purple-500/30'
                        : 'bg-zinc-100 dark:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                    title="SDE: Stochastic, adds noise during diffusion for more variation and texture."
                  >
                    SDE
                  </button>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-200 dark:border-white/5" />

            {/* Section: Chain-of-Thought */}
            <div className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Chain-of-Thought (CoT)</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer" title="Let the LM reason about metadata: BPM, key, duration, time signature.">
                <input
                  type="checkbox"
                  checked={useCotMetas}
                  onChange={() => setUseCotMetas(!useCotMetas)}
                  className="w-3 h-3 rounded border-zinc-300 dark:border-zinc-600 accent-violet-500"
                />
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Metas</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" title="Let the LM rewrite/format the caption for better results.">
                <input
                  type="checkbox"
                  checked={useCotCaption}
                  onChange={() => setUseCotCaption(!useCotCaption)}
                  className="w-3 h-3 rounded border-zinc-300 dark:border-zinc-600 accent-violet-500"
                />
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Caption</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer" title="Let the LM detect the vocal language automatically.">
                <input
                  type="checkbox"
                  checked={useCotLanguage}
                  onChange={() => setUseCotLanguage(!useCotLanguage)}
                  className="w-3 h-3 rounded border-zinc-300 dark:border-zinc-600 accent-violet-500"
                />
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Language</span>
              </label>
            </div>
            <p className="text-[9px] text-zinc-400 dark:text-zinc-500">
              CoT lets the LM reason before generating audio codes. Disabling Metas forces the model to use your provided BPM/key/duration. Disabling Caption skips prompt rewriting.
            </p>
          </div>
        )}

        {activeJobCount > 0 && (
          <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <Loader2 size={12} className="animate-spin text-violet-500" />
            <span>{activeJobCount} / {maxConcurrentJobs} {activeJobCount === 1 ? 'job' : 'jobs'} running</span>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            className={`flex-1 h-12 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-[filter] duration-150 transform active:scale-[0.98] shadow-lg hover:brightness-110 ${
              activeJobCount >= maxConcurrentJobs
                ? 'bg-zinc-400 dark:bg-zinc-600 text-white/70 cursor-not-allowed'
                : 'bg-gradient-to-r from-orange-500 to-violet-600 text-white'
            }`}
            disabled={activeJobCount >= maxConcurrentJobs || !isAuthenticated || isSeparating}
          >
            <Sparkles size={18} />
            <span>
              {isSeparating
                ? 'Separating audio...'
                : activeJobCount >= maxConcurrentJobs
                ? `Queue full (${maxConcurrentJobs}/${maxConcurrentJobs})`
                : bulkCount > 1
                  ? `${t('createButton')} ${bulkCount} ${t('jobs')} (${bulkCount * batchSize} ${t('variations')})`
                  : `${t('createButton')}${batchSize > 1 ? ` (${batchSize} ${t('variations')})` : ''}`
              }
            </span>
          </button>
          {lyrics.trim() && /\[.+\]/.test(lyrics) && (
            <button
              onClick={handleSectionGenerate}
              className={`h-12 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-[filter] duration-150 transform active:scale-[0.98] shadow-lg hover:brightness-110 ${
                activeJobCount >= maxConcurrentJobs
                  ? 'bg-zinc-400 dark:bg-zinc-600 text-white/70 cursor-not-allowed'
                  : 'bg-gradient-to-r from-violet-500 to-violet-600 text-white'
              }`}
              disabled={activeJobCount >= maxConcurrentJobs || !isAuthenticated || isSeparating}
              title="Generate section by section (Suno-style): parses [Verse], [Chorus], etc. and generates each section sequentially for better structure alignment."
            >
              <Layers size={16} />
              <span>Sections</span>
            </button>
          )}
        </div>
      </div>

      {/* Floating LoRA Manager */}
      <LoraManager
        visible={showLoraManager}
        onClose={() => setShowLoraManager(false)}
        token={token || ''}
        loraLoaded={loraLoaded}
        loraEnabled={loraEnabled}
        loraScale={loraScale}
        loraPath={loraPath}
        loraTriggerTag={loraTriggerTag}
        loraTagPosition={loraTagPosition}
        selectedLoraName={selectedLoraName}
        selectedLoraVariant={selectedLoraVariant}
        isLoraLoading={isLoraLoading}
        loraError={loraError}
        onLoadLora={handleLoraLoadFromManager}
        onUnloadLora={handleLoraUnload}
        onSetScale={handleLoraScaleChange}
        onToggleEnabled={handleLoraEnabledToggle}
        onSetTagPosition={async (pos: string) => {
          try {
            await generateApi.setTagPosition({ tag_position: pos }, token || '');
            setLoraTagPosition(pos);
          } catch { /* ignore */ }
        }}
      />
    </div>
  );
};
