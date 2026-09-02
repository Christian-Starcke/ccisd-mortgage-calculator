import { roundCents } from "./money";
import type { PropertyTaxResult, TaxUnitCodeRecord, TaxingUnit } from "./propertyTax";

/**
 * Who supplies the water, and what that costs.
 *
 * This is the largest driver of monthly cost that a listing never mentions.
 * Two houses at the same price, in the same school district, differ by more
 * than $300 a month depending on whether a city or a utility district serves
 * them — and the listing shows neither. A buyer comparing a Clear Lake City
 * house to one in an unincorporated Harris MUD, or League City to Galveston
 * County MUD 36, is comparing two very different monthly payments and has no
 * way to see why.
 *
 * It costs money twice over, which is the part people miss:
 *
 *   1. The district levies its own property tax, on top of the school,
 *      county and city units. Rates in this district run from $0.05 to $1.15
 *      per $100 — the top of that range is more than the school tax.
 *   2. It bills water and sewer separately, because the city is not doing it.
 *
 * And the tax half hits a third time at closing, since the lender escrows
 * twelve months of it up front. That is why an otherwise identical buyer can
 * be limited by cash in a MUD and by debt-to-income outside one.
 */

export type WaterService =
  /** A city supplies water. No district tax and no separate district bill. */
  | "city"
  /** A municipal utility, water control or improvement district supplies it. */
  | "district"
  /** No parcel picked yet, or the parcel names a district with no known rate. */
  | "unknown";

export interface WaterServiceAssessment {
  service: WaterService;
  /** The utility districts billing this parcel, usually zero or one. */
  districts: TaxingUnit[];
  /** Districts on the parcel whose rate the county does not publish. */
  unknownRateDistricts: TaxUnitCodeRecord[];

  /** The districts' share of the annual property tax bill. */
  annualDistrictTax: number;
  monthlyDistrictTax: number;
  /** Water and sewer billed by the district, separate from its tax. */
  monthlyWaterBill: number;
  /** What being in a district costs every month, both halves together. */
  monthlyTotal: number;

  /**
   * The district tax the lender escrows at closing. Twelve months by default,
   * so a district costs a full year of its own tax in cash before move-in.
   */
  districtTaxAtClosing: number;

  /** Combined district rate per $100, for comparison against the other units. */
  combinedRatePer100: number;
  /** District tax as a share of the whole property tax bill. */
  shareOfTaxBill: number;
}

const DISTRICT_KINDS = new Set<TaxingUnit["kind"]>(["mud", "lid"]);

export function isUtilityDistrict(unit: TaxingUnit): boolean {
  return DISTRICT_KINDS.has(unit.kind);
}

/**
 * Works out water service from the tax bill that was actually computed, so
 * the figures always agree with the payment shown rather than being derived a
 * second, slightly different way.
 *
 * `hasParcel` matters: with no parcel picked, the absence of a district means
 * the location preset did not assume one, which is not the same as knowing the
 * address is city-served. Saying "city" there would be a guess.
 */
export function assessWaterService(args: {
  propertyTax: PropertyTaxResult;
  monthlyWaterBill: number;
  hasParcel: boolean;
  unknownRateCodes?: TaxUnitCodeRecord[];
  taxEscrowMonths?: number;
}): WaterServiceAssessment {
  const {
    propertyTax,
    monthlyWaterBill,
    hasParcel,
    unknownRateCodes = [],
    taxEscrowMonths = 12,
  } = args;

  const rows = propertyTax.lineItems.filter((row) => isUtilityDistrict(row.unit));
  const districts = rows.map((row) => row.unit);
  const annualDistrictTax = roundCents(
    rows.reduce((sum, row) => sum + row.annualTax, 0),
  );
  const monthlyDistrictTax = roundCents(annualDistrictTax / 12);

  // A district named on the parcel with no published rate is the one case
  // where the answer is genuinely unknown rather than simply absent.
  const unknownRateDistricts = unknownRateCodes.filter((record) =>
    DISTRICT_KINDS.has(record.kind),
  );

  const service: WaterService =
    districts.length > 0 || unknownRateDistricts.length > 0
      ? unknownRateDistricts.length > 0 && districts.length === 0
        ? "unknown"
        : "district"
      : hasParcel
        ? "city"
        : "unknown";

  return {
    service,
    districts,
    unknownRateDistricts,
    annualDistrictTax,
    monthlyDistrictTax,
    monthlyWaterBill: roundCents(monthlyWaterBill),
    monthlyTotal: roundCents(monthlyDistrictTax + monthlyWaterBill),
    districtTaxAtClosing: roundCents(
      (annualDistrictTax / 12) * taxEscrowMonths,
    ),
    combinedRatePer100: districts.reduce((sum, u) => sum + u.ratePer100, 0),
    shareOfTaxBill:
      propertyTax.annualTax > 0 ? annualDistrictTax / propertyTax.annualTax : 0,
  };
}
