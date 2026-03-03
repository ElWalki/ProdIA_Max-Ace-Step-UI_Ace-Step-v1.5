import React, { useState, useEffect } from 'react';
import { X, Music2, Search, Loader2 } from 'lucide-react';
import { Song } from '../types';
import { songsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface SongLyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (song: Song, lyrics: string) => void;
}

export function SongLyricsModal({ isOpen, onClose, onSelectSong }: SongLyricsModalProps) {
  const { token } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editedLyrics, setEditedLyrics] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSongs();
    }
  }, [isOpen]);

  const loadSongs = async () => {
    setLoading(true);
    try {
      const { songs: allSongs } = await songsApi.getMySongs(token!);
      // Filter songs that have lyrics
      setSongs(allSongs.filter(song => song.lyrics && song.lyrics.trim().length > 0));
    } catch (error) {
      console.error('Failed to load songs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSongs = songs.filter(song =>
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (song.style && song.style.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSelectSong = (song: Song) => {
    setSelectedSong(song);
    setEditedLyrics(song.lyrics || '');
  };

  const handleConfirm = () => {
    if (selectedSong) {
      onSelectSong(selectedSong, editedLyrics);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
              {selectedSong ? 'Edit Lyrics' : 'Select Song'}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {selectedSong ? 'Review and edit the lyrics before generating' : 'Choose a song to extract lyrics from'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-zinc-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {!selectedSong ? (
            <div className="flex-1 flex flex-col">
              {/* Search */}
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search songs..."
                    className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Song List */}
              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                  </div>
                ) : filteredSongs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                    <Music2 size={48} className="mb-4 opacity-50" />
                    <p className="text-sm">
                      {searchQuery ? 'No songs found' : 'No songs with lyrics found'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {filteredSongs.map(song => (
                      <button
                        key={song.id}
                        onClick={() => handleSelectSong(song)}
                        className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-left group"
                      >
                        <div
                          className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0 flex items-center justify-center"
                          style={song.coverUrl ? { backgroundImage: `url(${song.coverUrl})`, backgroundSize: 'cover' } : {}}
                        >
                          {!song.coverUrl && <Music2 size={20} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-zinc-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {song.title}
                          </div>
                          {song.style && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                              {song.style}
                            </div>
                          )}
                          <div className="text-xs text-zinc-400 mt-1 line-clamp-2">
                            {song.lyrics?.substring(0, 100)}...
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-6">
              {/* Selected Song Info */}
              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div
                  className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0 flex items-center justify-center"
                  style={selectedSong.coverUrl ? { backgroundImage: `url(${selectedSong.coverUrl})`, backgroundSize: 'cover' } : {}}
                >
                  {!selectedSong.coverUrl && <Music2 size={20} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-900 dark:text-white truncate">
                    {selectedSong.title}
                  </div>
                  {selectedSong.style && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {selectedSong.style}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedSong(null)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Change Song
                </button>
              </div>

              {/* Lyrics Editor */}
              <div className="flex-1 flex flex-col">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Lyrics (edit as needed)
                </label>
                <textarea
                  value={editedLyrics}
                  onChange={(e) => setEditedLyrics(e.target.value)}
                  className="flex-1 p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter lyrics..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedSong && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!editedLyrics.trim()}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Use These Lyrics
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
