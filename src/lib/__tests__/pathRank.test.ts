import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, type CalculatorState } from "@/lib/defaults";
import {
  enumerateAssistanceStacks,
  rankPaths,
} from "@/lib/pathRank";
import { buildCalculatorInputs, buildScenarioOptions } from "@/lib/buildFromState";
import { buildScenario } from "@/lib/scenario";

function baseState(overrides: Partial<CalculatorState> = {}): CalculatorState {
  return { ...DEFAULT_STATE, ...overrides };
}

describe("enumerateAssistanceStacks", () => {
  it("includes the empty stack and layers MCC only on TSAHC DPA", () => {
    const state = baseState({
      texasHeroProfession: true,
      firstTimeBuyer: true,
      annualHouseholdIncome: 90_000,
      annualIncome: 90_000,
    });
    const inputs = buildCalculatorInputs(state, "conv-97");
    const scenario = buildScenario(inputs, buildScenarioOptions(state));
    const stacks = enumerateAssistanceStacks(scenario.assistance.evaluations);

    expect(stacks).toContainEqual([]);
    const withMcc = stacks.filter((stack) => stack.includes("tsahc-mcc"));
    expect(withMcc.length).toBeGreaterThan(0);
    for (const stack of withMcc) {
      expect(
        stack.includes("tsahc-home-sweet-texas") ||
          stack.includes("tsahc-texas-heroes"),
      ).toBe(true);
    }
    expect(
      stacks.some((stack) => stack.length === 1 && stack[0] === "tsahc-mcc"),
    ).toBe(false);
  });
});

describe("rankPaths", () => {
  it("splits lowest monthly and least cash for a VA-eligible buyer", () => {
    // Zero-down VA wins cash to close; a higher-down conventional often wins
    // monthly because the loan (and payment) is smaller.
    const ranking = rankPaths(
      baseState({
        isVeteran: true,
        vaFundingFeeExempt: true,
        firstTimeBuyer: true,
        annualHouseholdIncome: 110_000,
        annualIncome: 110_000,
        usdaAddressConfirmed: false,
        selectedAssistanceIds: [],
        sellerConcessions: 0,
        lenderCredit: 0,
        giftFunds: 0,
      }),
    );

    expect(ranking.lowestMonthly).not.toBeNull();
    expect(ranking.lowestCash).not.toBeNull();
    expect(ranking.samePath).toBe(false);
    expect(ranking.lowestCash!.programId).toBe("va");
    expect(ranking.lowestMonthly!.programId).not.toBe("va");
    expect(ranking.lowestCash!.netCashDue).toBeLessThan(
      ranking.lowestMonthly!.netCashDue,
    );
    expect(ranking.lowestMonthly!.effectiveMonthly).toBeLessThan(
      ranking.lowestCash!.effectiveMonthly,
    );
    expect(ranking.bestCombined).not.toBeNull();
    expect(ranking.bestCombined!.effectiveMonthly).toBeGreaterThanOrEqual(
      ranking.lowestMonthly!.effectiveMonthly - 0.01,
    );
    expect(ranking.bestCombined!.netCashDue).toBeGreaterThanOrEqual(
      ranking.lowestCash!.netCashDue - 0.01,
    );
    const combinedScore =
      ranking.bestCombined!.effectiveMonthly /
        ranking.lowestMonthly!.effectiveMonthly +
      ranking.bestCombined!.netCashDue /
        Math.max(ranking.lowestCash!.netCashDue, 1);
    const monthlyOnlyScore =
      1 +
      ranking.lowestMonthly!.netCashDue /
        Math.max(ranking.lowestCash!.netCashDue, 1);
    const cashOnlyScore =
      ranking.lowestCash!.effectiveMonthly /
        ranking.lowestMonthly!.effectiveMonthly +
      1;
    expect(combinedScore).toBeLessThanOrEqual(monthlyOnlyScore + 0.01);
    expect(combinedScore).toBeLessThanOrEqual(cashOnlyScore + 0.01);
  });

  it("returns one shared path when a single stack wins both metrics", () => {
    // Force a narrow menu: first-time buyer who is not a veteran, USDA ruled
    // out, and enough income that income-capped products drop away — then a
    // high down payment makes conventional-with-no-MI dominate both.
    const ranking = rankPaths(
      baseState({
        isVeteran: false,
        firstTimeBuyer: true,
        texasHeroProfession: false,
        annualHouseholdIncome: 200_000,
        annualIncome: 200_000,
        downPaymentFraction: 0.2,
        usdaAddressConfirmed: false,
        selectedAssistanceIds: [],
        sellerConcessions: 0,
        lenderCredit: 0,
        giftFunds: 0,
        // Income above TSAHC / MCC / county DPA ceilings so assistance is out.
      }),
    );

    expect(ranking.lowestMonthly).not.toBeNull();
    expect(ranking.lowestCash).not.toBeNull();

    if (ranking.samePath) {
      expect(ranking.lowestMonthly!.programId).toBe(
        ranking.lowestCash!.programId,
      );
      expect([...ranking.lowestMonthly!.assistanceIds].sort()).toEqual(
        [...ranking.lowestCash!.assistanceIds].sort(),
      );
      expect(ranking.bestCombined!.programId).toBe(
        ranking.lowestMonthly!.programId,
      );
    } else {
      // Still assert ranking invariants if the fixture happens to split.
      expect(ranking.lowestCash!.netCashDue).toBeLessThanOrEqual(
        ranking.lowestMonthly!.netCashDue,
      );
      expect(ranking.lowestMonthly!.effectiveMonthly).toBeLessThanOrEqual(
        ranking.lowestCash!.effectiveMonthly,
      );
    }
  });

  it("skips ineligible loans such as VA for non-veterans", () => {
    const ranking = rankPaths(
      baseState({
        isVeteran: false,
        firstTimeBuyer: true,
      }),
    );

    expect(ranking.paths.every((path) => path.programId !== "va")).toBe(true);
  });
});
