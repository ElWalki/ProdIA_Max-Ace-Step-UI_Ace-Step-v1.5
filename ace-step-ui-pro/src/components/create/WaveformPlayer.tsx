import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

interface WaveformPlayerProps {
  src: string;
  title?: string;
  regionMode?: boolean;
  regionStart?: number;
  regionEnd?: number;
  onRegionChange?: (start: number, end: number) => void;
}

export default function WaveformPlayer({
  src, title, regionMode, regionStart = 0, regionEnd = 1, onRegionChange,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const animRef = useRef(0);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  // Decode audio to extract peaks
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const ac = new AudioContext();
    fetch(src)
      .then(r => r.arrayBuffer())
      .then(buf => ac.decodeAudioData(buf))
      .then(decoded => {
        if (cancelled) return;
        const raw = decoded.getChannelData(0);
        const bars = 200;
        const step = Math.floor(raw.length / bars);
        const p: number[] = [];
        for (let i = 0; i < bars; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const v = Math.abs(raw[i * step + j]);
            if (v > max) max = v;
          }
          p.push(max);
        }
        setPeaks(p);
      })
      .catch(() => setPeaks([]));
    return () => { cancelled = true; ac.close().catch(() => {}); };
  }, [src]);

  // Draw waveform — professional DAW-style mirrored bars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;
    const c = canvas.getContext('2d');
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { width: w, height: h } = canvas.getBoundingClientRect();
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    c.scale(dpr, dpr);
    c.clearRect(0, 0, w, h);

    const gap = 1;
    const barW = Math.max(1, (w - gap * (peaks.length - 1)) / peaks.length);
    const midY = h / 2;
    const maxHalf = h * 0.44;
    const isLight = document.documentElement.classList.contains('light');
    const hasRoundRect = typeof c.roundRect === 'function';
    const r = Math.min(barW * 0.4, 1.5);

    // Region highlight background
    if (regionMode) {
      c.fillStyle = isLight ? 'rgba(99,102,241,0.06)' : 'rgba(139,92,246,0.06)';
      c.fillRect(regionStart * w, 0, (regionEnd - regionStart) * w, h);
    }

    // Center reference line
    c.fillStyle = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
    c.fillRect(0, midY, w, 0.5);

    // Colors
    const playedColor = isLight ? 'rgba(99,102,241,0.8)' : 'rgba(139,92,246,0.85)';
    const regionActiveColor = isLight ? 'rgba(99,102,241,0.85)' : 'rgba(168,85,247,0.9)';
    const regionColor = isLight ? 'rgba(99,102,241,0.3)' : 'rgba(168,85,247,0.3)';
    const mutedColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';

    // Mirrored bars
    for (let i = 0; i < peaks.length; i++) {
      const x = i * (barW + gap);
      const halfH = Math.max(0.5, peaks[i] * maxHalf);
      const pct = (i + 0.5) / peaks.length;

      if (regionMode && pct >= regionStart && pct <= regionEnd) {
        c.fillStyle = pct <= progress ? regionActiveColor : regionColor;
      } else if (progress > 0 && pct <= progress) {
        c.fillStyle = playedColor;
      } else {
        c.fillStyle = mutedColor;
      }

      if (hasRoundRect) {
        c.beginPath();
        c.roundRect(x, midY - halfH, barW, halfH, [r, r, 0, 0]);
        c.fill();
        c.beginPath();
        c.roundRect(x, midY, barW, halfH, [0, 0, r, r]);
        c.fill();
      } else {
        c.fillRect(x, midY - halfH, barW, halfH);
        c.fillRect(x, midY, barW, halfH);
      }
    }

    // Playhead
    if (progress > 0) {
      const px = progress * w;
      c.fillStyle = isLight ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.6)';
      c.fillRect(Math.round(px) - 0.5, 0, 1, h);
    }

    // Region handles
    if (regionMode) {
      for (const pos of [regionStart, regionEnd]) {
        const x = pos * w;
        c.fillStyle = isLight ? 'rgba(99,102,241,0.85)' : 'rgba(168,85,247,0.85)';
        c.fillRect(x - 1, 0, 2, h);
        c.beginPath();
        c.arc(x, midY, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
  }, [peaks, progress, regionMode, regionStart, regionEnd]);

  // Playback animation
  const tick = useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) {
      setProgress(a.currentTime / (a.duration || 1));
      animRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setIsPlaying(true); animRef.current = requestAnimationFrame(tick); }
    else { a.pause(); setIsPlaying(false); cancelAnimationFrame(animRef.current); }
  }, [tick]);

  // Seek on click (non-region mode) — also allows drag-seek
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging || regionMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const a = audioRef.current;
    if (!rect || !a) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * (a.duration || 0);
    setProgress(pct);
  }, [dragging, regionMode]);

  // Drag-to-seek for playback position (non-region mode)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (regionMode) {
      // Region handle drag
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = (e.clientX - rect.left) / rect.width;
      const ds = Math.abs(pct - regionStart);
      const de = Math.abs(pct - regionEnd);
      if (ds < 0.05 || de < 0.05) {
        e.preventDefault();
        setDragging(ds < de ? 'start' : 'end');
      }
      return;
    }
    // Non-region: drag-to-seek playback position
    const rect = canvasRef.current?.getBoundingClientRect();
    const a = audioRef.current;
    if (!rect || !a || !a.duration) return;
    e.preventDefault();

    const seek = (clientX: number) => {
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      a.currentTime = pct * a.duration;
      setProgress(pct);
    };
    seek(e.clientX);

    const onMove = (ev: MouseEvent) => { seek(ev.clientX); };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [regionMode, regionStart, regionEnd]);

  // Region drag move/up
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (dragging === 'start') onRegionChange?.(Math.min(pct, regionEnd - 0.02), regionEnd);
      else onRegionChange?.(regionStart, Math.max(pct, regionStart + 0.02));
    };
    const up = () => setDragging(null);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [dragging, regionStart, regionEnd, onRegionChange]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="space-y-1">
      <audio ref={audioRef} src={src} preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
      />
      <div className="flex items-center gap-2">
        <button onClick={togglePlay}
          className="p-1 rounded-md hover:bg-surface-200 text-accent-400 transition-colors shrink-0">
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        {peaks === null ? (
          <div className="flex-1 h-10 rounded bg-surface-100 animate-pulse" />
        ) : (
          <canvas ref={canvasRef} onClick={handleClick} onMouseDown={handleMouseDown}
            className={`flex-1 h-10 rounded ${regionMode ? 'cursor-col-resize' : 'cursor-pointer'}`}
          />
        )}
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-surface-500 truncate max-w-[60%]">{title || ''}</span>
        <span className="text-[10px] text-surface-400 tabular-nums">{fmt(progress * duration)} / {fmt(duration)}</span>
      </div>
    </div>
  );
}
