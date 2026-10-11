import React, { useId } from 'react';

/**
 * Yengil, kutubxonasiz SVG grafiklar to'plami.
 * Barchasi light/dark rejimda ishlaydi va konteynerga moslashadi.
 */

const GRID_LIGHT = 'currentColor';

function useUid(prefix: string) {
  const id = useId().replace(/[:]/g, '');
  return `${prefix}-${id}`;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return mult * pow;
}

// ---------------------------------------------------------------- Sparkline
export function Sparkline({
  data,
  color = '#6366f1',
  height = 36,
  className,
  fill = true,
}: {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
  fill?: boolean;
}) {
  const gid = useUid('spark');
  if (!data || data.length < 2) return <div style={{ height }} />;
  const w = 100;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / range) * (height - 6);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: '100%', height }}
      aria-hidden="true"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------- AreaChart
export function AreaChart({
  data,
  color = '#6366f1',
  height = 200,
  formatValue,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const gid = useUid('area');
  const W = 600;
  const H = height;
  const padT = 18;
  const padB = 10;
  const values = data.map((d) => d.value);
  const max = niceMax(Math.max(1, ...values));
  const n = data.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H - padB} L0,${H - padB} Z`;
  const gridCount = 4;

  return (
    <div className="w-full">
      <div className="flex">
        <div
          className="flex w-10 shrink-0 flex-col justify-between pr-1 text-right text-[10px] font-medium text-slate-400"
          style={{ height: H - padB - padT + 8 }}
        >
          {Array.from({ length: gridCount + 1 }).map((_, i) => (
            <span key={i}>{formatValue ? formatValue((max * (gridCount - i)) / gridCount) : Math.round((max * (gridCount - i)) / gridCount)}</span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-auto w-full"
          style={{ height: H }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: gridCount + 1 }).map((_, i) => {
            const gy = padT + (i / gridCount) * (H - padT - padB);
            return (
              <line
                key={i}
                x1="0"
                x2={W}
                y1={gy}
                y2={gy}
                className="text-slate-200 dark:text-slate-700"
                stroke={GRID_LIGHT}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="3 5"
                opacity={i === gridCount ? 0.9 : 0.55}
              />
            );
          })}
          <path d={area} fill={`url(#${gid})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="ml-10 flex justify-between pt-2 text-[10px] font-medium text-slate-400">
        {data.map((d, i) => (
          <span key={i} className={n > 7 && i % 2 === 1 ? 'hidden sm:inline' : ''}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- LineChart
export function LineChart({
  labels,
  series,
  height = 220,
  formatValue,
}: {
  labels: string[];
  series: { name: string; color: string; data: number[] }[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const W = 600;
  const H = height;
  const padT = 16;
  const padB = 10;
  const all = series.flatMap((s) => s.data);
  const max = niceMax(Math.max(1, ...all));
  const n = labels.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const gridCount = 4;

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="flex">
        <div
          className="flex w-10 shrink-0 flex-col justify-between pr-1 text-right text-[10px] font-medium text-slate-400"
          style={{ height: H - padB - padT + 8 }}
        >
          {Array.from({ length: gridCount + 1 }).map((_, i) => (
            <span key={i}>{formatValue ? formatValue((max * (gridCount - i)) / gridCount) : Math.round((max * (gridCount - i)) / gridCount)}</span>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-auto w-full" style={{ height: H }} aria-hidden="true">
          {Array.from({ length: gridCount + 1 }).map((_, i) => {
            const gy = padT + (i / gridCount) * (H - padT - padB);
            return (
              <line
                key={i}
                x1="0"
                x2={W}
                y1={gy}
                y2={gy}
                className="text-slate-200 dark:text-slate-700"
                stroke={GRID_LIGHT}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="3 5"
                opacity={i === gridCount ? 0.9 : 0.55}
              />
            );
          })}
          {series.map((s) => (
            <path
              key={s.name}
              d={s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
      <div className="ml-10 flex justify-between pt-2 text-[10px] font-medium text-slate-400">
        {labels.map((l, i) => (
          <span key={i} className={n > 7 && i % 2 === 1 ? 'hidden sm:inline' : ''}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- DonutChart
export function DonutChart({
  data,
  size = 176,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="text-slate-100 dark:text-slate-800"
          stroke="currentColor"
          strokeWidth={thickness}
        />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      {centerValue !== undefined && (
        <div className="absolute text-center">
          <div className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">{centerValue}</div>
          {centerLabel && <div className="mt-0.5 text-xs text-slate-400">{centerLabel}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ProgressRing
export function ProgressRing({
  value,
  size = 88,
  thickness = 9,
  color = '#6366f1',
  label,
}: {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const len = (pct / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="text-slate-100 dark:text-slate-800" stroke="currentColor" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${len} ${c - len}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">{Math.round(pct)}%</div>
        {label && <div className="text-[10px] text-slate-400">{label}</div>}
      </div>
    </div>
  );
}
