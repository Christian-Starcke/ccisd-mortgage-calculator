import { roundCents } from "./money";

/**
 * Texas property tax modeling.
 *
 * Texas is unusual in two ways that make a generic "tax rate %" input useless:
 *
 * 1. A home is taxed by several independent units (school district, county,
 *    drainage, city, community college, MUD/LID) that each adopt their own rate.
 * 2. Homestead exemptions are applied PER UNIT and differ per unit. The school
 *    district exemption in particular is a large flat dollar amount, so its
 *    effect on the total bill depends entirely on the home's value.
 *
 * Modeling the units separately is what lets the calculator show the real
 * difference between an established neighborhood and a new-construction MUD.
 *
 * Clear Creek ISD adds a third wrinkle: it straddles Harris and Galveston
 * counties, which code the same district differently (`027` vs `S16`) and bill
 * a different set of countywide units on either side of the line. Units are
 * therefore always carried with the county that published the rate.
 */

export type TaxingUnitKind =
  | "school"
  | "county"
  | "drainage"
  | "city"
  | "college"
  | "mud"
  | "lid"
  | "esd"
  | "hospital"
  | "education"
  | "port"
  | "navigation"
  /**
   * A tax increment reinvestment zone or similar overlay. Recorded on the
   * parcel but levying nothing of its own, so it never adds to the bill.
   */
  | "zone"
  | "other";

/** Which appraisal district published a unit. */
export type County = "harris" | "galveston";

/**
 * A taxing unit as its appraisal district publishes it, before it is attached
 * to a particular home. The generated per-county tables are maps of these.
 */
export interface TaxUnitCodeRecord {
  code: string;
  name: string;
  kind: TaxingUnitKind;
  /** Adopted rate per $100 of taxable value, or null when unpublished. */
  ratePer100: number | null;
  taxYear: number;
  maintenanceRate?: number;
  debtRate?: number;
  homesteadFlatExemption?: number;
  homesteadPercentExemption?: number;
  /**
   * Fraction of the county's Clear Creek ISD parcels this unit bills. 1 is an
   * always-on countywide unit; a small share is subdivision-specific.
   */
  footprintShare?: number;
  /** True for overlays that are recorded on a parcel but levy nothing. */
  nonLevying?: boolean;
  /** True when no adopted rate is published for this unit. */
  rateUnknown?: boolean;
  note?: string;
}

export interface TaxingUnit {
  id: string;
  name: string;
  kind: TaxingUnitKind;
  /**
   * Adopted rate expressed per $100 of taxable value, which is how Texas
   * publishes it. A rate of 0.9892 means $0.9892 per $100, i.e. 0.9892%.
   */
  ratePer100: number;
  /** Flat dollar homestead exemption granted by this unit. */
  homesteadFlatExemption?: number;
  /**
   * Optional percentage homestead exemption as a fraction (0.20 = 20%).
   * Texas law floors a percentage exemption at $5,000, which is applied here.
   */
  homesteadPercentExemption?: number;
  /** Tax year the rate was adopted for, surfaced in the UI for auditability. */
  taxYear: number;
  sourceUrl?: string;
  note?: string;
  /** Appraisal-district unit code, when this unit came from a parcel lookup. */
  code?: string;
  /** Which appraisal district published this unit's rate. */
  county?: County;
  /** True when the county does not publish a rate for this unit. */
  rateUnknown?: boolean;
}

export interface TaxingUnitBill {
  unit: TaxingUnit;
  appraisedValue: number;
  exemptionApplied: number;
  taxableValue: number;
  annualTax: number;
  /** This unit's rate as a fraction of appraised value, for comparison. */
  effectiveRateOnAppraised: number;
}

export interface PropertyTaxResult {
  appraisedValue: number;
  homesteadApplied: boolean;
  lineItems: TaxingUnitBill[];
  annualTax: number;
  monthlyTax: number;
  /** Combined nominal rate, before exemptions, as a fraction. */
  combinedNominalRate: number;
  /** Actual tax divided by appraised value, after exemptions, as a fraction. */
  effectiveRate: number;
  /** Annual dollars saved by the homestead exemptions. */
  homesteadSavings: number;
}

