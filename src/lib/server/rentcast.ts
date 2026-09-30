// RentCast automated valuation (AVM), with a hard monthly cap and an address cache.
//
// RentCast does NOT stop at the plan's included requests: beyond them it bills an overage fee
// per request. The counter below is therefore the only thing preventing charges. It counts every
// request we send (before sending it) and refuses once the limit is reached.
//
// State lives in data/runtime/*.json, which only persists on a server with a durable disk.
// On serverless hosts (Vercel) the file is wiped between invocations, so the AVM is disabled
// there unless RENTCAST_ALLOW_EPHEMERAL_COUNTER=1 is set deliberately.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.rentcast.io/v1/avm/value";
const DIR = join(process.cwd(), "data", "runtime");
const USAGE_FILE = join(DIR, "rentcast-usage.json");
const CACHE_FILE = join(DIR, "rentcast-cache.json");
const CACHE_DAYS = 30;

export interface AvmUsage {
  used: number;
  limit: number;
  /** First day of the next billing period ("YYYY-MM-DD"). */
  resetsOn: string;
}

export interface AvmProperty {
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  yearBuilt: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
}

export type AvmResult =
  | { status: "ok"; price: number; low: number; high: number; fetchedAt: string; cached: boolean; property: AvmProperty; usage: AvmUsage | null }
  | { status: "disabled" | "limit" | "not_found" | "error"; message: string; usage: AvmUsage | null };

interface UsageState {
  period: string;
  count: number;
}
interface CacheEntry {
  fetchedAt: string;
  price: number;
  low: number;
  high: number;
  property: AvmProperty;
}

const limit = () => Number(process.env.RENTCAST_MONTHLY_LIMIT ?? 50);

/** Billing periods start on RENTCAST_BILLING_DAY (1–28) of each month, matching your RentCast renewal date. */
function currentPeriod(now = new Date()): { period: string; resetsOn: string } {
  const day = Math.min(Math.max(Number(process.env.RENTCAST_BILLING_DAY ?? 1), 1), 28);
  let y = now.getFullYear();
  let m = now.getMonth();
  if (now.getDate() < day) m -= 1;
  if (m < 0) { m = 11; y -= 1; }
  const start = new Date(y, m, day);
  const next = new Date(y, m + 1, day);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { period: fmt(start), resetsOn: fmt(next) };
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  mkdirSync(DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

function getUsage(): { state: UsageState; usage: AvmUsage } {
  const { period, resetsOn } = currentPeriod();
  let state = readJson<UsageState>(USAGE_FILE, { period, count: 0 });
  if (state.period !== period) state = { period, count: 0 };
  return { state, usage: { used: state.count, limit: limit(), resetsOn } };
}

const cacheKey = (address: string) => address.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function disabledReason(): string | null {
  if (!process.env.RENTCAST_API_KEY) return "Automatic home values aren't set up (no RentCast API key).";
  if (process.env.VERCEL && process.env.RENTCAST_ALLOW_EPHEMERAL_COUNTER !== "1") {
    return "Automatic home values are off on this host because the usage counter can't be stored safely.";
  }
  return null;
}

export function avmUsage(): AvmUsage | null {
  return disabledReason() ? null : getUsage().usage;
}

// Serialize lookups so two simultaneous requests can't both slip under the cap.
let queue: Promise<unknown> = Promise.resolve();

export function lookupValue(address: string): Promise<AvmResult> {
  const run = queue.then(() => doLookup(address));
  queue = run.catch(() => undefined);
  return run;
}

async function doLookup(address: string): Promise<AvmResult> {
  const reason = disabledReason();
  if (reason) return { status: "disabled", message: reason, usage: null };

  const key = cacheKey(address);
  const cache = readJson<Record<string, CacheEntry>>(CACHE_FILE, {});
  const hit = cache[key];
  const { state, usage } = getUsage();
  if (hit && Date.now() - Date.parse(hit.fetchedAt) < CACHE_DAYS * 86400e3) {
    return { status: "ok", ...hit, cached: true, usage };
  }

  if (state.count >= usage.limit) {
    return {
      status: "limit",
      message: `This month's ${usage.limit} automatic lookups are used up (resets ${usage.resetsOn}).`,
      usage,
    };
  }

  // Count the request before sending it: a request that times out may still be billed.
  state.count += 1;
  writeJson(USAGE_FILE, state);
  const usageAfter = { ...usage, used: state.count };

  let res: Response;
  try {
    const url = new URL(API);
    url.searchParams.set("address", address);
    url.searchParams.set("compCount", "5");
    res = await fetch(url, {
      headers: { "X-Api-Key": process.env.RENTCAST_API_KEY!, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { status: "error", message: "The home value service didn't respond.", usage: usageAfter };
  }

  if (res.status === 404) {
    return { status: "not_found", message: "No automatic value is available for this address.", usage: usageAfter };
  }
  if (res.status === 401 || res.status === 403) {
    return { status: "error", message: "The RentCast API key was rejected.", usage: usageAfter };
  }
  if (!res.ok) {
    return { status: "error", message: `The home value service returned an error (${res.status}).`, usage: usageAfter };
  }

  const body = await res.json();
  if (typeof body?.price !== "number" || body.price <= 0) {
    return { status: "not_found", message: "No automatic value is available for this address.", usage: usageAfter };
  }
  const sp = body.subjectProperty ?? {};
  const entry: CacheEntry = {
    fetchedAt: new Date().toISOString(),
    price: body.price,
    low: body.priceRangeLow ?? body.price,
    high: body.priceRangeHigh ?? body.price,
    property: {
      propertyType: sp.propertyType ?? null,
      bedrooms: sp.bedrooms ?? null,
      bathrooms: sp.bathrooms ?? null,
      squareFootage: sp.squareFootage ?? null,
      yearBuilt: sp.yearBuilt ?? null,
      lastSalePrice: sp.lastSalePrice ?? null,
      lastSaleDate: sp.lastSaleDate ?? null,
    },
  };
  cache[key] = entry;
  writeJson(CACHE_FILE, cache);
  return { status: "ok", ...entry, cached: false, usage: usageAfter };
}
