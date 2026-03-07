import React from 'react';
import { useTranslation } from 'react-i18next';
import { AudioWaveform, Scissors, Layers, Music, Wand2 } from 'lucide-react';

export default function StudioView() {
  const { t } = useTranslation();

  const features = [
    { icon: <AudioWaveform className="w-8 h-8" />, titleKey: 'studio.waveform', descKey: 'studio.waveformDesc' },
    { icon: <Scissors className="w-8 h-8" />, titleKey: 'studio.stems', descKey: 'studio.stemsDesc' },
    { icon: <Layers className="w-8 h-8" />, titleKey: 'studio.repaint', descKey: 'studio.repaintDesc' },
    { icon: <Music className="w-8 h-8" />, titleKey: 'studio.arrange', descKey: 'studio.arrangeDesc' },
    { icon: <Wand2 className="w-8 h-8" />, titleKey: 'studio.regenerate', descKey: 'studio.regenerateDesc' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto p-8">
      <div className="max-w-2xl text-center space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-500 to-brand-500 flex items-center justify-center shadow-lg shadow-accent-500/20">
            <AudioWaveform className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900">{t('studio.title')}</h1>
          <p className="text-sm text-surface-500 max-w-md mx-auto">{t('studio.subtitle')}</p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {features.map(({ icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="rounded-xl bg-surface-100/60 border border-surface-300/40 p-5 text-left space-y-2 opacity-60"
            >
              <div className="text-accent-400">{icon}</div>
              <h3 className="text-sm font-semibold text-surface-900">{t(titleKey)}</h3>
              <p className="text-xs text-surface-500">{t(descKey)}</p>
            </div>
          ))}
        </div>

        {/* Coming soon badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
          {t('studio.comingSoon')}
        </div>
      </div>
    </div>
  );
}
