import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cpu, Thermometer, HardDrive, Trash2, RefreshCw, Activity,
  MemoryStick, Layers, TrendingUp, Zap, Monitor,
} from 'lucide-react';
import { vramApi } from '../../services/api';
import type { GpuInfo, VramStatus } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const POLL_INTERVAL = 3000;

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function tempColor(temp: number): string {
  if (temp >= 85) return 'text-red-400';
  if (temp >= 70) return 'text-orange-400';
  if (temp >= 55) return 'text-yellow-400';
  return 'text-emerald-400';
}

function usageColor(pct: number): string {
  if (pct >= 90) return 'from-red-500 to-red-400';
  if (pct >= 70) return 'from-orange-500 to-yellow-400';
  if (pct >= 50) return 'from-yellow-500 to-emerald-400';
  return 'from-emerald-500 to-cyan-400';
}

function usageBg(pct: number): string {
  if (pct >= 90) return 'bg-red-500/10';
  if (pct >= 70) return 'bg-orange-500/10';
  return 'bg-emerald-500/10';
}

interface HistoryPoint {
  time: number;
  vram: number;
  util: number;
  temp: number;
}

export default function GpuMonitorView() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [status, setStatus] = useState<VramStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [chartLines, setChartLines] = useState({ vram: true, util: true, temp: true });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await vramApi.getStatus(token);
      if (res.success) {
        setStatus(res);
        setError(null);
        if (res.gpus?.[0]) {
          const gpu = res.gpus[0];
          setHistory(prev => {
            const next = [...prev, {
              time: Date.now(),
              vram: gpu.usage_percent,
              util: gpu.utilization,
              temp: gpu.temperature,
            }];
            return next.length > 120 ? next.slice(-120) : next;
          });
        }
      } else {
        setError(res.error || t('gpu.offline'));
      }
    } catch {
      setError(t('gpu.offline'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchStatus]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      ctx.fillText(`${100 - i * 25}%`, 4, (h / 4) * i + 12);
    }

    const drawLine = (data: number[], color: string, alpha: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - (val / 100) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Fill
      ctx.globalAlpha = alpha * 0.1;
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    drawLine(history.map(p => p.vram), '#818cf8', chartLines.vram ? 1 : 0);
    drawLine(history.map(p => p.util), '#34d399', chartLines.util ? 0.7 : 0);
    drawLine(history.map(p => p.temp), '#fb923c', chartLines.temp ? 0.5 : 0);
  }, [history, chartLines]);

  const handlePurge = async () => {
    if (!token || purging) return;
    setPurging(true);
    try {
      await vramApi.purge(token);
      await fetchStatus();
    } catch { /* ignore */ }
    setPurging(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-accent-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-surface-500">
        <Monitor className="w-12 h-12 text-surface-400" />
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchStatus}
          className="px-4 py-2 rounded-lg bg-surface-100 border border-surface-300 text-sm text-surface-700 hover:bg-surface-200 transition-colors"
        >
          {t('gpu.refresh')}
        </button>
      </div>
    );
  }

  const gpu = status?.gpus?.[0];
  const torch = status?.torch;

  if (!gpu) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-surface-500">
        <Cpu className="w-12 h-12 text-surface-400" />
        <p className="text-sm">{t('gpu.noGpu')}</p>
      </div>
    );
  }

  const vramPct = gpu.usage_percent;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (vramPct / 100) * circumference;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-950 flex items-center gap-2">
              <Cpu className="w-6 h-6 text-accent-400" />
              {t('gpu.title')}
            </h1>
            <p className="text-sm text-surface-500 mt-1">{gpu.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-surface-500 cursor-pointer select-none">
              <span>{t('gpu.autoRefresh')}</span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`relative inline-flex items-center w-10 h-[22px] rounded-full transition-colors ${
                  autoRefresh ? 'bg-accent-500' : 'bg-surface-300'
                }`}
              >
                <span className={`absolute w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  autoRefresh ? 'translate-x-[22px]' : 'translate-x-[3px]'
                }`} />
              </button>
            </label>
            <button
              onClick={fetchStatus}
              className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 transition-colors"
              title={t('gpu.refresh')}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handlePurge}
              disabled={purging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {purging ? t('gpu.purging') : t('gpu.purge')}
            </button>
          </div>
        </div>

        {/* Top cards */}
        <div className="grid grid-cols-3 gap-4">
          {/* VRAM Radial */}
          <div className="bg-surface-100/60 rounded-2xl border border-surface-300/40 p-5 flex flex-col items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-3">
              {t('gpu.vramUsage')}
            </span>
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="54" fill="none"
                  strokeWidth="8" strokeLinecap="round"
                  className={`transition-all duration-700`}
                  stroke="url(#vramGrad)"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
                <defs>
                  <linearGradient id="vramGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-surface-900">{vramPct.toFixed(1)}%</span>
                <span className="text-[10px] text-surface-500">{formatMB(gpu.used_mb)} / {formatMB(gpu.total_mb)}</span>
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-[10px] text-surface-500">
              <span>{t('gpu.free')}: <span className="text-emerald-400 font-medium">{formatMB(gpu.free_mb)}</span></span>
            </div>
          </div>

          {/* GPU Utilization */}
          <div className="bg-surface-100/60 rounded-2xl border border-surface-300/40 p-5 flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-3">
              {t('gpu.gpuUtilization')}
            </span>
            <div className="flex-1 flex flex-col justify-center gap-4">
              {/* GPU % bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-surface-600 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Compute
                  </span>
                  <span className="text-sm font-bold text-surface-900">{gpu.utilization}%</span>
                </div>
                <div className="h-3 rounded-full bg-surface-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${usageColor(gpu.utilization)} transition-all duration-700`}
                    style={{ width: `${gpu.utilization}%` }}
                  />
                </div>
              </div>
              {/* VRAM bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-surface-600 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> VRAM
                  </span>
                  <span className="text-sm font-bold text-surface-900">{vramPct.toFixed(1)}%</span>
                </div>
                <div className="h-3 rounded-full bg-surface-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${usageColor(vramPct)} transition-all duration-700`}
                    style={{ width: `${vramPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Temperature */}
          <div className="bg-surface-100/60 rounded-2xl border border-surface-300/40 p-5 flex flex-col items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-3">
              {t('gpu.temperature')}
            </span>
            <div className="flex-1 flex flex-col items-center justify-center">
              <Thermometer className={`w-8 h-8 mb-2 ${tempColor(gpu.temperature)}`} />
              <span className={`text-4xl font-bold ${tempColor(gpu.temperature)}`}>
                {gpu.temperature}°C
              </span>
              <div className="mt-3 w-full h-2 rounded-full bg-surface-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    gpu.temperature >= 85 ? 'bg-red-500' :
                    gpu.temperature >= 70 ? 'bg-orange-400' :
                    gpu.temperature >= 55 ? 'bg-yellow-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(gpu.temperature, 100)}%` }}
                />
              </div>
              <div className="flex justify-between w-full text-[9px] text-surface-500 mt-1">
                <span>0°</span><span>50°</span><span>100°</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live chart */}
        <div className="bg-surface-100/60 rounded-2xl border border-surface-300/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              {t('gpu.liveMonitor')}
            </span>
            <div className="flex items-center gap-4 text-[10px]">
              <button
                onClick={() => setChartLines(p => ({ ...p, vram: !p.vram }))}
                className={`flex items-center gap-1 cursor-pointer select-none transition-opacity ${
                  chartLines.vram ? '' : 'opacity-30 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-accent-400" /> VRAM
              </button>
              <button
                onClick={() => setChartLines(p => ({ ...p, util: !p.util }))}
                className={`flex items-center gap-1 cursor-pointer select-none transition-opacity ${
                  chartLines.util ? '' : 'opacity-30 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> GPU
              </button>
              <button
                onClick={() => setChartLines(p => ({ ...p, temp: !p.temp }))}
                className={`flex items-center gap-1 cursor-pointer select-none transition-opacity ${
                  chartLines.temp ? '' : 'opacity-30 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-orange-400" /> Temp
              </button>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            className="w-full h-40 rounded-lg bg-surface-50/50"
          />
        </div>

        {/* PyTorch Memory Details */}
        {torch && (
          <div className="bg-surface-100/60 rounded-2xl border border-surface-300/40 p-5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1.5 mb-4">
              <MemoryStick className="w-3.5 h-3.5" />
              {t('gpu.torchMemory')}
            </span>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: t('gpu.allocated'), value: torch.allocated_mb, icon: Layers, color: 'accent-400' },
                { label: t('gpu.reserved'), value: torch.reserved_mb, icon: HardDrive, color: 'brand-400' },
                { label: t('gpu.peak'), value: torch.max_allocated_mb, icon: TrendingUp, color: 'orange-400' },
                { label: t('gpu.fragmentation'), value: torch.fragmentation_mb, icon: Activity, color: 'red-400' },
              ].map((item) => (
                <div key={item.label} className="bg-surface-50/60 rounded-xl p-3 border border-surface-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <item.icon className={`w-3.5 h-3.5 text-${item.color}`} />
                    <span className="text-[10px] text-surface-500">{item.label}</span>
                  </div>
                  <span className="text-lg font-bold text-surface-900">{formatMB(item.value)}</span>
                  {item.label === t('gpu.allocated') && gpu.total_mb > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-surface-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-400 transition-all duration-500"
                        style={{ width: `${Math.min((item.value / gpu.total_mb) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VRAM breakdown bar */}
        <div className="bg-surface-100/60 rounded-2xl border border-surface-300/40 p-5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-3 block">
            VRAM Breakdown
          </span>
          <div className="h-6 rounded-full bg-surface-200 overflow-hidden flex">
            {torch && (
              <>
                <div
                  className="h-full bg-accent-500 transition-all duration-500"
                  style={{ width: `${(torch.allocated_mb / gpu.total_mb) * 100}%` }}
                  title={`Allocated: ${formatMB(torch.allocated_mb)}`}
                />
                <div
                  className="h-full bg-brand-500/60 transition-all duration-500"
                  style={{ width: `${(torch.fragmentation_mb / gpu.total_mb) * 100}%` }}
                  title={`Fragmentation: ${formatMB(torch.fragmentation_mb)}`}
                />
              </>
            )}
            {!torch && (
              <div
                className="h-full bg-accent-500 transition-all duration-500"
                style={{ width: `${vramPct}%` }}
                title={`Used: ${formatMB(gpu.used_mb)}`}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-surface-500">
            {torch ? (
              <>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent-500" /> {t('gpu.allocated')}: {formatMB(torch.allocated_mb)}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-500/60" /> {t('gpu.fragmentation')}: {formatMB(torch.fragmentation_mb)}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-surface-200" /> {t('gpu.free')}: {formatMB(gpu.free_mb)}</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent-500" /> {t('gpu.used')}: {formatMB(gpu.used_mb)}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-surface-200" /> {t('gpu.free')}: {formatMB(gpu.free_mb)}</span>
              </>
            )}
            <span className="ml-auto">{t('gpu.total')}: {formatMB(gpu.total_mb)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
