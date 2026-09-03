import {
  buildAmortizationSchedule,
  monthReachingLtv,
  monthlyPrincipalAndInterest,
  type AmortizationResult,
  type MortgageInsuranceRule,
} from "./amortization";
import {
  calculateClosingCosts,
  DEFAULT_CLOSING_COST_ASSUMPTIONS,
  type ClosingCostAssumptions,
  type ClosingCostResult,
} from "./closingCosts";
import {
  conventionalPmiRule,
  fhaAnnualMipRate,
  fhaMipRule,
  quoteConventionalPmi,
  usdaFeeRule,
  type PmiQuote,
} from "./mortgageInsurance";
import { formatUSD, roundCents } from "./money";
import { calculatePropertyTax, type PropertyTaxResult } from "./propertyTax";
import {
  LOAN_PROGRAMS,
  resolveSellerConcessionLimit,
  resolveUpfrontFeeRate,
  type LoanProgram,
} from "./loanPrograms";
import {
  evaluateAssistance,
  resolveStack,
  type AssistanceEvaluation,
  type AssistanceProgram,
} from "./assistance";
import { HOUSTON_MSA_LOAN_LIMITS_2026 } from "@/data/loanLimits";
import { assessAppraisalGap } from "./appraisalGap";
import type {
  CalculatorInputs,
  CashToCloseBreakdown,
  MonthlyPaymentBreakdown,
} from "./types";

export interface DtiResult {
  /** Housing payment divided by gross monthly income. */
  frontEnd: number;
  /** All debt payments divided by gross monthly income. */
  backEnd: number;
  grossMonthlyIncome: number;
  /** Whether the back-end ratio is within the program's normal tolerance. */
  withinGuidelines: boolean;
  guidelineMax: number;
}

export interface ScenarioResult {
  program: LoanProgram;
  purchasePrice: number;
  downPayment: number;
  downPaymentFraction: number;
  baseLoanAmount: number;
  /** Loan amount after any financed upfront fee. */
  totalLoanAmount: number;
  financedUpfrontFee: number;
  upfrontFeeRate: number;
  loanToValue: number;

  interestRate: number;
  termMonths: number;

  monthly: MonthlyPaymentBreakdown;
  cashToClose: CashToCloseBreakdown;
  closingCosts: ClosingCostResult;
  propertyTax: PropertyTaxResult;
  amortization: AmortizationResult;
  pmiQuote: PmiQuote | null;
  mortgageInsuranceRule: MortgageInsuranceRule | null;

  dti: DtiResult;

  assistance: {
    evaluations: AssistanceEvaluation[];
    accepted: AssistanceEvaluation[];
    rejected: { evaluation: AssistanceEvaluation; reason: string }[];
    totalFundsAtClosing: number;
    totalMonthlyPayment: number;
    annualTaxCredit: number;
  };

  /** Month number when mortgage insurance can be requested off (80% LTV). */
  pmiRequestMonth: number | null;
  /** Month number when mortgage insurance drops automatically (78% LTV). */
  pmiAutomaticMonth: number | null;

  /** Total out of pocket over the horizon, including cash to close. */
  totalCostOverHorizon: number;
  horizonYears: number;
  /** Equity at the end of the horizon, net of selling costs at 7%. */
  projectedEquityAtHorizon: number;
  /** Maximum seller concession this program allows, in dollars. */
  maxSellerConcessionAllowed: number;
  /** Seller concessions actually usable after the program cap. */
  usableSellerConcessions: number;
  /** Quoted rate before any DPA-driven premium. */
  baseInterestRate: number;
  /** Extra first-mortgage rate charged because of selected assistance. */
  dpaRatePremium: number;
  /** Years until extra interest from the DPA premium eats the cash award. */
  dpaBreakEvenYears: number | null;
  hoaEstimated: boolean;
  warnings: string[];
}

export interface ScenarioOptions {
  closingDate: Date;
  closingCostAssumptions?: Partial<ClosingCostAssumptions>;
  horizonYears?: number;
  assistancePrograms: AssistanceProgram[];
  areaMedianIncome: number | null;
  /** Marginal federal income tax rate, used only for MCC value framing. */
  marginalTaxRate?: number;
}

