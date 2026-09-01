import type { BuyerProfile, LoanProgramId, PropertyProfile } from "./types";
import { FORT_BEND_LOAN_LIMITS_2026 } from "@/data/loanLimits";

export interface LoanProgram {
  id: LoanProgramId;
  name: string;
  shortName: string;
  /** One-line description of who this is for. */
  pitch: string;
  minDownPaymentFraction: number;
  /** Default down payment to show when the program is selected. */
  defaultDownPaymentFraction: number;
  minCreditScore: number;
  requiresFirstTimeBuyer: boolean;
  /**
   * Income ceiling as a fraction of area median income, or null when the
   * program has no income limit.
   */
  incomeLimitAmiFraction: number | null;
  requiresVeteran: boolean;
  requiresRuralAddress: boolean;
  requiresHomebuyerEducation: boolean;
  /** Loan amount ceiling for this program in Fort Bend County. */
  maxLoanAmount: number | null;
  /**
   * Maximum interested-party (seller) contribution toward closing costs, as a
   * fraction of the purchase price. Conventional limits vary by LTV.
   */
  maxSellerConcessionFraction: number | ((ltv: number) => number);
  mortgageInsuranceKind: "conventional-pmi" | "fha-mip" | "usda-fee" | "none";
  /** Upfront financed fee as a fraction of the base loan amount. */
  upfrontFeeRate: number | ((ctx: UpfrontFeeContext) => number);
  notes: string[];
  sourceUrl: string;
}

export interface UpfrontFeeContext {
  downPaymentFraction: number;
  buyer: BuyerProfile;
}

/**
 * Conventional interested-party contribution limits for a primary residence
 * (Fannie Mae Selling Guide B3-4.1-02).
 */
function conventionalSellerConcessionLimit(ltv: number): number {
  if (ltv > 0.9) return 0.03;
  if (ltv > 0.75) return 0.06;
  return 0.09;
}

