import type { MortgageInsuranceRule } from "./amortization";

/**
 * Mortgage insurance pricing.
 *
 * Conventional PMI is priced by private insurers (MGIC, Radian, Essent, etc.)
 * off a rate card keyed on LTV band and credit score band. The cards are close
 * to each other but not identical, so the table below is a representative
 * standard-coverage card for a 30-year fixed primary residence. It is the right
 * order of magnitude for shopping purposes and is intentionally overridable in
 * the UI, because the only authoritative number is the one on a real quote.
 *
 * FHA, USDA and VA fees are statutory and are hard numbers.
 */

export type CreditBand =
  | "760+"
  | "740-759"
  | "720-739"
  | "700-719"
  | "680-699"
  | "660-679"
  | "640-659"
  | "620-639";

export const CREDIT_BANDS: { band: CreditBand; min: number; max: number }[] = [
  { band: "760+", min: 760, max: 850 },
  { band: "740-759", min: 740, max: 759 },
  { band: "720-739", min: 720, max: 739 },
  { band: "700-719", min: 700, max: 719 },
  { band: "680-699", min: 680, max: 699 },
  { band: "660-679", min: 660, max: 679 },
  { band: "640-659", min: 640, max: 659 },
  { band: "620-639", min: 620, max: 639 },
];

export function creditBandFor(score: number): CreditBand {
  const match = CREDIT_BANDS.find((b) => score >= b.min);
  return match ? match.band : "620-639";
}

/** LTV bands used by PMI rate cards, expressed as upper bound of the band. */
type LtvBand = "95.01-97" | "90.01-95" | "85.01-90" | "80.01-85";

function ltvBandFor(ltv: number): LtvBand | null {
  const pct = ltv * 100;
  if (pct > 97.0001) return "95.01-97"; // Above 97 should not occur; price at top band.
  if (pct > 95) return "95.01-97";
  if (pct > 90) return "90.01-95";
  if (pct > 85) return "85.01-90";
  if (pct > 80) return "80.01-85";
  return null; // No PMI required at or below 80% LTV.
}

/**
 * Annual PMI rate as a fraction of the loan balance, standard coverage.
 * Source: representative composite of published MGIC / Radian / Essent
 * non-refundable monthly rate cards for 30-year fixed primary residences.
 */
const PMI_STANDARD_COVERAGE: Record<LtvBand, Record<CreditBand, number>> = {
  "95.01-97": {
    "760+": 0.0041,
    "740-759": 0.0055,
    "720-739": 0.0075,
    "700-719": 0.0095,
    "680-699": 0.0113,
    "660-679": 0.0145,
    "640-659": 0.0155,
    "620-639": 0.0165,
  },
  "90.01-95": {
    "760+": 0.0028,
    "740-759": 0.0036,
    "720-739": 0.0048,
    "700-719": 0.0061,
    "680-699": 0.0073,
    "660-679": 0.0095,
    "640-659": 0.0102,
    "620-639": 0.011,
  },
  "85.01-90": {
    "760+": 0.0019,
    "740-759": 0.0023,
    "720-739": 0.003,
    "700-719": 0.0037,
    "680-699": 0.0045,
    "660-679": 0.0058,
    "640-659": 0.0062,
    "620-639": 0.0067,
  },
  "80.01-85": {
    "760+": 0.0014,
    "740-759": 0.0017,
    "720-739": 0.0019,
    "700-719": 0.0023,
    "680-699": 0.0026,
    "660-679": 0.0033,
    "640-659": 0.0036,
    "620-639": 0.0038,
  },
};

/**
 * HomeReady and Home Possible qualify for reduced MI coverage: 25% coverage
 * above 90% LTV instead of the standard 30-35%. Less coverage means a lower
 * premium. This multiplier approximates that discount, which is the single
 * largest reason a low-income-eligible buyer should never take a plain
 * Conventional 97 loan.
 */
const REDUCED_COVERAGE_MULTIPLIER = 0.72;

export interface PmiQuote {
  annualRate: number;
  monthlyPremiumAtOrigination: number;
  ltvBand: LtvBand | null;
  creditBand: CreditBand;
  reducedCoverage: boolean;
}

