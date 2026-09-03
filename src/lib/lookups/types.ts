import type { County, TaxUnitCodeRecord, TaxingUnit } from "@/lib/propertyTax";

/**
 * A parcel identifier that says which appraisal district issued it.
 *
 * Clear Creek ISD spans two appraisal districts that number parcels
 * differently — Harris uses a 13-digit account number, Galveston a dashed
 * GEOID — and the two are resolved by completely different paths, so the
 * county always travels with the id. A bare parcel number is ambiguous here.
 */
export interface ParcelRef {
  county: County;
  id: string;
}

export function encodeParcelRef(ref: ParcelRef): string {
  return `${ref.county}:${ref.id}`;
}

export function decodeParcelRef(raw: string): ParcelRef | null {
  const at = raw.indexOf(":");
  if (at <= 0) return null;
  const county = raw.slice(0, at);
  const id = raw.slice(at + 1).trim();
  if (!id) return null;
  if (county !== "harris" && county !== "galveston") return null;
  return { county, id };
}

export interface AddressCandidate {
  ref: ParcelRef;
  situs: string;
  taxUnitCodes: string[];
  totalValue: number | null;
  yearBuilt: number | null;
  livingSqFt: number | null;
  /**
   * How current the record behind this candidate is. Harris is queried live;
   * Galveston is an annual snapshot, and saying so is the honest thing to put
   * next to a candidate a buyer is about to pick.
   */
  vintage: string;
  /**
   * Whether Clear Creek ISD bills the parcel.
   *
   * `false` is a finding: the parcel exists and another district bills it,
   * which a buyer about to discover their Friendswood address is Friendswood
   * ISD needs to see rather than getting an empty result.
   *
   * `null` means nobody could check. Harris candidates get their taxing units
   * from the stored footprint, so if that lookup fails there is no basis for
   * an answer either way — and reporting `false` there would tell a Webster
   * buyer their house is outside the district because a database was down.
   */
  inDistrict: boolean | null;
  /** The school district billing the parcel, when it is not Clear Creek. */
  schoolName: string | null;
}

export interface FloodLookup {
  zone: string | null;
  inSpecialFloodHazardArea: boolean;
}

export interface ResolvedParcel {
  ref: ParcelRef;
  situs: string;
  taxUnitCodes: string[];
  taxingUnits: TaxingUnit[];
  /** Units on the parcel with no published rate. Asked for, never zeroed. */
  missingRateCodes: TaxUnitCodeRecord[];
  /** Overlay zones seen on the parcel and deliberately not billed. */
  nonLevyingCodes: TaxUnitCodeRecord[];
  totalValue: number | null;
  landValue: number | null;
  improvementValue: number | null;
  yearBuilt: number | null;
  livingSqFt: number | null;
  sellerExemptions: string | null;
  centroid: { lon: number; lat: number } | null;
  usdaEligible: boolean | null;
  flood: FloodLookup | null;
  isClearCreekIsd: boolean;
  schoolCodes: string[];
  schoolNames: string[];
  /** True when the appraisal record splits the parcel across school districts. */
  splitBetweenSchoolDistricts: boolean;
  inferredLocationId: string;
  hasUtilityDistrict: boolean;
  /** True when this address sits in the TWIA windstorm catastrophe area. */
  inWindstormArea: boolean;
  vintage: string;
  lookupAt: string;
}

export type LookupStatus =
  | "idle"
  | "searching"
  | "awaiting-pick"
  | "looking-up"
  | "resolved"
  | "outside-ccisd"
  | "error";