export const LOAN_PROGRAMS: Record<LoanProgramId, LoanProgram> = {
  "conv-97": {
    id: "conv-97",
    name: "Conventional 97 (Fannie Mae 97% LTV / Freddie Mac HomeOne)",
    shortName: "Conventional 97",
    pitch:
      "3% down conventional for first-time buyers with no income limit. The fallback when your income is too high for HomeReady.",
    minDownPaymentFraction: 0.03,
    defaultDownPaymentFraction: 0.03,
    minCreditScore: 620,
    requiresFirstTimeBuyer: true,
    incomeLimitAmiFraction: null,
    requiresVeteran: false,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: true,
    maxLoanAmount: FORT_BEND_LOAN_LIMITS_2026.conforming,
    maxSellerConcessionFraction: conventionalSellerConcessionLimit,
    mortgageInsuranceKind: "conventional-pmi",
    upfrontFeeRate: 0,
    notes: [
      "At least one borrower must be a first-time homebuyer (no ownership interest in a principal residence in the past three years).",
      "Must be a fixed-rate loan on a one-unit principal residence.",
      "PMI is cancellable, unlike FHA: request it at 80% LTV, automatic at 78%.",
      "Priced with loan-level price adjustments, so the rate is typically slightly higher than a 20%-down loan.",
    ],
    sourceUrl:
      "https://singlefamily.fanniemae.com/originating-underwriting/mortgage-products/97-ltv-options",
  },

  homeready: {
    id: "homeready",
    name: "Fannie Mae HomeReady",
    shortName: "HomeReady",
    pitch:
      "The best 3%-down loan if your income is at or below 80% of area median: reduced PMI, no LLPA penalty, and a possible $2,500 credit.",
    minDownPaymentFraction: 0.03,
    defaultDownPaymentFraction: 0.03,
    minCreditScore: 620,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: 0.8,
    requiresVeteran: false,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: true,
    maxLoanAmount: FORT_BEND_LOAN_LIMITS_2026.conforming,
    maxSellerConcessionFraction: conventionalSellerConcessionLimit,
    mortgageInsuranceKind: "conventional-pmi",
    upfrontFeeRate: 0,
    notes: [
      "Income must be at or below 80% of the area median income for the property's census tract.",
      "Mortgage insurance coverage is reduced to 25% above 90% LTV, which cuts the monthly premium well below a standard Conventional 97.",
      "Loan-level price adjustments are waived, so the rate is usually better than Conventional 97 at the same credit score.",
      "You do not have to be a first-time buyer, but at least one borrower must complete homeownership education.",
      "Boarder or accessory-unit income can be counted toward qualifying, which no other conventional product allows.",
    ],
    sourceUrl:
      "https://singlefamily.fanniemae.com/originating-underwriting/mortgage-products/homeready-mortgage",
  },

  "home-possible": {
    id: "home-possible",
    name: "Freddie Mac Home Possible",
    shortName: "Home Possible",
    pitch:
      "Freddie Mac's answer to HomeReady. Same 80% AMI limit and reduced PMI; worth quoting both because lender pricing differs.",
    minDownPaymentFraction: 0.03,
    defaultDownPaymentFraction: 0.03,
    minCreditScore: 620,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: 0.8,
    requiresVeteran: false,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: true,
    maxLoanAmount: FORT_BEND_LOAN_LIMITS_2026.conforming,
    maxSellerConcessionFraction: conventionalSellerConcessionLimit,
    mortgageInsuranceKind: "conventional-pmi",
    upfrontFeeRate: 0,
    notes: [
      "Income must be at or below 80% of area median income.",
      "Reduced mortgage insurance coverage, same as HomeReady.",
      "Sweat equity and gift funds are permitted for the entire down payment.",
    ],
    sourceUrl:
      "https://sf.freddiemac.com/working-with-us/origination-underwriting/mortgage-products/home-possible",
  },

  "conv-5": {
    id: "conv-5",
    name: "Conventional 95% LTV",
    shortName: "Conventional 5% down",
    pitch:
      "5% down. A meaningful PMI reduction versus 3% down, and no first-time-buyer requirement.",
    minDownPaymentFraction: 0.05,
    defaultDownPaymentFraction: 0.05,
    minCreditScore: 620,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: null,
    requiresVeteran: false,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: false,
    maxLoanAmount: FORT_BEND_LOAN_LIMITS_2026.conforming,
    maxSellerConcessionFraction: conventionalSellerConcessionLimit,
    mortgageInsuranceKind: "conventional-pmi",
    upfrontFeeRate: 0,
    notes: [
      "Crossing from 97% to 95% LTV moves you into a cheaper PMI band, so the monthly cost falls by more than the extra 2% down would suggest.",
    ],
    sourceUrl:
      "https://singlefamily.fanniemae.com/originating-underwriting/mortgage-products",
  },

  "conv-10": {
    id: "conv-10",
    name: "Conventional 90% LTV",
    shortName: "Conventional 10% down",
    pitch: "10% down. PMI drops to roughly a third of what it costs at 3% down.",
    minDownPaymentFraction: 0.1,
    defaultDownPaymentFraction: 0.1,
    minCreditScore: 620,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: null,
    requiresVeteran: false,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: false,
    maxLoanAmount: FORT_BEND_LOAN_LIMITS_2026.conforming,
    maxSellerConcessionFraction: conventionalSellerConcessionLimit,
    mortgageInsuranceKind: "conventional-pmi",
    upfrontFeeRate: 0,
    notes: [],
    sourceUrl:
      "https://singlefamily.fanniemae.com/originating-underwriting/mortgage-products",
  },

  "conv-20": {
    id: "conv-20",
    name: "Conventional 80% LTV",
    shortName: "Conventional 20% down",
    pitch: "20% down. No mortgage insurance at all, and the best available rate.",
    minDownPaymentFraction: 0.2,
    defaultDownPaymentFraction: 0.2,
    minCreditScore: 620,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: null,
    requiresVeteran: false,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: false,
    maxLoanAmount: FORT_BEND_LOAN_LIMITS_2026.conforming,
    maxSellerConcessionFraction: conventionalSellerConcessionLimit,
    mortgageInsuranceKind: "none",
    upfrontFeeRate: 0,
    notes: [
      "Included as a benchmark. Putting 20% down is almost never the cheapest path for a first-time buyer, because the cash is usually worth more as reserves than as avoided PMI.",
    ],
    sourceUrl:
      "https://singlefamily.fanniemae.com/originating-underwriting/mortgage-products",
  },

  fha: {
    id: "fha",
    name: "FHA 203(b)",
    shortName: "FHA",
    pitch:
      "3.5% down with a credit score as low as 580. The most forgiving option on credit and debt-to-income, but the mortgage insurance never comes off.",
    minDownPaymentFraction: 0.035,
    defaultDownPaymentFraction: 0.035,
    minCreditScore: 580,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: null,
    requiresVeteran: false,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: false,
    maxLoanAmount: FORT_BEND_LOAN_LIMITS_2026.fha,
    maxSellerConcessionFraction: 0.06,
    mortgageInsuranceKind: "fha-mip",
    upfrontFeeRate: 0.0175,
    notes: [
      "Upfront mortgage insurance of 1.75% of the loan is added to your balance at closing.",
      "Annual MIP lasts for the life of the loan whenever you start above 90% LTV, which 3.5% down always does. Escaping it requires a refinance.",
      "Allows a debt-to-income ratio up to roughly 56.9% with compensating factors, well above conventional.",
      "Seller can contribute up to 6% of the price toward your closing costs.",
      "A 10% down payment cuts MIP to 11 years instead of forever.",
    ],
    sourceUrl:
      "https://www.hud.gov/program_offices/housing/sfh/ins/203b--df",
  },

  usda: {
    id: "usda",
    name: "USDA Guaranteed Rural Housing (Section 502)",
    shortName: "USDA",
    pitch:
      "Zero down payment, and the cheapest mortgage insurance of any low-down-payment loan. Only works at an address on the USDA eligibility map.",
    minDownPaymentFraction: 0,
    defaultDownPaymentFraction: 0,
    minCreditScore: 640,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: 1.15,
    requiresVeteran: false,
    requiresRuralAddress: true,
    requiresHomebuyerEducation: false,
    maxLoanAmount: null,
    maxSellerConcessionFraction: 0.06,
    mortgageInsuranceKind: "usda-fee",
    upfrontFeeRate: 0.01,
    notes: [
      "No down payment required, and the 1% upfront guarantee fee can be financed into the loan.",
      "The 0.35% annual fee is roughly a third of what FHA charges and well under PMI at 3% down.",
      "Household income must be at or below 115% of the area median, counting every adult in the house.",
      "The property must sit inside a USDA-eligible area. Parts of southern and western Fort Bend County qualify even though Sugar Land and Missouri City do not.",
      "You may not own another adequate dwelling within commuting distance.",
    ],
    sourceUrl:
      "https://www.rd.usda.gov/programs-services/single-family-housing-programs/single-family-housing-guaranteed-loan-program",
  },

  va: {
    id: "va",
    name: "VA-Guaranteed Home Loan",
    shortName: "VA",
    pitch:
      "Zero down, no mortgage insurance ever, and the lowest rates on the board. Unbeatable if you have entitlement.",
    minDownPaymentFraction: 0,
    defaultDownPaymentFraction: 0,
    minCreditScore: 580,
    requiresFirstTimeBuyer: false,
    incomeLimitAmiFraction: null,
    requiresVeteran: true,
    requiresRuralAddress: false,
    requiresHomebuyerEducation: false,
    maxLoanAmount: null,
    maxSellerConcessionFraction: 0.04,
    mortgageInsuranceKind: "none",
    upfrontFeeRate: (ctx: UpfrontFeeContext) => {
      if (ctx.buyer.vaFundingFeeExempt) return 0;
      if (ctx.downPaymentFraction >= 0.1) return 0.0125;
      if (ctx.downPaymentFraction >= 0.05) return 0.0165;
      return 0.0215;
    },
    notes: [
      "No monthly mortgage insurance at any loan-to-value, which is the single biggest monthly saving available.",
      "The funding fee is waived entirely if you receive VA compensation for a service-connected disability.",
      "No loan limit with full entitlement.",
      "The seller can pay all of your closing costs plus up to 4% in concessions.",
    ],
    sourceUrl:
      "https://www.va.gov/housing-assistance/home-loans/loan-types/",
  },
};

