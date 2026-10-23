import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { safeFormatDate } from '../utils/date';

// ────────────────────────────────────────────────────────────────────────────
// EarningsChart — the freelancer "Earnings Overview".
//
// A hand-built SVG chart rather than a charting dependency: the repo has no
// charting library, and this keeps the bundle small while giving full control
// over the design (gradient area, per-month hues, tooltip, animation).
//
// Responsive by measurement, not by scaling: the SVG renders at the container's
// real pixel width (ResizeObserver) so axis text keeps a readable size on a
// 360px phone instead of shrinking with a viewBox-scaled chart.
//
// Theme-aware: grid/axis/tooltip/marker colours come from the CSS variables
// defined in src/styles/globals.css, which flip with the `.dark` class.
// ────────────────────────────────────────────────────────────────────────────

export interface EarningsPoint {
  /** 'YYYY-MM' bucket key. */
  month: string;
  amount: number;
}

interface EarningsChartProps {
  data: EarningsPoint[];
}

// A coherent multi-hue ramp — each month gets its own colour but the set still
// reads as one family (colourful without looking like a random rainbow).
const BAR_PALETTE: Array<{ from: string; to: string; line: string }> = [
  { from: '#4fcb45', to: '#0f6f1a', line: '#24ba35' },
  { from: '#2dd4bf', to: '#0f766e', line: '#14b8a6' },
  { from: '#38bdf8', to: '#0e7490', line: '#06b6d4' },
  { from: '#60a5fa', to: '#1d4ed8', line: '#3b82f6' },
  { from: '#818cf8', to: '#4338ca', line: '#6366f1' },
  { from: '#a78bfa', to: '#6d28d9', line: '#8b5cf6' },
];

const PAD = { top: 24, right: 14, bottom: 34, left: 62 };
const CHART_HEIGHT = 260;
const Y_TICKS = 4;

