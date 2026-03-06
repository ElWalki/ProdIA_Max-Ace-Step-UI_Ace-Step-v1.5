import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Search, Star, Loader2, ChevronDown, ChevronRight,
  Power, Trash2, FolderOpen, Sliders, Tag, Link, FileText,
} from 'lucide-react';
import { generateApi } from '../../services/api';

interface LoraVariant {
  label: string;
  path: string;
  epoch?: number;
}

interface LoraEntry {
  name: string;
  source: string;
  sourceDir: string;
  variants: LoraVariant[];
  metadata?: { trigger_tag?: string; tag_position?: string; description?: string; [k: string]: unknown };
  baseModel?: string;
}

interface LoraManagerProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  loraLoaded: boolean;
  loraEnabled: boolean;
  loraScale: number;
  loraPath: string;
  loraTriggerTag: string;
  loraTagPosition: string;
  selectedLoraName: string;
  onLoadLora: (path: string, name: string, variant: string) => void;
  onUnloadLora: () => void;
  onSetScale: (scale: number) => void;
  onToggleEnabled: () => void;
  onSetTagPosition: (pos: string) => void;
}

const LS_FAVS = 'ace-lora-favorites';
const loadFavs = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(LS_FAVS) || '[]')); }
  catch { return new Set(); }
};
const saveFavs = (s: Set<string>) => localStorage.setItem(LS_FAVS, JSON.stringify([...s]));

