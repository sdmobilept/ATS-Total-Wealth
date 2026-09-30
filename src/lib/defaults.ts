import calibration from "@/data/calibration.json";
import type { AnchorMode, ModelParams, TrendMethod } from "./engine";

export { calibration };

/**
 * Default model settings.
 *
 * Momentum weight, trend method, fade time and band width come straight from the walk-forward
 * backtest (scripts/backtest.ts) and were stable across every refit.
 *
 * The long-run anchor is deliberately NOT the backtest's latest fit: that fit (inflation + 3%)
 * is pulled up by the 2020–22 boom and sits at the edge of the search grid. Long-run research
 * (Shiller; Jordà et al. 2019; Knoll, Schularick & Steger 2017) puts real home-price growth
 * nearer 0–1.5%/yr, so the default is inflation 2.5% + 1% real. Users can move it.
 *
 * Rate sensitivity cannot be fitted from this data (rates and prices rose together in 2021–22),
 * so it defaults to a moderate literature-based -3% per +1 pp.
 */
export function defaultParams(currentRate: number): ModelParams {
  const c = calibration.params;
  return {
    momentumWeight: c.momentumWeight,
    trendMethod: c.trendMethod as TrendMethod,
    fadeYears: c.fadeYears,
    anchorMode: c.anchorMode as AnchorMode,
    inflation: 0.025,
    realPremium: 0.01,
    rateSensitivity: -0.03,
    currentRate,
    targetRate: currentRate,
    rateYears: 2,
    scenarioZ: 0,
    bandScale: c.bandScale,
    bandExponent: c.bandExponent,
    year1Growth: null,
  };
}

export const DEFAULT_FLAT_RATE = 0.05;
export const DEFAULT_HORIZON = 20;
