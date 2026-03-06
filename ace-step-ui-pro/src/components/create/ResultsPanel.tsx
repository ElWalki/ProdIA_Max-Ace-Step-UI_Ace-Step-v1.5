import React, { useCallback, memo, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Heart, ArrowUpDown, SortAsc, SortDesc, ThumbsDown } from 'lucide-react';
import type { Song } from '../../types';
import SongCard from './SongCard';
import PaginationBar from '../ui/PaginationBar';

const LS_PAGE_SIZE = 'ace-results-pageSize';
const getInitPageSize = () => { try { return Number(localStorage.getItem(LS_PAGE_SIZE)) || 20; } catch { return 20; } };

type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';
type FilterKey = 'all' | 'liked' | 'disliked';

interface ResultsPanelProps {
  songs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onDeleteSong: (id: string) => void;
  onMenuAction?: (action: string, song: Song) => void;
  onSelectSong?: (song: Song) => void;
}

export default memo(function ResultsPanel({ songs, currentSong, isPlaying, onPlaySong, onDeleteSong, onMenuAction, onSelectSong }: ResultsPanelProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getInitPageSize);
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');

  const handlePageSizeChange = useCallback((s: number) => {
    setPageSize(s);
    localStorage.setItem(LS_PAGE_SIZE, String(s));
  }, []);

  const processed = useMemo(() => {
    let list = [...songs];

    // Filter
    if (filterKey === 'liked') list = list.filter(s => s.liked);
    else if (filterKey === 'disliked') list = list.filter(s => !s.liked && s.liked !== undefined);

    // Sort
    switch (sortKey) {
      case 'date-desc': list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'date-asc': list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case 'name-asc': list.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
      case 'name-desc': list.sort((a, b) => (b.title || '').localeCompare(a.title || '')); break;
    }
    return list;
  }, [songs, sortKey, filterKey]);

  // Reset page when data changes
  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = processed.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (songs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-surface-500 gap-3">
        <div className="w-16 h-16 rounded-full bg-surface-100 flex items-center justify-center">
          <Music className="w-8 h-8 text-surface-400" />
        </div>
        <p className="text-sm">{t('library.empty')}</p>
      </div>
    );
  }

  const sortOptions: { key: SortKey; label: string; icon: React.ReactNode }[] = [
    { key: 'date-desc', label: t('sort.newest', 'Newest'), icon: <SortDesc className="w-3 h-3" /> },
    { key: 'date-asc', label: t('sort.oldest', 'Oldest'), icon: <SortAsc className="w-3 h-3" /> },
    { key: 'name-asc', label: 'A → Z', icon: <SortAsc className="w-3 h-3" /> },
    { key: 'name-desc', label: 'Z → A', icon: <SortDesc className="w-3 h-3" /> },
  ];

  const filterOptions: { key: FilterKey; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: t('library.all', 'All'), icon: <Music className="w-3 h-3" /> },
    { key: 'liked', label: t('library.liked', 'Liked'), icon: <Heart className="w-3 h-3" /> },
    { key: 'disliked', label: t('sort.disliked', 'Disliked'), icon: <ThumbsDown className="w-3 h-3" /> },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sort & Filter bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-surface-200/60">
        {/* Filters */}
        {filterOptions.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilterKey(f.key); setPage(1); }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              filterKey === f.key
                ? 'bg-accent-500/15 text-accent-400'
                : 'text-surface-400 hover:bg-surface-100 hover:text-surface-600'
            }`}
          >
            {f.icon} {f.label}
          </button>
        ))}
        <div className="flex-1" />
        {/* Sort */}
        <ArrowUpDown className="w-3 h-3 text-surface-400" />
        <select
          value={sortKey}
          onChange={e => { setSortKey(e.target.value as SortKey); setPage(1); }}
          className="bg-surface-100 border border-surface-300 rounded px-1.5 py-0.5 text-[10px] text-surface-600"
        >
          {sortOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {visible.map(song => (
          <SongCard
            key={song.id}
            song={song}
            isPlaying={isPlaying && currentSong?.id === song.id}
            isCurrent={currentSong?.id === song.id}
            onPlay={() => onPlaySong(song)}
            onDelete={() => onDeleteSong(song.id)}
            onMenuAction={onMenuAction ? (action: string) => onMenuAction(action, song) : undefined}
            onSelect={onSelectSong ? () => onSelectSong(song) : undefined}
          />
        ))}
      </div>

      {/* Pagination */}
      <div className="border-t border-surface-200/60">
        <PaginationBar
          total={processed.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  );
})
