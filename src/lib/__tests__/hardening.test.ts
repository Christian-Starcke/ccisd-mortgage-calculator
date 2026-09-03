import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, reviveState } from "@/lib/defaults";
import { LOAN_PROGRAMS } from "@/lib/loanPrograms";
import type { LoanProgramId } from "@/lib/types";
import {
  buildCalculatorInputs,
  buildScenarioOptions,
  resolveStateTaxUnits,
} from "@/lib/buildFromState";
import type { ResolvedParcel } from "@/lib/lookups/types";
import { buildScenario } from "@/lib/scenario";
import { calculateAffordability } from "@/lib/affordability";
import { assessAppraisalGap } from "@/lib/appraisalGap";
import { formatPercent, formatUSD, roundToMatchTotal } from "@/lib/money";
import {
  CITIES_WITHOUT_CITY_WATER,
  hasCityWaterSchedule,
} from "@/lib/householdUtilities";
import { requireUnit } from "@/lib/lookups/resolveCodes";

/**
 * Regressions from the hardening pass. Each of these shipped, so each gets a
 * test naming what went wrong rather than only what should happen.
 */

function scenarioFor(over: Partial<typeof DEFAULT_STATE>) {
  const state = { ...DEFAULT_STATE, ...over };
  return buildScenario(
    buildCalculatorInputs(state),
    buildScenarioOptions(state),
  );
}

function affordabilityFor(over: Partial<typeof DEFAULT_STATE>) {
  const state = { ...DEFAULT_STATE, ...over };
  return calculateAffordability(
    buildCalculatorInputs(state),
    buildScenarioOptions(state),
  );
}

/**
 * Zero income used to give a debt-to-income ratio of zero — the
 * divide-by-zero guard reading as "no debt burden" — so the affordability
 * solver's `backEnd <= target` test passed and DTI never bound. It reported a
 * $450,000 ceiling for a buyer with no income.
 */
describe("no income cannot pass the debt-to-income test", () => {
  it("reports an unbounded ratio rather than zero", () => {
    const s = scenarioFor({ annualHouseholdIncome: 0, annualIncome: 0 });
    expect(s.monthly.total).toBeGreaterThan(0);
    expect(s.dti.backEnd).toBe(Number.POSITIVE_INFINITY);
    expect(s.dti.frontEnd).toBe(Number.POSITIVE_INFINITY);
    expect(s.dti.withinGuidelines).toBe(false);
  });

  it("affords nothing", () => {
    const a = affordabilityFor({ annualHouseholdIncome: 0, annualIncome: 0 });
    expect(a.maxPurchasePrice).toBe(0);
  });

  it("still reports zero, not unbounded, when there is no payment either", () => {
    const s = scenarioFor({
      annualHouseholdIncome: 0,
      annualIncome: 0,
      purchasePrice: 0,
      hoaCertainty: "none",
      separateWindstormPolicy: false,
      monthlyDebtPayments: 0,
    });
    expect(s.monthly.total).toBe(0);
    expect(s.dti.backEnd).toBe(0);
  });

  it("renders an unbounded ratio as a dash, not as Infinity%", () => {
    expect(formatPercent(Number.POSITIVE_INFINITY, 1)).toBe("—");
    expect(formatPercent(Number.NaN, 1)).toBe("—");
    expect(formatPercent(0.46, 0)).toBe("46%");
  });

  it("keeps a normal income working", () => {
    const s = scenarioFor({});
    expect(Number.isFinite(s.dti.backEnd)).toBe(true);
    expect(s.dti.backEnd).toBeGreaterThan(0);
  });
});

/**
 * The button wrote the current purchase price into the field that also carries
 * the parcel's roll value. Renegotiate afterwards and the app attributed a
 * value to the appraisal district it had never published, invented a protest
 * opportunity from the difference, and dropped the real risk running the other
 * way. It was also one-way.
 */
