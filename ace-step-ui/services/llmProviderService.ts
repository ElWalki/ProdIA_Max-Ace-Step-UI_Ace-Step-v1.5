/**
 * LLM Provider Service — Unified abstraction for multiple LLM backends.
 * 
 * Supported providers:
 *   - lmstudio:  LM Studio local API (OpenAI-compatible)
 *   - ollama:    Ollama local API (OpenAI-compatible endpoint)
 *   - gemini:    Google Gemini via @google/genai SDK
 *   - claude:    Anthropic Claude API
 *   - custom:    Any OpenAI-compatible API (text-gen-webui, vLLM, etc.)
 * 
 * Excluded: OpenAI / ChatGPT
 * 
 * All config persisted in localStorage — works independently of the audio server.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type LLMProvider = 'lmstudio' | 'ollama' | 'gemini' | 'claude' | 'custom';

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiUrl: string;        // Base URL (e.g. http://localhost:1234)
  apiKey: string;        // API key (empty for local providers)
  model: string;         // Model name (e.g. qwen3-8b, gemini-2.5-flash-latest)
  displayName?: string;  // User-friendly label
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  model?: string;
  provider: LLMProvider;
  tokensUsed?: number;
  error?: string;
}

export interface LLMConnectionTest {
  success: boolean;
  message: string;
  models?: string[];     // Available models (if the API supports listing)
  latencyMs?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ace_llm_config';
const CHAT_HISTORY_KEY = 'ace_chat_history';

export const PROVIDER_DEFAULTS: Record<LLMProvider, Omit<LLMProviderConfig, 'provider'>> = {
  lmstudio: {
    apiUrl: 'http://localhost:1234',
    apiKey: '',
    model: '',
    displayName: 'LM Studio (Local)',
  },
  ollama: {
    apiUrl: 'http://localhost:11434',
    apiKey: '',
    model: '',
    displayName: 'Ollama (Local)',
  },
  gemini: {
    apiUrl: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    model: 'gemini-2.5-flash-latest',
    displayName: 'Google Gemini',
  },
  claude: {
    apiUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
    displayName: 'Anthropic Claude',
  },
  custom: {
    apiUrl: 'http://localhost:5000',
    apiKey: '',
    model: '',
    displayName: 'Custom (OpenAI-compatible)',
  },
};

// ─── Config Persistence ──────────────────────────────────────────────────────

export function loadConfig(): LLMProviderConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LLMProviderConfig;
      // Validate provider type
      if (parsed.provider && PROVIDER_DEFAULTS[parsed.provider]) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[LLM] Failed to load config from localStorage:', e);
  }

  // Fallback: check if build-time Gemini key exists
  const buildTimeKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  if (buildTimeKey) {
    return {
      provider: 'gemini',
      apiUrl: PROVIDER_DEFAULTS.gemini.apiUrl,
      apiKey: buildTimeKey,
      model: 'gemini-2.5-flash-latest',
      displayName: 'Google Gemini (build-time key)',
    };
  }

  // No config at all — return unconfigured state
  return {
    provider: 'lmstudio',
    ...PROVIDER_DEFAULTS.lmstudio,
  };
}

export function saveConfig(config: LLMProviderConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('[LLM] Failed to save config:', e);
  }
}

export function isConfigured(): boolean {
  const config = loadConfig();
  // Local providers don't need an API key
  if (config.provider === 'lmstudio' || config.provider === 'ollama' || config.provider === 'custom') {
    return !!config.apiUrl;
  }
  // Cloud providers need a key
  return !!config.apiKey;
}

// ─── Chat History Persistence ────────────────────────────────────────────────

export interface StoredChatSession {
  id: string;
  messages: LLMMessage[];
  createdAt: string;
  lastActive: string;
  title?: string;
}

export function loadChatHistory(): StoredChatSession[] {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(sessions: StoredChatSession[]): void {
  try {
    // Keep only last 50 sessions to avoid localStorage bloat
    const trimmed = sessions.slice(-50);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[LLM] Failed to save chat history:', e);
  }
}

export function clearChatHistory(): void {
  localStorage.removeItem(CHAT_HISTORY_KEY);
}

// ─── Core: Send Chat ─────────────────────────────────────────────────────────

/**
 * Send a chat completion request to the configured LLM provider.
 * Unified interface — all provider-specific logic is handled internally.
 */
