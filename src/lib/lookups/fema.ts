import { fetchJson, withQuery } from "./http";
import type { FloodLookup } from "./types";

const FEMA_LAYER =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

interface FemaFeature {
  attributes: {
    FLD_ZONE?: string;
    SFHA_TF?: string;
    ZONE_SUBTY?: string | null;
  };
}

interface FemaResponse {
  features?: FemaFeature[];
  error?: { message?: string };
}

export async function lookupFloodZone(
  lon: number,
  lat: number,
): Promise<{ ok: true; flood: FloodLookup } | { ok: false; error: string }> {
  // FEMA's NFHL drops connections often enough that a single attempt loses a
  // knowable answer on roughly two addresses in five. See FetchOptions.retries.
  const result = await fetchJson<FemaResponse>(
    withQuery(FEMA_LAYER, {
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: 4326,
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FLD_ZONE,SFHA_TF,ZONE_SUBTY",
      returnGeometry: false,
      f: "json",
    }),
    { retries: 2 },
  );

  if (!result.ok) return result;
  if (result.data.error?.message) {
    return { ok: false, error: result.data.error.message };
  }

  const attrs = result.data.features?.[0]?.attributes;
  if (!attrs) {
    return {
      ok: true,
      flood: { zone: "X", inSpecialFloodHazardArea: false },
    };
  }

  const zone = attrs.FLD_ZONE ?? null;
  const sfha = (attrs.SFHA_TF ?? "").toUpperCase() === "T";

  return {
    ok: true,
    flood: { zone, inSpecialFloodHazardArea: sfha },
  };
}
