import React, { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Wand2, Upload, X, Dice5, Loader2, Mic, Music, Sliders, Piano, Save, FolderOpen, Trash2, Cpu, ChevronDown, Check, Palette, Download, RefreshCw } from 'lucide-react';
import CollapsibleSection from '../ui/CollapsibleSection';
import SliderField from '../ui/SliderField';
import SelectField from '../ui/SelectField';
import ToggleField from '../ui/ToggleField';
import AudioSections from './AudioSections';
import ChordEditor from './ChordEditor';
import SectionControls, { SECTION_TAGS } from './SectionControls';
import LoraManager from './LoraManager';
import MicRecorder from './MicRecorder';
import GpuMiniBar from './GpuMiniBar';
import QuickParamsPanel from './QuickParamsPanel';
import {
  GenerationParams, DEFAULT_PARAMS,
  KEY_SIGNATURES, TIME_SIGNATURES, VOCAL_LANGUAGES,
  ChordProgressionState,
} from '../../types';
import { generateApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface CreatePanelProps {
  onGenerate: (params: GenerationParams) => void;
  isGenerating: boolean;
  activeJobCount: number;
  reuseParams?: GenerationParams | null;
  onReuseConsumed?: () => void;
  generationProgress?: number;
  generationStage?: string;
}

export default memo(function CreatePanel({ onGenerate, isGenerating, activeJobCount, reuseParams, onReuseConsumed, generationProgress, generationStage }: CreatePanelProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [params, setParams] = useState<GenerationParams>({ ...DEFAULT_PARAMS });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    text: true, music: true, voice: false, generation: false,
    lm: false, audio: false, expert: false,
  });
  const [isEnhancing, setIsEnhancing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const srcFileInputRef = useRef<HTMLInputElement>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const simpleTextareaRef = useRef<HTMLTextAreaElement>(null);

  // LoRA state
  const [showLoraManager, setShowLoraManager] = useState(false);
  const [loraLoaded, setLoraLoaded] = useState(false);
  const [loraEnabled, setLoraEnabled] = useState(true);
  const [loraScale, setLoraScale] = useState(1.0);
  const [loraPath, setLoraPath] = useState('');
  const [loraTriggerTag, setLoraTriggerTag] = useState('');
  const [loraTagPosition, setLoraTagPosition] = useState('prepend');
  const [selectedLoraName, setSelectedLoraName] = useState('');

  // Chord editor state
  const [chordState, setChordState] = useState<ChordProgressionState>({
    key: 'C', scale: 'major', roman: 'I - V - vi - IV', bpm: 120, beatsPerChord: 2,
  });
  const [showChordModal, setShowChordModal] = useState(false);

  // Template state
  const TEMPLATES_KEY = 'prodia_templates';
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<{ name: string; params: GenerationParams }[]>(() => {
    try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]'); } catch { return []; }
  });
  const saveTemplate = useCallback(() => {
    const name = templateName.trim() || `Template ${savedTemplates.length + 1}`;
    const updated = [...savedTemplates.filter(t => t.name !== name), { name, params: { ...params } }];
    setSavedTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
    setTemplateName('');
    setShowTemplateMenu(false);
  }, [templateName, savedTemplates, params]);
  const loadTemplate = useCallback((t: { name: string; params: GenerationParams }) => {
    setParams(p => ({ ...p, ...t.params }));
    setShowTemplateMenu(false);
  }, []);
  const deleteTemplate = useCallback((name: string) => {
    const updated = savedTemplates.filter(t => t.name !== name);
    setSavedTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
  }, [savedTemplates]);

  // DIT Model options — fallback labels for known models
  const MODEL_LABELS: Record<string, { label: string; color: string }> = {
    'acestep-v15-sft': { label: 'SFT', color: 'accent' },
    'acestep-v15-base': { label: 'Base', color: 'emerald' },
    'acestep-v15-turbo': { label: 'Turbo', color: 'amber' },
  };

  // Model status — which models are available in backend checkpoints
  const [availableModels, setAvailableModels] = useState<{ name: string; is_default: boolean }[]>([]);
  const [showModelMenu, setShowModelMenu] = useState(false);

  // Fetch available models from backend on mount
  useEffect(() => {
    generateApi.getLoadedModels().then(r => {
      setAvailableModels(r.models);
      // If no model selected yet, pick the default
      if (!params.ditModel && r.default_model) {
        set('ditModel', r.default_model);
      }
    }).catch(() => {});
  }, []);

  // LM model size & backend state
  const LM_SIZES = [
    { value: 'acestep-5Hz-lm-0.6B', label: '0.6B', vram: '~0.5 GB' },
    { value: 'acestep-5Hz-lm-1.7B', label: '1.7B', vram: '~1.5 GB' },
    { value: 'acestep-5Hz-lm-4B', label: '4B', vram: '~4 GB' },
  ];
  const [lmSwapping, setLmSwapping] = useState(false);
  const [currentLmModel, setCurrentLmModel] = useState<string | null>(null);
  const [currentLmBackend, setCurrentLmBackend] = useState<string | null>(null);

  // Fetch current LLM status on mount
  useEffect(() => {
    generateApi.getBackendStatus().then(s => {
      if (s.llm?.model) setCurrentLmModel(s.llm.model);
      if (s.llm?.backend) setCurrentLmBackend(s.llm.backend);
    }).catch(() => {});
  }, []);

  // Mic recorder
  const [showMicRecorder, setShowMicRecorder] = useState(false);
  const [micTarget, setMicTarget] = useState<'reference' | 'cover' | 'vocal'>('vocal');

  // Colored lyrics toggle
  const [coloredLyrics, setColoredLyrics] = useState(true);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Consume reuseParams from parent
  useEffect(() => {
    if (reuseParams) {
      setParams(p => ({ ...p, ...reuseParams, customMode: true }));
      onReuseConsumed?.();
    }
  }, [reuseParams, onReuseConsumed]);

  // Sync LoRA state from backend on mount
  useEffect(() => {
    if (!token) return;
    generateApi.getLoraStatus(token).then(status => {
      if (status.loaded) {
        setLoraLoaded(true);
        setLoraEnabled(status.active);
        setLoraScale(status.scale ?? 1.0);
        setLoraPath(status.path);
        setLoraTriggerTag(status.trigger_tag ?? '');
        setLoraTagPosition(status.tag_position === 'replace' ? 'prepend' : status.tag_position ?? 'prepend');
        setSelectedLoraName(status.name ?? '');
      }
    }).catch(() => {});
  }, [token]);

  const set = useCallback(<K extends keyof GenerationParams>(key: K, val: GenerationParams[K]) => {
    setParams(p => ({ ...p, [key]: val }));
  }, []);

  // Swap LM model handler
  const handleSwapLm = useCallback(async (modelPath: string, backend: string) => {
    if (!token || lmSwapping) return;
    setLmSwapping(true);
    try {
      const r = await generateApi.swapLlmModel(modelPath, backend, token);
      if (r.success) {
        setCurrentLmModel(r.model);
        setCurrentLmBackend(r.backend);
        set('lmModel', modelPath);
        set('lmBackend', backend as 'pt' | 'vllm');
      }
    } catch { /* ignore */ } finally {
      setLmSwapping(false);
    }
  }, [token, lmSwapping, set]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleGenerate = useCallback(() => {
    if (isGenerating && activeJobCount >= 4) return;

    let finalParams = { ...params };

    // Duration 0 → auto (-1 for backend)
    if (finalParams.duration === 0) {
      finalParams.duration = -1;
    }

    // Section mode overrides
    if (finalParams.sectionMode) {
      finalParams.batchSize = 1;
      finalParams.alignToMeasures = true;
      // Compute repetition penalty from melodic variation if not manually set
      const mv = (finalParams.melodicVariation ?? 0) / 100;
      if (!finalParams.lmRepetitionPenalty || finalParams.lmRepetitionPenalty === 1.0) {
        finalParams.lmRepetitionPenalty = 1.0 + mv * 0.5;
      }
    }

    onGenerate(finalParams);
  }, [isGenerating, activeJobCount, onGenerate, params]);

  const handleRandomDescription = async () => {
    if (!token) return;
    try {
      const r = await generateApi.getRandomDescription(token);
      setParams(p => ({
        ...p,
        customMode: false,
        songDescription: r.description,
        instrumental: r.instrumental,
        vocalLanguage: r.vocalLanguage || 'en',
      }));
    } catch { /* ignore */ }
  };

  const handleEnhance = async () => {
    if (!token || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const caption = params.customMode
        ? `${params.style || ''} ${params.prompt || ''}`.trim()
        : params.songDescription || '';
      if (!caption) return;
      const r = await generateApi.formatInput({
        caption,
        lyrics: params.lyrics || undefined,
        bpm: params.bpm || undefined,
        duration: params.duration || undefined,
        keyScale: params.keyScale || undefined,
        timeSignature: params.timeSignature || undefined,
      }, token);
      setParams(p => ({
        ...p,
        style: (r.caption as string) || p.style,
        lyrics: (r.lyrics as string) || p.lyrics,
        bpm: (r.bpm as number) || p.bpm,
        keyScale: (r.key_scale as string) || p.keyScale,
        duration: (r.duration as number) || p.duration,
      }));
    } catch { /* ignore */ } finally {
      setIsEnhancing(false);
    }
  };

  const handleFileUpload = async (file: File, target: 'reference' | 'source') => {
    if (!token) return;
    try {
      const r = await generateApi.uploadAudio(file, token);
      if (target === 'reference') {
        set('referenceAudioUrl', r.url);
        set('referenceAudioTitle', file.name);
      } else {
        set('sourceAudioUrl', r.url);
        set('sourceAudioTitle', file.name);
        set('taskType', 'cover');
      }
    } catch { /* ignore */ }
  };

  // LoRA handlers
  const handleLoraLoad = useCallback(async (path: string, name: string, variant: string) => {
    if (!token) return;
    try {
      const r = await generateApi.loadLora({ lora_path: path }, token);
      setLoraLoaded(true);
      setLoraEnabled(true);
      setLoraScale(1.0);
      setLoraPath(path);
      setSelectedLoraName(name);
      setLoraTriggerTag(r.trigger_tag ?? '');
      set('loraPath', path);
      set('loraName', name);
      set('loraLoaded', true);
      set('loraEnabled', true);
      set('loraScale', 1.0);
    } catch { /* ignore */ }
  }, [token, set]);

  const handleLoraUnload = useCallback(async () => {
    if (!token) return;
    try {
      await generateApi.unloadLora(token);
      setLoraLoaded(false);
      setLoraEnabled(false);
      setLoraScale(1.0);
      setLoraPath('');
      setSelectedLoraName('');
      setLoraTriggerTag('');
      set('loraLoaded', false);
      set('loraPath', undefined);
    } catch { /* ignore */ }
  }, [token, set]);

  const handleLoraToggle = useCallback(async () => {
    if (!token) return;
    const next = !loraEnabled;
    setLoraEnabled(next);
    set('loraEnabled', next);
    try { await generateApi.toggleLora(token); } catch { /* ignore */ }
  }, [token, loraEnabled, set]);

  const handleLoraTagPosition = useCallback(async (pos: string) => {
    if (!token) return;
    setLoraTagPosition(pos);
    set('loraTagPosition', pos);
    try { await generateApi.setLoraTagPosition({ position: pos }, token); } catch { /* ignore */ }
  }, [token, set]);

  // Chord apply — conditional audio reference (style tag only, not lyrics)
  const handleChordApply = useCallback((data: { styleTag: string; lyricsTag: string; keyScaleTag: string }) => {
    setParams(p => ({
      ...p,
      style: p.style ? `${p.style}, ${data.styleTag}` : data.styleTag,
      ...(data.lyricsTag ? { lyrics: p.lyrics ? `${data.lyricsTag}\n${p.lyrics}` : data.lyricsTag } : {}),
      keyScale: data.keyScaleTag || p.keyScale,
    }));
  }, []);

  // Audio sections upload
  const handleAudioSectionUpload = useCallback(async (file: File, target: 'reference' | 'source' | 'vocal') => {
    if (!token) return;
    try {
      const r = await generateApi.uploadAudio(file, token);
      if (target === 'reference') {
        set('referenceAudioUrl', r.url);
        set('referenceAudioTitle', file.name);
      } else if (target === 'source') {
        set('sourceAudioUrl', r.url);
        set('sourceAudioTitle', file.name);
        set('taskType', 'cover');
      } else {
        set('vocalAudioUrl', r.url);
        set('vocalAudioTitle', file.name);
      }
    } catch { /* ignore */ }
  }, [token, set]);

  // Mic recording accept
  const handleMicAccept = useCallback(async (blob: Blob, filename: string) => {
    const file = new File([blob], filename, { type: blob.type });
    await handleAudioSectionUpload(file, micTarget === 'cover' ? 'source' : micTarget);
    setShowMicRecorder(false);
  }, [handleAudioSectionUpload, micTarget]);

  // Build tag→hex color map for lyrics coloring
  const tagColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    SECTION_TAGS.forEach(s => { map[s.tag.toLowerCase()] = s.hex; });
    return map;
  }, []);

  // Colorize lyrics lines based on current section tag
  const renderColoredLyrics = useCallback((text: string) => {
    const lines = text.split('\n');
    let currentColor = '#c8c8d8'; // default text color
    return lines.map((line, i) => {
      const trimmed = line.trim().toLowerCase();
      const matchTag = Object.keys(tagColorMap).find(t => trimmed === t || trimmed.startsWith(t));
      if (matchTag) currentColor = tagColorMap[matchTag];
      return (
        <div key={i} style={{ color: currentColor, minHeight: '1.5em', lineHeight: '1.5' }}>
          {line || '\u00a0'}
        </div>
      );
    });
  }, [tagColorMap]);

  // Insert section tag into lyrics
  const handleInsertSectionTag = useCallback((tag: string) => {
    const textarea = lyricsRef.current;
    if (!textarea) {
      set('lyrics', `${tag}\n${params.lyrics || ''}`);
      return;
    }
    const start = textarea.selectionStart;
    const text = params.lyrics || '';
    const before = text.slice(0, start);
    const after = text.slice(start);
    // Blank line before tag (unless at start or already has blank line)
    const needsBlankBefore = before.length > 0 && !before.endsWith('\n\n') && !before.endsWith('\n');
    const needsNewlineBefore = before.length > 0 && !before.endsWith('\n');
    const prefix = needsBlankBefore ? '\n\n' : needsNewlineBefore ? '\n' : '';
    // Just one newline after tag — cursor goes right below
    const suffix = '\n';
    const inserted = `${prefix}${tag}${suffix}`;
    set('lyrics', `${before}${inserted}${after}`);
    const cursorPos = start + inserted.length;
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = cursorPos;
      textarea.focus();
    });
  }, [params.lyrics, set]);

  const keyOptions = KEY_SIGNATURES.map(k => ({ value: k, label: k || 'Auto' }));
  const tsOptions = TIME_SIGNATURES.map(ts => ({ value: ts.value, label: ts.label }));
  const vocalOptions = VOCAL_LANGUAGES.map(l => ({ value: l.code, label: l.label }));
  const taskOptions = [
    { value: '', label: 'Auto' },
    { value: 'text2music', label: 'Text to Music' },
    { value: 'cover', label: 'Cover' },
    { value: 'repaint', label: 'Repaint' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Model switcher + Templates bar */}
        <div className="flex items-center gap-1.5 mb-1">
          {/* DiT Model selector */}
          <div className="relative">
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-100 border border-surface-300/40 hover:border-accent-500/40 transition-colors text-xs"
            >
              <Cpu className="w-3 h-3 text-surface-400" />
              <span className="font-semibold text-surface-800">
                {MODEL_LABELS[params.ditModel || '']?.label || params.ditModel || 'Select'}
              </span>
              {availableModels.some(m => m.name === params.ditModel) && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
              <ChevronDown className="w-3 h-3 text-surface-400" />
            </button>
            {showModelMenu && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-surface-100 border border-surface-300 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-surface-300/40">
                  <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">{t('create.ditModel', 'Model')}</span>
                </div>
                {availableModels.length === 0 && (
                  <div className="px-3 py-3 text-[10px] text-surface-400 text-center">
                    {t('create.noModels', 'No models found in checkpoints/')}
                  </div>
                )}
                {availableModels.map(m => {
                  const info = MODEL_LABELS[m.name];
                  const isSelected = params.ditModel === m.name;
                  const displayLabel = info?.label || m.name;
                  const dotColor = info?.color === 'amber' ? 'bg-amber-500'
                    : info?.color === 'emerald' ? 'bg-emerald-500'
                    : 'bg-accent-500';
                  return (
                    <button
                      key={m.name}
                      onClick={() => { set('ditModel', m.name); setShowModelMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                        isSelected ? 'bg-accent-500/10' : 'hover:bg-surface-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-semibold block ${isSelected ? 'text-accent-400' : 'text-surface-800'}`}>
                          {displayLabel}
                        </span>
                        <span className="text-[10px] text-surface-400 block truncate">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.is_default && (
                          <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-medium">{t('settings.loaded', 'Loaded')}</span>
                        )}
                        {isSelected && <Check className="w-3 h-3 text-accent-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex-1" />
          {/* Template save/load */}
          <div className="relative">
            <button
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-surface-400 hover:text-accent-400 hover:bg-surface-200 transition-colors"
              title={t('create.templates', 'Templates')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('create.templates', 'Templates')}</span>
            </button>
            {showTemplateMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-surface-100 border border-surface-300 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-surface-300/40">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      placeholder={t('create.templateName', 'Template name...')}
                      className="flex-1 bg-surface-200 rounded-md px-2 py-1 text-xs text-surface-900 placeholder:text-surface-400"
                      onKeyDown={e => e.key === 'Enter' && saveTemplate()}
                    />
                    <button
                      onClick={saveTemplate}
                      className="p-1.5 rounded-md bg-accent-500 text-white hover:bg-accent-400 transition-colors"
                      title={t('create.saveTemplate', 'Save current settings')}
                    >
                      <Save className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {savedTemplates.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-surface-400 text-center">{t('create.noTemplates', 'No saved templates')}</p>
                  ) : savedTemplates.map((tpl, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-200 transition-colors group">
                      <button
                        onClick={() => loadTemplate(tpl)}
                        className="flex-1 text-left text-xs text-surface-800 font-medium truncate"
                      >
                        {tpl.name}
                      </button>
                      <button
                        onClick={() => deleteTemplate(tpl.name)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => set('customMode', false)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              !params.customMode ? 'bg-accent-500 text-white' : 'bg-surface-200 text-surface-500 hover:bg-surface-300'
            }`}
          >
            {t('create.simpleMode')}
          </button>
          <button
            onClick={() => set('customMode', true)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              params.customMode ? 'bg-accent-500 text-white' : 'bg-surface-200 text-surface-500 hover:bg-surface-300'
            }`}
          >
            {t('create.advancedMode')}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleRandomDescription}
            className="p-1.5 rounded-md text-surface-400 hover:text-accent-500 hover:bg-surface-200"
            title="Random idea"
          >
            <Dice5 className="w-4 h-4" />
          </button>
          <button
            onClick={handleEnhance}
            disabled={isEnhancing}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-surface-200 text-surface-500 hover:bg-accent-500/20 hover:text-accent-400 disabled:opacity-50"
          >
            {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            {t('create.enhance')}
          </button>
        </div>

        {/* Simple mode */}
        {!params.customMode && (
          <div className="space-y-3">
            <div className="relative">
              <textarea
                value={params.songDescription || ''}
                onChange={e => set('songDescription', e.target.value)}
                placeholder={t('create.descriptionPlaceholder')}
                rows={4}
                ref={el => { (simpleTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; }}
                className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 min-h-[80px] max-h-[400px] no-scrollbar focus:ring-1 focus:ring-accent-500"
              />
              <div
                className="textarea-resize-handle"
                onMouseDown={e => {
                  e.preventDefault();
                  const textarea = simpleTextareaRef.current;
                  if (!textarea) return;
                  const startY = e.clientY;
                  const startH = textarea.offsetHeight;
                  const onMove = (ev: MouseEvent) => {
                    const newH = Math.max(80, Math.min(400, startH + ev.clientY - startY));
                    textarea.style.height = `${newH}px`;
                  };
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              />
            </div>
            <ToggleField
              label={t('create.instrumental')}
              value={params.instrumental}
              onChange={v => set('instrumental', v)}
            />
          </div>
        )}

        {/* Advanced mode */}
        {params.customMode && (
          <div className="space-y-2">
            {/* Text & Style */}
            <CollapsibleSection
              title={t('create.sections.text')}
              isOpen={openSections.text}
              onToggle={() => toggleSection('text')}
            >
              <input
                type="text"
                value={params.title}
                onChange={e => set('title', e.target.value)}
                placeholder={t('create.titlePlaceholder')}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-sm text-surface-900 placeholder:text-surface-400"
              />
              <input
                type="text"
                value={params.style}
                onChange={e => set('style', e.target.value)}
                placeholder={t('create.stylePlaceholder')}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-sm text-surface-900 placeholder:text-surface-400"
              />
              <textarea
                value={params.prompt}
                onChange={e => set('prompt', e.target.value)}
                placeholder={t('create.promptPlaceholder')}
                rows={2}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-sm text-surface-900 placeholder:text-surface-400 resize-y min-h-[50px] max-h-[300px]"
              />
              {/* Audio Sections (Reference / Cover / Vocal) */}
              <AudioSections
                referenceAudioUrl={params.referenceAudioUrl}
                referenceAudioTitle={params.referenceAudioTitle}
                onReferenceUpload={f => handleAudioSectionUpload(f, 'reference')}
                onReferenceClear={() => { set('referenceAudioUrl', undefined); set('referenceAudioTitle', undefined); }}
                coverAudioUrl={params.sourceAudioUrl}
                coverAudioTitle={params.sourceAudioTitle}
                onCoverUpload={f => handleAudioSectionUpload(f, 'source')}
                onCoverClear={() => { set('sourceAudioUrl', undefined); set('sourceAudioTitle', undefined); set('taskType', undefined); }}
                vocalAudioUrl={params.vocalAudioUrl}
                vocalAudioTitle={params.vocalAudioTitle}
                onVocalUpload={f => handleAudioSectionUpload(f, 'vocal')}
                onVocalClear={() => { set('vocalAudioUrl', undefined); set('vocalAudioTitle', undefined); }}
                onRecord={() => { setMicTarget('vocal'); setShowMicRecorder(true); }}
              />
              {/* Lyrics with colored overlay */}
              <div className="relative" ref={lyricsContainerRef}>
                {/* Color toggle button */}
                <button
                  onClick={() => setColoredLyrics(v => !v)}
                  className={`absolute top-1 right-1 z-20 p-1 rounded transition-colors pointer-events-auto ${
                    coloredLyrics
                      ? 'text-accent-400 bg-accent-500/15 hover:bg-accent-500/25'
                      : 'text-surface-500 hover:text-surface-700 hover:bg-surface-200'
                  }`}
                  title={t('create.toggleColors', 'Toggle section colors')}
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
                <textarea
                  value={params.lyrics}
                  onChange={e => set('lyrics', e.target.value)}
                  onScroll={e => {
                    if (overlayRef.current) {
                      overlayRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
                    }
                  }}
                  placeholder={params.instrumental ? t('create.instrumentalNoLyrics', 'Instrumental mode — lyrics disabled') : t('create.lyricsPlaceholder')}
                  rows={6}
                  ref={lyricsRef}
                  disabled={params.instrumental}
                  style={coloredLyrics && params.lyrics && !params.instrumental ? { lineHeight: '1.5', color: 'transparent', caretColor: '#e0e0ee' } : { lineHeight: '1.5' }}
                  className={`relative w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-surface-900 placeholder:text-surface-400 min-h-[100px] max-h-[500px] font-mono text-xs no-scrollbar ${
                    params.instrumental ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                />
                {/* Colored overlay — sits ABOVE textarea text, pointer-events-none */}
                {coloredLyrics && params.lyrics && !params.instrumental && (
                  <div
                    ref={overlayRef}
                    className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none overflow-hidden rounded-md z-10"
                  >
                    <div
                      className="px-2 py-1.5 font-mono text-xs"
                      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5' }}
                    >
                      {renderColoredLyrics(params.lyrics)}
                    </div>
                  </div>
                )}
                {/* Bottom resize handle */}
                <div
                  className="textarea-resize-handle"
                  onMouseDown={e => {
                    e.preventDefault();
                    const textarea = lyricsRef.current;
                    if (!textarea) return;
                    const startY = e.clientY;
                    const startH = textarea.offsetHeight;
                    const onMove = (ev: MouseEvent) => {
                      const newH = Math.max(100, Math.min(500, startH + ev.clientY - startY));
                      textarea.style.height = `${newH}px`;
                    };
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove);
                      document.removeEventListener('mouseup', onUp);
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                  }}
                />
              </div>
              <ToggleField
                label={t('create.instrumental')}
                value={params.instrumental}
                onChange={v => set('instrumental', v)}
              />
              {/* Section Controls */}
              <SectionControls
                sectionMode={params.sectionMode ?? false}
                onSectionModeChange={v => set('sectionMode', v)}
                sectionMeasures={params.sectionMeasures ?? 8}
                onSectionMeasuresChange={v => set('sectionMeasures', v)}
                alignToMeasures={params.alignToMeasures ?? false}
                onAlignToMeasuresChange={v => set('alignToMeasures', v)}
                onInsertTag={params.instrumental ? undefined : handleInsertSectionTag}
              />
            </CollapsibleSection>

            {/* Musical Parameters */}
            <CollapsibleSection
              title={t('create.sections.music')}
              isOpen={openSections.music}
              onToggle={() => toggleSection('music')}
              badge={params.bpm ? `${params.bpm} BPM` : undefined}
            >
              <SliderField label={t('create.bpm')} value={params.bpm} onChange={v => set('bpm', v)} min={30} max={300} tooltip={t('tooltip.bpm')} />
              <div className="space-y-1">
                <SliderField label={t('create.duration')} value={params.duration} onChange={v => set('duration', v)} min={0} max={600} suffix={params.duration === 0 ? 'Auto' : t('create.seconds')} tooltip={t('tooltip.duration')} />
                {params.duration === 0 && (
                  <p className="text-[10px] text-accent-400 ml-1">{t('create.durationAuto', 'Auto: duration based on lyrics & structure')}</p>
                )}
              </div>
              <SelectField label={t('create.key')} value={params.keyScale} onChange={v => set('keyScale', v)} options={keyOptions} tooltip={t('tooltip.key')} />
              <SelectField label={t('create.timeSignature')} value={params.timeSignature} onChange={v => set('timeSignature', v)} options={tsOptions} tooltip={t('tooltip.timeSignature')} />
              {/* Chord Progression — open in modal */}
              <div className="pt-1">
                <button
                  onClick={() => setShowChordModal(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl
                    bg-surface-100 border border-surface-300 hover:border-accent-500/40
                    hover:bg-accent-500/5 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-600/20 to-brand-500/20
                    flex items-center justify-center shrink-0">
                    <Piano className="w-4 h-4 text-accent-400" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold text-surface-800 group-hover:text-accent-400 transition-colors">
                      {t('chords.composerTitle', 'Chord Progression Composer')}
                    </p>
                    <p className="text-[10px] text-surface-500 font-mono truncate">
                      {chordState.roman || t('chords.noProgression', 'No progression set')}
                    </p>
                  </div>
                  <span className="text-[10px] text-surface-400 shrink-0">
                    {chordState.key} {chordState.scale === 'major' ? 'Maj' : 'Min'}
                  </span>
                </button>
              </div>

              {/* Chord Modal */}
              {showChordModal && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                  onClick={() => setShowChordModal(false)}
                >
                  <div
                    className="bg-surface-50 rounded-2xl shadow-2xl border border-surface-300
                      w-[580px] max-w-[95vw] max-h-[90vh] overflow-y-auto"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200 sticky top-0 bg-surface-50 z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-600 to-brand-500
                          flex items-center justify-center">
                          <Piano className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-surface-900">
                            {t('chords.composerTitle', 'Chord Progression Composer')}
                          </h3>
                          <p className="text-[10px] text-surface-400">
                            {t('chords.composerHint', 'Affects the latent audio generation model')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowChordModal(false)}
                        className="p-1.5 rounded-lg hover:bg-surface-200 text-surface-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-5">
                      <ChordEditor
                        value={chordState}
                        onChange={setChordState}
                        onApply={(data) => { handleChordApply(data); setShowChordModal(false); }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CollapsibleSection>

            {/* Voice & Language */}
            <CollapsibleSection
              title={t('create.sections.voice')}
              isOpen={openSections.voice}
              onToggle={() => toggleSection('voice')}
            >
              <SelectField label={t('common.language')} value={params.vocalLanguage} onChange={v => set('vocalLanguage', v)} options={vocalOptions} />
              <button
                onClick={() => { setMicTarget('vocal'); setShowMicRecorder(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                <Mic className="w-3.5 h-3.5" />
                {t('create.recordVoice', 'Record Voice')}
              </button>
            </CollapsibleSection>

            {/* LoRA */}
            <CollapsibleSection
              title="LoRA"
              isOpen={openSections.lora ?? false}
              onToggle={() => toggleSection('lora')}
              badge={loraLoaded ? (loraEnabled ? 'Active' : 'Off') : undefined}
            >
              <div className="space-y-2">
                {loraLoaded ? (
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${loraEnabled ? 'bg-green-500' : 'bg-surface-400'}`} />
                    <span className="text-xs text-surface-700 truncate flex-1">{selectedLoraName}</span>
                    <span className="text-[10px] text-surface-400 font-mono">{loraScale.toFixed(1)}x</span>
                  </div>
                ) : (
                  <p className="text-xs text-surface-400">{t('lora.noLoaded', 'No LoRA loaded')}</p>
                )}
                <button
                  onClick={() => setShowLoraManager(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-colors w-full justify-center"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  {t('lora.openManager', 'Open LoRA Manager')}
                </button>
              </div>
            </CollapsibleSection>

            {/* Generation Settings */}
            <CollapsibleSection
              title={t('create.sections.generation')}
              isOpen={openSections.generation}
              onToggle={() => toggleSection('generation')}
            >
              <SliderField label={t('create.steps')} value={params.inferenceSteps} onChange={v => set('inferenceSteps', v)} min={10} max={200} tooltip={t('tooltip.steps')} />
              <SliderField label={t('create.guidance')} value={params.guidanceScale} onChange={v => set('guidanceScale', v)} min={1} max={30} step={0.5} tooltip={t('tooltip.guidance')} />
              <SliderField label={t('create.batch')} value={params.batchSize} onChange={v => set('batchSize', v)} min={1} max={8} tooltip={t('tooltip.batch')} />
              <SliderField label={t('create.shift')} value={params.shift} onChange={v => set('shift', v)} min={0} max={10} step={0.5} tooltip={t('tooltip.shift')} />
              <div className="flex items-center gap-3">
                <label className="text-xs text-surface-500 w-24">{t('create.seed')}</label>
                <div className="flex-1 flex items-center gap-2">
                  <ToggleField label={t('create.randomSeed')} value={params.randomSeed} onChange={v => set('randomSeed', v)} />
                  {!params.randomSeed && (
                    <input
                      type="number"
                      value={params.seed}
                      onChange={e => set('seed', parseInt(e.target.value) || 0)}
                      className="w-24 bg-surface-100 border border-surface-300 rounded px-2 py-1 text-xs text-surface-900"
                    />
                  )}
                </div>
              </div>
              <ToggleField label={t('create.thinking')} value={params.thinking} onChange={v => set('thinking', v)} tooltip={t('tooltip.thinking')} />
              <div className="flex gap-3">
                <SelectField label={t('create.format')} value={params.audioFormat} onChange={v => set('audioFormat', v as 'mp3' | 'flac')} options={[{ value: 'mp3', label: 'MP3' }, { value: 'flac', label: 'FLAC' }]} />
                <SelectField label={t('create.method')} value={params.inferMethod} onChange={v => set('inferMethod', v as 'ode' | 'sde')} options={[{ value: 'ode', label: 'ODE' }, { value: 'sde', label: 'SDE' }]} />
              </div>
            </CollapsibleSection>

            {/* LM Parameters */}
            <CollapsibleSection
              title={t('create.sections.lm')}
              isOpen={openSections.lm}
              onToggle={() => toggleSection('lm')}
              badge={currentLmModel ? LM_SIZES.find(s => currentLmModel.includes(s.label))?.label : undefined}
            >
              {/* LM Model Size selector */}
              <div className="space-y-1.5">
                <label className="text-xs text-surface-500 font-medium">{t('create.lmModelLabel', 'LM Model')}</label>
                <div className="flex gap-1.5">
                  {LM_SIZES.map(s => {
                    const isActive = currentLmModel?.includes(s.label);
                    return (
                      <button
                        key={s.value}
                        disabled={lmSwapping}
                        onClick={() => handleSwapLm(s.value, params.lmBackend || 'pt')}
                        className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          isActive
                            ? 'bg-accent-500/15 border-accent-500/40 text-accent-400'
                            : 'bg-surface-100 border-surface-300/40 text-surface-500 hover:border-accent-500/30 hover:text-surface-700'
                        } ${lmSwapping ? 'opacity-50' : ''}`}
                      >
                        <span className="font-bold">{s.label}</span>
                        <span className="text-[9px] opacity-70">{s.vram}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                      </button>
                    );
                  })}
                </div>
                {lmSwapping && (
                  <div className="flex items-center gap-1.5 text-[10px] text-accent-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    {t('create.lmSwapping', 'Loading model...')}
                  </div>
                )}
                <p className="text-[10px] text-surface-400">{t('create.lmModelHint', 'Auto-downloads if not present. Larger = better quality, more VRAM.')}</p>
              </div>
              {/* LM Backend toggle */}
              <div className="space-y-1">
                <label className="text-xs text-surface-500 font-medium">{t('create.lmBackendLabel', 'LM Backend')}</label>
                <div className="flex gap-1.5">
                  {(['pt', 'vllm'] as const).map(b => {
                    const isActive = (params.lmBackend || currentLmBackend || 'pt') === b;
                    return (
                      <button
                        key={b}
                        onClick={() => set('lmBackend', b)}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isActive
                            ? 'bg-accent-500/15 border-accent-500/40 text-accent-400'
                            : 'bg-surface-100 border-surface-300/40 text-surface-500 hover:border-accent-500/30'
                        }`}
                      >
                        {b === 'pt' ? 'PyTorch' : 'vLLM'}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-surface-400">{t('create.lmBackendHint', 'PT uses less VRAM, vLLM may be faster on powerful GPUs.')}</p>
              </div>
              <SliderField label={t('create.temperature')} value={params.lmTemperature} onChange={v => set('lmTemperature', v)} min={0} max={2} step={0.05} tooltip={t('tooltip.lmTemperature')} />
              <SliderField label={t('create.cfgScale')} value={params.lmCfgScale} onChange={v => set('lmCfgScale', v)} min={0} max={5} step={0.1} tooltip={t('tooltip.lmCfgScale')} />
              <SliderField label={t('create.topK')} value={params.lmTopK} onChange={v => set('lmTopK', v)} min={1} max={500} tooltip={t('tooltip.topK')} />
              <SliderField label={t('create.topP')} value={params.lmTopP} onChange={v => set('lmTopP', v)} min={0} max={1} step={0.01} tooltip={t('tooltip.topP')} />
              <div className="flex items-center gap-3">
                <label className="text-xs text-surface-500 w-24">{t('create.negativePrompt')}</label>
                <input
                  type="text"
                  value={params.lmNegativePrompt}
                  onChange={e => set('lmNegativePrompt', e.target.value)}
                  className="flex-1 bg-surface-100 border border-surface-300 rounded px-2 py-1 text-xs text-surface-900"
                  placeholder="e.g. noise, distortion..."
                />
              </div>
            </CollapsibleSection>

            {/* Expert */}
            <CollapsibleSection
              title={t('create.sections.expert')}
              isOpen={openSections.expert}
              onToggle={() => toggleSection('expert')}
            >
              <SelectField label={t('create.taskType')} value={params.taskType || ''} onChange={v => set('taskType', v || undefined)} options={taskOptions} />
              <SliderField label={t('create.repaintStart')} value={params.repaintingStart ?? 0} onChange={v => set('repaintingStart', v)} min={0} max={1} step={0.05} tooltip={t('tooltip.repaintStart')} />
              <SliderField label={t('create.repaintEnd')} value={params.repaintingEnd ?? 1} onChange={v => set('repaintingEnd', v)} min={0} max={1} step={0.05} tooltip={t('tooltip.repaintEnd')} />
              <ToggleField label="ADG" value={params.useAdg ?? false} onChange={v => set('useAdg', v)} />
              {(params.sourceAudioUrl || params.taskType === 'cover') && (
                <SliderField label={t('create.coverStrength')} value={params.audioCoverStrength ?? 0.5} onChange={v => set('audioCoverStrength', v)} min={0} max={1} step={0.05} />
              )}
            </CollapsibleSection>
          </div>
        )}
      </div>

      {/* Generate button - sticky at bottom */}
      <div className="px-4 py-3 border-t border-surface-300/60 bg-surface-50 space-y-2">
        <GpuMiniBar
          isGenerating={isGenerating}
          progress={generationProgress}
          stage={generationStage}
        />
        <QuickParamsPanel
          values={{
            lmRepetitionPenalty: params.lmRepetitionPenalty,
            noRepeatNgramSize: params.noRepeatNgramSize,
            melodicVariation: params.melodicVariation,
            lmTemperature: params.lmTemperature,
            lmCfgScale: params.lmCfgScale,
            lmTopK: params.lmTopK,
            lmTopP: params.lmTopP,
            guidanceScale: params.guidanceScale,
            inferenceSteps: params.inferenceSteps,
            shift: params.shift,
            apgNormThreshold: params.apgNormThreshold,
            apgMomentum: params.apgMomentum,
            apgEta: params.apgEta,
          }}
          onChange={(key, value) => set(key as keyof typeof params, value as any)}
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating && activeJobCount >= 4}
          className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            isGenerating && activeJobCount >= 4
              ? 'bg-surface-200 text-surface-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-accent-600 to-brand-600 text-white hover:from-accent-500 hover:to-brand-500 shadow-lg shadow-accent-500/25 hover:shadow-accent-500/40 btn-glow'
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {activeJobCount >= 4 ? t('create.queued') : `${t('create.generating')} (${activeJobCount}/4)`}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {t('create.generate')}
            </>
          )}
        </button>
      </div>

      {/* Modals */}
      <LoraManager
        isOpen={showLoraManager}
        onClose={() => setShowLoraManager(false)}
        token={token || ''}
        loraLoaded={loraLoaded}
        loraEnabled={loraEnabled}
        loraScale={loraScale}
        loraPath={loraPath}
        loraTriggerTag={loraTriggerTag}
        loraTagPosition={loraTagPosition}
        selectedLoraName={selectedLoraName}
        onLoadLora={handleLoraLoad}
        onUnloadLora={handleLoraUnload}
        onSetScale={setLoraScale}
        onToggleEnabled={handleLoraToggle}
        onSetTagPosition={handleLoraTagPosition}
      />
      <MicRecorder
        isOpen={showMicRecorder}
        onClose={() => setShowMicRecorder(false)}
        onAccept={handleMicAccept}
        targetSection={micTarget}
        lyrics={params.lyrics}
        onLyricsChange={l => set('lyrics', l)}
      />
    </div>
  );
})
