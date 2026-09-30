// Turns data/raw/*.csv into small JSON shards under public/data that the app loads on demand.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCsv } from "./lib/csv.ts";
import { encodeSeries, type CountyShard, type EncodedSeries, type MacroData, type ZipRecord, type ZipShard } from "../src/lib/data-types.ts";
import { monthIndex } from "../src/lib/engine.ts";

const ROOT = join(import.meta.dirname, "..");
const RAW = join(ROOT, "data", "raw");
const OUT = join(ROOT, "public", "data");

/** Trim leading/trailing blanks and linearly fill interior gaps. Returns null if empty. */
function cleanSeries(dates: string[], cells: string[]): { start: string; v: number[] } | null {
  const nums = cells.map((c) => (c === "" ? NaN : Number(c)));
  const first = nums.findIndex((x) => !Number.isNaN(x));
  if (first < 0) return null;
  let last = nums.length - 1;
  while (Number.isNaN(nums[last])) last--;
  const v = nums.slice(first, last + 1);
  for (let i = 1; i < v.length; i++) {
    if (!Number.isNaN(v[i])) continue;
    let j = i;
    while (Number.isNaN(v[j])) j++;
    for (let k = i; k < j; k++) v[k] = v[i - 1] + ((v[j] - v[i - 1]) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return { start: dates[first].slice(0, 7), v: v.map((x) => Math.round(x)) };
}

function readFred(file: string): { date: string; value: number }[] {
  return readFileSync(join(RAW, file), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","))
    .filter(([, v]) => v !== "" && v !== ".")
    .map(([d, v]) => ({ date: d, value: Number(v) }));
}

/** Monthly average from 1990-01 on, as a gap-free series. */
function monthlyFrom1990(obs: { date: string; value: number }[]): { start: string; v: number[] } {
  const buckets = new Map<string, number[]>();
  for (const o of obs) {
    const ym = o.date.slice(0, 7);
    if (ym < "1990-01") continue;
    (buckets.get(ym) ?? buckets.set(ym, []).get(ym)!).push(o.value);
  }
  const months = [...buckets.keys()].sort();
  return {
    start: months[0],
    v: months.map((m) => {
      const xs = buckets.get(m)!;
      return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000;
    }),
  };
}

// ---- Counties -----------------------------------------------------------------
const counties: Record<string, CountyShard> = {};
const countyFipsByName = new Map<string, string>();
await readCsv(join(RAW, "zhvi_county.csv"), (row, header) => {
  const col = (name: string) => row[header.indexOf(name)];
  const dateStart = header.indexOf("2000-01-31");
  const s = cleanSeries(header.slice(dateStart), row.slice(dateStart));
  if (!s) return;
  const stateFips = col("StateCodeFIPS").padStart(2, "0");
  const fips = stateFips + col("MunicipalCodeFIPS").padStart(3, "0");
  (counties[stateFips] ??= {})[fips] = { name: col("RegionName"), state: col("State"), series: encodeSeries(s.start, s.v) };
  countyFipsByName.set(`${col("RegionName")}|${col("State")}`, fips);
});

// ---- Zillow ZIP forecast --------------------------------------------------------
const forecasts = new Map<string, ZipRecord["forecast"]>();
await readCsv(join(RAW, "zhvf_zip.csv"), (row, header) => {
  const zip = row[header.indexOf("RegionName")].padStart(5, "0");
  const base = row[header.indexOf("BaseDate")].slice(0, 7);
  const [m1, m3, m12] = row.slice(header.indexOf("BaseDate") + 1).map(Number);
  if ([m1, m3, m12].some(Number.isNaN)) return;
  forecasts.set(zip, { base, m1, m3, m12 });
});

// ---- ZIP price tiers (bottom and top third of homes) --------------------------------
/** Keeps a tier only if it runs through the latest month, so it lines up with the middle tier. */
async function readTier(file: string, unit = 100): Promise<Map<string, EncodedSeries>> {
  const out = new Map<string, EncodedSeries>();
  await readCsv(join(RAW, file), (row, header) => {
    const dateStart = header.findIndex((h) => /^\d{4}-\d{2}-\d{2}$/.test(h));
    const s = cleanSeries(header.slice(dateStart), row.slice(dateStart));
    const last = header[header.length - 1].slice(0, 7);
    if (!s || monthIndex(s.start) + s.v.length - 1 !== monthIndex(last)) return;
    out.set(row[header.indexOf("RegionName")].padStart(5, "0"), encodeSeries(s.start, s.v, unit));
  });
  return out;
}
const bottomTier = await readTier("zhvi_zip_bottom.csv");
const topTier = await readTier("zhvi_zip_top.csv");
// Rents need dollar precision.
const rents = await readTier("zori_zip.csv", 1);

// ---- ZIPs -----------------------------------------------------------------------
const zips: Record<string, ZipShard> = {};
let dataThrough = "";
let zipCount = 0;
await readCsv(join(RAW, "zhvi_zip.csv"), (row, header) => {
  const col = (name: string) => row[header.indexOf(name)];
  const dateStart = header.indexOf("2000-01-31");
  dataThrough = header[header.length - 1].slice(0, 7);
  const s = cleanSeries(header.slice(dateStart), row.slice(dateStart));
  if (!s) return;
  const zip = col("RegionName").padStart(5, "0");
  const county = col("CountyName");
  (zips[zip.slice(0, 3)] ??= {})[zip] = {
    city: col("City"),
    state: col("State"),
    metro: col("Metro"),
    county,
    countyFips: countyFipsByName.get(`${county}|${col("State")}`) ?? null,
    tiers: {
      bottom: bottomTier.get(zip) ?? null,
      middle: encodeSeries(s.start, s.v),
      top: topTier.get(zip) ?? null,
    },
    rent: rents.get(zip) ?? null,
    forecast: forecasts.get(zip) ?? null,
  };
  zipCount++;
});

// ---- Macro ----------------------------------------------------------------------
const mortgageObs = readFred("mortgage30.csv");
const cpi = monthlyFrom1990(readFred("cpi.csv"));
const cpiLast = cpi.v.length - 1;
const macro: MacroData = {
  generatedAt: new Date().toISOString(),
  dataThrough,
  mortgage: {
    latest: mortgageObs[mortgageObs.length - 1].value,
    latestDate: mortgageObs[mortgageObs.length - 1].date,
    ...monthlyFrom1990(mortgageObs),
  },
  cpi,
  inflation10y: Math.pow(cpi.v[cpiLast] / cpi.v[cpiLast - 120], 1 / 10) - 1,
  zipCount,
};

// ---- Write ----------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "zip"), { recursive: true });
mkdirSync(join(OUT, "county"), { recursive: true });
for (const [k, shard] of Object.entries(zips)) writeFileSync(join(OUT, "zip", `${k}.json`), JSON.stringify(shard));
for (const [k, shard] of Object.entries(counties)) writeFileSync(join(OUT, "county", `${k}.json`), JSON.stringify(shard));
writeFileSync(join(OUT, "macro.json"), JSON.stringify(macro));

console.log(
  `Wrote ${zipCount} ZIPs in ${Object.keys(zips).length} shards, ` +
    `${countyFipsByName.size} counties, ${bottomTier.size}/${topTier.size} bottom/top tiers, ${rents.size} rent series; data through ${dataThrough}; ` +
    `30y mortgage ${macro.mortgage.latest}% (${macro.mortgage.latestDate}); ` +
    `10y CPI ${(macro.inflation10y * 100).toFixed(2)}%/yr`,
);
