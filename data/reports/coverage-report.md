# Phase 0: data coverage report

Generated 2026-10-20 from Zillow ZHVI (mid-tier, all homes, smoothed & seasonally adjusted), data through **2026-09**.

| Check | Count | Share |
|---|---:|---:|
| ZIPs in Zillow file | 26265 | 100% |
| Current through 2026-09 | 26265 | 100.0% |
| Current and ≥ 5 yrs history (model can run on ZIP) | 25016 | 95.2% |
| Current and ≥ 10 yrs history (local long-run anchor available) | 23336 | 88.8% |
| Full history since Jan 2000 | 12892 | 49.1% |
| Has Zillow 12-month forecast | 21048 | 80.1% |
| Mapped to a Zillow county series | 26258 | 100.0% |
| Short-history ZIPs rescued by county fallback | 1246 | |

ZIPs not in Zillow's file at all (PO-box ZIPs, very rural areas) fall back to the county series found via the Census geocoder.

## Distribution across 25016 usable ZIPs

| Metric | 10th | 25th | Median | 75th | 90th |
|---|---:|---:|---:|---:|---:|
| Last 12 months | -2.1% | 0.2% | 2.7% | 5.3% | 7.9% |
| 5-yr trend (log-linear) | -0.6% | 1.5% | 3.6% | 5.3% | 6.5% |
| 5-yr CAGR | 0.6% | 2.5% | 4.4% | 5.8% | 6.8% |
| Long-run CAGR (≤20 yrs) | 1.6% | 2.4% | 3.4% | 4.5% | 5.6% |
| Volatility σ | 4.1% | 4.9% | 6.1% | 7.9% | 10.4% |

The spread above is the point of the tool: a flat 5% sits far from most ZIPs' actual trend.
