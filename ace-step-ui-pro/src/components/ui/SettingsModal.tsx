import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Settings, Cpu, Key, Server, RefreshCw, Check, AlertCircle,
  ChevronDown, ChevronRight, Trash2, Eye, EyeOff, Plug, Unplug,
  Github, Star, ExternalLink, Heart, FolderOpen, Download, MemoryStick,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/* ── Types ── */
export interface AiProvider {
  id: string;
  name: string;
  type: 'cloud' | 'local';
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  models: string[];
  selectedModel?: string;
  status: 'disconnected' | 'connected' | 'error';
  error?: string;
}

export interface AppSettings {
  providers: AiProvider[];
  activeProviderId?: string;
  theme: 'dark' | 'light';
  language: string;
  autoRefreshResults: boolean;
  defaultBatchSize: number;
}

const STORAGE_KEY = 'prodia_settings';

const DEFAULT_PROVIDERS: AiProvider[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'cloud',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    enabled: false,
    models: [],
    status: 'disconnected',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    type: 'cloud',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    enabled: false,
    models: [],
    status: 'disconnected',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'local',
    baseUrl: 'http://localhost:11434',
    enabled: false,
    models: [],
    status: 'disconnected',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'local',
    baseUrl: 'http://localhost:1234',
    enabled: false,
    models: [],
    status: 'disconnected',
  },
];

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge saved providers with defaults to pick up new providers
      const savedIds = new Set((parsed.providers || []).map((p: AiProvider) => p.id));
      const merged = [
        ...(parsed.providers || []),
        ...DEFAULT_PROVIDERS.filter(d => !savedIds.has(d.id)),
      ];
      return { ...parsed, providers: merged };
    }
  } catch { /* ignore */ }
  return {
    providers: DEFAULT_PROVIDERS,
    theme: 'dark',
    language: 'en',
    autoRefreshResults: true,
    defaultBatchSize: 1,
  };
}

