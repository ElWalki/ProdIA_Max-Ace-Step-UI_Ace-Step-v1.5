import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tooltip?: string;
}

export default function ToggleField({ label, value, onChange, disabled, tooltip }: ToggleFieldProps) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-surface-500 flex items-center gap-1">
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
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          value ? 'bg-accent-500' : 'bg-surface-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
