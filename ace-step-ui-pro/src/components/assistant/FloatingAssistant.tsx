import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Minus, Send, Sparkles, GripVertical,
  Wand2, ListMusic, Sliders, Disc3, Bot, User,
  RotateCcw, Copy, Check, ChevronDown, ChevronRight, Brain,
} from 'lucide-react';
import { loadSettings } from '../ui/SettingsModal';
import type { AiProvider } from '../ui/SettingsModal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  streaming?: boolean;
}

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  prompt: string;
}

export interface FloatingAssistantProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

const STORAGE_KEY = 'acestep_assistant_pos';
const HISTORY_KEY = 'acestep_chat_history';
const DEFAULT_POS = { x: window.innerWidth - 420, y: 80 };

function loadPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

/* ── Collapsible Thinking Block ── */
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.trim().split('\n');
  const previewLines = lines.slice(0, 3).join('\n');
  const hasMore = lines.length > 3;

  return (
    <div className="my-2 rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-purple-500/10 transition-colors"
      >
        <Brain className="w-3 h-3 text-purple-400 shrink-0" />
        <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider">Thinking</span>
        <div className="flex-1" />
        {hasMore && (
          expanded
            ? <ChevronDown className="w-3 h-3 text-purple-400" />
            : <ChevronRight className="w-3 h-3 text-purple-400" />
        )}
      </button>
      <div className="px-3 pb-2 text-[11px] text-purple-200/70 leading-relaxed font-mono whitespace-pre-wrap">
        {expanded ? content.trim() : previewLines}
        {!expanded && hasMore && (
          <span className="text-purple-400/60 ml-1">...</span>
        )}
      </div>
    </div>
  );
}

