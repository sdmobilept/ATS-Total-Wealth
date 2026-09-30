// Forecast engine shared by the web app and the offline scripts (backtest, reports).
// Keep this file free of runtime TS-only syntax (enums, namespaces) so Node can run it
// directly with type stripping.

/** Monthly index values starting at `start` ("YYYY-MM"), no gaps. */
export interface MonthlySeries {
  start: string;
  v: number[];
}

export interface MarketStats {
  asOf: string;
  value: number;
  months: number;
  /** Trailing 12-month change. */
  yoy: number;
  /** Annualized growth over the last 5 years, endpoint to endpoint. */
  cagr5: number;
  /** Annualized growth from a log-linear fit over the last 5 years of monthly data. */
  trend5: number;
  /** Annualized growth over up to 20 years; null when less than 10 years of history. */
  longRun: number | null;
  longRunYears: number;
  /** Standard deviation of annual log changes. */
  sigma: number;
}

export type TrendMethod = "loglinear" | "cagr";
export type AnchorMode = "inflation" | "local" | "blend";

export interface ModelParams {
  /** Weight on the trailing 12-month change; the rest goes to the 5-year trend. */
  momentumWeight: number;
  trendMethod: TrendMethod;
  /** Years for momentum to fade ~63% of the way to the long-run anchor. */
  fadeYears: number;
  anchorMode: AnchorMode;
  /** Expected annual inflation (decimal). */
  inflation: number;
  /** Real appreciation above inflation (decimal). */
  realPremium: number;
  /** Change in log price per +1 percentage point in mortgage rates (e.g. -0.03). */
  rateSensitivity: number;
  currentRate: number;
  targetRate: number;
  /** Years for mortgage rates to move from current to target. */
  rateYears: number;
  /** Scenario position in standard deviations: -1.28 = 10th percentile, +1.28 = 90th. */
  scenarioZ: number;
  /** Band sd = bandScale * sigma * years^bandExponent, both calibrated by the backtest. */
  bandScale: number;
  bandExponent: number;
  /** Optional override for year-1 growth (e.g. Zillow's 12-month forecast). */
  year1Growth: number | null;
}

export const Z10 = -1.2816;
export const Z90 = 1.2816;

