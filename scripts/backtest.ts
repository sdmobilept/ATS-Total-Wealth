// Phase 3: walk-forward backtest and calibration of the model defaults.
//
// For every ZIP and every December origin, the model sees only data up to that month and
// forecasts 1, 3 and 5 years ahead. Walk-forward: for each origin year Y the parameters are
// re-fitted using only forecasts whose outcomes were known by Dec Y, then used to forecast
// from Dec Y. That mimics running the tool in real time. The app's defaults are the fit on
// everything known today.
// Writes src/data/calibration.json (app defaults) and data/reports/backtest-report.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeStats,
  medianLogChange,
  monthIndex,
  type AnchorMode,
  type MarketStats,
  type ModelParams,
  type TrendMethod,
} from "../src/lib/engine.ts";
import { loadAllZips, loadMacro, pct, quantile } from "./lib/load.ts";

const HORIZONS = [1, 3, 5];
const FIRST_ORIGIN = 2005;
const FIRST_WALK_FORWARD = 2008;
const FLAT = 0.05;
/** Fit on a deterministic 1-in-N subsample of cases to keep the grid search fast. */
const FIT_SAMPLE = 4;

const macro = loadMacro();
const zips = loadAllZips();
const through = monthIndex(macro.dataThrough);

const cpiStart = monthIndex(macro.cpi.start);
const mortStart = monthIndex(macro.mortgage.start);
const inflationAt = (m: number) => {
  const i = m - cpiStart;
  return Math.pow(macro.cpi.v[i] / macro.cpi.v[i - 120], 1 / 10) - 1;
};
const rateAt = (m: number) => macro.mortgage.v[m - mortStart];

interface Case {
  stats: MarketStats;
  originYear: number;
  h: number;
  target: number;
  /** Realized ln(V_{t+h} / V_t). */
  actual: number;
  inflation: number;
  rateChange: number;
}

const cases: Case[] = [];
for (const [, z] of zips) {
  const start = monthIndex(z.start);
  for (let year = FIRST_ORIGIN; year <= 2025; year++) {
    const origin = monthIndex(`${year}-12`);
    const o = origin - start;
    if (o < 60 || o >= z.v.length) continue;
    const stats = computeStats(z, o);
    if (!stats) continue;
    for (const h of HORIZONS) {
      const target = origin + 12 * h;
      if (target > through) continue;
      cases.push({
        stats,
        originYear: year,
        h,
        target,
        actual: Math.log(z.v[target - start] / z.v[o]),
        inflation: inflationAt(origin),
        rateChange: rateAt(target) - rateAt(origin),
      });
    }
  }
}
console.log(`${cases.length.toLocaleString()} forecast cases`);

const baseParams: ModelParams = {
  momentumWeight: 0.4,
  trendMethod: "loglinear",
  fadeYears: 2.5,
  anchorMode: "inflation",
  inflation: 0.025,
  realPremium: 0.01,
  rateSensitivity: 0,
  currentRate: 0,
  targetRate: 0,
  rateYears: 2,
  scenarioZ: 0,
  bandScale: 1,
  bandExponent: 0.5,
  year1Growth: null,
};

type Predictor = (c: Case) => number;
const modelPredictor = (p: Partial<ModelParams>): Predictor => {
  const params = { ...baseParams, ...p };
  return (c) => {
    params.inflation = c.inflation;
    return medianLogChange(c.stats, params, c.h);
  };
};

/** Mean over horizons of the annualized mean absolute log error. */
function loss(pred: Predictor, set: Case[]): number {
  const sum = [0, 0, 0];
  const n = [0, 0, 0];
  for (const c of set) {
    const k = HORIZONS.indexOf(c.h);
    sum[k] += Math.abs(pred(c) - c.actual) / c.h;
    n[k]++;
  }
  let total = 0, used = 0;
  for (let k = 0; k < HORIZONS.length; k++) if (n[k]) { total += sum[k] / n[k]; used++; }
  return total / used;
}

const grid: Partial<ModelParams>[] = [];
for (const momentumWeight of [0, 0.25, 0.5, 0.75, 1])
  for (const trendMethod of ["loglinear", "cagr"] as TrendMethod[])
    for (const fadeYears of [0.5, 1, 2, 3, 5, 8])
      for (const anchorMode of ["inflation", "local", "blend"] as AnchorMode[])
        for (const realPremium of anchorMode === "local" ? [0] : [0, 0.01, 0.02, 0.03])
          grid.push({ momentumWeight, trendMethod, fadeYears, anchorMode, realPremium });

function fit(set: Case[]): Partial<ModelParams> {
  const sample = set.filter((_, i) => i % FIT_SAMPLE === 0);
  let best = grid[0];
  let bestLoss = Infinity;
  for (const g of grid) {
    const l = loss(modelPredictor(g), sample);
    if (l < bestLoss) { bestLoss = l; best = g; }
  }
  return best;
}