export const LOAN_PROGRAM_ORDER: LoanProgramId[] = [
  "va",
  "usda",
  "homeready",
  "home-possible",
  "conv-97",
  "fha",
  "conv-5",
  "conv-10",
  "conv-20",
];

export type EligibilityStatus = "eligible" | "ineligible" | "needs-check";

export interface EligibilityFinding {
  status: EligibilityStatus;
  reasons: string[];
  /** Things the buyer must confirm externally, like a USDA map lookup. */
  checks: string[];
}

/**
 * Screens a program against the buyer and property. "needs-check" is a
 * deliberate third state: a USDA address or an 80% AMI census tract cannot be
 * determined from the inputs alone, and quietly guessing either way would be
 * worse than telling the buyer exactly what to go look up.
 */
export function checkEligibility(args: {
  program: LoanProgram;
  buyer: BuyerProfile;
  property: PropertyProfile;
  /** Area median income for the household size, if known. */
  areaMedianIncome: number | null;
  /** Whether the address has been confirmed USDA-eligible. */
  usdaAddressConfirmed: boolean | null;
  loanAmount: number;
}): EligibilityFinding {
  const {
    program,
    buyer,
    property,
    areaMedianIncome,
    usdaAddressConfirmed,
    loanAmount,
  } = args;

  const reasons: string[] = [];
  const checks: string[] = [];

  if (buyer.creditScore < program.minCreditScore) {
    reasons.push(
      `Credit score ${buyer.creditScore} is below the ${program.minCreditScore} minimum.`,
    );
  }

  if (program.requiresFirstTimeBuyer && !buyer.firstTimeBuyer) {
    reasons.push(
      "Requires a first-time homebuyer (no principal residence owned in the last three years).",
    );
  }

  if (program.requiresVeteran && !buyer.isVeteran) {
    reasons.push("Requires eligible military service and a VA Certificate of Eligibility.");
  }

  if (program.maxLoanAmount != null && loanAmount > program.maxLoanAmount) {
    reasons.push(
      `Loan amount exceeds the ${program.shortName} ceiling for Fort Bend County.`,
    );
  }

  if (program.incomeLimitAmiFraction != null) {
    if (areaMedianIncome == null) {
      checks.push(
        `Confirm your income is at or below ${Math.round(program.incomeLimitAmiFraction * 100)}% of area median income.`,
      );
    } else {
      const limit = areaMedianIncome * program.incomeLimitAmiFraction;
      const incomeToTest = buyer.annualHouseholdIncome;
      if (incomeToTest > limit) {
        reasons.push(
          `Income of ${Math.round(incomeToTest).toLocaleString()} exceeds the program limit of about ${Math.round(limit).toLocaleString()}.`,
        );
      }
    }
  }

  if (program.requiresRuralAddress) {
    if (usdaAddressConfirmed === false) {
      reasons.push("The address is outside a USDA-eligible area.");
    } else if (usdaAddressConfirmed == null) {
      checks.push(
        "Look the exact address up on the USDA eligibility map before counting on this.",
      );
    }
  }

  if (program.requiresHomebuyerEducation) {
    checks.push("Complete an approved homebuyer education course.");
  }

  if (property.purchasePrice <= 0) {
    reasons.push("Enter a purchase price.");
  }

  if (reasons.length > 0) return { status: "ineligible", reasons, checks };
  if (checks.length > 0) return { status: "needs-check", reasons, checks };
  return { status: "eligible", reasons, checks };
}

export function resolveUpfrontFeeRate(
  program: LoanProgram,
  ctx: UpfrontFeeContext,
): number {
  return typeof program.upfrontFeeRate === "function"
    ? program.upfrontFeeRate(ctx)
    : program.upfrontFeeRate;
}

export function resolveSellerConcessionLimit(
  program: LoanProgram,
  ltv: number,
): number {
  return typeof program.maxSellerConcessionFraction === "function"
    ? program.maxSellerConcessionFraction(ltv)
    : program.maxSellerConcessionFraction;
}
