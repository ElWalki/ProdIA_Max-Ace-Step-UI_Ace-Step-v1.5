import { sendChat, sendChatStream, loadConfig, isConfigured, LLMMessage, saveChatHistory, loadChatHistory, StoredChatSession } from './llmProviderService';
import { uiBridge, UIState, formatUIStateForLLM, parseUIActions, UIAction } from './uiBridge';
// Import the knowledge base as raw text (bundled at build time)
import assistantKnowledge from '../data/assistant-knowledge.md?raw';

// ---------------------------------------------------------------------------
// Token estimation & smart prompt truncation
// ---------------------------------------------------------------------------

/** Rough token estimate: ~3.5 chars per token for mixed Spanish/English + markdown */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Default max context budget (tokens). Leaves room for the user message + response.
 * Most local models run 4096–8192 context. We budget the system prompt to leave
 * at least ~1500 tokens for conversation + response.
 */
const SYSTEM_PROMPT_BUDGET = 2500;

/**
 * Build the system prompt, intelligently truncating if the total would exceed
 * the context budget. Priority order (last to be cut first):
 *   1. UI state snapshot (least critical — the assistant can ask)
 *   2. Knowledge base (can be summarized / trimmed)
 *   3. Song contexts (important when present)
 *   4. Base prompt + mode addendum (never cut)
 */
function buildSystemPrompt(
  mode: 'agent' | 'instructor',
  lang: string,
  songContexts: SongContext[],
): string {
  const modeAddendum = mode === 'agent' ? AGENT_MODE_ADDENDUM : INSTRUCTOR_MODE_ADDENDUM;
  const corePart = SYSTEM_PROMPT_BASE + modeAddendum;
  const langTag = `\n\n[LANG=${lang}] [MODE=${mode}]`;
  const coreTokens = estimateTokens(corePart + langTag);

  let budget = SYSTEM_PROMPT_BUDGET - coreTokens;

  // Prepare optional sections
  const knowledgeSection = `\n\n═══ BASE DE CONOCIMIENTO ═══\n${assistantKnowledge}`;
  const songSection = songContexts.length > 0 ? formatSongContextForLLM(songContexts) : '';
  const uiState = uiBridge.getState();
  const uiSection = uiState ? '\n\n' + formatUIStateForLLM(uiState) : '';

  let knowledgeText = knowledgeSection;
  let songText = songSection;
  let uiText = uiSection;

  const totalTokens = estimateTokens(knowledgeText + songText + uiText);

  if (totalTokens > budget) {
    console.warn(`[Chat] System prompt too large (~${coreTokens + totalTokens} tokens). Trimming to fit budget of ${SYSTEM_PROMPT_BUDGET}...`);

    // Step 1: Drop UI state (regenerable — assistant can check via uiBridge)
    if (estimateTokens(knowledgeText + songText) > budget) {
      uiText = '\n\n(Estado UI omitido por límite de contexto / UI state omitted due to context limit)';
    }

    // Step 2: Trim knowledge base — keep only the essential sections
    const remainingBudget = budget - estimateTokens(songText + uiText);
    if (estimateTokens(knowledgeText) > remainingBudget && remainingBudget > 200) {
      // Keep only: parameters table + actions + troubleshooting (skip chord progressions, advanced params)
      const maxChars = Math.floor(remainingBudget * 3.5);
      knowledgeText = `\n\n═══ BASE DE CONOCIMIENTO (resumida) ═══\n${assistantKnowledge.substring(0, maxChars)}\n[... truncado por límite de contexto]`;
    } else if (remainingBudget <= 200) {
      knowledgeText = '\n\n(Base de conocimiento omitida por límite de contexto / Knowledge base omitted)';
    }

    // Step 3: Trim song contexts if still over budget
    const finalBudget = budget - estimateTokens(knowledgeText + uiText);
    if (estimateTokens(songText) > finalBudget && finalBudget > 100) {
      const maxChars = Math.floor(finalBudget * 3.5);
      songText = songText.substring(0, maxChars) + '\n[... canciones truncadas por límite de contexto]';
    }

    const finalTotal = estimateTokens(corePart + langTag + knowledgeText + songText + uiText);
    console.log(`[Chat] After trimming: ~${finalTotal} tokens (budget: ${SYSTEM_PROMPT_BUDGET})`);
  }

  return corePart + knowledgeText + songText + langTag + uiText;
}

