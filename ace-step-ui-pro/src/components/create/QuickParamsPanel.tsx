import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, ChevronUp, ChevronDown, GripVertical, X, Plus } from 'lucide-react';
import SliderField from '../ui/SliderField';

const LS_PINNED = 'ace-quickparams';
const LS_EXPANDED = 'ace-quickparams-expanded';

export interface ExpertParam {
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

const ALL_PARAMS: ExpertParam[] = [
  { key: 'lmRepetitionPenalty', label: 'Repetition Penalty', description: 'Penalizes repeated tokens (>1 = less repetition)', min: 1, max: 2, step: 0.05, defaultValue: 1.2 },
  { key: 'noRepeatNgramSize', label: 'No-Repeat N-gram', description: 'Block repeating patterns of N tokens (0 = off)', min: 0, max: 10, step: 1, defaultValue: 0 },
  { key: 'melodicVariation', label: 'Melodic Variation', description: 'How much melodic variation between sections (%)', min: 0, max: 100, step: 5, defaultValue: 0 },
  { key: 'lmTemperature', label: 'LM Temperature', description: 'Creativity/randomness of language model', min: 0, max: 2, step: 0.05, defaultValue: 0.85 },
  { key: 'lmCfgScale', label: 'LM CFG Scale', description: 'How closely LM follows the prompt', min: 0, max: 5, step: 0.1, defaultValue: 1.5 },
  { key: 'lmTopK', label: 'LM Top-K', description: 'Limit vocabulary to top K tokens', min: 0, max: 500, step: 1, defaultValue: 100 },
  { key: 'lmTopP', label: 'LM Top-P', description: 'Nucleus sampling threshold', min: 0, max: 1, step: 0.01, defaultValue: 0.95 },
  { key: 'guidanceScale', label: 'DiT Guidance Scale', description: 'How closely DiT follows the text prompt', min: 1, max: 30, step: 0.5, defaultValue: 15 },
  { key: 'inferenceSteps', label: 'Inference Steps', description: 'More steps = higher quality but slower', min: 10, max: 200, step: 1, defaultValue: 60 },
  { key: 'shift', label: 'Shift', description: 'Noise schedule shift for DiT', min: 0, max: 10, step: 0.5, defaultValue: 3 },
  { key: 'apgNormThreshold', label: 'APG Norm Threshold', description: 'Adaptive Projected Guidance norm threshold', min: 0, max: 5, step: 0.1, defaultValue: 0 },
  { key: 'apgMomentum', label: 'APG Momentum', description: 'Momentum for APG optimization', min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { key: 'apgEta', label: 'APG Eta', description: 'Learning rate for APG', min: 0, max: 2, step: 0.05, defaultValue: 0 },
];

interface QuickParamsPanelProps {
  values: Record<string, number | undefined>;
  onChange: (key: string, value: number) => void;
}

function loadPinned(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_PINNED) || 'null');
    if (Array.isArray(saved)) return saved;
  } catch {}
  return ['lmRepetitionPenalty', 'noRepeatNgramSize', 'melodicVariation'];
}

export default function QuickParamsPanel({ values, onChange }: QuickParamsPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(LS_EXPANDED) === 'true'; } catch { return false; }
  });
  const [pinned, setPinned] = useState(loadPinned);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    localStorage.setItem(LS_EXPANDED, String(expanded));
  }, [expanded]);

  const savePinned = useCallback((next: string[]) => {
    setPinned(next);
    localStorage.setItem(LS_PINNED, JSON.stringify(next));
  }, []);

  const pinnedParams = useMemo(() =>
    pinned.map(k => ALL_PARAMS.find(p => p.key === k)).filter(Boolean) as ExpertParam[],
    [pinned]
  );

  const unpinned = useMemo(() =>
    ALL_PARAMS.filter(p => !pinned.includes(p.key)),
    [pinned]
  );

  const addParam = useCallback((key: string) => {
    savePinned([...pinned, key]);
  }, [pinned, savePinned]);

  const removeParam = useCallback((key: string) => {
    savePinned(pinned.filter(k => k !== key));
  }, [pinned, savePinned]);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-[10px] text-surface-500 hover:text-surface-700 transition-colors"
      >
        <Settings2 className="w-3 h-3" />
        <span className="flex-1 text-left font-medium">
          {t('expert.quickParams', 'Quick Parameters')}
        </span>
        {pinnedParams.length > 0 && (
          <span className="text-[9px] text-surface-400">{pinnedParams.length} {t('expert.active', 'active')}</span>
        )}
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="p-2 rounded-lg bg-surface-100/80 border border-surface-300/60 space-y-2 animate-slide-up">
          {pinnedParams.length === 0 && (
            <p className="text-[10px] text-surface-400 text-center py-2">
              {t('expert.noPinned', 'No parameters pinned. Click + to add.')}
            </p>
          )}

          {pinnedParams.map(param => (
            <div key={param.key} className="group relative">
              <div className="flex items-center gap-1">
                <GripVertical className="w-2.5 h-2.5 text-surface-300 shrink-0" />
                <div className="flex-1">
                  <SliderField
                    label={t(`expert.${param.key}`, param.label)}
                    value={values[param.key] ?? param.defaultValue}
                    onChange={v => onChange(param.key, v)}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                  />
                </div>
                <button
                  onClick={() => removeParam(param.key)}
                  className="p-0.5 rounded text-surface-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  title={t('common.delete', 'Remove')}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
              <p className="text-[9px] text-surface-400 ml-4 mt-0.5">{t(`expert.${param.key}Desc`, param.description)}</p>
            </div>
          ))}

          {/* Add param button + picker */}
          <div className="relative">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="flex items-center gap-1 text-[10px] text-accent-400 hover:text-accent-300 transition-colors"
            >
              <Plus className="w-3 h-3" />
              {t('expert.addParam', 'Add parameter')}
            </button>

            {showPicker && unpinned.length > 0 && (
              <div className="absolute bottom-6 left-0 z-20 bg-surface-50 border border-surface-300 rounded-lg shadow-xl p-1.5 min-w-[200px] max-h-[200px] overflow-y-auto">
                {unpinned.map(p => (
                  <button
                    key={p.key}
                    onClick={() => { addParam(p.key); setShowPicker(false); }}
                    className="w-full text-left px-2 py-1.5 rounded text-[10px] text-surface-700 hover:bg-surface-100 transition-colors"
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className="block text-[9px] text-surface-400">{p.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
