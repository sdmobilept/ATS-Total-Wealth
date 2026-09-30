// Unit tests for Phase 4 (Monte Carlo, cash flow, keep vs sell). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeStats, project, type ModelParams } from "../src/lib/engine.ts";
import { breakEvenReturn, cashFlows, keepVsSell, simulate, type CashFlowInputs } from "../src/lib/wealth.ts";

const params: ModelParams = {
  momentumWeight: 1,
  trendMethod: "loglinear",
  fadeYears: 1,
  anchorMode: "inflation",
  inflation: 0.025,
  realPremium: 0.01,
  rateSensitivity: -0.03,
  currentRate: 7,
  targetRate: 7,
  rateYears: 2,
  scenarioZ: 0,
  bandScale: 0.9,
  bandExponent: 1,
  year1Growth: null,
};

/** Noisy series so sigma > 0. */
const noisy = {
  start: "2000-01",
  v: Array.from({ length: 241 }, (_, i) => 100000 * Math.pow(1.04, i / 12) * (1 + 0.05 * Math.sin(i / 7))),
};

test("Monte Carlo percentiles match the analytic band", () => {
  const s = computeStats(noisy)!;
  const years = 10;
  const sim = simulate(500000, s, params, years, { paths: 20000, seed: 7, flatRate: 0.05, loanBalances: [], samplePaths: 3 });
  const proj = project(500000, s, params, years, 2026);
  const rel = (a: number, b: number) => Math.abs(a / b - 1);
  assert.ok(rel(sim.terminal.p50, proj[years].median) < 0.02, `p50 ${sim.terminal.p50} vs ${proj[years].median}`);
  assert.ok(rel(sim.terminal.p10, proj[years].low) < 0.03, `p10 ${sim.terminal.p10} vs ${proj[years].low}`);
  assert.ok(rel(sim.terminal.p90, proj[years].high) < 0.03, `p90 ${sim.terminal.p90} vs ${proj[years].high}`);
  assert.equal(sim.samples.length, 3);
  assert.equal(sim.samples[0].length, years + 1);
  assert.equal(sim.pUnderwater, 0);
});

test("simulation is reproducible for a seed", () => {
  const s = computeStats(noisy)!;
  const o = { paths: 500, seed: 42, flatRate: 0.05, loanBalances: [], samplePaths: 1 };
  assert.deepEqual(simulate(1, s, params, 5, o), simulate(1, s, params, 5, o));
});

const rentalInputs: CashFlowInputs = {
  occupancy: "rental",
  monthlyRent: 3000,
  rentGrowth: 0.03,
  vacancy: 0.05,
  management: 0.08,
  propertyTax: 6000,
  propertyTaxGrowth: 0.02,
  insurance: 1500,
  hoaMonthly: 100,
  maintenance: 0.01,
  inflation: 0.025,
};

test("rental cash flow arithmetic", () => {
  const values = [500000, 520000, 540000];
  const [y1, y2] = cashFlows(values, 2000, 18, rentalInputs);
  // Year 1: rent 36,000; vacancy 1,800; collected 34,200; mgmt 2,736; tax 6,000; ins 1,500; HOA 1,200; maint 5,000.
  assert.ok(Math.abs(y1.noi - (34200 - 2736 - 6000 - 1500 - 1200 - 5000)) < 1e-6);
  assert.equal(y1.debtService, 24000);
  assert.ok(Math.abs(y1.capRate - y1.noi / 500000) < 1e-12);
  // Year 2: only 6 payments left, rent up 3%, maintenance on the new value.
  assert.equal(y2.debtService, 12000);
  assert.ok(Math.abs(y2.grossRent - 36000 * 1.03) < 1e-6);
});

test("primary residence ignores vacancy and management", () => {
  const [y1] = cashFlows([500000, 510000], 0, 0, { ...rentalInputs, occupancy: "primary" });
  assert.equal(y1.vacancyLoss, 0);
  assert.ok(Math.abs(y1.operatingExpenses - (6000 + 1500 + 1200 + 5000)) < 1e-6);
});

test("keep vs sell: equal when the property earns the alternative return", () => {
  // Value grows 6%, no loan, no costs, no cash flow: keeping == selling at 6%.
  const values = [100, 106, 112.36];
  const flows = cashFlows(values, 0, 0, { ...rentalInputs, monthlyRent: 0, propertyTax: 0, insurance: 0, hoaMonthly: 0, maintenance: 0 });
  const k = keepVsSell(values, [0, 0, 0], flows, 0, 0.06);
  assert.ok(Math.abs(k[2].keep - k[2].sell) < 1e-9);
  const be = breakEvenReturn(values, [0, 0, 0], flows, 0.06)!;
  // With 6% selling costs on both sides the break-even is still the property's growth rate.
  assert.ok(Math.abs(be - 0.06) < 1e-6, `break-even ${be}`);
});

test("keep vs sell reinvests cash flows at the alternative rate", () => {
  const values = [100, 100, 100];
  const flows = [
    { year: 1, grossRent: 0, vacancyLoss: 0, operatingExpenses: 0, noi: 10, debtService: 0, cashFlow: 10, capRate: 0.1 },
    { year: 2, grossRent: 0, vacancyLoss: 0, operatingExpenses: 0, noi: 10, debtService: 0, cashFlow: 10, capRate: 0.1 },
  ];
  const k = keepVsSell(values, [40, 30, 20], flows, 0.05, 0.1);
  assert.ok(Math.abs(k[0].sell - 55) < 1e-9);
  assert.ok(Math.abs(k[2].keep - (95 - 20 + 10 * 1.1 + 10)) < 1e-9);
  assert.ok(Math.abs(k[2].sell - 55 * 1.21) < 1e-9);
});

test("simulated yearly moves match the ZIP's historical volatility", () => {
  const s = computeStats(noisy)!;
  const years = 10;
  const sim = simulate(1, s, params, years, { paths: 5000, seed: 3, flatRate: 0.05, loanBalances: [], samplePaths: 5000 });
  for (const t of [3, 8]) {
    const d = sim.samples.map((path) => Math.log(path[t] / path[t - 1]));
    const mean = d.reduce((a, b) => a + b) / d.length;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
    assert.ok(Math.abs(sd / s.sigma - 1) < 0.08, `year ${t}: sd ${sd} vs sigma ${s.sigma}`);
  }
});