export interface ParsedMusicRequest {
  title?: string;
  style?: string;
  lyrics?: string;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  vocalLanguage?: string;
  instrumental?: boolean;
  duration?: number;
  inferenceSteps?: number;
  guidanceScale?: number;
  thinking?: boolean;
  enhance?: boolean;
  // Extended params (UIBridge era)
  shift?: number;
  inferMethod?: string;
  audioFormat?: string;
  taskType?: string;
  selectedModel?: string;
  lmModel?: string;
  seed?: number;
  randomSeed?: boolean;
  vocalGender?: string;
  loraScale?: number;
  loraEnabled?: boolean;
  editMode?: boolean;
  editAction?: string;
  editTarget?: string;
  variationMode?: boolean;
  audioInfluence?: number;
  styleInfluence?: number;
  weirdness?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'codes';
  content: string;
  timestamp: Date;
  parsedParams?: ParsedMusicRequest;
  isGenerating?: boolean;
  actions?: UIAction[];  // Actions parsed from LLM response
}

// Song context passed to the LLM for analysis/remix
export interface SongContext {
  title: string;
  style?: string;
  lyrics?: string;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  duration?: string;
  instrumental?: boolean;
  vocalLanguage?: string;
  model?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — ACE-Step 1.5 Expert
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_BASE = `Eres la asistente de producción musical de ProdIA Pro. Tienes CONTROL TOTAL sobre ACE-Step Studio — lees y modificas CUALQUIER parámetro en tiempo real. Eres una experta en producción musical y ACE-Step 1.5.

═══ PERSONALIDAD ═══
Productora profesional, directa y amigable. Hablas con naturalidad — concisa y clara. Puedes usar algún emoji puntual (🎵 ✨) pero sin abusar. NUNCA emojis en letras de canciones. Trata al usuario con respeto — usa "tú" de forma natural, sin apodos forzados (NUNCA "bestie", "compa", "crack", "máquina"). NO te presentes salvo que pregunten "¿quién eres?".

═══ REGLAS ═══
• IDIOMA: Responde según [LANG]. es=español, en=inglés, zh=mandarín.
• Cuando pidan crear/configurar/ajustar → ACTÚA con <ui_actions>. NO preguntes si puedes deducirlo.
• Si dicen "ajusta tú" → HAZLO directamente con tus mejores recomendaciones.
• Si hay LETRA → instrumental = false SIEMPRE. Solo true si lo piden EXPLÍCITAMENTE.
• Letras con saltos de línea. Un verso por línea. [Verse], [Chorus] en línea separada.
• ANTES de aplicar cambios, LISTA los cambios brevemente. Luego el bloque <ui_actions>.
• Después de aplicar, sugiere brevemente qué más se puede hacer.
• Sé CONCISA. Frases directas, informativas, profesionales.
• Si piden SOLO editar estilo/letra → cambia SOLO eso.

═══ FORMATO DE ACCIONES ═══
<ui_actions>
[{"inferenceSteps": 12, "guidanceScale": 7.5, "bpm": 95, "style": "reggaeton, dembow..."}]
</ui_actions>

Acciones especiales: {"action": "generate"} | {"action": "swapModel", "model": "..."} | {"action": "purgeVram"} | {"action": "loadLora", "name": "...", "variant": "..."} | {"action": "unloadLora"}

JSON alternativo (botón "Aplicar"):
\`\`\`json
{ "title": "...", "style": "...", "lyrics": "...", "bpm": 95, "instrumental": false }
\`\`\`

═══ FORMATO DE LETRAS ═══
SIEMPRE así:
[Verse]
Primer verso
Segundo verso

[Chorus]
Coro aquí

NUNCA todo junto en una línea.

═══ ANÁLISIS Y REMIX DE CANCIONES ═══
Cuando el usuario carga canciones en el contexto (aparecen como [SONG_CONTEXT]), ANALÍZALAS en profundidad:

1. **Análisis individual** — Para CADA canción cargada:
   • Identifica estilo/género, BPM, tonalidad, estructura, idioma
   • Analiza la letra: temática, emociones, figuras retóricas
   • Evalúa los tags de estilo y su impacto en el sonido
   • Nota aspectos técnicos (modelo, steps, guidance)

2. **Análisis comparativo** — Cuando hay 2+ canciones:
   • Compara BPMs, tonalidades, estilos
   • Identifica elementos compatibles para fusión
   • Señala conflictos potenciales (BPMs muy distintos, tonalidades incompatibles)

3. **Propuestas de remix/fusión** — Cuando pidan remix, fusión o mashup:
   • Sugiere un BPM intermedio o el más adecuado
   • Propón una tonalidad que funcione con ambas
   • Fusiona los mejores elementos de cada estilo en tags nuevos
   • Combina fragmentos de letras o crea letra nueva inspirada en ambas
   • Explica POR QUÉ cada decisión funciona musicalmente

═══ FLUJO PASO A PASO ═══
Para cambios complejos (remix, fusión, múltiples ajustes), usa el flujo PASO A PASO:

• Presenta los cambios como PASOS NUMERADOS (Paso 1, Paso 2, Paso 3...)
• Cada paso tiene UN SOLO bloque <ui_actions> con los cambios de ESE paso
• Después de cada paso, PAUSA y pide confirmación: "¿Procedemos al siguiente paso?"
• El usuario puede aceptar, modificar o saltar cada paso
• Ejemplo de flujo:

**Paso 1 — Configurar BPM y tonalidad base**
Ajusto el BPM a 110 (medio entre tus dos canciones) y tonalidad a G minor.
<ui_actions>
[{"bpm": 110, "keyScale": "G minor"}]
</ui_actions>
¿Aplicamos este paso? Dime "ok" o "siguiente" para continuar.

• NO pongas todos los pasos juntos. UN paso por mensaje.
• Si el usuario dice "hazlo todo" → entonces sí aplica todos los cambios en un solo bloque.
• El flujo termina con el paso final: {"action": "generate"}.`;

// Agent mode addendum — AI applies actions autonomously
const AGENT_MODE_ADDENDUM = `

═══ MODO AGENTE (ACTIVO) ═══
Estás en MODO AGENTE. DEBES incluir <ui_actions> en CADA respuesta donde sugieras cambios. Tomas decisiones y las aplicas directamente. El usuario espera que actúes, no que solo expliques.`;

// Instructor mode addendum — AI only explains, no actions
const INSTRUCTOR_MODE_ADDENDUM = `

═══ MODO INSTRUCTOR (ACTIVO) ═══
Estás en MODO INSTRUCTOR. NO incluyas <ui_actions>. Solo EXPLICA qué haría el usuario para conseguir lo que pide — describe los parámetros, valores y pasos, pero NO apliques cambios. El usuario quiere aprender y hacerlo manualmente. Puedes usar formato JSON en bloques de código como referencia visual, pero no como acción ejecutable.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Build context from loaded songs
// ---------------------------------------------------------------------------
function formatSongContextForLLM(songs: SongContext[]): string {
  if (songs.length === 0) return '';
  const lines: string[] = ['\n═══ [SONG_CONTEXT] — CANCIONES CARGADAS ═══'];
  lines.push(`Total: ${songs.length} canción(es) en contexto.\n`);
  for (let i = 0; i < songs.length; i++) {
    const s = songs[i];
    lines.push(`── Canción ${i + 1}: "${s.title || 'Sin título'}" ──`);
    if (s.style) lines.push(`  Estilo/Tags: ${s.style}`);
    if (s.bpm) lines.push(`  BPM: ${s.bpm}`);
    if (s.keyScale) lines.push(`  Tonalidad: ${s.keyScale}`);
    if (s.timeSignature) lines.push(`  Compás: ${s.timeSignature}`);
    if (s.duration) lines.push(`  Duración: ${s.duration}`);
    if (s.vocalLanguage) lines.push(`  Idioma vocal: ${s.vocalLanguage}`);
    if (s.instrumental) lines.push(`  Instrumental: Sí`);
    if (s.model) lines.push(`  Modelo: ${s.model}`);
    if (s.tags && s.tags.length) lines.push(`  Tags: ${s.tags.join(', ')}`);
    if (s.lyrics) {
      const lyr = s.lyrics.length > 800 ? s.lyrics.substring(0, 800) + '\n[... letra truncada]' : s.lyrics;
      lines.push(`  Letra:\n${lyr.split('\n').map(l => '    ' + l).join('\n')}`);
    } else {
      lines.push(`  Letra: (sin letra / instrumental)`);
    }
    lines.push('');
  }
  if (songs.length >= 2) {
    lines.push('⚡ IMPORTANTE: Hay múltiples canciones cargadas. El usuario puede querer un remix, fusión o comparación. Analiza las diferencias y similitudes entre ellas.');
  }
  return lines.join('\n');
}

export async function chatWithAssistant(
  messages: ChatMessage[],
  lang: string = 'es',
  mode: 'agent' | 'instructor' = 'agent',
  songContexts: SongContext[] = [],
): Promise<{ reply: string; params?: ParsedMusicRequest; actions?: UIAction[] }> {
  if (!isConfigured()) {
    return mockChatResponse(messages);
  }

  try {
    // Build system prompt with smart truncation for small context windows
    const systemPrompt = buildSystemPrompt(mode, lang, songContexts);

    // Convert ChatMessages to LLMMessages (keep last N to avoid context overflow)
    const allLLMMessages: LLMMessage[] = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Trim conversation history if it would blow the context
    const systemTokens = estimateTokens(systemPrompt);
    const maxConvoTokens = Math.max(500, SYSTEM_PROMPT_BUDGET * 2 - systemTokens);
    let llmMessages = allLLMMessages;
    let convoTokens = estimateTokens(llmMessages.map(m => m.content).join(''));
    while (convoTokens > maxConvoTokens && llmMessages.length > 2) {
      // Remove oldest pair (keep at least last user message)
      llmMessages = llmMessages.slice(2);
      convoTokens = estimateTokens(llmMessages.map(m => m.content).join(''));
    }

    const response = await sendChat(llmMessages, systemPrompt);

    if (response.error) {
      const config = loadConfig();
      // Detect context overflow errors
      if (response.error.includes('context') && (response.error.includes('exceed') || response.error.includes('n_keep'))) {
        return {
          reply: `⚠️ **Error: contexto del modelo demasiado pequeño**\n\nEl prompt del sistema (~${systemTokens} tokens) excede el contexto del modelo.\n\n**Solución:** En LM Studio → Model Settings → aumenta **Context Length** a **8192** o más (16384 recomendado).\n\nAlternativamente, usa un modelo con mayor contexto.`,
        };
      }
      return {
        reply: `⚠️ Error from ${config.provider}: ${response.error}\n\nCheck your connection in Settings → AI Assistant.`,
      };
    }

    const rawReply = response.text || "I couldn't process that. Could you try again?";

    // Parse UI actions from the response
    const { cleanText: afterActions, actions } = parseUIActions(rawReply);

    // Extract JSON params from the reply (backward compat)
    const params = extractJsonParams(afterActions);

    // Clean the reply (remove JSON block)
    const cleanedReply = cleanReply(afterActions);

    return {
      reply: cleanedReply,
      params: params || undefined,
      actions: actions.length > 0 ? actions : undefined,
    };
  } catch (error: any) {
    console.error("Chat error:", error);
    return {
      reply: `⚠️ Error connecting to AI: ${error?.message || 'Unknown error'}. Check Settings → AI Assistant.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Streaming Chat — token-by-token updates
// ---------------------------------------------------------------------------

/**
 * Stream chat with the assistant. Each token chunk is passed to onStreamChunk
 * with the visible text (think tags stripped in real-time).
 * Returns the final parsed result once streaming is complete.
 */
export async function streamChatWithAssistant(
  messages: ChatMessage[],
  lang: string = 'es',
  mode: 'agent' | 'instructor' = 'agent',
  onStreamChunk: (visibleText: string) => void,
  songContexts: SongContext[] = [],
): Promise<{ reply: string; params?: ParsedMusicRequest; actions?: UIAction[] }> {
  if (!isConfigured()) {
    return mockChatResponse(messages);
  }

  try {
    // Build system prompt with smart truncation for small context windows
    const systemPrompt = buildSystemPrompt(mode, lang, songContexts);

    // Convert and trim conversation history
    const allLLMMessages: LLMMessage[] = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const systemTokens = estimateTokens(systemPrompt);
    const maxConvoTokens = Math.max(500, SYSTEM_PROMPT_BUDGET * 2 - systemTokens);
    let llmMessages = allLLMMessages;
    let convoTokens = estimateTokens(llmMessages.map(m => m.content).join(''));
    while (convoTokens > maxConvoTokens && llmMessages.length > 2) {
      llmMessages = llmMessages.slice(2);
      convoTokens = estimateTokens(llmMessages.map(m => m.content).join(''));
    }

    // Track if we're inside a <think> block for real-time stripping
    let insideThink = false;
    let thinkBuffer = '';

    const response = await sendChatStream(
      llmMessages,
      systemPrompt,
      (_chunk: string, accumulated: string) => {
        // Real-time <think> stripping for display
        // We process the full accumulated text to determine visible portion
        let visible = accumulated;
        // Remove complete <think>...</think> blocks
        visible = visible.replace(/<think>[\s\S]*?<\/think>/gi, '');
        // If there's an unclosed <think>, hide everything from it onward
        const openThinkIdx = visible.lastIndexOf('<think>');
        if (openThinkIdx !== -1) {
          visible = visible.substring(0, openThinkIdx);
        }
        // Remove stray </think>
        visible = visible.replace(/<\/think>/gi, '');
        onStreamChunk(visible.trim());
      },
    );

    if (response.error) {
      const config = loadConfig();
      // Detect context overflow errors
      if (response.error.includes('context') && (response.error.includes('exceed') || response.error.includes('n_keep'))) {
        return {
          reply: `⚠️ **Error: contexto del modelo demasiado pequeño**\n\nEl prompt del sistema (~${systemTokens} tokens) excede el contexto del modelo.\n\n**Solución:** En LM Studio → Model Settings → aumenta **Context Length** a **8192** o más (16384 recomendado).\n\nAlternativamente, usa un modelo con mayor contexto.`,
        };
      }
      return {
        reply: `⚠️ Error from ${config.provider}: ${response.error}\n\nCheck your connection in Settings → AI Assistant.`,
      };
    }

    const rawReply = response.text || "I couldn't process that. Could you try again?";
    const { cleanText: afterActions, actions } = parseUIActions(rawReply);
    const params = extractJsonParams(afterActions);
    const cleanedReply = cleanReply(afterActions);

    return {
      reply: cleanedReply,
      params: params || undefined,
      actions: actions.length > 0 ? actions : undefined,
    };
  } catch (error: any) {
    console.error("Stream chat error:", error);
    const msg = error?.message || 'Unknown error';
    // Detect context overflow in thrown errors too
    if (msg.includes('context') && (msg.includes('exceed') || msg.includes('n_keep'))) {
      return {
        reply: `⚠️ **Error: contexto del modelo demasiado pequeño**\n\nEl prompt excede el contexto del modelo.\n\n**Solución:** En LM Studio → Model Settings → aumenta **Context Length** a **8192** o más.`,
      };
    }
    return {
      reply: `⚠️ Error connecting to AI: ${msg}. Check Settings → AI Assistant.`,
    };
  }
}

function extractJsonParams(text: string): ParsedMusicRequest | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    const params: ParsedMusicRequest = {};

