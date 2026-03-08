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
const KEEP_ALIVE_KEY = 'acestep_assistant_keep_alive';
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
        parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-surface-300 text-accent-300 text-[12px] font-mono">{codeMatch[1]}</code>);
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
        parts.push(<em key={key++} className="italic text-surface-700">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      // Plain text - take until next special char
      const nextSpecial = remaining.search(/[`*\[]/);
      if (nextSpecial === -1) {
        parts.push(<span key={key++} className="text-surface-900">{remaining}</span>);
        break;
      }
      if (nextSpecial === 0) {
        // No match, just take one char
        parts.push(<span key={key++} className="text-surface-900">{remaining[0]}</span>);
        remaining = remaining.slice(1);
      } else {
        parts.push(<span key={key++} className="text-surface-900">{remaining.slice(0, nextSpecial)}</span>);
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
          <div key={i} className="my-2 rounded-lg overflow-hidden border border-surface-300">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-surface-100 text-[10px] text-surface-500 font-mono border-b border-surface-300">
                {codeBlockLang}
              </div>
            )}
            <pre className="px-3 py-2 bg-surface-50 text-[12px] text-surface-800 font-mono overflow-x-auto leading-relaxed">
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
      elements.push(<h4 key={i} className="text-[13px] font-bold text-surface-900 mt-2 mb-1">{processInline(h3Match[1])}</h4>);
      continue;
    }
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      elements.push(<h3 key={i} className="text-sm font-bold text-surface-900 mt-2 mb-1">{processInline(h2Match[1])}</h3>);
      continue;
    }
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      elements.push(<h2 key={i} className="text-[15px] font-bold text-surface-900 mt-2 mb-1">{processInline(h1Match[1])}</h2>);
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    if (bulletMatch) {
      const indent = Math.min(Math.floor(bulletMatch[1].length / 2), 3);
      elements.push(
        <div key={i} className="flex gap-1.5 text-[13px] text-surface-900 leading-relaxed" style={{ paddingLeft: indent * 16 }}>
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
        <div key={i} className="flex gap-1.5 text-[13px] text-surface-900 leading-relaxed">
          <span>{processInline(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-[13px] text-surface-900 leading-relaxed">{processInline(line)}</p>
    );
  }

  return <>{elements}</>;
}

/* ── Streaming AI API caller ── */
async function callAiApiStream(
  provider: AiProvider,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  keepAlive?: boolean,
): Promise<void> {
  if (provider.id === 'ollama') {
    const res = await fetch(`${provider.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.selectedModel || 'llama3',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        ...(keepAlive !== undefined ? { keep_alive: keepAlive ? -1 : '5m' } : {}),
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

const SYSTEM_PROMPT = `You are **ProdIA Max v2**, an AI assistant embedded in a local music generation app built on **ACE-Step v1.5** (an open-source AI music model). You run locally on the user's GPU — you are NOT Suno, Udio, or any cloud service.

## What ACE-Step is
ACE-Step is a diffusion-based music generation model. It takes a text prompt describing the style/genre + optional lyrics and produces a full audio track. It runs 100% locally using a DiT decoder + optional LM backbone.

## What you can help with
- Writing well-structured lyrics for the generator
- Recommending generation parameters (BPM, key, steps, guidance, etc.)
- Explaining how LoRA fine-tuning works with ACE-Step
- Suggesting style tags and genre descriptions
- Song structure advice

## CRITICAL — Lyrics format rules
When writing lyrics, you MUST use **square brackets** for section tags, never parentheses:
  [Intro], [Verse], [Verse 1], [Pre-Chorus], [Chorus], [Bridge], [Rap], [Break], [Outro]

WRONG: (Verse 1), (Chorus), (Intro)
RIGHT: [Verse 1], [Chorus], [Intro]

Section tags must be on their own line, with NO markdown formatting around them:
WRONG: #### [Chorus]
WRONG: **[Chorus]**
WRONG: ### [Verse 1]
RIGHT: [Chorus]
RIGHT: [Verse 1]

Never put stage directions, sound effects, production notes, or non-sung text inside lyrics. Examples of what NOT to write:
  (Piano suave entra)
  (Drop de batería suave)
  (Fade out suave)
  (Mayúsculas, sonido de piano agresivo)
  (Todo vuelve al ritmo pop normal)
The model generates audio from text — it cannot interpret performance instructions. Only include text that should actually be SUNG.

Here is an example of a correctly formatted lyrics block:
[Intro]

[Verse 1]
First line of verse one
Second line of verse one

[Pre-Chorus]
Building up to the chorus
Energy rising now

[Chorus]
This is the hook
The main melody here

## CRITICAL — No emojis in lyrics
Never include emojis in the actual lyrics text. Emojis are meaningless to the audio model and will degrade output quality. You may use a minimal emoji in conversational responses, but NEVER inside lyrics blocks.

## CRITICAL — Do not hallucinate
- Do NOT invent models, tools, or features that don't exist (e.g. "ACE-Step 2.0", "Midjourney V6 for covers", etc.)
- Do NOT reference Suno, Udio, or other services as if the user has them
- Do NOT make up parameter names or values that ACE-Step doesn't support
- Only recommend parameters that actually exist in the app

## Available generation parameters
- **BPM**: 20-300 (tempo)
- **Key**: C/C#/D/D#/E/F/F#/G/G#/A/A#/B major/minor
- **Time Signature**: 1/1, 2/4, 3/4, 4/4, 5/4, 6/8, 7/4, 8/4
- **Duration**: up to 240s
- **Inference Steps**: 10-200 (more = higher quality, slower; default 60)
- **Guidance Scale**: 1-30 (how closely it follows the prompt; default 15)
- **Shift**: 0-10 (noise schedule; default 3)
- **Infer Method**: ODE (cleaner) or SDE (more creative/noisy)
- **LM Temperature**: 0-2 (creativity; default 0.85)
- **LM CFG Scale**: 0-5 (prompt adherence; default 1.5)
- **Audio Format**: mp3, wav, flac
- **LoRA Scale**: 0-2 (LoRA influence; keep ≤1.0 to avoid artifacts)

## Style prompt tips
The "Style of Music" field accepts genre/mood descriptors. Examples:
  "reggaeton, latin trap, melodic, 808 bass, perreo"
  "cinematic orchestral, epic, dark, strings, brass"
  "lo-fi hip hop, jazzy, chill, vinyl crackle, mellow"

## Response style
- Be concise and professional
- Respond in the same language the user writes in
- When providing lyrics, give ONLY the lyrics block (with [tags]), no emojis inside
- Separate recommendations/commentary from the actual lyrics
- Do not over-explain basic concepts unless asked`;

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
  const [keepAlive, setKeepAlive] = useState(() => {
    return localStorage.getItem(KEEP_ALIVE_KEY) !== 'false'; // default true
  });

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

  // Persist keep-alive preference
  useEffect(() => {
    localStorage.setItem(KEEP_ALIVE_KEY, String(keepAlive));
  }, [keepAlive]);

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
        }, keepAlive);

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
        bg-surface-50/95 backdrop-blur-xl
        border border-surface-400/60 shadow-2xl shadow-black/60
        animate-scale-in"
    >
      {/* ━━ Header ━━ */}
      <div
        className="flex items-center gap-2.5 px-4 py-3
          bg-surface-100/90 border-b border-surface-400/40
          cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <GripVertical className="w-3.5 h-3.5 text-surface-500" />
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-500 to-brand-500
          flex items-center justify-center shadow-md shadow-accent-500/20">
          <Disc3 className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-surface-900 block leading-tight">{t('assistant.title')}</span>
          <span className="text-[10px] text-surface-500 leading-tight">
            {activeProvider
              ? `${activeProvider.name} — ${activeProvider.selectedModel || 'default'}`
              : t('assistant.offlineMode')}
          </span>
        </div>
        <button onClick={handleClear}
          className="p-1.5 rounded-lg text-surface-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          title={t('assistant.clearHistory')}>
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setKeepAlive(v => !v)}
          className={`p-1.5 rounded-lg transition-colors ${
            keepAlive ? 'text-green-400 bg-green-500/15 hover:bg-green-500/25' : 'text-surface-500 hover:text-surface-700 hover:bg-surface-300'
          }`}
          title={t('vram.keepInMemory')}
        >
          <Brain className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setMinimized(true)}
          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-300 transition-colors">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
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
                  : 'bg-surface-150 text-surface-800 rounded-tl-md border border-surface-300'
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
                  <span className="text-[10px] text-surface-400">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {msg.role === 'assistant' && !msg.streaming && (
                  <button
                    onClick={() => handleCopy(msg.content, i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-surface-400 hover:text-surface-900 transition-all"
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
            <div className="bg-surface-150 text-surface-500 px-4 py-3 rounded-2xl rounded-tl-md border border-surface-300">
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
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-t border-surface-300">
        {quickActions.map((action, i) => (
          <button
            key={i}
            onClick={() => handleSend(action.prompt)}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 rounded-lg
              bg-surface-150 border border-surface-300
              text-[10px] font-medium text-surface-700
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
            className="w-full bg-surface-100 text-[14px] text-surface-900 placeholder:text-surface-400
              outline-none resize-none leading-relaxed max-h-[150px]
              rounded-xl border border-surface-300 px-4 py-3 pr-12
              focus:border-accent-500/60 focus:shadow-[0_0_0_2px_rgba(99,102,241,0.15)]
              transition-all"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="absolute right-2.5 bottom-2.5 w-8 h-8 rounded-lg flex items-center justify-center
              bg-accent-500 text-white
              disabled:opacity-20 disabled:bg-surface-300
              hover:bg-accent-400 active:scale-95 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
