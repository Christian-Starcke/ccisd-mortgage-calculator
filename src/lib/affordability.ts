import { buildScenario, type ScenarioOptions, type ScenarioResult } from "./scenario";
import { roundCents } from "./money";
import type { CalculatorInputs } from "./types";

/**
 * Maximum affordable purchase price.
 *
 * There is no closed-form answer here. The usual textbook approach inverts the
 * payment formula, but that only works when every cost scales linearly with
 * price. In Texas it does not:
 *
 *  - The $140,000 school homestead exemption is a flat subtraction, so the
 *    effective tax rate rises as price rises.
 *  - PMI is priced in discrete LTV and credit bands, so it steps rather than
 *    slides.
 *  - Loan program ceilings (the FHA limit in particular) impose hard cliffs.
 *  - Cash to close and the DTI ceiling bind at different prices, and either can
 *    be the actual constraint.
 *
 * So we binary search the real scenario builder. It is a few hundred
 * evaluations, which is nothing, and it guarantees the answer is consistent with
 * the number shown elsewhere in the app.
 */

export type BindingConstraint =
  | "debt-to-income"
  | "cash-to-close"
  | "loan-program-limit"
  | "none";

export interface AffordabilityResult {
  maxPurchasePrice: number;
  /** The scenario at that price. */
  scenario: ScenarioResult;
  /** Which limit actually stopped you. */
  bindingConstraint: BindingConstraint;
  /** Target back-end DTI used for the search. */
  targetBackEndDti: number;
  explanation: string;
}

export interface AffordabilityOptions extends ScenarioOptions {
  /**
   * Back-end DTI to solve to. Defaults to the program guideline, but a buyer who
   * wants breathing room should solve to something lower.
   */
  targetBackEndDti?: number;
  /** Cash the buyer is willing to spend at closing. */
  maxCashToClose?: number;
  searchFloor?: number;
  searchCeiling?: number;
  /** Stop when the bracket is narrower than this. */
  tolerance?: number;
}

interface FeasibilityCheck {
  feasible: boolean;
  dtiOk: boolean;
  cashOk: boolean;
  programLimitOk: boolean;
}

function checkFeasible(
  scenario: ScenarioResult,
  targetDti: number,
  maxCash: number,
): FeasibilityCheck {
  const dtiOk = scenario.dti.backEnd <= targetDti;
  const cashOk = scenario.cashToClose.netCashDue <= maxCash + 0.5;
  const programLimitOk =
    scenario.program.maxLoanAmount == null ||
    scenario.baseLoanAmount <= scenario.program.maxLoanAmount;

  return {
    feasible: dtiOk && cashOk && programLimitOk,
    dtiOk,
    cashOk,
    programLimitOk,
  };
}

/**
 * Rebuilds the inputs at a candidate price.
 *
 * Insurance, HOA and the tax appraised value all track the purchase price, so
 * they have to be re-derived at each candidate rather than held fixed. Holding
 * them fixed is the most common bug in affordability calculators and it
 * overstates what you can afford at the top of the range.
 */
function inputsAtPrice(
  base: CalculatorInputs,
  price: number,
): CalculatorInputs {
  const priceRatio =
    base.property.purchasePrice > 0 ? price / base.property.purchasePrice : 1;

  return {
    ...base,
    property: {
      ...base.property,
      purchasePrice: price,
      taxAppraisedValue: price,
      // Dwelling coverage scales with the home, so the premium does too.
      annualHomeownersInsurance: roundCents(
        base.property.annualHomeownersInsurance * priceRatio,
      ),
    },
  };
}

export function calculateAffordability(
  base: CalculatorInputs,
  options: AffordabilityOptions,
): AffordabilityResult {
  const searchFloor = options.searchFloor ?? 50_000;
  const searchCeiling = options.searchCeiling ?? 2_000_000;
  const tolerance = options.tolerance ?? 250;

  const probeScenario = buildScenario(base, options);
  const targetBackEndDti =
    options.targetBackEndDti ?? probeScenario.dti.guidelineMax;
  const maxCash = options.maxCashToClose ?? base.buyer.cashAvailable;

  const evaluate = (price: number) =>
    buildScenario(inputsAtPrice(base, price), options);

  // If even the floor fails, report the floor and say why.
  const floorScenario = evaluate(searchFloor);
  const floorCheck = checkFeasible(floorScenario, targetBackEndDti, maxCash);
  if (!floorCheck.feasible) {
    return {
      maxPurchasePrice: 0,
      scenario: floorScenario,
      bindingConstraint: !floorCheck.cashOk
        ? "cash-to-close"
        : !floorCheck.dtiOk
          ? "debt-to-income"
          : "loan-program-limit",
      targetBackEndDti,
      explanation: !floorCheck.cashOk
        ? "Even the cheapest home in the search range needs more cash at closing than you have available. Assistance programs or seller concessions are the lever here."
        : "Even the cheapest home in the search range pushes your debt-to-income above the guideline. Paying down monthly debts raises this the fastest.",
    };
  }

  let low = searchFloor;
  let high = searchCeiling;
  let best = floorScenario;
  let bestCheck = floorCheck;

  while (high - low > tolerance) {
    const mid = Math.floor((low + high) / 2);
    const scenario = evaluate(mid);
    const check = checkFeasible(scenario, targetBackEndDti, maxCash);

    if (check.feasible) {
      low = mid;
      best = scenario;
      bestCheck = check;
    } else {
      high = mid;
    }
  }

  // Identify what stops you just above the answer.
  const justAbove = evaluate(low + tolerance * 4);
  const aboveCheck = checkFeasible(justAbove, targetBackEndDti, maxCash);

  let bindingConstraint: BindingConstraint = "none";
  let explanation = "";

  if (!aboveCheck.programLimitOk) {
    bindingConstraint = "loan-program-limit";
    explanation = `You are capped by the ${best.program.shortName} loan limit for Fort Bend County, not by your income or cash. A different loan program would let you go higher.`;
  } else if (!aboveCheck.cashOk) {
    bindingConstraint = "cash-to-close";
    explanation =
      "Cash at closing is what limits you, not your income. Down payment assistance, seller-paid closing costs, or gift funds would move this number the most.";
  } else if (!aboveCheck.dtiOk) {
    bindingConstraint = "debt-to-income";
    explanation = `Your debt-to-income ratio is what limits you. At this price you are at ${(best.dti.backEnd * 100).toFixed(1)}% against a ${(targetBackEndDti * 100).toFixed(0)}% target. Every $100 of monthly debt you eliminate buys roughly $15,000 to $18,000 of purchase price at current rates.`;
  } else {
    bindingConstraint = "none";
    explanation = "You reached the top of the search range without hitting a limit.";
  }

  void bestCheck;

  return {
    maxPurchasePrice: low,
    scenario: best,
    bindingConstraint,
    targetBackEndDti,
    explanation,
  };
}
