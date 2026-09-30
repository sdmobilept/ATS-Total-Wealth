"use client";

import { useEffect, useMemo, useState } from "react";
import {
  amortize,
  anchorRate,
  computeStats,
  indexAdjustYear,
  momentumRate,
  monthIndex,
  monthlyPayment,
  project,
  rateShift,
  type AnchorMode,
  type ModelParams,
  type TrendMethod,
} from "@/lib/engine";
import { fetchAvm, geocode, loadMacro, pickTier, resolveLocation, TIER_LABEL, type AvmResult, type Location } from "@/lib/data";
import type { MacroData, Tier } from "@/lib/data-types";
import type { MonthlySeries } from "@/lib/engine";
import { calibration, DEFAULT_FLAT_RATE, DEFAULT_HORIZON, defaultParams } from "@/lib/defaults";
import { monthLabel, normInv, ordinal, pct, signedPct, usd, usdCompact } from "@/lib/format";
import { ProjectionChart, type ChartRow } from "./ProjectionChart";
import { Slider } from "./Slider";
import { WealthTable, type WealthRow } from "./WealthTable";

const EXAMPLES = ["77494", "94110", "60614", "08701"];
const PRESETS = [
  { label: "Conservative", pctile: 25 },
  { label: "Base", pctile: 50 },
  { label: "Aggressive", pctile: 75 },
];

const parseMoney = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;
const moneyInput = (n: number) => (n ? Math.round(n).toLocaleString("en-US") : "");
const latest = (s: MonthlySeries) => s.v[s.v.length - 1];

