import { getParcel, parseTaxUnitCodes } from "./fbcad";
import { lookupFloodZone } from "./fema";
import { inferLocationId, resolveUnitsFromCodes } from "./resolveCodes";
import type { ResolvedParcel } from "./types";
import { lookupUsdaEligibility } from "./usda";

export async function lookupProperty(
  objectId: number,
  rateOverrides: Record<string, number> = {},
): Promise<{ ok: true; parcel: ResolvedParcel } | { ok: false; error: string }> {
  const parcelResult = await getParcel(objectId);
  if (!parcelResult.ok) return parcelResult;

  const { feature, centroid } = parcelResult;
  const attrs = feature.attributes;
  const situs = attrs.situs?.trim() ?? "";
  const taxUnitCodes = parseTaxUnitCodes(attrs.taxunits);
  const resolved = resolveUnitsFromCodes(taxUnitCodes, rateOverrides);

  let usdaEligible: boolean | null = null;
  let flood: ResolvedParcel["flood"] = null;

  if (centroid) {
    const [usda, fema] = await Promise.all([
      lookupUsdaEligibility(centroid.lon, centroid.lat),
      lookupFloodZone(centroid.lon, centroid.lat),
    ]);
    if (usda.ok) usdaEligible = usda.eligible;
    if (fema.ok) flood = fema.flood;
  }

  return {
    ok: true,
    parcel: {
      objectId: attrs.objectid,
      situs,
      taxUnitCodes,
      taxingUnits: resolved.units,
      missingRateCodes: resolved.missingRateCodes.map((record) => record.code),
      totalValue: attrs.totalvalue,
      landValue: attrs.landvalue,
      improvementValue: attrs.impvalue,
      yearBuilt: attrs.yearbuilt,
      livingSqFt: attrs.totsqftlvg,
      sellerExemptions: attrs.exemptions,
      centroid,
      usdaEligible,
      flood,
      isFortBendIsd: resolved.isFortBendIsd,
      schoolCode: resolved.schoolCode,
      schoolName: resolved.schoolName,
      inferredLocationId: inferLocationId({
        codes: taxUnitCodes,
        situs,
        hasMud: resolved.hasMud,
      }),
      hasMud: resolved.hasMud,
      lookupAt: new Date().toISOString(),
    },
  };
}