const describe = (p: Partial<ModelParams>) =>
  `w=${p.momentumWeight} ${p.trendMethod} τ=${p.fadeYears} ${p.anchorMode}` +
  (p.anchorMode === "local" ? "" : `+${pct(p.realPremium!, 0)}`);

// ---- Walk-forward: refit each year on outcomes known by then ------------------------
interface Scored { c: Case; model: number }
const oos: Scored[] = [];
const fits: { year: number; params: string }[] = [];
for (let year = FIRST_WALK_FORWARD; year <= 2025; year++) {
  const known = monthIndex(`${year}-12`);
  const params = fit(cases.filter((c) => c.target <= known));
  const pred = modelPredictor(params);
  for (const c of cases) if (c.originYear === year) oos.push({ c, model: pred(c) });
  fits.push({ year, params: describe(params) });
  console.log(`${year}: ${describe(params)}`);
}

// ---- Final defaults: fit on everything known today -----------------------------------
const best = fit(cases);
const calibrated = modelPredictor(best);
console.log(`final: ${describe(best)}`);

// ---- Uncertainty band from out-of-sample errors: sd(h) = scale * sigma * h^exponent --
const kByH = HORIZONS.map((h) => {
  const norm = oos.filter((s) => s.c.h === h).map((s) => Math.abs(s.model - s.c.actual) / s.c.stats.sigma);
  return quantile(norm, 0.8) / 1.2816;
});
const lx = HORIZONS.map(Math.log);
const ly = kByH.map(Math.log);
const mx = lx.reduce((a, b) => a + b) / lx.length;
const my = ly.reduce((a, b) => a + b) / ly.length;
const bandExponent = lx.reduce((a, x, i) => a + (x - mx) * (ly[i] - my), 0) / lx.reduce((a, x) => a + (x - mx) ** 2, 0);
const bandScale = Math.exp(my - bandExponent * mx);

// ---- Interest-rate association (informational) ----------------------------------------
// Regress leftover error on the realized change in mortgage rates over the forecast window.
function rateBeta(set: Case[]): number {
  const xs = set.map((c) => c.rateChange);
  const ys = set.map((c) => c.actual - calibrated(c));
  const ax = xs.reduce((a, b) => a + b) / xs.length;
  const ay = ys.reduce((a, b) => a + b) / ys.length;
  let cov = 0, v = 0;
  for (let i = 0; i < xs.length; i++) { cov += (xs[i] - ax) * (ys[i] - ay); v += (xs[i] - ax) ** 2; }
  return cov / v;
}
const rateBetaAll = rateBeta(cases);
const rateBetaPre2020 = rateBeta(cases.filter((c) => c.target <= monthIndex("2019-12")));

// ---- Out-of-sample scoring -------------------------------------------------------------
const baselines: [string, Predictor][] = [
  ["Flat 5% / yr (InsMark default)", (c) => c.h * Math.log(1 + FLAT)],
  ["Hold 5-yr CAGR", (c) => c.h * Math.log(1 + c.stats.cagr5)],
  ["Hold last 12 months", (c) => c.h * Math.log(1 + c.stats.yoy)],
  ["Inflation + 1%", (c) => c.h * Math.log((1 + c.inflation) * 1.01)],
];
const MODEL = "Trend model (walk-forward)";

interface Metric { model: string; h: number; mae: number; bias: number; beatsFlat: number; n: number }
function score(set: Scored[], h: number): Metric[] {
  const hs = set.filter((s) => s.c.h === h);
  const flatErr = hs.map((s) => Math.abs(baselines[0][1](s.c) - s.c.actual));
  const rows: [string, (s: Scored) => number][] = [
    ...baselines.map(([name, p]) => [name, (s: Scored) => p(s.c)] as [string, (s: Scored) => number]),
    [MODEL, (s) => s.model],
  ];
  return rows.map(([model, pred]) => {
    let ae = 0, e = 0, wins = 0;
    hs.forEach((s, i) => {
      const err = pred(s) - s.c.actual;
      ae += Math.abs(err); e += err;
      if (Math.abs(err) < flatErr[i]) wins++;
    });
    return { model, h, mae: ae / hs.length, bias: e / hs.length, beatsFlat: wins / hs.length, n: hs.length };
  });
}
const metrics = HORIZONS.flatMap((h) => score(oos, h));

const ERAS: [string, number, number][] = [
  ["2008–2011 (bust)", 2008, 2011],
  ["2012–2019 (recovery)", 2012, 2019],
  ["2020–2025 (pandemic & rate shock)", 2020, 2025],
];
const eras = ERAS.map(([label, a, b]) => {
  const set = oos.filter((s) => s.c.originYear >= a && s.c.originYear <= b);
  return { label, metrics: HORIZONS.flatMap((h) => score(set, h)).filter((m) => m.model === MODEL || m.model.startsWith("Flat")) };
});

