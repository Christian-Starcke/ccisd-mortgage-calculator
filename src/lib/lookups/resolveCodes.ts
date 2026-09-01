import {
  FORT_BEND_ISD_CODE,
  FORT_BEND_TAX_UNIT_CODES,
  type TaxUnitCodeRecord,
} from "@/data/fortBendTaxUnitCodes";
import type { TaxingUnit } from "@/lib/propertyTax";

export interface ResolvedTaxUnits {
  units: TaxingUnit[];
  missingRateCodes: TaxUnitCodeRecord[];
  isFortBendIsd: boolean;
  schoolCode: string | null;
  schoolName: string | null;
  hasMud: boolean;
}

function recordToUnit(
  record: TaxUnitCodeRecord,
  ratePer100: number,
): TaxingUnit {
  return {
    id: record.code.toLowerCase(),
    name: record.name,
    kind: record.kind,
    ratePer100,
    homesteadFlatExemption: record.homesteadFlatExemption,
    homesteadPercentExemption: record.homesteadPercentExemption,
    taxYear: record.taxYear,
    sourceUrl: `https://taxrateinfo.fortbendcountytx.gov/Home/View_TaxUnit?VarTaxUnitID=${record.code}`,
    note: record.note,
    code: record.code,
    rateUnknown: false,
  };
}

/**
 * Turns FBCAD `taxunits` codes into the TaxingUnit[] the engine already knows
 * how to bill. Codes with no published rate are returned separately so the UI
 * can ask for them instead of silently treating them as zero.
 */
export function resolveUnitsFromCodes(
  codes: string[],
  rateOverrides: Record<string, number> = {},
): ResolvedTaxUnits {
  const units: TaxingUnit[] = [];
  const missingRateCodes: TaxUnitCodeRecord[] = [];
  let schoolCode: string | null = null;
  let schoolName: string | null = null;
  let hasMud = false;

  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (!code || code === "CAD") continue;

    const record = FORT_BEND_TAX_UNIT_CODES[code] ?? {
      code,
      name: `Taxing unit ${code}`,
      kind: kindFromPrefix(code),
      ratePer100: null,
      taxYear: 2025,
      rateUnknown: true,
      note: "This code is not on the county rate table. Enter the rate from the appraisal record.",
    };

    if (record.kind === "school") {
      schoolCode = code;
      schoolName = record.name;
    }
    if (record.kind === "mud" || record.kind === "lid" || code.startsWith("SM")) {
      hasMud = true;
    }

    const override = rateOverrides[code];
    const rate = override ?? record.ratePer100;
    if (rate == null || rate < 0) {
      missingRateCodes.push(record);
      continue;
    }
    if (rate === 0) continue;

    units.push(recordToUnit(record, rate));
  }

  return {
    units,
    missingRateCodes,
    isFortBendIsd: schoolCode === FORT_BEND_ISD_CODE,
    schoolCode,
    schoolName,
    hasMud,
  };
}

export function kindFromPrefix(code: string): TaxUnitCodeRecord["kind"] {
  if (code.startsWith("SM")) return "other";
  if (code.startsWith("S")) return "school";
  if (code.startsWith("G")) return "county";
  if (code.startsWith("D")) return "drainage";
  if (code.startsWith("C")) return "city";
  if (code.startsWith("J")) return "college";
  if (code.startsWith("R")) return "esd";
  if (code.startsWith("M")) return "mud";
  if (code.startsWith("W") || code.startsWith("L")) return "lid";
  return "other";
}

export function inferLocationId(args: {
  codes: string[];
  situs: string;
  hasMud: boolean;
}): string {
  const { codes, situs, hasMud } = args;
  const upper = situs.toUpperCase();
  const set = new Set(codes.map((code) => code.toUpperCase()));

  const cityCode = codes.find((code) => /^C\d+/.test(code.toUpperCase()));
  const cityRecord = cityCode
    ? FORT_BEND_TAX_UNIT_CODES[cityCode.toUpperCase()]
    : undefined;
  const cityName = cityRecord?.name.toUpperCase() ?? "";

  if (cityName.includes("HOUSTON") || set.has("C05")) return "houston-in-fbisd";
  if (cityName.includes("SUGAR LAND") || set.has("C21")) return "sugar-land";
  if (cityName.includes("MISSOURI CITY") || set.has("C09")) return "missouri-city";
  if (cityName.includes("MEADOWS PLACE") || set.has("C08")) return "meadows-place";
  if (cityName.includes("RICHMOND") || set.has("C15")) return "richmond-fbisd";
  if (cityName.includes("ARCOLA") || set.has("C01")) return "rosharon-fbisd";

  if (set.has("R52") || /77583/.test(upper) || /ROSHARON/.test(upper)) {
    return "rosharon-fbisd";
  }
  if (/RICHMOND/.test(upper)) return "richmond-fbisd";
  if (hasMud) return "unincorporated-mud";
  return "unincorporated-no-mud";
}
