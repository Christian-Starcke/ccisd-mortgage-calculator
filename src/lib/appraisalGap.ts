import { roundCents } from "./money";
import { calculatePropertyTax, type TaxingUnit } from "./propertyTax";

/**
 * What it means when the appraisal roll and the purchase price disagree.
 *
 * The calculator bills the roll, because that is what the tax office will
 * actually send. But the roll is a snapshot of what the district thought the
 * property was worth on January 1, and a sale is the single strongest piece of
 * evidence about value there is. So a gap in either direction is a signal
 * about a payment that is going to change, and the two directions mean
 * opposite things:
 *
 *   Roll above the price   The bill is higher than the sale supports. A
 *                          protest citing the closing statement is the
 *                          strongest case an appraisal review board sees.
 *                          Upside: the payment can come down.
 *
 *   Roll below the price   The bill is lower than the sale supports, and the
 *                          district will normally reassess toward the sale
 *                          price for the next tax year. Risk: the payment is
 *                          going to go up, and the figure on screen is
 *                          flattering.
 *
 * The second is the more dangerous one, and it is the one a buyer is least
 * likely to anticipate — a low assessment reads as good news. It also bites
 * twice: the lender sizes the escrow deposit off today's low bill, so when the
 * new assessment lands the escrow account is short and the servicer raises the
 * monthly payment to catch up as well as to cover the higher tax.
 *
 * The homestead cap does not save you from the first reset. Texas Tax Code
 * 23.23 limits annual increases to 10%, but only once the owner has held the
 * homestead for a full year — the reappraisal that follows a sale is not
 * capped, which is exactly why the first jump is the big one.
 */

export type AppraisalDirection =
  /** Roll is materially above the price: a protest opportunity. */
  | "roll-above-price"
  /** Roll is materially below the price: the payment will likely rise. */
  | "roll-below-price"
  /** Close enough that neither warning is worth making. */
  | "aligned";

/**
 * How far apart the two have to be before it is worth saying anything.
 *
 * Shared by both directions so the UI cannot warn about one and stay quiet
 * about an equally large gap the other way. Five percent of price is roughly
 * where the monthly effect stops being rounding.
 */
export const MATERIAL_GAP_FRACTION = 0.05;

export interface AppraisalGapAssessment {
  direction: AppraisalDirection;
  appraisedValue: number;
  purchasePrice: number;
  /** Signed: positive when the roll is above the price. */
  gap: number;
  /** Absolute gap as a fraction of the purchase price. */
  gapFraction: number;
  material: boolean;

  annualTaxAtRoll: number;
  annualTaxAtPrice: number;
  /**
   * Signed monthly difference between billing the price and billing the roll.
   * Positive means the payment on screen is understated by this much.
   */
  monthlyAtRiskOrSaving: number;
  annualAtRiskOrSaving: number;
  /**
   * The same difference applied to the tax months the lender escrows at
   * closing — the second hit, whichever direction the gap runs.
   */
  escrowEffect: number;
}

/**
 * Prices both sides of the gap by actually re-billing every taxing unit at the
 * other value, rather than scaling the tax by the ratio of the values.
 *
 * Scaling would be wrong, and wrong in a way that matters: the school
 * district's exemption is a flat $140,000 and the county's is a percentage, so
 * tax is not proportional to value. On a $234,000 roll against a $400,000
 * price the flat exemption covers a much larger share of the lower value, and
 * a ratio estimate understates the increase substantially.
 */
export function assessAppraisalGap(args: {
  appraisedValue: number;
  purchasePrice: number;
  units: TaxingUnit[];
  claimHomestead: boolean;
  taxEscrowMonths?: number;
}): AppraisalGapAssessment {
  const {
    appraisedValue,
    purchasePrice,
    units,
    claimHomestead,
    taxEscrowMonths = 12,
  } = args;

  const gap = appraisedValue - purchasePrice;
  const gapFraction = purchasePrice > 0 ? Math.abs(gap) / purchasePrice : 0;
  const material = gapFraction > MATERIAL_GAP_FRACTION && purchasePrice > 0;

  const atRoll = calculatePropertyTax({
    appraisedValue,
    units,
    claimHomestead,
  });
  const atPrice = calculatePropertyTax({
    appraisedValue: purchasePrice,
    units,
    claimHomestead,
  });

  const annualDelta = roundCents(atPrice.annualTax - atRoll.annualTax);

  const direction: AppraisalDirection = !material
    ? "aligned"
    : gap > 0
      ? "roll-above-price"
      : "roll-below-price";

  return {
    direction,
    appraisedValue,
    purchasePrice,
    gap: roundCents(gap),
    gapFraction,
    material,
    annualTaxAtRoll: atRoll.annualTax,
    annualTaxAtPrice: atPrice.annualTax,
    monthlyAtRiskOrSaving: roundCents(annualDelta / 12),
    annualAtRiskOrSaving: annualDelta,
    escrowEffect: roundCents((annualDelta / 12) * taxEscrowMonths),
  };
}
