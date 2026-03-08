import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Shuffle, Repeat, Repeat1, Download, Heart, ChevronUp, ChevronDown,
  Music, Cpu, MessageSquare, Mic, Clock, Disc3,
  Share2, Scissors, Copy,
} from 'lucide-react';
import type { Song } from '../../types';

/* ── Animated glow bar CSS (injected once) ── */
const glowStyleId = 'playerbar-glow-css';
if (typeof document !== 'undefined' && !document.getElementById(glowStyleId)) {
  const style = document.createElement('style');
  style.id = glowStyleId;
  style.textContent = `
    @keyframes pb-shimmer {
      0%   { filter: hue-rotate(0deg)   brightness(1)   drop-shadow(0 0 4px currentColor); }
      25%  { filter: hue-rotate(15deg)  brightness(1.2) drop-shadow(0 0 8px currentColor); }
      50%  { filter: hue-rotate(-10deg) brightness(1.1) drop-shadow(0 0 12px currentColor); }
      75%  { filter: hue-rotate(8deg)   brightness(1.3) drop-shadow(0 0 6px currentColor); }
      100% { filter: hue-rotate(0deg)   brightness(1)   drop-shadow(0 0 4px currentColor); }
    }
    .pb-glow-anim { animation: pb-shimmer 4s ease-in-out infinite; }
    .pb-glow-idle  { filter: brightness(0.7); animation: none; }
  `;
  document.head.appendChild(style);
}

interface PlayerBarProps {
  song: Song | null;
  songs: Song[];
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onSongEnd: () => void;
  isLiked?: boolean;
  onToggleLike?: () => void;
  onClickTitle?: () => void;
  onAddToPlaylist?: () => void;
  onExtractStems?: () => void;
  onReusePrompt?: () => void;
  onShare?: () => void;
}

