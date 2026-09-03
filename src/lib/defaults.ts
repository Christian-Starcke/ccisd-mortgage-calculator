import type { LookupStatus, ResolvedParcel } from "./lookups/types";
import { roundCents } from "./money";
import type { LoanProgramId } from "./types";
import {
  DEFAULT_WINDSTORM_RATE_PER_THOUSAND,
  HOMEOWNERS_RATE_PER_THOUSAND,
} from "./windstorm";
import {
  DEFAULT_ELECTRICITY_RATE_PER_KWH,
  DEFAULT_GAS_MONTHLY,
  DEFAULT_INTERNET_MONTHLY,
  DEFAULT_LIVING_SQFT,
} from "./householdUtilities";

/**
 * Starting assumptions.
 *
 * Every one of these is editable in the UI. They are chosen to be realistic for
 * a first-time buyer in Clear Creek ISD in late 2026 rather than flattering,
 * since a calculator that starts optimistic just moves the disappointment
 * later.
 */

export interface CalculatorState {
  // --- The house ---------------------------------------------------------
  addressQuery: string;
  resolvedParcel: ResolvedParcel | null;
  lookupStatus: LookupStatus;
  lookupError: string | null;
  purchasePrice: number;
  locationId: string;
  utilityDistrictId: string;
  /** Overrides the preset utility district rate, per $100 of value. */
  manualUtilityRatePer100: number | null;
  /** Per-code rate overrides when a parcel unit is missing from the county roll. */
  unknownRateOverrides: Record<string, number>;
  claimHomestead: boolean;
  /**
   * HOA is not in the CAD record. Unknown uses a location-typical estimate;
   * none is $0; known is the listing amount in annualHoaDues.
   */
  hoaCertainty: "unknown" | "none" | "known";
  annualHoaDues: number;
  /** Homeowners premium expressed per $1,000 of dwelling coverage. */
  insuranceRatePerThousand: number;
  /**
   * Separate windstorm premium per $1,000 of dwelling coverage. Applies only
   * inside the designated catastrophe area, which in this district means the
   * Galveston County half plus the part of Seabrook east of Highway 146.
   */
  windstormRatePerThousand: number;
  /**
   * Whether a separate windstorm policy is being assumed. Defaults from the
   * location or the parcel, and stays overridable, because for a Seabrook or
   * Pasadena address eligibility turns on the exact street rather than the
   * city and the buyer may know the answer when the calculator cannot.
   */
  separateWindstormPolicy: boolean;
  /**
   * True while `separateWindstormPolicy` is the calculator's own conservative
   * guess rather than something derived or confirmed, so the UI can ask.
   */
  windstormUncertain: boolean;
  inFloodZone: boolean;
  annualFloodInsurance: number;
  isNewConstruction: boolean;
  /** Tax appraised value, when it differs from the purchase price. */
  taxAppraisedValueOverride: number | null;
  pidAnnualAssessment: number;
  monthlyMudUtility: number;

  // --- Running the house ---------------------------------------------------
  // Estimated separately from the payment and never folded into it: a lender
  // counts none of this, and mixing it in would corrupt DTI and escrow.
  /** Living area, which drives the electricity estimate. From the listing. */
  livingSqFt: number;
  electricityRatePerKwh: number;
  hasNaturalGas: boolean;
  monthlyGas: number;
  monthlyInternet: number;

  // --- You ---------------------------------------------------------------
  annualIncome: number;
  annualHouseholdIncome: number;
  householdSize: number;
  creditScore: number;
  monthlyDebtPayments: number;
  cashAvailable: number;
  firstTimeBuyer: boolean;
  isVeteran: boolean;
  vaFundingFeeExempt: boolean;
  texasHeroProfession: boolean;

  // --- The loan ----------------------------------------------------------
  programId: LoanProgramId;
  interestRate: number;
  termYears: number;
  downPaymentFraction: number;
  mortgageInsuranceRateOverride: number | null;
  discountPoints: number;
  extraMonthlyPrincipal: number;

  // --- Help --------------------------------------------------------------
  selectedAssistanceIds: string[];
  sellerConcessions: number;
  lenderCredit: number;
  giftFunds: number;
  /**
   * When true, the detail panel uses programId + selectedAssistanceIds instead
   * of the auto-ranked answer card. Auto cards still show the engine picks.
   */
  manualOverride: boolean;

  // --- Assumptions -------------------------------------------------------
  annualAppreciationRate: number;
  annualExpenseGrowthRate: number;
  horizonYears: number;
  /** ISO date string for the assumed closing date. */
  closingDateIso: string;
  /**
   * Full (100%) area median income. Each program applies its own multiplier to
   * this, so storing the raw figure keeps the screening logic in one place.
   */
  areaMedianIncome: number | null;
  /** Whether the address has been confirmed on the USDA eligibility map. */
  usdaAddressConfirmed: boolean | null;
  marginalTaxRate: number;
}

