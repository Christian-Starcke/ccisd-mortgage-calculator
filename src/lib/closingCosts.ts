import { roundCents } from "./money";

/**
 * Buyer closing costs and prepaid items for a Texas purchase.
 *
 * Two Texas-specific facts shape this module:
 *
 * 1. Texas has no real estate transfer tax, so the large percentage-based
 *    government fee that dominates closing costs in states like New York or
 *    Pennsylvania simply does not exist here.
 * 2. In Texas the SELLER customarily pays for the owner's title policy. The
 *    buyer pays only the lender's policy, which is issued simultaneously for a
 *    nominal amount. That makes buyer title cost a rounding error rather than
 *    the biggest line item, and it is a customary practice rather than a law,
 *    so it is negotiable and is exposed as an input.
 */

export interface ClosingCostLineItem {
  id: string;
  label: string;
  amount: number;
  category: "loan" | "title" | "government" | "other" | "prepaid" | "escrow";
  /** Whether this item is commonly negotiable or paid by the seller. */
  negotiable: boolean;
  note?: string;
}

export interface ClosingCostAssumptions {
  /** Lender origination fee as a fraction of the loan amount. */
  originationFeeRate: number;
  appraisalFee: number;
  creditReportFee: number;
  underwritingFee: number;
  floodCertificationFee: number;
  taxServiceFee: number;
  /** Lender's title policy, simultaneous-issue amount. */
  lendersTitlePolicyFee: number;
  /** Escrow / closing fee charged by the title company, buyer's share. */
  escrowClosingFee: number;
  recordingFees: number;
  surveyFee: number;
  /** Whether the buyer pays for a new survey, or the seller provides one. */
  buyerPaysSurvey: boolean;
  hoaTransferFee: number;
  buyerPaysHoaTransferFee: boolean;
  /** Whether the buyer, unusually, pays the owner's title policy. */
  buyerPaysOwnersTitlePolicy: boolean;
  /** Months of homeowners insurance collected into escrow at closing. */
  insuranceEscrowMonths: number;
  /** Escrow cushion for taxes, in months. Two is the RESPA maximum. */
  taxEscrowCushionMonths: number;
}

export const DEFAULT_CLOSING_COST_ASSUMPTIONS: ClosingCostAssumptions = {
  originationFeeRate: 0.005,
  appraisalFee: 675,
  creditReportFee: 85,
  underwritingFee: 1_095,
  floodCertificationFee: 25,
  taxServiceFee: 85,
  lendersTitlePolicyFee: 100,
  escrowClosingFee: 450,
  recordingFees: 175,
  surveyFee: 575,
  buyerPaysSurvey: false,
  hoaTransferFee: 425,
  buyerPaysHoaTransferFee: false,
  buyerPaysOwnersTitlePolicy: false,
  insuranceEscrowMonths: 3,
  taxEscrowCushionMonths: 2,
};

/**
 * Texas promulgated Basic Rate for an owner's title policy.
 *
 * TDI sets this schedule, so every title company charges the same amount for
 * the same coverage. Between $100,000 and $1,000,000 the rate is
 * (face - 100,000) * 0.00494 + 780. The lender's policy, issued simultaneously
 * under Rule R-5, is a flat $100 and is stored separately as
 * lendersTitlePolicyFee.
 *
 * Only used when the buyer pays the owner's policy, which is not the Texas Gulf Coast
 * County custom except on new construction.
 */
export function texasOwnersTitlePremium(coverage: number): number {
  if (coverage <= 0) return 0;
  if (coverage <= 100_000) {
    return roundCents((coverage / 100_000) * 780);
  }
  if (coverage <= 1_000_000) {
    return roundCents((coverage - 100_000) * 0.00494 + 780);
  }
  return roundCents(
    (1_000_000 - 100_000) * 0.00494 + 780 + (coverage - 1_000_000) * 0.0039,
  );
}

/**
 * Months of property taxes a lender collects at closing.
 *
 * Texas tax bills are issued in October and are delinquent after January 31.
 * A lender needs the escrow account to hold a full year's tax by the time that
 * bill comes due, so the number of months collected at closing depends on how
 * far the closing date sits from the disbursement date. Closing in the summer
 * means a large tax deposit; closing right after taxes are paid in February
 * means a small one. This is the single most volatile line on a Texas closing
 * disclosure and the one that surprises buyers most.
 */
