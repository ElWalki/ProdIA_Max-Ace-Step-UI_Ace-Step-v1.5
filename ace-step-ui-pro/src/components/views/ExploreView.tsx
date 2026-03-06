import React from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Music, Headphones, Mic2, Guitar } from 'lucide-react';

const FEATURED_GENRES = [
  { icon: <Music className="w-6 h-6" />, gradient: 'from-purple-500 to-pink-500' },
  { icon: <Headphones className="w-6 h-6" />, gradient: 'from-blue-500 to-cyan-500' },
  { icon: <Mic2 className="w-6 h-6" />, gradient: 'from-green-500 to-emerald-500' },
  { icon: <Guitar className="w-6 h-6" />, gradient: 'from-orange-500 to-red-500' },
  { icon: <Music className="w-6 h-6" />, gradient: 'from-indigo-500 to-violet-500' },
  { icon: <Headphones className="w-6 h-6" />, gradient: 'from-rose-500 to-pink-500' },
];

const GENRE_KEYS = ['pop', 'electronic', 'hiphop', 'rock', 'jazz', 'classical'];

export default function ExploreView({ onSelectStyle }: { onSelectStyle?: (style: string) => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-surface-950">{t('nav.explore')}</h1>
        <p className="text-sm text-surface-400 mt-1">{t('explore.description')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Genre grid */}
        <h2 className="text-lg font-semibold text-surface-900 mb-4">{t('explore.genres')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          {FEATURED_GENRES.map((genre, i) => (
            <button
              key={i}
              onClick={() => onSelectStyle?.(GENRE_KEYS[i])}
              className={`relative overflow-hidden rounded-xl p-6 bg-gradient-to-br ${genre.gradient}
                text-white text-left group hover:scale-[1.02] active:scale-[0.98] transition-transform`}
            >
              <div className="absolute top-3 right-3 opacity-20 group-hover:opacity-40 transition-opacity">
                {genre.icon}
              </div>
              <span className="text-sm font-semibold capitalize">{GENRE_KEYS[i]}</span>
            </button>
          ))}
        </div>

        {/* Quick start templates */}
        <h2 className="text-lg font-semibold text-surface-900 mb-4">{t('explore.templates')}</h2>
        <div className="space-y-2">
          {['synthwave', 'lo-fi chill', 'epic orchestral', 'acoustic folk', 'trap beat'].map(template => (
            <button
              key={template}
              onClick={() => onSelectStyle?.(template)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-100/60
                border border-surface-300/40 hover:border-accent-500/40
                hover:bg-surface-100 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-accent-600/20 flex items-center justify-center shrink-0
                group-hover:bg-accent-600/30 transition-colors">
                <Compass className="w-5 h-5 text-accent-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-surface-900 capitalize">{template}</p>
                <p className="text-xs text-surface-500">{t('explore.clickToUse')}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

