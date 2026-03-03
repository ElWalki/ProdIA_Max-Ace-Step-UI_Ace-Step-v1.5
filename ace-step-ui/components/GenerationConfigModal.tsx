import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { songsApi } from '../services/api';
import { Loader2 } from 'lucide-react';

interface GenerationConfigModalProps {
    song: Song;
    token?: string | null;
    isOpen: boolean;
    onClose: () => void;
}

// Map model ID to readable name
const getModelLabel = (modelId?: string): string => {
    if (!modelId) return 'Unknown';
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
            title: 'Model',
            icon: '🏗️',
            items: [
                { label: 'DiT Model', value: getModelLabel(params.ditModel) },
                { label: 'Inference Method', value: params.inferMethod?.toUpperCase() },
                { label: 'Inference Steps', value: params.inferenceSteps },
                { label: 'Guidance Scale', value: params.guidanceScale },
                { label: 'Shift', value: params.shift },
                { label: 'Audio Format', value: params.audioFormat?.toUpperCase() },
                { label: 'Seed', value: params.randomSeed ? 'Random' : params.seed },
            ],
        },
        {
            title: 'LoRA',
            icon: '🎛️',
            items: [
                { label: 'LoRA', value: params.loraLoaded ? 'Yes' : 'No' },
                ...(params.loraLoaded ? [
                    { label: 'Name', value: params.loraName || params.loraPath?.split(/[\\/]/).pop() },
                    { label: 'Scale', value: params.loraScale },
                    { label: 'Enabled', value: params.loraEnabled ? 'Yes' : 'No' },
                    { label: 'Trigger Tag', value: params.loraTriggerTag },
                    { label: 'Tag Injection', value: params.loraTagPosition },
                ] : []),
            ],
        },
        {
            title: 'Music',
            icon: '🎵',
            items: [
                { label: 'Duration', value: params.duration && params.duration > 0 ? `${params.duration}s` : 'Auto' },
                { label: 'BPM', value: params.bpm || 'Auto' },
                { label: 'Key', value: params.keyScale || 'Auto' },
                { label: 'Time Signature', value: params.timeSignature || 'Auto' },
                { label: 'Instrumental', value: params.instrumental ? 'Yes' : 'No' },
                { label: 'Vocal Language', value: params.vocalLanguage || 'Auto' },
                { label: 'Batch Size', value: params.batchSize },
            ],
        },
        {
            title: 'LM (Language Model)',
            icon: '🧠',
            items: [
                { label: 'Backend', value: params.lmBackend?.toUpperCase() || 'PT' },
                { label: 'LM Model', value: params.lmModel || 'Default' },
                { label: 'Temperature', value: params.lmTemperature },
                { label: 'CFG Scale', value: params.lmCfgScale },
                { label: 'Top-K', value: params.lmTopK },
                { label: 'Top-P', value: params.lmTopP },
                { label: 'Thinking', value: params.thinking ? 'Yes' : 'No' },
            ],
        },
        {
            title: 'Advanced',
            icon: '⚙️',
            items: [
                { label: 'Mode', value: params.customMode ? 'Custom' : 'Simple' },
                { label: 'ADG', value: params.useAdg ? 'Yes' : 'No' },
                { label: 'Enhance', value: params.enhance ? 'Yes' : 'No' },
                ...(params.referenceAudioUrl ? [{ label: 'Reference Audio', value: params.referenceAudioTitle || 'Yes' }] : []),
                ...(params.sourceAudioUrl ? [{ label: 'Source Audio', value: params.sourceAudioTitle || 'Yes' }] : []),
                ...(params.taskType && params.taskType !== 'text2music' ? [{ label: 'Task Type', value: params.taskType }] : []),
                ...(params.cfgIntervalStart != null ? [{ label: 'CFG Interval', value: `${params.cfgIntervalStart} - ${params.cfgIntervalEnd}` }] : []),
                ...(params.customTimesteps ? [{ label: 'Custom Timesteps', value: params.customTimesteps }] : []),
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
                            <svg className="w-4 h-4 text-pink-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Generation Config
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
                            <Loader2 size={24} className="animate-spin text-pink-500" />
                        </div>
                    ) : !params ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">No generation config available for this song.</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Songs generated before this feature was added won't have config data.</p>
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
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