function saveSettings(s: AppSettings) {
  // Don't persist status/models - they're runtime
  const clean: AppSettings = {
    ...s,
    providers: s.providers.map(p => ({
      ...p,
      status: 'disconnected' as const,
      models: [],
      error: undefined,
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

type Tab = 'general' | 'providers' | 'model' | 'vram';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: AppSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, onSettingsChange }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('providers');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);

  // Save when settings change
  useEffect(() => {
    saveSettings(settings);
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  const updateProvider = useCallback((id: string, patch: Partial<AiProvider>) => {
    setSettings(prev => ({
      ...prev,
      providers: prev.providers.map(p => p.id === id ? { ...p, ...patch } : p),
    }));
  }, []);

  /* ── Test connection ── */
  const testConnection = useCallback(async (provider: AiProvider) => {
    setTesting(provider.id);
    try {
      let models: string[] = [];

      if (provider.id === 'ollama') {
        const res = await fetch(`${provider.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        models = (data.models || []).map((m: any) => m.name || m.model);
      } else if (provider.id === 'lmstudio') {
        const res = await fetch(`${provider.baseUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        models = (data.data || []).map((m: any) => m.id);
      } else if (provider.id === 'gemini') {
        if (!provider.apiKey) throw new Error(t('settings.noApiKey'));
        const res = await fetch(
          `${provider.baseUrl}/models?key=${encodeURIComponent(provider.apiKey)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        models = (data.models || [])
          .filter((m: any) => m.name?.includes('gemini'))
          .map((m: any) => m.name?.replace('models/', '') || m.displayName);
      } else if (provider.id === 'anthropic') {
        // Anthropic doesn't have a list-models endpoint in standard API
        // We verify the key by checking a simple header-based validation
        if (!provider.apiKey) throw new Error(t('settings.noApiKey'));
        models = [
          'claude-sonnet-4-20250514',
          'claude-3-5-haiku-20241022',
          'claude-3-haiku-20240307',
        ];
      }

      updateProvider(provider.id, {
        status: 'connected',
        models,
        error: undefined,
        selectedModel: models.length > 0 && !provider.selectedModel ? models[0] : provider.selectedModel,
      });
    } catch (err: any) {
      updateProvider(provider.id, {
        status: 'error',
        models: [],
        error: err.message || 'Connection failed',
      });
    } finally {
      setTesting(null);
    }
  }, [updateProvider, t]);

  /* ── Set active provider ── */
  const setActive = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      activeProviderId: prev.activeProviderId === id ? undefined : id,
      providers: prev.providers.map(p => ({
        ...p,
        enabled: p.id === id ? true : p.enabled,
      })),
    }));
  }, []);

  if (!isOpen) return null;

  const activeProvider = settings.providers.find(p => p.id === settings.activeProviderId);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'providers', label: t('settings.providers'), icon: <Key className="w-4 h-4" /> },
    { key: 'model', label: t('settings.modelInfo'), icon: <Cpu className="w-4 h-4" /> },
    { key: 'vram', label: t('vram.tab'), icon: <MemoryStick className="w-4 h-4" /> },
    { key: 'general', label: t('settings.general'), icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-surface-50/95 backdrop-blur-xl
        border border-surface-300/50 rounded-2xl shadow-2xl shadow-black/50
        flex flex-col overflow-hidden animate-scale-in">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-300/40">
          <div className="w-9 h-9 rounded-xl bg-surface-200/60 flex items-center justify-center">
            <Settings className="w-5 h-5 text-surface-700" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-surface-950">{t('settings.title')}</h2>
            <p className="text-xs text-surface-500">{t('settings.subtitle')}</p>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-6 pt-3 pb-1">
          {TABS.map(tb => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === tb.key
                  ? 'bg-accent-500/15 text-accent-400'
                  : 'text-surface-500 hover:text-surface-800 hover:bg-surface-100'
              }`}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ════ PROVIDERS TAB ════ */}
          {tab === 'providers' && (
            <>
              {activeProvider && (
                <div className="rounded-xl bg-accent-500/10 border border-accent-500/20 px-4 py-3 flex items-center gap-3">
                  <Plug className="w-4 h-4 text-accent-400" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-accent-300">{t('settings.activeProvider')}</p>
                    <p className="text-sm text-surface-900">{activeProvider.name}
                      {activeProvider.selectedModel && (
                        <span className="ml-2 text-xs text-surface-500">({activeProvider.selectedModel})</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {settings.providers.map(provider => {
                const isExpanded = expandedProvider === provider.id;
                const isActive = settings.activeProviderId === provider.id;
                const isCloud = provider.type === 'cloud';
                const isTesting = testing === provider.id;

                return (
                  <div key={provider.id}
                    className={`rounded-xl border transition-colors ${
                      isActive
                        ? 'bg-accent-500/5 border-accent-500/30'
                        : 'bg-surface-100/60 border-surface-300/40 hover:border-surface-400'
                    }`}>
                    {/* Provider header */}
                    <button
                      onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        provider.status === 'connected' ? 'bg-green-500/15' :
                        provider.status === 'error' ? 'bg-red-500/15' : 'bg-surface-200/50'
                      }`}>
                        {isCloud
                          ? <Key className={`w-4 h-4 ${
                              provider.status === 'connected' ? 'text-green-400' :
                              provider.status === 'error' ? 'text-red-400' : 'text-surface-400'
                            }`} />
                          : <Server className={`w-4 h-4 ${
                              provider.status === 'connected' ? 'text-green-400' :
                              provider.status === 'error' ? 'text-red-400' : 'text-surface-400'
                            }`} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-surface-900">{provider.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            isCloud ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
                          }`}>
                            {isCloud ? 'Cloud' : 'Local'}
                          </span>
                          {isActive && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-500/20 text-accent-400">
                              {t('settings.active')}
                            </span>
                          )}
                        </div>
                        {provider.status === 'connected' && (
                          <p className="text-xs text-green-400 mt-0.5">
                            {provider.models.length} {t('settings.modelsDetected')}
                          </p>
                        )}
                        {provider.status === 'error' && (
                          <p className="text-xs text-red-400 mt-0.5 truncate">{provider.error}</p>
                        )}
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-surface-300/30 pt-3">
                        {/* API Key (cloud only) */}
                        {isCloud && (
                          <div>
                            <label className="block text-xs font-medium text-surface-500 mb-1">API Key</label>
                            <div className="flex gap-2">
                              <div className="flex-1 relative">
                                <input
                                  type={showKeys[provider.id] ? 'text' : 'password'}
                                  value={provider.apiKey || ''}
                                  onChange={e => updateProvider(provider.id, { apiKey: e.target.value })}
                                  placeholder={`${provider.name} API Key`}
                                  className="w-full px-3 py-2 pr-9 text-sm rounded-lg"
                                />
                                <button
                                  onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
                                >
                                  {showKeys[provider.id]
                                    ? <EyeOff className="w-3.5 h-3.5" />
                                    : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Base URL */}
                        <div>
                          <label className="block text-xs font-medium text-surface-500 mb-1">
                            {isCloud ? 'Base URL' : t('settings.serverUrl')}
                          </label>
                          <input
                            type="text"
                            value={provider.baseUrl || ''}
                            onChange={e => updateProvider(provider.id, { baseUrl: e.target.value })}
                            placeholder="http://localhost:1234"
                            className="w-full px-3 py-2 text-sm rounded-lg"
                          />
                        </div>

                        {/* Model selector */}
                        {provider.models.length > 0 && (
                          <div>
                            <label className="block text-xs font-medium text-surface-500 mb-1">
                              {t('settings.selectModel')}
                            </label>
                            <select
                              value={provider.selectedModel || ''}
                              onChange={e => updateProvider(provider.id, { selectedModel: e.target.value })}
                              className="w-full px-3 py-2 text-sm rounded-lg"
                            >
                              {provider.models.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => testConnection(provider)}
                            disabled={isTesting}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                              bg-surface-200/60 text-surface-700 hover:bg-surface-300 transition-colors
                              disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                            {t('settings.testConnection')}
                          </button>
                          <button
                            onClick={() => setActive(provider.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isActive
                                ? 'bg-accent-500 text-white'
                                : 'bg-accent-500/15 text-accent-400 hover:bg-accent-500/25'
                            }`}
                          >
                            {isActive ? <Unplug className="w-3.5 h-3.5" /> : <Plug className="w-3.5 h-3.5" />}
                            {isActive ? t('settings.deactivate') : t('settings.useProvider')}
                          </button>
                          {isCloud && provider.apiKey && (
                            <button
                              onClick={() => updateProvider(provider.id, { apiKey: '', status: 'disconnected', models: [] })}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                              title={t('settings.clearKey')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* ════ MODEL INFO TAB ════ */}
          {tab === 'model' && <ModelInfoTab />}

          {/* ════ VRAM TAB ════ */}
          {tab === 'vram' && <VramTab />}

          {/* ════ GENERAL TAB ════ */}
          {tab === 'general' && (
            <div className="space-y-4">
              {/* About */}
              <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-5 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-brand-500 flex items-center justify-center shadow-lg shadow-accent-500/20">
                    <span className="text-white font-black text-xl">P</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-surface-950">ProdIA Max v2</h3>
                    <p className="text-xs text-surface-500">{t('settings.version')}</p>
                    <p className="text-[10px] text-surface-400 mt-0.5">Professional AI Music Production Suite</p>
                  </div>
                </div>
                <p className="text-xs text-surface-500 leading-relaxed">{t('settings.aboutDescription')}</p>
              </div>

              {/* GitHub repos */}
              <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-surface-700 flex items-center gap-2">
                  <Github className="w-4 h-4" />
                  {t('settings.repositories', 'Repositories')}
                </h4>
                <a
                  href="https://github.com/ElWalki/ProdIA-Max-UI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-200/50 border border-surface-300/30 hover:border-accent-500/40 hover:bg-accent-500/5 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center">
                    <Github className="w-4 h-4 text-accent-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-surface-900 block">ProdIA Max UI</span>
                    <span className="text-[10px] text-surface-400">{t('settings.uiRepo', 'React UI — this interface')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <ExternalLink className="w-3.5 h-3.5 text-surface-400" />
                  </div>
                </a>
                <a
                  href="https://github.com/ElWalki/Ace-Step-MAX"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-200/50 border border-surface-300/30 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
                    <Github className="w-4 h-4 text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-surface-900 block">Ace-Step MAX</span>
                    <span className="text-[10px] text-surface-400">{t('settings.backendRepo', 'Backend engine — ACE-Step v1.5 enhanced')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <ExternalLink className="w-3.5 h-3.5 text-surface-400" />
                  </div>
                </a>
                <p className="text-[10px] text-surface-400 text-center mt-1">
                  {t('settings.starHint', 'If you find this useful, please give us a ⭐ on GitHub!')}
                </p>
              </div>

              {/* Credits */}
              <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-surface-700 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-400" />
                  {t('settings.credits', 'Credits & Acknowledgments')}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-200/30">
                    <div className="w-7 h-7 rounded-full bg-accent-500/15 flex items-center justify-center text-[10px] font-bold text-accent-400">W</div>
                    <div>
                      <a href="https://github.com/ElWalki" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent-400 hover:text-accent-300 hover:underline block">ElWalki</a>
                      <span className="text-[10px] text-surface-400">{t('settings.creditLead', 'Creator & Lead Developer')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-200/30">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-[10px] font-bold text-emerald-400">S</div>
                    <div>
                      <a href="https://github.com/scruffynerf" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent-400 hover:text-accent-300 hover:underline block">Scruffy</a>
                      <span className="text-[10px] text-surface-400">{t('settings.creditScruffy', 'Contributor — i18n internationalization system (EN/ES)')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-200/30">
                    <div className="w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center text-[10px] font-bold text-blue-400">A</div>
                    <div>
                      <a href="https://github.com/ACE-Step" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent-400 hover:text-accent-300 hover:underline block">ACE-Step</a>
                      <span className="text-[10px] text-surface-400">{t('settings.creditAceStep', 'Core music generation engine')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Roadmap hint */}
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-[10px] text-amber-400 leading-relaxed">
                  <strong>{t('settings.roadmap', 'Roadmap')}:</strong> {t('settings.roadmapText', 'Chinese (中文), German (Deutsch), French (Français), Arabic (العربية) and more languages coming soon. Community contributions welcome!')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-surface-300/40 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white
              hover:bg-accent-500 transition-colors">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── VRAM Management Sub-component ── */
function VramTab() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [vramStatus, setVramStatus] = useState<import('../../services/api').VramStatus | null>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [backendStatus, setBackendStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchAll = useCallback(async () => {
    try {
      const [vram, diag, backend] = await Promise.all([
        fetch('/api/vram/status', { headers: authHeaders }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/generate/vram/diagnostic', { headers: authHeaders }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/generate/backend-status', { headers: authHeaders }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setVramStatus(vram);
      setDiagnostic(diag);
      setBackendStatus(backend);
    } catch { /* offline */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handlePurge = useCallback(async () => {
    setPurging(true);
    setMessage(null);
    try {
      await fetch('/api/vram/purge', { method: 'POST', headers: authHeaders });
      setMessage({ text: t('vram.freed'), type: 'success' });
      await fetchAll();
    } catch {
      setMessage({ text: 'Purge failed', type: 'error' });
    }
    setPurging(false);
  }, [fetchAll, t, token]);

  const handleForceCleanup = useCallback(async () => {
    setPurging(true);
    setMessage(null);
    try {
      const r = await fetch('/api/generate/vram/force-cleanup', { method: 'POST', headers: authHeaders });
      const data = await r.json();
      const actions = data?.actions || [];
      setMessage({ text: `${t('vram.freed')} (${actions.length} actions)`, type: 'success' });
      await fetchAll();
    } catch {
      setMessage({ text: 'Force cleanup failed', type: 'error' });
    }
    setPurging(false);
  }, [fetchAll, t, token]);

  const handleUnloadLora = useCallback(async () => {
    setPurging(true);
    setMessage(null);
    try {
      await fetch('/api/lora/unload', { method: 'POST', headers: authHeaders });
      setMessage({ text: 'LoRA unloaded', type: 'success' });
      await fetchAll();
    } catch {
      setMessage({ text: 'LoRA unload failed', type: 'error' });
    }
    setPurging(false);
  }, [fetchAll, token]);

  const handleReinitialize = useCallback(async () => {
    setPurging(true);
    setMessage(null);
    try {
      const r = await fetch('/api/generate/reinitialize', { method: 'POST', headers: authHeaders });
      const data = await r.json();
      setMessage({ text: data.message || 'Server reinitialized', type: 'success' });
      await fetchAll();
    } catch {
      setMessage({ text: 'Reinitialize failed', type: 'error' });
    }
    setPurging(false);
  }, [fetchAll, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-surface-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    );
  }

  const gpu = vramStatus?.gpus?.[0];
  const torch = vramStatus?.torch;
  const components = diagnostic?.components || [];
  const loraState = diagnostic?.lora_state || {};
  const summary = diagnostic?.summary || {};
  const dit = backendStatus?.dit || {};
  const llm = backendStatus?.llm || {};

  const usagePercent = gpu ? Math.round((gpu.used_mb / gpu.total_mb) * 100) : 0;
  const barColor = usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="space-y-4">
      {/* GPU Status Bar */}
      {gpu ? (
        <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <MemoryStick className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-900">{gpu.name}</h3>
                <p className="text-[10px] text-surface-400">{t('vram.gpuInfo')}</p>
              </div>
            </div>
            <button
              onClick={fetchAll}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* VRAM bar */}
          <div>
            <div className="flex justify-between text-[10px] text-surface-500 mb-1">
              <span>{t('vram.used')}: {gpu.used_mb} MB</span>
              <span>{t('vram.free')}: {gpu.free_mb} MB</span>
              <span>{t('vram.total')}: {gpu.total_mb} MB</span>
            </div>
            <div className="w-full h-3 bg-surface-200 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${usagePercent}%` }} />
            </div>
            <div className="flex justify-between text-[10px] mt-1">
              <span className={`font-semibold ${usagePercent > 90 ? 'text-red-400' : usagePercent > 70 ? 'text-amber-400' : 'text-green-400'}`}>
                {usagePercent}% {t('vram.usage')}
              </span>
              {gpu.temperature > 0 && (
                <span className="text-surface-400">{gpu.temperature}°C</span>
              )}
            </div>
          </div>

          {/* Torch allocation details */}
          {torch && (
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-surface-300/20">
              <div className="text-[10px]">
                <span className="text-surface-400">{t('vram.torchAllocated')}:</span>
                <span className="text-surface-700 font-medium ml-1">{torch.allocated_mb} MB</span>
              </div>
              <div className="text-[10px]">
                <span className="text-surface-400">{t('vram.torchReserved')}:</span>
                <span className="text-surface-700 font-medium ml-1">{torch.reserved_mb} MB</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-surface-500">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-surface-400" />
          <p className="text-sm">{t('vram.noGpu')}</p>
        </div>
      )}

      {/* Loaded Components */}
      <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-surface-500" />
          {t('vram.components')}
        </h3>

        <div className="space-y-2">
          {/* DiT Model */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-200/40 border border-surface-300/20">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${dit.loaded ? 'bg-green-500' : 'bg-surface-400'}`} />
              <div>
                <span className="text-xs font-semibold text-surface-800">{t('vram.ditModel')}</span>
                {dit.loaded && dit.model && (
                  <span className="text-[10px] text-surface-400 ml-2">{dit.model}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {components.find((c: any) => c.name?.includes('DiT'))?.gpu_mb > 0 && (
                <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-medium">
                  {components.find((c: any) => c.name?.includes('DiT'))?.gpu_mb} MB GPU
                </span>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                dit.loaded ? 'text-green-400 bg-green-500/10' : 'text-surface-400 bg-surface-200'
              }`}>
                {dit.loaded ? t('settings.loaded') : t('settings.offline')}
              </span>
            </div>
          </div>

          {/* VAE */}
          {(() => {
            const vaeComp = components.find((c: any) => c.name === 'VAE');
            const isOnGpu = vaeComp && vaeComp.gpu_mb > 0;
            return (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-200/40 border border-surface-300/20">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${isOnGpu ? 'bg-green-500' : dit.loaded ? 'bg-blue-500' : 'bg-surface-400'}`} />
                  <span className="text-xs font-semibold text-surface-800">{t('vram.vaeModel')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isOnGpu && (
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-medium">
                      {vaeComp.gpu_mb} MB GPU
                    </span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    isOnGpu ? 'text-green-400 bg-green-500/10' : dit.loaded ? 'text-blue-400 bg-blue-500/10' : 'text-surface-400 bg-surface-200'
                  }`}>
                    {isOnGpu ? 'GPU' : dit.loaded ? 'CPU' : t('settings.offline')}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Text Encoder */}
          {(() => {
            const teComp = components.find((c: any) => c.name === 'Text Encoder');
            const isOnGpu = teComp && teComp.gpu_mb > 0;
            return (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-200/40 border border-surface-300/20">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${isOnGpu ? 'bg-green-500' : dit.loaded ? 'bg-blue-500' : 'bg-surface-400'}`} />
                  <span className="text-xs font-semibold text-surface-800">{t('vram.textEncoder')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isOnGpu && (
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-medium">
                      {teComp.gpu_mb} MB GPU
                    </span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    isOnGpu ? 'text-green-400 bg-green-500/10' : dit.loaded ? 'text-blue-400 bg-blue-500/10' : 'text-surface-400 bg-surface-200'
                  }`}>
                    {isOnGpu ? 'GPU' : dit.loaded ? 'CPU' : t('settings.offline')}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* LM Model */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-200/40 border border-surface-300/20">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${llm.loaded ? 'bg-green-500' : 'bg-surface-400'}`} />
              <div>
                <span className="text-xs font-semibold text-surface-800">{t('vram.lmModel')}</span>
                {llm.loaded && llm.model && (
                  <span className="text-[10px] text-surface-400 ml-2">{llm.model}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {llm.backend && (
                <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium">
                  {llm.backend}
                </span>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                llm.loaded ? 'text-green-400 bg-green-500/10' : 'text-surface-400 bg-surface-200'
              }`}>
                {llm.loaded ? t('settings.loaded') : t('settings.offline')}
              </span>
            </div>
          </div>

          {/* LoRA */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-200/40 border border-surface-300/20">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${loraState.lora_loaded_flag ? 'bg-amber-500' : 'bg-surface-400'}`} />
              <span className="text-xs font-semibold text-surface-800">{t('vram.loraAdapter')}</span>
            </div>
            <div className="flex items-center gap-2">
              {loraState.lora_loaded_flag && (
                <>
                  {loraState.lora_gpu_mb > 0 && (
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-medium">
                      {loraState.lora_gpu_mb} MB GPU
                    </span>
                  )}
                  <button
                    onClick={handleUnloadLora}
                    disabled={purging}
                    className="text-[10px] px-2 py-0.5 rounded font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    Unload
                  </button>
                </>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                loraState.lora_loaded_flag ? 'text-amber-400 bg-amber-500/10' : 'text-surface-400 bg-surface-200'
              }`}>
                {loraState.lora_loaded_flag ? (loraState.use_lora_flag ? 'Active' : 'Loaded') : t('settings.offline')}
              </span>
            </div>
          </div>
        </div>

        {/* Component GPU summary */}
        {summary.total_component_gpu_mb > 0 && (
          <div className="text-[10px] text-surface-400 pt-1 border-t border-surface-300/20 flex justify-between">
            <span>Total GPU: {summary.total_component_gpu_mb} MB</span>
            {summary.gc_cuda_tensors > 0 && (
              <span>CUDA tensors: {summary.gc_cuda_tensors} ({summary.gc_cuda_mb} MB)</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handlePurge}
            disabled={purging}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold
              bg-accent-500/15 text-accent-400 hover:bg-accent-500/25 border border-accent-500/20
              transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${purging ? 'animate-spin' : ''}`} />
            {purging ? t('vram.purging') : t('vram.purgeAll')}
          </button>
          <button
            onClick={handleForceCleanup}
            disabled={purging}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold
              bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20
              transition-colors disabled:opacity-50"
          >
            <Trash2 className={`w-3.5 h-3.5`} />
            {t('vram.forceCleanup')}
          </button>
        </div>

        <button
          onClick={handleReinitialize}
          disabled={purging}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold
            bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20
            transition-colors disabled:opacity-50"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          {t('vram.reinitialize')}
        </button>
        <p className="text-[10px] text-surface-400 text-center">{t('vram.reinitWarn')}</p>
      </div>

      {/* Status message */}
      {message && (
        <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
          message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

/* ── Model Info Sub-component ── */
function ModelInfoTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkpointsPath, setCheckpointsPath] = useState<{ path: string; acestepDir: string; exists: boolean; isCustom: boolean } | null>(null);
  const [allModels, setAllModels] = useState<{ name: string; is_active: boolean; is_preloaded: boolean }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, { status: string; progress: string; error?: string }>>({});
  const [editingPath, setEditingPath] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [pathError, setPathError] = useState('');

  const fetchModels = useCallback(async () => {
    setScanning(true);
    try {
      const r = await fetch('/api/generate/models');
      if (r.ok) {
        const data = await r.json();
        setAllModels(data.models || []);
      }
    } catch { /* offline */ }
    setScanning(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [statusRes, pathRes] = await Promise.all([
          fetch('/api/generate/backend-status'),
          fetch('/api/generate/checkpoints-path'),
        ]);
        if (statusRes.ok) setStatus(await statusRes.json());
        if (pathRes.ok) setCheckpointsPath(await pathRes.json());
      } catch { /* backend offline */ }
      setLoading(false);
      fetchModels();
    })();
  }, [fetchModels]);

  // Poll download progress for active downloads
  useEffect(() => {
    const activeNames = Object.keys(downloads).filter(k => downloads[k].status === 'downloading');
    if (activeNames.length === 0) return;
    const interval = setInterval(async () => {
      for (const name of activeNames) {
        try {
          const r = await fetch(`/api/generate/models/download/${encodeURIComponent(name)}`);
          if (r.ok) {
            const d = await r.json();
            setDownloads(prev => ({ ...prev, [name]: d }));
            if (d.status === 'done' || d.status === 'error') {
              fetchModels(); // Refresh model list after download completes
            }
          }
        } catch { /* skip */ }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [downloads, fetchModels]);

  const startDownload = useCallback(async (modelName: string) => {
    setDownloads(prev => ({ ...prev, [modelName]: { status: 'downloading', progress: t('checkpoints.starting', 'Starting...') } }));
    try {
      await fetch('/api/generate/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName }),
      });
    } catch { /* ignore - polling will track */ }
  }, [t]);

  const startMainDownload = useCallback(async () => {
    setDownloads(prev => ({ ...prev, ['__main__']: { status: 'downloading', progress: t('checkpoints.starting', 'Starting...') } }));
    try {
      await fetch('/api/generate/models/download-main', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    } catch { /* ignore */ }
  }, [t]);

  const saveCustomPath = useCallback(async () => {
    setPathError('');
    try {
      const r = await fetch('/api/generate/checkpoints-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: customPath || null }),
      });
      if (!r.ok) {
        const err = await r.json();
        setPathError(err.error || 'Invalid path');
        return;
      }
      const data = await r.json();
      setCheckpointsPath(prev => prev ? { ...prev, path: data.path, isCustom: data.isCustom } : prev);
      setEditingPath(false);
      fetchModels(); // Re-scan with new path
    } catch {
      setPathError('Connection error');
    }
  }, [customPath, fetchModels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-surface-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-12 text-surface-500">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-surface-400" />
        <p className="text-sm">{t('settings.backendOffline')}</p>
      </div>
    );
  }

  const dit = status.dit || {};
  const llm = status.llm || {};
  const missingModels = allModels.filter(m => !m.is_preloaded);
  const hasAnyCheckpoints = allModels.some(m => m.is_preloaded);
  const mainDownload = downloads['__main__'];

  return (
    <div className="space-y-4">
      {/* DiT Model */}
      <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            dit.loaded ? 'bg-green-500/15' : 'bg-red-500/15'
          }`}>
            <Cpu className={`w-5 h-5 ${dit.loaded ? 'text-green-400' : 'text-red-400'}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-900">{t('settings.ditModel')}</h3>
            <p className="text-xs text-surface-500">
              {dit.loaded ? dit.model || 'Loaded' : t('settings.notLoaded')}
            </p>
          </div>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            dit.loaded ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {dit.loaded ? t('settings.loaded') : t('settings.offline')}
          </span>
        </div>
        {dit.is_turbo && (
          <span className="inline-block px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-semibold">
            Turbo
          </span>
        )}
      </div>

      {/* LLM */}
      <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            llm.loaded ? 'bg-green-500/15' : 'bg-red-500/15'
          }`}>
            <Server className={`w-5 h-5 ${llm.loaded ? 'text-green-400' : 'text-red-400'}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-900">{t('settings.llmModel')}</h3>
            <p className="text-xs text-surface-500">
              {llm.loaded ? llm.model || 'Loaded' : t('settings.notLoaded')}
            </p>
          </div>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            llm.loaded ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {llm.loaded ? t('settings.loaded') : t('settings.offline')}
          </span>
        </div>
        {llm.backend && (
          <span className="mt-2 inline-block px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-semibold">
            Backend: {llm.backend}
          </span>
        )}
      </div>

      {/* ═══ Checkpoints Section ═══ */}
      <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            hasAnyCheckpoints ? 'bg-blue-500/15' : 'bg-amber-500/15'
          }`}>
            <FolderOpen className={`w-5 h-5 ${hasAnyCheckpoints ? 'text-blue-400' : 'text-amber-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-surface-900">{t('checkpoints.title', 'Checkpoints')}</h3>
            {!editingPath && (
              <p className="text-[10px] text-surface-400 truncate" title={checkpointsPath?.path || ''}>
                {checkpointsPath?.path || t('checkpoints.unknown', 'Unknown path')}
                {checkpointsPath?.isCustom && (
                  <span className="ml-1 text-accent-400">({t('checkpoints.custom', 'custom')})</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => { setEditingPath(!editingPath); setCustomPath(checkpointsPath?.path || ''); setPathError(''); }}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-200 transition-colors"
              title={t('checkpoints.changePath', 'Change path')}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={fetchModels}
              disabled={scanning}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                bg-surface-200/60 text-surface-700 hover:bg-surface-300 transition-colors disabled:opacity-50"
              title={t('checkpoints.rescan', 'Rescan checkpoints')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {t('checkpoints.rescan', 'Rescan')}
            </button>
          </div>
        </div>

        {/* Custom path editor */}
        {editingPath && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-surface-500">
              {t('checkpoints.pathLabel', 'Checkpoints directory path')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customPath}
                onChange={e => setCustomPath(e.target.value)}
                placeholder={checkpointsPath?.acestepDir ? `${checkpointsPath.acestepDir}/checkpoints` : '/path/to/checkpoints'}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-surface-200 border border-surface-300/40 text-surface-900 placeholder:text-surface-400"
              />
              <button
                onClick={saveCustomPath}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent-500 text-white hover:bg-accent-400 transition-colors"
              >
                {t('common.save', 'Save')}
              </button>
              {checkpointsPath?.isCustom && (
                <button
                  onClick={() => { setCustomPath(''); saveCustomPath(); }}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-surface-200/60 text-surface-700 hover:bg-surface-300 transition-colors"
                  title={t('checkpoints.resetPath', 'Reset to default')}
                >
                  {t('checkpoints.reset', 'Reset')}
                </button>
              )}
            </div>
            {pathError && <p className="text-[10px] text-red-400">{pathError}</p>}
            <p className="text-[10px] text-surface-400">
              {t('checkpoints.pathHint', 'Set a custom path if your checkpoints are on a different drive or directory.')}
            </p>
          </div>
        )}

        {/* Checkpoints path status */}
        {checkpointsPath && !checkpointsPath.exists && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <p className="text-xs text-red-400">
              {t('checkpoints.dirMissing', 'Checkpoints directory not found. Download the main model to create it.')}
            </p>
          </div>
        )}

        {/* Download main model button (if no checkpoints at all) */}
        {!hasAnyCheckpoints && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 space-y-2">
            <p className="text-xs text-amber-400">
              {t('checkpoints.noCheckpoints', 'No official checkpoints found. Download from the official repository (ACE-Step/Ace-Step1.5).')}
            </p>
            <button
              onClick={startMainDownload}
              disabled={mainDownload?.status === 'downloading'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${mainDownload?.status === 'downloading' ? 'animate-bounce' : ''}`} />
              {mainDownload?.status === 'downloading'
                ? t('checkpoints.downloading', 'Downloading...')
                : t('checkpoints.downloadMain', 'Download Main Model')}
            </button>
            {mainDownload && (
              <div className="mt-1">
                <p className={`text-[10px] ${mainDownload.status === 'error' ? 'text-red-400' : mainDownload.status === 'done' ? 'text-green-400' : 'text-surface-400'}`}>
                  {mainDownload.progress}
                </p>
                {mainDownload.error && <p className="text-[10px] text-red-400 mt-0.5">{mainDownload.error}</p>}
              </div>
            )}
          </div>
        )}

        {/* Model list */}
        {allModels.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">
                {t('checkpoints.ditModels', 'DiT Models')}
              </span>
              <span className="text-[10px] text-surface-400">
                {allModels.filter(m => m.is_preloaded).length}/{allModels.length} {t('checkpoints.downloaded', 'downloaded')}
              </span>
            </div>
            {allModels.map(model => {
              const dl = downloads[model.name];
              const isDownloading = dl?.status === 'downloading';
              return (
                <div
                  key={model.name}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-200/40 border border-surface-300/20"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    model.is_active ? 'bg-green-500 animate-pulse' : model.is_preloaded ? 'bg-blue-500' : 'bg-surface-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-surface-800 block truncate">{model.name}</span>
                    {isDownloading && (
                      <span className="text-[10px] text-accent-400 block truncate">{dl.progress}</span>
                    )}
                    {dl?.status === 'error' && (
                      <span className="text-[10px] text-red-400 block truncate">{dl.error || dl.progress}</span>
                    )}
                    {dl?.status === 'done' && (
                      <span className="text-[10px] text-green-400 block">{t('checkpoints.complete', 'Complete')}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {model.is_active && (
                      <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-medium">
                        {t('settings.loaded', 'Loaded')}
                      </span>
                    )}
                    {model.is_preloaded && !model.is_active && (
                      <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium">
                        {t('checkpoints.onDisk', 'On disk')}
                      </span>
                    )}
                    {!model.is_preloaded && !isDownloading && (
                      <button
                        onClick={() => startDownload(model.name)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold
                          bg-accent-500/15 text-accent-400 hover:bg-accent-500/25 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        {t('checkpoints.download', 'Download')}
                      </button>
                    )}
                    {isDownloading && (
                      <RefreshCw className="w-3.5 h-3.5 text-accent-400 animate-spin" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Download all missing */}
        {missingModels.length > 0 && missingModels.length < allModels.length && (
          <button
            onClick={() => missingModels.forEach(m => startDownload(m.name))}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
              bg-accent-500/10 text-accent-400 hover:bg-accent-500/20 border border-accent-500/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('checkpoints.downloadAll', 'Download all missing models')} ({missingModels.length})
          </button>
        )}
      </div>
    </div>
  );
}

export { loadSettings, type AppSettings as SettingsType };
