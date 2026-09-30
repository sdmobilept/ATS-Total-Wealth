// Phase 0: how well does the Zillow ZIP data cover what we need?
// Usage: node scripts/coverage.ts [zip,zip,...]   (client ZIPs to check individually)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeStats, monthIndex } from "../src/lib/engine.ts";
import { loadAllCounties, loadAllZips, loadMacro, pct, quantile } from "./lib/load.ts";

const macro = loadMacro();
const zips = loadAllZips();
const counties = loadAllCounties();
const through = monthIndex(macro.dataThrough);

const current = zips.filter(([, z]) => monthIndex(z.start) + z.v.length - 1 === through);
const usable = current.filter(([, z]) => z.v.length >= 61);
const full = current.filter(([, z]) => z.start === "2000-01");
const tenYears = current.filter(([, z]) => z.v.length >= 121);
const withForecast = zips.filter(([, z]) => z.forecast);
const withCounty = zips.filter(([, z]) => z.countyFips && counties[z.countyFips]);
const shortWithCounty = current.filter(([, z]) => z.v.length < 61 && z.countyFips && counties[z.countyFips]);

const stats = usable.map(([, z]) => computeStats(z)!);
const dist = (label: string, xs: number[]) =>
  `| ${label} | ${pct(quantile(xs, 0.1))} | ${pct(quantile(xs, 0.25))} | ${pct(quantile(xs, 0.5))} | ${pct(quantile(xs, 0.75))} | ${pct(quantile(xs, 0.9))} |`;

const lines = [
  `# Phase 0: data coverage report`,
  ``,
  `Generated ${new Date().toISOString().slice(0, 10)} from Zillow ZHVI (mid-tier, all homes, smoothed & seasonally adjusted), data through **${macro.dataThrough}**.`,
  ``,
  `| Check | Count | Share |`,
  `|---|---:|---:|`,
  `| ZIPs in Zillow file | ${zips.length} | 100% |`,
  `| Current through ${macro.dataThrough} | ${current.length} | ${pct(current.length / zips.length)} |`,
  `| Current and ≥ 5 yrs history (model can run on ZIP) | ${usable.length} | ${pct(usable.length / zips.length)} |`,
  `| Current and ≥ 10 yrs history (local long-run anchor available) | ${tenYears.length} | ${pct(tenYears.length / zips.length)} |`,
  `| Full history since Jan 2000 | ${full.length} | ${pct(full.length / zips.length)} |`,
  `| Has Zillow 12-month forecast | ${withForecast.length} | ${pct(withForecast.length / zips.length)} |`,
  `| Mapped to a Zillow county series | ${withCounty.length} | ${pct(withCounty.length / zips.length)} |`,
  `| Short-history ZIPs rescued by county fallback | ${shortWithCounty.length} | |`,
  ``,
  `ZIPs not in Zillow's file at all (PO-box ZIPs, very rural areas) fall back to the county series found via the Census geocoder.`,
  ``,
  `## Distribution across ${usable.length} usable ZIPs`,
  ``,
  `| Metric | 10th | 25th | Median | 75th | 90th |`,
  `|---|---:|---:|---:|---:|---:|`,
  dist("Last 12 months", stats.map((s) => s.yoy)),
  dist("5-yr trend (log-linear)", stats.map((s) => s.trend5)),
  dist("5-yr CAGR", stats.map((s) => s.cagr5)),
  dist("Long-run CAGR (≤20 yrs)", stats.filter((s) => s.longRun !== null).map((s) => s.longRun!)),
  dist("Volatility σ", stats.map((s) => s.sigma)),
  ``,
  `The spread above is the point of the tool: a flat 5% sits far from most ZIPs' actual trend.`,
];

const requested = (process.argv[2] ?? "").split(",").map((s) => s.trim().padStart(5, "0")).filter((s) => s !== "00000");
if (requested.length) {
  const byZip = new Map(zips);
  lines.push(``, `## Client ZIPs`, ``, `| ZIP | Place | History | 12 mo | 5-yr trend | σ | Zillow 12-mo fcst | Status |`, `|---|---|---|---:|---:|---:|---:|---|`);
  for (const zip of requested) {
    const z = byZip.get(zip);
    if (!z) { lines.push(`| ${zip} | – | – | – | – | – | – | Not in Zillow: county fallback via geocoder |`); continue; }
    const s = computeStats(z);
    const status = s ? "OK" : z.countyFips ? "Short history: county fallback" : "Insufficient data";
    lines.push(
      `| ${zip} | ${z.city}, ${z.state} | since ${z.start} | ${s ? pct(s.yoy) : "–"} | ${s ? pct(s.trend5) : "–"} | ${s ? pct(s.sigma) : "–"} | ${z.forecast ? `${z.forecast.m12}%` : "–"} | ${status} |`,
    );
  }
}

const out = join(import.meta.dirname, "..", "data", "reports");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "coverage-report.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