export async function sendChat(
  messages: LLMMessage[],
  systemPrompt?: string,
  config?: LLMProviderConfig,
): Promise<LLMResponse> {
  const cfg = config || loadConfig();

  // Prepend system prompt if provided
  const fullMessages: LLMMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  try {
    switch (cfg.provider) {
      case 'gemini':
        return await sendGemini(fullMessages, cfg);
      case 'claude':
        return await sendClaude(fullMessages, cfg);
      case 'lmstudio':
      case 'ollama':
      case 'custom':
        return await sendOpenAICompatible(fullMessages, cfg);
      default:
        return { text: '', provider: cfg.provider, error: `Unknown provider: ${cfg.provider}` };
    }
  } catch (error: any) {
    console.error(`[LLM][${cfg.provider}] Chat error:`, error);
    return {
      text: '',
      provider: cfg.provider,
      error: error?.message || 'Unknown error connecting to LLM',
    };
  }
}

/**
 * Send a chat completion request with streaming (token-by-token via SSE).
 * Currently supported: OpenAI-compatible (LM Studio, Ollama, Custom).
 * Gemini & Claude fall back to non-streaming.
 * 
 * @param onChunk - called with each new text chunk as it arrives
 * @returns the final complete LLMResponse
 */
export async function sendChatStream(
  messages: LLMMessage[],
  systemPrompt: string | undefined,
  onChunk: (chunk: string, accumulated: string) => void,
  config?: LLMProviderConfig,
): Promise<LLMResponse> {
  const cfg = config || loadConfig();

  const fullMessages: LLMMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  try {
    switch (cfg.provider) {
      case 'lmstudio':
      case 'ollama':
      case 'custom':
        return await sendOpenAICompatibleStream(fullMessages, cfg, onChunk);
      case 'gemini':
      case 'claude':
      default:
        // Fallback: non-streaming, emit full text as single chunk
        const result = cfg.provider === 'gemini'
          ? await sendGemini(fullMessages, cfg)
          : cfg.provider === 'claude'
            ? await sendClaude(fullMessages, cfg)
            : await sendOpenAICompatible(fullMessages, cfg);
        if (result.text) onChunk(result.text, result.text);
        return result;
    }
  } catch (error: any) {
    console.error(`[LLM][${cfg.provider}] Stream error:`, error);
    return {
      text: '',
      provider: cfg.provider,
      error: error?.message || 'Unknown error connecting to LLM',
    };
  }
}

// ─── Provider: OpenAI-Compatible (LM Studio, Ollama, Custom) ─────────────────

/**
 * Resolve the model name to use. If config.model is empty, try to auto-detect
 * from the server's /v1/models endpoint (picks the first loaded model).
 */
async function resolveModelName(config: LLMProviderConfig): Promise<string> {
  if (config.model) return config.model;

  const baseUrl = config.apiUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  try {
    const res = await fetch(`${baseUrl}/v1/models`, { headers });
    if (res.ok) {
      const data = await res.json();
      const models = (data.data || []).map((m: any) => m.id).filter(Boolean);
      if (models.length > 0) {
        console.log(`[LLM] Auto-detected model: ${models[0]}`);
        return models[0];
      }
    }
  } catch { /* ignore */ }

  console.warn('[LLM] No model specified and auto-detect failed. Using empty model name.');
  return '';
}

