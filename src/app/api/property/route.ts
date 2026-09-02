import { lookupProperty } from "@/lib/lookups/property";
import { decodeParcelRef } from "@/lib/lookups/types";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // `parcel` is "<county>:<id>", because the two appraisal districts number
  // parcels differently and are resolved by different paths. A bare id would
  // be ambiguous.
  const raw = request.nextUrl.searchParams.get("parcel") ?? "";
  const ref = decodeParcelRef(raw);
  if (!ref) {
    return Response.json(
      { error: "A parcel reference of the form harris:<account> or galveston:<geoid> is required." },
      { status: 400 },
    );
  }

  const overridesRaw = request.nextUrl.searchParams.get("rates");
  const rateOverrides: Record<string, number> = {};
  if (overridesRaw) {
    try {
      const parsed = JSON.parse(overridesRaw) as Record<string, unknown>;
      for (const [code, value] of Object.entries(parsed)) {
        const rate = Number(value);
        // A rate the buyer typed in for a unit the county does not publish.
        if (Number.isFinite(rate) && rate >= 0 && rate < 10) {
          rateOverrides[code.toUpperCase()] = rate;
        }
      }
    } catch {
      return Response.json({ error: "Malformed rate overrides." }, { status: 400 });
    }
  }

  const result = await lookupProperty(ref, rateOverrides);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ parcel: result.parcel });
}
