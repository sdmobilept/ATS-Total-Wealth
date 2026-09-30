// Phase 4: Monte Carlo risk, cash flow, and keep-vs-sell. Pure functions shared by the app and tests.
// Like engine.ts, keep this free of runtime TS-only syntax so Node can run it directly.
import { bandSd, baseGrowthPath, rateShift, type MarketStats, type ModelParams } from "./engine.ts";

// ---- Monte Carlo ----------------------------------------------------------------

/** Small, fast, seedable PRNG so simulations are reproducible between renders. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export interface SimulationOptions {
  paths: number;
  seed: number;
  /** Comparison growth rate (e.g. InsMark's flat 5%). */
  flatRate: number;
  /** Loan balance at the end of each year 0..years; all zero for no mortgage. */
  loanBalances: number[];
  /** How many sample paths to return for drawing. */
  samplePaths: number;
}

export interface SimulationSummary {
  years: number;
  /** A few simulated value paths (index 0 = today) for display. */
  samples: number[][];
  /** Percentiles of value at the horizon. */
  terminal: { p10: number; p25: number; p50: number; p75: number; p90: number };
  /** Chance the value at the horizon is below today's value. */
  pLoss: number;
  /** Chance the value at the horizon beats the flat-rate projection. */
  pBeatFlat: number;
  /** Chance the value dips below the loan balance in any year (0 without a loan). */
  pUnderwater: number;
  /** Chance of a peak-to-trough fall of 20% or more at some point (year-end values). */
  pDrawdown20: number;
}

/**
 * Simulates yearly log-value paths: ln V_t = median_t + sd_t * W_t, where sd_t is the calibrated band
 * and W_t is a unit-variance AR(1) process, W_t = rho_t * W_{t-1} + sqrt(1 - rho_t^2) * e_t.
 *
 * So every horizon's distribution matches the band exactly. The band widens almost linearly over the
 * first years, which means forecast errors are persistent; independent yearly shocks would need huge
 * zig-zags to reach that width. rho_t is chosen so a simulated year moves by about the ZIP's historical
 * annual volatility (sigma), which keeps paths, drawdowns and "underwater" odds realistic.
 * Year-end values only, so within-year dips are not captured.
 */
export function simulate(value0: number, stats: MarketStats, p: ModelParams, years: number, o: SimulationOptions): SimulationSummary {
  const g = baseGrowthPath(stats, p, years);
  const center: number[] = [0];
  const sd: number[] = [0];
  const rho: number[] = [0];
  let acc = 0;
  for (let t = 1; t <= years; t++) {
    acc += Math.log(1 + g[t - 1]);
    center.push(acc + rateShift(p, t));
    sd.push(bandSd(stats, p, t));
    // Var(X_t - X_{t-1}) = sd_t^2 + sd_{t-1}^2 - 2 rho sd_t sd_{t-1}  =  sigma^2
    const r = t === 1 ? 0 : (sd[t] ** 2 + sd[t - 1] ** 2 - stats.sigma ** 2) / (2 * sd[t] * sd[t - 1]);
    rho.push(Math.min(Math.max(r, 0), 0.999));
  }

  const rng = mulberry32(o.seed);
  const flatEnd = value0 * Math.pow(1 + o.flatRate, years);
  const terminal: number[] = [];
  const samples: number[][] = [];
  let loss = 0, beat = 0, under = 0, dd = 0;
  for (let i = 0; i < o.paths; i++) {
    let w = 0;
    let peak = value0;
    let wasUnder = false;
    let hadDrawdown = false;
    const path = [value0];
    for (let t = 1; t <= years; t++) {
      w = rho[t] * w + Math.sqrt(1 - rho[t] ** 2) * gaussian(rng);
      const v = value0 * Math.exp(center[t] + sd[t] * w);
      path.push(v);
      if (v < (o.loanBalances[t] ?? 0)) wasUnder = true;
      peak = Math.max(peak, v);
      if (v <= 0.8 * peak) hadDrawdown = true;
    }
    const end = path[years];
    terminal.push(end);
    if (end < value0) loss++;
    if (end > flatEnd) beat++;
    if (wasUnder) under++;
    if (hadDrawdown) dd++;
    if (i < o.samplePaths) samples.push(path);
  }
  terminal.sort((a, b) => a - b);
  const q = (x: number) => terminal[Math.min(terminal.length - 1, Math.floor(x * terminal.length))];
  return {
    years,
    samples,
    terminal: { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) },
    pLoss: loss / o.paths,
    pBeatFlat: beat / o.paths,
    pUnderwater: under / o.paths,
    pDrawdown20: dd / o.paths,
  };
}

