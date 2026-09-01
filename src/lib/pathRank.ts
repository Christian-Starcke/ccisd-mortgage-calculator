import {
  buildCalculatorInputs,
  buildScenarioOptions,
} from "./buildFromState";
import type { CalculatorState } from "./defaults";
import { checkEligibility, LOAN_PROGRAM_ORDER } from "./loanPrograms";
import { buildScenario, type ScenarioResult } from "./scenario";
import type { LoanProgramId } from "./types";

/** TSAHC DPA that can carry an MCC (stand-alone MCC is no longer offered). */
const TSAHC_DPA_IDS = new Set([
  "tsahc-home-sweet-texas",
  "tsahc-texas-heroes",
]);

export interface RankedPath {
  programId: LoanProgramId;
  assistanceIds: string[];
  scenario: ScenarioResult;
  /** Monthly used for ranking — after MCC when present. */
  effectiveMonthly: number;
  netCashDue: number;
}

export interface PathRanking {
  paths: RankedPath[];
  lowestMonthly: RankedPath | null;
  lowestCash: RankedPath | null;
  /**
   * Path closest to both goals at once: lowest monthly and least cash.
   * When those are the same stack, this is that stack. When they split
   * (zero-down vs 20% down), this is the compromise nearest the ideal pair.
   */
  bestCombined: RankedPath | null;
  /** True when both winners share the same loan and assistance stack. */
  samePath: boolean;
}

function pathKey(programId: LoanProgramId, assistanceIds: string[]): string {
  return `${programId}|${[...assistanceIds].sort().join(",")}`;
}

/**
 * Legal assistance id sets for one loan, matching resolveStack rules:
 * empty; each eligible cash program; stackable cash pairs; MCC only on TSAHC DPA.
 */
export function enumerateAssistanceStacks(
  evaluations: ScenarioResult["assistance"]["evaluations"],
): string[][] {
  const eligible = evaluations.filter(
    (ev) => ev.eligible && ev.program.status !== "closed",
  );
  const taxCredits = eligible.filter((ev) => ev.program.kind === "tax-credit");
  const cash = eligible.filter((ev) => ev.program.kind !== "tax-credit");

  const stacks: string[][] = [[]];

  for (const candidate of cash) {
    stacks.push([candidate.program.id]);
  }

  const stackable = cash.filter((ev) => ev.program.stackable);
  for (let i = 0; i < stackable.length; i++) {
    for (let j = i + 1; j < stackable.length; j++) {
      const a = stackable[i]!;
      const b = stackable[j]!;
      if (
        a.program.excludes.includes(b.program.id) ||
        b.program.excludes.includes(a.program.id)
      ) {
        continue;
      }
      stacks.push([a.program.id, b.program.id]);
    }
  }

  const mcc = taxCredits.find((ev) => ev.program.id === "tsahc-mcc");
  if (mcc) {
    const withMcc: string[][] = [];
    for (const stack of stacks) {
      if (stack.some((id) => TSAHC_DPA_IDS.has(id))) {
        withMcc.push([...stack, mcc.program.id]);
      }
    }
    stacks.push(...withMcc);
  }

  return stacks;
}

function effectiveMonthly(scenario: ScenarioResult): number {
  return scenario.monthly.totalAfterTaxCredit;
}

/**
 * Normalized distance from the ideal pair (lowest monthly AND least cash).
 * Cash of $0 uses a $1 floor so a true zero-cash path can still win.
 */
export function combinedDistance(
  path: RankedPath,
  bestMonthly: number,
  bestCash: number,
): number {
  const monthlyDenom = Math.max(bestMonthly, 1);
  const cashDenom = Math.max(bestCash, 1);
  const monthlyGap = (path.effectiveMonthly - bestMonthly) / monthlyDenom;
  const cashGap = (path.netCashDue - bestCash) / cashDenom;
  return monthlyGap * monthlyGap + cashGap * cashGap;
}

/**
 * Prices every eligible / needs-check loan against every legal assistance stack
 * and returns the lowest-monthly winner, the lowest-cash winner, and the
 * combined path closest to both.
 *
 * Seller concessions, lender credit, and gift funds stay at whatever is already
 * on state (defaults $0). Cash on hand does not filter winners.
 */
export function rankPaths(state: CalculatorState): PathRanking {
  const options = buildScenarioOptions(state);
  const paths: RankedPath[] = [];
  const seen = new Set<string>();

  for (const programId of LOAN_PROGRAM_ORDER) {
    const baseInputs = buildCalculatorInputs(
      { ...state, selectedAssistanceIds: [], programId },
      programId,
    );
    const baseScenario = buildScenario(baseInputs, options);
    const eligibility = checkEligibility({
      program: baseScenario.program,
      buyer: baseInputs.buyer,
      property: baseInputs.property,
      areaMedianIncome: state.areaMedianIncome,
      usdaAddressConfirmed: state.usdaAddressConfirmed,
      loanAmount: baseScenario.baseLoanAmount,
    });

    if (eligibility.status === "ineligible") continue;

    const stacks = enumerateAssistanceStacks(baseScenario.assistance.evaluations);

    for (const assistanceIds of stacks) {
      const key = pathKey(programId, assistanceIds);
      if (seen.has(key)) continue;
      seen.add(key);

      const inputs = buildCalculatorInputs(
        { ...state, selectedAssistanceIds: assistanceIds, programId },
        programId,
      );
      const scenario =
        assistanceIds.length === 0
          ? baseScenario
          : buildScenario(inputs, options);

      paths.push({
        programId,
        assistanceIds,
        scenario,
        effectiveMonthly: effectiveMonthly(scenario),
        netCashDue: scenario.cashToClose.netCashDue,
      });
    }
  }

  let lowestMonthly: RankedPath | null = null;
  let lowestCash: RankedPath | null = null;

  for (const path of paths) {
    if (
      lowestMonthly == null ||
      path.effectiveMonthly < lowestMonthly.effectiveMonthly - 0.005 ||
      (Math.abs(path.effectiveMonthly - lowestMonthly.effectiveMonthly) <
        0.005 &&
        path.netCashDue < lowestMonthly.netCashDue)
    ) {
      lowestMonthly = path;
    }
    if (
      lowestCash == null ||
      path.netCashDue < lowestCash.netCashDue - 0.005 ||
      (Math.abs(path.netCashDue - lowestCash.netCashDue) < 0.005 &&
        path.effectiveMonthly < lowestCash.effectiveMonthly)
    ) {
      lowestCash = path;
    }
  }

  const samePath =
    lowestMonthly != null &&
    lowestCash != null &&
    pathKey(lowestMonthly.programId, lowestMonthly.assistanceIds) ===
      pathKey(lowestCash.programId, lowestCash.assistanceIds);

  let bestCombined: RankedPath | null = null;
  if (samePath) {
    bestCombined = lowestMonthly;
  } else if (lowestMonthly != null && lowestCash != null) {
    const bestMonthly = lowestMonthly.effectiveMonthly;
    const bestCash = lowestCash.netCashDue;
    for (const path of paths) {
      if (bestCombined == null) {
        bestCombined = path;
        continue;
      }
      const next = combinedDistance(path, bestMonthly, bestCash);
      const current = combinedDistance(bestCombined, bestMonthly, bestCash);
      if (
        next < current - 1e-12 ||
        (Math.abs(next - current) < 1e-12 &&
          path.effectiveMonthly + path.netCashDue / 240 <
            bestCombined.effectiveMonthly + bestCombined.netCashDue / 240)
      ) {
        bestCombined = path;
      }
    }
  }

  return { paths, lowestMonthly, lowestCash, bestCombined, samePath };
}