export default function LoraManager({
  isOpen, onClose, token,
  loraLoaded, loraEnabled, loraScale, loraPath,
  loraTriggerTag, loraTagPosition, selectedLoraName,
  onLoadLora, onUnloadLora, onSetScale, onToggleEnabled, onSetTagPosition,
}: LoraManagerProps) {
  const { t } = useTranslation();
  const [loraList, setLoraList] = useState<LoraEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(loadFavs);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState('');
  const [selectedLora, setSelectedLora] = useState<string | null>(null);
  const [confirmLoad, setConfirmLoad] = useState<{ lora: LoraEntry; variant: LoraVariant } | null>(null);
  const [confirmScale, setConfirmScale] = useState(1.0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lora: LoraEntry } | null>(null);
  const scaleDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await generateApi.listLoras(token, undefined);
      setLoraList(res.loras ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { if (isOpen) fetchList(); }, [isOpen, fetchList]);

  const toggleFav = useCallback((name: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      saveFavs(next);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = q ? loraList.filter(l => l.name.toLowerCase().includes(q)) : loraList;
    return [...list].sort((a, b) => {
      const fa = favorites.has(a.name) ? 0 : 1;
      const fb = favorites.has(b.name) ? 0 : 1;
      return fa - fb || a.name.localeCompare(b.name);
    });
  }, [loraList, search, favorites]);

  const handleScaleInput = useCallback((v: number) => {
    onSetScale(v);
    clearTimeout(scaleDebounce.current);
    scaleDebounce.current = setTimeout(() => {
      generateApi.setLoraScale({ scale: v }, token).catch(() => {});
    }, 300);
  }, [onSetScale, token]);

  const handleSelectVariant = useCallback((lora: LoraEntry, variant: LoraVariant) => {
    setConfirmLoad({ lora, variant });
    setConfirmScale(loraScale);
  }, [loraScale]);

  const handleConfirmLoad = useCallback(() => {
    if (!confirmLoad) return;
    onSetScale(confirmScale);
    generateApi.setLoraScale({ scale: confirmScale }, token).catch(() => {});
    onLoadLora(confirmLoad.variant.path, confirmLoad.lora.name, confirmLoad.variant.label);
    setConfirmLoad(null);
  }, [confirmLoad, confirmScale, onLoadLora, onSetScale, token]);

  const handleLoadFromPath = useCallback(() => {
    const p = customPath.trim();
    if (!p) return;
    const name = p.split(/[\\/]/).pop()?.replace(/\.(safetensors|pt|bin|ckpt)$/, '') || 'Custom LoRA';
    onLoadLora(p, name, 'custom');
    setCustomPath('');
  }, [customPath, onLoadLora]);

  const handleContextMenuAction = useCallback((lora: LoraEntry) => {
    setContextMenu(null);
    // Copy path to clipboard
    const path = lora.variants[0]?.path || lora.sourceDir || '';
    if (path) navigator.clipboard.writeText(path);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-50 border border-surface-300 rounded-2xl w-[440px] max-h-[80vh] flex flex-col
        animate-scale-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-brand-400" />
            {t('lora.manager', 'LoRA Manager')}
          </h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active LoRA status bar */}
        {loraLoaded && (
          <div className="px-4 py-2.5 bg-accent-500/5 border-b border-surface-200 space-y-2">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-xs font-medium text-accent-400 truncate">{selectedLoraName}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onToggleEnabled}
                  className={`p-1 rounded transition-colors ${
                    loraEnabled ? 'text-green-400 hover:text-green-300' : 'text-surface-400 hover:text-surface-600'
                  }`}
                  title={loraEnabled ? 'Disable' : 'Enable'}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onUnloadLora}
                  className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors"
                  title="Unload"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scale */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-surface-500 w-10">Scale</span>
              <input
                type="range" min={0} max={2} step={0.05}
                value={loraScale}
                onChange={e => handleScaleInput(parseFloat(e.target.value))}
                className="flex-1 accent-accent-500 h-1"
              />
              <span className="text-[10px] text-surface-600 w-7 text-right font-mono">{loraScale.toFixed(2)}</span>
            </div>

            {/* Trigger tag & position */}
            {loraTriggerTag && (
              <div className="flex items-center gap-2">
                <Tag className="w-3 h-3 text-surface-400" />
                <span className="text-[10px] text-surface-500 font-mono truncate flex-1">{loraTriggerTag}</span>
                <div className="flex rounded overflow-hidden border border-surface-300">
                  {['prepend', 'append', 'off'].map(pos => (
                    <button
                      key={pos}
                      onClick={() => onSetTagPosition(pos)}
                      className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                        loraTagPosition === pos
                          ? 'bg-accent-500 text-white'
                          : 'bg-surface-100 text-surface-400 hover:bg-surface-200'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Custom path / URL input */}
        <div className="px-4 py-2 border-b border-surface-200 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Link className="w-3.5 h-3.5 text-surface-400 shrink-0" />
            <input
              value={customPath}
              onChange={e => setCustomPath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLoadFromPath()}
              placeholder={t('lora.customPath', 'Paste LoRA path or URL...')}
              className="flex-1 bg-surface-100 border border-surface-300 rounded-lg px-2.5 py-1.5 text-xs
                text-surface-900 placeholder:text-surface-400"
            />
            <button
              onClick={handleLoadFromPath}
              disabled={!customPath.trim()}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-accent-500 text-white
                hover:bg-accent-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('lora.load', 'Load')}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('lora.search', 'Search LoRAs...')}
              className="w-full bg-surface-100 border border-surface-300 rounded-lg pl-8 pr-3 py-1.5 text-xs
                text-surface-900 placeholder:text-surface-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-accent-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-xs text-surface-400">
              {t('lora.empty', 'No LoRAs found')}
            </div>
          ) : (
            filtered.map(lora => {
              const isExpanded = expanded === lora.name;
              const isActive = loraLoaded && selectedLoraName === lora.name;
              const isSelected = selectedLora === lora.name;
              return (
                <div key={lora.name} className="rounded-lg overflow-hidden">
                  <button
                    onClick={() => {
                      setSelectedLora(lora.name);
                      setExpanded(isExpanded ? null : lora.name);
                    }}
                    onContextMenu={e => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, lora });
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-100
                      transition-colors group ${isActive ? 'bg-accent-500/5' : ''} ${
                        isSelected && !isActive ? 'ring-1 ring-accent-400/30' : ''
                      }`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-surface-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-surface-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium truncate block ${
                        isActive ? 'text-accent-400' : 'text-surface-800'
                      }`}>
                        {lora.name}
                      </span>
                      {lora.metadata?.description && (
                        <span className="text-[10px] text-surface-400 truncate block">{lora.metadata.description}</span>
                      )}
                    </div>
                    {lora.baseModel && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                        lora.baseModel === 'turbo'
                          ? 'bg-orange-500/10 text-orange-400'
                          : lora.baseModel === 'sft'
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {lora.baseModel}
                      </span>
                    )}
                    {lora.source && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                        lora.source === 'library'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-brand-500/10 text-brand-400'
                      }`}>
                        {lora.source}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); toggleFav(lora.name); }}
                      className={`p-0.5 rounded transition-colors shrink-0 ${
                        favorites.has(lora.name) ? 'text-yellow-400' : 'text-surface-300 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Star className="w-3 h-3" fill={favorites.has(lora.name) ? 'currentColor' : 'none'} />
                    </button>
                  </button>

                  {isExpanded && (
                    <div className="pl-7 pr-3 pb-2 space-y-0.5">
                      <p className="text-[10px] text-surface-400 mb-1 italic">
                        {t('lora.doubleClickToLoad', 'Double-click a variant to load')}
                      </p>
                      {lora.variants.map(v => (
                        <button
                          key={v.label}
                          onDoubleClick={() => handleSelectVariant(lora, v)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left
                            hover:bg-surface-200 transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-surface-400 shrink-0" />
                          <span className="text-xs text-surface-700 flex-1">{v.label}</span>
                          {v.epoch !== undefined && (
                            <span className="text-[9px] text-surface-400">ep {v.epoch}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-surface-200 flex items-center justify-between">
          <span className="text-[10px] text-surface-400">{filtered.length} LoRAs</span>
          <button
            onClick={fetchList}
            className="text-[10px] text-accent-400 hover:text-accent-300 transition-colors"
          >
            {t('lora.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmLoad && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-surface-50 border border-surface-300 rounded-xl w-[320px] p-4 space-y-3
            animate-scale-in shadow-2xl">
            <h4 className="text-sm font-semibold text-surface-900">
              {t('lora.confirmLoad', 'Load LoRA?')}
            </h4>
            <p className="text-xs text-surface-600">
              <span className="font-medium text-accent-400">{confirmLoad.lora.name}</span>
              {' · '}
              <span className="text-surface-400">{confirmLoad.variant.label}</span>
            </p>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-surface-500">{t('lora.scale', 'Scale / Influence')}</span>
                <span className="text-[10px] text-surface-600 font-mono">{confirmScale.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0} max={2} step={0.05}
                value={confirmScale}
                onChange={e => setConfirmScale(parseFloat(e.target.value))}
                className="w-full accent-accent-500 h-1"
              />
              <div className="flex justify-between text-[9px] text-surface-400">
                <span>0.00</span><span>1.00</span><span>2.00</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setConfirmLoad(null)}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-surface-300
                  text-surface-600 hover:bg-surface-100 transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleConfirmLoad}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-accent-500 text-white
                  hover:bg-accent-400 transition-colors font-medium"
              >
                {t('lora.load', 'Load')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => setContextMenu(null)}
          onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            className="absolute bg-surface-50 border border-surface-300 rounded-lg shadow-xl py-1 min-w-[160px]
              animate-scale-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => handleContextMenuAction(contextMenu.lora)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-700
                hover:bg-surface-100 transition-colors"
            >
              <FileText className="w-3 h-3" />
              {t('lora.copyPath', 'Copy path')}
            </button>
            {contextMenu.lora.sourceDir && (
              <button
                onClick={() => {
                  setContextMenu(null);
                  navigator.clipboard.writeText(contextMenu.lora.sourceDir);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-700
                  hover:bg-surface-100 transition-colors"
              >
                <FolderOpen className="w-3 h-3" />
                {t('lora.copyFolder', 'Copy folder path')}
              </button>
            )}
            {contextMenu.lora.baseModel && (
              <div className="px-3 py-1.5 text-[10px] text-surface-400 border-t border-surface-200 mt-1 pt-1">
                {t('lora.baseModel', 'Base')}: <span className="font-medium text-surface-600">{contextMenu.lora.baseModel}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