const coverage = HORIZONS.map((h) => {
  const set = oos.filter((s) => s.c.h === h);
  const inside = set.filter((s) => Math.abs(s.model - s.c.actual) <= 1.2816 * bandScale * s.c.stats.sigma * h ** bandExponent);
  return { h, coverage: inside.length / set.length };
});

// ---- Write outputs ----------------------------------------------------------------------
const calibration = {
  generatedAt: new Date().toISOString(),
  dataThrough: macro.dataThrough,
  method: `Walk-forward: forecasts from Dec ${FIRST_WALK_FORWARD}–Dec 2025, each made with parameters fitted only on outcomes known at the time`,
  nCases: cases.length,
  nOutOfSample: oos.length,
  params: {
    momentumWeight: best.momentumWeight!,
    trendMethod: best.trendMethod!,
    fadeYears: best.fadeYears!,
    anchorMode: best.anchorMode!,
    realPremium: best.realPremium!,
    bandScale,
    bandExponent,
  },
  fits,
  bandByHorizon: HORIZONS.map((h, i) => ({ h, k: kByH[i] })),
  coverage,
  rateBeta: { all: rateBetaAll, pre2020: rateBetaPre2020 },
  metrics,
  eras,
};

const root = join(import.meta.dirname, "..");
mkdirSync(join(root, "src", "data"), { recursive: true });
writeFileSync(join(root, "src", "data", "calibration.json"), JSON.stringify(calibration, null, 2) + "\n");

const metricRow = (m: Metric) =>
  `| ${m.model} | ${m.h} yr | ${pct(m.mae)} | ${m.bias >= 0 ? "+" : ""}${pct(m.bias)} | ${m.model.startsWith("Flat") ? "–" : pct(m.beatsFlat, 0)} |`;
const md = [
  `# Phase 3: backtest report`,
  ``,
  `Generated ${calibration.generatedAt.slice(0, 10)}. Zillow ZHVI by ZIP, data through ${macro.dataThrough}. ${cases.length.toLocaleString()} ZIP-forecasts in total.`,
  ``,
  `**Method.** ${calibration.method}. ${oos.length.toLocaleString()} out-of-sample forecasts. MAE = mean absolute error of the forecast value in log terms (≈ %). "Beats flat 5%" = share of forecasts closer to the actual outcome than a flat 5%/yr.`,
  ``,
  `## App defaults (fit on all outcomes known today)`,
  ``,
  `| Parameter | Value |`,
  `|---|---|`,
  `| Momentum weight (last 12 months vs 5-yr trend) | ${best.momentumWeight} |`,
  `| 5-yr trend method | ${best.trendMethod} |`,
  `| Fade time τ | ${best.fadeYears} yrs |`,
  `| Long-run anchor | ${best.anchorMode}${best.anchorMode === "local" ? "" : ` (+ ${pct(best.realPremium!)} real premium)`} |`,
  `| Band width | ${bandScale.toFixed(2)} × σ × years^${bandExponent.toFixed(2)} |`,
  ``,
  `## Out-of-sample accuracy, all years`,
  ``,
  `| Model | Horizon | MAE | Bias | Beats flat 5% |`,
  `|---|---:|---:|---:|---:|`,
  ...metrics.map(metricRow),
  ``,
  `## By era`,
  ``,
  ...eras.flatMap((e) => [`### ${e.label}`, ``, `| Model | Horizon | MAE | Bias | Beats flat 5% |`, `|---|---:|---:|---:|---:|`, ...e.metrics.map(metricRow), ``]),
  `## Parameters chosen each year (walk-forward)`,
  ``,
  ...fits.map((f) => `- Dec ${f.year}: ${f.params}`),
  ``,
  `## Uncertainty band check (target 80%)`,
  ``,
  ...coverage.map((c) => `- ${c.h}-year: ${pct(c.coverage, 0)} of out-of-sample outcomes inside the 10th–90th percentile band`),
  ``,
  `## Interest-rate sensitivity`,
  ``,
  `Leftover error regressed on the realized change in 30-yr mortgage rates: **${pct(rateBetaAll)} per +1 pp** (all years), ${pct(rateBetaPre2020)} (outcomes through 2019).`,
  `Rates and prices rose together in 2021–22 (both driven by the post-pandemic boom), so this regression is confounded and cannot identify the causal effect.`,
  `The app therefore keeps rate sensitivity as a user-set assumption with a literature-based default rather than a fitted value.`,
];
mkdirSync(join(root, "data", "reports"), { recursive: true });
writeFileSync(join(root, "data", "reports", "backtest-report.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
