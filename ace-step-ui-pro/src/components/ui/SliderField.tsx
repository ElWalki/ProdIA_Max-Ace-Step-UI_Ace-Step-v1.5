import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  tooltip?: string;
}

export default function SliderField({ label, value, onChange, min, max, step = 1, suffix, disabled, tooltip }: SliderFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showTip, setShowTip] = useState(false);

  const handleDoubleClick = () => {
    setEditValue(String(value));
    setIsEditing(true);
  };

  const commitEdit = () => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-surface-500 w-24 flex-shrink-0 flex items-center gap-1">
        {label}
        {tooltip && (
          <span className="relative inline-flex">
            <HelpCircle
              className="w-3 h-3 text-surface-400 hover:text-accent-400 cursor-help transition-colors"
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
            />
            {showTip && (
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a2e] border border-surface-300/40 text-[10px] text-surface-300 leading-snug whitespace-nowrap z-50 shadow-lg">
                {tooltip}
              </span>
            )}
          </span>
        )}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="flex-1 h-1"
      />
      {isEditing ? (
        <input
          type="number"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => e.key === 'Enter' && commitEdit()}
          className="w-16 text-xs text-right bg-surface-200 border border-surface-300 rounded px-1 py-0.5 text-surface-900"
          autoFocus
        />
      ) : (
        <span
          onDoubleClick={handleDoubleClick}
          className="w-16 text-xs text-right text-surface-700 cursor-pointer tabular-nums"
          title="Double-click to edit"
        >
          {step < 1 ? value.toFixed(2) : value}{suffix || ''}
        </span>
      )}
    </div>
  );
}
