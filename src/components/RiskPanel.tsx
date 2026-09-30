"use client";

import { pct, usdCompact } from "@/lib/format";
import type { SimulationSummary } from "@/lib/wealth";

interface Props {
  sim: SimulationSummary;
  paths: number;
  flatRate: number;
  hasLoan: boolean;
  showPaths: boolean;
  onShowPaths: (v: boolean) => void;
}

function Odds({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-0.5 text-xl font-semibold">{pct(value, 0)}</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <div className="mt-1 text-xs text-ink-2">{sub}</div>
    </div>
  );
}

export function RiskPanel({ sim, paths, flatRate, hasLoan, showPaths, onShowPaths }: Props) {
  const t = sim.terminal;
  return (
    <div>
      <p className="mb-4 text-sm text-ink-2">
        {paths.toLocaleString()} simulated market paths over {sim.years} years. The spread matches the backtest-calibrated
        range, so these odds describe the same uncertainty as the shaded band.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Odds label={`Beats flat ${pct(flatRate, 1)}/yr`} value={sim.pBeatFlat} sub={`Value in ${sim.years} yrs above the flat-rate projection`} />
        <Odds label="Worth less than today" value={sim.pLoss} sub={`Value in ${sim.years} yrs below today's value`} />
        <Odds label="A 20%+ drop along the way" value={sim.pDrawdown20} sub="Year-end value falls 20% from a prior peak" />
        {hasLoan ? (
          <Odds label="Owe more than it's worth" value={sim.pUnderwater} sub="Value below loan balance in any year" />
        ) : (
          <div className="min-w-0 rounded-xl border border-line bg-card-2 p-3">
            <div className="text-xs text-muted">Value in {sim.years} yrs</div>
            <div className="tabular mt-0.5 text-xl font-semibold">{usdCompact(t.p50)}</div>
            <div className="mt-1 text-xs text-ink-2">
              middle 50%: {usdCompact(t.p25)} – {usdCompact(t.p75)}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          Value in {sim.years} yrs: 10th {usdCompact(t.p10)} · 25th {usdCompact(t.p25)} · median {usdCompact(t.p50)} · 75th{" "}
          {usdCompact(t.p75)} · 90th {usdCompact(t.p90)}
        </span>
        <label className="no-print flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={showPaths} onChange={(e) => onShowPaths(e.target.checked)} />
          Show sample paths on the chart
        </label>
      </div>
    </div>
  );
}