describe("billing tax at the purchase price stores intent, not a snapshot", () => {
  const PARCEL_ROLL = 233_790;

  const withParcel = (over: Partial<typeof DEFAULT_STATE>) => ({
    ...DEFAULT_STATE,
    purchasePrice: 400_000,
    taxAppraisedValueOverride: PARCEL_ROLL,
    ...over,
  });

  it("defaults to the roll, which is what gets billed this year", () => {
    const i = buildCalculatorInputs(withParcel({}));
    expect(i.property.taxAppraisedValue).toBe(PARCEL_ROLL);
  });

  it("follows the price when asked, at the original price", () => {
    const i = buildCalculatorInputs(withParcel({ taxOnPurchasePrice: true }));
    expect(i.property.taxAppraisedValue).toBe(400_000);
  });

  it("follows the price after a renegotiation instead of going stale", () => {
    const i = buildCalculatorInputs(
      withParcel({ taxOnPurchasePrice: true, purchasePrice: 360_000 }),
    );
    expect(i.property.taxAppraisedValue).toBe(360_000);

    // And so no phantom gap appears in either direction.
    const gap = assessAppraisalGap({
      appraisedValue: i.property.taxAppraisedValue,
      purchasePrice: 360_000,
      units: i.property.taxingUnits,
      claimHomestead: true,
    });
    expect(gap.direction).toBe("aligned");
    expect(gap.material).toBe(false);
  });

  it("leaves the roll value intact so the choice is reversible", () => {
    const on = withParcel({ taxOnPurchasePrice: true, purchasePrice: 360_000 });
    expect(on.taxAppraisedValueOverride).toBe(PARCEL_ROLL);

    const off = buildCalculatorInputs({ ...on, taxOnPurchasePrice: false });
    expect(off.property.taxAppraisedValue).toBe(PARCEL_ROLL);
  });
});

/**
 * Rows and the total were rounded independently, so a column of whole dollars
 * could sum to $1,860 beneath a total reading $1,858.
 */
describe("displayed line items add up to the displayed total", () => {
  it("absorbs the rounding residue into the largest row", () => {
    const values = [1_444.72, 205.86, 97.78, 107.56, 95.54, 66.67];
    const total = values.reduce((a, v) => a + v, 0);
    const rounded = roundToMatchTotal(values, total);
    expect(rounded.reduce((a, v) => a + v, 0)).toBe(Math.round(total));
    // Only the largest row absorbs it, and only by a dollar or two.
    const largest = values.indexOf(Math.max(...values));
    for (let i = 0; i < values.length; i += 1) {
      if (i === largest) continue;
      expect(rounded[i]).toBe(Math.round(values[i]));
    }
    expect(Math.abs(rounded[largest] - Math.round(values[largest]))).toBeLessThan(3);
  });

  it("holds for the real payment across a range of prices", () => {
    for (const purchasePrice of [180_000, 214_900, 250_000, 333_333, 615_000]) {
      const m = scenarioFor({ purchasePrice }).monthly;
      const rows = [
        m.principalAndInterest,
        m.propertyTax,
        m.homeownersInsurance,
        m.windstormInsurance,
        m.floodInsurance,
        m.mortgageInsurance,
        m.hoa,
        m.mudUtility,
        m.pidAssessment,
        m.assistanceSecondLien,
      ].filter((v) => v > 0);
      const rounded = roundToMatchTotal(rows, m.total);
      expect(rounded.reduce((a, v) => a + v, 0)).toBe(Math.round(m.total));
    }
  });

  it("is a no-op on an empty set and on already-exact values", () => {
    expect(roundToMatchTotal([], 0)).toEqual([]);
    expect(roundToMatchTotal([10, 20, 30], 60)).toEqual([10, 20, 30]);
  });
});

/**
 * These four cities supply no water, so they deliberately have no entry in the
 * city rate table — a parcel carrying one of their districts resolves as
 * district-served instead. That was a comment; now it is checked.
 */
describe("cities that supply no water have no city schedule", () => {
  it("holds for all four", () => {
    expect(CITIES_WITHOUT_CITY_WATER).toHaveLength(4);
    for (const code of CITIES_WITHOUT_CITY_WATER) {
      expect(hasCityWaterSchedule(code)).toBe(false);
    }
  });

  it("and every city that does supply water has one", () => {
    for (const code of ["C40", "061", "084", "076", "074", "073", "058", "C37"]) {
      expect(hasCityWaterSchedule(code)).toBe(true);
    }
  });
});

