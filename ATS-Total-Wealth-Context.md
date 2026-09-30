# ATS Total Wealth: Project Context

Handoff notes for anyone (person or AI assistant) picking up this project. Last updated 2026-09-30.

## What this is

**Property Wealth Projector**: a web tool that projects a property's value and equity from its ZIP code's *actual* market trend. It is an alternative to the flat 5%/yr growth assumption in InsMark Wealthy and Wise+, which the owner's client uses.

- Repo: https://github.com/sdmobilept/ATS-Total-Wealth (branch `main`)
- Owner: Kushang Desai (info@sdmobilept.com)
- Status: Phases 0–4 complete, merged and pushed (`27b46bc`).

## Stack and commands

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Recharts 3. **Read `node_modules/next/dist/docs/` before changing Next APIs** (see AGENTS.md).
- Node 24 LTS was installed via winget at `C:\Program Files\nodejs`. Git Bash may not have it on PATH: `export PATH="/c/Program Files/nodejs:$PATH"`.
- `package.json` has `"type": "module"`. Offline scripts are `.ts` files run directly by Node's type stripping, so imports need `.ts` extensions and no enums or namespaces. `tsconfig` has `allowImportingTsExtensions`.

```bash
npm run dev               # http://localhost:3000   (links: /?q=<address|zip>&paid=<price>&year=<yyyy>)
npm run build && npx next start -p 3000
npm test                  # node --test: scripts/engine.test.ts + scripts/wealth.test.ts (16 tests)
npm run lint
npm run data:refresh      # data:fetch → data:build → data:coverage
npm run data:backtest     # ~5 min walk-forward calibration → src/data/calibration.json
```

## Layout

| Path | Role |
|---|---|
| `src/lib/engine.ts` | Forecast model (pure, shared by app and scripts): stats, growth path, rate shift, band, amortization, `indexAdjustYear`. |
| `src/lib/wealth.ts` | Phase 4 (pure): Monte Carlo `simulate`, `cashFlows`, `keepVsSell`, `breakEvenReturn`. |
| `src/lib/defaults.ts` | Default params from calibration, plus documented overrides. |
| `src/lib/data.ts` | Client data loading, `resolveLocation` (ZIP → county fallback), `pickTier`, geocode/AVM fetch. |
| `src/lib/data-types.ts` | JSON shard types; delta-encoded series (`encodeSeries`/`decodeSeries`, unit `u` default $100, rent uses $1). |
| `src/lib/server/rentcast.ts`, `src/app/api/avm/route.ts` | Optional RentCast AVM with a hard monthly cap and a 30-day address cache (dormant, no key). |
| `src/app/api/geocode/route.ts` | Proxy for the free US Census geocoder (address → ZIP + county FIPS). |
| `src/components/Calculator.tsx` | Main page: inputs, stats, chart, scenario/rate sliders, tiers, risk, cash flow, table, CSV/print. |
| `src/components/{ProjectionChart,RiskPanel,CashFlowPanel,WealthTable,Slider}.tsx` | UI pieces. |
| `src/app/methodology/page.tsx` | Public explanation and backtest results. |
| `scripts/fetch-data.ts`, `scripts/build-data.ts` | Download raw CSVs to `data/raw/` (gitignored, ~500 MB) → `public/data/` shards (~65 MB, committed). |
| `scripts/coverage.ts`, `scripts/backtest.ts` | Phase 0 coverage report and Phase 3 walk-forward backtest → `data/reports/*.md`. |
| `.github/workflows/refresh-data.yml` | Monthly data refresh and commit (20th of each month). |

## Data

- **Zillow ZHVI by ZIP**, monthly from 2000 (data through 2026-08): middle tier (headline), bottom and top thirds. 26,268 ZIPs; 95% have 5+ years of history. The rest fall back to the **county** ZHVI.
- **Zillow ZORI** (rent index) by ZIP from 2015: 8,462 ZIPs.
- **Zillow ZHVF** 12-month forecast: optional year-1 override.
- **FRED**: `MORTGAGE30US` (7.03% on 2026-09-24) and `CPIAUCSL`.
- Shards: `public/data/zip/{zip3}.json`, `public/data/county/{stateFips}.json`, `public/data/macro.json`.