export type UpdateState = <K extends keyof CalculatorState>(
  key: K,
  value: CalculatorState[K],
) => void;

/**
 * localStorage key for `usePersistentState`. Bump the suffix when the stored
 * shape cannot be repaired by spreading `DEFAULT_STATE` over the parsed JSON.
 */
export const STORAGE_KEY = "ccisd-mortgage-calculator-v1";

/**
 * Homeowners insurance is written against dwelling coverage, typically about
 * 78% of purchase price, not the full listing price.
 *
 * The rate itself depends on wind exposure and is set per location from
 * `HOMEOWNERS_RATE_PER_THOUSAND` in windstorm.ts, because a policy that
 * excludes wind and hail is a narrower policy and costs less. This constant is
 * only the starting value for the default location.
 *
 * Verify with an actual quote. The spread between carriers on this coast is
 * wider than almost anywhere in the country.
 */
export const DEFAULT_INSURANCE_RATE_PER_THOUSAND =
  HOMEOWNERS_RATE_PER_THOUSAND.designated;

/** Typical dwelling coverage as a fraction of purchase price. */
export const DWELLING_COVERAGE_FRACTION = 0.78;

export function estimateHomeownersInsurance(
  purchasePrice: number,
  ratePerThousand: number,
): number {
  return roundCents(
    ((purchasePrice * DWELLING_COVERAGE_FRACTION) / 1_000) * ratePerThousand,
  );
}

/** Typical monthly utility-district water/sewer bill when a parcel is in one. */
export const DEFAULT_MUD_UTILITY_MONTHLY = 95;

/**
 * Freddie Mac Primary Mortgage Market Survey, week ending August 27, 2026:
 * 30-year fixed averaged 6.66%, 15-year fixed averaged 5.98%.
 * https://www.freddiemac.com/pmms
 */
export const PMMS_30_YEAR = 0.0666;
export const PMMS_15_YEAR = 0.0598;
export const PMMS_AS_OF = "August 27, 2026";

/**
 * Estimated area median family income for the Houston-Pasadena-The Woodlands
 * metro, which covers both Harris and Galveston counties and therefore the
 * whole district. Program eligibility for HomeReady and Home Possible turns on
 * it, and the published figure varies by household size, so confirm the
 * current one with the lender.
 */
export const ESTIMATED_AREA_MEDIAN_INCOME = 105_100;

function defaultClosingDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 2);
  date.setDate(28);
  return date.toISOString().slice(0, 10);
}

export const DEFAULT_STATE: CalculatorState = {
  addressQuery: "",
  resolvedParcel: null,
  lookupStatus: "idle",
  lookupError: null,
  purchasePrice: 400_000,
  locationId: "league-city",
  utilityDistrictId: "none",
  manualUtilityRatePer100: null,
  unknownRateOverrides: {},
  claimHomestead: true,
  hoaCertainty: "unknown",
  annualHoaDues: 0,
  insuranceRatePerThousand: DEFAULT_INSURANCE_RATE_PER_THOUSAND,
  windstormRatePerThousand: DEFAULT_WINDSTORM_RATE_PER_THOUSAND,
  // The default location is League City, which is in the designated area.
  separateWindstormPolicy: true,
  windstormUncertain: false,
  inFloodZone: false,
  annualFloodInsurance: 0,
  isNewConstruction: false,
  taxAppraisedValueOverride: null,
  pidAnnualAssessment: 0,
  monthlyMudUtility: 0,

  livingSqFt: DEFAULT_LIVING_SQFT,
  electricityRatePerKwh: DEFAULT_ELECTRICITY_RATE_PER_KWH,
  // Most homes in this district are all-electric, so gas is off until said.
  hasNaturalGas: false,
  monthlyGas: DEFAULT_GAS_MONTHLY,
  monthlyInternet: DEFAULT_INTERNET_MONTHLY,

  annualIncome: 110_000,
  annualHouseholdIncome: 110_000,
  householdSize: 2,
  creditScore: 740,
  monthlyDebtPayments: 550,
  cashAvailable: 30_000,
  firstTimeBuyer: true,
  isVeteran: false,
  vaFundingFeeExempt: false,
  texasHeroProfession: false,

  programId: "conv-97",
  interestRate: PMMS_30_YEAR,
  termYears: 30,
  downPaymentFraction: 0.03,
  mortgageInsuranceRateOverride: null,
  discountPoints: 0,
  extraMonthlyPrincipal: 0,

  selectedAssistanceIds: [],
  sellerConcessions: 0,
  lenderCredit: 0,
  giftFunds: 0,
  manualOverride: false,

  annualAppreciationRate: 0.03,
  annualExpenseGrowthRate: 0.04,
  horizonYears: 7,
  closingDateIso: defaultClosingDate(),
  areaMedianIncome: ESTIMATED_AREA_MEDIAN_INCOME,
  usdaAddressConfirmed: null,
  marginalTaxRate: 0.22,
};
