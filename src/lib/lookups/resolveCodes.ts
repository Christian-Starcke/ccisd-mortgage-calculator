import {
  CLEAR_CREEK_ISD_GALVESTON_CODE,
  GALVESTON_NON_RATE_PREFIXES,
  GALVESTON_RATES_SOURCE_URL,
  GALVESTON_TAX_UNIT_CODES,
} from "@/data/galvestonTaxUnitCodes";
import {
  CLEAR_CREEK_ISD_HARRIS_CODE,
  HARRIS_TAX_UNIT_CODES,
} from "@/data/harrisTaxUnitCodes";
import type {
  County,
  TaxUnitCodeRecord,
  TaxingUnit,
  TaxingUnitKind,
} from "@/lib/propertyTax";

const HARRIS_PORTAL = "https://www.hctax.net/Property/JurisdictionTaxRates";

export interface ResolvedTaxUnits {
  units: TaxingUnit[];
  /** Units on the parcel with no published rate. Never billed as zero. */
  missingRateCodes: TaxUnitCodeRecord[];
  /**
   * Overlays recorded on the parcel that levy nothing: reinvestment zones and,
   * on the Galveston side, the assessment zones inferred from their code
   * prefix. Surfaced so the buyer can see they were seen and skipped.
   */
  nonLevyingCodes: TaxUnitCodeRecord[];
  isClearCreekIsd: boolean;
  /**
   * Every school district billing the parcel. More than one means the parcel
   * straddles a district line and the appraisal record apportions it, which
   * this calculator does not model.
   */
  schoolCodes: string[];
  schoolNames: string[];
  hasUtilityDistrict: boolean;
  county: County;
}

function table(county: County): Record<string, TaxUnitCodeRecord> {
  return county === "harris" ? HARRIS_TAX_UNIT_CODES : GALVESTON_TAX_UNIT_CODES;
}

/**
 * Where a unit's rate was published. Per county rather than per unit: Harris
 * puts every jurisdiction on one table and Galveston puts the whole county in
 * one PDF, so neither has a per-unit page to link to.
 */
function sourceUrl(county: County): string {
  return county === "harris" ? HARRIS_PORTAL : GALVESTON_RATES_SOURCE_URL;
}

function clearCreekCode(county: County): string {
  return county === "harris"
    ? CLEAR_CREEK_ISD_HARRIS_CODE
    : CLEAR_CREEK_ISD_GALVESTON_CODE;
}

function recordToUnit(
  record: TaxUnitCodeRecord,
  ratePer100: number,
  county: County,
): TaxingUnit {
  return {
    id: `${county}-${record.code.toLowerCase()}`,
    name: record.name,
    kind: record.kind,
    ratePer100,
    homesteadFlatExemption: record.homesteadFlatExemption,
    homesteadPercentExemption: record.homesteadPercentExemption,
    taxYear: record.taxYear,
    sourceUrl: sourceUrl(county),
    note: record.note,
    code: record.code,
    county,
    rateUnknown: false,
  };
}

/**
 * One taxing unit, looked up by its county and code.
 *
 * This is what lets the location presets be built from the generated rate
 * tables instead of restating rates alongside them. There is one copy of every
 * rate in this project, and it is the one the generator wrote.
 *
 * Returns null for a code with no published rate, so a caller composing a
 * preset cannot accidentally bill an unknown unit at zero.
 */
export function unitFromCode(county: County, code: string): TaxingUnit | null {
  const record = table(county)[code.toUpperCase()];
  if (!record || record.nonLevying) return null;
  if (record.ratePer100 == null) return null;
  return recordToUnit(record, record.ratePer100, county);
}

/** Same, but throws on a missing code, for module-level preset construction. */
export function requireUnit(county: County, code: string): TaxingUnit {
  const unit = unitFromCode(county, code);
  if (!unit) {
    throw new Error(
      `No published rate for ${county} taxing unit ${code}. Re-run the rate generator.`,
    );
  }
  return unit;
}

/**
 * Galveston records overlay zones as bare codes that are absent from the rate
 * table entirely, unlike a utility district whose rate is simply blank. The
 * prefix is the only available signal, so this inference is unverified and the
 * caller is expected to say so.
 */
function isGalvestonOverlay(code: string): boolean {
  if (GALVESTON_TAX_UNIT_CODES[code]) return false;
  return GALVESTON_NON_RATE_PREFIXES.some((p) => code.startsWith(p));
}

