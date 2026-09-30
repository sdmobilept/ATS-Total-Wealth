import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeSeries, type CountyShard, type MacroData, type ZipRecord, type ZipShard } from "../../src/lib/data-types.ts";

/** A ZIP record with its middle-tier (headline) series decoded, as the offline scripts use it. */
export type LoadedZip = ZipRecord & { start: string; v: number[] };
export type LoadedCounty = { name: string; state: string; start: string; v: number[] };

const DATA = join(import.meta.dirname, "..", "..", "public", "data");

export function loadAllZips(): [string, LoadedZip][] {
  const out: [string, LoadedZip][] = [];
  for (const f of readdirSync(join(DATA, "zip"))) {
    const shard = JSON.parse(readFileSync(join(DATA, "zip", f), "utf8")) as ZipShard;
    for (const [zip, z] of Object.entries(shard)) out.push([zip, { ...z, ...decodeSeries(z.tiers.middle) }]);
  }
  return out;
}

export function loadAllCounties(): Record<string, LoadedCounty> {
  const out: Record<string, LoadedCounty> = {};
  for (const f of readdirSync(join(DATA, "county"))) {
    const shard = JSON.parse(readFileSync(join(DATA, "county", f), "utf8")) as CountyShard;
    for (const [fips, c] of Object.entries(shard)) out[fips] = { name: c.name, state: c.state, ...decodeSeries(c.series) };
  }
  return out;
}

export function loadMacro(): MacroData {
  return JSON.parse(readFileSync(join(DATA, "macro.json"), "utf8"));
}

export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