/**
 * A blank price should not leave a payment behind. It used to show $67 a month
 * — the HOA estimate — for a house costing nothing.
 */
describe("a blank price", () => {
  it("does not produce a payment out of nothing", () => {
    const s = scenarioFor({ purchasePrice: 0 });
    expect(s.monthly.total).toBe(0);
    expect(s.monthly.hoa).toBe(0);
    expect(s.cashToClose.totalRequired).toBe(0);
  });
});

/** Nothing in the payment should ever be negative or non-finite. */
describe("the payment stays well-formed on hostile input", () => {
  const cases: [string, Partial<typeof DEFAULT_STATE>][] = [
    ["zero price", { purchasePrice: 0 }],
    ["one dollar", { purchasePrice: 1 }],
    ["huge price", { purchasePrice: 50_000_000 }],
    ["zero rate", { interestRate: 0 }],
    ["absurd rate", { interestRate: 0.5 }],
    ["one-year term", { termYears: 1 }],
    ["credit floor", { creditScore: 300 }],
    ["credit ceiling", { creditScore: 900 }],
    ["debt exceeds income", { monthlyDebtPayments: 99_999 }],
    ["negative floor area", { livingSqFt: -100 }],
    ["empty household", { householdSize: 0 }],
    ["no income", { annualHouseholdIncome: 0, annualIncome: 0 }],
  ];

  for (const [label, over] of cases) {
    it(label, () => {
      const s = scenarioFor(over);
      for (const [key, value] of Object.entries(s.monthly)) {
        expect(Number.isFinite(value), `monthly.${key} = ${value}`).toBe(true);
        expect(value, `monthly.${key}`).toBeGreaterThanOrEqual(0);
      }
      for (const [key, value] of Object.entries(s.cashToClose)) {
        expect(Number.isFinite(value), `cashToClose.${key} = ${value}`).toBe(
          true,
        );
      }
      // The total is always the sum of its parts.
      const sum =
        s.monthly.principalAndInterest +
        s.monthly.propertyTax +
        s.monthly.homeownersInsurance +
        s.monthly.windstormInsurance +
        s.monthly.floodInsurance +
        s.monthly.mortgageInsurance +
        s.monthly.hoa +
        s.monthly.mudUtility +
        s.monthly.pidAssessment +
        s.monthly.assistanceSecondLien;
      expect(s.monthly.total).toBeCloseTo(sum, 2);
    });
  }
});

/** A utility district can only bill a parcel its own county appraises. */
describe("cross-county leakage stays impossible", () => {
  it("a Galveston MUD never reaches a Harris bill", () => {
    const galvestonMud = requireUnit("galveston", "M36");
    expect(galvestonMud.county).toBe("galveston");
    const harrisUnit = requireUnit("harris", "027");
    expect(harrisUnit.county).toBe("harris");
  });
});

/**
 * A resolved parcel is not the same thing as a parcel that can be billed. A
 * Harris account with no row in the stored footprint is a real property that
 * Clear Creek ISD does not bill: it resolves fine, carries no taxing units, and
 * the tax silently falls back to the location preset. The UI gated its "these
 * taxes are a location guess" warning on whether a parcel existed, so it
 * suppressed the warning in precisely the case where the guess was still in
 * force. Engine and UI now read the same flag.
 */
