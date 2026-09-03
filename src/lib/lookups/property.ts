import { lookupFloodZone } from "./fema";
import { formatSitus, getHarrisParcel, HARRIS_VINTAGE } from "./hcad";
import { getParcelRow } from "./parcelStore";
import { inferLocationId, resolveUnitsFromCodes } from "./resolveCodes";
import type { ParcelRef, ResolvedParcel } from "./types";
import { lookupUsdaEligibility } from "./usda";
import { assessWindExposure } from "@/lib/windstorm";

/**
 * Resolves one picked parcel into everything the engine needs.
 *
 * The two counties diverge in where the pieces come from and converge on the
 * same `ResolvedParcel`:
 *
 *   Harris     address, values and geometry live from HCAD; taxing units from
 *              the stored footprint. Both are required, because HCAD's parcel
 *              layer has no units and the stored row has no address.
 *
 *   Galveston  everything from the stored GCAD drop, including a centroid
 *              reprojected out of the district's shapefile at ingest. There is
 *              no live service to call, but the geometry is published, so the
 *              FEMA and USDA layers can still be sampled.
 */
export async function lookupProperty(
  ref: ParcelRef,
  rateOverrides: Record<string, number> = {},
): Promise<{ ok: true; parcel: ResolvedParcel } | { ok: false; error: string }> {
  return ref.county === "harris"
    ? lookupHarris(ref, rateOverrides)
    : lookupGalveston(ref, rateOverrides);
}

async function lookupHarris(
  ref: ParcelRef,
  rateOverrides: Record<string, number>,
): Promise<{ ok: true; parcel: ResolvedParcel } | { ok: false; error: string }> {
  const [live, stored] = await Promise.all([
    getHarrisParcel(ref.id),
    getParcelRow("harris", ref.id),
  ]);
  if (!live.ok) return live;
  if (!stored.ok) return stored;

  const attrs = live.feature.attributes;
  const situs = formatSitus(attrs);
  const codes = stored.row?.entity_codes ?? [];
  const resolved = resolveUnitsFromCodes("harris", codes, rateOverrides);

  const geo = await lookupGeography(live.centroid);

  return {
    ok: true,
    parcel: {
      ref,
      situs,
      taxUnitCodes: codes,
      taxingUnits: resolved.units,
      missingRateCodes: resolved.missingRateCodes,
      nonLevyingCodes: resolved.nonLevyingCodes,
      totalValue: attrs.total_appraised_val,
      landValue: attrs.land_value,
      improvementValue: attrs.bld_value,
      // HCAD's parcel layer publishes neither year built nor living area.
      yearBuilt: null,
      livingSqFt: null,
      // Nor exemptions, so the "the seller's homestead does not transfer"
      // warning cannot be driven off the record on this side of the line.
      sellerExemptions: null,
      centroid: live.centroid,
      ...geo,
      isClearCreekIsd: resolved.isClearCreekIsd,
      schoolCodes: resolved.schoolCodes,
      schoolNames: resolved.schoolNames,
      splitBetweenSchoolDistricts: resolved.schoolCodes.length > 1,
      inferredLocationId: inferLocationId({
        county: "harris",
        codes,
        situs,
        hasUtilityDistrict: resolved.hasUtilityDistrict,
      }),
      hasUtilityDistrict: resolved.hasUtilityDistrict,
      inWindstormArea:
        assessWindExposure({ county: "harris", taxUnitCodes: codes })
          .separatePolicyRequired,
      vintage: stored.row
        ? `${HARRIS_VINTAGE}; taxing units from ${stored.row.source_vintage}`
        : HARRIS_VINTAGE,
      lookupAt: new Date().toISOString(),
    },
  };
}

async function lookupGalveston(
  ref: ParcelRef,
  rateOverrides: Record<string, number>,
): Promise<{ ok: true; parcel: ResolvedParcel } | { ok: false; error: string }> {
  const stored = await getParcelRow("galveston", ref.id);
  if (!stored.ok) return stored;
  const row = stored.row;
  if (!row) {
    return { ok: false, error: "Parcel not found in the Galveston County drop." };
  }

  const codes = row.entity_codes;
  const resolved = resolveUnitsFromCodes("galveston", codes, rateOverrides);
  const situs = row.situs ?? "";

  // GCAD publishes no query service, but it does publish geometry. The centroid
  // was reprojected out of its shapefile at ingest, which is what lets the FEMA
  // and USDA layers be sampled on this side of the county line at all.
  const centroid =
    row.centroid_lon != null && row.centroid_lat != null
      ? { lon: row.centroid_lon, lat: row.centroid_lat }
      : null;
  const geo = await lookupGeography(centroid);

  return {
    ok: true,
    parcel: {
      ref,
      situs,
      taxUnitCodes: codes,
      taxingUnits: resolved.units,
      missingRateCodes: resolved.missingRateCodes,
      nonLevyingCodes: resolved.nonLevyingCodes,
      totalValue: row.total_value,
      landValue: row.land_value,
      improvementValue: row.improvement_value,
      yearBuilt: null,
      livingSqFt: null,
      sellerExemptions: row.exemption_codes,
      centroid,
      ...geo,
      isClearCreekIsd: resolved.isClearCreekIsd,
      schoolCodes: resolved.schoolCodes,
      schoolNames: resolved.schoolNames,
      splitBetweenSchoolDistricts: resolved.schoolCodes.length > 1,
      inferredLocationId: inferLocationId({
        county: "galveston",
        codes,
        situs,
        hasUtilityDistrict: resolved.hasUtilityDistrict,
      }),
      hasUtilityDistrict: resolved.hasUtilityDistrict,
      inWindstormArea: true,
      vintage: row.source_vintage,
      lookupAt: new Date().toISOString(),
    },
  };
}

async function lookupGeography(
  centroid: { lon: number; lat: number } | null,
): Promise<Pick<ResolvedParcel, "usdaEligible" | "flood">> {
  if (!centroid) return { usdaEligible: null, flood: null };
  const [usda, fema] = await Promise.all([
    lookupUsdaEligibility(centroid.lon, centroid.lat),
    lookupFloodZone(centroid.lon, centroid.lat),
  ]);
  return {
    usdaEligible: usda.ok ? usda.eligible : null,
    flood: fema.ok ? fema.flood : null,
  };
}