export function taxEscrowMonthsAtClosing(
  closingDate: Date,
  cushionMonths: number,
): number {
  // Month index 0 = January.
  const month = closingDate.getMonth();

  // Payments accrue monthly starting the month after closing; disbursement is
  // the following January. Count whole months from first payment to December.
  const monthsUntilDisbursement = month === 0 ? 12 : 13 - (month + 1);
  const collected = 12 - monthsUntilDisbursement + cushionMonths;

  return Math.max(0, Math.min(14, collected));
}

/** Prepaid interest from the funding date through the end of that month. */
export function prepaidInterestDays(closingDate: Date): number {
  const daysInMonth = new Date(
    closingDate.getFullYear(),
    closingDate.getMonth() + 1,
    0,
  ).getDate();
  return daysInMonth - closingDate.getDate() + 1;
}

export interface ClosingCostInput {
  purchasePrice: number;
  loanAmount: number;
  annualInterestRate: number;
  annualPropertyTax: number;
  annualHomeownersInsurance: number;
  annualFloodInsurance: number;
  /**
   * Separate windstorm premium, where one is required. It is escrowed and
   * prepaid exactly like the other two, and on the Galveston side of the
   * district it is the largest of the three.
   */
  annualWindstormInsurance: number;
  closingDate: Date;
  discountPoints: number;
  assumptions: ClosingCostAssumptions;
  hasHoa: boolean;
  /** Upfront FHA MIP / USDA guarantee fee / VA funding fee NOT financed. */
  unfinancedUpfrontFee: number;
}

export interface ClosingCostResult {
  lineItems: ClosingCostLineItem[];
  /** Lender and third-party fees, excluding prepaids and escrow deposits. */
  closingCostsTotal: number;
  /** Prepaid interest and insurance plus initial escrow deposits. */
  prepaidsAndEscrowTotal: number;
  discountPointsCost: number;
  /** Everything the buyer owes at the table before any credits. */
  grandTotal: number;
  taxEscrowMonths: number;
  prepaidInterestDayCount: number;
}

