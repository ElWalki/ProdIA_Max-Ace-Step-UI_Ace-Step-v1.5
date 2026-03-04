import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { songsApi } from '../services/api';
import { useI18n } from '../context/I18nContext';
import { Loader2 } from 'lucide-react';

interface GenerationConfigModalProps {
    song: Song;
    token?: string | null;
    isOpen: boolean;
    onClose: () => void;
}

// Map model ID to readable name
const getModelLabel = (modelId?: string, unknownLabel?: string): string => {
    if (!modelId) return unknownLabel ?? 'Unknown';
    const mapping: Record<string, string> = {
        'acestep-v15-base': 'ACE-Step 1.5 Base',
        'acestep-v15-sft': 'ACE-Step 1.5 SFT',
        'acestep-v15-turbo': 'ACE-Step 1.5 Turbo',
        'acestep-v15-turbo-shift1': 'ACE-Step 1.5 Turbo S1',
        'acestep-v15-turbo-shift3': 'ACE-Step 1.5 Turbo S3',
        'acestep-v15-turbo-continuous': 'ACE-Step 1.5 Turbo Cont.',
    };
    return mapping[modelId] || modelId;
};

export const GenerationConfigModal: React.FC<GenerationConfigModalProps> = ({ song, token, isOpen, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [params, setParams] = useState<Record<string, any> | null>(null);
    const { t } = useI18n();

    useEffect(() => {
        if (!isOpen) return;

        // If generationParams are already on the song, use them
        if (song.generationParams) {
            const gp = typeof song.generationParams === 'string'
                ? (() => { try { return JSON.parse(song.generationParams); } catch { return null; } })()
                : song.generationParams;
            setParams(gp);
            return;
        }

        // Otherwise fetch the full song
        const fetchParams = async () => {
            setLoading(true);
            try {
                const response = await songsApi.getFullSong(song.id, token);
                const gp = response.song.generation_params;
                if (gp) {
                    const parsed = typeof gp === 'string' ? JSON.parse(gp) : gp;
                    setParams(parsed);
                } else {
                    setParams(null);
                }
            } catch (err) {
                console.error('Failed to fetch song config:', err);
                setParams(null);
            } finally {
                setLoading(false);
            }
        };
        fetchParams();
    }, [isOpen, song.id]);

    if (!isOpen) return null;

    const sections = params ? [
        {
            title: t('genConfig.sectionModel'),
            icon: '🏗️',
            items: [
                { label: t('genConfig.labelDitModel'), value: getModelLabel(params.ditModel, t('genConfig.unknownModel')) },
                { label: t('genConfig.labelInferenceMethod'), value: params.inferMethod?.toUpperCase() },
                { label: t('genConfig.labelInferenceSteps'), value: params.inferenceSteps },
                { label: t('genConfig.labelGuidanceScale'), value: params.guidanceScale },
                { label: t('genConfig.labelShift'), value: params.shift },
                { label: t('genConfig.labelAudioFormat'), value: params.audioFormat?.toUpperCase() },
                { label: t('genConfig.labelSeed'), value: params.randomSeed ? t('genConfig.valueRandom') : params.seed },
            ],
        },
        {
            title: t('genConfig.sectionLora'),
            icon: '🎛️',
            items: [
                { label: t('genConfig.sectionLora'), value: params.loraLoaded ? t('genConfig.valueYes') : t('genConfig.valueNo') },
                ...(params.loraLoaded ? [
                    { label: t('genConfig.labelLoraName'), value: params.loraName || params.loraPath?.split(/[\\/]/).pop() },
                    { label: t('genConfig.labelLoraScale'), value: params.loraScale },
                    { label: t('genConfig.labelLoraEnabled'), value: params.loraEnabled ? t('genConfig.valueYes') : t('genConfig.valueNo') },
                    { label: t('genConfig.labelLoraTriggerTag'), value: params.loraTriggerTag },
                    { label: t('genConfig.labelLoraTagInjection'), value: params.loraTagPosition },
                ] : []),
            ],
        },
        {
            title: t('genConfig.sectionMusic'),
            icon: '🎵',
            items: [
                { label: t('genConfig.labelDuration'), value: params.duration && params.duration > 0 ? `${params.duration}s` : t('auto') },
                { label: t('bpm'), value: params.bpm || t('auto') },
                { label: t('genConfig.labelKey'), value: params.keyScale || t('auto') },
                { label: t('timeSignature'), value: params.timeSignature || t('auto') },
                { label: t('genConfig.labelInstrumental'), value: params.instrumental ? t('genConfig.valueYes') : t('genConfig.valueNo') },
                { label: t('genConfig.labelVocalLanguage'), value: params.vocalLanguage || t('auto') },
                { label: t('genConfig.labelBatchSize'), value: params.batchSize },
            ],
        },
        {
            title: t('genConfig.sectionLm'),
            icon: '🧠',
            items: [
                { label: t('genConfig.labelBackend'), value: params.lmBackend?.toUpperCase() || 'PT' },
                { label: t('genConfig.labelLmModel'), value: params.lmModel || 'Default' },
                { label: t('genConfig.labelTemperature'), value: params.lmTemperature },
                { label: t('genConfig.labelCfgScale'), value: params.lmCfgScale },
                { label: t('genConfig.labelTopK'), value: params.lmTopK },
                { label: t('genConfig.labelTopP'), value: params.lmTopP },
                { label: t('genConfig.labelThinking'), value: params.thinking ? t('genConfig.valueYes') : t('genConfig.valueNo') },
            ],
        },
        {
            title: t('genConfig.sectionAdvanced'),
            icon: '⚙️',
            items: [
                { label: t('genConfig.labelMode'), value: params.customMode ? t('genConfig.valueCustom') : t('genConfig.valueSimple') },
                { label: t('genConfig.labelAdg'), value: params.useAdg ? t('genConfig.valueYes') : t('genConfig.valueNo') },
                { label: t('genConfig.labelEnhance'), value: params.enhance ? t('genConfig.valueYes') : t('genConfig.valueNo') },
                ...(params.referenceAudioUrl ? [{ label: t('genConfig.labelReferenceAudio'), value: params.referenceAudioTitle || t('genConfig.valueYes') }] : []),
                ...(params.sourceAudioUrl ? [{ label: t('genConfig.labelSourceAudio'), value: params.sourceAudioTitle || t('genConfig.valueYes') }] : []),
                ...(params.taskType && params.taskType !== 'text2music' ? [{ label: t('genConfig.labelTaskType'), value: params.taskType }] : []),
                ...(params.cfgIntervalStart != null ? [{ label: t('genConfig.labelCfgInterval'), value: `${params.cfgIntervalStart} - ${params.cfgIntervalEnd}` }] : []),
                ...(params.customTimesteps ? [{ label: t('genConfig.labelCustomTimesteps'), value: params.customTimesteps }] : []),
            ],
        },
    ] : [];

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 w-[440px] max-h-[80vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between flex-shrink-0">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <svg className="w-4 h-4 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {t('genConfig.modalTitle')}
                        </h3>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5" title={song.title}>
                            {song.title}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors ml-3 flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="animate-spin text-violet-500" />
                        </div>
                    ) : !params ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('genConfig.noConfigMessage')}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{t('genConfig.noConfigDetail')}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sections.map((section) => {
                                const visibleItems = section.items.filter(item => item.value !== undefined && item.value !== '' && item.value !== null);
                                if (visibleItems.length === 0) return null;
                                return (
                                    <div key={section.title}>
                                        <div className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <span>{section.icon}</span>
                                            {section.title}
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-zinc-50 dark:bg-black/20 rounded-lg p-3">
                                            {visibleItems.map((item) => (
                                                <div key={item.label} className="flex items-center justify-between py-0.5">
                                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.label}</span>
                                                    <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 text-right max-w-[140px] truncate" title={String(item.value)}>
                                                        {String(item.value)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-700 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                        {t('genConfig.closeButton')}
                    </button>
                </div>
            </div>
        </div>
    );
};
