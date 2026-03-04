import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Search, Star, ChevronDown, FolderOpen, Loader2, X, GripVertical, Check, RefreshCw, FolderPlus, Trash2, Settings } from 'lucide-react';
import { generateApi } from '../services/api';
import { EditableSlider } from './EditableSlider';
import { useI18n } from '../context/I18nContext';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LoraVariant {
  label: string;
  path: string;
  epoch?: number;
}

export interface LoraEntry {
  name: string;
  source: 'library' | 'output';
  sourceDir: string;
  variants: LoraVariant[];
  metadata?: { trigger_tag?: string; tag_position?: string; description?: string; [key: string]: unknown };
  baseModel?: string;
}

interface LoraManagerProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  // Current LoRA state from CreatePanel
  loraLoaded: boolean;
  loraEnabled: boolean;
  loraScale: number;
  loraPath: string;
  loraTriggerTag: string;
  loraTagPosition: string;
  selectedLoraName: string;
  selectedLoraVariant: string;
  isLoraLoading: boolean;
  loraError: string | null;
  // Handlers from CreatePanel
  onLoadLora: (path: string, name: string, variant: string) => void;
  onUnloadLora: () => void;
  onSetScale: (scale: number) => void;
  onToggleEnabled: () => void;
  onSetTagPosition: (pos: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getModelType(baseModel?: string): { label: string; color: string } {
  if (!baseModel) return { label: 'unknown', color: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' };
  const lower = baseModel.toLowerCase();
  if (lower.includes('turbo')) return { label: 'turbo', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' };
  if (lower.includes('sft')) return { label: 'sft', color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' };
  if (lower.includes('base')) return { label: 'base', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' };
  return { label: baseModel.split('/').pop() || 'custom', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' };
}

const FAVORITES_KEY = 'ace-lora-favorites';
const DIRECTORIES_KEY = 'ace-lora-directories';

function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

function loadDirectories(): string[] {
  try {
    const stored = localStorage.getItem(DIRECTORIES_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch { return []; }
}

function saveDirectories(dirs: string[]) {
  localStorage.setItem(DIRECTORIES_KEY, JSON.stringify(dirs));
}

// ─── Component ──────────────────────────────────────────────────────────────

export const LoraManager: React.FC<LoraManagerProps> = ({
  visible,
  onClose,
  token,
  loraLoaded,
  loraEnabled,
  loraScale,
  loraPath,
  loraTriggerTag,
  loraTagPosition,
  selectedLoraName,
  selectedLoraVariant,
  isLoraLoading,
  loraError,
  onLoadLora,
  onUnloadLora,
  onSetScale,
  onToggleEnabled,
  onSetTagPosition,
}) => {
  // ─── State ──────────────────────────────────────────────────────────────
  const { t } = useI18n();
  const [loraList, setLoraList] = useState<LoraEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());
  const [expandedLora, setExpandedLora] = useState<string | null>(null);

  // Directory management
  const [loraDirectories, setLoraDirectories] = useState<string[]>(() => loadDirectories());
  const [defaultDirectory, setDefaultDirectory] = useState<string>('');
  const [newDirInput, setNewDirInput] = useState('');
  const [dirManagerOpen, setDirManagerOpen] = useState(false);
  const [dirValidating, setDirValidating] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lora: LoraEntry; variant?: LoraVariant } | null>(null);

  // Activation confirmation
  const [pendingActivation, setPendingActivation] = useState<{ lora: LoraEntry; variant: LoraVariant; scale: number } | null>(null);

  // Dragging
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ─── Initialize position ────────────────────────────────────────────────
  useEffect(() => {
    if (visible && position.x === -1) {
      setPosition({
        x: Math.max(50, (window.innerWidth - 420) / 2),
        y: Math.max(50, (window.innerHeight - 600) / 2),
      });
    }
  }, [visible]);

  // ─── Fetch LoRA list ────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    try {
      const result = await generateApi.listLoras(token, loraDirectories.length > 0 ? loraDirectories : undefined);
      setLoraList(result.loras || []);
      if (result.defaultDirectory) {
        setDefaultDirectory(result.defaultDirectory);
      }
    } catch (err) {
      console.error('[LoraManager] Failed to fetch list:', err);
    } finally {
      setListLoading(false);
    }
  }, [token, loraDirectories]);

  // ─── Directory management handlers ──────────────────────────────────────
  const handleAddDirectory = useCallback(async () => {
    if (!newDirInput.trim()) return;
    const dir = newDirInput.trim();
    
    // Check if already added
    if (loraDirectories.includes(dir)) {
      setDirError(t('loraManager.dirAlreadyAdded'));
      return;
    }
    
    setDirValidating(true);
    setDirError(null);
    try {
      const result = await generateApi.validateLoraDir(dir, token);
      if (!result.valid) {
        setDirError(result.error || 'Invalid directory');
        return;
      }
      const newDirs = [...loraDirectories, dir];
      setLoraDirectories(newDirs);
      saveDirectories(newDirs);
      setNewDirInput('');
    } catch (err) {
      setDirError(err instanceof Error ? err.message : t('loraManager.dirValidationFailed'));
    } finally {
      setDirValidating(false);
    }
  }, [newDirInput, loraDirectories, token]);

  const handleRemoveDirectory = useCallback((dir: string) => {
    const newDirs = loraDirectories.filter(d => d !== dir);
    setLoraDirectories(newDirs);
    saveDirectories(newDirs);
  }, [loraDirectories]);

  // Refetch when directories change
  useEffect(() => {
    if (visible && token) {
      fetchList();
    }
  }, [loraDirectories]);

  useEffect(() => {
    if (visible && loraList.length === 0) fetchList();
  }, [visible, fetchList]);

  // ─── Sorted & filtered list ─────────────────────────────────────────────
  const filteredLoras = useMemo(() => {
    let list = [...loraList];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.metadata?.trigger_tag || '').toLowerCase().includes(q) ||
        (l.baseModel || '').toLowerCase().includes(q) ||
        l.source.includes(q)
      );
    }
    // Sort: favorites first, then alphabetical
    list.sort((a, b) => {
      const aFav = favorites.has(a.name) ? 0 : 1;
      const bFav = favorites.has(b.name) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [loraList, searchQuery, favorites]);

  // ─── Favorites ──────────────────────────────────────────────────────────
  const toggleFavorite = useCallback((name: string) => {
    setFavorites((prev: Set<string>) => {
      const next = new Set<string>(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveFavorites(next);
      return next;
    });
  }, []);

  // ─── Context menu ───────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, lora: LoraEntry, variant?: LoraVariant) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, lora, variant: variant || lora.variants[0] });
  }, []);

  // Close context menu on click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // ─── Drag handling ──────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, button, select, [role="slider"]')) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 100, dragStartRef.current.posX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragStartRef.current.posY + dy)),
      });
    };
    const handleUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  // ─── Activation ─────────────────────────────────────────────────────────
  const handleActivate = useCallback((lora: LoraEntry, variant: LoraVariant) => {
    setPendingActivation({ lora, variant, scale: 1.0 });
    setContextMenu(null);
  }, []);

  const confirmActivation = useCallback(() => {
    if (!pendingActivation) return;
    const { lora, variant, scale } = pendingActivation;
    onSetScale(scale);
    onLoadLora(variant.path, lora.name, variant.label);
    setPendingActivation(null);
  }, [pendingActivation, onLoadLora, onSetScale]);

  // ─── Open folder ────────────────────────────────────────────────────────
  const handleOpenFolder = useCallback(async (folderPath: string) => {
    try {
      await generateApi.openLoraFolder({ folderPath }, token);
    } catch (err) {
      console.error('[LoraManager] Failed to open folder:', err);
    }
    setContextMenu(null);
  }, [token]);

  // ─── Render ─────────────────────────────────────────────────────────────
  if (!visible) return null;

  const isActive = (lora: LoraEntry, variant?: LoraVariant) => {
    if (!loraLoaded) return false;
    if (variant) return loraPath === variant.path;
    return lora.name === selectedLoraName || lora.variants.some(v => v.path === loraPath);
  };

  const panel = (
    <>
      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed z-[9999] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 overflow-hidden"
        style={{
          left: position.x,
          top: position.y,
          width: 400,
          maxHeight: 'min(80vh, 700px)',
          userSelect: isDragging ? 'none' : 'auto',
        }}
      >
        {/* Header — draggable */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-blue-500/10 dark:from-violet-500/5 dark:via-purple-500/5 dark:to-blue-500/5 border-b border-zinc-200 dark:border-zinc-700 cursor-move"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-zinc-400" />
            <span className="text-sm font-bold text-zinc-800 dark:text-white">{t('loraManager.title')}</span>
            {loraLoaded && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] font-semibold text-green-700 dark:text-green-400 truncate max-w-[120px]">
                  {selectedLoraName || t('loraManager.activeBadge')}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDirManagerOpen(!dirManagerOpen)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                dirManagerOpen
                  ? 'text-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={t('loraManager.manageDirsTooltip')}
            >
              <Settings size={14} />
            </button>
            <button
              onClick={fetchList}
              disabled={listLoading}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={t('loraManager.refreshTooltip')}
            >
              {listLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title={t('loraManager.closeTooltip')}  
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Directory Manager Panel */}
        {dirManagerOpen && (
          <div className="px-4 py-3 bg-purple-50/50 dark:bg-purple-900/10 border-b border-zinc-200 dark:border-zinc-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">{t('loraManager.dirManagerTitle')}</span>
              <span className="text-[9px] text-zinc-500 dark:text-zinc-400">{loraDirectories.length + 1} folder{loraDirectories.length !== 0 ? 's' : ''}</span>
            </div>
            
            {/* Default directory - always shown */}
            {defaultDirectory && (
              <div className="flex items-center gap-2 px-2 py-1.5 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg">
                <FolderOpen size={12} className="text-zinc-400 shrink-0" />
                <span className="text-[10px] text-zinc-600 dark:text-zinc-300 truncate flex-1" title={defaultDirectory}>
                  {defaultDirectory.split(/[\\/]/).slice(-2).join('/')}
                </span>
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 font-medium">{t('loraManager.dirDefaultBadge')}</span>
              </div>
            )}
            
            {/* Custom directories */}
            {loraDirectories.map((dir, idx) => (
              <div key={idx} className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <FolderOpen size={12} className="text-purple-400 shrink-0" />
                <span className="text-[10px] text-zinc-600 dark:text-zinc-300 truncate flex-1" title={dir}>
                  {dir.split(/[\\/]/).slice(-2).join('/')}
                </span>
                <button
                  onClick={() => handleRemoveDirectory(dir)}
                  className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title={t('loraManager.dirRemoveTooltip')}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
            
            {/* Add new directory */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDirInput}
                onChange={(e) => { setNewDirInput(e.target.value); setDirError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDirectory()}
                placeholder={t('loraManager.dirInputPlaceholder')}
                className="flex-1 min-w-0 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-[10px] text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
              />
              <button
                onClick={handleAddDirectory}
                disabled={dirValidating || !newDirInput.trim()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-[10px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dirValidating ? <Loader2 size={10} className="animate-spin" /> : <FolderPlus size={10} />}
                {t('loraManager.dirAddButton')}
              </button>
            </div>
            
            {/* Error message */}
            {dirError && (
              <p className="text-[9px] text-red-500 dark:text-red-400">{dirError}</p>
            )}
          </div>
        )}

        {/* Active LoRA controls */}
        {loraLoaded && (
          <div className="px-4 py-2.5 bg-green-50/50 dark:bg-green-900/10 border-b border-zinc-200 dark:border-zinc-700 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">{t('loraManager.activeSectionTitle')}</span>
                {loraTriggerTag && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                    🏷️ {loraTriggerTag}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onToggleEnabled}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${
                    loraEnabled
                      ? 'bg-green-500 text-white'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {loraEnabled ? t('loraManager.enableOn') : t('loraManager.enableOff')}
                </button>
                <button
                  onClick={onUnloadLora}
                  disabled={isLoraLoading}
                  className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-40"
                >
                  {isLoraLoading ? '...' : t('loraManager.unloadButton')}
                </button>
              </div>
            </div>
            {/* Scale slider */}
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400 w-10 shrink-0">{t('loraManager.scaleLabel')}</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={loraScale}
                onChange={(e) => onSetScale(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-green-500"
              />
              <span className="text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-300 w-8 text-right">{loraScale.toFixed(2)}</span>
            </div>
            {/* Tag position */}
            {loraTriggerTag && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400 w-10 shrink-0">{t('loraManager.tagLabel')}</span>
                <div className="flex gap-1">
                  {(['prepend', 'append', 'off'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => onSetTagPosition(mode)}
                      className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                        loraTagPosition === mode
                          ? 'bg-purple-500 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {mode === 'prepend' ? t('loraManager.tagPrepend') : mode === 'append' ? t('loraManager.tagAppend') : t('loraManager.tagOff')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('loraManager.searchPlaceholder')}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Error banner */}
        {loraError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/30">
            <p className="text-[10px] text-red-600 dark:text-red-400">{loraError}</p>
          </div>
        )}

        {/* LoRA List */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
          {listLoading && loraList.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          ) : filteredLoras.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-500">
              <span className="text-xs">{t('loraManager.noLorasFound')}</span>
              <button onClick={fetchList} className="text-[10px] text-violet-500 hover:underline mt-1">{t('loraManager.refreshLink')}</button>
            </div>
          ) : (
            <div className="py-1">
              {filteredLoras.map((lora) => {
                const active = isActive(lora);
                const isFav = favorites.has(lora.name);
                const expanded = expandedLora === lora.name;
                const modelType = getModelType(lora.baseModel);

                return (
                  <div key={`${lora.source}-${lora.name}`}>
                    {/* LoRA item */}
                    <div
                      className={`group px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                        active
                          ? 'bg-green-50 dark:bg-green-900/15 border-l-2 border-green-500'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-l-2 border-transparent'
                      }`}
                      onClick={() => setExpandedLora(expanded ? null : lora.name)}
                      onContextMenu={(e) => handleContextMenu(e, lora)}
                    >
                      {/* Favorite star */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(lora.name); }}
                        className={`shrink-0 transition-colors ${
                          isFav ? 'text-amber-400' : 'text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100'
                        }`}
                        title={isFav ? t('loraManager.favoriteTooltipRemove') : t('loraManager.favoriteTooltipAdd')}
                      >
                        <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
                      </button>

                      {/* Name + badges */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-semibold truncate ${active ? 'text-green-700 dark:text-green-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                            {lora.name}
                          </span>
                          {active && <Check size={11} className="text-green-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`inline-flex items-center px-1.5 py-0 rounded text-[8px] font-bold uppercase ${modelType.color}`}>
                            {modelType.label}
                          </span>
                          <span className="text-[8px] text-zinc-400 dark:text-zinc-500">
                            {lora.source === 'library' ? '📚' : '🔧'} {lora.variants.length} variant{lora.variants.length !== 1 ? 's' : ''}
                          </span>
                          {lora.metadata?.trigger_tag && (
                            <span className="text-[8px] text-purple-500 dark:text-purple-400">🏷️ {lora.metadata.trigger_tag as string}</span>
                          )}
                        </div>
                      </div>

                      {/* Expand arrow */}
                      <ChevronDown size={12} className={`text-zinc-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Expanded: variants list */}
                    {expanded && (
                      <div className="bg-zinc-50/50 dark:bg-zinc-800/30 border-t border-b border-zinc-100 dark:border-zinc-800">
                        {lora.variants.map((variant) => {
                          const vActive = loraLoaded && loraPath === variant.path;
                          return (
                            <div
                              key={variant.label}
                              className={`px-6 py-1.5 flex items-center gap-2 cursor-pointer transition-colors ${
                                vActive
                                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'
                              }`}
                              onClick={(e) => { e.stopPropagation(); handleActivate(lora, variant); }}
                              onContextMenu={(e) => handleContextMenu(e, lora, variant)}
                            >
                              <span className="text-[10px]">{variant.label === 'final' ? '⭐' : '📍'}</span>
                              <span className="text-[10px] font-medium flex-1 truncate">
                                {variant.label === 'final' ? t('loraManager.variantFinal') : variant.label}
                              </span>
                              {vActive && <Check size={10} className="text-green-500 shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — count */}
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
            {filteredLoras.length} LoRA{filteredLoras.length !== 1 ? 's' : ''} · {favorites.size} ★
          </span>
          <span className="text-[8px] text-zinc-400 dark:text-zinc-500">{t('loraManager.rightClickHint')}</span>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[10000] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl shadow-black/20 py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Activate / Deactivate */}
          {loraLoaded && isActive(contextMenu.lora, contextMenu.variant) ? (
            <button
              onClick={() => { onUnloadLora(); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <X size={12} /> {t('loraManager.contextDeactivate')}
            </button>
          ) : (
            <button
              onClick={() => { if (contextMenu.variant) handleActivate(contextMenu.lora, contextMenu.variant); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
            >
              <Check size={12} /> {t('loraManager.contextActivate')}
            </button>
          )}

          {/* Favorite */}
          <button
            onClick={() => { toggleFavorite(contextMenu.lora.name); setContextMenu(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            <Star size={12} fill={favorites.has(contextMenu.lora.name) ? 'currentColor' : 'none'} />
            {favorites.has(contextMenu.lora.name) ? t('loraManager.contextRemoveFavorite') : t('loraManager.contextAddFavorite')}
          </button>

          <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />

          {/* Open folder */}
          <button
            onClick={() => {
              const folderPath = contextMenu.variant?.path || contextMenu.lora.variants[0]?.path;
              if (folderPath) handleOpenFolder(folderPath);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <FolderOpen size={12} /> {t('loraManager.contextOpenExplorer')}
          </button>
        </div>
      )}

      {/* Activation confirmation dialog */}
      {pendingActivation && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl w-[340px] overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{t('loraManager.activationDialogTitle')}</h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                {t('loraManager.activationLoadLabel')} <strong className="text-zinc-800 dark:text-zinc-200">{pendingActivation.lora.name}</strong>
                {pendingActivation.variant.label !== 'final' && (
                  <> · <span className="text-purple-500">{pendingActivation.variant.label}</span></>
                )}
              </p>
            </div>

            {/* Scale slider */}
            <div className="px-5 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">{t('loraManager.activationScaleLabel')}</span>
                <span className="text-[11px] font-mono font-bold text-zinc-700 dark:text-zinc-300">{pendingActivation.scale.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={pendingActivation.scale}
                onChange={(e) => setPendingActivation(prev => prev ? { ...prev, scale: parseFloat(e.target.value) } : null)}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-violet-500"
              />
              <div className="flex justify-between text-[8px] text-zinc-400">
                <span>0.00</span>
                <span>1.00</span>
                <span>2.00</span>
              </div>
            </div>

            {/* Info badges */}
            <div className="px-5 pb-3 flex flex-wrap gap-1.5">
              {(() => {
                const mt = getModelType(pendingActivation.lora.baseModel);
                return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold ${mt.color}`}>{mt.label}</span>;
              })()}
              {pendingActivation.lora.metadata?.trigger_tag && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                  🏷️ {pendingActivation.lora.metadata.trigger_tag as string}
                </span>
              )}
            </div>

            {/* If another LoRA is loaded, warn */}
            {loraLoaded && (
              <div className="px-5 pb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
                  <span className="text-[10px] text-amber-700 dark:text-amber-300">{t('loraManager.activationWarnUnload')}</span>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="px-5 py-3 flex gap-2 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
              <button
                onClick={() => setPendingActivation(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmActivation}
                disabled={isLoraLoading}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/20 transition-colors disabled:opacity-40"
              >
                {isLoraLoading ? t('loraManager.loadingButton') : t('loraManager.activateButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return ReactDOM.createPortal(panel, document.body);
};