export function calculateClosingCosts(
  input: ClosingCostInput,
): ClosingCostResult {
  const {
    purchasePrice,
    loanAmount,
    annualInterestRate,
    annualPropertyTax,
    annualHomeownersInsurance,
    annualFloodInsurance,
    annualWindstormInsurance,
    closingDate,
    discountPoints,
    assumptions: a,
    hasHoa,
    unfinancedUpfrontFee,
  } = input;

  const lineItems: ClosingCostLineItem[] = [];

  /*
   * No price means no transaction, so no costs.
   *
   * Most of what follows scales off the price or the loan, but a good deal of
   * it is flat — the title company's fee, the appraisal, the credit report —
   * and those added up to nearly $2,700 of closing costs on a purchase that
   * did not exist. An empty form should read as empty, not as broken.
   */
  if (purchasePrice <= 0) {
    return {
      lineItems,
      closingCostsTotal: 0,
      prepaidsAndEscrowTotal: 0,
      discountPointsCost: 0,
      grandTotal: 0,
      taxEscrowMonths: taxEscrowMonthsAtClosing(closingDate, a.taxEscrowCushionMonths),
      prepaidInterestDayCount: 0,
    };
  }

  const push = (item: ClosingCostLineItem) => {
    if (item.amount > 0) lineItems.push(item);
  };

  // --- Loan costs ---------------------------------------------------------
  push({
    id: "origination",
    label: "Lender origination fee",
    amount: roundCents(loanAmount * a.originationFeeRate),
    category: "loan",
    negotiable: true,
    note: "Shop this. Some lenders charge zero origination and price it into the rate instead.",
  });
  push({
    id: "underwriting",
    label: "Underwriting and processing",
    amount: a.underwritingFee,
    category: "loan",
    negotiable: true,
  });
  push({
    id: "appraisal",
    label: "Appraisal",
    amount: a.appraisalFee,
    category: "loan",
    negotiable: false,
  });
  push({
    id: "credit",
    label: "Credit report",
    amount: a.creditReportFee,
    category: "loan",
    negotiable: false,
  });
  push({
    id: "flood-cert",
    label: "Flood zone certification",
    amount: a.floodCertificationFee,
    category: "loan",
    negotiable: false,
  });
  push({
    id: "tax-service",
    label: "Tax service fee",
    amount: a.taxServiceFee,
    category: "loan",
    negotiable: false,
  });
  push({
    id: "unfinanced-upfront-fee",
    label: "Upfront mortgage insurance or funding fee paid in cash",
    amount: roundCents(unfinancedUpfrontFee),
    category: "loan",
    negotiable: false,
    note: "Usually financed into the loan instead of paid at closing.",
  });

  // --- Title and settlement ----------------------------------------------
  push({
    id: "lenders-title",
    label: "Lender's title policy (simultaneous issue)",
    amount: a.lendersTitlePolicyFee,
    category: "title",
    negotiable: false,
  });
  if (a.buyerPaysOwnersTitlePolicy) {
    push({
      id: "owners-title",
      label: "Owner's title policy",
      amount: texasOwnersTitlePremium(purchasePrice),
      category: "title",
      negotiable: true,
      note: "In both Harris and Galveston County the seller customarily pays this. Ask for it.",
    });
  }
  push({
    id: "escrow-fee",
    label: "Title company closing fee (buyer's share)",
    amount: a.escrowClosingFee,
    category: "title",
    negotiable: true,
  });
  if (a.buyerPaysSurvey) {
    push({
      id: "survey",
      label: "New survey",
      amount: a.surveyFee,
      category: "title",
      negotiable: true,
      note: "Often avoidable: ask the seller for their existing survey plus a T-47 affidavit.",
    });
  }

  // --- Government ---------------------------------------------------------
  push({
    id: "recording",
    label: "Recording fees",
    amount: a.recordingFees,
    category: "government",
    negotiable: false,
    note: "Texas has no real estate transfer tax, so this is the whole government charge.",
  });

  // --- Other --------------------------------------------------------------
  if (hasHoa && a.buyerPaysHoaTransferFee) {
    push({
      id: "hoa-transfer",
      label: "HOA transfer and resale certificate",
      amount: a.hoaTransferFee,
      category: "other",
      negotiable: true,
      note: "Commonly assigned to the seller in the Texas contract addendum.",
    });
  }

  const closingCostsTotal = roundCents(
    lineItems.reduce((sum, item) => sum + item.amount, 0),
  );

  // --- Prepaids and escrow deposits ---------------------------------------
  const prepaidItems: ClosingCostLineItem[] = [];
  const pushPrepaid = (item: ClosingCostLineItem) => {
    if (item.amount > 0) prepaidItems.push(item);
  };

  const dayCount = prepaidInterestDays(closingDate);
  const dailyInterest = (loanAmount * annualInterestRate) / 365;
  pushPrepaid({
    id: "prepaid-interest",
    label: `Prepaid interest (${dayCount} days)`,
    amount: roundCents(dailyInterest * dayCount),
    category: "prepaid",
    negotiable: false,
    note: "Closing late in the month shrinks this. It is the one closing cost your calendar controls.",
  });

  const totalAnnualInsurance =
    annualHomeownersInsurance + annualFloodInsurance + annualWindstormInsurance;
  pushPrepaid({
    id: "prepaid-insurance",
    label:
      annualWindstormInsurance > 0
        ? "First year homeowners, windstorm and flood insurance premium"
        : "First year homeowners and flood insurance premium",
    amount: roundCents(totalAnnualInsurance),
    category: "prepaid",
    negotiable: false,
  });

  pushPrepaid({
    id: "escrow-insurance",
    label: `Insurance escrow deposit (${a.insuranceEscrowMonths} months)`,
    amount: roundCents((totalAnnualInsurance / 12) * a.insuranceEscrowMonths),
    category: "escrow",
    negotiable: false,
  });

  const taxMonths = taxEscrowMonthsAtClosing(
    closingDate,
    a.taxEscrowCushionMonths,
  );
  pushPrepaid({
    id: "escrow-taxes",
    label: `Property tax escrow deposit (${taxMonths} months)`,
    amount: roundCents((annualPropertyTax / 12) * taxMonths),
    category: "escrow",
    negotiable: false,
    note: "Texas bills taxes in October and they are delinquent after January 31, so the deposit is largest for spring and summer closings.",
  });

  const prepaidsAndEscrowTotal = roundCents(
    prepaidItems.reduce((sum, item) => sum + item.amount, 0),
  );

  const discountPointsCost = roundCents((discountPoints / 100) * loanAmount);

  return {
    lineItems: [...lineItems, ...prepaidItems],
    closingCostsTotal,
    prepaidsAndEscrowTotal,
    discountPointsCost,
    grandTotal: roundCents(
      closingCostsTotal + prepaidsAndEscrowTotal + discountPointsCost,
    ),
    taxEscrowMonths: taxMonths,
    prepaidInterestDayCount: dayCount,
  };
}
