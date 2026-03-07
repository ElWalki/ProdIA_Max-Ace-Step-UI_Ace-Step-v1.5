import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Server, Activity, Cpu, Zap, RefreshCw, Settings2,
  Power, RotateCcw, FolderOpen, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Shield,
  Gauge, MemoryStick, Wrench, FlaskConical, Search,
  BarChart3, Clock, ListOrdered,
} from 'lucide-react';
import { generateApi, vramApi, serverApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ─── Types ─────────────────────────────────────────────
interface BackendStatus {
  dit: { loaded: boolean; model: string | null; is_turbo: boolean };
  llm: { loaded: boolean; model: string | null; backend: string | null };
}

interface QueueStats {
  jobs: { total: number; queued: number; running: number; succeeded: number; failed: number };
  queue_size: number;
  queue_maxsize: number;
  avg_job_seconds: number;
}

interface ExperimentalConfig {
  use_tiled_decode: boolean;
  constrained_decoding: boolean;
  sample_mode: boolean;
  use_format: boolean;
}

interface ModelInitConfig {
  device: string;
  use_flash_attention: boolean;
  compile_model: boolean;
  quantization: string;
  offload_to_cpu: boolean;
  offload_dit_to_cpu: boolean;
}

const EXPERIMENTAL_DEFAULTS: ExperimentalConfig = {
  use_tiled_decode: true,
  constrained_decoding: true,
  sample_mode: false,
  use_format: false,
};

const MODEL_INIT_DEFAULTS: ModelInitConfig = {
  device: 'auto',
  use_flash_attention: false,
  compile_model: false,
  quantization: 'none',
  offload_to_cpu: false,
  offload_dit_to_cpu: false,
};

function loadConfig<T>(key: string, defaults: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return defaults;
}

function saveConfig<T>(key: string, config: T): void {
  localStorage.setItem(key, JSON.stringify(config));
}

// ─── Section Component ─────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-surface-200/60 bg-surface-50/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-100/50 transition-colors"
      >
        <Icon className="w-4.5 h-4.5 text-accent-400 shrink-0" />
        <span className="text-sm font-semibold text-surface-900 flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-surface-500" /> : <ChevronRight className="w-4 h-4 text-surface-500" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Toggle Switch ─────────────────────────────────────
function Toggle({ checked, onChange, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-10 h-5.5 rounded-full transition-colors ${
        checked ? 'bg-accent-500' : 'bg-surface-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[18px]' : ''
      }`} />
    </button>
  );
}

// ─── Status Dot ────────────────────────────────────────
function StatusDot({ status }: { status: 'online' | 'offline' | 'loading' }) {
  if (status === 'loading') return <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />;
  return (
    <div className={`w-2.5 h-2.5 rounded-full ${
      status === 'online' ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-red-400 shadow-sm shadow-red-400/50'
    }`} />
  );
}

// ═══════════════════════════════════════════════════════
export default function FeaturesView() {
  const { t } = useTranslation();
  const { token } = useAuth();

  // ─── Backend Status ─────────────────
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // ─── Queue Stats ────────────────────
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

  // ─── LLM Swap ──────────────────────
  const [llmSwapBackend, setLlmSwapBackend] = useState<string>('pt');
  const [llmSwapping, setLlmSwapping] = useState(false);

  // ─── Checkpoints ────────────────────
  const [checkpointsPath, setCheckpointsPath] = useState<string>('');
  const [checkpointsExists, setCheckpointsExists] = useState(true);
  const [isCustomPath, setIsCustomPath] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [newPath, setNewPath] = useState('');

  // ─── Experimental Config ────────────
  const [experimental, setExperimental] = useState<ExperimentalConfig>(
    () => loadConfig('acestep_experimental', EXPERIMENTAL_DEFAULTS)
  );

  // ─── Model Init Config ─────────────
  const [modelInit, setModelInit] = useState<ModelInitConfig>(
    () => loadConfig('acestep_model_init', MODEL_INIT_DEFAULTS)
  );

  // ─── VRAM Diagnostic ───────────────
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // ─── Server Action State ───────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ─── Fetch Status ──────────────────
  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [bs, health] = await Promise.allSettled([
        generateApi.getBackendStatus(),
        serverApi.health(),
      ]);
      setBackendStatus(bs.status === 'fulfilled' ? bs.value : null);
      setServerOnline(health.status === 'fulfilled');
      if (bs.status === 'fulfilled' && bs.value.llm.backend) {
        setLlmSwapBackend(bs.value.llm.backend);
      }
    } catch {
      setServerOnline(false);
    }
    setStatusLoading(false);
  }, []);

  const fetchQueueStats = useCallback(async () => {
    try {
      const r = await fetch('/api/generate/stats');
      if (r.ok) setQueueStats(await r.json());
    } catch { /* Python API may be down */ }
  }, []);

  const fetchCheckpointsPath = useCallback(async () => {
    try {
      const r = await generateApi.getCheckpointsPath();
      setCheckpointsPath(r.path);
      setCheckpointsExists(r.exists);
      setIsCustomPath(r.isCustom);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchQueueStats();
    fetchCheckpointsPath();
  }, [fetchStatus, fetchQueueStats, fetchCheckpointsPath]);

  // ─── Config Updaters ───────────────
  const updateExperimental = (key: keyof ExperimentalConfig, value: boolean) => {
    const next = { ...experimental, [key]: value };
    setExperimental(next);
    saveConfig('acestep_experimental', next);
  };

  const updateModelInit = <K extends keyof ModelInitConfig>(key: K, value: ModelInitConfig[K]) => {
    const next = { ...modelInit, [key]: value };
    setModelInit(next);
    saveConfig('acestep_model_init', next);
  };

  // ─── LLM Swap ─────────────────────
  const swapLlmBackend = async () => {
    if (!token || !backendStatus?.llm.model) return;
    setLlmSwapping(true);
    try {
      await generateApi.swapLlmModel(backendStatus.llm.model, llmSwapBackend, token);
      setActionResult({ type: 'success', msg: `LLM backend → ${llmSwapBackend}` });
      fetchStatus();
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    }
    setLlmSwapping(false);
  };

  // ─── VRAM Diagnostic ───────────────
  const runDiagnostic = async () => {
    if (!token) return;
    setDiagLoading(true);
    try {
      const r = await vramApi.diagnostic(token);
      setDiagnostic(r);
    } catch (e: any) {
      setDiagnostic({ error: e.message });
    }
    setDiagLoading(false);
  };

  const forceCleanup = async () => {
    if (!token) return;
    setActionLoading('cleanup');
    try {
      const r = await vramApi.forceCleanup(token);
      setActionResult({ type: 'success', msg: `${t('features.cleanupDone')} (${r.actions?.length || 0} actions)` });
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    }
    setActionLoading(null);
  };

  // ─── Server Actions ────────────────
  const reinitialize = async () => {
    if (!token) return;
    setActionLoading('reinit');
    try {
      const r = await vramApi.reinitialize(token);
      setActionResult({ type: 'success', msg: r.message });
      fetchStatus();
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    }
    setActionLoading(null);
  };

  const restartServer = async () => {
    if (!token) return;
    setActionLoading('restart');
    try {
      await serverApi.restart(token);
      setActionResult({ type: 'success', msg: t('features.serverRestarting') });
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    }
    setActionLoading(null);
  };

  const shutdownServer = async () => {
    if (!token) return;
    if (!window.confirm(t('features.shutdownConfirm'))) return;
    setActionLoading('shutdown');
    try {
      await serverApi.shutdown(token);
      setActionResult({ type: 'success', msg: t('features.serverShutdown') });
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    }
    setActionLoading(null);
  };

  const savePath = async () => {
    if (!token) return;
    try {
      const r = await generateApi.setCheckpointsPath(newPath || null, token);
      setCheckpointsPath(r.path);
      setIsCustomPath(r.isCustom);
      setEditingPath(false);
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    }
  };

  const resetPath = async () => {
    if (!token) return;
    try {
      const r = await generateApi.setCheckpointsPath(null, token);
      setCheckpointsPath(r.path);
      setIsCustomPath(r.isCustom);
    } catch { /* ignore */ }
  };

  // ─── Auto-clear action result ──────
  useEffect(() => {
    if (actionResult) {
      const t = setTimeout(() => setActionResult(null), 5000);
      return () => clearTimeout(t);
    }
  }, [actionResult]);

  // ═══════════════════════════════════
  // RENDER
  // ═══════════════════════════════════
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-surface-900 flex items-center gap-2.5">
              <Settings2 className="w-5.5 h-5.5 text-accent-400" />
              {t('features.title')}
            </h1>
            <p className="text-xs text-surface-500 mt-1">{t('features.subtitle')}</p>
          </div>
          <button
            onClick={() => { fetchStatus(); fetchQueueStats(); }}
            disabled={statusLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-800 text-surface-100 text-xs font-medium hover:bg-surface-700 active:bg-surface-600 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>

        {/* Alert */}
        {actionResult && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
            actionResult.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {actionResult.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {actionResult.msg}
          </div>
        )}

        {/* ──────────────── 1. BACKEND STATUS ──────────────── */}
        <Section title={t('features.backendStatus')} icon={Activity}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Server Health */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <Server className="w-4 h-4 text-surface-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-surface-500">{t('features.expressServer')}</div>
                <div className="text-sm font-medium text-surface-800">
                  {serverOnline === null ? t('common.loading') : serverOnline ? t('features.online') : t('features.offline')}
                </div>
              </div>
              <StatusDot status={serverOnline === null ? 'loading' : serverOnline ? 'online' : 'offline'} />
            </div>

            {/* DiT Model */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <Cpu className="w-4 h-4 text-surface-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-surface-500">{t('features.ditModel')}</div>
                <div className="text-sm font-medium text-surface-800 truncate">
                  {backendStatus?.dit.loaded
                    ? `${backendStatus.dit.model || 'Unknown'}${backendStatus.dit.is_turbo ? ' (Turbo)' : ''}`
                    : t('settings.notLoaded')}
                </div>
              </div>
              <StatusDot status={statusLoading ? 'loading' : backendStatus?.dit.loaded ? 'online' : 'offline'} />
            </div>

            {/* LLM Model */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <Zap className="w-4 h-4 text-surface-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-surface-500">{t('features.llmModel')}</div>
                <div className="text-sm font-medium text-surface-800 truncate">
                  {backendStatus?.llm.loaded
                    ? `${backendStatus.llm.model || 'Unknown'} (${backendStatus.llm.backend || 'pt'})`
                    : t('settings.notLoaded')}
                </div>
              </div>
              <StatusDot status={statusLoading ? 'loading' : backendStatus?.llm.loaded ? 'online' : 'offline'} />
            </div>
          </div>

          {/* LLM Backend Switcher */}
          {backendStatus?.llm.loaded && (
            <div className="flex items-center gap-3 mt-3 px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1">
                <div className="text-sm font-medium text-surface-800">{t('features.llmBackend')}</div>
                <div className="text-xs text-surface-500">{t('features.llmBackendDesc')}</div>
              </div>
              <select
                value={llmSwapBackend}
                onChange={e => setLlmSwapBackend(e.target.value)}
                className="bg-surface-200/60 text-sm text-surface-800 rounded-lg px-3 py-1.5 border border-surface-300/40 outline-none focus:ring-1 focus:ring-accent-500/50"
              >
                <option value="pt">PyTorch</option>
                <option value="vllm">vLLM</option>
              </select>
              <button
                onClick={swapLlmBackend}
                disabled={llmSwapping || llmSwapBackend === backendStatus.llm.backend}
                className="px-3.5 py-1.5 rounded-lg bg-surface-800 text-surface-100 text-xs font-medium hover:bg-surface-700 active:bg-surface-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {llmSwapping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('features.apply')}
              </button>
            </div>
          )}
        </Section>

        {/* ──────────────── 2. QUEUE STATISTICS ──────────────── */}
        <Section title={t('features.queueStats')} icon={BarChart3} defaultOpen={false}>
          {queueStats ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40 text-center">
                  <div className="text-lg font-bold text-surface-800">{queueStats.jobs.total}</div>
                  <div className="text-[11px] text-surface-500">{t('features.totalJobs')}</div>
                </div>
                <div className="px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40 text-center">
                  <div className="text-lg font-bold text-yellow-400">{queueStats.jobs.queued + queueStats.jobs.running}</div>
                  <div className="text-[11px] text-surface-500">{t('features.activeJobs')}</div>
                </div>
                <div className="px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40 text-center">
                  <div className="text-lg font-bold text-emerald-400">{queueStats.jobs.succeeded}</div>
                  <div className="text-[11px] text-surface-500">{t('features.succeededJobs')}</div>
                </div>
                <div className="px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40 text-center">
                  <div className="text-lg font-bold text-red-400">{queueStats.jobs.failed}</div>
                  <div className="text-[11px] text-surface-500">{t('features.failedJobs')}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-3.5 h-3.5 text-surface-500" />
                  <span className="text-xs text-surface-500">{t('features.queueCapacity')}</span>
                  <span className="text-sm font-medium text-surface-800">{queueStats.queue_size} / {queueStats.queue_maxsize}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-surface-500" />
                  <span className="text-xs text-surface-500">{t('features.avgTime')}</span>
                  <span className="text-sm font-medium text-surface-800">{queueStats.avg_job_seconds.toFixed(1)}s</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-surface-500 px-4 py-3">{t('features.queueOffline')}</div>
          )}
        </Section>

        {/* ──────────────── 3. EXPERIMENTAL GENERATION ──────────────── */}
        <Section title={t('features.experimentalParams')} icon={FlaskConical}>
          <p className="text-xs text-surface-500 mb-3">{t('features.experimentalDesc')}</p>
          <div className="space-y-2.5">
            {/* use_tiled_decode */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.tiledDecode')}</div>
                <div className="text-xs text-surface-500">{t('features.tiledDecodeDesc')}</div>
              </div>
              <Toggle checked={experimental.use_tiled_decode} onChange={v => updateExperimental('use_tiled_decode', v)} />
            </div>

            {/* constrained_decoding */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.constrainedDecoding')}</div>
                <div className="text-xs text-surface-500">{t('features.constrainedDecodingDesc')}</div>
              </div>
              <Toggle checked={experimental.constrained_decoding} onChange={v => updateExperimental('constrained_decoding', v)} />
            </div>

            {/* sample_mode */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.sampleMode')}</div>
                <div className="text-xs text-surface-500">{t('features.sampleModeDesc')}</div>
              </div>
              <Toggle checked={experimental.sample_mode} onChange={v => updateExperimental('sample_mode', v)} />
            </div>

            {/* use_format */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.useFormat')}</div>
                <div className="text-xs text-surface-500">{t('features.useFormatDesc')}</div>
              </div>
              <Toggle checked={experimental.use_format} onChange={v => updateExperimental('use_format', v)} />
            </div>
          </div>
        </Section>

        {/* ──────────────── 4. MODEL CONFIGURATION ──────────────── */}
        <Section title={t('features.modelConfig')} icon={Gauge}>
          <p className="text-xs text-surface-500 mb-3">{t('features.modelConfigDesc')}</p>
          <div className="space-y-2.5">
            {/* device */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.device')}</div>
                <div className="text-xs text-surface-500">{t('features.deviceDesc')}</div>
              </div>
              <select
                value={modelInit.device}
                onChange={e => updateModelInit('device', e.target.value)}
                className="bg-surface-200/60 text-sm text-surface-800 rounded-lg px-3 py-1.5 border border-surface-300/40 outline-none focus:ring-1 focus:ring-accent-500/50"
              >
                <option value="auto">Auto</option>
                <option value="cuda">CUDA (NVIDIA)</option>
                <option value="cpu">CPU</option>
                <option value="mps">MPS (Apple Silicon)</option>
                <option value="xpu">XPU (Intel)</option>
              </select>
            </div>

            {/* use_flash_attention */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.flashAttention')}</div>
                <div className="text-xs text-surface-500">{t('features.flashAttentionDesc')}</div>
              </div>
              <Toggle checked={modelInit.use_flash_attention} onChange={v => updateModelInit('use_flash_attention', v)} />
            </div>

            {/* compile_model */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.compileModel')}</div>
                <div className="text-xs text-surface-500">{t('features.compileModelDesc')}</div>
              </div>
              <Toggle checked={modelInit.compile_model} onChange={v => updateModelInit('compile_model', v)} />
            </div>

            {/* quantization */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.quantization')}</div>
                <div className="text-xs text-surface-500">{t('features.quantizationDesc')}</div>
              </div>
              <select
                value={modelInit.quantization}
                onChange={e => updateModelInit('quantization', e.target.value)}
                className="bg-surface-200/60 text-sm text-surface-800 rounded-lg px-3 py-1.5 border border-surface-300/40 outline-none focus:ring-1 focus:ring-accent-500/50"
              >
                <option value="none">{t('features.quantNone')}</option>
                <option value="int8_weight_only">INT8 Weight Only</option>
                <option value="fp8_weight_only">FP8 Weight Only</option>
                <option value="w8a8_dynamic">W8A8 Dynamic</option>
              </select>
            </div>

            {/* offload_to_cpu */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.offloadCpu')}</div>
                <div className="text-xs text-surface-500">{t('features.offloadCpuDesc')}</div>
              </div>
              <Toggle checked={modelInit.offload_to_cpu} onChange={v => updateModelInit('offload_to_cpu', v)} />
            </div>

            {/* offload_dit_to_cpu */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-100/60 border border-surface-200/40">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-surface-800">{t('features.offloadDitCpu')}</div>
                <div className="text-xs text-surface-500">{t('features.offloadDitCpuDesc')}</div>
              </div>
              <Toggle checked={modelInit.offload_dit_to_cpu} onChange={v => updateModelInit('offload_dit_to_cpu', v)} />
            </div>
          </div>
        </Section>

        {/* ──────────────── 5. CHECKPOINTS PATH ──────────────── */}
        <Section title={t('features.checkpointsManagement')} icon={FolderOpen}>
          <div className="px-4 py-3 rounded-lg bg-surface-100/60 border border-surface-200/40">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-surface-500">{t('features.currentPath')}</div>
              {isCustomPath && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 border border-accent-500/20">
                  {t('checkpoints.custom')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-surface-800 bg-surface-200/40 px-3 py-1.5 rounded-lg font-mono truncate">
                {checkpointsPath || '...'}
              </code>
              {!checkpointsExists && (
                <span title={t('checkpoints.dirMissing')}>
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                </span>
              )}
            </div>

            {editingPath ? (
              <div className="flex items-center gap-2 mt-3">
                <input
                  value={newPath}
                  onChange={e => setNewPath(e.target.value)}
                  placeholder={t('checkpoints.pathLabel')}
                  className="flex-1 text-sm bg-surface-200/60 text-surface-800 rounded-lg px-3 py-1.5 border border-surface-300/40 outline-none focus:ring-1 focus:ring-accent-500/50"
                />
                <button onClick={savePath} className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 transition-colors">
                  {t('common.save')}
                </button>
                <button onClick={() => setEditingPath(false)} className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-surface-800 text-surface-100 hover:bg-surface-700 active:bg-surface-600 transition-colors">
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => { setNewPath(checkpointsPath); setEditingPath(true); }}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-surface-800 text-surface-100 hover:bg-surface-700 active:bg-surface-600 transition-colors"
                >
                  {t('checkpoints.changePath')}
                </button>
                {isCustomPath && (
                  <button onClick={resetPath} className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-surface-800 text-surface-100 hover:bg-surface-700 active:bg-surface-600 transition-colors">
                    {t('checkpoints.resetPath')}
                  </button>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* ──────────────── 6. VRAM DIAGNOSTICS ──────────────── */}
        <Section title={t('features.vramDiagnostics')} icon={MemoryStick} defaultOpen={false}>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={runDiagnostic}
              disabled={diagLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-800 text-surface-100 text-xs font-medium hover:bg-surface-700 active:bg-surface-600 transition-colors disabled:opacity-50"
            >
              {diagLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {t('features.runDiagnostic')}
            </button>
            <button
              onClick={forceCleanup}
              disabled={actionLoading === 'cleanup'}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-800 text-orange-400 text-xs font-medium hover:bg-surface-700 active:bg-surface-600 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'cleanup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
              {t('vram.forceCleanup')}
            </button>
          </div>

          {diagnostic && (
            <div className="rounded-lg bg-surface-200/40 border border-surface-300/30 overflow-hidden">
              <div className="px-4 py-2 border-b border-surface-300/30 flex items-center justify-between">
                <span className="text-xs font-medium text-surface-600">{t('features.diagnosticResults')}</span>
                <button onClick={() => setDiagnostic(null)} className="text-xs text-surface-500 hover:text-surface-800 transition-colors">
                  {t('common.close')}
                </button>
              </div>
              <pre className="p-4 text-xs text-surface-700 overflow-x-auto max-h-80 font-mono leading-relaxed">
                {JSON.stringify(diagnostic, null, 2)}
              </pre>
            </div>
          )}
        </Section>

        {/* ──────────────── 7. SERVER CONTROL ──────────────── */}
        <Section title={t('features.serverControl')} icon={Shield} defaultOpen={false}>
          <p className="text-xs text-surface-500 mb-3">{t('features.serverControlDesc')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Reinitialize */}
            <button
              onClick={reinitialize}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-800 text-yellow-400 text-sm font-medium hover:bg-surface-700 active:bg-surface-600 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'reinit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {t('vram.reinitialize')}
            </button>
            <span className="text-[10px] text-surface-500">{t('vram.reinitWarn')}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-surface-200/40">
            {/* Restart */}
            <button
              onClick={restartServer}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-800 text-blue-400 text-sm font-medium hover:bg-surface-700 active:bg-surface-600 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'restart' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t('features.restartServer')}
            </button>

            {/* Shutdown */}
            <button
              onClick={shutdownServer}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-800 text-red-400 text-sm font-medium hover:bg-surface-700 active:bg-surface-600 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'shutdown' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              {t('features.shutdownServer')}
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