async function sendOpenAICompatible(
  messages: LLMMessage[],
  config: LLMProviderConfig,
): Promise<LLMResponse> {
  const baseUrl = config.apiUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/v1/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const modelName = await resolveModelName(config);

  const body = {
    model: modelName,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: 0.7,
    max_tokens: 8192,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`${config.provider} API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  // Support both regular content and reasoning_content (Qwen3 thinking mode)
  const msg = data.choices?.[0]?.message;
  const text = msg?.content || msg?.reasoning_content || '';
  const tokensUsed = data.usage?.total_tokens;

  return {
    text,
    model: data.model || modelName,
    provider: config.provider,
    tokensUsed,
  };
}

// ─── Provider: OpenAI-Compatible STREAMING ───────────────────────────────────

async function sendOpenAICompatibleStream(
  messages: LLMMessage[],
  config: LLMProviderConfig,
  onChunk: (chunk: string, accumulated: string) => void,
): Promise<LLMResponse> {
  const baseUrl = config.apiUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/v1/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const modelName = await resolveModelName(config);

  const body = {
    model: modelName,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: 0.7,
    max_tokens: 8192,
    stream: true,
  };

  console.log(`[LLM][stream] Sending to ${endpoint} (model: ${modelName}, messages: ${messages.length})`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`${config.provider} API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  // Parse SSE stream
  const reader = response.body?.getReader();
  if (!reader) {
    // Fallback: try non-streaming if body isn't readable
    console.warn('[LLM][stream] Response body not readable, falling back to non-streaming');
    const result = await sendOpenAICompatible(messages, config);
    if (result.text) onChunk(result.text, result.text);
    return result;
  }

  const decoder = new TextDecoder();
  let accumulated = '';
  let reasoningAccumulated = ''; // Qwen3 thinking mode content
  let resolvedModel = modelName;
  let buffer = '';
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));

          // Detect SSE error objects (e.g. LM Studio context overflow)
          if (json.error) {
            const errMsg = typeof json.error === 'string'
              ? json.error
              : json.error.message || json.error.title || JSON.stringify(json.error);
            console.error(`[LLM][stream] Server error in SSE: ${errMsg}`);
            reader.releaseLock();
            return {
              text: '',
              model: resolvedModel,
              provider: config.provider,
              error: errMsg,
            };
          }

          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          chunkCount++;

          // Handle regular content
          if (delta.content) {
            accumulated += delta.content;
            onChunk(delta.content, accumulated);
          }
          // Handle Qwen3 reasoning_content (thinking mode)
          if (delta.reasoning_content) {
            reasoningAccumulated += delta.reasoning_content;
            // Wrap in <think> tags so cleanReply can strip it
            const fullVisible = `<think>${reasoningAccumulated}</think>${accumulated}`;
            onChunk('', fullVisible);
          }
          if (json.model) resolvedModel = json.model;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  console.log(`[LLM][stream] Done. chunks=${chunkCount}, content=${accumulated.length}c, reasoning=${reasoningAccumulated.length}c`);

  // If streaming produced only reasoning_content and no regular content,
  // include reasoning wrapped in <think> so cleanReply can handle it
  let finalText = accumulated;
  if (!finalText && reasoningAccumulated) {
    finalText = `<think>${reasoningAccumulated}</think>`;
    console.warn('[LLM][stream] Only reasoning_content received (no regular content). Model may be in thinking-only mode.');
  }

  // If streaming produced nothing at all, try non-streaming as fallback
  if (!finalText && chunkCount === 0) {
    console.warn('[LLM][stream] No content from streaming (0 chunks). Retrying non-streaming...');
    try {
      const fallback = await sendOpenAICompatible(messages, config);
      if (fallback.text) {
        onChunk(fallback.text, fallback.text);
        return fallback;
      }
    } catch (e) {
      console.error('[LLM][stream] Non-streaming fallback also failed:', e);
    }
  }

  return {
    text: finalText,
    model: resolvedModel,
    provider: config.provider,
  };
}

// ─── Provider: Google Gemini ─────────────────────────────────────────────────

