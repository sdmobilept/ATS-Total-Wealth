"use client";

import { useState } from "react";
import { pct, signedPct, usd } from "@/lib/format";

export interface WealthRow {
  year: number;
  label: number;
  value: number;
  growth: number;
  low: number;
  median: number;
  high: number;
  flat: number;
  loan: number;
  equity: number;
  flatEquity: number;
  /** Cash flow during the year (only when cash flow is enabled). */
  cashFlow?: number;
  /** Net worth from keeping: equity after selling costs + invested cash flows. */
  keep?: number;
}

interface Props {
  rows: WealthRow[];
  horizon: number;
  flatRate: number;
  hasLoan: boolean;
  showCashFlow?: boolean;
}

export function WealthTable({ rows, horizon, flatRate, hasLoan, showCashFlow = false }: Props) {
  const [allYears, setAllYears] = useState(false);
  const shown = allYears || horizon <= 10 ? rows : rows.filter((r) => r.year <= 5 || r.year % 5 === 0);

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="tabular w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Year</th>
              <th className="py-2 pr-3 text-right font-medium">Scenario value</th>
              <th className="py-2 pr-3 text-right font-medium">Growth</th>
              <th className="py-2 pr-3 text-right font-medium">80% range</th>
              <th className="py-2 pr-3 text-right font-medium">Flat {pct(flatRate, 1)}</th>
              <th className="py-2 pr-3 text-right font-medium">Difference</th>
              {hasLoan && <th className="py-2 pr-3 text-right font-medium">Loan</th>}
              {hasLoan && <th className="py-2 pr-3 text-right font-medium">Equity</th>}
              {showCashFlow && <th className="py-2 pr-3 text-right font-medium">Cash flow</th>}
              {showCashFlow && <th className="py-2 text-right font-medium">Net worth (keep)</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const diff = r.value - r.flat;
              return (
                <tr key={r.year} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3">
                    {r.year === 0 ? "Today" : r.label}
                    {r.year > 0 && <span className="ml-1 text-xs text-muted">yr {r.year}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">{usd(r.value)}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">{r.year === 0 ? "–" : signedPct(r.growth)}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">
                    {r.year === 0 ? "–" : `${usd(r.low)} – ${usd(r.high)}`}
                  </td>
                  <td className="py-2 pr-3 text-right text-ink-2">{usd(r.flat)}</td>
                  <td className={`py-2 pr-3 text-right ${r.year === 0 ? "text-muted" : diff >= 0 ? "text-good" : "text-bad"}`}>
                    {r.year === 0 ? "–" : `${diff >= 0 ? "+" : "−"}${usd(Math.abs(diff))}`}
                  </td>
                  {hasLoan && <td className="py-2 pr-3 text-right text-ink-2">{usd(r.loan)}</td>}
                  {hasLoan && <td className="py-2 pr-3 text-right font-medium">{usd(r.equity)}</td>}
                  {showCashFlow && (
                    <td className={`py-2 pr-3 text-right ${r.year === 0 ? "text-muted" : (r.cashFlow ?? 0) >= 0 ? "text-good" : "text-bad"}`}>
                      {r.year === 0 || r.cashFlow === undefined ? "–" : `${r.cashFlow >= 0 ? "+" : "−"}${usd(Math.abs(r.cashFlow))}`}
                    </td>
                  )}
                  {showCashFlow && <td className="py-2 text-right font-medium">{r.keep === undefined ? "–" : usd(r.keep)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {horizon > 10 && (
        <button type="button" className="no-print mt-3 text-sm text-accent hover:underline" onClick={() => setAllYears((a) => !a)}>
          {allYears ? "Show key years" : "Show every year"}
        </button>
      )}
    </div>
  );
}