export function kindFromCode(county: County, code: string): TaxingUnitKind {
  if (county === "galveston") {
    if (code.startsWith("S")) return "school";
    if (code.startsWith("C")) return "city";
    if (code.startsWith("D")) return "drainage";
    if (code.startsWith("F")) return "esd";
    if (code.startsWith("J")) return "college";
    if (code.startsWith("M")) return "mud";
    if (code.startsWith("W")) return "lid";
    if (code.startsWith("N")) return "navigation";
    if (isGalvestonOverlay(code)) return "zone";
    return "other";
  }
  // Harris codes are numeric and carry no kind, so an unknown one can only be
  // classified once its name is known. Until then it is simply unknown.
  return "other";
}

/**
 * Turns the appraisal district's taxing-unit codes into the TaxingUnit[] the
 * engine already knows how to bill.
 *
 * Codes with no published rate come back in `missingRateCodes` so the UI can
 * ask for them rather than silently treating them as zero, which would
 * understate the payment on exactly the new-construction parcels where a MUD
 * matters most.
 */
export function resolveUnitsFromCodes(
  county: County,
  codes: string[],
  rateOverrides: Record<string, number> = {},
): ResolvedTaxUnits {
  const catalog = table(county);
  const units: TaxingUnit[] = [];
  const missingRateCodes: TaxUnitCodeRecord[] = [];
  const nonLevyingCodes: TaxUnitCodeRecord[] = [];
  const schoolCodes: string[] = [];
  const schoolNames: string[] = [];
  let hasUtilityDistrict = false;

  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    // Both districts stamp their own appraisal-district code on every parcel.
    if (!code || code === "CAD") continue;

    const known = catalog[code];
    const record: TaxUnitCodeRecord =
      known ??
      (isGalvestonOverlay(code)
        ? {
            code,
            name: `Assessment or reinvestment zone ${code}`,
            kind: "zone",
            ratePer100: 0,
            taxYear: 2025,
            nonLevying: true,
            note: "Recorded on the parcel but absent from the county rate table. Codes in this range are reinvestment and assessment zones, which normally levy nothing of their own — but that is inferred from the code, not confirmed. If your closing disclosure shows an assessment you do not recognise, ask the appraisal district about this one.",
          }
        : {
            code,
            name: `Taxing unit ${code}`,
            kind: kindFromCode(county, code),
            ratePer100: null,
            taxYear: 2025,
            rateUnknown: true,
            note: "This code is not on the county rate table. Enter the rate from the appraisal record.",
          });

    if (record.kind === "school") {
      schoolCodes.push(code);
      schoolNames.push(record.name);
    }
    if (record.kind === "mud" || record.kind === "lid") {
      hasUtilityDistrict = true;
    }

    if (record.nonLevying) {
      nonLevyingCodes.push(record);
      continue;
    }

    const override = rateOverrides[code];
    const rate = override ?? record.ratePer100;
    if (rate == null || rate < 0) {
      missingRateCodes.push(record);
      continue;
    }
    // A genuine zero rate, like Clear Lake Shores, is not a missing rate. It
    // is still dropped from the bill because it bills nothing, but it is not
    // something to go ask about.
    if (rate === 0) continue;

    units.push(recordToUnit(record, rate, county));
  }

  return {
    units,
    missingRateCodes,
    nonLevyingCodes,
    isClearCreekIsd: schoolCodes.includes(clearCreekCode(county)),
    schoolCodes,
    schoolNames,
    hasUtilityDistrict,
    county,
  };
}

/**
 * Picks the location preset that best matches a parcel, used to seed the
 * non-tax assumptions a preset carries (HOA midpoint, windstorm exposure)
 * once real tax units have already come from the parcel itself.
 */
export function inferLocationId(args: {
  county: County;
  codes: string[];
  situs: string;
  hasUtilityDistrict: boolean;
}): string {
  const { county, codes, situs, hasUtilityDistrict } = args;
  const set = new Set(codes.map((c) => c.trim().toUpperCase()));
  const upper = situs.toUpperCase();

  if (county === "galveston") {
    if (set.has("C40")) return "league-city";
    if (set.has("C38")) return "kemah";
    if (set.has("C46")) return "clear-lake-shores";
    if (set.has("C37")) return "friendswood-ccisd";
    if (/BACLIFF|SAN LEON/.test(upper)) return "unincorporated-galveston";
    return "unincorporated-galveston";
  }

  if (set.has("084")) return "webster";
  if (set.has("076")) return "seabrook";
  if (set.has("073")) return "nassau-bay";
  if (set.has("056")) return "el-lago";
  if (set.has("082")) return "taylor-lake-village";
  if (set.has("058")) return "friendswood-ccisd";
  if (set.has("074")) return "pasadena-ccisd";
  if (set.has("067")) return "league-city";
  if (set.has("061")) return "houston-clear-lake";
  return hasUtilityDistrict
    ? "unincorporated-harris-mud"
    : "unincorporated-harris";
}
