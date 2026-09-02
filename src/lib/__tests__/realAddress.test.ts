import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, DWELLING_COVERAGE_FRACTION } from "@/lib/defaults";
import { buildCalculatorInputs, buildScenarioOptions } from "@/lib/buildFromState";
import { buildScenario } from "@/lib/scenario";
import { resolveUnitsFromCodes } from "@/lib/lookups/resolveCodes";
import { checkEligibility, LOAN_PROGRAMS } from "@/lib/loanPrograms";
import { calculatePropertyTax } from "@/lib/propertyTax";
import type { ResolvedParcel } from "@/lib/lookups/types";

/**
 * One real address, end to end, pinned to the appraisal record.
 *
 * 6210 Vinewood Ln, League City. Galveston CAD parcel 2815-0010-0032-000,
 * entities C40/CAD/GGA/RFL/S16, appraised at $260,000 in the April 2026 drop,
 * listed at $214,900. No utility district.
 *
 * The unit tests elsewhere check each piece against a contrived value. This
 * checks that the pieces compose into the right payment for a house that
 * actually exists, which is the only test that would have caught a wiring
 * mistake between two individually-correct components.
 */
const PARCEL: ResolvedParcel = {
  ref: { county: "galveston", id: "2815-0010-0032-000" },
  situs: "6210 VINEWOOD LN LEAGUE CITY, TX 77573",
  taxUnitCodes: ["C40", "CAD", "GGA", "RFL", "S16"],
  taxingUnits: [],
  missingRateCodes: [],
  nonLevyingCodes: [],
  totalValue: 260_000,
  landValue: 24_910,
  improvementValue: 235_090,
  yearBuilt: null,
  livingSqFt: null,
  sellerExemptions: null,
  centroid: null,
  usdaEligible: null,
  flood: null,
  isClearCreekIsd: true,
  schoolCodes: ["S16"],
  schoolNames: ["Clear Creek ISD"],
  splitBetweenSchoolDistricts: false,
  inferredLocationId: "league-city",
  hasUtilityDistrict: false,
  inWindstormArea: true,
  vintage: "GCAD parcel drop, April 2026",
  lookupAt: "2026-09-02T00:00:00.000Z",
};

const STATE = {
  ...DEFAULT_STATE,
  purchasePrice: 214_900,
  resolvedParcel: PARCEL,
  locationId: "league-city",
  taxAppraisedValueOverride: 260_000,
  annualHouseholdIncome: 121_000,
  annualIncome: 121_000,
  householdSize: 4,
  creditScore: 740,
  monthlyDebtPayments: 550,
  cashAvailable: 10_000,
  firstTimeBuyer: true,
  hoaCertainty: "unknown" as const,
  separateWindstormPolicy: true,
  windstormUncertain: false,
};

describe("6210 Vinewood Ln, League City", () => {
  it("bills the four Galveston units the appraisal record lists, and no MUD", () => {
    const resolved = resolveUnitsFromCodes("galveston", PARCEL.taxUnitCodes);
    expect(resolved.units.map((u) => u.code).sort()).toEqual([
      "C40",
      "GGA",
      "RFL",
      "S16",
    ]);
    expect(resolved.hasUtilityDistrict).toBe(false);
    expect(resolved.isClearCreekIsd).toBe(true);
  });

  it("taxes the appraised value, not the listing price", () => {
    const inputs = buildCalculatorInputs(STATE);
    // The loan is sized from the price; the tax is estimated from the roll.
    expect(inputs.property.taxAppraisedValue).toBe(260_000);
    expect(inputs.property.purchasePrice).toBe(214_900);

    const tax = calculatePropertyTax({
      appraisedValue: 260_000,
      units: inputs.property.taxingUnits,
      claimHomestead: true,
    });
    expect(tax.monthlyTax).toBeCloseTo(205.86, 1);
    expect(tax.annualTax).toBeCloseTo(2_470.29, 1);
  });

  /**
   * The appraisal is 21% ABOVE the listing price, which is unusual and runs in
   * the buyer's favour: a protest to the sale price is the largest single
   * saving available on this house.
   */
  it("shows what a protest down to the sale price is worth", () => {
    const units = buildCalculatorInputs(STATE).property.taxingUnits;
    const onRoll = calculatePropertyTax({
      appraisedValue: 260_000,
      units,
      claimHomestead: true,
    });
    const atSalePrice = calculatePropertyTax({
      appraisedValue: 214_900,
      units,
      claimHomestead: true,
    });
    const monthlySaving = onRoll.monthlyTax - atSalePrice.monthlyTax;
    expect(monthlySaving).toBeGreaterThan(50);
    expect(monthlySaving).toBeLessThan(60);
  });

  it("prices both coastal policies against dwelling coverage", () => {
    const inputs = buildCalculatorInputs(STATE);
    const dwelling = 214_900 * DWELLING_COVERAGE_FRACTION;

    // Wind is carved out of the homeowners policy here, so it is the cheaper
    // ex-wind rate rather than the all-perils one.
    expect(inputs.property.annualHomeownersInsurance).toBeCloseTo(
      (dwelling / 1_000) * 7.0,
      0,
    );
    expect(inputs.property.annualWindstormInsurance).toBeCloseTo(
      (dwelling / 1_000) * 7.7,
      0,
    );
    expect(inputs.property.windExposure).toBe("designated");
  });

  it("composes into the payment shown in the UI", () => {
    const scenario = buildScenario(
      buildCalculatorInputs(STATE),
      buildScenarioOptions(STATE),
    );
    const m = scenario.monthly;

    expect(m.propertyTax).toBeCloseTo(205.86, 1);
    expect(m.homeownersInsurance).toBeCloseTo(97.78, 1);
    expect(m.windstormInsurance).toBeCloseTo(107.56, 1);
    expect(m.hoa).toBeCloseTo(66.67, 1);
    // Flood is zero because Galveston publishes no geometry to test, NOT
    // because this address is known to be outside a flood zone.
    expect(m.floodInsurance).toBe(0);

    // The total is computed from unrounded components, so it will not equal
    // the sum of the rounded line items the UI displays.
    const sum =
      m.principalAndInterest +
      m.propertyTax +
      m.homeownersInsurance +
      m.windstormInsurance +
      m.mortgageInsurance +
      m.hoa +
      m.mudUtility +
      m.pidAssessment +
      m.assistanceSecondLien;
    expect(m.total).toBeCloseTo(sum, 2);
  });

  it("screens out the income-limited programs at $121,000 for four people", () => {
    const inputs = buildCalculatorInputs(STATE);
    const options = buildScenarioOptions(STATE);

    // HomeReady and Home Possible cap at 80% AMI, well below this income, so
    // the winning conventional path has to be plain Conventional 97 — which
    // also means no discounted mortgage insurance.
    for (const id of ["homeready", "home-possible"] as const) {
      const finding = checkEligibility({
        program: LOAN_PROGRAMS[id],
        buyer: inputs.buyer,
        property: inputs.property,
        areaMedianIncome: options.areaMedianIncome,
        usdaAddressConfirmed: STATE.usdaAddressConfirmed,
        loanAmount: 208_453,
      });
      expect(finding.status).toBe("ineligible");
      expect(finding.reasons.join(" ")).toMatch(/income/i);
    }

    // USDA is unavailable everywhere in this district, not just here.
    const usda = checkEligibility({
      program: LOAN_PROGRAMS.usda,
      buyer: inputs.buyer,
      property: inputs.property,
      areaMedianIncome: options.areaMedianIncome,
      usdaAddressConfirmed: false,
      loanAmount: 208_453,
    });
    expect(usda.status).toBe("ineligible");
  });
});
