import { describe, expect, it } from "vitest";
import { assessAppraisalGap, MATERIAL_GAP_FRACTION } from "@/lib/appraisalGap";
import { calculatePropertyTax } from "@/lib/propertyTax";
import { requireUnit } from "@/lib/lookups/resolveCodes";
import { DEFAULT_STATE } from "@/lib/defaults";
import { buildCalculatorInputs, buildScenarioOptions } from "@/lib/buildFromState";
import { buildScenario } from "@/lib/scenario";

/** A real League City stack: no utility district, four units. */
const LEAGUE_CITY = [
  requireUnit("galveston", "S16"),
  requireUnit("galveston", "GGA"),
  requireUnit("galveston", "RFL"),
  requireUnit("galveston", "C40"),
];

function gap(appraisedValue: number, purchasePrice: number) {
  return assessAppraisalGap({
    appraisedValue,
    purchasePrice,
    units: LEAGUE_CITY,
    claimHomestead: true,
  });
}

describe("direction", () => {
  it("says nothing when the two roughly agree", () => {
    const g = gap(250_000, 255_000);
    expect(g.direction).toBe("aligned");
    expect(g.material).toBe(false);
  });

  it("calls a high roll an opportunity", () => {
    // 6210 Vinewood Ln: appraised $260,000, listed $214,900.
    const g = gap(260_000, 214_900);
    expect(g.direction).toBe("roll-above-price");
    expect(g.gap).toBeCloseTo(45_100, 0);
    // Negative delta: billing the price costs less than billing the roll.
    expect(g.monthlyAtRiskOrSaving).toBeLessThan(0);
    expect(-g.monthlyAtRiskOrSaving).toBeGreaterThan(50);
    expect(-g.monthlyAtRiskOrSaving).toBeLessThan(60);
  });

  it("calls a low roll a risk", () => {
    // 2008 Williamsburg Ct N: appraised $233,790 against a $400,000 price.
    const g = gap(233_790, 400_000);
    expect(g.direction).toBe("roll-below-price");
    expect(g.gap).toBeCloseTo(-166_210, 0);
    // Positive delta: the payment on screen is understated by this much.
    expect(g.monthlyAtRiskOrSaving).toBeGreaterThan(0);
  });

  it("uses one threshold for both directions", () => {
    const justUnder = 1 + MATERIAL_GAP_FRACTION * 0.9;
    const justOver = 1 + MATERIAL_GAP_FRACTION * 1.1;
    expect(gap(300_000 * justUnder, 300_000).material).toBe(false);
    expect(gap(300_000 * justOver, 300_000).material).toBe(true);
    // And symmetrically the other way.
    expect(gap(300_000, 300_000 * justUnder).material).toBe(false);
    expect(gap(300_000, 300_000 * justOver).material).toBe(true);
  });
});

describe("the low-roll case, which is the dangerous one", () => {
  const g = gap(233_790, 400_000);

  it("is worth real money a month", () => {
    // Four League City units on $166k more of value, after exemptions.
    expect(g.monthlyAtRiskOrSaving).toBeGreaterThan(150);
    expect(g.monthlyAtRiskOrSaving).toBeLessThan(280);
  });

  /**
   * The reason this is not a simple ratio. The school district's exemption is
   * a flat $140,000, so it covers a far larger share of a low value than a
   * high one — scaling the tax by the ratio of the values badly understates
   * the increase.
   */
  it("re-bills each unit rather than scaling the tax by the value ratio", () => {
    const ratioEstimate =
      g.annualTaxAtRoll * (400_000 / 233_790) - g.annualTaxAtRoll;
    expect(g.annualAtRiskOrSaving).toBeGreaterThan(ratioEstimate * 1.15);
  });

  it("hits the escrow deposit as well as the monthly payment", () => {
    const withEscrow = assessAppraisalGap({
      appraisedValue: 233_790,
      purchasePrice: 400_000,
      units: LEAGUE_CITY,
      claimHomestead: true,
      taxEscrowMonths: 12,
    });
    expect(withEscrow.escrowEffect).toBeCloseTo(
      withEscrow.annualAtRiskOrSaving,
      0,
    );
  });

  it("agrees with billing the units directly at each value", () => {
    const atRoll = calculatePropertyTax({
      appraisedValue: 233_790,
      units: LEAGUE_CITY,
      claimHomestead: true,
    });
    const atPrice = calculatePropertyTax({
      appraisedValue: 400_000,
      units: LEAGUE_CITY,
      claimHomestead: true,
    });
    expect(g.annualTaxAtRoll).toBeCloseTo(atRoll.annualTax, 2);
    expect(g.annualTaxAtPrice).toBeCloseTo(atPrice.annualTax, 2);
  });
});

describe("edge cases", () => {
  it("does not divide by zero on a blank price", () => {
    const g = gap(250_000, 0);
    expect(g.direction).toBe("aligned");
    expect(g.gapFraction).toBe(0);
    expect(Number.isFinite(g.monthlyAtRiskOrSaving)).toBe(true);
  });

  it("handles a value under the school exemption without going negative", () => {
    // At $50,000 the $140,000 school exemption wipes out the school line, but
    // the county and the city still bill on what is left after theirs — which
    // is exactly why the increase to full price is so steep here.
    const g = gap(50_000, 300_000);
    const schoolAtRoll = calculatePropertyTax({
      appraisedValue: 50_000,
      units: LEAGUE_CITY,
      claimHomestead: true,
    }).lineItems.find((r) => r.unit.code === "S16")!;

    expect(schoolAtRoll.annualTax).toBe(0);
    expect(g.annualTaxAtRoll).toBeGreaterThan(0);
    expect(g.direction).toBe("roll-below-price");
    expect(g.monthlyAtRiskOrSaving).toBeGreaterThan(0);
    // Nothing anywhere goes negative.
    expect(g.annualTaxAtPrice).toBeGreaterThan(g.annualTaxAtRoll);
  });
});

/**
 * The risks card raises the low-roll gap itself, because it carries the
 * control that re-bills the tax at the purchase price. The engine must not
 * also warn about it, or one problem shows up twice and the count is wrong.
 */
describe("the engine leaves presentation of the gap to the caller", () => {
  it("does not duplicate the low-roll gap in scenario warnings", () => {
    const state = {
      ...DEFAULT_STATE,
      purchasePrice: 400_000,
      taxAppraisedValueOverride: 233_790,
    };
    const scenario = buildScenario(
      buildCalculatorInputs(state),
      buildScenarioOptions(state),
    );

    // The gap is real at these inputs...
    const g = assessAppraisalGap({
      appraisedValue: scenario.propertyTax.appraisedValue,
      purchasePrice: scenario.purchasePrice,
      units: scenario.propertyTax.lineItems.map((r) => r.unit),
      claimHomestead: scenario.propertyTax.homesteadApplied,
    });
    expect(g.direction).toBe("roll-below-price");

    // ...and the engine still says nothing about it.
    expect(
      scenario.warnings.some((w) => /appraisal roll is/i.test(w)),
    ).toBe(false);
  });
});
