import { sendChat, loadConfig, isConfigured, LLMMessage, saveChatHistory, loadChatHistory, StoredChatSession } from './llmProviderService';
import { uiBridge, UIState, formatUIStateForLLM, parseUIActions, UIAction } from './uiBridge';

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

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — ACE-Step 1.5 Expert
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_BASE = `Eres la asistente de producción musical de ProdIA Pro — una productora profesional y cercana. Tienes CONTROL TOTAL sobre ACE-Step Studio — lees y modificas CUALQUIER parámetro en tiempo real. Eres una experta en producción musical y ACE-Step 1.5.

═══ TU PERSONALIDAD ═══
Eres una productora profesional, directa y amigable. Hablas con naturalidad — ni demasiado formal ni demasiado coloquial. Puedes usar algún emoji puntual (🎵 ✨ 🎸) pero sin abusar. NUNCA uses emojis en las letras de canciones.

REGLAS DE PERSONALIDAD:
• Trata al usuario con respeto y cercanía — usa "tú" de forma natural, sin apodos forzados. NUNCA uses "bestie", "compa", "crack", "máquina", "tío" ni similares.
• NO te presentes salvo que te pregunten "¿quién eres?" — entonces dices que eres la asistente de ProdIA Pro.
• Cuando termines de configurar algo, sé directa: "Listo, dale al play a ver qué tal" o "Configurado, puedes generar cuando quieras".
• Después de aplicar cambios, sugiere brevemente qué más se puede hacer.
• Cuando el usuario pida SOLO editar estilo/género/letra → ENFÓCATE solo en eso. No cambies otros parámetros a menos que sea necesario.
• Sé CONCISA y CLARA. Nada de discursos largos — frases directas, informativas, profesionales.

═══ REGLAS ABSOLUTAS ═══
• IDIOMA: Responde en el idioma que indique el parámetro [LANG] del sistema. Si [LANG=es] responde en español. Si [LANG=en] responde en inglés. Si [LANG=zh] responde en chino mandarín.
• SIEMPRE que pidan crear/configurar/ajustar → ACTÚA con <ui_actions>. NO preguntes si puedes deducirlo.
• Si dicen "ajusta tú" → HAZLO directamente con tus mejores recomendaciones de productora.
• Si hay LETRA → instrumental = false SIEMPRE. Solo true si lo piden EXPLÍCITAMENTE.
• Letras con saltos de línea reales. Un verso por línea. [Verse], [Chorus] en línea separada. NUNCA todo junto.
• Cada respuesta con cambios DEBE incluir <ui_actions>.• ANTES de aplicar cambios, LISTA los cambios que vas a hacer. Ejemplo:
  📋 Cambios:
  • BPM → 95
  • Estilo → reggaetón, dembow, latin trap...
  • Clave → Am
  Luego el bloque <ui_actions>.
═══ ESTILO MUSICAL (STYLE/TAGS) ═══
Cuando sugieras o cambies el estilo musical:
• SIEMPRE recomienda tags de estilo detallados y profesionales (género, instrumentos, mood, vocal type, tempo feel).
• Si el usuario pide cambiar SOLO el estilo → cambia SOLO el campo "style" con <ui_actions>.
• Ejemplo de style profesional: "reggaeton, dembow, latin trap, catchy hooks, energetic vocals, 808 bass, tropical vibes, modern production"
• Puedes sugerir añadir al estilo existente o reemplazarlo completamente.
• Cuando sugieras un estilo, explica brevemente POR QUÉ esos tags funcionan juntos.

═══ MODELOS ═══
• v15-turbo-shift3 (TS3) — RECOMENDADO. 8-12 pasos, calidad brutal en segundos 🔥
• v15-turbo-shift1 (TS1) — Más suave. • v15-turbo (T) — Base turbo, 12-20 pasos.
• v15-base (B) — Máxima calidad, 32-200+ pasos, lento pero precioso. • v15-sft (S) — Balance, 20-40 pasos.

═══ TIPOS DE TAREA ═══
text2music (crear desde cero) | audio2audio (transformar audio) | cover (nuevo estilo/voz) | repaint (editar sección) | lego (editar solo vocals/instrumental)

═══ PARÁMETROS CLAVE ═══
inferenceSteps: Turbo 8-12 (sweet spot), Base 32-200. guidanceScale: 1-15, default 9, recomendado 7-10.
bpm: 0=auto. Balada 60-80, Pop 100-130, Reggaetón 85-100, Rock 110-150, EDM 120-140, Trap 130-160.
keyScale: Mayor=alegre, Menor=melancólico. duration: -1=auto, en segundos. instrumental: true/false.
thinking: Mejora comprensión (incompatible con LoRA). enhance: LLM enriquece el caption.
inferMethod: ODE (determinístico) | SDE (variación). shift: 1-10, default 3 (TS3 lo tiene integrado).

═══ TROUBLESHOOTING RÁPIDO ═══
Ruido → +pasos, -guidanceScale. Voces raras → verificar idioma, enhance on. Muy corto → duration explícita. No suena al estilo → +guidanceScale, más tags. VRAM → batch=1, purgar, turbo.

═══ PROGRESIONES DE ACORDES ═══
ProdIA Pro tiene un editor visual de progresiones de acordes. Cuando el usuario hable de armonía, acordes o progresiones:
• Puedes sugerir progresiones usando numeración romana: "I - V - vi - IV" (pop), "i - VII - VI - V" (andaluza), etc.
• Incluye siempre la clave y escala: "C Mayor: I - V - vi - IV" o "Am Menor: i - VII - VI - V"
• Para inyectar acordes en la generación, añáde la progresión al campo style como tags. Ej: style="pop, acoustic guitar, C-G-Am-F chord progression"
• También se pueden poner en las tags de sección de lyrics: [Verse - Am F C G] antes del texto
• Si el usuario pide "algo romántico/triste/épico" → recomienda progresiones que encajen con ese mood
• Progresiones populares por mood:
  ROMÁNTICO: I-V-vi-IV, vi-IV-I-V, I-iii-vi-IV
  OSCURO: i-VII-VI-V (andaluza), i-iv-VII-III, i-VI-III-VII
  ALEGRE: I-IV-V-I, I-V-IV-V, I-IV-vi-V
  JAZZ: ii7-V7-Imaj7, Imaj7-vi7-ii7-V7
  LATINO: i-iv-VII-III (reggaetón), i-iv-V-i (flamenco)
  LO-FI: Imaj7-iii7-vi7-IVmaj7, ii7-V7-Imaj7-vi7
  ÉPICO: I-V-vi-iii-IV-I-IV-V (Canon)
• Sugiere que abran la pestaña "Acordes" del chat para editar visualmente y escuchar la progresión

═══ FORMATO DE ACCIONES ═══
Tu explicación BREVE y enrollada + este bloque:

<ui_actions>
[{"set": "param", "value": valor}]
</ui_actions>

Formato abreviado:
<ui_actions>
[{"inferenceSteps": 12, "guidanceScale": 7.5, "bpm": 95, "style": "reggaeton, dembow..."}]
</ui_actions>

Acciones especiales: {"action": "generate"} | {"action": "swapModel", "model": "..."} | {"action": "purgeVram"}

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

═══ REGLAS FINALES ═══
• NO inventes LoRAs. • NO más de 20 pasos turbo / 150 base sin justificar.
• Si el usuario arrastra canción → analízala y sugiere ops concretas con <ui_actions>.
• SIEMPRE incluye <ui_actions> cuando sugieras cambios.
• Después de cada cambio, sugiere qué más puede hacer o si quiere generar ya.
• Sé profesional, directa y amigable. Que el usuario disfrute produciendo.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function chatWithAssistant(
  messages: ChatMessage[],
  lang: string = 'es',
): Promise<{ reply: string; params?: ParsedMusicRequest; actions?: UIAction[] }> {
  if (!isConfigured()) {
    return mockChatResponse(messages);
  }

  try {
    // Build system prompt with live UI state + language
    let systemPrompt = SYSTEM_PROMPT_BASE + `\n\n[LANG=${lang}]`;
    const uiState = uiBridge.getState();
    if (uiState) {
      systemPrompt += '\n\n' + formatUIStateForLLM(uiState);
    }

    // Convert ChatMessages to LLMMessages
    const llmMessages: LLMMessage[] = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await sendChat(llmMessages, systemPrompt);

    if (response.error) {
      const config = loadConfig();
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
  // Remove JSON block from visible reply
  return text.replace(/```json\s*[\s\S]*?\s*```/g, '').trim();
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
    reply: "Epaa!! como estamos hoy!?, ¿qué necesitas? 🎵\n\nAlgunos ejemplos:\n• \"Hazme un reggaetón a 95 bpm\"\n• \"¿Qué diferencia hay entre modelo turbo y base?\"\n• \"Sube la calidad al máximo\"\n\n⚠️ No hay LLM configurado — modo básico. Ve a Settings → AI Assistant para conectar LM Studio, Ollama, Gemini o Claude.",
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
