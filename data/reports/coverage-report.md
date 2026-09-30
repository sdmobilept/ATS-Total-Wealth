# Phase 0: data coverage report

Generated 2026-09-30 from Zillow ZHVI (mid-tier, all homes, smoothed & seasonally adjusted), data through **2026-08**.

| Check | Count | Share |
|---|---:|---:|
| ZIPs in Zillow file | 26268 | 100% |
| Current through 2026-08 | 26268 | 100.0% |
| Current and ≥ 5 yrs history (model can run on ZIP) | 25019 | 95.2% |
| Current and ≥ 10 yrs history (local long-run anchor available) | 23335 | 88.8% |
| Full history since Jan 2000 | 12892 | 49.1% |
| Has Zillow 12-month forecast | 21048 | 80.1% |
| Mapped to a Zillow county series | 26261 | 100.0% |
| Short-history ZIPs rescued by county fallback | 1246 | |

ZIPs not in Zillow's file at all (PO-box ZIPs, very rural areas) fall back to the county series found via the Census geocoder.

## Distribution across 25019 usable ZIPs

| Metric | 10th | 25th | Median | 75th | 90th |
|---|---:|---:|---:|---:|---:|
| Last 12 months | -2.2% | 0.2% | 2.8% | 5.4% | 8.1% |
| 5-yr trend (log-linear) | -0.4% | 1.7% | 3.8% | 5.4% | 6.6% |
| 5-yr CAGR | 0.6% | 2.6% | 4.4% | 5.8% | 6.8% |
| Long-run CAGR (≤20 yrs) | 1.6% | 2.4% | 3.4% | 4.5% | 5.7% |
| Volatility σ | 4.1% | 4.9% | 6.1% | 7.9% | 10.4% |

The spread above is the point of the tool: a flat 5% sits far from most ZIPs' actual trend.

## Client ZIPs

| ZIP | Place | History | 12 mo | 5-yr trend | σ | Zillow 12-mo fcst | Status |
|---|---|---|---:|---:|---:|---:|---|
| 92129 | San Diego, CA | since 2000-01 | -1.3% | 4.8% | 9.0% | 1.5% | OK |
