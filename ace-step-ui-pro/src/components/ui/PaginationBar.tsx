import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZES = [5, 10, 15, 20, 30, 50, 100];

interface PaginationBarProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function PaginationBar({ total, page, pageSize, onPageChange, onPageSizeChange }: PaginationBarProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const maxButtons = 5;
  let startPage = Math.max(1, safePage - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);

  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px]">
      {/* Page size selector */}
      <div className="flex items-center gap-1.5 text-surface-500">
        <span>{t('pagination.show', 'Show')}</span>
        <select
          value={pageSize}
          onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          className="bg-surface-100 border border-surface-300 rounded px-1 py-0.5 text-[10px] text-surface-700"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-surface-400">
          {total} {t('pagination.items', 'items')}
        </span>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className="p-0.5 rounded text-surface-400 hover:text-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {startPage > 1 && (
            <>
              <button onClick={() => onPageChange(1)} className="px-1.5 py-0.5 rounded text-surface-500 hover:bg-surface-200">1</button>
              {startPage > 2 && <span className="text-surface-400 px-0.5">…</span>}
            </>
          )}
          {pages.map(p => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                p === safePage ? 'bg-accent-500 text-white' : 'text-surface-500 hover:bg-surface-200'
              }`}
            >
              {p}
            </button>
          ))}
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="text-surface-400 px-0.5">…</span>}
              <button onClick={() => onPageChange(totalPages)} className="px-1.5 py-0.5 rounded text-surface-500 hover:bg-surface-200">{totalPages}</button>
            </>
          )}
          <button
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className="p-0.5 rounded text-surface-400 hover:text-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
