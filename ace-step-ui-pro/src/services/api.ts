import type { GenerationParams, GenerationJob } from '../types';

async function api<T>(endpoint: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(endpoint, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(`${res.status}: ${err.error || err.message || 'Request failed'}`);
  }
  return res.json();
}

export function getAudioUrl(audioUrl: string | undefined | null): string | undefined {
  if (!audioUrl) return undefined;
  if (audioUrl.startsWith('/audio/')) return audioUrl;
  return audioUrl;
}

function transformSongs(songs: any[]): any[] {
  return songs.map(s => {
    const rawUrl = s.audio_url || s.audioUrl;
    return { ...s, audio_url: getAudioUrl(rawUrl), audioUrl: getAudioUrl(rawUrl) };
  });
}

export const songsApi = {
  getMySongs: async (token: string) => {
    const r = await api<{ songs: any[] }>('/api/songs', { token });
    return { songs: transformSongs(r.songs) };
  },
  getSong: async (id: string, token?: string | null) => {
    const r = await api<{ song: any }>(`/api/songs/${id}`, { token: token || undefined });
    const s = r.song;
    const u = getAudioUrl(s.audio_url || s.audioUrl);
    return { song: { ...s, audio_url: u, audioUrl: u } };
  },
  deleteSong: (id: string, token: string) =>
    api<{ success: boolean }>(`/api/songs/${id}`, { method: 'DELETE', token }),
  toggleLike: (id: string, token: string) =>
    api<{ liked: boolean }>(`/api/songs/${id}/like`, { method: 'POST', token }),
  updateSong: (id: string, updates: Record<string, unknown>, token: string) =>
    api(`/api/songs/${id}`, { method: 'PATCH', body: updates, token }),
};

export const generateApi = {
  startGeneration: (params: GenerationParams, token: string): Promise<GenerationJob> =>
    api('/api/generate', { method: 'POST', body: params, token }),
  getStatus: (jobId: string, token: string): Promise<GenerationJob> =>
    api(`/api/generate/status/${jobId}`, { token }),
  cancelJob: (jobId: string, token: string) =>
    api<{ success: boolean }>(`/api/generate/cancel/${jobId}`, { method: 'POST', token }),
  uploadAudio: async (file: File, token: string): Promise<{ url: string }> => {
    const fd = new FormData();
    fd.append('audio', file);
    const res = await fetch('/api/generate/upload-audio', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
  extractAudioCodes: (audioUrl: string, token: string) =>
    api<{ audioCodes: string; codeCount: number }>('/api/generate/extract-codes', { method: 'POST', body: { audioUrl }, token }),
  getBackendStatus: () => api<{
    dit: { loaded: boolean; model: string | null; is_turbo: boolean };
    llm: { loaded: boolean; model: string | null; backend: string | null };
  }>('/api/generate/backend-status'),
  getLoadedModels: () => api<{
    models: { name: string; is_default: boolean }[];
    default_model: string | null;
  }>('/v1/models').catch(() => ({ models: [], default_model: null })),
  formatInput: (params: Record<string, unknown>, token: string) =>
    api<Record<string, unknown>>('/api/generate/format', { method: 'POST', body: params, token }),
  getRandomDescription: (token: string) =>
    api<{ description: string; instrumental: boolean; vocalLanguage: string }>('/api/generate/random-description', { token }),

  // LLM model swap
  swapLlmModel: (model: string, backend: string, token: string) =>
    api<{ success: boolean; message: string; model: string | null; backend: string | null }>(
      '/api/generate/llm/swap', { method: 'POST', body: { model, backend }, token }
    ),

  // LoRA
  loadLora: (params: { lora_path: string }, token: string) =>
    api<{ message: string; lora_path: string; trigger_tag?: string }>('/api/lora/load', { method: 'POST', body: params, token }),
  unloadLora: (token: string) =>
    api<{ message: string }>('/api/lora/unload', { method: 'POST', token }),
  getLoraStatus: (token: string) =>
    api<{ loaded: boolean; active: boolean; scale: number; path: string; trigger_tag: string; tag_position: string; name: string }>('/api/lora/status', { token }),
  setLoraScale: (params: { scale: number }, token: string) =>
    api<{ message: string; scale: number }>('/api/lora/scale', { method: 'POST', body: params, token }),
  toggleLora: (token: string) =>
    api<{ message: string; enabled: boolean }>('/api/lora/toggle', { method: 'POST', token }),
  setLoraTagPosition: (params: { position: string }, token: string) =>
    api<{ message: string }>('/api/lora/tag-position', { method: 'POST', body: params, token }),
  listLoras: (token: string, directories?: string[]) =>
    api<{ loras: any[]; defaultDirectory: string }>('/api/lora/list', { method: 'POST', body: { directories }, token }),
  validateLoraDir: (dir: string, token: string) =>
    api<{ valid: boolean; count: number }>('/api/lora/validate-dir', { method: 'POST', body: { directory: dir }, token }),

  // Stems
  separateStems: (params: { audioUrl: string; quality?: string; backend?: string; model?: string; stems?: number }, token: string) =>
    api<{ success: boolean; allStems: any[]; elapsed: number }>('/api/training/separate-stems', { method: 'POST', body: params, token }),
};

export interface GpuInfo {
  index: number;
  name: string;
  used_mb: number;
  total_mb: number;
  free_mb: number;
  usage_percent: number;
  temperature: number;
  utilization: number;
}

export interface VramStatus {
  success: boolean;
  gpus: GpuInfo[];
  torch?: {
    allocated_mb: number;
    reserved_mb: number;
    max_allocated_mb: number;
    fragmentation_mb: number;
  };
  gpu_count: number;
  error?: string;
}

export const vramApi = {
  getStatus: (token: string) =>
    api<VramStatus>('/api/vram/status', { token }),
  purge: (token: string) =>
    api<{ success: boolean; message?: string }>('/api/vram/purge', { method: 'POST', token }),
};
