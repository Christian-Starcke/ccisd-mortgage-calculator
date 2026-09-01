import type { TaxingUnit } from "./propertyTax";

export type LoanProgramId =
  | "conv-97"
  | "homeready"
  | "home-possible"
  | "conv-5"
  | "conv-10"
  | "conv-20"
  | "fha"
  | "usda"
  | "va";

/** Everything about the buyer that drives eligibility and pricing. */
export interface BuyerProfile {
  /** Gross annual household income used for DTI. */
  annualIncome: number;
  /**
   * Qualifying income for program income limits. Some programs count only
   * borrower income, others count total household income; kept separate so the
   * distinction is visible rather than silently assumed.
   */
  annualHouseholdIncome: number;
  householdSize: number;
  creditScore: number;
  /** Total monthly minimum payments on all other debts (cars, cards, loans). */
  monthlyDebtPayments: number;
  /** Liquid cash the buyer can actually bring to closing. */
  cashAvailable: number;
  /**
   * True if the buyer has not owned a principal residence in the previous three
   * years, which is the IRS / HUD definition used by essentially every
   * first-time buyer program.
   */
  firstTimeBuyer: boolean;
  isVeteran: boolean;
  vaFundingFeeExempt: boolean;
  /**
   * Employed in a TSAHC "Texas Hero" profession: teacher, teacher aide, school
   * librarian, school counselor, school nurse, police officer, public security
   * officer, fire fighter, EMS personnel, corrections officer, juvenile
   * corrections officer, county jailer, or veteran.
   */
  texasHeroProfession: boolean;
}

/** Everything about the property and its location. */
export interface PropertyProfile {
  purchasePrice: number;
  /**
   * The appraised value the tax office will use. Defaults to purchase price,
   * which is the usual outcome in the first full tax year after a sale, but is
   * separable because a buyer who negotiates below market may be appraised
   * lower, and a protest can move it.
   */
  taxAppraisedValue: number;
  /** Selected Fort Bend location preset id. */
  locationId: string;
  /** Taxing units that apply, resolved from the location. */
  taxingUnits: TaxingUnit[];
  claimHomestead: boolean;
  annualHoaDues: number;
  /** True when HOA is a location-typical estimate rather than a listing figure. */
  hoaEstimated: boolean;
  annualHomeownersInsurance: number;
  annualFloodInsurance: number;
  /** True when the address is inside a FEMA Special Flood Hazard Area. */
  inFloodZone: boolean;
  isNewConstruction: boolean;
  /**
   * Public Improvement District assessment, a fixed dollar amount that is not
   * reduced by homestead exemptions.
   */
  pidAnnualAssessment: number;
  /**
   * Monthly water/sewer bill charged by a MUD, separate from the MUD tax.
   * Typical Fort Bend range is $80–$150.
   */
  monthlyMudUtility: number;
}

/** Loan terms the buyer is shopping. */
export interface LoanTerms {
  programId: LoanProgramId;
  /** Nominal annual interest rate as a fraction, e.g. 0.0625. */
  interestRate: number;
  termYears: number;
  /** Down payment as a fraction of purchase price. */
  downPaymentFraction: number;
  /** Manual override of the annual mortgage insurance rate, as a fraction. */
  mortgageInsuranceRateOverride: number | null;
  /** Discount points paid at closing to buy the rate down, as a percent of loan. */
  discountPoints: number;
  /** Extra principal applied every month from day one. */
  extraMonthlyPrincipal: number;
}

/** Money coming from someone other than the buyer. */
export interface AssistanceInputs {
  /** Selected assistance program ids the buyer intends to use. */
  selectedProgramIds: string[];
  /** Seller-paid closing costs, in dollars. */
  sellerConcessions: number;
  /** Lender credit toward closing costs, in dollars. */
  lenderCredit: number;
  /** Gift funds from family, in dollars. */
  giftFunds: number;
  /** Whether the buyer will claim a Mortgage Credit Certificate. */
  useMortgageCreditCertificate: boolean;
}

export interface CalculatorInputs {
  buyer: BuyerProfile;
  property: PropertyProfile;
  loan: LoanTerms;
  assistance: AssistanceInputs;
  /** Assumed annual home appreciation, as a fraction, for projections. */
  annualAppreciationRate: number;
  /** Assumed annual growth in taxes/insurance/HOA, as a fraction. */
  annualExpenseGrowthRate: number;
}

export interface MonthlyPaymentBreakdown
{
  principalAndInterest: number;
  propertyTax: number;
  homeownersInsurance: number;
  floodInsurance: number;
  mortgageInsurance: number;
  hoa: number;
  /** MUD water and sewer bill, separate from the MUD property tax. */
  mudUtility: number;
  /** Public Improvement District assessment, spread monthly. */
  pidAssessment: number;
  /** Payment on any repayable down payment assistance second lien. */
  assistanceSecondLien: number;
  total: number;
  /** Total less the value of a Mortgage Credit Certificate, spread monthly. */
  totalAfterTaxCredit: number;
}

export interface CashToCloseBreakdown {
  downPayment: number;
  closingCosts: number;
  prepaidsAndEscrow: number;
  discountPointsCost: number;
  totalRequired: number;

  sellerConcessions: number;
  lenderCredit: number;
  giftFunds: number;
  assistanceFunds: number;
  totalCredits: number;

  /** What the buyer actually writes a check for. Can be zero or negative. */
  netCashDue: number;
  /** Cash left over after closing, given cashAvailable. */
  cashRemaining: number;
  shortfall: number;
}