    if (parsed.title) params.title = parsed.title;
    if (parsed.style) params.style = parsed.style;
    if (parsed.lyrics) params.lyrics = parsed.lyrics;
    if (parsed.bpm) params.bpm = Number(parsed.bpm);
    if (parsed.keyScale || parsed.key_scale || parsed.key) {
      params.keyScale = parsed.keyScale || parsed.key_scale || parsed.key;
    }
    if (parsed.timeSignature || parsed.time_signature) {
      params.timeSignature = parsed.timeSignature || parsed.time_signature;
    }
    if (parsed.vocalLanguage || parsed.vocal_language || parsed.language) {
      params.vocalLanguage = parsed.vocalLanguage || parsed.vocal_language || parsed.language;
    }
    if (parsed.instrumental !== undefined) params.instrumental = parsed.instrumental;
    if (parsed.duration) params.duration = Number(parsed.duration);
    if (parsed.inferenceSteps || parsed.inference_steps) {
      params.inferenceSteps = Number(parsed.inferenceSteps || parsed.inference_steps);
    }
    if (parsed.guidanceScale || parsed.guidance_scale) {
      params.guidanceScale = Number(parsed.guidanceScale || parsed.guidance_scale);
    }
    if (parsed.thinking !== undefined) params.thinking = parsed.thinking;
    if (parsed.enhance !== undefined) params.enhance = parsed.enhance;
    // Extended params
    if (parsed.shift) params.shift = Number(parsed.shift);
    if (parsed.inferMethod || parsed.infer_method) params.inferMethod = parsed.inferMethod || parsed.infer_method;
    if (parsed.audioFormat || parsed.audio_format) params.audioFormat = parsed.audioFormat || parsed.audio_format;
    if (parsed.taskType || parsed.task_type) params.taskType = parsed.taskType || parsed.task_type;
    if (parsed.selectedModel || parsed.model) params.selectedModel = parsed.selectedModel || parsed.model;
    if (parsed.lmModel || parsed.lm_model) params.lmModel = parsed.lmModel || parsed.lm_model;
    if (parsed.seed !== undefined) params.seed = Number(parsed.seed);
    if (parsed.randomSeed !== undefined) params.randomSeed = parsed.randomSeed;
    if (parsed.vocalGender || parsed.vocal_gender) params.vocalGender = parsed.vocalGender || parsed.vocal_gender;