async function sendGemini(
  messages: LLMMessage[],
  config: LLMProviderConfig,
): Promise<LLMResponse> {
  if (!config.apiKey) {
    throw new Error('Gemini API key is required. Add it in Settings → AI Assistant.');
  }

  // Use the @google/genai SDK dynamically to avoid import issues when not using Gemini
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  // Gemini uses a flat prompt approach — combine system + chat into a single contents string
  // The SDK supports multi-turn via contents array of { role, parts }
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : 'user',
    parts: [{ text: m.role === 'system' ? `[System Instructions]\n${m.content}` : m.content }],
  }));

  // Merge consecutive same-role messages (Gemini requirement)
  const merged: typeof contents = [];
  for (const msg of contents) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].parts.push(...msg.parts);
    } else {
      merged.push({ ...msg, parts: [...msg.parts] });
    }
  }

  const response = await ai.models.generateContent({
    model: config.model || 'gemini-2.5-flash-latest',
    contents: merged,
    config: {
      maxOutputTokens: 8192,
      temperature: 0.7,
    },
  });

  const text = response.text || '';
  const tokensUsed = response.usageMetadata?.totalTokenCount;

  return {
    text,
    model: config.model,
    provider: 'gemini',
    tokensUsed,
  };
}

// ─── Provider: Anthropic Claude ──────────────────────────────────────────────

async function sendClaude(
  messages: LLMMessage[],
  config: LLMProviderConfig,
): Promise<LLMResponse> {
  if (!config.apiKey) {
    throw new Error('Claude API key is required. Add it in Settings → AI Assistant.');
  }

  const baseUrl = config.apiUrl.replace(/\/+$/, '');

  // Separate system message from conversation
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Ensure first message is from user (Claude requirement)
  if (chatMessages.length === 0 || chatMessages[0].role !== 'user') {
    chatMessages.unshift({ role: 'user', content: '(start)' });
  }

  const body: any = {
    model: config.model || 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: chatMessages,
  };
  if (systemMsg) {
    body.system = systemMsg.content;
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Claude API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return {
    text,
    model: data.model || config.model,
    provider: 'claude',
    tokensUsed,
  };
}

// ─── Connection Test ─────────────────────────────────────────────────────────

/**
 * Test connection to the configured LLM provider.
 * Returns success/failure, latency, and available models (if supported).
 */
export async function testConnection(config?: LLMProviderConfig): Promise<LLMConnectionTest> {
  const cfg = config || loadConfig();
  const start = performance.now();

  try {
    switch (cfg.provider) {
      case 'lmstudio':
      case 'ollama':
      case 'custom':
        return await testOpenAICompatible(cfg, start);
      case 'gemini':
        return await testGemini(cfg, start);
      case 'claude':
        return await testClaude(cfg, start);
      default:
        return { success: false, message: `Unknown provider: ${cfg.provider}` };
    }
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Connection failed',
      latencyMs: Math.round(performance.now() - start),
    };
  }
}

async function testOpenAICompatible(config: LLMProviderConfig, start: number): Promise<LLMConnectionTest> {
  const baseUrl = config.apiUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // Try to list models
  const response = await fetch(`${baseUrl}/v1/models`, { headers });
  const latencyMs = Math.round(performance.now() - start);

  if (!response.ok) {
    // Some servers don't support /v1/models — try a minimal completion
    try {
      const testResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'default',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });
      if (testResponse.ok) {
        return {
          success: true,
          message: `✅ Connected to ${config.provider} (models endpoint not available)`,
          latencyMs: Math.round(performance.now() - start),
        };
      }
    } catch { /* fall through */ }

    throw new Error(`Server returned ${response.status}. Check the URL and that the server is running.`);
  }

  const data = await response.json();
  const models = (data.data || []).map((m: any) => m.id).filter(Boolean);

  return {
    success: true,
    message: `✅ Connected! Found ${models.length} model(s).`,
    models,
    latencyMs,
  };
}

