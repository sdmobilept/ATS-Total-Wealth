"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { pct, signedPct, usd, usdCompact } from "@/lib/format";
import type { CashFlowYear, KeepSellYear, Occupancy } from "@/lib/wealth";

export interface CashFlowSettings {
  occupancy: "off" | Occupancy;
  /** null = use the automatic default. */
  rent: number | null;
  rentGrowth: number | null;
  vacancy: number;
  management: number;
  taxRate: number;
  taxGrowth: number;
  insurance: number | null;
  hoa: number;
  maintenance: number;
  sellingCost: number;
  altReturn: number;
}

export const DEFAULT_CASH_FLOW: CashFlowSettings = {
  occupancy: "off",
  rent: null,
  rentGrowth: null,
  vacancy: 0.05,
  management: 0.08,
  taxRate: 0.011,
  taxGrowth: 0.02,
  insurance: null,
  hoa: 0,
  maintenance: 0.01,
  sellingCost: 0.06,
  altReturn: 0.06,
};

interface Props {
  settings: CashFlowSettings;
  onChange: (patch: Partial<CashFlowSettings>) => void;
  defaults: { rent: number; rentGrowth: number; insurance: number; rentNote: string };
  flows: CashFlowYear[];
  keepSell: KeepSellYear[];
  breakEven: number | null;
  startYear: number;
}

