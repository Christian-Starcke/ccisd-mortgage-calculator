import { fetchJson, withQuery } from "./http";
import type { ParsedAddressQuery } from "./addressParse";
import type { AddressCandidate } from "./types";

/**
 * Harris Central Appraisal District parcels, served live by Harris County GIS.
 *
 * Two things about this service shape the code below.
 *
 * The address is structured rather than concatenated into one `situs` blob, so
 * the house number is matched as an integer against `site_str_num` instead of
 * a string prefix. That is faster and it sidesteps the "1234" / "1234-B"
 * ambiguity a concatenated address forces on you. Galveston, whose records are
 * a single situs string, is searched the other way in `parcelStore.ts`.
 *
 * There is no taxing-unit list on the parcel. HCAD publishes the account to
 * jurisdiction mapping only in its annual bulk drop, so codes come from the
 * `parcel` table in Supabase, loaded by scripts/ingestParcels.mjs. An account
 * that is missing from that table is a parcel outside Clear Creek ISD.
 */
const HCAD_QUERY =
  "https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query";

const FIELDS = [
  "acct_num",
  "site_str_pfx",
  "site_str_num",
  "site_str_num_sfx",
  "site_str_name",
  "site_str_sfx",
  "site_str_sfx_dir",
  "site_city",
  "site_zip",
  "land_value",
  "bld_value",
  "total_appraised_val",
  "tax_year",
].join(",");

export const HARRIS_VINTAGE = "HCAD, live";

interface HcadAttributes {
  acct_num: string | null;
  site_str_pfx: string | null;
  site_str_num: number | null;
  site_str_num_sfx: string | null;
  site_str_name: string | null;
  site_str_sfx: string | null;
  site_str_sfx_dir: string | null;
  site_city: string | null;
  site_zip: string | null;
  land_value: number | null;
  bld_value: number | null;
  total_appraised_val: number | null;
  tax_year: string | null;
}

export interface HcadFeature {
  attributes: HcadAttributes;
  geometry?: { rings?: number[][][] };
}

interface HcadResponse {
  features?: HcadFeature[];
  error?: { message?: string };
}

/**
 * HCAD's `site_city` is the postal city, not the municipality: a Nassau Bay
 * address reads "HOUSTON". The city a buyer is actually taxed by comes from
 * the taxing units, never from here, so the city is shown only as part of the
 * address string for recognising a match.
 */
export function formatSitus(a: HcadAttributes): string {
  const street = [
    a.site_str_pfx,
    a.site_str_num == null ? null : String(a.site_str_num),
    a.site_str_num_sfx,
    a.site_str_name,
    a.site_str_sfx,
    a.site_str_sfx_dir,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const tail = [a.site_city?.trim(), a.site_zip?.trim()]
    .filter(Boolean)
    .join(" ");
  return [street, tail].filter(Boolean).join(", ").toUpperCase();
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

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Builds the where clause against HCAD's structured address fields.
 *
 * The street name is matched with LIKE because the district abbreviates
 * inconsistently ("BAY AREA" vs "BAY AREA BLVD"), but the house number is an
 * integer equality, which is what keeps the result set small enough to skip
 * paging.
 */
export function buildHarrisWhere(parsed: ParsedAddressQuery): string | null {
  const clauses: string[] = [];
  if (parsed.houseNumber) {
    const n = Number(parsed.houseNumber);
    if (Number.isFinite(n)) clauses.push(`site_str_num=${n}`);
  }
  for (const token of parsed.streetTokens.slice(0, 3)) {
    clauses.push(`UPPER(site_str_name) LIKE '%${escapeSql(token)}%'`);
  }
  if (clauses.length === 0) return null;
  return clauses.join(" AND ");
}

export async function searchHarrisParcels(
  parsed: ParsedAddressQuery,
): Promise<
  { ok: true; candidates: AddressCandidate[] } | { ok: false; error: string }
> {
  const where = buildHarrisWhere(parsed);
  if (!where) return { ok: true, candidates: [] };

  const result = await fetchJson<HcadResponse>(
    withQuery(HCAD_QUERY, {
      where,
      outFields: FIELDS,
      returnGeometry: false,
      resultRecordCount: 12,
      f: "json",
    }),
  );

  if (!result.ok) return result;
  if (result.data.error?.message) {
    return { ok: false, error: result.data.error.message };
  }

  const seen = new Set<string>();
  const candidates: AddressCandidate[] = [];
  for (const feature of result.data.features ?? []) {
    const acct = feature.attributes.acct_num?.trim();
    const situs = formatSitus(feature.attributes);
    if (!acct || !situs || seen.has(acct)) continue;
    seen.add(acct);
    candidates.push({
      ref: { county: "harris", id: acct },
      situs,
      // Filled in by the caller from the stored footprint; HCAD's parcel
      // layer carries neither taxing units nor, therefore, a school district.
      taxUnitCodes: [],
      totalValue: feature.attributes.total_appraised_val,
      yearBuilt: null,
      livingSqFt: null,
      vintage: HARRIS_VINTAGE,
      // Unknown until the caller joins the stored footprint. Never false:
      // that would be a finding, and none has been made yet.
      inDistrict: null,
      schoolName: null,
    });
  }

  return { ok: true, candidates };
}

export async function getHarrisParcel(acct: string): Promise<
  | {
      ok: true;
      feature: HcadFeature;
      centroid: { lon: number; lat: number } | null;
    }
  | { ok: false; error: string }
> {
  const result = await fetchJson<HcadResponse>(
    withQuery(HCAD_QUERY, {
      where: `acct_num='${escapeSql(acct)}'`,
      outFields: FIELDS,
      returnGeometry: true,
      outSR: 4326,
      f: "json",
    }),
  );

  if (!result.ok) return result;
  if (result.data.error?.message) {
    return { ok: false, error: result.data.error.message };
  }
  const feature = result.data.features?.[0];
  if (!feature) return { ok: false, error: "Parcel not found at HCAD." };

  return {
    ok: true,
    feature,
    centroid: polygonCentroid(feature.geometry?.rings),
  };
}
