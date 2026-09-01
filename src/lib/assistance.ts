import { monthlyPrincipalAndInterest } from "./amortization";
import { roundCents } from "./money";
import type { BuyerProfile, LoanProgramId, PropertyProfile } from "./types";

/**
 * Down payment assistance and cost-reduction program modeling.
 *
 * The structure of the help matters as much as the amount. A $15,000 grant and
 * a $15,000 repayable second lien both cover the same closing costs, but one is
 * free and the other adds a monthly payment that counts against your
 * debt-to-income ratio and therefore reduces how much house you qualify for.
 * The `kind` field is what drives that distinction throughout the app.
 */

export type AssistanceKind =
  /** Never repaid under any circumstances. */
  | "grant"
  /** Second lien with no payments that is forgiven over time if you stay. */
  | "forgivable-second"
  /** Second lien with no payments, repaid in full on sale or refinance. */
  | "deferred-second"
  /** Second lien with a monthly payment. */
  | "repayable-second"
  /** Annual federal income tax credit. */
  | "tax-credit"
  /** Credit applied at closing by a lender or builder. */
  | "closing-credit";

export type BenefitBasis =
  | "percent-of-loan-amount"
  | "percent-of-purchase-price"
  | "fixed-amount";

export interface AssistanceEligibility {
  /** Maximum household income, in dollars, or null for no limit. */
  maxHouseholdIncome: number | null;
  /** If set, used when householdSize is 3 or more. */
  maxHouseholdIncomeHouseholdsOf3OrMore?: number | null;
  /** Maximum purchase price, in dollars, or null for no limit. */
  maxPurchasePrice: number | null;
  minCreditScore: number | null;
  maxDti: number | null;
  requiresFirstTimeBuyer: boolean;
  requiresTexasHeroProfession: boolean;
  requiresVeteran: boolean;
  requiresHomebuyerEducation: boolean;
  /** Loan programs this assistance can be paired with. */
  compatibleLoanPrograms: LoanProgramId[];
  /** Location preset ids this is available in, or null for countywide. */
  eligibleLocationIds: string[] | null;
  /** Free-text conditions the buyer must verify themselves. */
  manualChecks: string[];
}

export interface AssistanceProgram {
  id: string;
  name: string;
  administrator: string;
  url: string;
  kind: AssistanceKind;
  benefitBasis: BenefitBasis;
  /** Percent as a fraction, or a dollar amount when basis is fixed-amount. */
  benefitValue: number;
  /** Cap on the benefit in dollars, or null for uncapped. */
  maxBenefit: number | null;
  /** Years until a forgivable second is fully forgiven. */
  forgivenessYears: number | null;
  /** Interest rate on a repayable second, as a fraction. */
  secondLienRate: number | null;
  secondLienTermMonths: number | null;
  /**
   * For tax credits: the fraction of annual mortgage interest credited, and the
   * annual dollar cap.
   */
  taxCreditRate: number | null;
  taxCreditAnnualCap: number | null;
  /**
   * Added to the first-mortgage interest rate when this program is used.
   * Grants are funded by a rate spread; deferred seconds often are not.
   */
  ratePremium: number | null;
  eligibility: AssistanceEligibility;
  /** Whether stacking with other programs here is permitted. */
  stackable: boolean;
  /** Program ids that specifically cannot be combined with this one. */
  excludes: string[];
  status: "active" | "waitlist" | "unverified" | "closed";
  summary: string;
  notes: string[];
  /** How confident we are in the figures, surfaced in the UI. */
  confidence: "verified" | "likely" | "needs-verification";
}

export interface AssistanceAward {
  program: AssistanceProgram;
  /** Dollars available at closing from this program. */
  fundsAtClosing: number;
  /** Monthly payment created, if any. */
  monthlyPayment: number;
  /** Balance of any second lien created. */
  secondLienBalance: number;
  /** Annual value of a tax credit, if any. */
  annualTaxCredit: number;
  /** True when repayment is owed on sale/refi rather than forgiven. */
  repayableOnExit: boolean;
  forgivenessYears: number | null;
}

export interface AssistanceEvaluation {
  program: AssistanceProgram;
  eligible: boolean;
  blockers: string[];
  manualChecks: string[];
  /** Award if the buyer used it, computed regardless of eligibility. */
  potentialAward: AssistanceAward;
}

export function computeAward(args: {
  program: AssistanceProgram;
  purchasePrice: number;
  loanAmount: number;
  annualInterestAtOrigination: number;
}): AssistanceAward {
  const { program, purchasePrice, loanAmount, annualInterestAtOrigination } =
    args;

  let raw = 0;
  switch (program.benefitBasis) {
    case "percent-of-loan-amount":
      raw = loanAmount * program.benefitValue;
      break;
    case "percent-of-purchase-price":
      raw = purchasePrice * program.benefitValue;
      break;
    case "fixed-amount":
      raw = program.benefitValue;
      break;
  }

  const capped =
    program.maxBenefit != null ? Math.min(raw, program.maxBenefit) : raw;

  const isTaxCredit = program.kind === "tax-credit";
  const fundsAtClosing = isTaxCredit ? 0 : roundCents(capped);

  let monthlyPayment = 0;
  let secondLienBalance = 0;

  if (program.kind === "repayable-second") {
    secondLienBalance = fundsAtClosing;
    monthlyPayment = roundCents(
      monthlyPrincipalAndInterest(
        secondLienBalance,
        program.secondLienRate ?? 0,
        program.secondLienTermMonths ?? 360,
      ),
    );
  } else if (
    program.kind === "forgivable-second" ||
    program.kind === "deferred-second"
  ) {
    secondLienBalance = fundsAtClosing;
    monthlyPayment = 0;
  }

  let annualTaxCredit = 0;
  if (isTaxCredit) {
    const rate = program.taxCreditRate ?? 0;
    const cap = program.taxCreditAnnualCap;
    const uncapped = annualInterestAtOrigination * rate;
    annualTaxCredit = roundCents(
      cap == null ? uncapped : Math.min(uncapped, cap),
    );
  }

  return {
    program,
    fundsAtClosing,
    monthlyPayment,
    secondLienBalance,
    annualTaxCredit,
    repayableOnExit:
      program.kind === "deferred-second" || program.kind === "repayable-second",
    forgivenessYears: program.forgivenessYears,
  };
}

