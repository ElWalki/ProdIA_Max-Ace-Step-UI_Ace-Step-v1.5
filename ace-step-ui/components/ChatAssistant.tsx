import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, Music, Sparkles, ChevronDown, Zap, Code2, ClipboardPaste, FileEdit, Replace, Disc3, Settings2, CheckCircle2, ToggleLeft, ToggleRight, Play, Pause, Square, Volume2, Palette, Plus, SkipForward, SkipBack, Edit3, Check, Trash2, GripVertical, Minimize2, Globe } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { chatWithAssistant, formatParamsForDisplay, ChatMessage, ParsedMusicRequest } from '../services/chatService';
import { ChordProgressionEditor, InlineChordPreview, ChordProgressionState } from './ChordProgressionEditor';
import { resolveProgression, formatProgressionForGeneration, CHORD_PRESETS, ScaleType } from '../services/chordService';
import { loadConfig, PROVIDERS } from '../services/llmProviderService';
import { uiBridge, UIAction } from '../services/uiBridge';
import type { Song } from '../types';

// Pending actions for a message — each toggleable
interface PendingActionItem {
  action: UIAction;
  enabled: boolean;
  label: string;
}

interface ChatAssistantProps {
  onApplyParams: (params: ParsedMusicRequest) => void;
  onGenerateWithParams: (params: ParsedMusicRequest) => void;
  onSetLyrics: (lyrics: string, mode: 'overwrite' | 'append') => void;
  audioCodes?: string;
  isGenerating?: boolean;
  lastGeneratedSong?: Song | null;
  // Workspace playback sync
  currentSong?: Song | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  onPlaySong?: (song: Song) => void;
  onTogglePlay?: () => void;
  onSeek?: (time: number) => void;
  // Songs list for live updates (title changes etc)
  songs?: Song[];
}

