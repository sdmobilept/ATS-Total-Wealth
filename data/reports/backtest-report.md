# Phase 3: backtest report

Generated 2026-09-30. Zillow ZHVI by ZIP, data through 2026-08. 971,439 ZIP-forecasts in total.

**Method.** Walk-forward: forecasts from Dec 2008–Dec 2025, each made with parameters fitted only on outcomes known at the time. 848,844 out-of-sample forecasts. MAE = mean absolute error of the forecast value in log terms (≈ %). "Beats flat 5%" = share of forecasts closer to the actual outcome than a flat 5%/yr.

## App defaults (fit on all outcomes known today)

| Parameter | Value |
|---|---|
| Momentum weight (last 12 months vs 5-yr trend) | 1 |
| 5-yr trend method | loglinear |
| Fade time τ | 1 yrs |
| Long-run anchor | inflation (+ 3.0% real premium) |
| Band width | 0.89 × σ × years^1.01 |

## Out-of-sample accuracy, all years

| Model | Horizon | MAE | Bias | Beats flat 5% |
|---|---:|---:|---:|---:|
| Flat 5% / yr (InsMark default) | 1 yr | 5.0% | +0.6% | – |
| Hold 5-yr CAGR | 1 yr | 5.7% | -0.5% | 45% |
| Hold last 12 months | 1 yr | 4.8% | -0.3% | 53% |
| Inflation + 1% | 1 yr | 5.3% | -1.1% | 47% |
| Trend model (walk-forward) | 1 yr | 4.4% | -0.3% | 56% |
| Flat 5% / yr (InsMark default) | 3 yr | 11.7% | -0.3% | – |
| Hold 5-yr CAGR | 3 yr | 15.8% | -5.9% | 40% |
| Hold last 12 months | 3 yr | 15.6% | -2.8% | 43% |
| Inflation + 1% | 3 yr | 13.4% | -5.7% | 39% |
| Trend model (walk-forward) | 3 yr | 12.5% | -5.3% | 41% |
| Flat 5% / yr (InsMark default) | 5 yr | 15.7% | -3.6% | – |
| Hold 5-yr CAGR | 5 yr | 25.4% | -17.9% | 35% |
| Hold last 12 months | 5 yr | 25.9% | -14.2% | 38% |
| Inflation + 1% | 5 yr | 20.0% | -12.8% | 32% |
| Trend model (walk-forward) | 5 yr | 20.1% | -15.8% | 30% |

## By era

### 2008–2011 (bust)

| Model | Horizon | MAE | Bias | Beats flat 5% |
|---|---:|---:|---:|---:|
| Flat 5% / yr (InsMark default) | 1 yr | 8.8% | +8.0% | – |
| Trend model (walk-forward) | 1 yr | 5.3% | +2.7% | 83% |
| Flat 5% / yr (InsMark default) | 3 yr | 18.4% | +14.9% | – |
| Trend model (walk-forward) | 3 yr | 12.7% | +4.3% | 77% |
| Flat 5% / yr (InsMark default) | 5 yr | 19.9% | +14.0% | – |
| Trend model (walk-forward) | 5 yr | 14.7% | -1.5% | 69% |

### 2012–2019 (recovery)

| Model | Horizon | MAE | Bias | Beats flat 5% |
|---|---:|---:|---:|---:|
| Flat 5% / yr (InsMark default) | 1 yr | 3.7% | -1.2% | – |
| Trend model (walk-forward) | 1 yr | 3.9% | -2.4% | 46% |
| Flat 5% / yr (InsMark default) | 3 yr | 10.1% | -6.1% | – |
| Trend model (walk-forward) | 3 yr | 13.5% | -12.4% | 25% |
| Flat 5% / yr (InsMark default) | 5 yr | 14.8% | -10.3% | – |
| Trend model (walk-forward) | 5 yr | 23.4% | -22.5% | 16% |

### 2020–2025 (pandemic & rate shock)

| Model | Horizon | MAE | Bias | Beats flat 5% |
|---|---:|---:|---:|---:|
| Flat 5% / yr (InsMark default) | 1 yr | 4.9% | -0.7% | – |
| Trend model (walk-forward) | 1 yr | 4.6% | +0.8% | 57% |
| Flat 5% / yr (InsMark default) | 3 yr | 9.2% | -0.8% | – |
| Trend model (walk-forward) | 3 yr | 10.3% | +2.2% | 44% |
| Flat 5% / yr (InsMark default) | 5 yr | 10.6% | -4.9% | – |
| Trend model (walk-forward) | 5 yr | 12.4% | -8.4% | 29% |

## Parameters chosen each year (walk-forward)

- Dec 2008: w=1 loglinear τ=0.5 inflation+0%
- Dec 2009: w=1 loglinear τ=0.5 inflation+0%
- Dec 2010: w=1 loglinear τ=0.5 inflation+0%
- Dec 2011: w=1 loglinear τ=0.5 inflation+0%
- Dec 2012: w=1 loglinear τ=1 inflation+0%
- Dec 2013: w=1 loglinear τ=1 inflation+0%
- Dec 2014: w=1 loglinear τ=1 inflation+0%
- Dec 2015: w=1 loglinear τ=0.5 inflation+0%
- Dec 2016: w=1 loglinear τ=0.5 inflation+0%
- Dec 2017: w=1 loglinear τ=1 inflation+0%
- Dec 2018: w=1 loglinear τ=1 inflation+0%
- Dec 2019: w=1 loglinear τ=1 inflation+0%
- Dec 2020: w=1 loglinear τ=1 inflation+1%
- Dec 2021: w=1 loglinear τ=1 inflation+2%
- Dec 2022: w=1 loglinear τ=1 inflation+2%
- Dec 2023: w=1 loglinear τ=1 inflation+3%
- Dec 2024: w=1 loglinear τ=1 inflation+3%
- Dec 2025: w=1 loglinear τ=1 inflation+3%

## Uncertainty band check (target 80%)

- 1-year: 80% of out-of-sample outcomes inside the 10th–90th percentile band
- 3-year: 80% of out-of-sample outcomes inside the 10th–90th percentile band
- 5-year: 80% of out-of-sample outcomes inside the 10th–90th percentile band

## Interest-rate sensitivity

Leftover error regressed on the realized change in 30-yr mortgage rates: **4.1% per +1 pp** (all years), 14.5% (outcomes through 2019).
Rates and prices rose together in 2021–22 (both driven by the post-pandemic boom), so this regression is confounded and cannot identify the causal effect.
The app therefore keeps rate sensitivity as a user-set assumption with a literature-based default rather than a fitted value.
