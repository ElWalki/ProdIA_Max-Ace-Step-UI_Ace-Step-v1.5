import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download, Trash2, ListPlus, Share2, Pencil, Music2,
  Copy, FileAudio, Video, Scissors, RefreshCw, Dumbbell,
  Settings2,
} from 'lucide-react';

export interface SongMenuAction {
  key: string;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  divider?: boolean;
  hidden?: boolean;
}

interface SongContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (key: string) => void;
  isOwner?: boolean;
  hasAudioUrl?: boolean;
}

export default function SongContextMenu({ x, y, onClose, onAction, isOwner = true, hasAudioUrl = true }: SongContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, []);

  const actions: SongMenuAction[] = [
    { key: 'play', icon: <Music2 className="w-4 h-4" />, label: t('common.play') },
    { key: 'addToPlaylist', icon: <ListPlus className="w-4 h-4" />, label: t('common.addToWorkspace'), divider: true },
    { key: 'reusePrompt', icon: <RefreshCw className="w-4 h-4" />, label: t('common.reusePrompt') },
    { key: 'useAsReference', icon: <FileAudio className="w-4 h-4" />, label: t('common.useAsReference'), hidden: !hasAudioUrl },
    { key: 'cover', icon: <Copy className="w-4 h-4" />, label: t('common.coverSong'), hidden: !hasAudioUrl },
    { key: 'extractStems', icon: <Scissors className="w-4 h-4" />, label: t('common.extractStems'), hidden: !hasAudioUrl, divider: true },
    { key: 'createVideo', icon: <Video className="w-4 h-4" />, label: t('common.createVideo'), hidden: !hasAudioUrl },
    { key: 'prepareTraining', icon: <Dumbbell className="w-4 h-4" />, label: t('common.prepareTraining'), divider: true },
    { key: 'viewConfig', icon: <Settings2 className="w-4 h-4" />, label: t('common.viewConfig') },
    { key: 'editMetadata', icon: <Pencil className="w-4 h-4" />, label: t('common.editMetadata'), hidden: !isOwner },
    { key: 'download', icon: <Download className="w-4 h-4" />, label: t('common.download'), hidden: !hasAudioUrl },
    { key: 'share', icon: <Share2 className="w-4 h-4" />, label: t('common.share'), divider: true },
    { key: 'delete', icon: <Trash2 className="w-4 h-4" />, label: t('common.delete'), danger: true, hidden: !isOwner },
  ];

  const visibleActions = actions.filter(a => !a.hidden);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-[100] w-52 py-1.5 rounded-xl bg-surface-100 border border-surface-300/60
        shadow-2xl shadow-black/50 animate-scale-in"
    >
      {visibleActions.map((action, i) => (
        <React.Fragment key={action.key}>
          {action.divider && i > 0 && (
            <div className="h-px bg-surface-300/40 my-1 mx-3" />
          )}
          <button
            onClick={() => { onAction(action.key); onClose(); }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors
              ${action.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-surface-800 hover:bg-surface-200 hover:text-surface-950'
              }`}
          >
            <span className={action.danger ? 'text-red-400' : 'text-surface-500'}>{action.icon}</span>
            {action.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
