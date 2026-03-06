import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Grid3X3, List, Heart, Clock, Music, ArrowUpDown, SortAsc, SortDesc, ThumbsDown } from 'lucide-react';
import type { Song } from '../../types';
import SongCard from '../create/SongCard';
import PaginationBar from '../ui/PaginationBar';
import { getCoverStyle } from '../../utils/coverArt';

const LS_PAGE_SIZE = 'ace-library-pageSize';
const getInitPageSize = () => { try { return Number(localStorage.getItem(LS_PAGE_SIZE)) || 20; } catch { return 20; } };

type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';
type FilterKey = 'all' | 'liked' | 'disliked';

interface LibraryViewProps {
  songs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onDeleteSong: (id: string) => void;
  onMenuAction?: (action: string, song: Song) => void;
  onSelectSong?: (song: Song) => void;
}

export default function LibraryView({ songs, currentSong, isPlaying, onPlaySong, onDeleteSong, onMenuAction, onSelectSong }: LibraryViewProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [gridView, setGridView] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getInitPageSize);

  const handlePageSizeChange = useCallback((s: number) => {
    setPageSize(s);
    localStorage.setItem(LS_PAGE_SIZE, String(s));
  }, []);

  const filtered = useMemo(() => {
    let list = [...songs];

    // Filter
    if (filterKey === 'liked') list = list.filter(s => s.liked);
    else if (filterKey === 'disliked') list = list.filter(s => !s.liked && s.liked !== undefined);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.style?.toLowerCase().includes(q) ||
        s.lyrics?.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortKey) {
      case 'date-desc': list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'date-asc': list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case 'name-asc': list.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
      case 'name-desc': list.sort((a, b) => (b.title || '').localeCompare(a.title || '')); break;
    }

    return list;
  }, [songs, filterKey, sortKey, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const filterOptions: { key: FilterKey; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: t('library.allSongs'), icon: <Music className="w-4 h-4" /> },
    { key: 'liked', label: t('library.liked'), icon: <Heart className="w-4 h-4" /> },
    { key: 'disliked', label: t('sort.disliked', 'Disliked'), icon: <ThumbsDown className="w-4 h-4" /> },
  ];

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'date-desc', label: t('sort.newest', 'Newest') },
    { key: 'date-asc', label: t('sort.oldest', 'Oldest') },
    { key: 'name-asc', label: 'A → Z' },
    { key: 'name-desc', label: 'Z → A' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 space-y-4">
        <h1 className="text-2xl font-bold text-surface-950">{t('library.workspace', 'Workspace')}</h1>

        {/* Search + view toggle + sort */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('library.search')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-100 border border-surface-300
                text-sm text-surface-900 placeholder:text-surface-500
                focus:outline-none focus:border-accent-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-surface-400" />
            <select
              value={sortKey}
              onChange={e => { setSortKey(e.target.value as SortKey); setPage(1); }}
              className="bg-surface-100 border border-surface-300 rounded-lg px-2 py-2 text-xs text-surface-600"
            >
              {sortOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <button
            onClick={() => setGridView(!gridView)}
            className="p-2.5 rounded-xl bg-surface-100 border border-surface-300
              text-surface-400 hover:text-surface-800 transition-colors"
          >
            {gridView ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {filterOptions.map(f => (
            <button
              key={f.key}
              onClick={() => { setFilterKey(f.key); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterKey === f.key
                  ? 'bg-accent-600 text-white'
                  : 'bg-surface-100 text-surface-400 hover:text-surface-800 border border-surface-300'
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-surface-500 self-center">
            {filtered.length} {t('library.songs')}
          </span>
        </div>
      </div>

      {/* Song list */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-surface-400 gap-3">
          <Music className="w-12 h-12 text-surface-500" />
          <p className="text-sm">{search ? t('library.noResults') : t('library.empty')}</p>
        </div>
      ) : gridView ? (
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {visible.map(song => (
              <div
                key={song.id}
                onClick={() => onSelectSong ? onSelectSong(song) : onPlaySong(song)}
                onDoubleClick={() => onPlaySong(song)}
                className="group bg-surface-100/60 rounded-xl p-3 border border-surface-300/40
                  hover:bg-surface-100 hover:border-surface-400 transition-all cursor-pointer"
              >
                <div className="aspect-square rounded-lg overflow-hidden
                  flex items-center justify-center mb-3">
                  {song.coverUrl ? (
                    <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={getCoverStyle(song.id)}>
                      <Music className="w-8 h-8 text-white/40" />
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-surface-900 truncate">{song.title || 'Untitled'}</p>
                <p className="text-xs text-surface-500 truncate mt-0.5">{song.style || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1">
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
      )}

      {/* Pagination */}
      <div className="border-t border-surface-200/60 px-4">
        <PaginationBar
          total={filtered.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  );
}

