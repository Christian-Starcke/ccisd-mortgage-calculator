import { describe, expect, it } from "vitest";
import { ASSISTANCE_PROGRAMS } from "@/data/assistancePrograms";
import { computeAward } from "@/lib/assistance";
import {
  DEFAULT_CLOSING_COST_ASSUMPTIONS,
  texasOwnersTitlePremium,
} from "@/lib/closingCosts";
import { estimateHomeownersInsurance } from "@/lib/defaults";

describe("Mortgage Credit Certificate", () => {
  it("does not clip a 15% Texas MCC at the $2,000 IRC cap", () => {
    const mcc = ASSISTANCE_PROGRAMS.find((program) => program.id === "tsahc-mcc");
    expect(mcc).toBeDefined();
    expect(mcc!.taxCreditRate).toBe(0.15);
    expect(mcc!.taxCreditAnnualCap).toBeNull();

    const award = computeAward({
      program: mcc!,
      purchasePrice: 400_000,
      loanAmount: 300_000,
      annualInterestAtOrigination: 300_000 * 0.065,
    });

    expect(award.annualTaxCredit).toBeCloseTo(2_925, 0);
    expect(award.annualTaxCredit).toBeGreaterThan(2_000);
  });
});

describe("Texas title premium", () => {
  it("uses the promulgated Basic Rate between $100,000 and $1,000,000", () => {
    expect(texasOwnersTitlePremium(400_000)).toBe(2_262);
  });

  it("prices the simultaneous lender policy at the Rule R-5 $100", () => {
    expect(DEFAULT_CLOSING_COST_ASSUMPTIONS.lendersTitlePolicyFee).toBe(100);
  });
});

describe("homeowners insurance default", () => {
  it("is written against dwelling coverage rather than purchase price", () => {
    const dwellingBased = estimateHomeownersInsurance(400_000, 9.5);
    const wholeHouse = ((400_000 / 1_000) * 9.5);
    expect(dwellingBased).toBeCloseTo(2_964, 0);
    expect(dwellingBased).toBeLessThan(wholeHouse);
  });
});

describe("2026 assistance facts", () => {
  it("models Houston HAP, Harris County DAP, TDHCA and TSAHC at the refreshed figures", () => {
    const houston = ASSISTANCE_PROGRAMS.find((p) => p.id === "houston-hap")!;
    const county = ASSISTANCE_PROGRAMS.find(
      (p) => p.id === "harris-county-dap",
    )!;
    const tdhca = ASSISTANCE_PROGRAMS.find(
      (p) => p.id === "tdhca-my-first-texas-home",
    )!;
    const tsahc = ASSISTANCE_PROGRAMS.find(
      (p) => p.id === "tsahc-home-sweet-texas",
    )!;
    const seth = ASSISTANCE_PROGRAMS.find((p) => p.id === "seth-5-star")!;

    expect(houston.benefitValue).toBe(75_000);
    expect(county.benefitValue).toBe(23_800);
    expect(tdhca.eligibility.maxHouseholdIncome).toBe(101_100);
    expect(tdhca.eligibility.maxHouseholdIncomeHouseholdsOf3OrMore).toBe(116_265);
    expect(tdhca.eligibility.maxPurchasePrice).toBe(544_232);
    expect(tsahc.ratePremium).toBe(0.0075);
    expect(seth.ratePremium).toBe(0.0075);
    expect(
      ASSISTANCE_PROGRAMS.some((program) => /wells fargo/i.test(program.name)),
    ).toBe(false);
  });

  it("scopes local programmes to the government that actually administers them", () => {
    const houston = ASSISTANCE_PROGRAMS.find((p) => p.id === "houston-hap")!;
    const harris = ASSISTANCE_PROGRAMS.find((p) => p.id === "harris-county-dap")!;

    // Houston's award is city-limits only.
    expect(houston.eligibility.eligibleLocationIds).toEqual([
      "houston-clear-lake",
    ]);

    // The county programme reaches Harris County outside Houston, and none of
    // the Galveston County side of the district.
    const harrisIds = harris.eligibility.eligibleLocationIds!;
    expect(harrisIds).toContain("webster");
    expect(harrisIds).not.toContain("houston-clear-lake");
    for (const galveston of [
      "league-city",
      "kemah",
      "clear-lake-shores",
      "unincorporated-galveston",
    ]) {
      expect(harrisIds).not.toContain(galveston);
    }
  });

  it("carries no unscoped local programme that would leak across the county line", () => {
    for (const program of ASSISTANCE_PROGRAMS) {
      if (!/city of|county/i.test(program.administrator)) continue;
      // A local government programme with no location scope would be offered
      // on every address in the district, including the other county's.
      expect(program.eligibility.eligibleLocationIds).not.toBeNull();
    }
  });
});
