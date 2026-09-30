import { lookupValue } from "@/lib/server/rentcast";

// Property-level value estimate for a full street address (RentCast), capped monthly.
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) return Response.json({ status: "error", message: "Missing address.", usage: null }, { status: 400 });
  return Response.json(await lookupValue(address));
}