/** Measure the container width so text stays legible at every breakpoint. */
function useMeasuredWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = el.clientWidth;
      if (next > 0) setWidth(next);
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/** Catmull-Rom → cubic Bézier smoothing (keeps peaks, no wild overshoot). */
function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  const tension = 0.18;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Round the axis maximum up to a friendly number (1/2/2.5/5/10 × 10ⁿ). */
function niceCeil(value: number): number {
  if (value <= 0) return 100;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function monthLabel(month: string, options: Intl.DateTimeFormatOptions): string {
  if (!month) return '—';
  return safeFormatDate(`${month}-01`, options) || month;
}

function deltaLabel(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? 'First earnings' : 'No change';
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs previous month`;
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold ${tone}`} title={value}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export function EarningsChart({ data }: EarningsChartProps) {
  const { format, formatCompact } = useCurrency();
  const { ref, width } = useMeasuredWidth();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  // Unique gradient ids — two charts on one page must not share defs.
  const uid = useId().replace(/[:]/g, '');

  const innerW = Math.max(120, width - PAD.left - PAD.right);
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;

  // Stable primitive dep for the geometry memo (arrays are new each render).
  const amountsKey = data.map((d) => d.amount).join('|');

  const geometry = useMemo(() => {
    const n = data.length;
    if (n === 0) return null;

    const max = Math.max(...data.map((d) => d.amount), 0);
    const yMax = niceCeil(max * 1.12);
    const bandW = innerW / n;
    const barW = Math.max(6, Math.min(34, bandW * 0.44));

    const points = data.map((d, i) => ({
      x: PAD.left + bandW * (i + 0.5),
      y: PAD.top + innerH - (yMax > 0 ? (d.amount / yMax) * innerH : 0),
      value: d.amount,
      bandX: PAD.left + bandW * i,
      bandW,
      month: d.month,
      palette: BAR_PALETTE[i % BAR_PALETTE.length],
    }));

    return { yMax, bandW, barW, points };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountsKey, innerW, innerH, data.length]);

  const summary = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.amount, 0);
    const average = total / (data.length || 1);
    const best = data.reduce<EarningsPoint | null>(
      (acc, d) => (acc === null || d.amount > acc.amount ? d : acc),
      null,
    );
    const current = data[data.length - 1]?.amount ?? 0;
    const previous = data[data.length - 2]?.amount ?? 0;
    const changePct = previous > 0 ? ((current - previous) / previous) * 100 : null;
    return { total, average, best, changePct };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Waiting for earnings data
        </span>
      </div>
    );
  }

  if (!geometry) return null;

  const active = activeIdx !== null ? geometry.points[activeIdx] ?? null : null;
  const TrendIcon =
    summary.changePct === null ? Minus : summary.changePct >= 0 ? TrendingUp : TrendingDown;
  const trendTone =
    summary.changePct === null
      ? 'text-slate-400'
      : summary.changePct >= 0
        ? 'text-emerald-500'
        : 'text-red-500';

  return (
    <div className="space-y-5">
      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SummaryTile label="Total" value={format(summary.total)} tone="text-emerald-600" />
        <SummaryTile
          label="Monthly average"
          value={format(Math.round(summary.average))}
          tone="text-blue-600"
        />
        <SummaryTile
          label="Best month"
          value={summary.best ? format(summary.best.amount) : '—'}
          sub={summary.best ? monthLabel(summary.best.month, { month: 'short' }) : undefined}
          tone="text-violet-600"
        />
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            vs last month
          </p>
          <p className={`mt-1 flex items-center gap-1.5 text-lg font-bold ${trendTone}`}>
            <TrendIcon className="h-4 w-4" aria-hidden="true" />
            {summary.changePct === null
              ? '—'
              : `${summary.changePct >= 0 ? '+' : ''}${summary.changePct.toFixed(1)}%`}
          </p>
        </div>
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          className="block max-w-full"
          role="img"
          aria-label={`Earnings by month. Total ${format(summary.total)} across ${data.length} months.`}
          onMouseLeave={() => setActiveIdx(null)}
        >
          <defs>
            <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#24ba35" stopOpacity="0.34" />
              <stop offset="55%" stopColor="#14b8a6" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`stroke-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#24ba35" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            {geometry.points.map((p, i) => (
              <linearGradient
                key={`bg-${i}`}
                id={`bar-${uid}-${i}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={p.palette.from} />
                <stop offset="100%" stopColor={p.palette.to} />
              </linearGradient>
            ))}
            <filter id={`barGlow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#24ba35" floodOpacity="0.28" />
            </filter>
          </defs>

          {/* Horizontal gridlines + y-axis labels */}
          {Array.from({ length: Y_TICKS + 1 }).map((_, i) => {
            const value = (geometry.yMax / Y_TICKS) * (Y_TICKS - i);
            const y = PAD.top + (innerH / Y_TICKS) * i;
            return (
              <g key={`grid-${i}`}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + innerW}
                  y1={y}
                  y2={y}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                  strokeDasharray={i === Y_TICKS ? undefined : '3 5'}
                />
                <text
                  x={PAD.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--chart-axis)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {value === 0 ? '0' : formatCompact(value)}
                </text>
              </g>
            );
          })}

          {/* Area under the trend line */}
          <path
            className="chart-area"
            d={`${buildSmoothPath(geometry.points)} L ${geometry.points[geometry.points.length - 1].x.toFixed(2)} ${PAD.top + innerH} L ${geometry.points[0].x.toFixed(2)} ${PAD.top + innerH} Z`}
            fill={`url(#area-${uid})`}
          />

          {/* Bars */}
          {geometry.points.map((p, i) => {
            const barH = Math.max(3, PAD.top + innerH - p.y);
            const isActive = activeIdx === i;
            return (
              <rect
                key={`bar-${i}`}
                className="chart-bar"
                x={p.x - geometry.barW / 2}
                y={PAD.top + innerH - barH}
                width={geometry.barW}
                height={barH}
                rx={Math.min(7, geometry.barW / 2)}
                fill={`url(#bar-${uid}-${i})`}
                filter={isActive ? `url(#barGlow-${uid})` : undefined}
                opacity={activeIdx === null || isActive ? 1 : 0.5}
                style={{ animationDelay: `${i * 70}ms`, transition: 'opacity 180ms ease' }}
              />
            );
          })}

          {/* Trend line over the bars — pathLength=1 keeps the draw animation
              independent of the chart's pixel width. */}
          <path
            className="chart-line"
            d={buildSmoothPath(geometry.points)}
            fill="none"
            stroke={`url(#stroke-${uid})`}
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
          />

          {/* Point markers */}
          {geometry.points.map((p, i) => (
            <circle
              key={`pt-${i}`}
              className="chart-point"
              cx={p.x}
              cy={p.y}
              r={activeIdx === i ? 5.5 : 3.5}
              fill="var(--chart-point-fill)"
              stroke={p.palette.line}
              strokeWidth={2.5}
              style={{ animationDelay: `${i * 70 + 200}ms`, transition: 'r 160ms ease' }}
            />
          ))}

          {/* Month labels */}
          {geometry.points.map((p, i) => (
            <text
              key={`label-${i}`}
              x={p.x}
              y={CHART_HEIGHT - 10}
              textAnchor="middle"
              fontSize={11}
              fontWeight={activeIdx === i ? 700 : 500}
              fill={activeIdx === i ? 'var(--chart-axis-strong)' : 'var(--chart-axis)'}
            >
              {monthLabel(p.month, { month: 'short' })}
            </text>
          ))}

          {/* Hover bands — the whole column is a hit target, not just the bar. */}
          {geometry.points.map((p, i) => (
            <rect
              key={`hit-${i}`}
              x={p.bandX}
              y={PAD.top}
              width={p.bandW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setActiveIdx(i)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(active.x, 78), Math.max(78, width - 78)),
              top: Math.max(0, active.y - 64),
              backgroundColor: 'var(--chart-tooltip-bg)',
              color: 'var(--chart-tooltip-text)',
              boxShadow: '0 8px 22px var(--chart-shadow)',
            }}
          >
            <p className="font-semibold">
              {monthLabel(active.month, { month: 'long', year: 'numeric' })}
            </p>
            <p className="mt-0.5 font-bold" style={{ color: active.palette.from }}>
              {format(active.value)}
            </p>
            {activeIdx !== null && activeIdx > 0 && (
              <p className="mt-0.5 opacity-70">
                {deltaLabel(data[activeIdx].amount, data[activeIdx - 1].amount)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Screen-reader / no-hover fallback: the same numbers as a list. */}
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.month}>
            {monthLabel(d.month, { month: 'long', year: 'numeric' })}: {format(d.amount)}
          </li>
        ))}
      </ul>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#24ba35' }} />
          Monthly earnings
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ background: 'linear-gradient(90deg,#24ba35,#06b6d4,#8b5cf6)' }}
          />
          Trend
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live updates as earnings change
        </span>
      </div>
    </div>
  );
}