function Card({ title, children, className = "", action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`card min-w-0 rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card-2 p-3 sm:p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold sm:text-2xl ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-card-2 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-md px-3 py-1 ${o.value === value ? "bg-card font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ValueSourceNote({ avm, valueSource, typical, isAddress }: { avm: AvmResult | null; valueSource: "avm" | "manual" | "typical"; typical: number; isAddress: boolean }) {
  const usage = avm?.usage;
  const usageLine = usage && (
    <span className="block text-muted">
      Automatic lookups this month: {usage.used} of {usage.limit} (resets {usage.resetsOn})
    </span>
  );
  if (avm?.status === "ok") {
    const p = avm.property;
    const facts = [
      p.bedrooms != null && `${p.bedrooms} bd`,
      p.bathrooms != null && `${p.bathrooms} ba`,
      p.squareFootage != null && `${p.squareFootage.toLocaleString()} sq ft`,
      p.yearBuilt != null && `built ${p.yearBuilt}`,
    ].filter(Boolean);
    return (
      <div className="mb-3 rounded-lg bg-accent-soft p-3 text-xs text-ink-2">
        <span className="block font-medium text-ink">
          RentCast estimate {usd(avm.price)} <span className="font-normal text-ink-2">({usdCompact(avm.low)}–{usdCompact(avm.high)})</span>
        </span>
        {facts.length > 0 && <span className="block">{facts.join(" · ")}</span>}
        {p.lastSalePrice && p.lastSaleDate && (
          <span className="block">Last sold {usd(p.lastSalePrice)} in {monthLabel(p.lastSaleDate.slice(0, 7))}</span>
        )}
        {valueSource === "manual" && <span className="block">You&apos;ve overridden it below.</span>}
        {avm.cached ? <span className="block text-muted">Saved lookup (no quota used)</span> : usageLine}
      </div>
    );
  }
  if (valueSource !== "typical") return null;
  // Only mention the automatic-value service when it's actually configured (usage is reported).
  const avmReason = avm && avm.status !== "disabled" ? `${avm.message} ` : "";
  return (
    <div className="mb-3 rounded-lg border border-accent bg-accent-soft p-3 text-xs text-ink-2">
      <span className="block font-medium text-ink">ZIP-code estimate: the typical home in this ZIP ({usd(typical)})</span>
      <span className="block">
        {avmReason}For this specific home, switch to <strong>Price paid</strong> and enter what was paid and the year, or type
        its current value below (e.g. from Zillow or Redfin).
      </span>
      {isAddress && usageLine}
    </div>
  );
}

function YearSelect({ value, onChange, from, to }: { value: string; onChange: (v: string) => void; from: number; to: number }) {
  const years: number[] = [];
  for (let y = to; y >= from; y--) years.push(y);
  return (
    <select className="field mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Year</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

export function Calculator() {
  const [macro, setMacro] = useState<MacroData | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [avm, setAvm] = useState<AvmResult | null>(null);
  /** Where "Estimated value today" came from. */
  const [valueSource, setValueSource] = useState<"avm" | "manual" | "typical">("typical");
  const [tierChoice, setTierChoice] = useState<"auto" | Tier>("auto");

  const [valueMode, setValueMode] = useState<"current" | "purchase">("current");
  const [currentValue, setCurrentValue] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseYear, setPurchaseYear] = useState("");
  const [loanBalance, setLoanBalance] = useState("");
  const [loanRate, setLoanRate] = useState(6.5);
  const [loanYears, setLoanYears] = useState(25);

  const [horizon, setHorizon] = useState(DEFAULT_HORIZON);
  const [flatRate, setFlatRate] = useState(DEFAULT_FLAT_RATE);
  const [pctile, setPctile] = useState(50);
  const [params, setParams] = useState<ModelParams | null>(null);
  const [useZillowY1, setUseZillowY1] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadMacro().then((m) => {
      if (!m) return;
      setMacro(m);
      setParams(defaultParams(m.mortgage.latest));
      // Shareable links: /?q=<zip or address>&paid=<price>&year=<year bought>
      const qs = new URLSearchParams(window.location.search);
      const q = qs.get("q");
      const paid = moneyInput(parseMoney(qs.get("paid") ?? ""));
      const year = qs.get("year") ?? "";
      if (q) {
        setQuery(q);
        setPurchasePrice(paid);
        setPurchaseYear(year);
        search(q, paid, year);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setParam = <K extends keyof ModelParams>(k: K, v: ModelParams[K]) => setParams((p) => (p ? { ...p, [k]: v } : p));

  async function search(input: string, paid = purchasePrice, year = purchaseYear) {
    const q = input.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      let loc: Location;
      let value: AvmResult | null = null;
      if (/^\d{5}$/.test(q)) loc = await resolveLocation(q);
      else {
        const g = await geocode(q);
        // A street address gets a property-level estimate; the ZIP series still drives the trend.
        [loc, value] = await Promise.all([resolveLocation(g.zip, g.countyFips, g.matchedAddress), fetchAvm(g.matchedAddress)]);
      }
      setLocation(loc);
      setAvm(value);
      setTierChoice("auto");
      const hasPurchase = parseMoney(paid) > 0 && Number(year) > 0;
      const url = new URLSearchParams({ q });
      if (hasPurchase) {
        url.set("paid", String(parseMoney(paid)));
        url.set("year", year);
      }
      window.history.replaceState(null, "", `?${url}`);
      if (value?.status === "ok") {
        setCurrentValue(moneyInput(value.price));
        setValueSource("avm");
        const { lastSalePrice, lastSaleDate } = value.property;
        if (!hasPurchase && lastSalePrice && lastSaleDate) {
          setPurchasePrice(moneyInput(lastSalePrice));
          setPurchaseYear(lastSaleDate.slice(0, 4));
        }
      } else {
        setCurrentValue(moneyInput(latest(loc.tiers.middle)));
        setValueSource("typical");
      }
      // Price paid + year bought is the most reliable home-specific input we have.
      setValueMode(hasPurchase ? "purchase" : "current");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  // Follow the price tier that matches this home's value (option: user override).
  const tierInfo = useMemo(() => {
    if (!location) return null;
    const mid = location.tiers.middle;
    const price = parseMoney(purchasePrice);
    const year = Number(purchaseYear);
    const auto =
      valueMode === "purchase" && price > 0 && year > 0
        ? pickTier(price, location.tiers, year)
        : pickTier(parseMoney(currentValue) || latest(mid), location.tiers);
    const tier: Tier = tierChoice === "auto" ? auto : location.tiers[tierChoice] ? tierChoice : "middle";
    return { tier, auto, series: location.tiers[tier]! };
  }, [location, valueMode, currentValue, purchasePrice, purchaseYear, tierChoice]);

  const stats = useMemo(() => (tierInfo ? computeStats(tierInfo.series) : null), [tierInfo]);

  const model = useMemo(() => {
    if (!location || !tierInfo || !stats || !params || !macro) return null;
    const series = tierInfo.series;
    const paid = parseMoney(purchasePrice);
    const value0 =
      valueMode === "current"
        ? parseMoney(currentValue) || stats.value
        : (paid > 0 && Number(purchaseYear) > 0 && indexAdjustYear(series, paid, Number(purchaseYear))) || stats.value;

    const p: ModelParams = {
      ...params,
      scenarioZ: normInv(pctile / 100),
      year1Growth: useZillowY1 && location.forecast ? location.forecast.m12 / 100 : null,
    };
    const [asOfY, asOfM] = stats.asOf.split("-").map(Number);
    const nowT = asOfY + (asOfM - 1) / 12;
    const proj = project(value0, stats, p, horizon, asOfY);
    const balances = amortize(parseMoney(loanBalance), loanRate / 100, loanYears * 12, horizon);

    const rows: ChartRow[] = [];
    const startIdx = monthIndex(series.start);
    const last = series.v[series.v.length - 1];
    for (let i = 0; i < series.v.length; i++) {
      const m = startIdx + i;
      rows.push({ t: Math.floor(m / 12) + (m % 12) / 12, history: (value0 * series.v[i]) / last });
    }
    const nowRow = rows[rows.length - 1];
    nowRow.median = value0;
    nowRow.band = [value0, value0];
    nowRow.scenario = value0;
    nowRow.flat = value0;
    for (const y of proj.slice(1)) {
      rows.push({
        t: nowT + y.year,
        median: y.median,
        band: [y.low, y.high],
        scenario: y.scenario,
        flat: value0 * Math.pow(1 + flatRate, y.year),
      });
    }

    const table: WealthRow[] = proj.map((y, i) => {
      const flat = value0 * Math.pow(1 + flatRate, y.year);
      return {
        year: y.year,
        label: y.label,
        value: y.scenario,
        growth: y.scenarioGrowth,
        low: y.low,
        median: y.median,
        high: y.high,
        flat,
        loan: balances[i],
        equity: y.scenario - balances[i],
        flatEquity: flat - balances[i],
      };
    });

    const end = proj[proj.length - 1];
    const flatEnd = value0 * Math.pow(1 + flatRate, horizon);
    return {
      value0,
      series,
      p,
      nowT,
      rows,
      table,
      end,
      flatEnd,
      balances,
      payment: monthlyPayment(parseMoney(loanBalance), loanRate / 100, loanYears * 12),
      scenarioCagr: Math.pow(end.scenario / value0, 1 / horizon) - 1,
      momentum: momentumRate(stats, p),
      anchor: anchorRate(stats, p),
      rateEffect: Math.exp(rateShift(p, horizon)) - 1,
    };
  }, [location, tierInfo, stats, params, macro, valueMode, currentValue, purchasePrice, purchaseYear, loanBalance, loanRate, loanYears, horizon, flatRate, pctile, useZillowY1]);

  const scenarioLabel = pctile === 50 ? "Your scenario (median)" : `Your scenario (${ordinal(pctile)} pct)`;
  const flatLabel = `Flat ${pct(flatRate, 1)}/yr (InsMark-style)`;

  function exportCsv() {
    if (!model || !location || !stats) return;
    const p = model.p;
    const lines = [
      `# Property Wealth Projector export`,
      `# Location,${location.label} (${location.source === "zip" ? "ZIP" : "county"} data through ${stats.asOf})`,
      `# Starting value,${Math.round(model.value0)},Source,${valueMode === "purchase" ? "purchase price index-adjusted" : valueSource === "avm" ? "RentCast estimate" : valueSource === "manual" ? "entered" : "ZIP typical value"}`,
      `# Trend price tier,${tierInfo ? TIER_LABEL[tierInfo.tier] : ""}`,
      `# Scenario percentile,${pctile}`,
      `# Momentum weight,${p.momentumWeight},Fade years,${p.fadeYears},Anchor,${p.anchorMode},Inflation,${p.inflation},Real premium,${p.realPremium}`,
      `# Mortgage rate now,${p.currentRate},Target,${p.targetRate},Years,${p.rateYears},Rate sensitivity per 1pp,${p.rateSensitivity}`,
      `# Flat comparison rate,${flatRate}`,
      "Year,Calendar year,Scenario value,Scenario growth %,Median value,10th pct value,90th pct value,Flat value,Loan balance,Equity (scenario),Equity (flat)",
      ...model.table.map((r) =>
        [r.year, r.label, r.value, r.growth * 100, r.median, r.low, r.high, r.flat, r.loan, r.equity, r.flatEquity]
          .map((x, i) => (i === 3 ? x.toFixed(2) : i < 2 ? x : Math.round(x)))
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `property-projection-${location.zip ?? "county"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">What will this property be worth?</h1>
        <p className="mt-1 max-w-2xl text-ink-2">
          Projects value and equity from the ZIP code&apos;s actual market trend, with an honest range, instead of a flat
          growth rate.
        </p>
      </div>

      {/* ---- Location ---- */}
      <Card className="no-print">
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_130px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
        >
          <label className="block text-sm text-ink-2">
            Property address or ZIP code
            <input
              className="field mt-1"
              placeholder="e.g. 123 Main St, Katy, TX  or  77494"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <label className="block text-sm text-ink-2">
              Price paid <span className="text-muted">(optional)</span>
              <input
                className="field tabular mt-1"
                inputMode="numeric"
                placeholder="$"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(moneyInput(parseMoney(e.target.value)))}
              />
            </label>
            <label className="block text-sm text-ink-2">
              Year bought
              <YearSelect value={purchaseYear} onChange={setPurchaseYear} from={2000} to={Number((macro?.dataThrough ?? "2026").slice(0, 4))} />
            </label>
          </div>
          <button
            type="submit"
            disabled={loading || !macro}
            className="rounded-[10px] bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Looking up…" : "Analyze"}
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Values are ZIP-code based. Add the price paid and year bought to grow this home&apos;s own price with its
          ZIP&apos;s actual market history. Leave them blank to see the ZIP&apos;s typical home.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          Try:
          {EXAMPLES.map((z) => (
            <button
              key={z}
              type="button"
              className="rounded-full border border-line px-2 py-0.5 hover:border-accent hover:text-accent"
              onClick={() => {
                setQuery(z);
                setPurchasePrice("");
                setPurchaseYear("");
                search(z, "", "");
              }}
            >
              {z}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
      </Card>

      {!location && !loading && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-ink-2">
          Enter an address or ZIP to see its market trend and a projection.
          {macro && (
            <p className="mt-2 text-xs text-muted">
              {macro.zipCount.toLocaleString()} ZIP codes · data through {monthLabel(macro.dataThrough)} · 30-yr mortgage{" "}
              {macro.mortgage.latest}% ({macro.mortgage.latestDate})
            </p>
          )}
        </div>
      )}

      {location && stats && model && params && macro && (
        <>
          {/* ---- Location header + key stats ---- */}
          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">{location.label}</span>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                    {location.source === "zip" ? "ZIP-code based" : "County based"}
                  </span>
                </div>
                <div className="text-sm text-ink-2">{location.matchedAddress ?? location.sublabel}</div>
                {location.matchedAddress && <div className="text-xs text-muted">{location.sublabel}</div>}
                {location.note && <div className="mt-1 text-xs text-bad">{location.note}</div>}
                {location.source === "zip" && (
                  <div className="mt-1 text-xs text-muted">
                    Typical home values here:{" "}
                    {(["bottom", "middle", "top"] as Tier[])
                      .filter((t) => location.tiers[t])
                      .map((t) => `${TIER_LABEL[t].replace(" third", "").toLowerCase()} ${usdCompact(latest(location.tiers[t]!))}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
              <div className="no-print flex gap-2">
                <button type="button" onClick={exportCsv} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent">
                  Export CSV
                </button>
                <button type="button" onClick={() => window.print()} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent">
                  Print / PDF
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Value today" value={usd(model.value0)} sub={
                  valueMode === "purchase"
                    ? parseMoney(purchasePrice) > 0 && purchaseYear
                      ? `Paid ${usdCompact(parseMoney(purchasePrice))} in ${purchaseYear}, grown with ZIP ${location.zip ?? ""} prices`
                      : "Enter price paid and year below"
                    : valueSource === "avm" && avm?.status === "ok"
                      ? `RentCast estimate · ${usdCompact(avm.low)}–${usdCompact(avm.high)}`
                      : valueSource === "manual"
                        ? "As entered"
                        : `ZIP ${location.zip ?? ""} typical home, not this home`
                }
              />
              <Stat label="Last 12 months" value={signedPct(stats.yoy)} sub={`Market change to ${monthLabel(stats.asOf)}`} tone={stats.yoy >= 0 ? "good" : "bad"} />
              <Stat label="5-year trend" value={`${signedPct(stats.trend5)}/yr`} sub={`5-yr CAGR ${signedPct(stats.cagr5)} · volatility ${pct(stats.sigma)}`} />
              <Stat
                label={`Value in ${horizon} yrs`}
                value={usdCompact(model.end.scenario)}
                sub={`${signedPct(model.scenarioCagr)}/yr avg · ${model.end.scenario >= model.flatEnd ? "+" : "−"}${usdCompact(Math.abs(model.end.scenario - model.flatEnd))} vs flat ${pct(flatRate, 1)}`}
              />
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
            {/* ---- Chart ---- */}
            <Card
              title="Market history & projection"
              action={
                <span className="no-print">
                  <Segmented value={horizon} onChange={setHorizon} options={[10, 20, 30].map((y) => ({ value: y, label: `${y} yrs` }))} />
                </span>
              }
            >
              <ProjectionChart rows={model.rows} nowT={model.nowT} scenarioLabel={scenarioLabel} flatLabel={flatLabel} />
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-card-2 p-3">
                  <div className="text-xs text-muted">Near-term momentum</div>
                  <div className="tabular font-semibold">{signedPct(model.momentum)}/yr</div>
                  <div className="text-xs text-ink-2">fades over ~{params.fadeYears} yr{params.fadeYears === 1 ? "" : "s"}</div>
                </div>
                <div className="rounded-lg bg-card-2 p-3">
                  <div className="text-xs text-muted">Long-run anchor</div>
                  <div className="tabular font-semibold">{signedPct(model.anchor)}/yr</div>
                  <div className="text-xs text-ink-2">
                    {params.anchorMode === "local" ? "ZIP's own long-run growth" : params.anchorMode === "blend" ? "blend of inflation+premium and local" : `inflation ${pct(params.inflation)} + ${pct(params.realPremium)} real`}
                  </div>
                </div>
                <div className="rounded-lg bg-card-2 p-3">
                  <div className="text-xs text-muted">Mortgage-rate effect</div>
                  <div className="tabular font-semibold">{signedPct(model.rateEffect)}</div>
                  <div className="text-xs text-ink-2">
                    {params.currentRate}% → {params.targetRate.toFixed(2)}% over {params.rateYears} yrs
                  </div>
                </div>
              </div>
            </Card>

            {/* ---- Controls ---- */}
            <div className="no-print min-w-0 space-y-5">
              <Card title="Scenario">
                <div className="mb-3 flex gap-2">
                  {PRESETS.map((pr) => (
                    <button
                      key={pr.label}
                      type="button"
                      onClick={() => setPctile(pr.pctile)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${pctile === pr.pctile ? "border-accent bg-accent-soft font-medium text-accent" : "border-line text-ink-2 hover:text-ink"}`}
                    >
                      {pr.label}
                    </button>
                  ))}
                </div>
                <Slider
                  label="Outcome percentile"
                  value={pctile}
                  min={10}
                  max={90}
                  step={1}
                  onChange={setPctile}
                  format={(v) => `${ordinal(v)}`}
                  hint={`About ${pctile}% of outcomes are expected to land below this path, ${100 - pctile}% above.`}
                />
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>← Conservative</span>
                  <span>Aggressive →</span>
                </div>
                <div className="mt-4 space-y-4 border-t border-line pt-4">
                  <Slider
                    label="Mortgage rate in the future"
                    value={params.targetRate}
                    min={3}
                    max={10}
                    step={0.05}
                    onChange={(v) => setParam("targetRate", v)}
                    format={(v) => `${v.toFixed(2)}%`}
                    hint={`Today: ${params.currentRate}% (Freddie Mac, ${macro.mortgage.latestDate}). Lower rates lift prices.`}
                  />
                  <Slider
                    label="Compare against flat growth"
                    value={flatRate * 100}
                    min={0}
                    max={10}
                    step={0.25}
                    onChange={(v) => setFlatRate(v / 100)}
                    format={(v) => `${v.toFixed(2)}%`}
                  />
                </div>
              </Card>

              <Card title="Property">
                <div className="mb-3">
                  <Segmented
                    value={valueMode}
                    onChange={setValueMode}
                    options={[
                      { value: "current", label: "Current value" },
                      { value: "purchase", label: "Price paid" },
                    ]}
                  />
                </div>
                {valueMode === "current" && <ValueSourceNote avm={avm} valueSource={valueSource} typical={latest(location.tiers.middle)} isAddress={!!location.matchedAddress} />}
                {valueMode === "current" ? (
                  <label className="block text-sm text-ink-2">
                    Estimated value today
                    <input
                      className={`field tabular mt-1 ${valueSource === "typical" ? "ring-2 ring-accent" : ""}`}
                      inputMode="numeric"
                      value={currentValue}
                      onChange={(e) => {
                        setCurrentValue(moneyInput(parseMoney(e.target.value)));
                        setValueSource("manual");
                      }}
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm text-ink-2">
                      Price paid
                      <input className="field tabular mt-1" inputMode="numeric" value={purchasePrice} onChange={(e) => setPurchasePrice(moneyInput(parseMoney(e.target.value)))} />
                    </label>
                    <label className="block text-sm text-ink-2">
                      Year bought
                      <YearSelect value={purchaseYear} onChange={setPurchaseYear} from={Number(model.series.start.slice(0, 4))} to={Number(stats.asOf.slice(0, 4))} />
                    </label>
                  </div>
                )}
                {tierInfo && (location.tiers.bottom || location.tiers.top) && (
                  <div className="mt-4 border-t border-line pt-4 text-sm text-ink-2">
                    Market trend from
                    <div className="mt-1">
                      <Segmented<"auto" | Tier>
                        value={tierChoice}
                        onChange={setTierChoice}
                        options={[
                          { value: "auto", label: "Auto" },
                          ...(["bottom", "middle", "top"] as Tier[])
                            .filter((t) => location.tiers[t])
                            .map((t) => ({ value: t, label: t === "bottom" ? "Lower" : t === "middle" ? "Middle" : "Upper" })),
                        ]}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {TIER_LABEL[tierInfo.tier]} of homes in {location.zip} (typical {usdCompact(latest(tierInfo.series))})
                      {tierChoice === "auto" ? ", matched to this home's value." : "."}
                    </p>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  <label className="col-span-3 block text-sm text-ink-2">
                    Mortgage balance (optional)
                    <input className="field tabular mt-1" inputMode="numeric" placeholder="0" value={loanBalance} onChange={(e) => setLoanBalance(moneyInput(parseMoney(e.target.value)))} />
                  </label>
                  <label className="col-span-1 block text-sm text-ink-2">
                    Rate %
                    <input type="number" step="0.125" className="field tabular mt-1" value={loanRate} onChange={(e) => setLoanRate(Number(e.target.value))} />
                  </label>
                  <label className="col-span-2 block text-sm text-ink-2">
                    Years left
                    <input type="number" min={0} max={40} className="field tabular mt-1" value={loanYears} onChange={(e) => setLoanYears(Number(e.target.value))} />
                  </label>
                  {model.payment > 0 && <p className="col-span-3 text-xs text-muted">Principal & interest: {usd(model.payment)}/mo</p>}
                </div>
              </Card>
            </div>
          </div>

          {/* ---- Advanced ---- */}
          <Card
            className="no-print"
            title="Model assumptions"
            action={
              <div className="flex gap-2">
                {showAdvanced && (
                  <button
                    type="button"
                    className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
                    onClick={() => {
                      setParams(defaultParams(macro.mortgage.latest));
                      setUseZillowY1(false);
                      setPctile(50);
                      setFlatRate(DEFAULT_FLAT_RATE);
                    }}
                  >
                    Reset to defaults
                  </button>
                )}
                <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent" onClick={() => setShowAdvanced((s) => !s)}>
                  {showAdvanced ? "Hide" : "Show"}
                </button>
              </div>
            }
          >
            {!showAdvanced ? (
              <p className="text-sm text-ink-2">
                Defaults come from a walk-forward backtest over {calibration.nOutOfSample.toLocaleString()} past ZIP forecasts. Open to
                adjust momentum, fade speed, long-run growth and interest-rate sensitivity.{" "}
                <a href="/methodology" className="text-accent hover:underline">How the model works →</a>
              </p>
            ) : (
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-3">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Near-term momentum</h3>
                  <Slider
                    label="Weight on last 12 months"
                    value={params.momentumWeight}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setParam("momentumWeight", v)}
                    format={(v) => `${Math.round(v * 100)}%`}
                    hint={`Rest goes to the 5-yr trend. Backtest: ${Math.round(calibration.params.momentumWeight * 100)}%.`}
                  />
                  <Slider
                    label="Momentum fade time"
                    value={params.fadeYears}
                    min={0.5}
                    max={8}
                    step={0.5}
                    onChange={(v) => setParam("fadeYears", v)}
                    format={(v) => `${v} yrs`}
                    hint={`How fast hot or cold markets revert. Backtest: ${calibration.params.fadeYears} yr.`}
                  />
                  <div className="text-sm text-ink-2">
                    5-yr trend method
                    <div className="mt-1">
                      <Segmented<TrendMethod>
                        value={params.trendMethod}
                        onChange={(v) => setParam("trendMethod", v)}
                        options={[
                          { value: "loglinear", label: "Fitted trend" },
                          { value: "cagr", label: "Endpoint CAGR" },
                        ]}
                      />
                    </div>
                  </div>
                  {location.forecast && (
                    <label className="flex items-start gap-2 text-sm text-ink-2">
                      <input type="checkbox" className="mt-1" checked={useZillowY1} onChange={(e) => setUseZillowY1(e.target.checked)} />
                      <span>
                        Use Zillow&apos;s 12-month forecast for year 1 ({signedPct(location.forecast.m12 / 100)} from {monthLabel(location.forecast.base)})
                      </span>
                    </label>
                  )}
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Long-run growth</h3>
                  <div className="text-sm text-ink-2">
                    Anchor
                    <div className="mt-1">
                      <Segmented<AnchorMode>
                        value={params.anchorMode}
                        onChange={(v) => setParam("anchorMode", v)}
                        options={[
                          { value: "inflation", label: "Inflation+" },
                          { value: "local", label: "Local" },
                          { value: "blend", label: "Blend" },
                        ]}
                      />
                    </div>
                    {stats.longRun !== null && (
                      <p className="mt-1 text-xs text-muted">This area&apos;s own {Math.round(stats.longRunYears)}-yr growth: {signedPct(stats.longRun)}/yr</p>
                    )}
                  </div>
                  <Slider
                    label="Expected inflation"
                    value={params.inflation * 100}
                    min={0}
                    max={6}
                    step={0.1}
                    onChange={(v) => setParam("inflation", v / 100)}
                    format={(v) => `${v.toFixed(1)}%`}
                    hint={`Trailing 10-yr CPI: ${pct(macro.inflation10y)}/yr.`}
                  />
                  <Slider
                    label="Real growth above inflation"
                    value={params.realPremium * 100}
                    min={-1}
                    max={4}
                    step={0.1}
                    onChange={(v) => setParam("realPremium", v / 100)}
                    format={(v) => `${v.toFixed(1)}%`}
                    hint={`Long-run research: 0–1.5%. Backtest fit incl. 2020–22 boom: ${pct(calibration.params.realPremium)}.`}
                  />
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Interest rates</h3>
                  <Slider
                    label="Price change per +1 pt in rates"
                    value={params.rateSensitivity * 100}
                    min={-8}
                    max={0}
                    step={0.5}
                    onChange={(v) => setParam("rateSensitivity", v / 100)}
                    format={(v) => `${v.toFixed(1)}%`}
                    hint="Research range roughly 0% to −8%. Default −3%."
                  />
                  <Slider
                    label="Years for rates to reach target"
                    value={params.rateYears}
                    min={0}
                    max={5}
                    step={0.5}
                    onChange={(v) => setParam("rateYears", v)}
                    format={(v) => (v === 0 ? "Immediately" : `${v} yrs`)}
                  />
                  <Slider
                    label="Uncertainty band width"
                    value={params.bandScale}
                    min={0.3}
                    max={2}
                    step={0.05}
                    onChange={(v) => setParam("bandScale", v)}
                    format={(v) => `${v.toFixed(2)}×`}
                    hint={`Calibrated so 80% of past outcomes fell inside: ${calibration.params.bandScale.toFixed(2)}×.`}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* ---- Wealth table ---- */}
          <Card title="Year-by-year wealth">
            <WealthTable rows={model.table} horizon={horizon} flatRate={flatRate} hasLoan={parseMoney(loanBalance) > 0} />
          </Card>

          <p className="text-xs text-muted">
            Estimate based on the {location.source === "zip" ? "ZIP" : "county"} market index (Zillow ZHVI) through {monthLabel(stats.asOf)}, applied to
            this property&apos;s value. It is not an appraisal and does not reflect the home&apos;s condition, improvements or
            features. Projections are uncertain; the shaded range shows where 80% of past outcomes landed.
          </p>
        </>
      )}
    </div>
  );
}
