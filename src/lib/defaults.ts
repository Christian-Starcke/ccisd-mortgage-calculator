import type { LookupStatus, ResolvedParcel } from "./lookups/types";
import { roundCents } from "./money";
import type { LoanProgramId } from "./types";

/**
 * Starting assumptions.
 *
 * Every one of these is editable in the UI. They are chosen to be realistic for
 * a first-time buyer in Fort Bend ISD in late 2026 rather than flattering, since
 * a calculator that starts optimistic just moves the disappointment later.
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
  inFloodZone: boolean;
  annualFloodInsurance: number;
  isNewConstruction: boolean;
  /** Tax appraised value, when it differs from the purchase price. */
  taxAppraisedValueOverride: number | null;
  pidAnnualAssessment: number;
  monthlyMudUtility: number;

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
export const STORAGE_KEY = "fbisd-mortgage-calculator-v2";

/**
 * Homeowners insurance is written against dwelling coverage, typically about
 * 78% of purchase price, not the full listing price. Applying $9.50 per $1,000
 * of dwelling coverage on a $400,000 home is about $2,964 a year. Verify with
 * an actual quote: Houston-area premiums vary more than 50% between carriers.
 */
export const DEFAULT_INSURANCE_RATE_PER_THOUSAND = 9.5;

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

/** Typical monthly MUD water/sewer bill when a parcel sits in a district. */
export const DEFAULT_MUD_UTILITY_MONTHLY = 110;

/**
 * Freddie Mac Primary Mortgage Market Survey, week ending August 27, 2026:
 * 30-year fixed averaged 6.66%, 15-year fixed averaged 5.98%.
 * https://www.freddiemac.com/pmms
 */
export const PMMS_30_YEAR = 0.0666;
export const PMMS_15_YEAR = 0.0598;
export const PMMS_AS_OF = "August 27, 2026";

/**
 * Estimated area median family income for the Houston-The Woodlands-Sugar Land
 * metro, derived from TSAHC's published 80% figure for Fort Bend County of
 * $84,080. Confirm the current figure for household size with the lender.
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
  locationId: "sugar-land",
  utilityDistrictId: "none",
  manualUtilityRatePer100: null,
  unknownRateOverrides: {},
  claimHomestead: true,
  hoaCertainty: "unknown",
  annualHoaDues: 0,
  insuranceRatePerThousand: DEFAULT_INSURANCE_RATE_PER_THOUSAND,
  inFloodZone: false,
  annualFloodInsurance: 0,
  isNewConstruction: false,
  taxAppraisedValueOverride: null,
  pidAnnualAssessment: 0,
  monthlyMudUtility: 0,

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

  annualAppreciationRate: 0.03,
  annualExpenseGrowthRate: 0.04,
  horizonYears: 7,
  closingDateIso: defaultClosingDate(),
  areaMedianIncome: ESTIMATED_AREA_MEDIAN_INCOME,
  usdaAddressConfirmed: null,
  marginalTaxRate: 0.22,
};