/**
 * Texas Tax Code 11.13(n): a local optional percentage homestead exemption
 * must be worth at least $5,000.
 */
const MIN_PERCENT_EXEMPTION_DOLLARS = 5_000;

function exemptionForUnit(unit: TaxingUnit, appraisedValue: number): number {
  const flat = unit.homesteadFlatExemption ?? 0;

  let percent = 0;
  if (unit.homesteadPercentExemption && unit.homesteadPercentExemption > 0) {
    percent = Math.max(
      appraisedValue * unit.homesteadPercentExemption,
      MIN_PERCENT_EXEMPTION_DOLLARS,
    );
  }

  return Math.min(flat + percent, appraisedValue);
}

export function calculatePropertyTax(args: {
  appraisedValue: number;
  units: TaxingUnit[];
  /** Whether the buyer will file and receive a homestead exemption. */
  claimHomestead: boolean;
}): PropertyTaxResult {
  const { appraisedValue, units, claimHomestead } = args;

  const lineItems: TaxingUnitBill[] = units.map((unit) => {
    const exemptionApplied = claimHomestead
      ? exemptionForUnit(unit, appraisedValue)
      : 0;
    const taxableValue = Math.max(0, appraisedValue - exemptionApplied);
    const annualTax = roundCents((taxableValue * unit.ratePer100) / 100);

    return {
      unit,
      appraisedValue,
      exemptionApplied,
      taxableValue,
      annualTax,
      effectiveRateOnAppraised:
        appraisedValue > 0 ? annualTax / appraisedValue : 0,
    };
  });

  const annualTax = roundCents(
    lineItems.reduce((sum, row) => sum + row.annualTax, 0),
  );

  const combinedNominalRate =
    units.reduce((sum, unit) => sum + unit.ratePer100, 0) / 100;

  const taxWithoutHomestead = roundCents(appraisedValue * combinedNominalRate);

  return {
    appraisedValue,
    homesteadApplied: claimHomestead,
    lineItems,
    annualTax,
    monthlyTax: roundCents(annualTax / 12),
    combinedNominalRate,
    effectiveRate: appraisedValue > 0 ? annualTax / appraisedValue : 0,
    homesteadSavings: roundCents(Math.max(0, taxWithoutHomestead - annualTax)),
  };
}

/**
 * Projects appraised value forward under the Texas homestead appraisal cap.
 *
 * Texas Tax Code 23.23 limits the annual increase in a homesteaded property's
 * appraised value to 10% plus the value of new improvements. The cap does NOT
 * apply in the first year of ownership: a newly purchased home is typically
 * reappraised to market (often the purchase price) for the following tax year,
 * and only after the owner has held the homestead for a full year does the cap
 * begin to bite.
 *
 * @param marketGrowthRate Assumed annual market appreciation as a fraction.
 * @param capActive Whether the 10% homestead cap applies for these years.
 */
export function projectAppraisedValues(args: {
  startingValue: number;
  years: number;
  marketGrowthRate: number;
  capActive: boolean;
  /** Years of ownership before cap protection begins. Purchase year plus two is the honest Texas planning assumption. */
  yearsBeforeCapApplies?: number;
}): number[] {
  const {
    startingValue,
    years,
    marketGrowthRate,
    capActive,
    yearsBeforeCapApplies = 2,
  } = args;

  const values: number[] = [];
  let appraised = startingValue;
  let market = startingValue;

  for (let year = 1; year <= years; year += 1) {
    market = market * (1 + marketGrowthRate);

    if (capActive && year > yearsBeforeCapApplies) {
      appraised = Math.min(market, appraised * 1.1);
    } else {
      appraised = market;
    }

    values.push(roundCents(appraised));
  }

  return values;
}