describe("the tax source is reported as what it actually is", () => {
  const parcelWith = (taxUnitCodes: string[]): ResolvedParcel =>
    ({ ref: { county: "harris", id: "x" }, taxUnitCodes }) as ResolvedParcel;

  it("bills from the parcel when the parcel has units", () => {
    const r = resolveStateTaxUnits({
      ...DEFAULT_STATE,
      resolvedParcel: parcelWith(["027", "040", "061"]),
    });
    expect(r.fromParcel).toBe(true);
    expect(r.units.length).toBeGreaterThan(0);
  });

  it("admits the preset when a resolved parcel carries no units", () => {
    const r = resolveStateTaxUnits({
      ...DEFAULT_STATE,
      resolvedParcel: parcelWith([]),
    });
    expect(r.fromParcel).toBe(false);
    // The preset still bills, so the payment is not silently zero.
    expect(r.units.length).toBeGreaterThan(0);
  });

  it("admits the preset when none of the parcel's codes resolve to a unit", () => {
    const r = resolveStateTaxUnits({
      ...DEFAULT_STATE,
      resolvedParcel: parcelWith(["ZZZ", "QQQ"]),
    });
    expect(r.fromParcel).toBe(false);
  });

  it("admits the preset with no parcel at all", () => {
    expect(
      resolveStateTaxUnits({ ...DEFAULT_STATE, resolvedParcel: null })
        .fromParcel,
    ).toBe(false);
  });

  it("is the same set of units the engine actually bills", () => {
    for (const parcel of [
      parcelWith(["027", "040", "061"]),
      parcelWith([]),
      null,
    ]) {
      const state = { ...DEFAULT_STATE, resolvedParcel: parcel };
      expect(buildCalculatorInputs(state).property.taxingUnits).toEqual(
        resolveStateTaxUnits(state).units,
      );
    }
  });
});

/**
 * HC MUD 568 (`A76`) bills real Clear Creek ISD parcels and Harris County
 * publishes no rate for it, so the buyer is asked for one. Two things went
 * wrong around that.
 */
describe("a taxing unit the county publishes no rate for", () => {
  // A real Friendswood parcel: Clear Creek ISD, the county units, Houston, and
  // HC MUD 568, which is collected privately.
  const A76_PARCEL = ["027", "040", "041", "042", "043", "044", "061", "A76"];
  const withA76 = (unknownRateOverrides: Record<string, number>) => ({
    ...DEFAULT_STATE,
    resolvedParcel: {
      ref: { county: "harris", id: "0402100000030" },
      taxUnitCodes: A76_PARCEL,
    } as ResolvedParcel,
    unknownRateOverrides,
  });

  it("is asked about rather than billed as zero", () => {
    const r = resolveStateTaxUnits(withA76({}));
    expect(r.missingRateCodes.map((m) => m.code)).toEqual(["A76"]);
    expect(r.units.some((u) => u.code === "A76")).toBe(false);
  });

  /*
   * The risk card used to read the parcel's own snapshot, which never shrinks,
   * so it kept telling the buyer to enter a rate they had already entered and
   * kept asserting the district was billing zero when the payment included it.
   */
  it("stops being reported once the buyer prices it", () => {
    const r = resolveStateTaxUnits(withA76({ A76: 0.25 }));
    expect(r.missingRateCodes).toEqual([]);
    const unit = r.units.find((u) => u.code === "A76");
    expect(unit?.ratePer100).toBe(0.25);
  });

  it("raises the actual tax bill by the amount that rate implies", () => {
    const base = buildScenario(
      buildCalculatorInputs(withA76({})),
      buildScenarioOptions(withA76({})),
    );
    const priced = buildScenario(
      buildCalculatorInputs(withA76({ A76: 0.25 })),
      buildScenarioOptions(withA76({ A76: 0.25 })),
    );
    expect(priced.monthly.propertyTax).toBeGreaterThan(
      base.monthly.propertyTax,
    );
  });

  /*
   * The field starts at 0, so a buyer who types into it and clears it again
   * leaves 0 behind. Honouring that as a real rate would drop the district from
   * the bill and take the warning down with it — the largest single way this
   * payment can be understated, and silent.
   */
  it("treats a cleared field as unanswered, not as a rate of zero", () => {
    for (const override of [0, -1]) {
      const r = resolveStateTaxUnits(withA76({ A76: override }));
      expect(r.missingRateCodes.map((m) => m.code), `${override}`).toEqual([
        "A76",
      ]);
    }
  });

  /*
   * A unit that genuinely levies nothing is a different thing, carries a real
   * zero in the catalog, and is correctly never asked about. Clear Lake Shores
   * is the live example.
   */
  it("does not ask about a district that really levies nothing", () => {
    const r = resolveStateTaxUnits({
      ...DEFAULT_STATE,
      resolvedParcel: {
        ref: { county: "galveston", id: "x" },
        taxUnitCodes: ["S16", "C46"],
      } as ResolvedParcel,
    });
    expect(r.missingRateCodes).toEqual([]);
    expect(r.units.some((u) => u.code === "C46")).toBe(false);
  });
});