export function quoteConventionalPmi(args: {
  loanAmount: number;
  propertyValue: number;
  creditScore: number;
  /** True for HomeReady / Home Possible, which get reduced MI coverage. */
  reducedCoverage?: boolean;
  /** Manual override of the annual rate, as a fraction. */
  overrideAnnualRate?: number | null;
}): PmiQuote {
  const {
    loanAmount,
    propertyValue,
    creditScore,
    reducedCoverage = false,
    overrideAnnualRate = null,
  } = args;

  const ltv = propertyValue > 0 ? loanAmount / propertyValue : 0;
  const band = ltvBandFor(ltv);
  const creditBand = creditBandFor(creditScore);

  let annualRate = 0;
  if (overrideAnnualRate != null && overrideAnnualRate >= 0) {
    annualRate = overrideAnnualRate;
  } else if (band) {
    annualRate = PMI_STANDARD_COVERAGE[band][creditBand];
    if (reducedCoverage) annualRate *= REDUCED_COVERAGE_MULTIPLIER;
  }

  return {
    annualRate,
    monthlyPremiumAtOrigination: (loanAmount * annualRate) / 12,
    ltvBand: band,
    creditBand,
    reducedCoverage,
  };
}

/**
 * Conventional PMI termination, per the Homeowners Protection Act of 1998:
 * the borrower may REQUEST cancellation at 80% LTV based on the original
 * amortization schedule, and the servicer MUST terminate automatically at 78%.
 * We model the automatic 78% point so the payment forecast is conservative.
 */
export function conventionalPmiRule(annualRate: number): MortgageInsuranceRule | null {
  if (annualRate <= 0) return null;
  return {
    annualRate,
    terminationLtv: 0.78,
    maxMonths: null,
    basis: "declining-balance",
  };
}

// ---------------------------------------------------------------------------
// FHA
// ---------------------------------------------------------------------------

/** FHA upfront MIP: 1.75% of the base loan amount, normally financed. */
export const FHA_UPFRONT_MIP_RATE = 0.0175;

/**
 * FHA annual MIP rates in effect since the March 2023 reduction
 * (HUD Mortgagee Letter 2023-05), for 30-year terms.
 */
export function fhaAnnualMipRate(args: {
  baseLoanAmount: number;
  ltv: number;
  /** FHA's threshold between "standard" and "high" balance loans. */
  conformingThreshold: number;
}): number {
  const { baseLoanAmount, ltv, conformingThreshold } = args;
  const isHighBalance = baseLoanAmount > conformingThreshold;

  if (isHighBalance) {
    if (ltv > 0.95) return 0.0075;
    return 0.007;
  }
  if (ltv > 0.95) return 0.0055;
  return 0.005;
}

/**
 * FHA MIP duration (HUD Mortgagee Letter 2013-04): when the original LTV
 * exceeds 90%, MIP runs for the full loan term and cannot be cancelled. At or
 * below 90% it runs 11 years. This is the decisive drawback of FHA versus a
 * conventional loan for a buyer who can reach 90% LTV or better, and the reason
 * FHA borrowers so often refinance.
 */
export function fhaMipRule(args: {
  annualRate: number;
  originalLtv: number;
}): MortgageInsuranceRule {
  const { annualRate, originalLtv } = args;
  const cancellable = originalLtv <= 0.9;
  return {
    annualRate,
    terminationLtv: null,
    maxMonths: cancellable ? 132 : null,
    basis: "declining-balance",
  };
}

// ---------------------------------------------------------------------------
// USDA
// ---------------------------------------------------------------------------

/** USDA Guaranteed Rural Housing fees for FY2026. */
export const USDA_UPFRONT_GUARANTEE_FEE_RATE = 0.01;
export const USDA_ANNUAL_FEE_RATE = 0.0035;

/** USDA's annual fee runs for the life of the loan but is unusually cheap. */
export function usdaFeeRule(): MortgageInsuranceRule {
  return {
    annualRate: USDA_ANNUAL_FEE_RATE,
    terminationLtv: null,
    maxMonths: null,
    basis: "declining-balance",
  };
}

// ---------------------------------------------------------------------------
// VA
// ---------------------------------------------------------------------------

/**
 * VA funding fee, first use of entitlement, purchase loan.
 * Borrowers receiving VA compensation for a service-connected disability, and
 * certain surviving spouses, are exempt entirely.
 */
export function vaFundingFeeRate(args: {
  downPaymentFraction: number;
  subsequentUse: boolean;
  exempt: boolean;
}): number {
  const { downPaymentFraction, subsequentUse, exempt } = args;
  if (exempt) return 0;

  if (downPaymentFraction >= 0.1) return subsequentUse ? 0.0125 : 0.0125;
  if (downPaymentFraction >= 0.05) return subsequentUse ? 0.0165 : 0.0165;
  return subsequentUse ? 0.033 : 0.0215;
}