## The model

`g(t) = L + (M − L)·e^(−(t−½)/τ)`

- M = w·(last 12 months) + (1−w)·(5-yr log-linear trend).
- L = inflation + real premium (or local, or a blend).
- Rate effect: ln P += β·(target rate − current rate), phased in over the chosen number of years.
- Band sd = k·σ·t^a up to 5 years, then grows with √t.
- The scenario slider is a percentile from 10 to 90, i.e. z from −1.28 to +1.28.

**Calibrated defaults** (walk-forward over 848,844 out-of-sample ZIP forecasts, 2008–2025):

| Parameter | Default |
|---|---|
| Momentum weight w | 1 |
| Fade time τ | 1 year |
| Trend method | log-linear |
| Band | 0.89·σ·t^1.01 (exactly 80% coverage out of sample) |

**Deliberate overrides:**
- Long-run anchor defaults to **inflation 2.5% + 1% real**. The backtest's latest fit was +3%, but it is skewed by the 2020–22 boom.
- β defaults to **−3% per +1 pt**. The data gives the wrong sign (rates and prices rose together in 2021–22), so β is a stated assumption, not fitted.

**Honest results:**
- The model beats flat 5% at 1 year (4.4% vs 5.0% MAE) and strongly in the 2008–11 bust.
- Flat 5% has lower MAE at 3–5 years, because US prices happened to average about 5%/yr from 2012 to 2025.
- The pitch is local near-term accuracy plus an honest range, not a better long-run number.

## Key product decisions

1. **Home value = option 2 (ZIP-code based).**
   - The user enters an address or ZIP, plus optional **price paid and year bought**.
   - Value today = price × (tier index now ÷ tier's average index in the year bought).
   - Without those inputs the page shows the ZIP typical value, labelled "not this home".
   - The trend follows the **price tier** closest to the home's value. With a purchase, the price paid is compared with each tier's typical price in that year. The user can override the tier.
2. **RentCast (option 3) is built but dormant.**
   - It is enabled only when `RENTCAST_API_KEY` is in `.env.local` (see `.env.example`).
   - RentCast **bills $0.20/request past 50 with no cap of its own**. The app's counter (`data/runtime/`, gitignored) blocks at `RENTCAST_MONTHLY_LIMIT`.
   - It is disabled on Vercel and other serverless hosts, where the counter can't persist.
   - No free alternative is better: ATTOM is a 30-day trial, the Zestimate API is closed, and scrapers break Zillow's terms.
3. **Monte Carlo** uses a unit-variance AR(1) shock scaled by the band. Persistence is tuned so simulated yearly moves ≈ the ZIP's σ. With independent shocks, the chance of a 20% drop came out at an unrealistic 94%.
4. **Cash flow / keep vs. sell**
   - Modes: Rental, or My home (rent = rent avoided).
   - Cash flows are reinvested at the alternative return.
   - Taxes, depreciation, capital gains and the §121 home-sale exclusion are not modeled.

## Gotchas

- Headless Chrome enforces a **512px minimum viewport**. Test mobile with DevTools `Emulation.setDeviceMetricsOverride` (a CDP script driven with Node's built-in WebSocket works well).
- `next start` serves only the `public/` files that existed at build time.
- Custom CSS that must lose to Tailwind utilities has to sit in `@layer components` (e.g. `.field`).
- Git on Windows warns about LF→CRLF line endings; this is harmless.

## Possible next steps

- Deploy: Vercel works (the AVM stays off there). Alternatively, a VPS if automatic values are wanted.
- An InsMark-friendly export (a year-by-year growth-rate column is already in the CSV).
- Re-run `npm run data:backtest` periodically; recalibrate on tier-specific data if desired.
- Before client use: check Zillow's data terms and get a compliance review of the pages and disclaimers.
