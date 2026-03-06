import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Sun, Moon, User, LogOut, Globe, Settings, Disc3 } from 'lucide-react';
import type { View } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface TopBarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenSettings?: () => void;
  assistantOpen?: boolean;
  onToggleAssistant?: () => void;
}

const NAV_ITEMS: { view: View; key: string }[] = [
  { view: 'create', key: 'nav.create' },
  { view: 'library', key: 'nav.library' },
  { view: 'training', key: 'nav.training' },
  { view: 'explore', key: 'nav.explore' },
  { view: 'gpu', key: 'nav.gpu' },
];

export default function TopBar({ currentView, onNavigate, theme, onToggleTheme, onOpenSettings, assistantOpen, onToggleAssistant }: TopBarProps) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langOpen) return;
    const close = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [langOpen]);

  const currentLang = i18n.language?.startsWith('es') ? 'es' : 'en';

  return (
    <header className="sticky top-0 z-50 flex items-center h-14 px-4 border-b border-surface-200/60 glass">
      {/* Logo */}
      <button onClick={() => onNavigate('create')} className="flex items-center gap-2 mr-8 group">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-brand-500 flex items-center justify-center shadow-lg shadow-accent-500/20">
          <Music className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-surface-900 hidden sm:block tracking-tight">{t('app.title')}</span>
      </button>

      {/* Nav tabs */}
      <nav className="flex gap-1">
        {NAV_ITEMS.map(({ view, key }) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentView === view
                ? 'bg-accent-500/15 text-accent-400 shadow-sm'
                : 'text-surface-500 hover:text-surface-800 hover:bg-surface-100'
            }`}
          >
            {t(key)}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* AI Assistant toggle */}
        <button
          onClick={onToggleAssistant}
          className={`p-2 rounded-lg transition-colors relative ${
            assistantOpen
              ? 'text-accent-400 bg-accent-500/15'
              : 'text-surface-500 hover:text-surface-800 hover:bg-surface-100'
          }`}
          title={t('assistant.title')}
        >
          <Disc3 className={`w-4 h-4 ${assistantOpen ? 'animate-[spin_4s_linear_infinite]' : ''}`} />
        </button>

        {/* Language switcher */}
        <div ref={langRef} className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 transition-colors text-xs font-medium"
            title={t('common.language')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="uppercase">{currentLang}</span>
          </button>
          {langOpen && (
            <div className="absolute right-0 top-full mt-1 bg-surface-100 border border-surface-300 rounded-lg shadow-xl z-50 overflow-hidden min-w-[120px]">
              {[{ code: 'en', label: 'English' }, { code: 'es', label: 'Español' }].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    currentLang === lang.code
                      ? 'bg-accent-500/15 text-accent-400 font-medium'
                      : 'text-surface-700 hover:bg-surface-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings gear */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 transition-colors"
          title={t('common.settings')}
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 transition-colors"
          title={t('common.theme')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {user && (
          <div className="flex items-center gap-2 ml-2">
            <div className="w-7 h-7 rounded-full bg-accent-500/15 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-accent-400" />
            </div>
            <span className="text-xs text-surface-500 hidden md:block">{user.username}</span>
            <button onClick={logout} className="p-1.5 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Logout">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
