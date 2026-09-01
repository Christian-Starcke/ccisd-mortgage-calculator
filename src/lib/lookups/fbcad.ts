import { buildSitusWhere, parseAddressQuery } from "./addressParse";
import { fetchJson, withQuery } from "./http";
import type { AddressCandidate } from "./types";

const FBCAD_QUERY =
  "https://gisweb.fbcad.org/arcgis/rest/services/Hosted/FBCAD_Public_Data/FeatureServer/0/query";

const CANDIDATE_FIELDS =
  "objectid,situs,taxunits,totalvalue,landvalue,impvalue,exemptions,yearbuilt,totsqftlvg";

interface FbcadFeature {
  attributes: {
    objectid: number;
    situs: string | null;
    taxunits: string | null;
    totalvalue: number | null;
    landvalue: number | null;
    impvalue: number | null;
    exemptions: string | null;
    yearbuilt: number | null;
    totsqftlvg: number | null;
  };
  geometry?: {
    rings?: number[][][];
  };
}

interface FbcadQueryResponse {
  features?: FbcadFeature[];
  error?: { message?: string };
}

export function parseTaxUnitCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{1,3}\d+[A-Z]?$|^CAD$/.test(code));
}

export function polygonCentroid(
  rings: number[][][] | undefined,
): { lon: number; lat: number } | null {
  const ring = rings?.[0];
  if (!ring || ring.length === 0) return null;
  let lon = 0;
  let lat = 0;
  let count = 0;
  for (const point of ring) {
    if (point.length < 2) continue;
    lon += point[0];
    lat += point[1];
    count += 1;
  }
  if (count === 0) return null;
  return { lon: lon / count, lat: lat / count };
}

function toCandidate(feature: FbcadFeature): AddressCandidate | null {
  const situs = feature.attributes.situs?.trim();
  if (!situs) return null;
  return {
    objectId: feature.attributes.objectid,
    situs,
    taxUnitCodes: parseTaxUnitCodes(feature.attributes.taxunits),
    totalValue: feature.attributes.totalvalue,
    yearBuilt: feature.attributes.yearbuilt,
    livingSqFt: feature.attributes.totsqftlvg,
  };
}

export async function searchParcels(query: string): Promise<
  | { ok: true; candidates: AddressCandidate[] }
  | { ok: false; error: string }
> {
  const parsed = parseAddressQuery(query);
  const where = buildSitusWhere(parsed);
  if (!where) {
    return { ok: false, error: "Enter a street number and street name." };
  }

  const result = await fetchJson<FbcadQueryResponse>(
    withQuery(FBCAD_QUERY, {
      where,
      outFields: CANDIDATE_FIELDS,
      returnGeometry: false,
      resultRecordCount: 12,
      f: "json",
    }),
  );

  if (!result.ok) return result;
  if (result.data.error?.message) {
    return { ok: false, error: result.data.error.message };
  }

  const seen = new Set<number>();
  const candidates: AddressCandidate[] = [];
  for (const feature of result.data.features ?? []) {
    const candidate = toCandidate(feature);
    if (!candidate || seen.has(candidate.objectId)) continue;
    seen.add(candidate.objectId);
    candidates.push(candidate);
  }

  return { ok: true, candidates };
}

export async function getParcel(objectId: number): Promise<
  | {
      ok: true;
      feature: FbcadFeature;
      centroid: { lon: number; lat: number } | null;
    }
  | { ok: false; error: string }
> {
  const result = await fetchJson<FbcadQueryResponse>(
    withQuery(FBCAD_QUERY, {
      where: `objectid=${objectId}`,
      outFields: CANDIDATE_FIELDS,
      returnGeometry: true,
      outSR: 4326,
      f: "json",
    }),
  );

  if (!result.ok) return result;
  const feature = result.data.features?.[0];
  if (!feature) return { ok: false, error: "Parcel not found." };

  return {
    ok: true,
    feature,
    centroid: polygonCentroid(feature.geometry?.rings),
  };
}
