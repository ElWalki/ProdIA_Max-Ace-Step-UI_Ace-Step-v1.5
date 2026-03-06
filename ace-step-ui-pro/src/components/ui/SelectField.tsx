import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  tooltip?: string;
}

export default function SelectField({ label, value, onChange, options, disabled, tooltip }: SelectFieldProps) {
  const [showTip, setShowTip] = useState(false);
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
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 bg-surface-100 border border-surface-300 rounded-lg px-2 py-1.5 text-xs text-surface-900 focus:ring-1 focus:ring-accent-500"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
