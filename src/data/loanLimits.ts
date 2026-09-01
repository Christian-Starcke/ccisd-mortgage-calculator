/**
 * Loan limits applicable to Fort Bend County, Texas for calendar year 2026.
 *
 * These are hard ceilings: a loan amount above the limit is simply not eligible
 * for that program, so the calculator uses them to disqualify options rather
 * than quietly producing an impossible scenario.
 */

export interface LoanLimitSet {
  taxYear: number;
  /** Fannie Mae / Freddie Mac one-unit baseline. */
  conforming: number;
  /** FHA one-unit limit for Fort Bend County. */
  fha: number;
  /** VA has no loan limit for borrowers with full entitlement. */
  vaFullEntitlement: number | null;
  /**
   * USDA Guaranteed Rural Housing has no statutory loan limit; qualification is
   * driven by income and repayment ability. This figure is the published area
   * loan limit used by the USDA Direct (Section 502) program and is kept for
   * reference only.
   */
  usdaDirectAreaLimit: number;
  sources: { label: string; url: string }[];
}

export const FORT_BEND_LOAN_LIMITS_2026: LoanLimitSet = {
  taxYear: 2026,
  conforming: 832_750,
  fha: 541_287,
  vaFullEntitlement: null,
  usdaDirectAreaLimit: 433_020,
  sources: [
    {
      label: "FHFA: Conforming Loan Limit Values for 2026 (announced 2025-11-25)",
      url: "https://www.fhfa.gov/news/news-release/fhfa-announces-conforming-loan-limit-values-for-2026",
    },
    {
      label: "HUD Mortgagee Letter 2025-23: 2026 Nationwide Forward Mortgage Limits",
      url: "https://www.hud.gov/sites/dfiles/hudclips/documents/2025-23hsgml.pdf",
    },
    {
      label: "HUD FHA loan limit lookup",
      url: "https://entp.hud.gov/idapp/html/hicostlook.cfm",
    },
  ],
};
