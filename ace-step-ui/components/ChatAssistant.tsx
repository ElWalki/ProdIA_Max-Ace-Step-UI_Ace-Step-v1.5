import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, X, Send, Loader2, Music, Sparkles, ChevronDown, ArrowDown, Zap, Code2, ClipboardPaste, FileEdit, Replace, Disc3, Settings2, CheckCircle2, ToggleLeft, ToggleRight, Play, Pause, Square, Volume2, Palette, Plus, SkipForward, SkipBack, Edit3, Check, Trash2, GripVertical, Minimize2, Globe } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { chatWithAssistant, streamChatWithAssistant, formatParamsForDisplay, ChatMessage, ParsedMusicRequest, SongContext } from '../services/chatService';
import { ChordProgressionEditor, InlineChordPreview, ChordProgressionState } from './ChordProgressionEditor';
import { resolveProgression, formatProgressionForGeneration, CHORD_PRESETS, ScaleType } from '../services/chordService';
import { loadConfig, PROVIDERS } from '../services/llmProviderService';
import { uiBridge, UIAction } from '../services/uiBridge';
import type { Song } from '../types';

/**
 * Lightweight inline markdown renderer for chat messages.
 * Supports: **bold**, *italic*, `code`, ```code blocks```, • bullet lines, "quoted" style tags
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';

  const renderInline = (line: string, key: string): React.ReactNode => {
    // Split by inline patterns: **bold**, *italic*, `code`, "style tags"
    const parts: React.ReactNode[] = [];
    // Regex to match inline formatting
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|("([^"]{3,})")/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      // Text before match
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      if (match[1]) {
        // **bold**
        parts.push(<strong key={`${key}-b-${match.index}`} className="font-semibold text-white">{match[2]}</strong>);
      } else if (match[3]) {
        // *italic*
        parts.push(<em key={`${key}-i-${match.index}`} className="italic">{match[4]}</em>);
      } else if (match[5]) {
        // `code`
        parts.push(<code key={`${key}-c-${match.index}`} className="bg-zinc-900 text-purple-300 px-1.5 py-0.5 rounded text-[12px] font-mono">{match[6]}</code>);
      } else if (match[7]) {
        // "quoted text" — style tags
        parts.push(<span key={`${key}-q-${match.index}`} className="bg-purple-500/15 text-purple-300 px-1.5 py-0.5 rounded text-[12px] border border-purple-500/20">{match[8]}</span>);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    return parts.length > 0 ? <span key={key}>{parts}</span> : <span key={key}>{line}</span>;
  };

  // Helper: parse a table row into cells
  const parseTableRow = (row: string): string[] => {
    return row.split('|').slice(1, -1).map(cell => cell.trim());
  };

  // Helper: check if a line is a table separator (|---|---|)
  const isTableSeparator = (line: string): boolean => {
    return /^\|[\s\-:]+(\|[\s\-:]+)+\|?\s*$/.test(line.trim());
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trimStart().slice(3).trim();
        codeBlockLines = [];
        continue;
      } else {
        inCodeBlock = false;
        elements.push(
          <pre key={`cb-${i}`} className="bg-zinc-900 text-zinc-300 p-2.5 rounded-lg text-[11px] font-mono overflow-x-auto my-1 border border-zinc-700/30">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Empty line → spacing
    if (line.trim() === '') {
      elements.push(<div key={`sp-${i}`} className="h-1.5" />);
      continue;
    }

    // ── TABLE detection ──
    // A table starts with a | line, followed by a separator |---|, then more | lines
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = parseTableRow(line);
      i++; // skip separator line
      const bodyRows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && !isTableSeparator(lines[i + 1])) {
        i++;
        bodyRows.push(parseTableRow(lines[i]));
      }
      elements.push(
        <div key={`tbl-${i}`} className="overflow-x-auto my-1.5">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-purple-500/30">
                {headerCells.map((cell, ci) => (
                  <th key={ci} className="text-left text-purple-300 font-semibold px-2 py-1.5 bg-purple-500/10">
                    {renderInline(cell, `th-${i}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri} className="border-b border-zinc-700/30 hover:bg-white/[0.02]">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-zinc-300">
                      {renderInline(cell, `td-${i}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // ── HEADINGS ──
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const hClass = level === 1
        ? 'text-[15px] font-bold text-white mt-2 mb-1'
        : level === 2
          ? 'text-[14px] font-semibold text-white mt-1.5 mb-0.5'
          : 'text-[13px] font-semibold text-zinc-200 mt-1 mb-0.5';
      elements.push(
        <div key={`h${level}-${i}`} className={hClass}>
          {renderInline(headingText, `h-c-${i}`)}
        </div>
      );
      continue;
    }

    // Bullet point lines (• or - at start)
    if (/^\s*[•\-\*]\s/.test(line)) {
      const bulletContent = line.replace(/^\s*[•\-\*]\s+/, '');
      elements.push(
        <div key={`li-${i}`} className="flex gap-1.5 ml-1">
          <span className="text-purple-400 flex-shrink-0">•</span>
          <span>{renderInline(bulletContent, `li-c-${i}`)}</span>
        </div>
      );
      continue;
    }

    // ── NUMBERED LIST (1. text) ──
    const numberedMatch = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (numberedMatch) {
      elements.push(
        <div key={`nl-${i}`} className="flex gap-1.5 ml-1">
          <span className="text-purple-400 flex-shrink-0 min-w-[1.2em] text-right">{numberedMatch[1]}.</span>
          <span>{renderInline(numberedMatch[2], `nl-c-${i}`)}</span>
        </div>
      );
      continue;
    }

    // Regular line
    elements.push(<div key={`ln-${i}`}>{renderInline(line, `ln-c-${i}`)}</div>);
  }

  // If code block was never closed
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key="cb-unclosed" className="bg-zinc-900 text-zinc-300 p-2.5 rounded-lg text-[11px] font-mono overflow-x-auto my-1 border border-zinc-700/30">
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return elements;
}

// Pending actions for a message — each toggleable
interface PendingActionItem {
  action: UIAction;
  enabled: boolean;
  label: string;
}

interface AudioCodeEntry {
  songId: string;
  title: string;
  codes: string;
  codeCount: number;
  extractedAt: Date;
}

interface ChatAssistantProps {
  onApplyParams: (params: ParsedMusicRequest) => void;
  onGenerateWithParams: (params: ParsedMusicRequest) => void;
  onSetLyrics: (lyrics: string, mode: 'overwrite' | 'append') => void;
  generatedCodes?: AudioCodeEntry[];
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

export function ChatAssistant({ onApplyParams, onGenerateWithParams, onSetLyrics, generatedCodes, isGenerating, lastGeneratedSong, currentSong, isPlaying, currentTime = 0, duration = 0, onPlaySong, onTogglePlay, onSeek, songs }: ChatAssistantProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'codes' | 'chords'>('chat');
  // Expanded codes entries
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);
  // Agent mode: 'agent' = AI applies changes directly, 'instructor' = AI only explains
  const [agentMode, setAgentMode] = useState<'agent' | 'instructor'>(() => {
    try { return (localStorage.getItem('prodiaChat_mode') as any) || 'agent'; } catch { return 'agent'; }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: t('chatAssistant.welcomeMessage'),
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  // Notification badge — counts unread assistant messages while panel is closed
  const [unreadCount, setUnreadCount] = useState(0);
  // Show/hide scroll-to-bottom button
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Track new assistant messages while panel is closed → increment unread
  const prevMsgCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      const newMsgs = messages.slice(prevMsgCount.current);
      const newAssistant = newMsgs.filter(m => m.role === 'assistant').length;
      if (newAssistant > 0 && !isOpen) {
        setUnreadCount(prev => prev + newAssistant);
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages, isOpen]);

  // Clear notification & scroll to bottom when panel opens
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      // Scroll to bottom immediately on open
      userScrolledUp.current = false;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 50);
    }
  }, [isOpen]);

  // Smart auto-scroll: follow new messages / streaming chunks unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // User scrolled up — show scroll-to-bottom button
      setShowScrollBtn(true);
    }
  }, [messages]);

  // Detect if user scrolled up (stop auto-scroll) or back to bottom (resume)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distFromBottom = scrollHeight - scrollTop - clientHeight;
      // If within 80px of bottom, consider "at bottom"
      const atBottom = distFromBottom <= 80;
      userScrolledUp.current = !atBottom;
      // Show/hide scroll button
      setShowScrollBtn(!atBottom && distFromBottom > 150);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll-to-bottom helper
  const scrollToBottom = useCallback(() => {
    userScrolledUp.current = false;
    setShowScrollBtn(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, activeTab]);

  // Update codes tab when new audio codes arrive
  useEffect(() => {
    if (generatedCodes && generatedCodes.length > 0) {
      setShowCodes(true);
    }
  }, [generatedCodes]);

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

  // Persist agent mode
  useEffect(() => {
    try { localStorage.setItem('prodiaChat_mode', agentMode); } catch {}
  }, [agentMode]);

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
    setMessages([{
      id: 'welcome',
      role: 'system',
      content: t('chatAssistant.welcomeMessage'),
      timestamp: new Date(),
    }]);
    setPendingActionsMap({});
    setContextSongs([]);
    setLastParams(null);
  };

  // Quick generate from chat (dispatches to UI bridge directly)
  const handleChatGenerate = () => {
    uiBridge.dispatch({ type: 'generate' });
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
  };
  const formatActionLabel = (action: UIAction): string => {
    if (action.type === 'set') {
      const keys = Object.keys(action.params).filter(k => (action.params as any)[k] !== undefined);
      return keys.map(k => `${k}: ${JSON.stringify((action.params as any)[k])}`).join(', ');
    }
    if (action.type === 'generate') return t('chatAssistant.formatActionGenerate');
    if (action.type === 'swapModel') return t('chatAssistant.formatActionSwapModel', { model: action.model });
    if (action.type === 'purgeVram') return t('chatAssistant.formatActionPurgeVram');
    if (action.type === 'loadLora') return t('chatAssistant.formatActionLoadLora', { name: action.name });
    if (action.type === 'unloadLora') return t('chatAssistant.formatActionUnloadLora');
    return (action as any).type || t('chatAssistant.formatActionDefault');
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
      setMessages(prev => [...prev, {
        id: `action-confirm-${Date.now()}`,
        role: 'system',
        content: `✅ ${applied === 1 ? t('chatAssistant.appliedChange', { n: applied }) : t('chatAssistant.appliedChanges', { n: applied })}.`,
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

    const msgId = `assistant-${Date.now()}`;

    // Add a placeholder assistant message that will be updated during streaming
    const streamingMsg: ChatMessage = {
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isGenerating: true,
    };
    setMessages(prev => [...prev, streamingMsg]);

    try {
      const allMessages = [...messages.filter(m => m.role !== 'system'), userMsg];

      // Build song contexts for the LLM system prompt
      const songContextsForLLM: SongContext[] = contextSongs.map(song => {
        const gp = song.generationParams || {};
        return {
          title: song.title || t('chatAssistant.untitledSong'),
          style: song.style || undefined,
          lyrics: song.lyrics || undefined,
          bpm: gp.bpm ? Number(gp.bpm) : undefined,
          keyScale: gp.keyScale || gp.key_scale || gp.key || undefined,
          timeSignature: gp.timeSignature || gp.time_signature || undefined,
          duration: song.duration || undefined,
          instrumental: gp.instrumental || undefined,
          vocalLanguage: gp.vocalLanguage || gp.vocal_language || undefined,
          model: gp.ditModel || song.ditModel || undefined,
          tags: Array.isArray(song.tags) ? song.tags : typeof song.tags === 'string' ? (song.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
        };
      });

      const { reply, params, actions } = await streamChatWithAssistant(
        allMessages,
        chatLang,
        agentMode,
        (visibleText: string) => {
          // Update the streaming message content in real-time
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, content: visibleText } : m
          ));
        },
        songContextsForLLM,
      );

      if (params) {
        setLastParams(params);
      }

      // Store actions as PENDING (not auto-applied) — user reviews & applies
      if (actions && actions.length > 0) {
        const pendingItems: PendingActionItem[] = actions.map(a => ({
          action: a,
          enabled: true, // all enabled by default
          label: formatActionLabel(a),
        }));
        setPendingActionsMap(prev => ({ ...prev, [msgId]: pendingItems }));
      }

      // Finalize message with full cleaned reply and parsed data
      setMessages(prev => prev.map(m =>
        m.id === msgId ? {
          ...m,
          content: reply,
          parsedParams: params,
          actions,
          isGenerating: false,
        } : m
      ));
    } catch (error) {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? {
          ...m,
          content: t('chatAssistant.errorMessage'),
          isGenerating: false,
        } : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, t, chatLang, agentMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApply = (params: ParsedMusicRequest) => {
    onApplyParams(params);
  };

  const handleGenerateNow = (params: ParsedMusicRequest) => {
    onGenerateWithParams(params);
  };

  const handlePasteLyrics = (lyrics: string, mode: 'overwrite' | 'append') => {
    onSetLyrics(lyrics, mode);
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
    parts.push(`═══ Canción ${index + 1}: **${song.title || t('chatAssistant.untitledSong')}** ═══`);
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
          promptText = t('chatAssistant.songDropSingle', { context: contextText });
        } else {
          promptText = t('chatAssistant.songDropMulti', { slot: slotNum + 1, total: totalSongs, context: contextText });
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
            : unreadCount > 0
              ? 'bg-gradient-to-br from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 animate-bounce hover:animate-none'
              : 'bg-gradient-to-br from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500'
          }
          text-white
        `}
        title={t('chatAssistant.buttonTitle')}
      >
        {isOpen ? <X size={22} /> : <MessageSquare size={22} />}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full text-[10px] flex items-center justify-center font-bold animate-pulse">
            {unreadCount}
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
                {contextSongs.length === 0 ? t('chatAssistant.dropToAnalyze') : t('chatAssistant.dropToAdd', { n: Math.min(contextSongs.length + 1, 3) })}
              </span>
              <span className="text-[10px] text-purple-400/60">
                {contextSongs.length >= 3 ? t('chatAssistant.dropReplaceOldest') : t('chatAssistant.dropSlotsUsed', { n: contextSongs.length })}
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
                {/* Agent / Instructor mode toggle */}
                <button
                  onClick={() => setAgentMode(prev => prev === 'agent' ? 'instructor' : 'agent')}
                  className={`flex items-center gap-1 px-2 py-1 text-[9px] font-semibold rounded-lg border transition-colors ${
                    agentMode === 'agent'
                      ? 'bg-purple-600/20 text-purple-300 border-purple-500/30 hover:bg-purple-600/30'
                      : 'bg-amber-600/20 text-amber-300 border-amber-500/30 hover:bg-amber-600/30'
                  }`}
                  title={agentMode === 'agent' ? t('chatAssistant.agentModeTooltip') : t('chatAssistant.instructorModeTooltip')}
                >
                  {agentMode === 'agent' ? <Zap size={10} /> : <Settings2 size={10} />}
                  {agentMode === 'agent' ? t('chatAssistant.agentMode') : t('chatAssistant.instructorMode')}
                </button>
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
                  {t('chatAssistant.generatingStatus')}
                </span>
              )}
              {!isGenerating && (
                <button
                  onClick={handleChatGenerate}
                  className="flex items-center gap-1 text-[10px] text-purple-400 bg-purple-400/10 hover:bg-purple-400/20 px-2.5 py-1 rounded-full transition-colors border border-purple-500/20"
                  title={t('chatAssistant.generateTooltip')}
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
                        title={t('chatAssistant.removeSongContext', { n: idx + 1 })}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {contextSongs.length < 3 && (
                    <p className="text-[9px] text-zinc-600 text-center">{t('chatAssistant.dragMoreSongs', { n: contextSongs.length })}</p>
                  )}
                </div>
              )}

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700">
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
                      {/* Show streaming cursor or content */}
                      {msg.isGenerating && !msg.content ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
                          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {renderMarkdown(msg.content)}
                          {msg.isGenerating && <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />}
                        </div>
                      )}

                      {/* PENDING Actions — Interactive review panel */}
                      {isPending && (
                        <div className="mt-2 p-2.5 bg-amber-900/15 rounded-lg border border-amber-600/25">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Settings2 size={12} className="text-amber-400" />
                            <span className="text-[10px] font-semibold text-amber-400">
                              {t('chatAssistant.pendingSuggestedChanges', { enabled: pendingItems.filter(i => i.enabled).length, total: pendingItems.length })}
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
                              {t('chatAssistant.pendingApply', { n: pendingItems.filter(i => i.enabled).length })}
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
                              {msg.actions!.length === 1 ? t('chatAssistant.appliedChange', { n: msg.actions!.length }) : t('chatAssistant.appliedChanges', { n: msg.actions!.length })}
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

                {isLoading && !messages.some(m => m.isGenerating) && (
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

              {/* Scroll-to-bottom button */}
              {showScrollBtn && (
                <div className="absolute bottom-[140px] left-1/2 -translate-x-1/2 z-10">
                  <button
                    onClick={scrollToBottom}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/90 hover:bg-purple-500 text-white text-[11px] font-medium rounded-full shadow-lg backdrop-blur-sm transition-all duration-200 border border-purple-400/20"
                  >
                    <ArrowDown size={12} />
                    {messages.some(m => m.isGenerating) ? t('chatAssistant.scrollWriting') : t('chatAssistant.scrollToBottom')}
                  </button>
                </div>
              )}

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
                
                {generatedCodes && generatedCodes.length > 0 ? (
                  <>
                    <p className="text-[10px] text-zinc-500 mb-2">
                      {t('chatAssistant.codeTabDescription')}
                    </p>
                    <div className="space-y-1.5">
                      {generatedCodes.map((entry) => {
                        const isExpanded = expandedCodeId === entry.songId;
                        return (
                          <div key={entry.songId} className="rounded-xl border border-cyan-900/20 overflow-hidden">
                            <button
                              onClick={() => setExpandedCodeId(isExpanded ? null : entry.songId)}
                              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/60 hover:bg-zinc-800/60 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Code2 size={12} className="text-cyan-400 shrink-0" />
                                <span className="text-[11px] text-zinc-200 truncate">{entry.title}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9px] text-zinc-500">{entry.codeCount} tokens</span>
                                <ChevronDown size={12} className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-cyan-900/20">
                                <div className="bg-zinc-950 p-3 max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                                  <pre className="text-[10px] text-cyan-300/80 font-mono whitespace-pre-wrap break-all leading-relaxed">
                                    {entry.codes}
                                  </pre>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/40">
                                  <span className="text-[9px] text-zinc-500">
                                    {entry.codeCount} tokens · {entry.codes.length} chars
                                  </span>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(entry.codes)}
                                    className="text-[9px] text-cyan-400 hover:text-cyan-300 underline ml-auto"
                                  >
                                    {t('chatAssistant.copyButton')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
                    <Code2 size={32} className="mb-3 opacity-30" />
                    <p className="text-xs text-center">{t('chatAssistant.noCodesYet')}</p>
                    <p className="text-[10px] text-center mt-1 text-zinc-700">
                      {t('chatAssistant.noCodesDetail')}
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
