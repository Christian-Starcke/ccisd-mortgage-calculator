import { fetchJson, withQuery } from "./http";

/**
 * USDA Rural Housing Service single-family eligibility.
 *
 * Layer 4 (`RHS SFH MFH`) draws the *ineligible* (typically urban) polygons.
 * A point with zero intersecting features is eligible for USDA Section 502.
 */
const USDA_LAYER =
  "https://rdgdwe.sc.egov.usda.gov/arcgis/rest/services/Eligibility/Eligibility/MapServer/4/query";

interface CountResponse {
  count?: number;
  error?: { message?: string };
}

export async function lookupUsdaEligibility(
  lon: number,
  lat: number,
): Promise<{ ok: true; eligible: boolean } | { ok: false; error: string }> {
  const result = await fetchJson<CountResponse>(
    withQuery(USDA_LAYER, {
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: 4326,
      spatialRel: "esriSpatialRelIntersects",
      returnCountOnly: true,
      f: "json",
    }),
    { retries: 2 },
  );

  if (!result.ok) return result;
  if (result.data.error?.message) {
    return { ok: false, error: result.data.error.message };
  }

  const count = result.data.count ?? 0;
  return { ok: true, eligible: count === 0 };
}
