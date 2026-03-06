import React from 'react';

interface CollapsibleSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}

export default function CollapsibleSection({ title, isOpen, onToggle, children, badge }: CollapsibleSectionProps) {
  return (
    <div className="border border-surface-250 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-100 hover:bg-surface-150 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3.5 h-3.5 text-surface-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium text-surface-800">{title}</span>
        </div>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-400">{badge}</span>
        )}
      </button>
      {isOpen && (
        <div className="px-3 py-3 space-y-3 animate-slide-up">{children}</div>
      )}
    </div>
  );
}