export function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function ymFromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Stats from monthly values ending at index `end` (inclusive). Needs 61+ months. */
export function computeStats(series: MonthlySeries, end = series.v.length - 1): MarketStats | null {
  const v = series.v;
  if (end < 60 || end >= v.length) return null;
  const last = v[end];

  const yoy = last / v[end - 12] - 1;
  const cagr5 = Math.pow(last / v[end - 60], 1 / 5) - 1;

  // OLS slope of ln(value) on month over the last 61 points.
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const n = 61;
  for (let i = 0; i < n; i++) {
    const y = Math.log(v[end - 60 + i]);
    sx += i; sy += y; sxx += i * i; sxy += i * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const trend5 = Math.exp(12 * slope) - 1;

  const lrMonths = Math.min(240, end);
  const longRun = lrMonths >= 120 ? Math.pow(last / v[end - lrMonths], 12 / lrMonths) - 1 : null;

  const volMonths = Math.min(240, end);
  let s = 0, ss = 0, k = 0;
  for (let i = end - volMonths + 12; i <= end; i++) {
    const d = Math.log(v[i] / v[i - 12]);
    s += d; ss += d * d; k++;
  }
  const mean = s / k;
  const sigma = Math.sqrt(Math.max(ss / k - mean * mean, 0));

  return {
    asOf: ymFromIndex(monthIndex(series.start) + end),
    value: last,
    months: end + 1,
    yoy,
    cagr5,
    trend5,
    longRun,
    longRunYears: lrMonths / 12,
    sigma,
  };
}

export function momentumRate(stats: MarketStats, p: ModelParams): number {
  const trend = p.trendMethod === "cagr" ? stats.cagr5 : stats.trend5;
  return p.momentumWeight * stats.yoy + (1 - p.momentumWeight) * trend;
}

export function anchorRate(stats: MarketStats, p: ModelParams): number {
  const macro = (1 + p.inflation) * (1 + p.realPremium) - 1;
  if (p.anchorMode === "inflation" || stats.longRun === null) return macro;
  if (p.anchorMode === "local") return stats.longRun;
  return (macro + stats.longRun) / 2;
}

/** Median annual growth for years 1..years, before the interest-rate adjustment. */
export function baseGrowthPath(stats: MarketStats, p: ModelParams, years: number): number[] {
  const m = momentumRate(stats, p);
  const l = anchorRate(stats, p);
  const out: number[] = [];
  for (let t = 1; t <= years; t++) {
    // Evaluate the fade at mid-year so year 1 is not pure momentum.
    const fade = p.fadeYears > 0 ? Math.exp(-(t - 0.5) / p.fadeYears) : 0;
    out.push(l + (m - l) * fade);
  }
  if (p.year1Growth !== null && years >= 1) out[0] = p.year1Growth;
  return out;
}

/** Cumulative log-price shift from moving mortgage rates to the target by year t. */
export function rateShift(p: ModelParams, t: number): number {
  const progress = p.rateYears <= 0 ? 1 : Math.min(t / p.rateYears, 1);
  return p.rateSensitivity * (p.targetRate - p.currentRate) * progress;
}

/** Longest horizon the band was calibrated on (see scripts/backtest.ts). */
export const BAND_CALIBRATED_YEARS = 5;

/**
 * Forecast standard deviation of log value at horizon t (years). Uses the calibrated power law
 * up to 5 years, then grows with sqrt(t) (random-walk scaling) rather than extrapolating the
 * short-horizon exponent, which reflects momentum and would overstate long-run spread.
 */
export function bandSd(stats: MarketStats, p: ModelParams, t: number): number {
  const base = p.bandScale * stats.sigma;
  if (t <= BAND_CALIBRATED_YEARS) return base * Math.pow(t, p.bandExponent);
  return base * Math.pow(BAND_CALIBRATED_YEARS, p.bandExponent) * Math.sqrt(t / BAND_CALIBRATED_YEARS);
}

/** Median forecast of ln(V_t / V_0) at horizon h years. */
export function medianLogChange(stats: MarketStats, p: ModelParams, h: number): number {
  const g = baseGrowthPath(stats, p, h);
  let acc = 0;
  for (const x of g) acc += Math.log(1 + x);
  return acc + rateShift(p, h);
}

export interface ProjectionYear {
  year: number;
  /** Calendar year label. */
  label: number;
  median: number;
  low: number;
  high: number;
  /** Value on the scenario chosen by the slider. */
  scenario: number;
  /** Year-over-year growth on the scenario path. */
  scenarioGrowth: number;
}

export function project(
  value0: number,
  stats: MarketStats,
  p: ModelParams,
  years: number,
  startYear: number,
): ProjectionYear[] {
  const g = baseGrowthPath(stats, p, years);
  const out: ProjectionYear[] = [
    { year: 0, label: startYear, median: value0, low: value0, high: value0, scenario: value0, scenarioGrowth: 0 },
  ];
  let logAcc = 0;
  for (let t = 1; t <= years; t++) {
    logAcc += Math.log(1 + g[t - 1]);
    const center = logAcc + rateShift(p, t);
    const sd = bandSd(stats, p, t);
    const scenario = value0 * Math.exp(center + p.scenarioZ * sd);
    out.push({
      year: t,
      label: startYear + t,
      median: value0 * Math.exp(center),
      low: value0 * Math.exp(center + Z10 * sd),
      high: value0 * Math.exp(center + Z90 * sd),
      scenario,
      scenarioGrowth: scenario / out[t - 1].scenario - 1,
    });
  }
  return out;
}

/** Loan balance at the end of each year 0..years for a fixed-rate amortizing loan. */
export function amortize(balance: number, annualRate: number, monthsRemaining: number, years: number): number[] {
  const out = [balance];
  if (balance <= 0 || monthsRemaining <= 0) {
    for (let t = 1; t <= years; t++) out.push(0);
    return out;
  }
  const r = annualRate / 12;
  const payment = r === 0 ? balance / monthsRemaining : (balance * r) / (1 - Math.pow(1 + r, -monthsRemaining));
  let b = balance;
  let m = 0;
  for (let t = 1; t <= years; t++) {
    for (let i = 0; i < 12 && m < monthsRemaining; i++, m++) {
      b = b * (1 + r) - payment;
    }
    out.push(Math.max(b, 0));
  }
  return out;
}

export function monthlyPayment(balance: number, annualRate: number, months: number): number {
  if (balance <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  return r === 0 ? balance / months : (balance * r) / (1 - Math.pow(1 + r, -months));
}

/** Average index level over a calendar year (the months available), or null if none. */
export function yearAverage(series: MonthlySeries, year: number): number | null {
  const first = monthIndex(`${year}-01`) - monthIndex(series.start);
  let sum = 0;
  let n = 0;
  for (let i = Math.max(first, 0); i < first + 12 && i < series.v.length; i++) {
    sum += series.v[i];
    n++;
  }
  return n ? sum / n : null;
}

/** Index a price paid during `year` to today: price * index_now / average index in that year. */
export function indexAdjustYear(series: MonthlySeries, price: number, year: number): number | null {
  const avg = yearAverage(series, year);
  return avg === null ? null : (price * series.v[series.v.length - 1]) / avg;
}

/** Index a past purchase price to today: price * index_now / index_at_purchase. */
export function indexAdjust(series: MonthlySeries, price: number, purchaseYm: string): number | null {
  const i = monthIndex(purchaseYm) - monthIndex(series.start);
  if (i < 0 || i >= series.v.length) return null;
  return (price * series.v[series.v.length - 1]) / series.v[i];
}
