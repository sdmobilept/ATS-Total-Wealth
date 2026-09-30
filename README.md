# Property Wealth Projector

Projects a property's value and equity from its ZIP code's actual market trend, instead of the flat 5%/yr that tools like InsMark Wealthy and Wise+ use by default. The projection shows a range calibrated on past outcomes, and every assumption can be adjusted with a slider.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000   (try /?q=77494 or a street address)
```

The processed data in `public/data` is already built. To refresh it from source:

```bash
npm run data:refresh     # download Zillow + FRED → build shards → coverage report
npm run data:backtest    # re-run walk-forward calibration (~5 min) → src/data/calibration.json
npm test                 # engine unit tests
```

## Home value input (ZIP-code based)

Enter an address or ZIP, plus optionally the **price paid** and **year bought**:

- **With price and year:** today's value = price paid × (ZIP index today ÷ ZIP index average in the year bought). The ZIP index used is the price tier (lower, middle or upper third) whose typical price in that year was closest to the price paid.
- **Without them:** the page shows the ZIP's typical home value, clearly labelled as not this specific home. You can also type a known current value (e.g. from Zillow) in the Property card.

Links carry the inputs: `/?q=<address or ZIP>&paid=<price>&year=<year>`.

## Automatic home values (RentCast, optional and currently off)

For a street address, the app gets a property-level value estimate from [RentCast](https://www.rentcast.io/api). The ZIP index still drives the growth trend.

1. Create a free RentCast account and an API key (Developer plan: 50 requests/month).
2. `copy .env.example .env.local` and set `RENTCAST_API_KEY`. Set `RENTCAST_BILLING_DAY` to the day your RentCast billing period renews.
3. Restart the server.

**RentCast bills $0.20 per request beyond 50 and has no cap of its own.** The app enforces the cap itself:

- A counter in `data/runtime/rentcast-usage.json` is incremented before each request and blocks at `RENTCAST_MONTHLY_LIMIT`.
- Each address is cached for 30 days in `data/runtime/rentcast-cache.json`, so looking up the same home again is free.
- The AVM is disabled on Vercel and other serverless hosts, because those can't keep the counter file between requests. Host on a server with a disk, or move the counter to a database first.

When the key is missing, the limit is reached or the lookup fails, the page asks for the home's value (from Zillow or Redfin) and pre-fills the ZIP's typical value.

In every case, the growth trend comes from the Zillow price tier (lower, middle or upper third of homes in the ZIP) whose typical value is closest to the home's value. You can override the tier in the Property card.

## How it's organized

| Path | What it does |
|---|---|
| `src/lib/engine.ts` | The forecast model: stats, growth path, rate effect, uncertainty band, amortization. Pure TypeScript; the app and the backtest both use it. |
| `src/lib/defaults.ts` | Default model settings (from the backtest, with documented overrides). |
| `src/components/Calculator.tsx` | The calculator UI: inputs, sliders, stat tiles, CSV export, print. |
| `src/components/ProjectionChart.tsx` | History + projection chart (Recharts). |
| `src/app/methodology/page.tsx` | Public explanation of the model and the backtest results. |
| `src/app/api/geocode/route.ts` | Address → ZIP + county via the free US Census geocoder. |
| `scripts/fetch-data.ts` | Downloads the Zillow ZHVI (ZIP + county), Zillow ZIP forecast, FRED mortgage rate and CPI. |
| `scripts/build-data.ts` | Builds `public/data/{zip,county}/*.json` shards and `macro.json`. |
| `scripts/coverage.ts` | **Phase 0** data coverage report → `data/reports/coverage-report.md`. Pass client ZIPs: `node scripts/coverage.ts 77494,94110`. |
| `scripts/backtest.ts` | **Phase 3** walk-forward backtest + calibration → `data/reports/backtest-report.md`. |

## The model in one line

`g(t) = L + (M − L)·e^(−(t−½)/τ)`. Momentum `M` (the last 12 months) fades toward a long-run anchor `L` (inflation + real premium). On top of that sit a phased-in mortgage-rate level shift `β·Δrate` and a `k·σ·t^a` uncertainty band. See `/methodology` for details and results.

## Deploying

Vercel works out of the box (`/api/geocode` is the only server route). `.github/workflows/refresh-data.yml` refreshes the data monthly and commits it. Hosting the repo on GitHub with that workflow redeploys the site automatically.

## Before client use

- Check Zillow's data terms of use for your commercial use case, and keep the attribution in the footer.
- Have compliance review the output pages and disclaimers.
