// Unit tests for the forecast engine. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amortize,
  bandSd,
  computeStats,
  indexAdjust,
  indexAdjustYear,
  yearAverage,
  medianLogChange,
  monthlyPayment,
  project,
  type ModelParams,
} from "../src/lib/engine.ts";

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

/** Series growing at exactly `g` per year, monthly, for `years` years. */
const steady = (g: number, years: number) => ({
  start: "2000-01",
  v: Array.from({ length: years * 12 + 1 }, (_, i) => 100000 * Math.pow(1 + g, i / 12)),
});

test("stats recover a steady growth rate", () => {
  const s = computeStats(steady(0.04, 10))!;
  assert.ok(Math.abs(s.yoy - 0.04) < 1e-9);
  assert.ok(Math.abs(s.cagr5 - 0.04) < 1e-9);
  assert.ok(Math.abs(s.trend5 - 0.04) < 1e-9);
  assert.ok(Math.abs(s.longRun! - 0.04) < 1e-9);
  assert.ok(s.sigma < 1e-6);
  assert.equal(s.asOf, "2010-01");
});

test("stats need 5 years of history", () => {
  assert.equal(computeStats(steady(0.04, 4)), null);
});

test("momentum equal to the anchor gives a flat growth path", () => {
  const s = computeStats(steady(0.035, 10))!;
  const p = { ...params, inflation: 0.025, realPremium: 1.035 / 1.025 - 1 };
  const anchor = (1 + p.inflation) * (1 + p.realPremium) - 1;
  assert.ok(Math.abs(anchor - 0.035) < 1e-12);
  assert.ok(Math.abs(medianLogChange(s, p, 10) - 10 * Math.log(1.035)) < 1e-9);
});

test("hot market fades toward the anchor", () => {
  const s = computeStats(steady(0.12, 10))!;
  const rows = project(100, s, params, 10, 2026);
  const g1 = rows[1].median / rows[0].median - 1;
  const g10 = rows[10].median / rows[9].median - 1;
  assert.ok(g1 > 0.07 && g1 < 0.12, `year-1 growth ${g1}`);
  assert.ok(Math.abs(g10 - 0.03525) < 0.001, `year-10 growth ${g10}`);
});

test("lower target rate raises value by beta * change", () => {
  const s = computeStats(steady(0.04, 10))!;
  const base = medianLogChange(s, params, 5);
  const cut = medianLogChange(s, { ...params, targetRate: 6 }, 5);
  assert.ok(Math.abs(cut - base - 0.03) < 1e-12);
  const halfway = medianLogChange(s, { ...params, targetRate: 6 }, 1) - medianLogChange(s, params, 1);
  assert.ok(Math.abs(halfway - 0.015) < 1e-12);
});

test("band follows the power law to 5 years, then sqrt", () => {
  const s = { ...computeStats(steady(0.04, 10))!, sigma: 0.1 };
  assert.ok(Math.abs(bandSd(s, params, 5) - 0.45) < 1e-12);
  assert.ok(Math.abs(bandSd(s, params, 20) - 0.9) < 1e-12);
  const rows = project(100, s, { ...params, scenarioZ: 1.2816 }, 5, 2026);
  assert.ok(Math.abs(rows[5].scenario - rows[5].high) < 1e-9);
  assert.ok(rows[5].low < rows[5].median && rows[5].median < rows[5].high);
});

test("mortgage amortizes to zero at term", () => {
  const b = amortize(300000, 0.065, 360, 30);
  assert.equal(b[0], 300000);
  assert.ok(b[30] < 1);
  assert.ok(Math.abs(monthlyPayment(300000, 0.065, 360) - 1896.2) < 0.1);
  assert.deepEqual(amortize(0, 0.065, 360, 2), [0, 0, 0]);
});

test("index adjustment scales a purchase price", () => {
  const series = { start: "2020-01", v: [100, 110, 120, 150] };
  assert.equal(indexAdjust(series, 200000, "2020-02"), (200000 * 150) / 110);
  assert.equal(indexAdjust(series, 200000, "2019-12"), null);
});

test("year-based adjustment uses that year's average index", () => {
  // 2019 averages 105 (100..110 linear), today 150.
  const series = { start: "2019-01", v: [...Array.from({ length: 12 }, (_, i) => 100 + (10 * i) / 11), 120, 150] };
  assert.ok(Math.abs(yearAverage(series, 2019)! - 105) < 1e-9);
  assert.ok(Math.abs(indexAdjustYear(series, 700000, 2019)! - 1000000) < 1e-6);
  assert.equal(yearAverage(series, 2018), null);
  // Partial year: only the months available count.
  assert.equal(yearAverage(series, 2020), 135);
});
