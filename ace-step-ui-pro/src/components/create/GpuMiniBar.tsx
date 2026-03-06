import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown, Cpu, Thermometer, HardDrive, Trash2, Zap } from 'lucide-react';
import { vramApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const POLL_INTERVAL = 5000;

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function barColor(pct: number): string {
  if (pct >= 90) return 'from-red-500 to-red-400';
  if (pct >= 70) return 'from-orange-500 to-yellow-400';
  if (pct >= 50) return 'from-yellow-500 to-emerald-400';
  return 'from-emerald-500 to-cyan-400';
}

interface GpuMiniBarProps {
  isGenerating: boolean;
  progress?: number;
  stage?: string;
}

export default function GpuMiniBar({ isGenerating, progress, stage }: GpuMiniBarProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [gpu, setGpu] = useState<{
    name: string; used_mb: number; total_mb: number; free_mb: number;
    usage_percent: number; temperature: number; utilization: number;
  } | null>(null);
  const [purging, setPurging] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await vramApi.getStatus(token);
      if (res.success && res.gpus?.[0]) setGpu(res.gpus[0]);
    } catch { /* offline */ }
  }, [token]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

  const handlePurge = async () => {
    if (!token || purging) return;
    setPurging(true);
    try { await vramApi.purge(token); await fetchStatus(); } catch {}
    setPurging(false);
  };

  const vramPct = gpu?.usage_percent ?? 0;
  const utilPct = gpu?.utilization ?? 0;

  return (
    <div className="space-y-1.5">
      {/* Expandable GPU info */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-[10px] text-surface-500 hover:text-surface-700 transition-colors"
      >
        <Cpu className="w-3 h-3" />
        {gpu ? (
          <span className="flex-1 text-left truncate">
            {gpu.name} — VRAM {vramPct.toFixed(0)}% — {gpu.temperature}°C
          </span>
        ) : (
          <span className="flex-1 text-left">GPU —</span>
        )}
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      {expanded && gpu && (
        <div className="space-y-2 p-2.5 rounded-lg bg-surface-100/80 border border-surface-300/60 animate-slide-up">
          {/* VRAM bar */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-surface-500 flex items-center gap-1">
                <HardDrive className="w-2.5 h-2.5" /> VRAM
              </span>
              <span className="text-surface-700 font-medium">
                {formatMB(gpu.used_mb)} / {formatMB(gpu.total_mb)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${barColor(vramPct)} transition-all duration-500`}
                style={{ width: `${vramPct}%` }}
              />
            </div>
          </div>

          {/* GPU util bar */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-surface-500 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> GPU
              </span>
              <span className="text-surface-700 font-medium">{utilPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${barColor(utilPct)} transition-all duration-500`}
                style={{ width: `${utilPct}%` }}
              />
            </div>
          </div>

          {/* Temp + Purge */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-surface-500 flex items-center gap-1">
              <Thermometer className="w-2.5 h-2.5" /> {gpu.temperature}°C
            </span>
            <button
              onClick={handlePurge}
              disabled={purging}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium
                bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-2.5 h-2.5" />
              {purging ? t('gpu.purging') : t('gpu.purge')}
            </button>
          </div>
        </div>
      )}

      {/* Generation progress */}
      {isGenerating && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-accent-400 font-medium">
              {stage || t('create.generating')}
            </span>
            {progress !== undefined && (
              <span className="text-surface-600 font-mono">{progress}%</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-500 to-brand-500 transition-all duration-500"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