    return Object.keys(params).length > 0 ? params : null;
  } catch {
    return null;
  }
}

function cleanReply(text: string): string {
  // Remove <think>...</think> blocks (LLM chain-of-thought reasoning)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove orphaned <think> (unclosed — strip from <think> to end)
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
  // Remove orphaned </think> (closing without opening)
  cleaned = cleaned.replace(/<\/think>/gi, '');
  // Remove JSON block from visible reply
  cleaned = cleaned.replace(/```json\s*[\s\S]*?\s*```/g, '');
  return cleaned.trim();
}

async function mockChatResponse(messages: ChatMessage[]): Promise<{ reply: string; params?: ParsedMusicRequest }> {
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';

  await new Promise(r => setTimeout(r, 800));

  if (lastMsg.includes('rock') || lastMsg.includes('guitar')) {
    return {
      reply: "🎸 Rock — buena elección. Te configuro guitarras eléctricas, batería contundente y voces potentes.\n\nEstilo: \"rock, electric guitar, driving drums, energetic, powerful vocals, distortion\"\n\nEstos tags te dan un sonido directo y con fuerza. ¿Generamos así o añadimos letra?",
      params: {
        style: "rock, electric guitar, driving drums, energetic, powerful vocals, distortion",
        bpm: 130,
        keyScale: "E minor",
        instrumental: false,
        duration: 180,
        inferenceSteps: 12,
      }
    };
  }

  if (lastMsg.includes('chill') || lastMsg.includes('relax') || lastMsg.includes('ambient')) {
    return {
      reply: "🌊 Ambiente relajado. Te preparo pads suaves y melodías etéreas.\n\nEstilo: \"ambient, chill, soft pads, ethereal, relaxing, atmospheric, downtempo\"\n\nLo pongo instrumental — funciona mejor sin voces para este mood. ¿Te parece o prefieres añadir alguna voz ambient?",
      params: {
        style: "ambient, chill, soft pads, ethereal, relaxing, atmospheric, downtempo",
        bpm: 75,
        keyScale: "C major",
        instrumental: true,
        duration: 240,
        inferenceSteps: 16,
      }
    };
  }

  if (lastMsg.includes('rap') || lastMsg.includes('hip hop') || lastMsg.includes('trap')) {
    return {
      reply: "🎤 Trap/Hip-hop. Te configuro 808s pesados y hi-hats crispy.\n\nEstilo: \"hip hop, trap, 808 bass, crispy hi-hats, dark, hard-hitting, rap\"\n\nSonido moderno y contundente. ¿Escribimos una letra o lo dejamos instrumental?",
      params: {
        style: "hip hop, trap, 808 bass, crispy hi-hats, dark, hard-hitting, rap",
        bpm: 140,
        keyScale: "G minor",
        instrumental: false,
        duration: 180,
        inferenceSteps: 12,
      }
    };
  }

  return {
    reply: "Hola, ¿qué necesitas?\n\nAlgunos ejemplos:\n• \"Hazme un reggaetón a 95 bpm\"\n• \"¿Qué diferencia hay entre modelo turbo y base?\"\n• \"Sube la calidad al máximo\"\n\n⚠️ No hay LLM configurado — modo básico. Ve a Settings → AI Assistant para conectar LM Studio, Ollama, Gemini o Claude.",
  };
}