export default memo(function PlayerBar({
  song, songs, isPlaying, onPlayPause, onNext, onPrevious,
  audioRef, onSongEnd, isLiked, onToggleLike, onClickTitle, onAddToPlaylist,
  onExtractStems, onReusePrompt, onShare,
}: PlayerBarProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('ace_volume');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('none');
  const [expanded, setExpanded] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const seekingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // rAF-based playback progress loop (smooth 60fps)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let running = false;

    const tick = () => {
      if (audio.duration && isFinite(audio.duration) && !seekingRef.current) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
      if (running) animRef.current = requestAnimationFrame(tick);
    };

    const onPlay = () => { running = true; animRef.current = requestAnimationFrame(tick); };
    const onPause = () => { running = false; cancelAnimationFrame(animRef.current); tick(); };
    const onEnded = () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        onSongEnd();
      }
    };
    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onTimeUpdate = () => {
      if (!running && audio.duration && isFinite(audio.duration) && !seekingRef.current) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    if (!audio.paused) onPlay();

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [audioRef, onSongEnd, repeatMode]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem('ace_volume', String(volume));
  }, [volume, isMuted, audioRef]);

  // Drag-to-seek on the TOP GLOW BAR
  const handleGlowSeekDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = glowRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !audio.duration) return;
    e.preventDefault();
    e.stopPropagation();
    seekingRef.current = true;

    const updateSeek = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
      setProgress(pct * 100);
      setCurrentTime(pct * audio.duration);
    };

    updateSeek(e.clientX);

    const onMove = (ev: MouseEvent) => updateSeek(ev.clientX);
    const onUp = () => {
      seekingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [audioRef]);

  const handleDownload = useCallback(() => {
    if (!song?.audioUrl) return;
    const a = document.createElement('a');
    a.href = song.audioUrl;
    a.download = `${song.title || 'song'}.mp3`;
    a.click();
  }, [song]);

  const handleShare = useCallback(() => {
    if (onShare) { onShare(); return; }
    if (!song) return;
    const text = `🎵 ${song.title || 'Untitled'}${song.style ? ` — ${song.style}` : ''}`;
    if (navigator.clipboard) navigator.clipboard.writeText(text);
  }, [song, onShare]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode(p => p === 'none' ? 'all' : p === 'all' ? 'one' : 'none');
  }, []);

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  if (!song) {
    return (
      <div className="h-16 flex items-center justify-center">
        <span className="text-sm text-surface-500">{t('player.noSong')}</span>
      </div>
    );
  }

  const gp = song.generationParams;

  return (
    <div className="relative z-30">
      {/* ── Expanded detail panel (slides up behind the bar) ── */}
      <div
        className="absolute bottom-full left-0 right-0 transition-all duration-500 ease-out origin-bottom"
        style={{
          maxHeight: expanded ? '65vh' : '0px',
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? 'auto' : 'none',
          transform: expanded ? 'translateY(0)' : 'translateY(16px)',
        }}
      >
        <div
          className="mx-4 rounded-t-2xl border border-b-0 border-white/10 overflow-hidden"
          style={{
            background: 'color-mix(in srgb, var(--color-surface-50) 78%, transparent)',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Header row: Cover + Title + Actions */}
          <div className="flex items-start gap-4 p-5 pb-3">
            {/* Large cover */}
            <div className="w-20 h-20 rounded-xl bg-surface-200 flex-shrink-0 overflow-hidden shadow-lg ring-1 ring-white/10">
              {song.coverUrl ? (
                <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-accent-500/30 to-brand-500/30" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-surface-900 truncate">{song.title || 'Untitled'}</h2>
              <p className="text-sm text-surface-500 truncate mt-0.5">{song.creator || song.style || ''}</p>
              {gp?.songDescription && (
                <p className="text-xs text-surface-400 mt-1.5 line-clamp-2">{gp.songDescription}</p>
              )}
            </div>
            {/* Top-right action icons */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {onToggleLike && (
                <ActionBtn onClick={onToggleLike} tip={t('player.like', 'Like')}>
                  <Heart className={`w-[18px] h-[18px] ${isLiked ? 'fill-pink-500 text-pink-500' : ''}`} />
                </ActionBtn>
              )}
              <ActionBtn onClick={handleDownload} tip={t('player.download', 'Download')}>
                <Download className="w-[18px] h-[18px]" />
              </ActionBtn>
              <ActionBtn onClick={handleShare} tip={t('player.share', 'Share')}>
                <Share2 className="w-[18px] h-[18px]" />
              </ActionBtn>
              {onExtractStems && (
                <ActionBtn onClick={onExtractStems} tip={t('player.extractStems', 'Extract Stems')}>
                  <Scissors className="w-[18px] h-[18px]" />
                </ActionBtn>
              )}
              {onReusePrompt && (
                <ActionBtn onClick={onReusePrompt} tip={t('player.reusePrompt', 'Reuse Prompt')}>
                  <Copy className="w-[18px] h-[18px]" />
                </ActionBtn>
              )}
              <ActionBtn onClick={() => setExpanded(false)} tip={t('player.collapse', 'Collapse')}>
                <ChevronDown className="w-[18px] h-[18px]" />
              </ActionBtn>
            </div>
          </div>

          {/* Two-column content */}
          <div className="flex gap-4 px-5 pb-4 max-h-[calc(65vh-140px)] overflow-y-auto">
            {/* Left: Lyrics */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-accent-400" />
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{t('create.lyrics', 'Lyrics')}</span>
              </div>
              <div className="text-sm text-surface-700 font-mono leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto pr-2 scrollbar-thin">
                {song.lyrics || gp?.lyrics || <span className="text-surface-400 italic">{t('player.noLyrics', 'Instrumental')}</span>}
              </div>
            </div>

            {/* Right: Model & Generation info */}
            <div className="w-[260px] flex-shrink-0 space-y-3">
              {/* Prompt */}
              {(gp?.prompt || song.prompt) && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Music className="w-4 h-4 text-brand-400" />
                    <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Prompt</span>
                  </div>
                  <p className="text-xs text-surface-600 leading-relaxed line-clamp-4">{gp?.prompt || song.prompt}</p>
                </div>
              )}

              {/* Style */}
              {(gp?.style || song.style) && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Disc3 className="w-4 h-4 text-accent-400" />
                    <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{t('create.style', 'Style')}</span>
                  </div>
                  <p className="text-xs text-surface-600">{gp?.style || song.style}</p>
                </div>
              )}

              {/* Active models */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Cpu className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{t('create.models', 'Models')}</span>
                </div>
                <div className="space-y-1">
                  {(gp?.ditModel || song.ditModel) && (
                    <InfoPill label="DIT" value={gp?.ditModel || song.ditModel || ''} />
                  )}
                  {gp?.lmBackend && (
                    <InfoPill label="LLM" value={`${(gp.lmBackend || '').toUpperCase()}${gp.lmModel ? ` · ${gp.lmModel}` : ''}`} />
                  )}
                  {gp?.inferMethod && (
                    <InfoPill label="Method" value={gp.inferMethod.toUpperCase()} />
                  )}
                </div>
              </div>

              {/* Generation params grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {gp?.singer && <ParamItem icon={<Mic className="w-3 h-3" />} label="Singer" value={gp.singer} />}
                {gp?.duration != null && <ParamItem icon={<Clock className="w-3 h-3" />} label="Duration" value={`${gp.duration}s`} />}
                {gp?.bpm != null && gp.bpm > 0 && <ParamItem label="BPM" value={String(gp.bpm)} />}
                {gp?.keyScale && <ParamItem label="Key" value={gp.keyScale} />}
                {gp?.timeSignature && <ParamItem label="Time" value={gp.timeSignature} />}
                {gp?.seed != null && <ParamItem label="Seed" value={String(gp.seed)} />}
                {gp?.guidanceScale != null && <ParamItem label="CFG" value={String(gp.guidanceScale)} />}
                {gp?.inferenceSteps != null && <ParamItem label="Steps" value={String(gp.inferenceSteps)} />}
                {gp?.audioFormat && <ParamItem label="Format" value={gp.audioFormat.toUpperCase()} />}
                {gp?.shift != null && gp.shift > 0 && <ParamItem label="Shift" value={String(gp.shift)} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Compact PlayerBar ── */}
      <div className="px-4 pb-3 pt-1">
        <div
          className="relative mx-auto rounded-2xl border border-white/10 transition-all duration-300 ease-out"
          style={{
            background: 'color-mix(in srgb, var(--color-surface-50) 68%, transparent)',
            backdropFilter: 'blur(20px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
            boxShadow: '0 -4px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* ── Seekable glow trail at top edge ── */}
          <div
            ref={glowRef}
            className="absolute -top-[3px] left-4 right-4 h-[14px] cursor-pointer z-10 group"
            onMouseDown={handleGlowSeekDown}
            onMouseMove={e => {
              const rect = glowRef.current?.getBoundingClientRect();
              if (rect) setHoverPct(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
            }}
            onMouseLeave={() => setHoverPct(null)}
          >
            {/* Track background (widens on hover for easier targeting) */}
            <div className="absolute inset-x-0 top-[5px] h-[2px] rounded-full bg-white/8 group-hover:h-[3px] group-hover:top-[4.5px] group-hover:bg-white/15 transition-[height,top,background-color] duration-200" />
            {/* Filled progress with animated glow */}
            <div
              className={`absolute top-[5px] left-0 h-[2px] rounded-full group-hover:h-[3px] group-hover:top-[4.5px] transition-[height,top] duration-200 ${isPlaying ? 'pb-glow-anim' : 'pb-glow-idle'}`}
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--color-accent-500), var(--color-brand-400))',
                boxShadow: isPlaying
                  ? '0 0 6px var(--color-accent-500), 0 0 14px var(--color-brand-500), 0 0 24px var(--color-accent-400)'
                  : '0 0 4px var(--color-accent-500)',
                color: 'var(--color-accent-400)',
              }}
            />
            {/* Time droplet tooltip (appears on hover) */}
            {hoverPct !== null && (
              <div
                className="absolute pointer-events-none"
                style={{ left: `${hoverPct}%`, top: '-22px', transform: 'translateX(-50%)' }}
              >
                <div
                  className="px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums text-white whitespace-nowrap"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-accent-600), var(--color-brand-500))',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  }}
                >
                  {fmt(duration * hoverPct / 100)}
                </div>
                {/* Triangle pointer */}
                <div className="mx-auto w-0 h-0" style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid var(--color-accent-600)' }} />
              </div>
            )}
          </div>

          {/* Main compact row */}
          <div className="flex items-center h-[56px] px-4 gap-3">
            {/* Time current */}
            <span className="text-[10px] text-surface-400 tabular-nums w-8 text-right select-none flex-shrink-0">{fmt(currentTime)}</span>

            {/* Album art + info */}
            <div
              className="flex items-center gap-3 min-w-0 flex-shrink-0 cursor-pointer select-none"
              onClick={() => setExpanded(e => !e)}
            >
              <div className="relative w-10 h-10 rounded-xl bg-surface-200 flex-shrink-0 overflow-hidden shadow-md ring-1 ring-white/10 group">
                {song.coverUrl ? (
                  <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-accent-500/30 to-brand-500/30" />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronUp className={`w-4 h-4 text-white transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
              <div className="min-w-0 max-w-[160px]">
                <p
                  className={`text-sm font-semibold text-surface-900 truncate ${onClickTitle ? 'hover:text-accent-400 transition-colors' : ''}`}
                  onClick={e => { if (onClickTitle) { e.stopPropagation(); onClickTitle(); } }}
                >
                  {song.title || 'Untitled'}
                </p>
                <p className="text-xs text-surface-500 truncate">{song.creator || song.style || ''}</p>
              </div>
            </div>

            {/* Center controls */}
            <div className="flex items-center justify-center flex-1 gap-3">
              <button
                onClick={() => setShuffle(p => !p)}
                className={`p-1 transition-colors ${shuffle ? 'text-accent-400' : 'text-surface-400 hover:text-surface-700'}`}
              >
                <Shuffle className="w-[16px] h-[16px]" />
              </button>
              <button onClick={onPrevious} className="p-1 text-surface-400 hover:text-surface-800 transition-colors">
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={onPlayPause}
                className="w-10 h-10 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-black/20"
              >
                {isPlaying ?
                  <Pause className="w-5 h-5 text-surface-900" /> :
                  <Play className="w-5 h-5 text-surface-900 ml-0.5" />
                }
              </button>
              <button onClick={onNext} className="p-1 text-surface-400 hover:text-surface-800 transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`p-1 transition-colors ${repeatMode !== 'none' ? 'text-accent-400' : 'text-surface-400 hover:text-surface-700'}`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-[16px] h-[16px]" /> : <Repeat className="w-[16px] h-[16px]" />}
              </button>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* Inline volume */}
              <VolumeIcon
                className="w-4 h-4 text-surface-400 hover:text-surface-200 cursor-pointer flex-shrink-0 transition-colors"
                onClick={() => setIsMuted(m => !m)}
              />
              <input
                type="range" min="0" max="1" step="0.01"
                value={isMuted ? 0 : volume}
                onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                className="w-14 h-1 accent-accent-500 flex-shrink-0"
              />

              {/* Highlighted action buttons */}
              {onToggleLike && (
                <button
                  onClick={onToggleLike}
                  className={`p-1.5 rounded-lg transition-all ${isLiked ? 'text-pink-500 bg-pink-500/15' : 'text-surface-400 hover:text-pink-400 hover:bg-pink-500/10'}`}
                  title={t('player.like', 'Like')}
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-pink-500' : ''}`} />
                </button>
              )}

              <button
                onClick={handleDownload}
                className="p-1.5 rounded-lg text-surface-400 hover:text-accent-400 hover:bg-accent-500/10 transition-all"
                title={t('player.download', 'Download')}
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                onClick={handleShare}
                className="p-1.5 rounded-lg text-surface-400 hover:text-brand-400 hover:bg-brand-500/10 transition-all"
                title={t('player.share', 'Share')}
              >
                <Share2 className="w-4 h-4" />
              </button>

              {onExtractStems && (
                <button
                  onClick={onExtractStems}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-green-400 hover:bg-green-500/10 transition-all"
                  title={t('player.extractStems', 'Extract Stems')}
                >
                  <Scissors className="w-4 h-4" />
                </button>
              )}

              {onReusePrompt && (
                <button
                  onClick={onReusePrompt}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                  title={t('player.reusePrompt', 'Reuse Prompt')}
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Time remaining */}
            <span className="text-[10px] text-surface-400 tabular-nums w-8 select-none flex-shrink-0">{fmt(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
})

/* ── helper sub-components ── */

function ActionBtn({ onClick, tip, children }: { onClick: () => void; tip: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-white/10 transition-all active:scale-95"
      title={tip}
    >
      {children}
    </button>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="px-1.5 py-0.5 rounded bg-white/10 text-surface-400 font-mono text-[10px] uppercase">{label}</span>
      <span className="text-surface-700 truncate">{value}</span>
    </div>
  );
}

function ParamItem({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-surface-500">
      {icon}
      <span className="truncate">{label}: <span className="text-surface-700 font-medium">{value}</span></span>
    </div>
  );
}

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