export function ChatAssistant({ onApplyParams, onGenerateWithParams, onSetLyrics, audioCodes, isGenerating, lastGeneratedSong, currentSong, isPlaying, currentTime = 0, duration = 0, onPlaySong, onTogglePlay, onSeek, songs }: ChatAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'codes' | 'chords'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: '🎶 ¡Ey! Soy tu asistente de producción musical de ProdIA Pro 😎\n\nCuéntame qué tienes en mente y te lo monto al momento — tengo control total sobre ACE-Step 🔥\n\nPrueba algo como:\n• "Hazme un reggaetón bien pegajoso a 95 bpm" 🎵\n• "Quiero una balada de rock en español que emocione" 🎸\n• "Sube la calidad al máximo" ✨\n• "¿Qué modelo me recomiendas?" 💡',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [lastParams, setLastParams] = useState<ParsedMusicRequest | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextSongs, setContextSongs] = useState<Song[]>([]);
  // Pending actions per message — key is message id
  const [pendingActionsMap, setPendingActionsMap] = useState<Record<string, PendingActionItem[]>>({});
  // Style editor state
  const [editingStyle, setEditingStyle] = useState(false);
  const [styleEditValue, setStyleEditValue] = useState('');

  // Chord progression state
  const [chordProgression, setChordProgression] = useState<ChordProgressionState>(() => {
    try {
      const saved = localStorage.getItem('prodiaChat_chords');
      return saved ? { beatsPerChord: 2, ...JSON.parse(saved) } : { key: 'C', scale: 'major' as const, roman: 'I - V - vi - IV', bpm: 120, beatsPerChord: 2 };
    } catch { return { key: 'C', scale: 'major' as const, roman: 'I - V - vi - IV', bpm: 120, beatsPerChord: 2 }; }
  });
  // Track song IDs shown in chat cards (for live title sync)
  const [chatSongIds, setChatSongIds] = useState<Set<string>>(new Set());
  // Language selector
  const [chatLang, setChatLang] = useState<'es' | 'en' | 'zh'>(() => {
    try { return (localStorage.getItem('prodiaChat_lang') as any) || 'es'; } catch { return 'es'; }
  });
  // Resize state
  const [chatSize, setChatSize] = useState(() => {
    try {
      const saved = localStorage.getItem('prodiaChat_size');
      return saved ? JSON.parse(saved) : { w: 420, h: 600 };
    } catch { return { w: 420, h: 600 }; }
  });
  const isResizing = useRef(false);
  const prevIsGenerating = useRef(isGenerating);
  const { t } = useI18n();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, activeTab]);

  // Update codes tab when new audio codes arrive
  useEffect(() => {
    if (audioCodes && audioCodes.trim()) {
      setShowCodes(true);
    }
  }, [audioCodes]);

  // Detect generation completion → inject song card into chat
  useEffect(() => {
    if (prevIsGenerating.current && !isGenerating && lastGeneratedSong && lastGeneratedSong.audioUrl) {
      setChatSongIds(prev => new Set(prev).add(lastGeneratedSong.id));
      // Store a snapshot so card persists even if song disappears from workspace
      setMessages(prev => [...prev, {
        id: `song-card-${Date.now()}`,
        role: 'system',
        content: `🎵_SONG_CARD_${lastGeneratedSong.id}`,
        timestamp: new Date(),
        songSnapshot: { ...lastGeneratedSong },
      }]);
    }
    prevIsGenerating.current = isGenerating;
  }, [isGenerating, lastGeneratedSong]);

  // Persist language
  useEffect(() => {
    try { localStorage.setItem('prodiaChat_lang', chatLang); } catch {}
  }, [chatLang]);

  // Persist chat size
  useEffect(() => {
    try { localStorage.setItem('prodiaChat_size', JSON.stringify(chatSize)); } catch {}
  }, [chatSize]);

  // Persist chord progression
  useEffect(() => {
    try { localStorage.setItem('prodiaChat_chords', JSON.stringify(chordProgression)); } catch {}
  }, [chordProgression]);

  // Resize handler
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = chatSize.w;
    const startH = chatSize.h;

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const dw = startX - ev.clientX; // grows to the left
      const dh = startY - ev.clientY; // grows upward
      setChatSize({
        w: Math.max(360, Math.min(700, startW + dw)),
        h: Math.max(400, Math.min(900, startH + dh)),
      });
    };

    const onUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [chatSize]);

  // Clear chat
  const clearChat = () => {
    const welcomeMsg = chatLang === 'en'
      ? '🎶 Hey! I\'m your music production assistant from ProdIA Pro 😎\n\nTell me what you have in mind and I\'ll set it all up — I have full control over ACE-Step 🔥\n\nTry something like:\n• "Make me a catchy reggaeton at 95 bpm" 🎵\n• "I want an emotional rock ballad" 🎸\n• "Max out the quality" ✨\n• "Which model do you recommend?" 💡'
      : chatLang === 'zh'
        ? '🎶 嘿！我是ProdIA Pro的音乐制作助手 😎\n\n告诉我你的想法，我来帮你搞定一切 — 我可以完全控制ACE-Step 🔥\n\n试试这样说：\n• "帮我做一首95 bpm的雷鬼" 🎵\n• "我想要一首感人的摇滚民谣" 🎸\n• "把质量调到最高" ✨\n• "你推荐哪个模型？" 💡'
        : '🎶 ¡Ey! Soy tu asistente de producción musical de ProdIA Pro 😎\n\nCuéntame qué tienes en mente y te lo monto al momento — tengo control total sobre ACE-Step 🔥\n\nPrueba algo como:\n• "Hazme un reggaetón bien pegajoso a 95 bpm" 🎵\n• "Quiero una balada de rock en español que emocione" 🎸\n• "Sube la calidad al máximo" ✨\n• "¿Qué modelo me recomiendas para mi track?" 💡';
    setMessages([{
      id: 'welcome',
      role: 'system',
      content: welcomeMsg,
      timestamp: new Date(),
    }]);
    setPendingActionsMap({});
    setContextSongs([]);
    setLastParams(null);
  };

  // Quick generate from chat (dispatches to UI bridge directly)
  const handleChatGenerate = () => {
    uiBridge.dispatch({ type: 'generate' });
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: '🚀 ¡Generación lanzada! El track aparecerá aquí cuando esté listo 🎵',
      timestamp: new Date(),
    }]);
  };

  // Apply chord progression to generation (inject into style + lyrics + bpm + key via UIBridge)
  const handleApplyChords = (data: { styleTag: string; lyricsTag: string; description: string; bpmTag?: number; keyScaleTag?: string }) => {
    if (uiBridge.isConnected) {
      const currentState = uiBridge.getState();
      const currentStyle = currentState?.style || '';
      // Remove any previous chord progression tag and append the new one
      const cleanStyle = currentStyle
        .replace(/,?\s*[A-G][#b]?\s*(Major|Minor)\s+key,?\s*chord progression[^,]*/gi, '')
        .replace(/,?\s*[A-G][#b]?m?\s*[-–]\s*[A-G].*chord progression/gi, '')
        .trim();
      const newStyle = cleanStyle ? `${cleanStyle}, ${data.styleTag}` : data.styleTag;
      const params: Record<string, any> = { style: newStyle };
      if (data.bpmTag && data.bpmTag > 0) params.bpm = data.bpmTag;
      if (data.keyScaleTag) params.keyScale = data.keyScaleTag;

      // Inject chord structure into lyrics if they exist
      const currentLyrics = currentState?.lyrics || '';
      if (currentLyrics.trim()) {
        // Add chord header if not already present
        if (!currentLyrics.includes('[Chord Progression:')) {
          params.lyrics = `${data.lyricsTag}\n${currentLyrics}`;
        }
      }

      uiBridge.dispatch({ type: 'set', params });
    }
    // Add a system message confirming the action
    setMessages(prev => [...prev, {
      id: `chord-apply-${Date.now()}`,
      role: 'system',
      content: `🎹 Progresión aplicada: ${data.description}${data.bpmTag ? ` • ${data.bpmTag} BPM` : ''}`,
      timestamp: new Date(),
    }]);
  };
  const formatActionLabel = (action: UIAction): string => {
    if (action.type === 'set') {
      const keys = Object.keys(action.params).filter(k => (action.params as any)[k] !== undefined);
      return keys.map(k => `${k}: ${JSON.stringify((action.params as any)[k])}`).join(', ');
    }
    if (action.type === 'generate') return '🚀 Generar canción';
    if (action.type === 'swapModel') return `🤖 Cambiar modelo → ${action.model}`;
    if (action.type === 'purgeVram') return '💾 Purgar VRAM';
    if (action.type === 'loadLora') return `🧬 Cargar LoRA: ${action.name}`;
    if (action.type === 'unloadLora') return t('chatAssistant.formatActionUnloadLora');
    return (action as any).type || 'acción';
  };

  // Helper: toggle a pending action
  const togglePendingAction = (msgId: string, index: number) => {
    setPendingActionsMap(prev => {
      const items = [...(prev[msgId] || [])];
      if (items[index]) items[index] = { ...items[index], enabled: !items[index].enabled };
      return { ...prev, [msgId]: items };
    });
  };

  // Helper: apply selected pending actions
  const applyPendingActions = (msgId: string) => {
    const items = pendingActionsMap[msgId] || [];
    const enabled = items.filter(i => i.enabled);
    let applied = 0;
    for (const item of enabled) {
      if (item.action.type === 'generate') {
        // Generate action uses the current UI state
        uiBridge.dispatch(item.action);
      } else {
        uiBridge.dispatch(item.action);
      }
      applied++;
    }
    // Mark as applied — remove from pending
    setPendingActionsMap(prev => {
      const { [msgId]: _, ...rest } = prev;
      return rest;
    });
    if (applied > 0) {
      const hypeMessages = [
        '¿Le damos caña y generamos? 🚀',
        '¿Generamos esto ya o tocamos algo más? 🎵',
        '¿Quieres ajustar algo más o le damos al play? 🔥',
        '¿Lo dejamos así de bonito o le metemos más magia? ✨',
        '¿Lanzamos la generación o le hacemos algún retoque? 🎧',
      ];
      const randomHype = hypeMessages[Math.floor(Math.random() * hypeMessages.length)];
      setMessages(prev => [...prev, {
        id: `action-confirm-${Date.now()}`,
        role: 'system',
        content: `✅ ¡${applied} ${applied === 1 ? 'cambio aplicado' : 'cambios aplicados'}! Ya lo tienes en el panel 🎶`,
        timestamp: new Date(),
      }, {
        id: `suggest-${Date.now() + 1}`,
        role: 'system',
        content: `💡 ${randomHype}`,
        timestamp: new Date(),
      }]);
    }
  };

  // Play/pause via workspace player (synced)
  const handlePlayInChat = (song: Song) => {
    if (currentSong?.id === song.id) {
      // Same song — toggle play/pause
      onTogglePlay?.();
    } else {
      // Different song — start playing
      onPlaySong?.(song);
    }
  };

  // Format time mm:ss
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Handle seek on progress bar click
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  // Get live song data (title sync from workspace), fallback to snapshot
  const getLiveSong = (songId: string, snapshot?: Song | null): Song | null => {
    // Check songs list for most up-to-date version
    const fromList = songs?.find(s => s.id === songId);
    if (fromList) return fromList;
    // Fallback to currentSong if it matches
    if (currentSong?.id === songId) return currentSong;
    // Final fallback to lastGeneratedSong
    if (lastGeneratedSong?.id === songId) return lastGeneratedSong;
    // Use stored snapshot so card never disappears
    if (snapshot) return snapshot;
    return null;
  };

  // Style editor: open with current style from UIBridge
  const openStyleEditor = () => {
    const currentState = uiBridge.getState();
    setStyleEditValue(currentState.style || '');
    setEditingStyle(true);
  };

  // Style editor: save
  const saveStyleEdit = () => {
    uiBridge.dispatch({ type: 'set', params: { style: styleEditValue } });
    setEditingStyle(false);
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: '🎨 ¡Estilo actualizado desde el editor! 🔥',
      timestamp: new Date(),
    }]);
  };

  // Extract style/tags from assistant message
  const extractStyleFromMessage = (content: string): string | null => {
    // Look for style in quotes after keywords like "estilo:", "style:", "tags:"
    const stylePatterns = [
      /(?:estilo|style|tags|género|genre)[:\s]*[""«]([^""»]+)[""»]/i,
      /(?:estilo|style|tags|género|genre)[:\s]*`([^`]+)`/i,
      // Also catch from ui_actions style set
      /"style"[:\s]*"([^"]+)"/i,
    ];
    for (const pattern of stylePatterns) {
      const match = content.match(pattern);
      if (match && match[1] && match[1].trim().length > 5) {
        return match[1].trim();
      }
    }
    return null;
  };

  // Handle style paste (overwrite or append)
  const handlePasteStyle = (style: string, mode: 'overwrite' | 'append') => {
    const currentState = uiBridge.getState();
    const newStyle = mode === 'append' && currentState.style
      ? `${currentState.style}, ${style}`
      : style;
    uiBridge.dispatch({ type: 'set', params: { style: newStyle } });
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: mode === 'overwrite'
        ? '🎨 ¡Estilo aplicado! Echa un vistazo al panel 👀'
        : '🎨 ¡Estilo añadido al que ya tenías! Combo letal 🔥',
      timestamp: new Date(),
    }, {
      id: `suggest-${Date.now()}`,
      role: 'system',
      content: '💡 ¿Quieres que le ajuste algo más o generamos directamente? 🚀',
      timestamp: new Date(),
    }]);
  };

  // Extract lyrics from assistant message (text between [Verse], [Chorus], etc.)
  const extractLyricsFromMessage = (content: string): string | null => {
    // Pre-process: split inline section markers onto their own lines
    // e.g. "[Verse] line1 line2 [Chorus] line3" → separate lines
    const preprocessed = content.replace(/\[(?:Verse|Chorus|Bridge|Pre-Chorus|Outro|Intro|inst|Hook|Interlude)(?:\s*\d*)?\]/gi, (match, offset) => {
      return (offset > 0 ? '\n' : '') + match + '\n';
    });

    const lines = preprocessed.split('\n');
    const lyricsLines: string[] = [];
    let inLyrics = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inLyrics) lyricsLines.push('');
        continue;
      }
      if (/^\[(?:Verse|Chorus|Bridge|Pre-Chorus|Outro|Intro|inst|Hook|Interlude)(?:\s*\d*)?\]/i.test(trimmed)) {
        inLyrics = true;
        lyricsLines.push(trimmed);
        continue;
      }
      if (inLyrics) {
        if (/^[\-\*•]|^\d+\.|^(Would|Let|Here|Note|This|If|Do|I |Para|Aquí|¿|Nota|Esto|Si )/i.test(trimmed)) {
          break;
        }
        lyricsLines.push(trimmed);
      }
    }

    while (lyricsLines.length > 0 && lyricsLines[lyricsLines.length - 1] === '') {
      lyricsLines.pop();
    }

    return lyricsLines.length >= 2 ? lyricsLines.join('\n') : null;
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const allMessages = [...messages.filter(m => m.role !== 'system'), userMsg];
      const { reply, params, actions } = await chatWithAssistant(allMessages, chatLang);

      if (params) {
        setLastParams(params);
      }

      const msgId = `assistant-${Date.now()}`;

      // Store actions as PENDING (not auto-applied) — user reviews & applies
      if (actions && actions.length > 0) {
        const pendingItems: PendingActionItem[] = actions.map(a => ({
          action: a,
          enabled: true, // all enabled by default
          label: formatActionLabel(a),
        }));
        setPendingActionsMap(prev => ({ ...prev, [msgId]: pendingItems }));
      }

      const assistantMsg: ChatMessage = {
        id: msgId,
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
        parsedParams: params,
        actions,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('chatAssistant.errorMessage'),
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApply = (params: ParsedMusicRequest) => {
    onApplyParams(params);
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: '✅ ¡Parámetros aplicados! Todo listo en el panel 🎶',
      timestamp: new Date(),
    }, {
      id: `suggest-${Date.now() + 1}`,
      role: 'system',
      content: '💡 ¿Generamos esto ya o le hacemos algún retoque más? 🚀',
      timestamp: new Date(),
    }]);
  };

  const handleGenerateNow = (params: ParsedMusicRequest) => {
    onGenerateWithParams(params);
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: '🚀 ¡Vamos allá! Generando tu track... ¡Esto va a ser épico! 🔥🎵',
      timestamp: new Date(),
    }]);
  };

  const handlePasteLyrics = (lyrics: string, mode: 'overwrite' | 'append') => {
    onSetLyrics(lyrics, mode);
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'system',
      content: mode === 'overwrite'
        ? '📝 ¡Letra pegada! Echa un ojo al panel 👀'
        : '📝 ¡Letra añadida al final! Quedó perfecta 🔥',
      timestamp: new Date(),
    }, {
      id: `suggest-${Date.now() + 1}`,
      role: 'system',
      content: '💡 ¿Quieres que le ajuste el estilo también o generamos ya? 🚀',
      timestamp: new Date(),
    }]);
  };

  const handleQuickGenerate = () => {
    if (lastParams) {
      handleGenerateNow(lastParams);
    }
  };

  // Format song metadata for chat context
  const formatSongContext = (song: Song, index: number): string => {
    const gp = song.generationParams || {};
    const parts: string[] = [];
    parts.push(`═══ Canción ${index + 1}: **${song.title || 'Sin título'}** ═══`);
    if (song.id) parts.push(`🔗 URL: http://localhost:3000/song/${song.id}`);
    if (song.style) parts.push(`🎨 Estilo/Tags: ${song.style}`);
    if (song.duration) parts.push(`⏱ Duración: ${song.duration}`);
    if (song.tags) {
      const tagsArr = Array.isArray(song.tags) ? song.tags : typeof song.tags === 'string' ? (song.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : [];
      if (tagsArr.length) parts.push(`🏷 Tags: ${tagsArr.join(', ')}`);
    }
    if (gp.bpm) parts.push(`🥁 BPM: ${gp.bpm}`);
    if (gp.keyScale) parts.push(`🎹 Key: ${gp.keyScale}`);
    if (gp.timeSignature) parts.push(`📐 Time Sig: ${gp.timeSignature}`);
    if (gp.vocalLanguage) parts.push(`🗣 Idioma vocal: ${gp.vocalLanguage}`);
    if (gp.instrumental) parts.push(`🎸 Instrumental: Sí`);
    if (gp.inferenceSteps) parts.push(`🔄 Inference Steps: ${gp.inferenceSteps}`);
    if (gp.guidanceScale) parts.push(`📊 Guidance Scale: ${gp.guidanceScale}`);
    if (gp.ditModel) parts.push(`🤖 Modelo: ${gp.ditModel}`);
    if (song.audioUrl) parts.push(`🔊 Audio: ${song.audioUrl}`);
    if (song.lyrics) {
      const lyricsPreview = song.lyrics.length > 500 ? song.lyrics.substring(0, 500) + '\n[...]' : song.lyrics;
      parts.push(`\n📝 Letra:\n${lyricsPreview}`);
    } else {
      parts.push(`📝 Letra: (sin letra / instrumental)`);
    }
    return parts.join('\n');
  };

  // Handle song drop
  const handleSongDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const songData = e.dataTransfer.getData('application/x-ace-song');
    if (!songData) return;

    try {
      const song: Song = JSON.parse(songData);

      // Open chat if not open, switch to chat tab
      if (!isOpen) setIsOpen(true);
      setActiveTab('chat');

      setContextSongs(prev => {
        // Check if song already loaded
        if (prev.some(s => s.id === song.id)) return prev;
        // Max 3 songs — replace oldest if full
        const updated = prev.length >= 3 ? [...prev.slice(1), song] : [...prev, song];

        const slotNum = updated.length - 1;
        const contextText = formatSongContext(song, slotNum);
        const totalSongs = updated.length;

        let promptText: string;
        if (totalSongs === 1) {
          promptText = `📎 He cargado una canción como contexto:\n\n${contextText}\n\n¿Qué quieres hacer con ella? Puedo:\n• Analizar sus parámetros y composición\n• Sugerir mejoras de letra o estilo\n• Generar una canción similar\n• Modificar parámetros específicos\n\n💡 Puedes arrastrar hasta 3 canciones para combinarlas.`;
        } else {
          promptText = `📎 He añadido la Canción ${slotNum + 1} al contexto (${totalSongs}/3 slots):\n\n${contextText}\n\nAhora tengo ${totalSongs} canciones cargadas. Puedo:\n• Fusionar estilos de las ${totalSongs} canciones\n• Usar la letra de una + el estilo de otra\n• Tomar el BPM/key de una y aplicarlo a otra\n• Crear algo totalmente nuevo basado en todas\n\n¿Qué combinación quieres?`;
        }

        setMessages(msgs => [...msgs, {
          id: `context-${Date.now()}`,
          role: 'user',
          content: promptText,
          timestamp: new Date(),
        }]);

        return updated;
      });

      // Auto-focus input
      setTimeout(() => inputRef.current?.focus(), 200);
    } catch {
      // ignore bad data
    }
  }, [isOpen]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-ace-song')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only trigger if leaving the panel itself, not its children
    if (chatPanelRef.current && !chatPanelRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed bottom-20 right-4 z-[9999] w-14 h-14 rounded-full shadow-lg
          flex items-center justify-center transition-all duration-300
          ${isOpen 
            ? 'bg-zinc-700 hover:bg-zinc-600 rotate-0' 
            : 'bg-gradient-to-br from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 animate-pulse hover:animate-none'
          }
          text-white
        `}
        title={t('chatAssistant.buttonTitle')}
      >
        {isOpen ? <X size={22} /> : <MessageSquare size={22} />}
        {!isOpen && messages.filter(m => m.parsedParams).length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full text-[10px] flex items-center justify-center font-bold">
            {messages.filter(m => m.parsedParams).length}
          </span>
        )}
      </button>

      {/* Drop zone overlay when panel is closed */}
      {!isOpen && isDragOver && (
        <div
          className="fixed bottom-20 right-4 z-[9999] w-48 h-32 rounded-2xl border-2 border-dashed border-purple-400 bg-purple-500/20 backdrop-blur-sm flex flex-col items-center justify-center gap-2 animate-in fade-in duration-150"
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleSongDrop}
        >
          <Disc3 size={24} className="text-purple-400 animate-spin" style={{ animationDuration: '3s' }} />
          <span className="text-[11px] text-purple-300 font-medium text-center px-2">{t('chatAssistant.dropSongHere')}</span>
        </div>
      )}

      {/* Global drag listener (invisible) to detect drags near the chat button */}
      {!isOpen && !isDragOver && (
        <div
          className="fixed bottom-16 right-0 z-[9997] w-24 h-24 opacity-0"
          onDragOver={handleDragOver}
        />
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          ref={chatPanelRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleSongDrop}
          style={{ width: `${chatSize.w}px`, height: `${chatSize.h}px` }}
          className={`fixed bottom-36 right-4 z-[9998] max-w-[calc(100vw-32px)] max-h-[calc(100vh-180px)]
          bg-zinc-900 border ${isDragOver ? 'border-purple-400 ring-2 ring-purple-400/30' : 'border-zinc-700/50'} rounded-2xl shadow-2xl flex flex-col overflow-hidden
          animate-in slide-in-from-bottom-4 duration-200 transition-[border-color,box-shadow]`}>

          {/* Resize handle (top-left corner) */}
          <div
            onMouseDown={startResize}
            className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize z-50 flex items-center justify-center opacity-0 hover:opacity-60 transition-opacity"
            title={t('chatAssistant.resizeTooltip')}
          >
            <GripVertical size={10} className="text-zinc-500 rotate-45" />
          </div>

          {/* Drop overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-50 bg-purple-600/10 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center gap-3 pointer-events-none">
              <Disc3 size={40} className="text-purple-400 animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-sm text-purple-300 font-semibold">
                {contextSongs.length === 0 ? 'Soltar canci\u00f3n para analizar' : `A\u00f1adir como Canci\u00f3n ${Math.min(contextSongs.length + 1, 3)}`}
              </span>
              <span className="text-[10px] text-purple-400/60">
                {contextSongs.length >= 3 ? 'Se reemplazar\u00e1 la m\u00e1s antigua (m\u00e1x 3)' : `${contextSongs.length}/3 slots usados`}
              </span>
            </div>
          )}
          
          {/* Header with tabs */}
          <div className="flex-shrink-0 border-b border-zinc-700/50">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
                  <Music size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">ProdIA Pro</h3>
                  <p className="text-[10px] text-zinc-400">
                    {(() => { const c = loadConfig(); const p = PROVIDERS.find(x => x.id === c.provider); return p ? `${p.icon} ${p.name}${c.model ? ` · ${c.model}` : ''}` : 'ACE-Step'; })()}
                    {uiBridge.isConnected && <span className="ml-1 text-green-400">● UI</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Language selector */}
                <div className="flex items-center bg-zinc-800 rounded-lg border border-zinc-700/30 overflow-hidden">
                  {(['es', 'en', 'zh'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setChatLang(lang)}
                      className={`px-1.5 py-1 text-[9px] font-semibold transition-colors ${chatLang === lang ? 'bg-purple-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      title={lang === 'es' ? 'Español' : lang === 'en' ? 'English' : '中文'}
                    >
                      {lang === 'es' ? 'ES' : lang === 'en' ? 'EN' : '中'}
                    </button>
                  ))}
                </div>
                {/* Clear chat */}
                <button
                  onClick={clearChat}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                  title={t('chatAssistant.clearChatTooltip')}
                >
                  <Trash2 size={13} />
                </button>
                {/* Minimize */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                  title={t('chatAssistant.minimizeTooltip')}
                >
                  <Minimize2 size={13} />
                </button>
              </div>
            </div>
            {/* Status bar */}
            <div className="flex items-center justify-between px-4 pb-1">
              {isGenerating && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                  <Loader2 size={10} className="animate-spin" />
                  Generando...
                </span>
              )}
              {!isGenerating && (
                <button
                  onClick={handleChatGenerate}
                  className="flex items-center gap-1 text-[10px] text-purple-400 bg-purple-400/10 hover:bg-purple-400/20 px-2.5 py-1 rounded-full transition-colors border border-purple-500/20"
                  title="Generar con la configuración actual"
                >
                  <Zap size={10} />
                  {t('chatAssistant.createSongQuick')}
                </button>
              )}
            </div>
            {/* Tabs */}
            <div className="flex px-2">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'chat' 
                    ? 'border-purple-500 text-purple-400' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <MessageSquare size={12} className="inline mr-1" />
                {t('chatAssistant.tabChat')}
              </button>
              <button
                onClick={() => setActiveTab('codes')}
                className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'codes' 
                    ? 'border-cyan-500 text-cyan-400' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Code2 size={12} className="inline mr-1" />
                {t('chatAssistant.tabCodes')}
                {showCodes && <span className="ml-1 w-2 h-2 bg-cyan-400 rounded-full inline-block animate-pulse" />}
              </button>
              <button
                onClick={() => setActiveTab('chords')}
                className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'chords' 
                    ? 'border-violet-500 text-violet-400' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Music size={12} className="inline mr-1" />
                {t('chatAssistant.tabChords')}
              </button>
            </div>
          </div>

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <>
              {/* Context songs badges */}
              {contextSongs.length > 0 && (
                <div className="flex-shrink-0 mx-3 mt-2 space-y-1">
                  {contextSongs.map((song, idx) => (
                    <div key={song.id} className={`px-3 py-1.5 rounded-lg flex items-center justify-between border ${
                      idx === 0 ? 'bg-purple-900/30 border-purple-500/20' :
                      idx === 1 ? 'bg-blue-900/30 border-blue-500/20' :
                      'bg-emerald-900/30 border-emerald-500/20'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-bold flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                          idx === 0 ? 'bg-purple-500 text-white' :
                          idx === 1 ? 'bg-blue-500 text-white' :
                          'bg-emerald-500 text-white'
                        }`}>{idx + 1}</span>
                        <Disc3 size={12} className={`flex-shrink-0 ${
                          idx === 0 ? 'text-purple-400' : idx === 1 ? 'text-blue-400' : 'text-emerald-400'
                        }`} />
                        <span className="text-[10px] text-zinc-300 truncate">{song.title || t('chatAssistant.untitledSong')}</span>
                        {song.generationParams?.bpm && (
                          <span className="text-[9px] text-zinc-500 flex-shrink-0">{song.generationParams.bpm}bpm</span>
                        )}
                      </div>
                      <button
                        onClick={() => setContextSongs(prev => prev.filter(s => s.id !== song.id))}
                        className="text-zinc-500 hover:text-zinc-300 ml-2 flex-shrink-0"
                        title={`Quitar Canci\u00f3n ${idx + 1}`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {contextSongs.length < 3 && (
                    <p className="text-[9px] text-zinc-600 text-center">Arrastra m\u00e1s canciones ({contextSongs.length}/3)</p>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700">
                {messages.map((msg) => {
                  const lyricsInMessage = msg.role === 'assistant' ? extractLyricsFromMessage(msg.content) : null;
                  const lyricsFromParams = msg.parsedParams?.lyrics;
                  const availableLyrics = lyricsFromParams || lyricsInMessage;
                  const styleInMessage = msg.role === 'assistant' ? extractStyleFromMessage(msg.content) : null;
                  // Detect chord progressions in assistant messages (e.g. "C Mayor: I - V - vi - IV")
                  const chordMatch = msg.role === 'assistant' ? msg.content.match(/([A-G][#b♯♭]?)\s*(Mayor|Menor|Major|Minor|major|minor)\s*[:：]\s*((?:[ivIV]+[°+]?\d?(?:maj7|m7|dim7?|aug|sus[24]|7)?[\s\-–—,]+){2,}[ivIV]+[°+]?\d?(?:maj7|m7|dim7?|aug|sus[24]|7)?)/i) : null;
                  const detectedChord = chordMatch ? {
                    key: chordMatch[1],
                    scale: (chordMatch[2].toLowerCase().startsWith('men') || chordMatch[2].toLowerCase().startsWith('min') ? 'minor' : 'major') as ScaleType,
                    roman: chordMatch[3].replace(/[,]+/g, ' -').replace(/[\s]+/g, ' ').trim(),
                  } : null;
                  const hasActions = msg.actions && msg.actions.length > 0;
                  const pendingItems = pendingActionsMap[msg.id];
                  const isPending = pendingItems && pendingItems.length > 0;
                  const isApplied = hasActions && !isPending;

                  // Song card rendering (synced with workspace player)
                  const songCardMatch = msg.content.match(/^🎵_SONG_CARD_(.+)$/);
                  if (songCardMatch) {
                    const songId = songCardMatch[1];
                    const song = getLiveSong(songId, (msg as any).songSnapshot);
                    if (!song) return null;
                    const isCurrent = currentSong?.id === song.id;
                    const isThisPlaying = isCurrent && isPlaying;
                    const progress = isCurrent && duration > 0 ? (currentTime / duration) * 100 : 0;
                    return (
                      <div key={msg.id} className="flex justify-start">
                        <div className="w-[92%] rounded-2xl overflow-hidden border border-zinc-700/20 bg-gradient-to-b from-zinc-800/90 to-zinc-900/90 shadow-lg">
                          {/* Song header with cover art placeholder */}
                          <div className="relative px-4 py-3 bg-gradient-to-r from-purple-900/30 via-violet-900/20 to-zinc-900/10">
                            <div className="flex items-center gap-3">
                              {/* Album art / play button combined */}
                              <button
                                onClick={() => handlePlayInChat(song)}
                                className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 flex items-center justify-center flex-shrink-0 transition-all shadow-lg shadow-purple-900/30 group"
                              >
                                {isThisPlaying
                                  ? <Pause size={18} className="text-white" />
                                  : <Play size={18} className="text-white ml-0.5 group-hover:scale-110 transition-transform" />
                                }
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-white truncate">{song.title || t('chatAssistant.untitledSong')}</p>
                                <p className="text-[10px] text-zinc-400 truncate mt-0.5">{song.style ? song.style.substring(0, 80) : 'ProdIA Pro'}</p>
                              </div>
                              {isThisPlaying && (
                                <div className="flex gap-[2px] items-end h-4">
                                  {[1,2,3,4].map(i => (
                                    <div key={i} className="w-[3px] bg-purple-400 rounded-full animate-pulse" style={{ height: `${8 + Math.random() * 8}px`, animationDelay: `${i * 0.15}s` }} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Progress bar + time */}
                          {song.audioUrl && (
                            <div className="px-4 py-2.5">
                              <div
                                className="h-2 bg-zinc-700/60 rounded-full overflow-hidden cursor-pointer group relative"
                                onClick={(e) => { if (isCurrent) handleProgressClick(e); else handlePlayInChat(song); }}
                              >
                                <div
                                  className="h-full bg-gradient-to-r from-purple-500 via-violet-500 to-purple-400 rounded-full transition-all duration-200 relative"
                                  style={{ width: `${progress}%` }}
                                >
                                  {isCurrent && (
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[9px] text-zinc-500 font-mono">{isCurrent ? formatTime(currentTime) : '0:00'}</span>
                                <span className="text-[9px] text-zinc-500 font-mono">{isCurrent && duration ? formatTime(duration) : (song.duration || '--:--')}</span>
                              </div>
                            </div>
                          )}
                          {/* Tags + info */}
                          <div className="px-4 pb-3 flex gap-1.5 flex-wrap items-center">
                            {song.generationParams?.bpm && <span className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700/30">{song.generationParams.bpm} bpm</span>}
                            {song.generationParams?.keyScale && <span className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700/30">{song.generationParams.keyScale}</span>}
                            {song.generationParams?.ditModel && <span className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700/30">{song.generationParams.ditModel}</span>}
                            {isCurrent && isThisPlaying && <span className="text-[9px] text-purple-400 ml-auto">{t('chatAssistant.nowPlaying')}</span>}
                            {isCurrent && !isThisPlaying && <span className="text-[9px] text-zinc-500 ml-auto">{t('chatAssistant.paused')}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white rounded-br-md'
                        : msg.role === 'system'
                          ? 'bg-zinc-800/50 text-zinc-400 text-[11px] italic border border-zinc-700/30'
                          : 'bg-zinc-800 text-zinc-200 rounded-bl-md border border-zinc-700/30'
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {/* PENDING Actions — Interactive review panel */}
                      {isPending && (
                        <div className="mt-2 p-2.5 bg-amber-900/15 rounded-lg border border-amber-600/25">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Settings2 size={12} className="text-amber-400" />
                            <span className="text-[10px] font-semibold text-amber-400">
                              Cambios sugeridos ({pendingItems.filter(i => i.enabled).length}/{pendingItems.length})
                            </span>
                          </div>
                          <div className="space-y-1">
                            {pendingItems.map((item, idx) => (
                              <button
                                key={idx}
                                onClick={() => togglePendingAction(msg.id, idx)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                                  item.enabled
                                    ? 'bg-amber-500/10 border border-amber-500/20'
                                    : 'bg-zinc-800/50 border border-zinc-700/20 opacity-50'
                                }`}
                              >
                                {item.enabled
                                  ? <ToggleRight size={14} className="text-amber-400 flex-shrink-0" />
                                  : <ToggleLeft size={14} className="text-zinc-500 flex-shrink-0" />
                                }
                                <span className={`text-[10px] font-mono truncate ${item.enabled ? 'text-amber-300' : 'text-zinc-500 line-through'}`}>
                                  {item.label}
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1.5 mt-2.5">
                            <button
                              onClick={() => applyPendingActions(msg.id)}
                              disabled={pendingItems.filter(i => i.enabled).length === 0}
                              className="flex-1 py-1.5 px-3 text-[10px] font-medium bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 size={10} />
                              Aplicar ({pendingItems.filter(i => i.enabled).length})
                            </button>
                            <button
                              onClick={() => setPendingActionsMap(prev => { const { [msg.id]: _, ...rest } = prev; return rest; })}
                              className="py-1.5 px-3 text-[10px] font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors"
                            >
                              {t('chatAssistant.pendingDiscard')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* APPLIED Actions — Compact confirmation */}
                      {isApplied && (
                        <div className="mt-2 p-2 bg-green-900/20 rounded-lg border border-green-600/20">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={12} className="text-green-400" />
                            <span className="text-[10px] font-semibold text-green-400">
                              {msg.actions!.length} {msg.actions!.length === 1 ? 'cambio aplicado' : 'cambios aplicados'}
                            </span>
                          </div>
                          <div className="mt-1 text-[9px] text-green-400/60 font-mono">
                            {msg.actions!.map((a) => formatActionLabel(a)).join(' · ')}
                          </div>
                        </div>
                      )}

                      {/* Style/tags paste buttons */}
                      {styleInMessage && (
                        <div className="mt-2 p-2 bg-zinc-900/60 rounded-lg border border-purple-600/20">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Palette size={11} className="text-purple-400" />
                            <span className="text-[10px] font-semibold text-purple-400">{t('chatAssistant.styleDetected')}</span>
                          </div>
                          <p className="text-[9px] text-zinc-400 mb-1.5 font-mono truncate" title={styleInMessage}>{styleInMessage}</p>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handlePasteStyle(styleInMessage, 'overwrite')}
                              className="flex-1 py-1.5 px-2 text-[10px] font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                            >
                              <Replace size={10} />
                              {t('chatAssistant.replaceStyle')}
                            </button>
                            <button
                              onClick={() => handlePasteStyle(styleInMessage, 'append')}
                              className="flex-1 py-1.5 px-2 text-[10px] font-medium bg-zinc-600 hover:bg-zinc-500 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                            >
                              <Plus size={10} />
                              {t('chatAssistant.appendTags')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Chord progression preview (auto-detected from assistant message) */}
                      {detectedChord && (
                        <InlineChordPreview
                          roman={detectedChord.roman}
                          keyName={detectedChord.key}
                          scale={detectedChord.scale}
                          onApply={handleApplyChords}
                        />
                      )}

                      {/* Lyrics paste buttons */}
                      {availableLyrics && (
                        <div className="mt-2 p-2 bg-zinc-900/60 rounded-lg border border-green-600/20">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <ClipboardPaste size={11} className="text-green-400" />
                            <span className="text-[10px] font-semibold text-green-400">{t('chatAssistant.lyricsDetected')}</span>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handlePasteLyrics(availableLyrics, 'overwrite')}
                              className="flex-1 py-1.5 px-2 text-[10px] font-medium bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                            >
                              <Replace size={10} />
                              {t('chatAssistant.lyricsOverwrite')}
                            </button>
                            <button
                              onClick={() => handlePasteLyrics(availableLyrics, 'append')}
                              className="flex-1 py-1.5 px-2 text-[10px] font-medium bg-zinc-600 hover:bg-zinc-500 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                            >
                              <FileEdit size={10} />
                              {t('chatAssistant.lyricsAppend')}
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Parsed params card */}
                      {msg.parsedParams && (
                        <div className="mt-2.5 p-2.5 bg-zinc-900/80 rounded-xl border border-zinc-600/30">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Sparkles size={12} className="text-amber-400" />
                            <span className="text-[11px] font-semibold text-amber-400">{t('chatAssistant.suggestedParams')}</span>
                          </div>
                          <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
                            {formatParamsForDisplay(msg.parsedParams)}
                          </pre>
                          <div className="flex gap-2 mt-2.5">
                            <button
                              onClick={() => handleApply(msg.parsedParams!)}
                              className="flex-1 py-1.5 px-3 text-[11px] font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                              <ChevronDown size={12} />
                              {t('chatAssistant.applyParams')}
                            </button>
                            <button
                              onClick={() => handleGenerateNow(msg.parsedParams!)}
                              className="flex-1 py-1.5 px-3 text-[11px] font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                              <Zap size={12} />
                              {t('chatAssistant.generateNow')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 border border-zinc-700/30">
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin text-purple-400" />
                        <span className="text-zinc-400 text-[12px] animate-pulse">{t('chatAssistant.thinkingIndicator')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {isGenerating && !isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gradient-to-r from-purple-900/30 to-violet-900/30 rounded-2xl rounded-bl-md px-4 py-3 border border-purple-500/20">
                      <div className="flex items-center gap-2">
                        <Disc3 size={14} className="animate-spin text-purple-400" />
                        <span className="text-purple-300 text-[12px] animate-pulse font-medium">{t('chatAssistant.generatingTrack')}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 p-3 border-t border-zinc-700/50">
                {/* Style editor inline */}
                {editingStyle && (
                  <div className="mb-2 p-2.5 bg-zinc-900/80 rounded-xl border border-purple-500/20">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Palette size={11} className="text-purple-400" />
                        <span className="text-[10px] font-semibold text-purple-400">{t('chatAssistant.styleEditorTitle')}</span>
                      </div>
                      <button onClick={() => setEditingStyle(false)} className="text-zinc-500 hover:text-zinc-300">
                        <X size={12} />
                      </button>
                    </div>
                    <textarea
                      value={styleEditValue}
                      onChange={(e) => setStyleEditValue(e.target.value)}
                      placeholder="rock, electric guitar, powerful vocals, energetic..."
                      rows={2}
                      className="w-full bg-zinc-800 text-[11px] text-zinc-200 placeholder-zinc-600 resize-none outline-none rounded-lg px-2.5 py-2 border border-zinc-700/30 focus:border-purple-500/40 font-mono"
                    />
                    <div className="flex gap-1.5 mt-1.5">
                      <button
                        onClick={saveStyleEdit}
                        className="flex-1 py-1.5 text-[10px] font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                      >
                        <Check size={10} />
                        {t('chatAssistant.applyStyle')}
                      </button>
                    </div>
                  </div>
                )}
                {/* Quick actions bar */}
                <div className="flex gap-1.5 mb-1.5">
                  <button
                    onClick={openStyleEditor}
                    className={`flex items-center gap-1 px-2 py-1 text-[9px] font-medium rounded-md transition-colors ${editingStyle ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-zinc-800 text-zinc-400 hover:text-purple-400 hover:bg-zinc-700 border border-zinc-700/30'}`}
                  >
                    <Palette size={9} />
                    {t('chatAssistant.quickStyle')}
                  </button>
                  <button
                    onClick={() => setActiveTab('chords')}
                    className={`flex items-center gap-1 px-2 py-1 text-[9px] font-medium rounded-md transition-colors ${activeTab === 'chords' ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30' : 'bg-zinc-800 text-zinc-400 hover:text-violet-400 hover:bg-zinc-700 border border-zinc-700/30'}`}
                  >
                    <Music size={9} />
                    {t('chatAssistant.quickChords')}
                  </button>
                </div>
                <div className="flex items-end gap-2 bg-zinc-800 rounded-xl border border-zinc-700/30 p-1.5">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chatAssistant.inputPlaceholder')}
                    rows={1}
                    className="flex-1 bg-transparent text-[13px] text-white placeholder-zinc-500 resize-none outline-none px-2 py-1.5 max-h-24 scrollbar-thin"
                    style={{ minHeight: '32px' }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = '32px';
                      t.style.height = Math.min(t.scrollHeight, 96) + 'px';
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="w-8 h-8 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <Send size={14} />
                  </button>
                </div>
                <p className="text-[9px] text-zinc-600 mt-1.5 text-center">
                  {t('chatAssistant.inputHint')}
                </p>
              </div>
            </>
          )}

          {/* Audio Codes Tab */}
          {activeTab === 'codes' && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Code2 size={14} className="text-cyan-400" />
                  <h4 className="text-xs font-semibold text-cyan-400">{t('chatAssistant.codeTabTitle')}</h4>
                </div>
                
                {audioCodes && audioCodes.trim() ? (
                  <>
                    <p className="text-[10px] text-zinc-500 mb-2">
                      Estos son los tokens de audio code que se usan para la generación. Representan la codificación tokenizada del audio.
                    </p>
                    <div className="bg-zinc-950 rounded-xl border border-cyan-900/30 p-3 max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                      <pre className="text-[10px] text-cyan-300/80 font-mono whitespace-pre-wrap break-all leading-relaxed">
                        {audioCodes}
                      </pre>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-zinc-500">
                        {audioCodes.split(/\s+/).length} tokens · {audioCodes.length} chars
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(audioCodes)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                      >
                        {t('chatAssistant.copyButton')}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
                    <Code2 size={32} className="mb-3 opacity-30" />
                    <p className="text-xs text-center">{t('chatAssistant.noCodesYet')}</p>
                    <p className="text-[10px] text-center mt-1 text-zinc-700">
                      Los audio codes aparecerán aquí cuando actives<br />
                      "Audio Codes" en los ajustes avanzados de generación<br />
                      o cuando uses los modos cover/repaint.
                    </p>
                  </div>
                )}

                {/* Generation info */}
                {isGenerating && (
                  <div className="mt-3 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-amber-400" />
                      <span className="text-[11px] text-amber-400">{t('chatAssistant.updatingCodes')}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chords Tab */}
          {activeTab === 'chords' && (
            <div className="flex-1 overflow-y-auto p-3">
              <ChordProgressionEditor
                value={chordProgression}
                onChange={setChordProgression}
                onApply={handleApplyChords}
                showApply={true}
                externalBpm={uiBridge.getState()?.bpm}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
