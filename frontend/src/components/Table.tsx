import React from 'react';
import { cx } from './ui';
import { Inbox } from 'lucide-react';

/**
 * Responsive jadval. Desktopda jadval, mobilda kartalar ko'rinishida chiqadi.
 */
export function DataTable({
  columns,
  rows,
  loading,
  emptyMessage,
  renderRow,
  mobileCard,
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: any[];
  loading?: boolean;
  emptyMessage?: string;
  renderRow: (row: any) => React.ReactNode[];
  mobileCard?: (row: any) => React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className="skeleton h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-1/3" />
                <div className="skeleton h-3 w-1/4" />
              </div>
              <div className="skeleton hidden h-6 w-16 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/50 py-14 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
          <Inbox className="h-6 w-6" />
        </div>
        <span className="text-sm text-slate-400">{emptyMessage ?? "Ma'lumot yo'q"}</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900">
      {/* Desktop jadval */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              {columns.map((c) => (
                <th key={c.key} className={cx('px-4 py-3 font-semibold', c.className)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                {renderRow(row).map((cell, j) => (
                  <td key={j} className={cx('px-4 py-3 align-middle', columns[j]?.className)}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobil kartalar */}
      <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
        {rows.map((row, i) => (
          <div key={row.id ?? i} className="p-4">
            {mobileCard ? (
              mobileCard(row)
            ) : (
              <dl className="space-y-1.5">
                {columns.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3">
                    <dt className="text-xs font-medium text-slate-400">{c.label}</dt>
                    <dd className="text-right text-sm font-medium text-slate-800 dark:text-slate-100">{renderRow(row)[columns.findIndex((x) => x.key === c.key)]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
