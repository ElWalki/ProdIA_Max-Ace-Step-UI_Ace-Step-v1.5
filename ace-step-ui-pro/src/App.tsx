import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Song, GenerationParams, View, GenerationJob } from './types';
import { songsApi, generateApi } from './services/api';
import { useAuth } from './context/AuthContext';

import TopBar from './components/layout/TopBar';
import PlayerBar from './components/layout/PlayerBar';
import CreatePanel from './components/create/CreatePanel';
import ResultsPanel from './components/create/ResultsPanel';
import LibraryView from './components/views/LibraryView';
import TrainingView from './components/views/TrainingView';
import ExploreView from './components/views/ExploreView';
import FloatingAssistant from './components/assistant/FloatingAssistant';
import MetadataModal from './components/ui/MetadataModal';
import SongDetailPanel from './components/ui/SongDetailPanel';
import StemSeparator from './components/ui/StemSeparator';
import GpuMonitorView from './components/views/GpuMonitorView';
import SettingsModal from './components/ui/SettingsModal';
import Toast from './components/ui/Toast';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

const JOB_POLL_INTERVAL = 2000;
const JOB_TIMEOUT = 600_000; // 10 minutes

export default function App() {
  const { t } = useTranslation();
  const { user, token } = useAuth();

  // ─── View ───
  const [currentView, setCurrentView] = useState<View>('create');

  // ─── Songs ───
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // ─── Audio ───
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const currentSongRef = useRef<Song | null>(null);

  // ─── Generation ───
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const activeJobsRef = useRef<Map<string, { tempId: string; interval: ReturnType<typeof setInterval>; startTime: number }>>(new Map());

  // ─── UI ───
  const [toast, setToast] = useState<ToastState | null>(null);
  const [metadataSong, setMetadataSong] = useState<Song | null>(null);
  const [detailSong, setDetailSong] = useState<Song | null>(null);
  const [stemSong, setStemSong] = useState<Song | null>(null);
  const [reuseParams, setReuseParams] = useState<GenerationParams | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(420);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('acestep_theme') as 'dark' | 'light') || 'dark';
  });

  // ─── Theme ───
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('acestep_theme', theme);
  }, [theme]);

  // ─── Audio setup ───
  useEffect(() => {
    const audio = audioRef.current;
    audio.crossOrigin = 'anonymous';

    const onError = () => {
      setIsPlaying(false);
      // Only show toast if there's actually a song loaded (avoid spurious errors)
      if (audio.src && audio.src !== window.location.href) {
        setToast({ message: 'Audio playback error', type: 'error' });
      }
    };
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Keep currentSongRef synced for closures
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);

  // ─── Fetch songs ───
  const refreshSongs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await songsApi.getMySongs(token);
      if (data.songs && Array.isArray(data.songs)) {
        setSongs(data.songs);
      }
    } catch { /* backend may not be ready */ }
  }, [token]);

  useEffect(() => {
    if (user) refreshSongs();
  }, [user, refreshSongs]);

  // ─── Toast helper ───
  const showToast = useCallback((message: string, type: ToastState['type'] = 'info') => {
    setToast({ message, type });
  }, []);

  // ─── Playback ───
  const playSong = useCallback((song: Song) => {
    if (!song || song.isGenerating) return;
    const audio = audioRef.current;

    if (currentSong?.id === song.id) {
      if (audio.paused) { audio.play().catch(() => {}); setIsPlaying(true); }
      else { audio.pause(); setIsPlaying(false); }
      return;
    }

    setCurrentSong(song);

    const url = song.audioUrl?.startsWith('http') ? song.audioUrl : song.audioUrl ? song.audioUrl : `/api/songs/${song.id}/audio`;
    try {
      audio.src = url;
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } catch {
      setIsPlaying(false);
    }
  }, [currentSong]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!currentSong) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentSong]);

  // ─── Spacebar play/pause ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay]);

  const playNext = useCallback(() => {
    if (songs.length === 0) return;
    const idx = songs.findIndex(s => s.id === currentSongRef.current?.id);
    let nextIdx = idx + 1;
    if (nextIdx >= songs.length) nextIdx = 0;
    playSong(songs[nextIdx]);
  }, [songs, playSong]);

  const playPrev = useCallback(() => {
    if (songs.length === 0) return;
    const audio = audioRef.current;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const idx = songs.findIndex(s => s.id === currentSong?.id);
    const prevIdx = idx > 0 ? idx - 1 : songs.length - 1;
    playSong(songs[prevIdx]);
  }, [songs, currentSong, playSong]);

  // ─── Delete song ───
  const deleteSong = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await songsApi.deleteSong(id, token);
      setSongs(prev => prev.filter(s => s.id !== id));
      if (currentSong?.id === id) {
        audioRef.current.pause();
        setCurrentSong(null);
        setIsPlaying(false);
      }
      showToast(t('common.deleted'), 'success');
    } catch {
      showToast(t('common.error'), 'error');
    }
  }, [currentSong, token, showToast, t]);

  // ─── Job polling ───
  const cleanupJob = useCallback((jobId: string) => {
    const entry = activeJobsRef.current.get(jobId);
    if (entry) {
      clearInterval(entry.interval);
      activeJobsRef.current.delete(jobId);
    }
    setJobs(prev => prev.filter(j => j.jobId !== jobId));
    setIsGenerating(activeJobsRef.current.size > 0);
  }, []);

  const beginPollingJob = useCallback((jobId: string, tempId: string) => {
    const startTime = Date.now();

    const interval = setInterval(async () => {
      if (!token) return;
      try {
        if (Date.now() - startTime > JOB_TIMEOUT) {
          cleanupJob(jobId);
          showToast('Generation timed out', 'error');
          return;
        }

        const res = await generateApi.getStatus(jobId, token);

        if (res.status === 'succeeded') {
          cleanupJob(jobId);
          await refreshSongs();
          showToast(t('create.done'), 'success');
        } else if (res.status === 'failed') {
          cleanupJob(jobId);
          showToast(res.error || t('common.error'), 'error');
        } else {
          setJobs(prev => prev.map(j =>
            j.jobId === jobId ? { ...j, progress: res.progress ?? j.progress, stage: res.stage ?? j.stage } : j
          ));
        }
      } catch {
        // Network error - don't kill the job yet
      }
    }, JOB_POLL_INTERVAL);

    activeJobsRef.current.set(jobId, { tempId, interval, startTime });
  }, [token, cleanupJob, refreshSongs, showToast, t]);

  const handleGenerate = useCallback(async (params: GenerationParams) => {
    if (!token) return;
    setIsGenerating(true);
    try {
      const tempId = `temp_${Date.now()}`;
      setJobs(prev => [...prev, { jobId: tempId, status: 'pending', progress: 0 }]);

      const res = await generateApi.startGeneration(params, token);
      const jobId = res.jobId;

      if (jobId) {
        setJobs(prev => prev.map(j => j.jobId === tempId ? { ...j, jobId, status: 'running' } : j));
        beginPollingJob(jobId, tempId);
        showToast(t('create.generating'), 'info');
      } else {
        setJobs(prev => prev.filter(j => j.jobId !== tempId));
        await refreshSongs();
        showToast(t('create.done'), 'success');
        setIsGenerating(false);
      }
    } catch (e: any) {
      showToast(e.message || t('common.error'), 'error');
      setJobs(prev => prev.filter(j => j.status === 'pending'));
      setIsGenerating(false);
    }
  }, [token, beginPollingJob, refreshSongs, showToast, t]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeJobsRef.current.forEach(entry => clearInterval(entry.interval));
    };
  }, []);

  // ─── Explore → Create style ───
  const handleSelectStyle = useCallback((style: string) => {
    setCurrentView('create');
  }, []);

  // ─── Like / Dislike ───
  const toggleLike = useCallback(async (songId: string) => {
    if (!token) return;
    try {
      const res = await songsApi.toggleLike(songId, token);
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, liked: res.liked } : s));
    } catch { /* ignore */ }
  }, [token]);

  // ─── Context menu actions ───
  const handleMenuAction = useCallback((action: string, song: Song) => {
    switch (action) {
      case 'play':
        playSong(song);
        break;
      case 'like':
        toggleLike(song.id);
        break;
      case 'metadata':
      case 'viewConfig':
      case 'editMetadata':
        setMetadataSong(song);
        break;
      case 'delete':
        deleteSong(song.id);
        break;
      case 'addToPlaylist':
        // Select song for detail panel / workspace
        setDetailSong(song);
        showToast(t('common.addedToWorkspace', 'Added to workspace'), 'success');
        break;
      case 'reusePrompt':
        // Copy generation params back to create panel
        if (song.generationParams) {
          setReuseParams({ ...song.generationParams });
          setCurrentView('create');
          showToast(t('common.promptReused', 'Prompt loaded into creator'), 'success');
        }
        break;
      case 'useAsReference':
        // Set song audio as reference in create panel
        if (song.audioUrl) {
          setReuseParams(prev => ({
            ...(prev || {} as GenerationParams),
            referenceAudioUrl: song.audioUrl,
            referenceAudioTitle: song.title || 'Reference',
            customMode: true,
          } as GenerationParams));
          setCurrentView('create');
          showToast(t('common.setAsReference', 'Set as reference audio'), 'info');
        }
        break;
      case 'cover':
        // Set song as cover source
        if (song.audioUrl) {
          setReuseParams(prev => ({
            ...(prev || {} as GenerationParams),
            sourceAudioUrl: song.audioUrl,
            sourceAudioTitle: song.title || 'Source',
            taskType: 'cover',
            customMode: true,
          } as GenerationParams));
          setCurrentView('create');
          showToast(t('common.coverReady', 'Cover source loaded'), 'info');
        }
        break;
      case 'extractStems':
        setStemSong(song);
        break;
      case 'createVideo':
        showToast(t('common.videoComingSoon', 'Video creation coming soon'), 'info');
        break;
      case 'prepareTraining':
        setCurrentView('training');
        showToast(t('common.trainingPrepared', 'Switched to training view'), 'info');
        break;
      case 'download':
        if (song.audioUrl) {
          const url = song.audioUrl.startsWith('http') ? song.audioUrl : `/api/songs/${song.id}/audio`;
          const a = document.createElement('a');
          a.href = url;
          a.download = `${song.title || 'song'}.mp3`;
          a.click();
        }
        break;
      case 'share':
        if (navigator.share && song.audioUrl) {
          navigator.share({ title: song.title, url: song.audioUrl }).catch(() => {});
        } else {
          const shareUrl = `${window.location.origin}/song/${song.id}`;
          navigator.clipboard.writeText(shareUrl);
          showToast(t('common.linkCopied', 'Link copied to clipboard'), 'success');
        }
        break;
      default:
        break;
    }
  }, [playSong, toggleLike, deleteSong, showToast, t]);

  // ─── Download handler ───
  const handleDownload = useCallback((song: Song) => {
    if (song.audioUrl) {
      const url = song.audioUrl.startsWith('http') ? song.audioUrl : `/api/songs/${song.id}/audio`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.title || 'song'}.mp3`;
      a.click();
    }
  }, []);

  // ─── Songs with generating jobs merged ───
  const displaySongs = React.useMemo(() => {
    const generatingSongs: Song[] = jobs.map(job => ({
      id: job.jobId,
      title: job.stage || (job.status === 'pending' ? 'Queued...' : 'Generating...'),
      lyrics: '',
      style: '',
      coverUrl: '',
      duration: '',
      createdAt: new Date(),
      tags: [],
      isGenerating: true,
      progress: job.progress,
      stage: job.stage,
    }));
    return [...generatingSongs, ...songs];
  }, [jobs, songs]);

  // ─── Render views ───
  const renderContent = () => {
    switch (currentView) {
      case 'create':
        return (
          <div className="flex-1 flex overflow-hidden">
            <div style={{ width: panelWidth, minWidth: 320, maxWidth: 600 }} className="border-r border-surface-200 flex flex-col overflow-hidden">
              <CreatePanel
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                activeJobCount={jobs.length}
                reuseParams={reuseParams}
                onReuseConsumed={() => setReuseParams(null)}
                generationProgress={jobs[0]?.progress}
                generationStage={jobs[0]?.stage}
              />
            </div>
            {/* Resizable divider */}
            <div
              className={`panel-divider${isDraggingPanel ? ' active' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                setIsDraggingPanel(true);
                const startX = e.clientX;
                const startW = panelWidth;
                const onMove = (ev: MouseEvent) => {
                  const newW = Math.max(320, Math.min(600, startW + ev.clientX - startX));
                  setPanelWidth(newW);
                };
                const onUp = () => {
                  setIsDraggingPanel(false);
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-800">
                  {t('create.results')} <span className="text-surface-500 font-normal">({displaySongs.length})</span>
                </h2>
              </div>
              <ResultsPanel
                songs={displaySongs}
                currentSong={currentSong}
                isPlaying={isPlaying}
                onPlaySong={playSong}
                onDeleteSong={deleteSong}
                onMenuAction={handleMenuAction}
                onSelectSong={setDetailSong}
              />
            </div>
            {detailSong && (
              <SongDetailPanel
                song={detailSong}
                onClose={() => setDetailSong(null)}
                onPlay={playSong}
                onDownload={handleDownload}
                onLike={toggleLike}
              />
            )}
          </div>
        );
      case 'library':
        return (
          <div className="flex-1 flex overflow-hidden">
            <LibraryView
              songs={displaySongs}
              currentSong={currentSong}
              isPlaying={isPlaying}
              onPlaySong={playSong}
              onDeleteSong={deleteSong}
              onMenuAction={handleMenuAction}
              onSelectSong={setDetailSong}
            />
            {detailSong && (
              <SongDetailPanel
                song={detailSong}
                onClose={() => setDetailSong(null)}
                onPlay={playSong}
                onDownload={handleDownload}
                onLike={toggleLike}
              />
            )}
          </div>
        );
      case 'training':
        return <TrainingView />;
      case 'explore':
        return <ExploreView onSelectStyle={handleSelectStyle} />;
      case 'gpu':
        return <GpuMonitorView />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-surface-0 text-surface-900 overflow-hidden">
      <TopBar
        currentView={currentView}
        onNavigate={setCurrentView}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onOpenSettings={() => setSettingsOpen(true)}
        assistantOpen={assistantOpen}
        onToggleAssistant={() => setAssistantOpen(v => !v)}
      />

      <main className="flex-1 flex overflow-hidden">
        {renderContent()}
      </main>

      <PlayerBar
        song={currentSong}
        songs={songs}
        isPlaying={isPlaying}
        onPlayPause={togglePlay}
        onNext={playNext}
        onPrevious={playPrev}
        audioRef={audioRef}
        onSongEnd={playNext}
        isLiked={currentSong?.liked}
        onToggleLike={currentSong ? () => toggleLike(currentSong.id) : undefined}
      />

      <FloatingAssistant isOpen={assistantOpen} onToggle={() => setAssistantOpen(v => !v)} />

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <MetadataModal song={metadataSong} onClose={() => setMetadataSong(null)} />

      <StemSeparator song={stemSong} onClose={() => setStemSong(null)} />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
