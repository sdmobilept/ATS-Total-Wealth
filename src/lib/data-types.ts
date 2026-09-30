// Shapes of the JSON files written by scripts/build-data.ts into public/data.

/**
 * Monthly values rounded to $100 and delta-encoded to keep shards small:
 * d[0] is the first value in hundreds of dollars, d[i] the change from month i-1.
 */
export interface EncodedSeries {
  start: string;
  d: number[];
}

export interface ZillowForecast {
  /** Month the forecast was made from ("YYYY-MM"). */
  base: string;
  /** Forecast growth over the next 1, 3 and 12 months, in percent. */
  m1: number;
  m3: number;
  m12: number;
}

export type Tier = "bottom" | "middle" | "top";

export interface ZipRecord {
  city: string;
  state: string;
  metro: string;
  county: string;
  countyFips: string | null;
  /** Zillow ZHVI by price tier: bottom third, middle third (the headline index) and top third of homes. */
  tiers: { bottom: EncodedSeries | null; middle: EncodedSeries; top: EncodedSeries | null };
  forecast: ZillowForecast | null;
}

export interface CountyRecord {
  name: string;
  state: string;
  series: EncodedSeries;
}

/** public/data/zip/{first 3 digits}.json */
export type ZipShard = Record<string, ZipRecord>;
/** public/data/county/{state FIPS}.json */
export type CountyShard = Record<string, CountyRecord>;

export interface MacroData {
  generatedAt: string;
  /** Latest month in the Zillow data. */
  dataThrough: string;
  mortgage: { latest: number; latestDate: string; start: string; v: number[] };
  cpi: { start: string; v: number[] };
  /** Trailing 10-year CPI inflation, annualized (decimal). */
  inflation10y: number;
  zipCount: number;
}

export function encodeSeries(start: string, v: number[]): EncodedSeries {
  const r = v.map((x) => Math.round(x / 100));
  return { start, d: r.map((x, i) => (i === 0 ? x : x - r[i - 1])) };
}

export function decodeSeries(s: EncodedSeries): { start: string; v: number[] } {
  const v: number[] = [];
  let acc = 0;
  for (const x of s.d) {
    acc += x;
    v.push(acc * 100);
  }
  return { start: s.start, v };
}
