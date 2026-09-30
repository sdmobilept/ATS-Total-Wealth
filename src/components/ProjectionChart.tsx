"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { usd, usdCompact } from "@/lib/format";

export interface ChartRow {
  /** Decimal year. */
  t: number;
  history?: number;
  median?: number;
  band?: [number, number];
  scenario?: number;
  flat?: number;
}

interface Props {
  rows: ChartRow[];
  nowT: number;
  scenarioLabel: string;
  flatLabel: string;
}

const SERIES = [
  { key: "history", name: "Market history", color: "var(--series-1)", dash: undefined },
  { key: "median", name: "Median forecast", color: "var(--series-1)", dash: "2 3" },
  { key: "scenario", name: "Your scenario", color: "var(--series-2)", dash: undefined },
  { key: "flat", name: "Flat", color: "var(--series-3)", dash: "6 4" },
] as const;

/** Round up to 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten, for clean axis ticks. */
function niceCeil(x: number) {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * p >= x)!;
  return m * p;
}

function yearOf(t: number) {
  const y = Math.floor(t + 1e-6);
  const m = Math.round((t - y) * 12);
  return m === 0 ? `${y}` : new Date(y, m, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

function ChartTooltip({ active, payload, label, scenarioLabel, flatLabel }: TooltipContentProps & { scenarioLabel: string; flatLabel: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ChartRow;
  const items: { name: string; value: string; color: string; dash?: string }[] = [];
  if (row.history !== undefined) items.push({ name: "Market history", value: usd(row.history), color: "var(--series-1)" });
  if (row.scenario !== undefined) items.push({ name: scenarioLabel, value: usd(row.scenario), color: "var(--series-2)" });
  if (row.median !== undefined) items.push({ name: "Median forecast", value: usd(row.median), color: "var(--series-1)", dash: "2 3" });
  if (row.band) items.push({ name: "80% range", value: `${usdCompact(row.band[0])} – ${usdCompact(row.band[1])}`, color: "var(--band)" });
  if (row.flat !== undefined) items.push({ name: flatLabel, value: usd(row.flat), color: "var(--series-3)", dash: "6 4" });
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink-2">{yearOf(Number(label))}</div>
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-2 py-0.5">
          <svg width="14" height="6" aria-hidden>
            <line x1="0" y1="3" x2="14" y2="3" stroke={it.color} strokeWidth={it.name === "80% range" ? 6 : 2} strokeDasharray={it.dash} />
          </svg>
          <span className="tabular font-semibold text-ink">{it.value}</span>
          <span className="text-muted">{it.name}</span>
        </div>
      ))}
    </div>
  );
}

export function ProjectionChart({ rows, nowT, scenarioLabel, flatLabel }: Props) {
  const first = rows[0]?.t ?? 0;
  const last = rows[rows.length - 1]?.t ?? 1;
  const ticks: number[] = [];
  const step = last - first > 40 ? 10 : 5;
  for (let y = Math.ceil(first / step) * step; y <= last; y += step) ticks.push(y);

  // Scale the y-axis to the lines, not the band's upper tail, so the paths stay readable.
  let lineMax = 0;
  let bandMax = 0;
  for (const r of rows) {
    lineMax = Math.max(lineMax, r.history ?? 0, r.median ?? 0, r.scenario ?? 0, r.flat ?? 0);
    bandMax = Math.max(bandMax, r.band?.[1] ?? 0);
  }
  const yMax = niceCeil(Math.min(bandMax, lineMax * 1.5));
  const clipped = bandMax > yMax * 1.001;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
            </svg>
            {s.key === "scenario" ? scenarioLabel : s.key === "flat" ? flatLabel : s.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "var(--band)" }} />
          80% likely range (10th–90th pct)
        </span>
      </div>
      <div className="h-[340px] w-full sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[first, last]}
              ticks={ticks}
              tickFormatter={(t) => String(t)}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, yMax]}
              allowDataOverflow
              tickFormatter={usdCompact}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...props} scenarioLabel={scenarioLabel} flatLabel={flatLabel} />}
              cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            />
            <Area dataKey="band" stroke="none" fill="var(--band)" isAnimationActive={false} connectNulls />
            <ReferenceLine x={nowT} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />
            <Line dataKey="history" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="median" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
            <Line dataKey="flat" stroke="var(--series-3)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            <Line dataKey="scenario" stroke="var(--series-2)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {clipped && (
        <p className="mt-1 text-xs text-muted">
          The upper end of the range runs above the chart. Hover or see the table for exact figures.
        </p>
      )}
    </div>
  );
}
