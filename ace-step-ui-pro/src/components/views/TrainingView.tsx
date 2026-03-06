import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Upload, Trash2, ToggleLeft, ToggleRight, Sliders, FolderOpen, RefreshCw, Footprints, Rocket } from 'lucide-react';
import { generateApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface LoraInfo {
  name: string;
  path: string;
  loaded: boolean;
  scale: number;
}

type TrainingTab = 'lora' | 'sidestep';

export default function TrainingView() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [tab, setTab] = useState<TrainingTab>('lora');
  const [loras, setLoras] = useState<LoraInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await generateApi.listLoras(token);
      if (res.loras) {
        setLoras(res.loras.map((l: any) => ({
          name: l.name || l.path?.split('/').pop() || 'Unknown',
          path: l.path || '',
          loaded: !!l.loaded,
          scale: l.scale ?? 1.0,
        })));
      }
      const st = await generateApi.getLoraStatus(token);
      setStatus(st.loaded ? `${st.name} (scale: ${st.scale})` : '');
    } catch (e: any) {
      showMessage(t('training.apiError') + ': ' + (e.message || 'Connection failed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleLoad = async (path: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await generateApi.loadLora({ lora_path: path }, token);
      showMessage(res.message || t('training.loraLoaded'), 'success');
      await refresh();
    } catch (e: any) {
      showMessage(t('training.loadFailed') + ': ' + (e.message || 'Unknown error'), 'error');
      setLoading(false);
    }
  };

  const handleUnload = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await generateApi.unloadLora(token);
      showMessage(t('training.loraUnloaded'), 'success');
      await refresh();
    } catch (e: any) {
      showMessage(t('training.unloadFailed') + ': ' + (e.message || 'Unknown error'), 'error');
      setLoading(false);
    }
  };

  const handleScaleChange = async (scale: number) => {
    if (!token) return;
    try {
      await generateApi.setLoraScale({ scale }, token);
      await refresh();
    } catch (e: any) {
      showMessage(t('training.scaleFailed') + ': ' + (e.message || 'Unknown error'), 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-surface-950">{t('nav.training')}</h1>
          {tab === 'lora' && (
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100
                border border-surface-300 text-surface-700 hover:text-surface-900
                text-xs font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
          )}
        </div>
        <p className="text-sm text-surface-400 mt-1">{t('training.description')}</p>

        {/* Status message */}
        {message && (
          <div className={`mt-3 px-4 py-2 rounded-lg text-xs font-medium animate-slide-up ${
            message.type === 'success'
              ? 'bg-green-500/15 text-green-400 border border-green-500/20'
              : 'bg-red-500/15 text-red-400 border border-red-500/20'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setTab('lora')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'lora'
                ? 'bg-accent-600 text-white shadow-lg shadow-accent-500/25'
                : 'bg-surface-100 text-surface-500 border border-surface-300 hover:text-surface-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            LoRA
          </button>
          <button
            onClick={() => setTab('sidestep')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'sidestep'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                : 'bg-surface-100 text-surface-500 border border-surface-300 hover:text-surface-800'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" />
            SideStep
          </button>
        </div>
      </div>

      {/* LoRA Tab */}
      {tab === 'lora' && (
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Status Card */}
          <div className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-accent-600/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-accent-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-900">{t('training.loraStatus')}</h3>
                <p className="text-xs text-surface-400">
                  {status || t('training.noLoraLoaded')}
                </p>
              </div>
            </div>
          </div>

          {/* LoRA List */}
          {loras.length === 0 ? (
            <div className="text-center py-12 text-surface-400">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 text-surface-500" />
              <p className="text-sm">{t('training.noLoras')}</p>
              <p className="text-xs text-surface-500 mt-1">{t('training.placeLoras')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {loras.map((lora, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-100/60
                    border border-surface-300/40 hover:border-surface-400 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-200/50 flex items-center justify-center shrink-0">
                    <Sliders className="w-4 h-4 text-surface-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{lora.name}</p>
                    <p className="text-xs text-surface-500 truncate">{lora.path}</p>
                  </div>
                  {lora.loaded ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0} max={2} step={0.1}
                        value={lora.scale}
                        onChange={e => handleScaleChange(parseFloat(e.target.value))}
                        className="w-20 accent-accent-500"
                      />
                      <span className="text-xs text-surface-400 w-8">{lora.scale.toFixed(1)}</span>
                      <button
                        onClick={handleUnload}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Unload"
                      >
                        <ToggleRight className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleLoad(lora.path)}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-accent-400
                        hover:bg-accent-500/10 transition-colors"
                      title="Load"
                    >
                      <ToggleLeft className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SideStep Tab */}
      {tab === 'sidestep' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6">
          <div className="text-center space-y-4 max-w-md">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 flex items-center justify-center mx-auto">
              <Rocket className="w-10 h-10 text-brand-400" />
            </div>
            <h2 className="text-xl font-bold text-surface-900">SideStep Trainer</h2>
            <p className="text-sm text-surface-500 leading-relaxed">
              {t('training.sidestepDescription', 'Advanced training console for fine-tuning custom voice models and style adapters. Upload datasets, configure hyperparameters, and monitor training progress in real-time.')}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['Dataset Builder', 'Hyperparameter Tuning', 'Live Metrics', 'Model Export'].map(feature => (
                <span key={feature} className="px-3 py-1 rounded-full bg-surface-100 border border-surface-300 text-[10px] font-medium text-surface-500">
                  {feature}
                </span>
              ))}
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500/10 text-brand-400 text-xs font-semibold border border-brand-500/20">
                <Footprints className="w-3.5 h-3.5" />
                {t('training.comingSoon', 'Coming Soon')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