export function formatParamsForDisplay(params: ParsedMusicRequest): string {
  const lines: string[] = [];
  if (params.title) lines.push(`🎵 Title: ${params.title}`);
  if (params.style) lines.push(`🎨 Style: ${params.style}`);
  if (params.bpm) lines.push(`⏱️ BPM: ${params.bpm}`);
  if (params.keyScale) lines.push(`🎹 Key: ${params.keyScale}`);
  if (params.timeSignature) lines.push(`📐 Time: ${params.timeSignature}/4`);
  if (params.vocalLanguage) lines.push(`🌍 Language: ${params.vocalLanguage}`);
  if (params.instrumental !== undefined) lines.push(`🎸 Instrumental: ${params.instrumental ? 'Yes' : 'No'}`);
  if (params.duration) lines.push(`⏳ Duration: ${params.duration}s`);
  if (params.inferenceSteps) lines.push(`🔧 Steps: ${params.inferenceSteps}`);
  if (params.guidanceScale) lines.push(`🎯 Guidance: ${params.guidanceScale}`);
  if (params.shift) lines.push(`📐 Shift: ${params.shift}`);
  if (params.inferMethod) lines.push(`🔀 Method: ${params.inferMethod}`);
  if (params.taskType) lines.push(`🎯 Task: ${params.taskType}`);
  if (params.selectedModel) lines.push(`🤖 Model: ${params.selectedModel}`);
  if (params.thinking !== undefined) lines.push(`💭 Thinking: ${params.thinking ? 'On' : 'Off'}`);
  if (params.enhance !== undefined) lines.push(`✨ Enhance: ${params.enhance ? 'On' : 'Off'}`);
  if (params.lyrics) lines.push(`📝 Lyrics: ${params.lyrics.substring(0, 100)}...`);
  return lines.join('\n');
}