// ---- Cash flow ------------------------------------------------------------------

export type Occupancy = "rental" | "primary";

export interface CashFlowInputs {
  occupancy: Occupancy;
  /** Monthly rent collected (rental) or rent you'd otherwise pay to live elsewhere (primary). */
  monthlyRent: number;
  rentGrowth: number;
  /** Share of rent lost to vacancy (rental only). */
  vacancy: number;
  /** Property management fee as a share of collected rent (rental only). */
  management: number;
  /** Property tax in year 1 ($) and its yearly growth (e.g. 2% under California's Prop 13). */
  propertyTax: number;
  propertyTaxGrowth: number;
  /** Insurance ($/yr) and HOA ($/mo), both growing with inflation. */
  insurance: number;
  hoaMonthly: number;
  /** Maintenance and repairs as a share of the property's value each year. */
  maintenance: number;
  inflation: number;
}

export interface CashFlowYear {
  year: number;
  grossRent: number;
  vacancyLoss: number;
  operatingExpenses: number;
  /** Net operating income: rent after vacancy minus operating expenses (before mortgage). */
  noi: number;
  debtService: number;
  cashFlow: number;
  /** NOI as a share of the property's value at the start of the year. */
  capRate: number;
}

/**
 * Yearly cash flow for years 1..N. `values` is the property value by year (0..N) and
 * `monthlyPayment`/`monthsRemaining` describe the mortgage.
 */
export function cashFlows(values: number[], monthlyPayment: number, monthsRemaining: number, c: CashFlowInputs): CashFlowYear[] {
  const out: CashFlowYear[] = [];
  const rental = c.occupancy === "rental";
  for (let t = 1; t < values.length; t++) {
    const grossRent = c.monthlyRent * 12 * Math.pow(1 + c.rentGrowth, t - 1);
    const vacancyLoss = rental ? grossRent * c.vacancy : 0;
    const collected = grossRent - vacancyLoss;
    const infl = Math.pow(1 + c.inflation, t - 1);
    const operatingExpenses =
      (rental ? collected * c.management : 0) +
      c.propertyTax * Math.pow(1 + c.propertyTaxGrowth, t - 1) +
      c.insurance * infl +
      c.hoaMonthly * 12 * infl +
      c.maintenance * values[t - 1];
    const noi = collected - operatingExpenses;
    const monthsPaid = Math.max(0, Math.min(12, monthsRemaining - 12 * (t - 1)));
    const debtService = monthlyPayment * monthsPaid;
    out.push({
      year: t,
      grossRent,
      vacancyLoss,
      operatingExpenses,
      noi,
      debtService,
      cashFlow: noi - debtService,
      capRate: values[t - 1] > 0 ? noi / values[t - 1] : 0,
    });
  }
  return out;
}

// ---- Keep vs. sell ----------------------------------------------------------------

export interface KeepSellYear {
  year: number;
  /** Net worth from keeping: equity if sold that year (after selling costs) + cash flows invested at the alternative rate. */
  keep: number;
  /** Net worth from selling today and investing the net proceeds at the alternative rate. */
  sell: number;
}

/**
 * Compares keeping the property with selling today. Cash flows (positive or negative) are assumed
 * invested at `altReturn`, so a property that needs money each year is charged the return that money
 * would have earned. For a home you live in, the "rent" is the rent you avoid by owning.
 */
export function keepVsSell(
  values: number[],
  loans: number[],
  flows: CashFlowYear[],
  sellingCost: number,
  altReturn: number,
): KeepSellYear[] {
  const proceeds0 = values[0] * (1 - sellingCost) - loans[0];
  const out: KeepSellYear[] = [{ year: 0, keep: proceeds0, sell: proceeds0 }];
  let invested = 0;
  for (let t = 1; t < values.length; t++) {
    invested = invested * (1 + altReturn) + (flows[t - 1]?.cashFlow ?? 0);
    out.push({
      year: t,
      keep: values[t] * (1 - sellingCost) - loans[t] + invested,
      sell: proceeds0 * Math.pow(1 + altReturn, t),
    });
  }
  return out;
}

/** Alternative return at which selling today and keeping end up equal at the horizon (null if none in -10%..30%). */
export function breakEvenReturn(
  values: number[],
  loans: number[],
  flows: CashFlowYear[],
  sellingCost: number,
): number | null {
  const gap = (r: number) => {
    const k = keepVsSell(values, loans, flows, sellingCost, r);
    const last = k[k.length - 1];
    return last.keep - last.sell;
  };
  let lo = -0.1, hi = 0.3;
  if (Math.sign(gap(lo)) === Math.sign(gap(hi))) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(gap(mid)) === Math.sign(gap(lo))) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