/**
 * Back-end debt-to-income tolerance by program. These are the practical
 * automated-underwriting ceilings, not absolute maximums: exceptions exist with
 * strong compensating factors, and DU/LPA will occasionally approve higher.
 */
const DTI_GUIDELINE_MAX: Record<string, number> = {
  "conv-97": 0.5,
  homeready: 0.5,
  "home-possible": 0.5,
  "conv-5": 0.5,
  "conv-10": 0.5,
  "conv-20": 0.5,
  fha: 0.569,
  usda: 0.46,
  va: 0.6,
};

export function buildScenario(
  inputs: CalculatorInputs,
  options: ScenarioOptions,
): ScenarioResult {
  const { buyer, property, loan, assistance } = inputs;
  const program = LOAN_PROGRAMS[loan.programId];
  const warnings: string[] = [];

  /*
   * A roll below the purchase price is the one gap that makes this payment
   * look cheaper than it will be, so it is warned about here rather than only
   * next to the address. The district normally reassesses toward the sale
   * price for the following tax year, and the 10% homestead cap does not stop
   * that first reset.
   *
   * The opposite direction is upside rather than risk, and is handled as a
   * ranked action instead of a caveat.
   */
  const appraisalGap = assessAppraisalGap({
    appraisedValue: property.taxAppraisedValue,
    purchasePrice: property.purchasePrice,
    units: property.taxingUnits,
    claimHomestead: property.claimHomestead,
  });
  if (appraisalGap.direction === "roll-below-price") {
    warnings.push(
      `The appraisal roll is ${formatUSD(-appraisalGap.gap, 0)} below your price, so this tax figure is the first year rather than the steady state. Reassessed at what you are paying, the tax is ${formatUSD(appraisalGap.monthlyAtRiskOrSaving)} a month more, and the escrow the lender collects at closing is sized off today's lower bill — so expect the servicer to raise the payment once the new value lands.`,
    );
  }

  if (property.hoaEstimated) {
    warnings.push(
      property.annualHoaDues > 0
        ? `HOA dues are estimated at ${formatUSD(property.annualHoaDues, 0)} a year because they are not in the appraisal record. Confirm the amount on the listing before you offer; leaving it at zero would understate both the payment and cash to close.`
        : "This area often has no HOA, but that is not confirmed. If the listing has dues, enter them — they add to the monthly payment and usually a transfer fee at closing.",
    );
  }

  const horizonYears = options.horizonYears ?? 7;
  const termMonths = loan.termYears * 12;

  // --- Loan sizing --------------------------------------------------------
  const downPaymentFraction = Math.max(
    loan.downPaymentFraction,
    program.minDownPaymentFraction,
  );
  if (loan.downPaymentFraction < program.minDownPaymentFraction) {
    warnings.push(
      `${program.shortName} requires at least ${(program.minDownPaymentFraction * 100).toFixed(1)}% down, so the down payment was raised to meet it.`,
    );
  }

  const purchasePrice = property.purchasePrice;
  const downPayment = roundCents(purchasePrice * downPaymentFraction);
  const baseLoanAmount = roundCents(purchasePrice - downPayment);

  const upfrontFeeRate = resolveUpfrontFeeRate(program, {
    downPaymentFraction,
    buyer,
  });
  const financedUpfrontFee = roundCents(baseLoanAmount * upfrontFeeRate);
  const totalLoanAmount = roundCents(baseLoanAmount + financedUpfrontFee);

  if (
    program.maxLoanAmount != null &&
    baseLoanAmount > program.maxLoanAmount
  ) {
    warnings.push(
      `A ${(downPaymentFraction * 100).toFixed(1)}% down payment on this price needs a $${baseLoanAmount.toLocaleString()} loan, above the ${program.shortName} limit of $${program.maxLoanAmount.toLocaleString()} for the Houston metro area.`,
    );
  }

  // FHA measures LTV against the base loan, before financed upfront MIP.
  const baseLtv = purchasePrice > 0 ? baseLoanAmount / purchasePrice : 0;
  const loanToValue = purchasePrice > 0 ? totalLoanAmount / purchasePrice : 0;

  // --- Mortgage insurance -------------------------------------------------
  let pmiQuote: PmiQuote | null = null;
  let mortgageInsuranceRule: MortgageInsuranceRule | null = null;

  switch (program.mortgageInsuranceKind) {
    case "conventional-pmi": {
      pmiQuote = quoteConventionalPmi({
        loanAmount: totalLoanAmount,
        propertyValue: purchasePrice,
        creditScore: buyer.creditScore,
        reducedCoverage:
          program.id === "homeready" || program.id === "home-possible",
        overrideAnnualRate: loan.mortgageInsuranceRateOverride,
      });
      mortgageInsuranceRule = conventionalPmiRule(pmiQuote.annualRate);
      break;
    }
    case "fha-mip": {
      const annualRate =
        loan.mortgageInsuranceRateOverride ??
        fhaAnnualMipRate({
          baseLoanAmount,
          ltv: baseLtv,
          conformingThreshold: HOUSTON_MSA_LOAN_LIMITS_2026.conforming,
        });
      mortgageInsuranceRule = fhaMipRule({ annualRate, originalLtv: baseLtv });
      if (baseLtv > 0.9) {
        warnings.push(
          "With this down payment, FHA mortgage insurance lasts the entire life of the loan. The only way off it is a refinance.",
        );
      }
      break;
    }
    case "usda-fee": {
      mortgageInsuranceRule = usdaFeeRule();
      break;
    }
    case "none":
      mortgageInsuranceRule = null;
      break;
  }

  let amortization = buildAmortizationSchedule({
    loanAmount: totalLoanAmount,
    annualRate: loan.interestRate,
    termMonths,
    propertyValue: purchasePrice,
    mortgageInsurance: mortgageInsuranceRule,
    extraMonthlyPrincipal: loan.extraMonthlyPrincipal,
  });

  // --- Recurring ownership costs ------------------------------------------
  const propertyTax = calculatePropertyTax({
    appraisedValue: property.taxAppraisedValue,
    units: property.taxingUnits,
    claimHomestead: property.claimHomestead,
  });

  const monthlyHomeownersInsurance = roundCents(
    property.annualHomeownersInsurance / 12,
  );
  const monthlyFloodInsurance = roundCents(property.annualFloodInsurance / 12);
  const monthlyWindstormInsurance = roundCents(
    property.annualWindstormInsurance / 12,
  );
  const monthlyHoa = roundCents(property.annualHoaDues / 12);
  const monthlyMudUtility = roundCents(property.monthlyMudUtility);
  const monthlyPid = roundCents(property.pidAnnualAssessment / 12);

  let firstMonthMi = amortization.schedule[0]?.mortgageInsurance ?? 0;

  // --- Assistance ---------------------------------------------------------
  let firstYearInterest = amortization.schedule
    .slice(0, 12)
    .reduce((sum, row) => sum + row.interest, 0);

  const provisionalHousingPayment =
    amortization.monthlyPrincipalAndInterest +
    propertyTax.monthlyTax +
    monthlyHomeownersInsurance +
    monthlyFloodInsurance +
    firstMonthMi +
    monthlyHoa +
    monthlyMudUtility +
    monthlyPid;

  const grossMonthlyIncome = buyer.annualIncome / 12;
  const provisionalBackEnd =
    grossMonthlyIncome > 0
      ? (provisionalHousingPayment + buyer.monthlyDebtPayments) /
        grossMonthlyIncome
      : 0;

  const evaluations = options.assistancePrograms.map((assistanceProgram) =>
    evaluateAssistance({
      program: assistanceProgram,
      buyer,
      property,
      loanProgramId: program.id,
      purchasePrice,
      loanAmount: totalLoanAmount,
      annualInterestAtOrigination: firstYearInterest,
      frontEndDti:
        grossMonthlyIncome > 0
          ? provisionalHousingPayment / grossMonthlyIncome
          : 0,
      backEndDti: provisionalBackEnd,
    }),
  );

  const selectedIds = [...assistance.selectedProgramIds];
  const { accepted, rejected } = resolveStack(evaluations, selectedIds);

  const dpaRatePremium = accepted.reduce(
    (sum, ev) => sum + (ev.program.ratePremium ?? 0),
    0,
  );
  const effectiveRate = loan.interestRate + dpaRatePremium;

  if (dpaRatePremium > 0) {
    amortization = buildAmortizationSchedule({
      loanAmount: totalLoanAmount,
      annualRate: effectiveRate,
      termMonths,
      propertyValue: purchasePrice,
      mortgageInsurance: mortgageInsuranceRule,
      extraMonthlyPrincipal: loan.extraMonthlyPrincipal,
    });
    firstMonthMi = amortization.schedule[0]?.mortgageInsurance ?? 0;
    firstYearInterest = amortization.schedule
      .slice(0, 12)
      .reduce((sum, row) => sum + row.interest, 0);

    for (const ev of accepted) {
      if (ev.program.kind !== "tax-credit") continue;
      ev.potentialAward = {
        ...ev.potentialAward,
        annualTaxCredit: roundCents(
          firstYearInterest * (ev.program.taxCreditRate ?? 0),
        ),
      };
    }
  }

  const totalAssistanceFunds = roundCents(
    accepted.reduce((sum, ev) => sum + ev.potentialAward.fundsAtClosing, 0),
  );
  const totalAssistanceMonthly = roundCents(
    accepted.reduce((sum, ev) => sum + ev.potentialAward.monthlyPayment, 0),
  );
  const annualTaxCredit = roundCents(
    accepted.reduce((sum, ev) => sum + ev.potentialAward.annualTaxCredit, 0),
  );

  const extraMonthlyFromPremium =
    dpaRatePremium > 0
      ? amortization.monthlyPrincipalAndInterest -
        monthlyPrincipalAndInterest(
          totalLoanAmount,
          loan.interestRate,
          termMonths,
        )
      : 0;
  const dpaBreakEvenYears =
    extraMonthlyFromPremium > 1 && totalAssistanceFunds > 0
      ? roundCents(totalAssistanceFunds / (extraMonthlyFromPremium * 12))
      : null;

  if (dpaRatePremium > 0) {
    warnings.push(
      `Selected assistance adds ${(dpaRatePremium * 100).toFixed(2)}% to the first-mortgage rate. ${
        dpaBreakEvenYears != null
          ? `The cash award pays for that spread in about ${dpaBreakEvenYears.toFixed(1)} years; after that the cheaper rate without assistance wins.`
          : "Compare this against the same loan with no assistance before you take it."
      }`,
    );
  }

  // --- Monthly payment ----------------------------------------------------
  const monthlyTotal = roundCents(
    amortization.monthlyPrincipalAndInterest +
      propertyTax.monthlyTax +
      monthlyHomeownersInsurance +
      monthlyFloodInsurance +
      monthlyWindstormInsurance +
      firstMonthMi +
      monthlyHoa +
      monthlyMudUtility +
      monthlyPid +
      totalAssistanceMonthly,
  );

  const monthly: MonthlyPaymentBreakdown = {
    principalAndInterest: amortization.monthlyPrincipalAndInterest,
    propertyTax: propertyTax.monthlyTax,
    homeownersInsurance: monthlyHomeownersInsurance,
    floodInsurance: monthlyFloodInsurance,
    windstormInsurance: monthlyWindstormInsurance,
    mortgageInsurance: firstMonthMi,
    hoa: monthlyHoa,
    mudUtility: monthlyMudUtility,
    pidAssessment: monthlyPid,
    assistanceSecondLien: totalAssistanceMonthly,
    total: monthlyTotal,
    totalAfterTaxCredit: roundCents(monthlyTotal - annualTaxCredit / 12),
  };

  // --- Closing costs and cash to close ------------------------------------
  const closingCostAssumptions: ClosingCostAssumptions = {
    ...DEFAULT_CLOSING_COST_ASSUMPTIONS,
    buyerPaysOwnersTitlePolicy:
      property.isNewConstruction ||
      (options.closingCostAssumptions?.buyerPaysOwnersTitlePolicy ??
        DEFAULT_CLOSING_COST_ASSUMPTIONS.buyerPaysOwnersTitlePolicy),
    ...options.closingCostAssumptions,
  };
  if (property.isNewConstruction) {
    closingCostAssumptions.buyerPaysOwnersTitlePolicy = true;
  }

  const closingCosts = calculateClosingCosts({
    purchasePrice,
    loanAmount: totalLoanAmount,
    annualInterestRate: effectiveRate,
    annualPropertyTax: propertyTax.annualTax + property.pidAnnualAssessment,
    annualHomeownersInsurance: property.annualHomeownersInsurance,
    annualFloodInsurance: property.annualFloodInsurance,
    annualWindstormInsurance: property.annualWindstormInsurance,
    closingDate: options.closingDate,
    discountPoints: loan.discountPoints,
    assumptions: closingCostAssumptions,
    hasHoa: property.annualHoaDues > 0,
    unfinancedUpfrontFee: 0,
  });

  const maxSellerConcessionAllowed = roundCents(
    purchasePrice * resolveSellerConcessionLimit(program, loanToValue),
  );
  const usableSellerConcessions = Math.min(
    assistance.sellerConcessions,
    maxSellerConcessionAllowed,
  );
  if (assistance.sellerConcessions > maxSellerConcessionAllowed) {
    warnings.push(
      `${program.shortName} caps seller-paid costs at $${maxSellerConcessionAllowed.toLocaleString()} for this loan-to-value, so only that much of your requested concession can be used.`,
    );
  }

  const totalRequired = roundCents(
    downPayment + closingCosts.grandTotal,
  );
  const totalCredits = roundCents(
    usableSellerConcessions +
      assistance.lenderCredit +
      assistance.giftFunds +
      totalAssistanceFunds,
  );

  const netCashDue = roundCents(Math.max(0, totalRequired - totalCredits));
  const excessCredits = roundCents(Math.max(0, totalCredits - totalRequired));
  if (excessCredits > 0) {
    warnings.push(
      `Credits exceed what you owe at closing by about $${excessCredits.toLocaleString()}. Lender and seller credits cannot be taken as cash back, so trim the concession or apply it to a permanent rate buydown instead.`,
    );
  }

  const cashToClose: CashToCloseBreakdown = {
    downPayment,
    closingCosts: closingCosts.closingCostsTotal,
    prepaidsAndEscrow: closingCosts.prepaidsAndEscrowTotal,
    discountPointsCost: closingCosts.discountPointsCost,
    totalRequired,
    sellerConcessions: usableSellerConcessions,
    lenderCredit: assistance.lenderCredit,
    giftFunds: assistance.giftFunds,
    assistanceFunds: totalAssistanceFunds,
    totalCredits,
    netCashDue,
    cashRemaining: roundCents(buyer.cashAvailable - netCashDue),
    shortfall: roundCents(Math.max(0, netCashDue - buyer.cashAvailable)),
  };

  if (buyer.cashAvailable > 0 && cashToClose.shortfall > 0) {
    warnings.push(
      `You are about $${cashToClose.shortfall.toLocaleString()} short of the cash needed at closing.`,
    );
  }

  // --- DTI ----------------------------------------------------------------
  const guidelineMax = DTI_GUIDELINE_MAX[program.id] ?? 0.5;
  const dti: DtiResult = {
    grossMonthlyIncome,
    frontEnd:
      grossMonthlyIncome > 0
        ? roundCents((monthlyTotal / grossMonthlyIncome) * 10000) / 10000
        : 0,
    backEnd:
      grossMonthlyIncome > 0
        ? roundCents(
            ((monthlyTotal + buyer.monthlyDebtPayments) / grossMonthlyIncome) *
              10000,
          ) / 10000
        : 0,
    withinGuidelines: false,
    guidelineMax,
  };
  dti.withinGuidelines = dti.backEnd <= guidelineMax;

  if (!dti.withinGuidelines && grossMonthlyIncome > 0) {
    warnings.push(
      `Debt-to-income of ${(dti.backEnd * 100).toFixed(1)}% is above the ${(guidelineMax * 100).toFixed(0)}% ceiling underwriting normally allows for ${program.shortName}.`,
    );
  }

  // --- Horizon projection -------------------------------------------------
  const horizonMonths = Math.min(horizonYears * 12, amortization.schedule.length);
  const horizonRows = amortization.schedule.slice(0, horizonMonths);

  const interestPaid = horizonRows.reduce((sum, row) => sum + row.interest, 0);
  const miPaid = horizonRows.reduce(
    (sum, row) => sum + row.mortgageInsurance,
    0,
  );
  // Principal is deliberately not counted as a cost. It converts to equity, and
  // equity is reported separately as projectedEquityAtHorizon.

  // Taxes, insurance and HOA escalate; the loan payment does not.
  let escalatingCosts = 0;
  const annualRecurring =
    propertyTax.annualTax +
    property.annualHomeownersInsurance +
    property.annualFloodInsurance +
    property.annualWindstormInsurance +
    property.annualHoaDues +
    property.pidAnnualAssessment +
    property.monthlyMudUtility * 12;
  for (let year = 0; year < horizonYears; year += 1) {
    escalatingCosts +=
      annualRecurring * Math.pow(1 + inputs.annualExpenseGrowthRate, year);
  }

  const taxCreditOverHorizon = annualTaxCredit * horizonYears;

  const totalCostOverHorizon = roundCents(
    cashToClose.netCashDue +
      interestPaid +
      miPaid +
      escalatingCosts +
      totalAssistanceMonthly * horizonMonths -
      taxCreditOverHorizon,
  );

  const projectedValue =
    purchasePrice * Math.pow(1 + inputs.annualAppreciationRate, horizonYears);
  const remainingBalance =
    horizonRows[horizonRows.length - 1]?.closingBalance ?? totalLoanAmount;

  // Any deferred or repayable assistance comes due when you sell.
  const assistanceRepaidAtExit = accepted.reduce((sum, ev) => {
    const award = ev.potentialAward;
    if (!award.repayableOnExit) return sum;
    if (
      award.forgivenessYears != null &&
      horizonYears >= award.forgivenessYears
    ) {
      return sum;
    }
    if (award.forgivenessYears != null) {
      const unforgiven =
        award.secondLienBalance *
        (1 - horizonYears / award.forgivenessYears);
      return sum + unforgiven;
    }
    return sum + award.secondLienBalance;
  }, 0);

  const projectedEquityAtHorizon = roundCents(
    projectedValue * 0.93 - remainingBalance - assistanceRepaidAtExit,
  );

  const pmiRequestMonth =
    program.mortgageInsuranceKind === "conventional-pmi"
      ? monthReachingLtv(amortization.schedule, 0.8, purchasePrice)
      : null;
  const pmiAutomaticMonth =
    program.mortgageInsuranceKind === "conventional-pmi"
      ? monthReachingLtv(amortization.schedule, 0.78, purchasePrice)
      : null;

  return {
    program,
    purchasePrice,
    downPayment,
    downPaymentFraction,
    baseLoanAmount,
    totalLoanAmount,
    financedUpfrontFee,
    upfrontFeeRate,
    loanToValue,
    interestRate: effectiveRate,
    termMonths,
    monthly,
    cashToClose,
    closingCosts,
    propertyTax,
    amortization,
    pmiQuote,
    mortgageInsuranceRule,
    dti,
    assistance: {
      evaluations,
      accepted,
      rejected,
      totalFundsAtClosing: totalAssistanceFunds,
      totalMonthlyPayment: totalAssistanceMonthly,
      annualTaxCredit,
    },
    pmiRequestMonth,
    pmiAutomaticMonth,
    totalCostOverHorizon,
    horizonYears,
    projectedEquityAtHorizon,
    maxSellerConcessionAllowed,
    usableSellerConcessions,
    baseInterestRate: loan.interestRate,
    dpaRatePremium,
    dpaBreakEvenYears,
    hoaEstimated: property.hoaEstimated,
    warnings,
  };
}