/**
 * Whole dollars are the default display, so any amount between -50c and zero
 * used to render as a minus sign in front of nothing: "-$0". Reachable wherever
 * a credit nearly cancels a cost.
 */
describe("money never renders a negative zero", () => {
  it("shows zero for anything that rounds to zero", () => {
    for (const value of [-0, -0.001, -0.2, -0.49, 0, 0.2, 0.49]) {
      expect(formatUSD(value), `${value}`).toBe("$0");
    }
  });

  it("still shows real negatives", () => {
    expect(formatUSD(-1.2)).toBe("-$1");
    expect(formatUSD(-2_500)).toBe("-$2,500");
  });

  it("respects the requested precision", () => {
    expect(formatUSD(-0.004, 2)).toBe("$0.00");
    expect(formatUSD(-0.02, 2)).toBe("-$0.02");
    expect(formatUSD(1_234.567, 2)).toBe("$1,234.57");
  });
});

/**
 * Every row of the program comparison is priced with no assistance so the
 * programs compare on their own terms. That is deliberate, but it means the row
 * badged "Selected" shows a different payment from the one at the top of the
 * page whenever assistance is selected — so the table has to say so.
 */
describe("the program comparison is priced without assistance", () => {
  const withAssistance = {
    ...DEFAULT_STATE,
    selectedAssistanceIds: ["tsahc-home-sweet-texas"],
  };

  it("differs from the payment the buyer is actually shown", () => {
    const detail = buildScenario(
      buildCalculatorInputs(withAssistance),
      buildScenarioOptions(withAssistance),
    );
    const stripped = { ...withAssistance, selectedAssistanceIds: [] };
    const row = buildScenario(
      buildCalculatorInputs(stripped, detail.program.id),
      buildScenarioOptions(stripped),
    );
    // If these ever coincide the caption is harmless; the point is that the
    // comparison is built from the stripped state, which is what it claims.
    expect(row.monthly.total).not.toBe(detail.monthly.total);
  });

  it("prices every program off the one engine, not a parallel path", () => {
    for (const programId of ["fha", "usda", "va", "conv-97"] as const) {
      const stripped = { ...DEFAULT_STATE, selectedAssistanceIds: [] };
      const a = buildScenario(
        buildCalculatorInputs(stripped, programId),
        buildScenarioOptions(stripped),
      );
      const b = buildScenario(
        buildCalculatorInputs(stripped, programId),
        buildScenarioOptions(stripped),
      );
      expect(a.monthly.total).toBe(b.monthly.total);
      expect(a.cashToClose.netCashDue).toBe(b.cashToClose.netCashDue);
    }
  });
});

/**
 * Stored state is merged over the defaults so an older build's inputs survive
 * an upgrade. `programId` indexes straight into the loan-program table, so a
 * stored id that no longer names a program took the whole page down — and the
 * calculator *is* the page, so the only way back was clearing site data by
 * hand. Parsing successfully is not the same as being usable.
 */
describe("state read back from storage is repaired before it is trusted", () => {
  it("replaces a program id that names nothing", () => {
    const revived = reviveState({
      ...DEFAULT_STATE,
      programId: "conventional-97" as never, // a plausible rename
    });
    expect(revived.programId).toBe(DEFAULT_STATE.programId);
    // And the thing that used to crash now works.
    expect(() => buildCalculatorInputs(revived)).not.toThrow();
  });

  it("leaves a valid program id alone, along with everything else", () => {
    const stored = { ...DEFAULT_STATE, programId: "fha" as const, purchasePrice: 321_000 };
    const revived = reviveState(stored);
    expect(revived.programId).toBe("fha");
    expect(revived).toEqual(stored);
  });

  it("covers every program the app can actually select", () => {
    for (const programId of Object.keys(LOAN_PROGRAMS) as LoanProgramId[]) {
      expect(reviveState({ ...DEFAULT_STATE, programId }).programId).toBe(
        programId,
      );
    }
  });
});
