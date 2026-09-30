// Proxies the free US Census geocoder (it doesn't send CORS headers) and returns ZIP + county FIPS.
const CENSUS = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

interface CensusMatch {
  matchedAddress: string;
  addressComponents: { zip: string };
  geographies: { Counties?: { GEOID: string }[] };
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) return Response.json({ error: "Enter an address." }, { status: 400 });

  const url = new URL(CENSUS);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("layers", "Counties");
  url.searchParams.set("format", "json");

  let match: CensusMatch | undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Census geocoder returned ${res.status}`);
    const body = await res.json();
    match = body?.result?.addressMatches?.[0];
  } catch {
    return Response.json({ error: "The address service is unavailable. Enter a 5-digit ZIP instead." }, { status: 502 });
  }

  if (!match) {
    return Response.json({ error: "Address not found. Check the spelling or enter a 5-digit ZIP." }, { status: 404 });
  }
  return Response.json({
    zip: match.addressComponents.zip,
    countyFips: match.geographies.Counties?.[0]?.GEOID ?? "",
    matchedAddress: match.matchedAddress,
  });
}