export function evaluateAssistance(args: {
  program: AssistanceProgram;
  buyer: BuyerProfile;
  property: PropertyProfile;
  loanProgramId: LoanProgramId;
  purchasePrice: number;
  loanAmount: number;
  annualInterestAtOrigination: number;
  frontEndDti: number;
  backEndDti: number;
}): AssistanceEvaluation {
  const {
    program,
    buyer,
    property,
    loanProgramId,
    purchasePrice,
    loanAmount,
    annualInterestAtOrigination,
    backEndDti,
  } = args;

  const e = program.eligibility;
  const blockers: string[] = [];

  const incomeLimit =
    e.maxHouseholdIncomeHouseholdsOf3OrMore != null && buyer.householdSize >= 3
      ? e.maxHouseholdIncomeHouseholdsOf3OrMore
      : e.maxHouseholdIncome;
  if (incomeLimit != null && buyer.annualHouseholdIncome > incomeLimit) {
    blockers.push(
      `Household income above the program limit of $${incomeLimit.toLocaleString()}.`,
    );
  }
  if (e.maxPurchasePrice != null && purchasePrice > e.maxPurchasePrice) {
    blockers.push(
      `Purchase price above the program limit of $${e.maxPurchasePrice.toLocaleString()}.`,
    );
  }
  if (e.minCreditScore != null && buyer.creditScore < e.minCreditScore) {
    blockers.push(`Requires a credit score of at least ${e.minCreditScore}.`);
  }
  if (e.maxDti != null && backEndDti > e.maxDti) {
    blockers.push(
      `Debt-to-income of ${(backEndDti * 100).toFixed(1)}% exceeds the program maximum of ${(e.maxDti * 100).toFixed(0)}%.`,
    );
  }
  if (e.requiresFirstTimeBuyer && !buyer.firstTimeBuyer) {
    blockers.push("Restricted to first-time homebuyers.");
  }
  if (e.requiresTexasHeroProfession && !buyer.texasHeroProfession) {
    blockers.push("Restricted to eligible Texas Hero professions.");
  }
  if (e.requiresVeteran && !buyer.isVeteran) {
    blockers.push("Restricted to veterans.");
  }
  if (
    e.compatibleLoanPrograms.length > 0 &&
    !e.compatibleLoanPrograms.includes(loanProgramId)
  ) {
    blockers.push("Not compatible with the selected loan program.");
  }
  if (
    e.eligibleLocationIds != null &&
    !e.eligibleLocationIds.includes(property.locationId)
  ) {
    blockers.push("Not available at the selected location.");
  }
  if (program.status === "closed") {
    blockers.push("Program is not currently accepting applications.");
  }

  return {
    program,
    eligible: blockers.length === 0,
    blockers,
    manualChecks: e.manualChecks,
    potentialAward: computeAward({
      program,
      purchasePrice,
      loanAmount,
      annualInterestAtOrigination,
    }),
  };
}

/**
 * Picks a legal combination of the buyer's selected programs.
 *
 * Assistance programs are mostly mutually exclusive: a bond-backed first
 * mortgage with DPA from one agency cannot also carry DPA from another. A
 * Mortgage Credit Certificate is the notable exception, since it is a tax credit
 * rather than cash, so it layers on top of a cash program.
 */
export function resolveStack(
  evaluations: AssistanceEvaluation[],
  selectedIds: string[],
): { accepted: AssistanceEvaluation[]; rejected: { evaluation: AssistanceEvaluation; reason: string }[] } {
  const selected = evaluations.filter(
    (ev) => selectedIds.includes(ev.program.id) && ev.eligible,
  );

  const accepted: AssistanceEvaluation[] = [];
  const rejected: { evaluation: AssistanceEvaluation; reason: string }[] = [];

  // Tax credits never conflict with cash assistance.
  const taxCredits = selected.filter((ev) => ev.program.kind === "tax-credit");
  const cashPrograms = selected.filter((ev) => ev.program.kind !== "tax-credit");

  accepted.push(...taxCredits);

  // Among cash programs, keep the largest award and reject conflicts.
  const sorted = [...cashPrograms].sort(
    (a, b) => b.potentialAward.fundsAtClosing - a.potentialAward.fundsAtClosing,
  );

  for (const candidate of sorted) {
    const conflict = accepted.find((acc) => {
      if (acc.program.kind === "tax-credit") return false;
      if (!acc.program.stackable || !candidate.program.stackable) return true;
      return (
        acc.program.excludes.includes(candidate.program.id) ||
        candidate.program.excludes.includes(acc.program.id)
      );
    });

    if (conflict) {
      rejected.push({
        evaluation: candidate,
        reason: `Cannot be combined with ${conflict.program.name}.`,
      });
    } else {
      accepted.push(candidate);
    }
  }

  return { accepted, rejected };
}
