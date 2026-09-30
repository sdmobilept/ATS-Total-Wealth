import { decodeSeries, type CountyShard, type MacroData, type Tier, type ZillowForecast, type ZipShard } from "./data-types";
import { yearAverage, type MonthlySeries } from "./engine";
import type { AvmResult } from "./server/rentcast";

export type { AvmResult, Tier };

export interface Location {
  /** What the numbers are based on. */
  source: "zip" | "county";
  zip: string | null;
  label: string;
  sublabel: string;
  /** Price-tier series; county data has only the middle tier. */
  tiers: { bottom: MonthlySeries | null; middle: MonthlySeries; top: MonthlySeries | null };
  /** Typical monthly rent in the ZIP (Zillow ZORI), when Zillow tracks rents there. */
  rent: MonthlySeries | null;
  forecast: ZillowForecast | null;
  matchedAddress?: string;
  /** Why we fell back to the county, if we did. */
  note?: string;
}

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(url: string): Promise<T | null> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)));
  }
  return cache.get(url) as Promise<T | null>;
}

export const loadMacro = () => getJson<MacroData>("/data/macro.json");

async function loadCounty(fips: string) {
  const shard = await getJson<CountyShard>(`/data/county/${fips.slice(0, 2)}.json`);
  return shard?.[fips] ?? null;
}

const MIN_MONTHS = 61;
const usable = (s: MonthlySeries | null) => (s && s.v.length >= MIN_MONTHS ? s : null);

export interface GeocodeResult {
  zip: string;
  countyFips: string;
  matchedAddress: string;
}

export async function geocode(address: string): Promise<GeocodeResult> {
  const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Address lookup failed");
  return body;
}

export async function fetchAvm(address: string): Promise<AvmResult> {
  try {
    const res = await fetch(`/api/avm?address=${encodeURIComponent(address)}`);
    return (await res.json()) as AvmResult;
  } catch {
    return { status: "error", message: "The home value service is unavailable.", usage: null };
  }
}

/** Resolve a ZIP (and optionally a county FIPS from the geocoder) to price series. */
export async function resolveLocation(zip: string, countyFipsHint?: string, matchedAddress?: string): Promise<Location> {
  const shard = await getJson<ZipShard>(`/data/zip/${zip.slice(0, 3)}.json`);
  const z = shard?.[zip];
  const middle = z ? decodeSeries(z.tiers.middle) : null;
  if (z && middle && middle.v.length >= MIN_MONTHS) {
    return {
      source: "zip",
      zip,
      label: `${z.city}, ${z.state} ${zip}`,
      sublabel: [z.county, z.metro].filter(Boolean).join(" · "),
      tiers: {
        bottom: usable(z.tiers.bottom && decodeSeries(z.tiers.bottom)),
        middle,
        top: usable(z.tiers.top && decodeSeries(z.tiers.top)),
      },
      rent: z.rent ? decodeSeries(z.rent) : null,
      forecast: z.forecast,
      matchedAddress,
    };
  }

  const fips = z?.countyFips ?? countyFipsHint;
  const county = fips ? await loadCounty(fips) : null;
  const countySeries = county ? decodeSeries(county.series) : null;
  if (county && countySeries && countySeries.v.length >= MIN_MONTHS) {
    return {
      source: "county",
      zip,
      label: `${county.name}, ${county.state}`,
      sublabel: `County-level data${zip ? ` for ZIP ${zip}` : ""}`,
      tiers: { bottom: null, middle: countySeries, top: null },
      rent: z?.rent ? decodeSeries(z.rent) : null,
      forecast: z?.forecast ?? null,
      matchedAddress,
      note: z
        ? `ZIP ${zip} has only ${Math.floor((middle?.v.length ?? 0) / 12)} years of history, so the county trend is used.`
        : `Zillow doesn't track ZIP ${zip}, so the county trend is used.`,
    };
  }

  throw new Error(
    z || fips
      ? `Not enough price history for ${zip}.`
      : `ZIP ${zip} isn't in the dataset. Try the full street address so we can find its county.`,
  );
}

const latest = (s: MonthlySeries) => s.v[s.v.length - 1];

/**
 * Pick the price tier whose typical value is closest to the home's value (in log terms),
 * so a $1.9M home follows the trend of the area's upper-third homes, not its median.
 */
export function pickTier(value: number, tiers: Location["tiers"], year?: number): Tier {
  let best: Tier = "middle";
  let bestDist = Infinity;
  for (const t of ["bottom", "middle", "top"] as Tier[]) {
    const s = tiers[t];
    if (!s) continue;
    // With a purchase year, compare the price paid with each tier's typical price that year.
    const ref = year !== undefined ? yearAverage(s, year) : latest(s);
    if (!ref) continue;
    const d = Math.abs(Math.log(value / ref));
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}

export const TIER_LABEL: Record<Tier, string> = { bottom: "Lower-priced third", middle: "Middle third", top: "Upper-priced third" };
