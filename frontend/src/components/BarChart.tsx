import React from 'react';

/**
 * Yengil bar-chart (kutubxonasiz).
 * data: [{ label, value, color? }]
 */
export function BarChart({
  data,
  height = 140,
  suffix = '',
  format,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  suffix?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const grid = [0, 1, 2, 3];
  return (
    <div className="w-full">
      <div className="relative">
        {/* Gridlines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" style={{ height }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-dashed border-slate-100 dark:border-slate-800" />
          ))}
        </div>
        <div className="relative flex items-end gap-1.5" style={{ height }}>
          {data.map((d, i) => {
            const h = Math.max(4, Math.round((d.value / max) * (height - 24)));
            const color = d.color || '#6366f1';
            return (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                  {format ? format(d.value) : d.value}
                  {!format && suffix}
                </span>
                <div
                  className="w-full max-w-12 rounded-t-lg transition-all duration-300 hover:opacity-80"
                  style={{
                    height: h,
                    background:
                      d.value > 0
                        ? `linear-gradient(180deg, ${color}, ${color}cc)`
                        : 'transparent',
                  }}
                  title={`${d.label}: ${d.value}`}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 truncate text-center text-[10px] font-medium text-slate-400">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