async function testGemini(config: LLMProviderConfig, start: number): Promise<LLMConnectionTest> {
  if (!config.apiKey) {
    return { success: false, message: '❌ API key is required for Gemini.' };
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  // Quick test: generate a tiny response
  const response = await ai.models.generateContent({
    model: config.model || 'gemini-2.5-flash-latest',
    contents: 'Say "ok" and nothing else.',
  });

  const latencyMs = Math.round(performance.now() - start);
  const text = response.text || '';

  if (text) {
    return {
      success: true,
      message: `✅ Gemini connected! Model: ${config.model}`,
      models: [config.model],
      latencyMs,
    };
  }

  return { success: false, message: '❌ Gemini returned empty response.', latencyMs };
}

async function testClaude(config: LLMProviderConfig, start: number): Promise<LLMConnectionTest> {
  if (!config.apiKey) {
    return { success: false, message: '❌ API key is required for Claude.' };
  }

  const baseUrl = config.apiUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "ok"' }],
    }),
  });

  const latencyMs = Math.round(performance.now() - start);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    if (response.status === 401) {
      return { success: false, message: '❌ Invalid API key.', latencyMs };
    }
    throw new Error(`Claude error ${response.status}: ${errorText.slice(0, 100)}`);
  }

  return {
    success: true,
    message: `✅ Claude connected! Model: ${config.model}`,
    models: [config.model],
    latencyMs,
  };
}

// ─── Utility: List Models ────────────────────────────────────────────────────

/**
 * Fetch available models from the provider (where supported).
 * Useful for auto-populating model selector dropdowns.
 */
export async function listModels(config?: LLMProviderConfig): Promise<string[]> {
  const cfg = config || loadConfig();

  switch (cfg.provider) {
    case 'lmstudio':
    case 'ollama':
    case 'custom': {
      const baseUrl = cfg.apiUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = {};
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

      try {
        // Try OpenAI-compatible models endpoint
        const res = await fetch(`${baseUrl}/v1/models`, { headers });
        if (res.ok) {
          const data = await res.json();
          return (data.data || []).map((m: any) => m.id).filter(Boolean);
        }
      } catch { /* ignore */ }

      // Ollama native endpoint fallback
      if (cfg.provider === 'ollama') {
        try {
          const res = await fetch(`${baseUrl}/api/tags`);
          if (res.ok) {
            const data = await res.json();
            return (data.models || []).map((m: any) => m.name).filter(Boolean);
          }
        } catch { /* ignore */ }
      }

      return [];
    }

    case 'gemini':
      // Gemini doesn't have a simple model list endpoint usable from browser
      return [
        'gemini-2.5-flash-latest',
        'gemini-2.5-pro-latest',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
      ];

    case 'claude':
      return [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-3-5-haiku-latest',
      ];

    default:
      return [];
  }
}

// ─── Utility: Provider Info ──────────────────────────────────────────────────

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  description: string;
  needsApiKey: boolean;
  isLocal: boolean;
  defaultUrl: string;
  icon: string; // emoji
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'lmstudio',
    name: 'LM Studio',
    description: 'Run local models (Qwen3, Gemma, Mistral, LLaMA, etc.)',
    needsApiKey: false,
    isLocal: true,
    defaultUrl: 'http://localhost:1234',
    icon: '🖥️',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local model runner with easy model management',
    needsApiKey: false,
    isLocal: true,
    defaultUrl: 'http://localhost:11434',
    icon: '🦙',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Cloud AI — fast, multilingual, free tier available',
    needsApiKey: true,
    isLocal: false,
    defaultUrl: 'https://generativelanguage.googleapis.com',
    icon: '💎',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    description: 'Cloud AI — excellent at creative and structured tasks',
    needsApiKey: true,
    isLocal: false,
    defaultUrl: 'https://api.anthropic.com',
    icon: '🧠',
  },
  {
    id: 'custom',
    name: 'Custom API',
    description: 'Any OpenAI-compatible endpoint (vLLM, text-gen-webui, etc.)',
    needsApiKey: false,
    isLocal: true,
    defaultUrl: 'http://localhost:5000',
    icon: '🔧',
  },
];
