import { roundCents } from "./money";

/**
 * Standard fixed-rate amortizing payment (principal + interest only).
 *
 * @param principal Amount financed.
 * @param annualRate Nominal annual rate as a fraction, e.g. 0.0625.
 * @param termMonths Total number of scheduled payments.
 */
export function monthlyPrincipalAndInterest(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return principal / termMonths;

  const growth = Math.pow(1 + monthlyRate, termMonths);
  return (principal * monthlyRate * growth) / (growth - 1);
}

/**
 * Inverts {@link monthlyPrincipalAndInterest}: the loan amount a given monthly
 * P&I payment can support. Used by the affordability solver.
 */
export function principalFromPayment(
  payment: number,
  annualRate: number,
  termMonths: number,
): number {
  if (payment <= 0 || termMonths <= 0) return 0;

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return payment * termMonths;

  const growth = Math.pow(1 + monthlyRate, termMonths);
  return (payment * (growth - 1)) / (monthlyRate * growth);
}

export interface AmortizationMonth {
  /** 1-based payment number. */
  month: number;
  /** Balance before this payment is applied. */
  openingBalance: number;
  interest: number;
  principal: number;
  /** Extra principal applied this month, if any. */
  extraPrincipal: number;
  closingBalance: number;
  /** Mortgage insurance charged this month. Zero once it terminates. */
  mortgageInsurance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
  cumulativeMortgageInsurance: number;
}

export interface MortgageInsuranceRule {
  /**
   * Annual premium as a fraction of the outstanding balance,
   * e.g. 0.0055 for FHA's 0.55% annual MIP.
   */
  annualRate: number;
  /**
   * LTV at which the premium stops, measured against the ORIGINAL property
   * value. Conventional PMI terminates automatically at 78% under the
   * Homeowners Protection Act. Set to null for premiums that never terminate,
   * which is how FHA behaves when the original LTV exceeded 90%.
   */
  terminationLtv: number | null;
  /**
   * Hard cap on how long the premium can run, in months. FHA loans with an
   * original LTV at or below 90% drop MIP after 11 years.
   */
  maxMonths: number | null;
  /**
   * Whether the premium recalculates against the declining balance each month
   * (USDA) or stays fixed on the original loan amount for the year
   * (conventional PMI and FHA both quote annually against an average balance;
   * we approximate with the declining balance, which is the standard
   * simplification and errs slightly low).
   */
  basis: "declining-balance" | "original-loan-amount";
}

export interface AmortizationInput {
  loanAmount: number;
  annualRate: number;
  termMonths: number;
  /** Original appraised/purchase value, used for LTV-based MI termination. */
  propertyValue: number;
  mortgageInsurance?: MortgageInsuranceRule | null;
  /** Additional principal paid every month, on top of the scheduled payment. */
  extraMonthlyPrincipal?: number;
}

export interface AmortizationResult {
  schedule: AmortizationMonth[];
  monthlyPrincipalAndInterest: number;
  totalInterest: number;
  totalMortgageInsurance: number;
  /** Number of payments actually made (shorter than term if extra principal). */
  monthsToPayoff: number;
  /**
   * 1-based payment number of the last month mortgage insurance is charged,
   * or null when there is no mortgage insurance / it never terminates.
   */
  mortgageInsuranceEndsMonth: number | null;
}

/**
 * Builds a full month-by-month schedule. This is the single source of truth for
 * every "total interest", "when does PMI fall off", and "equity over time"
 * number in the app, so that the summary and the charts can never disagree.
 */
export function buildAmortizationSchedule(
  input: AmortizationInput,
): AmortizationResult {
  const {
    loanAmount,
    annualRate,
    termMonths,
    propertyValue,
    mortgageInsurance = null,
    extraMonthlyPrincipal = 0,
  } = input;

  // Lenders fix the scheduled payment at a whole number of cents, then let the
  // final payment absorb whatever rounding residue has accumulated.
  const basePayment = roundCents(
    monthlyPrincipalAndInterest(loanAmount, annualRate, termMonths),
  );
  const monthlyRate = annualRate / 12;

  const schedule: AmortizationMonth[] = [];
  let balance = loanAmount;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  let cumulativeMortgageInsurance = 0;
  let mortgageInsuranceEndsMonth: number | null = null;

  for (let month = 1; month <= termMonths && balance > 0.005; month += 1) {
    const openingBalance = balance;
    const interest = roundCents(openingBalance * monthlyRate);

    let principal = roundCents(basePayment - interest);
    // Guard against a payment too small to cover interest (negative amortization).
    if (principal < 0) principal = 0;

    let extra = extraMonthlyPrincipal > 0 ? extraMonthlyPrincipal : 0;

    // The final scheduled payment settles the loan exactly.
    if (month === termMonths) {
      principal = openingBalance;
      extra = 0;
    }

    // Never pay more principal than is outstanding.
    if (principal > openingBalance) {
      principal = openingBalance;
      extra = 0;
    } else if (principal + extra > openingBalance) {
      extra = roundCents(openingBalance - principal);
    }

    const closingBalance = roundCents(openingBalance - principal - extra);

    const mi = mortgageInsuranceForMonth({
      rule: mortgageInsurance,
      month,
      openingBalance,
      loanAmount,
      propertyValue,
    });

    if (mi > 0) mortgageInsuranceEndsMonth = month;

    cumulativeInterest = roundCents(cumulativeInterest + interest);
    cumulativePrincipal = roundCents(cumulativePrincipal + principal + extra);
    cumulativeMortgageInsurance = roundCents(cumulativeMortgageInsurance + mi);

    schedule.push({
      month,
      openingBalance,
      interest,
      principal,
      extraPrincipal: extra,
      closingBalance,
      mortgageInsurance: mi,
      cumulativeInterest,
      cumulativePrincipal,
      cumulativeMortgageInsurance,
    });

    balance = closingBalance;
  }

  return {
    schedule,
    monthlyPrincipalAndInterest: roundCents(basePayment),
    totalInterest: cumulativeInterest,
    totalMortgageInsurance: cumulativeMortgageInsurance,
    monthsToPayoff: schedule.length,
    mortgageInsuranceEndsMonth,
  };
}

function mortgageInsuranceForMonth(args: {
  rule: MortgageInsuranceRule | null;
  month: number;
  openingBalance: number;
  loanAmount: number;
  propertyValue: number;
}): number {
  const { rule, month, openingBalance, loanAmount, propertyValue } = args;
  if (!rule || rule.annualRate <= 0) return 0;

  if (rule.maxMonths != null && month > rule.maxMonths) return 0;

  if (rule.terminationLtv != null && propertyValue > 0) {
    const ltv = openingBalance / propertyValue;
    if (ltv <= rule.terminationLtv) return 0;
  }

  const basis =
    rule.basis === "original-loan-amount" ? loanAmount : openingBalance;

  return roundCents((basis * rule.annualRate) / 12);
}

/**
 * First month whose opening balance is at or below the given LTV. Useful for
 * telling the buyer when they can *request* PMI cancellation (80%) versus when
 * the servicer must drop it automatically (78%).
 */
export function monthReachingLtv(
  schedule: AmortizationMonth[],
  targetLtv: number,
  propertyValue: number,
): number | null {
  if (propertyValue <= 0) return null;
  const hit = schedule.find(
    (row) => row.closingBalance / propertyValue <= targetLtv,
  );
  return hit ? hit.month : null;
}