/* ── Lightweight Markdown renderer ── */
function renderMarkdown(text: string): React.ReactNode {
  // First, split out <think>...</think> blocks
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const segments: { type: 'text' | 'think'; content: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = thinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'think', content: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  // Handle unclosed <think> (still streaming)
  if (segments.length === 0) {
    const openIdx = text.indexOf('<think>');
    if (openIdx !== -1) {
      if (openIdx > 0) segments.push({ type: 'text', content: text.slice(0, openIdx) });
      segments.push({ type: 'think', content: text.slice(openIdx + 7) });
    } else {
      segments.push({ type: 'text', content: text });
    }
  }

  return (
    <>
      {segments.map((seg, si) =>
        seg.type === 'think'
          ? <ThinkingBlock key={si} content={seg.content} />
          : <React.Fragment key={si}>{renderMarkdownBlock(seg.content)}</React.Fragment>
      )}
    </>
  );
}

function renderMarkdownBlock(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines: string[] = [];

  const processInline = (line: string): React.ReactNode => {
    // Process inline markdown: bold, italic, code, links
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      // Inline code
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-[#2a2a4a] text-accent-300 text-[12px] font-mono">{codeMatch[1]}</code>);
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }
      // Bold
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        parts.push(<strong key={key++} className="font-semibold text-accent-300">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      // Italic
      const italicMatch = remaining.match(/^\*(.+?)\*/);
      if (italicMatch) {
        parts.push(<em key={key++} className="italic text-[#c8c8e0]">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      // Plain text - take until next special char
      const nextSpecial = remaining.search(/[`*\[]/);
      if (nextSpecial === -1) {
        parts.push(<span key={key++} className="text-[#e0e0ee]">{remaining}</span>);
        break;
      }
      if (nextSpecial === 0) {
        // No match, just take one char
        parts.push(<span key={key++} className="text-[#e0e0ee]">{remaining[0]}</span>);
        remaining = remaining.slice(1);
      } else {
        parts.push(<span key={key++} className="text-[#e0e0ee]">{remaining.slice(0, nextSpecial)}</span>);
        remaining = remaining.slice(nextSpecial);
      }
    }
    return <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block boundaries
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeLines = [];
        continue;
      } else {
        inCodeBlock = false;
        elements.push(
          <div key={i} className="my-2 rounded-lg overflow-hidden border border-[#333]">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-[#1a1a2e] text-[10px] text-[#888] font-mono border-b border-[#333]">
                {codeBlockLang}
              </div>
            )}
            <pre className="px-3 py-2 bg-[#12122a] text-[12px] text-[#ddd] font-mono overflow-x-auto leading-relaxed">
              {codeLines.join('\n')}
            </pre>
          </div>
        );
        continue;
      }
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Headings
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      elements.push(<h4 key={i} className="text-[13px] font-bold text-white mt-2 mb-1">{processInline(h3Match[1])}</h4>);
      continue;
    }
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      elements.push(<h3 key={i} className="text-sm font-bold text-white mt-2 mb-1">{processInline(h2Match[1])}</h3>);
      continue;
    }
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      elements.push(<h2 key={i} className="text-[15px] font-bold text-white mt-2 mb-1">{processInline(h1Match[1])}</h2>);
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    if (bulletMatch) {
      const indent = Math.min(Math.floor(bulletMatch[1].length / 2), 3);
      elements.push(
        <div key={i} className="flex gap-1.5 text-[13px] text-[#e0e0ee] leading-relaxed" style={{ paddingLeft: indent * 16 }}>
          <span className="text-accent-400 shrink-0 mt-0.5">•</span>
          <span>{processInline(bulletMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-1.5 text-[13px] text-[#e0e0ee] leading-relaxed">
          <span>{processInline(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-[13px] text-[#e0e0ee] leading-relaxed">{processInline(line)}</p>
    );
  }

  return <>{elements}</>;
}

/* ── Streaming AI API caller ── */
async function callAiApiStream(
  provider: AiProvider,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
): Promise<void> {
  if (provider.id === 'ollama') {
    const res = await fetch(`${provider.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.selectedModel || 'llama3',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });
    if (!res.ok) throw new Error(`Ollama: HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream');
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(Boolean)) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) onChunk(data.message.content);
        } catch { /* skip non-JSON lines */ }
      }
    }
    return;
  }

  if (provider.id === 'lmstudio') {
    const res = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.selectedModel || 'default',
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      }),
    });
    if (!res.ok) throw new Error(`LM Studio: HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream');
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const data = JSON.parse(payload);
          const content = data.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch { /* skip */ }
      }
    }
    return;
  }

  if (provider.id === 'gemini') {
    // Gemini doesn't have a clean SSE stream; use streamGenerateContent
    const model = provider.selectedModel || 'gemini-2.0-flash';
    const res = await fetch(
      `${provider.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(provider.apiKey || '')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini: HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream');
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) onChunk(text);
        } catch { /* skip */ }
      }
    }
    return;
  }

  if (provider.id === 'anthropic') {
    const res = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: provider.selectedModel || 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content,
        stream: true,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic: HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream');
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta' && data.delta?.text) {
            onChunk(data.delta.text);
          }
        } catch { /* skip */ }
      }
    }
    return;
  }

  throw new Error('Unknown provider');
}

const SYSTEM_PROMPT = `You are the ProdIA Max v2 AI music assistant. You help users create music using ACE-Step AI models.
Your expertise:
- Music generation parameters (BPM, key, time signatures, styles, genres)
- Lyrics writing and structure (verse, chorus, bridge, [tags])
- LoRA fine-tuning and style adaptation
- Audio processing (stem separation, effects)
- Prompt engineering for music AI

Keep responses concise and music-focused. Use music terminology.
If users ask about generation settings, give specific parameter recommendations.
Format suggestions with clear structure using markdown. Use emojis sparingly for a professional tone.`;

export default function FloatingAssistant({ isOpen: externalOpen, onToggle }: FloatingAssistantProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = useCallback((v: boolean) => {
    if (onToggle) onToggle();
    else setInternalOpen(v);
  }, [onToggle]);
  const [minimized, setMinimized] = useState(false);
  const savedHistory = useMemo(() => loadHistory(), []);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (savedHistory.length > 0) return savedHistory;
    return [{ role: 'assistant', content: t('assistant.welcome'), timestamp: Date.now() }];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Drag state
  const [pos, setPos] = useState(loadPos);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist position
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  }, [pos]);

  // Persist chat history
  useEffect(() => {
    if (messages.length > 1) {
      const toSave = messages.map(m => ({ ...m, streaming: undefined }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave.slice(-50)));
    }
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  // Clamp position to viewport
  const clamp = useCallback((x: number, y: number) => {
    const w = panelRef.current?.offsetWidth ?? 420;
    const h = panelRef.current?.offsetHeight ?? 600;
    return {
      x: Math.max(0, Math.min(window.innerWidth - w, x)),
      y: Math.max(0, Math.min(window.innerHeight - h, y)),
    };
  }, []);

  // Ensure panel is visible when opened or window is resized
  useEffect(() => {
    if (!open || minimized) return;
    const w = 420, h = 600;
    const isOutside = pos.x + w < 0 || pos.x > window.innerWidth ||
                      pos.y + h < 0 || pos.y > window.innerHeight;
    if (isOutside) {
      // Center if completely off-screen
      setPos({ x: Math.max(0, (window.innerWidth - w) / 2), y: Math.max(0, (window.innerHeight - h) / 2) });
    } else {
      setPos(clamp(pos.x, pos.y));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp on window resize
  useEffect(() => {
    const onResize = () => {
      setPos((prev: { x: number; y: number }) => clamp(prev.x, prev.y));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clamp(dragRef.current.origX + dx, dragRef.current.origY + dy));
  }, [clamp]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Get active provider from settings
  const getActiveProvider = useCallback((): AiProvider | null => {
    const settings = loadSettings();
    if (!settings.activeProviderId) return null;
    const provider = settings.providers.find(p => p.id === settings.activeProviderId);
    if (!provider || !provider.enabled) return null;
    return provider;
  }, []);

  // Copy message
  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }, []);

  // Clear history
  const handleClear = useCallback(() => {
    const initial: Message[] = [{ role: 'assistant', content: t('assistant.welcome'), timestamp: Date.now() }];
    setMessages(initial);
    localStorage.removeItem(HISTORY_KEY);
  }, [t]);

  /* ── Send message with streaming ── */
  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (textOverride || input).trim();
    if (!text || loading) return;
    if (!textOverride) setInput('');

    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const provider = getActiveProvider();

    if (provider) {
      // Add streaming placeholder
      const streamMsg: Message = { role: 'assistant', content: '', timestamp: Date.now(), streaming: true };
      setMessages(prev => [...prev, streamMsg]);

      try {
        const apiMessages = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0).slice(-10).map(m => ({
            role: m.role,
            content: m.content,
          })),
          { role: 'user', content: text },
        ];

        let accumulated = '';
        await callAiApiStream(provider, apiMessages, (chunk) => {
          accumulated += chunk;
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].streaming) {
              updated[lastIdx] = { ...updated[lastIdx], content: accumulated };
            }
            return updated;
          });
        });

        // Mark streaming complete
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].streaming) {
            updated[lastIdx] = { ...updated[lastIdx], streaming: false, content: accumulated || 'No response.' };
          }
          return updated;
        });
      } catch (err: any) {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].streaming) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              streaming: false,
              content: `${t('assistant.apiError')}: ${err.message}`,
            };
          }
          return updated;
        });
      }
    } else {
      // Offline tips mode
      setTimeout(() => {
        const tips = [
          t('assistant.tip1'), t('assistant.tip2'), t('assistant.tip3'),
          t('assistant.tip4'), t('assistant.tip5'),
        ];
        const noProvider = t('assistant.noProvider');
        const reply = `${noProvider}\n\n💡 ${tips[Math.floor(Math.random() * tips.length)]}`;
        setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
      }, 600);
    }

    setLoading(false);
  }, [input, loading, messages, getActiveProvider, t]);

  // Quick actions
  const quickActions: QuickAction[] = useMemo(() => [
    { icon: <Wand2 className="w-3 h-3" />, label: t('assistant.quickStyle'), prompt: t('assistant.quickStylePrompt') },
    { icon: <ListMusic className="w-3 h-3" />, label: t('assistant.quickLyrics'), prompt: t('assistant.quickLyricsPrompt') },
    { icon: <Sliders className="w-3 h-3" />, label: t('assistant.quickParams'), prompt: t('assistant.quickParamsPrompt') },
  ], [t]);

  // Not open — render nothing (button is in TopBar now)
  if (!open) {
    return null;
  }

  // Minimized pill
  if (minimized) {
    return (
      <div
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl
          bg-surface-100/90 backdrop-blur-xl border border-surface-300/50
          shadow-xl shadow-black/30 cursor-pointer select-none
          hover:bg-surface-150 transition-colors"
        onClick={() => setMinimized(false)}
      >
        <Disc3 className="w-4 h-4 text-accent-400 animate-[spin_4s_linear_infinite]" />
        <span className="text-sm text-surface-800 font-semibold">{t('assistant.title')}</span>
        {messages.length > 1 && (
          <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 text-[10px] font-bold flex items-center justify-center">
            {messages.length - 1}
          </span>
        )}
      </div>
    );
  }

  const activeProvider = getActiveProvider();

  return (
    <div
      ref={panelRef}
      style={{ left: pos.x, top: pos.y, width: 420, height: 600 }}
      className="fixed z-50 flex flex-col rounded-2xl overflow-hidden
        bg-[#0d0d1a]/95 backdrop-blur-xl
        border border-[#333]/60 shadow-2xl shadow-black/60
        animate-scale-in"
    >
      {/* ━━ Header ━━ */}
      <div
        className="flex items-center gap-2.5 px-4 py-3
          bg-[#111125]/90 border-b border-[#333]/40
          cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <GripVertical className="w-3.5 h-3.5 text-[#555]" />
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-500 to-brand-500
          flex items-center justify-center shadow-md shadow-accent-500/20">
          <Disc3 className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-white block leading-tight">{t('assistant.title')}</span>
          <span className="text-[10px] text-[#888] leading-tight">
            {activeProvider
              ? `${activeProvider.name} — ${activeProvider.selectedModel || 'default'}`
              : t('assistant.offlineMode')}
          </span>
        </div>
        <button onClick={handleClear}
          className="p-1.5 rounded-lg text-[#666] hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          title={t('assistant.clearHistory')}>
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setMinimized(true)}
          className="p-1.5 rounded-lg text-[#666] hover:text-white hover:bg-[#333] transition-colors">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg text-[#666] hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ━━ Messages ━━ */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group`}>
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
              msg.role === 'user'
                ? 'bg-accent-500/20'
                : 'bg-gradient-to-br from-accent-600/20 to-brand-500/20'
            }`}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5 text-accent-400" />
                : <Bot className="w-3.5 h-3.5 text-brand-400" />}
            </div>

            {/* Bubble */}
            <div className={`relative max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`px-3.5 py-2.5 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-accent-600 text-white rounded-tr-md text-[13px] leading-relaxed'
                  : 'bg-[#16162e] text-[#e0e0e0] rounded-tl-md border border-[#2a2a4a]'
              }`}>
                {msg.role === 'assistant'
                  ? renderMarkdown(msg.content)
                  : <span className="whitespace-pre-wrap">{msg.content}</span>
                }
                {msg.streaming && (
                  <span className="inline-block w-2 h-4 bg-accent-400 rounded-sm ml-0.5 animate-pulse" />
                )}
              </div>
              {/* Time + copy */}
              <div className={`flex items-center gap-1.5 mt-1 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}>
                {msg.timestamp && (
                  <span className="text-[10px] text-[#555]">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {msg.role === 'assistant' && !msg.streaming && (
                  <button
                    onClick={() => handleCopy(msg.content, i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[#555] hover:text-white transition-all"
                  >
                    {copiedIdx === i
                      ? <Check className="w-3 h-3 text-green-400" />
                      : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && !messages[messages.length - 1]?.streaming && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-600/20 to-brand-500/20 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-brand-400" />
            </div>
            <div className="bg-[#16162e] text-[#888] px-4 py-3 rounded-2xl rounded-tl-md border border-[#2a2a4a]">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ━━ Quick Actions ━━ */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-t border-[#222]">
        {quickActions.map((action, i) => (
          <button
            key={i}
            onClick={() => handleSend(action.prompt)}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 rounded-lg
              bg-[#1a1a30] border border-[#2a2a4a]
              text-[10px] font-medium text-[#ccc]
              hover:text-accent-300 hover:border-accent-500/40 hover:bg-accent-500/10
              disabled:opacity-40 transition-all whitespace-nowrap"
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* ━━ Input Area ━━ */}
      <div className="px-4 pb-3 pt-2">
        {!activeProvider && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] text-amber-400">{t('assistant.configureHint')}</span>
          </div>
        )}
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t('assistant.placeholder')}
            rows={1}
            className="w-full bg-[#111125] text-[14px] text-white placeholder:text-[#555]
              outline-none resize-none leading-relaxed max-h-[150px]
              rounded-xl border border-[#333] px-4 py-3 pr-12
              focus:border-accent-500/60 focus:shadow-[0_0_0_2px_rgba(99,102,241,0.15)]
              transition-all"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="absolute right-2.5 bottom-2.5 w-8 h-8 rounded-lg flex items-center justify-center
              bg-accent-500 text-white
              disabled:opacity-20 disabled:bg-[#333]
              hover:bg-accent-400 active:scale-95 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