function Field({ label, value, onChange, suffix, prefix, step = 0.1, hint }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; prefix?: string; step?: number; hint?: string }) {
  return (
    <label className="block text-sm text-ink-2">
      {label}
      <div className="relative mt-1">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>}
        <input
          type="number"
          step={step}
          className={`field tabular ${prefix ? "pl-6" : ""} ${suffix ? "pr-8" : ""}`}
          value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : ""}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">{suffix}</span>}
      </div>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function KeepSellTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as KeepSellYear & { label: number };
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink-2">{label}</div>
      {[
        { name: "Keep", v: row.keep, color: "var(--series-1)" },
        { name: "Sell & invest", v: row.sell, color: "var(--series-2)" },
      ].map((s) => (
        <div key={s.name} className="flex items-center gap-2 py-0.5">
          <svg width="14" height="6" aria-hidden>
            <line x1="0" y1="3" x2="14" y2="3" stroke={s.color} strokeWidth="2" />
          </svg>
          <span className="tabular font-semibold text-ink">{usd(s.v)}</span>
          <span className="text-muted">{s.name}</span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowPanel({ settings: s, onChange, defaults, flows, keepSell, breakEven, startYear }: Props) {
  const rental = s.occupancy === "rental";
  const rent = s.rent ?? defaults.rent;
  const rentGrowth = s.rentGrowth ?? defaults.rentGrowth;
  const insurance = s.insurance ?? defaults.insurance;
  const y1 = flows[0];
  const end = keepSell[keepSell.length - 1];
  const keepWins = end && end.keep >= end.sell;
  const rows = keepSell.map((k) => ({ ...k, label: startYear + k.year }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={rental ? "Monthly rent" : "Rent you'd pay to live elsewhere"}
          prefix="$"
          step={50}
          value={rent}
          onChange={(v) => onChange({ rent: v })}
          hint={defaults.rentNote}
        />
        <Field label="Rent growth" suffix="%/yr" value={rentGrowth * 100} onChange={(v) => onChange({ rentGrowth: v / 100 })} />
        {rental && <Field label="Vacancy" suffix="%" value={s.vacancy * 100} onChange={(v) => onChange({ vacancy: v / 100 })} />}
        {rental && <Field label="Property management" suffix="% rent" value={s.management * 100} onChange={(v) => onChange({ management: v / 100 })} />}
        <Field label="Property tax" suffix="% value" step={0.05} value={s.taxRate * 100} onChange={(v) => onChange({ taxRate: v / 100 })} hint="Year 1, as a share of today's value. In CA it's ~1.1% of the purchase price, so check your tax bill." />
        <Field label="Property tax growth" suffix="%/yr" value={s.taxGrowth * 100} onChange={(v) => onChange({ taxGrowth: v / 100 })} hint="California Prop 13 caps this at 2%" />
        <Field label="Insurance" prefix="$" suffix="/yr" step={100} value={insurance} onChange={(v) => onChange({ insurance: v })} />
        <Field label="HOA" prefix="$" suffix="/mo" step={25} value={s.hoa} onChange={(v) => onChange({ hoa: v })} />
        <Field label="Maintenance" suffix="% value" value={s.maintenance * 100} onChange={(v) => onChange({ maintenance: v / 100 })} />
        <Field label="Selling costs" suffix="%" value={s.sellingCost * 100} onChange={(v) => onChange({ sellingCost: v / 100 })} hint="Agent fees, transfer tax, closing" />
        <Field label="Alternative investment return" suffix="%/yr" value={s.altReturn * 100} onChange={(v) => onChange({ altReturn: v / 100 })} hint="What sale proceeds would earn instead" />
      </div>

      {y1 && end && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-card-2 p-3">
              <div className="text-xs text-muted">{rental ? "Cash flow, year 1" : "Net cost of owning, year 1"}</div>
              <div className={`tabular text-xl font-semibold ${y1.cashFlow >= 0 ? "text-good" : "text-bad"}`}>
                {y1.cashFlow >= 0 ? "+" : "−"}
                {usd(Math.abs(y1.cashFlow / 12))}/mo
              </div>
              <div className="text-xs text-ink-2">
                {rental ? "After expenses and mortgage" : "Rent saved minus ownership costs and mortgage"}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card-2 p-3">
              <div className="text-xs text-muted">{rental ? "Cap rate, year 1" : "Rent-equivalent yield"}</div>
              <div className="tabular text-xl font-semibold">{pct(y1.capRate)}</div>
              <div className="text-xs text-ink-2">Net operating income ÷ value</div>
            </div>
            <div className="rounded-xl border border-line bg-card-2 p-3">
              <div className="text-xs text-muted">Net worth in {end.year} yrs</div>
              <div className="tabular text-xl font-semibold">{usdCompact(end.keep)}</div>
              <div className="text-xs text-ink-2">
                If kept. Selling today &amp; investing: {usdCompact(end.sell)} ({keepWins ? "keeping ahead by " : "selling ahead by "}
                {usdCompact(Math.abs(end.keep - end.sell))})
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card-2 p-3">
              <div className="text-xs text-muted">Break-even return</div>
              <div className="tabular text-xl font-semibold">{breakEven === null ? "–" : `${signedPct(breakEven)}/yr`}</div>
              <div className="text-xs text-ink-2">
                {breakEven === null ? "Keeping wins or loses at any rate" : "Selling wins only if proceeds earn more than this"}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
              {[
                { name: "Keep: equity after selling costs + invested cash flow", color: "var(--series-1)" },
                { name: `Sell today & invest at ${pct(s.altReturn)}`, color: "var(--series-2)" },
              ].map((l) => (
                <span key={l.name} className="flex items-center gap-1.5">
                  <svg width="18" height="6" aria-hidden>
                    <line x1="0" y1="3" x2="18" y2="3" stroke={l.color} strokeWidth="2" />
                  </svg>
                  {l.name}
                </span>
              ))}
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={usdCompact} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip content={(p) => <KeepSellTooltip {...p} />} cursor={{ stroke: "var(--muted)", strokeWidth: 1 }} />
                  <Line dataKey="keep" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="sell" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="text-xs text-muted">
            Uses your scenario path for the property&apos;s value. Cash flows, positive or negative, are assumed invested at the
            alternative return. Income taxes, depreciation, capital-gains tax and the home-sale exclusion are not modeled.
            {!rental && " For a home you live in, keeping saves the rent you'd otherwise pay; selling means paying it."}
          </p>
        </>
      )}
    </div>
  );
}
