import { parseAddressQuery } from "./addressParse";
import { HARRIS_VINTAGE, searchHarrisParcels } from "./hcad";
import { getParcelRows, searchGalvestonParcels } from "./parcelStore";
import { resolveUnitsFromCodes } from "./resolveCodes";
import type { AddressCandidate } from "./types";

/**
 * One address search across both of Clear Creek ISD's appraisal districts.
 *
 * The two halves are fetched by completely different means — Harris live from
 * HCAD, Galveston from the stored GCAD drop — and merged here so that typing
 * an address behaves the same either side of the county line. A buyer does not
 * know which appraisal district their house is in, and should not have to.
 *
 * Harris needs a second step. Its parcel layer carries no taxing units, so
 * every candidate's codes are fetched from the stored footprint in one batch.
 * An account with no stored row is a real parcel that Clear Creek ISD does not
 * bill, which is reported rather than hidden.
 */
export async function searchParcels(query: string): Promise<
  | {
      ok: true;
      candidates: AddressCandidate[];
      /** Set when one county answered and the other failed. */
      partial: string | null;
    }
  | { ok: false; error: string }
> {
  const parsed = parseAddressQuery(query);
  if (!parsed.houseNumber && parsed.streetTokens.length === 0) {
    return { ok: false, error: "Enter a street number and street name." };
  }

  const [harris, galveston] = await Promise.all([
    searchHarrisParcels(parsed),
    searchGalvestonParcels({
      houseNumber: parsed.houseNumber,
      streetTokens: parsed.streetTokens,
    }),
  ]);

  // A failure on one side is not a failure of the search. Say which side went
  // missing rather than pretending the other county's answer is complete.
  if (!harris.ok && !galveston.ok) {
    return { ok: false, error: harris.error };
  }
  const partial = !harris.ok
    ? `Harris County parcels could not be searched (${harris.error}). Only Galveston County results are shown.`
    : !galveston.ok
      ? `Galveston County parcels could not be searched (${galveston.error}). Only Harris County results are shown.`
      : null;

  const candidates: AddressCandidate[] = [];

  if (galveston.ok) {
    for (const row of galveston.rows) {
      const resolved = resolveUnitsFromCodes("galveston", row.entity_codes);
      candidates.push({
        ref: { county: "galveston", id: row.parcel_id },
        situs: row.situs ?? "",
        taxUnitCodes: row.entity_codes,
        totalValue: row.total_value,
        yearBuilt: null,
        livingSqFt: null,
        vintage: row.source_vintage,
        inDistrict: resolved.isClearCreekIsd,
        schoolName: resolved.schoolNames[0] ?? null,
      });
    }
  }

  if (harris.ok && harris.candidates.length > 0) {
    const stored = await getParcelRows(
      "harris",
      harris.candidates.map((c) => c.ref.id),
    );
    for (const candidate of harris.candidates) {
      const row = stored.ok ? stored.rows.get(candidate.ref.id) : undefined;
      const codes = row?.entity_codes ?? [];
      const resolved = resolveUnitsFromCodes("harris", codes);
      candidates.push({
        ...candidate,
        taxUnitCodes: codes,
        vintage: row ? `${HARRIS_VINTAGE}; units ${row.source_vintage}` : HARRIS_VINTAGE,
        inDistrict: resolved.isClearCreekIsd,
        schoolName: resolved.schoolNames[0] ?? null,
      });
    }
  }

  // In-district parcels first, then by address, so the common case is at the
  // top and the "this is not actually Clear Creek" cases are still visible.
  candidates.sort((a, b) => {
    if (a.inDistrict !== b.inDistrict) return a.inDistrict ? -1 : 1;
    return a.situs.localeCompare(b.situs);
  });

  return { ok: true, candidates, partial };
}
