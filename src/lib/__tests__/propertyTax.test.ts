import { describe, expect, it } from "vitest";
import { calculatePropertyTax, projectAppraisedValues } from "../propertyTax";
import {
  CITY_SUGAR_LAND,
  FORT_BEND_COUNTY_DRAINAGE,
  FORT_BEND_COUNTY_GENERAL,
  FORT_BEND_ISD,
  findLocationPreset,
  resolveAlternateDistrictUnits,
  resolveTaxingUnits,
} from "@/data/fortBendTaxRates";

const SUGAR_LAND_UNITS = [
  FORT_BEND_ISD,
  FORT_BEND_COUNTY_GENERAL,
  FORT_BEND_COUNTY_DRAINAGE,
  CITY_SUGAR_LAND,
];

describe("calculatePropertyTax", () => {
  it("applies the flat school exemption and percentage exemptions per unit", () => {
    const result = calculatePropertyTax({
      appraisedValue: 400_000,
      units: SUGAR_LAND_UNITS,
      claimHomestead: true,
    });

    const school = result.lineItems.find((r) => r.unit.id === "fbisd")!;
    // $400k less the $140k state exemption, at $1.0569 per $100.
    expect(school.taxableValue).toBe(260_000);
    expect(school.annualTax).toBeCloseTo((260_000 * 1.0569) / 100, 2);

    const county = result.lineItems.find((r) => r.unit.id === "county-general")!;
    // County grants 20%, so $320k taxable at $0.412 per $100.
    expect(county.taxableValue).toBe(320_000);
    expect(county.annualTax).toBeCloseTo((320_000 * 0.412) / 100, 2);

    const city = result.lineItems.find((r) => r.unit.id === "city-sugar-land")!;
    // Sugar Land grants 15%, so $340k taxable.
    expect(city.taxableValue).toBe(340_000);

    const drainage = result.lineItems.find(
      (r) => r.unit.id === "county-drainage",
    )!;
    // Drainage grants no homestead exemption at all.
    expect(drainage.taxableValue).toBe(400_000);
  });

  it("taxes the full value when no homestead is claimed", () => {
    const withHomestead = calculatePropertyTax({
      appraisedValue: 400_000,
      units: SUGAR_LAND_UNITS,
      claimHomestead: true,
    });
    const without = calculatePropertyTax({
      appraisedValue: 400_000,
      units: SUGAR_LAND_UNITS,
      claimHomestead: false,
    });

    expect(without.annualTax).toBeGreaterThan(withHomestead.annualTax);
    expect(without.homesteadSavings).toBe(0);
    expect(withHomestead.homesteadSavings).toBeCloseTo(
      without.annualTax - withHomestead.annualTax,
      2,
    );
  });

  it("saves a meaningful amount on a typical Fort Bend home", () => {
    const result = calculatePropertyTax({
      appraisedValue: 400_000,
      units: SUGAR_LAND_UNITS,
      claimHomestead: true,
    });
    // The exemptions are worth well over $2,000 a year at this value.
    expect(result.homesteadSavings).toBeGreaterThan(2_000);
  });

  it("honors the $5,000 floor on percentage exemptions for low values", () => {
    // At $20,000 appraised, Sugar Land's 15% would be $3,000, so the
    // statutory $5,000 minimum should govern instead.
    const result = calculatePropertyTax({
      appraisedValue: 20_000,
      units: [CITY_SUGAR_LAND],
      claimHomestead: true,
    });
    expect(result.lineItems[0].exemptionApplied).toBe(5_000);
  });

  it("never produces a negative taxable value", () => {
    const result = calculatePropertyTax({
      appraisedValue: 100_000,
      units: [FORT_BEND_ISD],
      claimHomestead: true,
    });
    // $100k home with a $140k exemption owes zero school tax, not negative.
    expect(result.lineItems[0].taxableValue).toBe(0);
    expect(result.annualTax).toBe(0);
  });

  it("produces an effective rate below the nominal rate when homesteaded", () => {
    const result = calculatePropertyTax({
      appraisedValue: 400_000,
      units: SUGAR_LAND_UNITS,
      claimHomestead: true,
    });
    expect(result.effectiveRate).toBeLessThan(result.combinedNominalRate);
  });

  it("shows a utility district adding materially to the bill", () => {
    const withoutMud = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("unincorporated-mud", "none", null),
      claimHomestead: true,
    });
    const withHighMud = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("unincorporated-mud", "mud-162", null),
      claimHomestead: true,
    });

    // MUD 162 is $1.10 per $100 with no homestead exemption, so it should add
    // about $4,400 a year on a $400,000 home.
    expect(withHighMud.annualTax - withoutMud.annualTax).toBeCloseTo(4_400, -2);
  });
});

describe("resolveTaxingUnits", () => {
  it("prefers a manually entered utility rate over the preset", () => {
    const units = resolveTaxingUnits("unincorporated-mud", "mud-162", 0.55);
    const manual = units.find((u) => u.id === "manual-utility");
    expect(manual?.ratePer100).toBe(0.55);
    expect(units.some((u) => u.id === "mud-162")).toBe(false);
  });

  it("omits a zero-rate utility district entirely", () => {
    const units = resolveTaxingUnits("sugar-land", "none", null);
    expect(units.some((u) => u.kind === "mud")).toBe(false);
  });

  it("puts every Rosharon and Richmond preset in Fort Bend ISD with no city tax", () => {
    for (const id of ["rosharon-fbisd", "richmond-fbisd"]) {
      const units = resolveTaxingUnits(id, "none", null);
      expect(units.some((u) => u.id === "fbisd")).toBe(true);
      // Both are unincorporated, so an emergency services district stands in
      // for city fire protection and there is no city line at all.
      expect(units.some((u) => u.kind === "city")).toBe(false);
      expect(units.some((u) => u.kind === "esd")).toBe(true);
    }
  });
});

describe("resolveAlternateDistrictUnits", () => {
  it("returns null where the school district is not in doubt", () => {
    expect(resolveAlternateDistrictUnits("sugar-land", "none", null)).toBeNull();
  });

  it("swaps Fort Bend ISD for Lamar CISD plus a city rate for Richmond", () => {
    const units = resolveAlternateDistrictUnits("richmond-fbisd", "none", null)!;
    expect(units.some((u) => u.id === "fbisd")).toBe(false);
    expect(units.some((u) => u.id === "lamar-cisd")).toBe(true);
    expect(units.some((u) => u.id === "city-richmond")).toBe(true);
  });

  it("carries the utility district across so it cancels out of the comparison", () => {
    const expected = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("richmond-fbisd", "mud-162", null),
      claimHomestead: true,
    });
    const alternate = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveAlternateDistrictUnits("richmond-fbisd", "mud-162", null)!,
      claimHomestead: true,
    });

    expect(
      alternate.lineItems.find((r) => r.unit.id === "mud-162")?.annualTax,
    ).toBe(expected.lineItems.find((r) => r.unit.id === "mud-162")?.annualTax);

    // Lamar costs 9 cents per $100 more on $260,000 of taxable value, and the
    // city adds $0.63 on $386,000 while the ESD it replaces drops off.
    expect(alternate.annualTax - expected.annualTax).toBeGreaterThan(2_000);
  });

  it("gives every risk-flagged preset a different school district", () => {
    for (const preset of [findLocationPreset("richmond-fbisd")]) {
      const risk = preset.districtRisk!;
      const baseSchool = preset.baseUnits.find((u) => u.kind === "school");
      const altSchool = risk.alternateUnits.find((u) => u.kind === "school");
      expect(altSchool?.id).not.toBe(baseSchool?.id);
    }
  });
});

describe("projectAppraisedValues", () => {
  it("caps homestead growth at 10% a year once protection begins", () => {
    const values = projectAppraisedValues({
      startingValue: 400_000,
      years: 4,
      marketGrowthRate: 0.25,
      capActive: true,
      yearsBeforeCapApplies: 1,
    });

    // Year 1 has no cap protection, so it tracks the market.
    expect(values[0]).toBeCloseTo(500_000, 0);
    // Years 2+ are capped at 10% growth on the prior appraised value.
    expect(values[1]).toBeCloseTo(550_000, 0);
    expect(values[2]).toBeCloseTo(605_000, 0);
  });

  it("tracks the market exactly when the cap is inactive", () => {
    const values = projectAppraisedValues({
      startingValue: 400_000,
      years: 2,
      marketGrowthRate: 0.25,
      capActive: false,
    });
    expect(values[0]).toBeCloseTo(500_000, 0);
    expect(values[1]).toBeCloseTo(625_000, 0);
  });

  it("never exceeds market value even under the cap", () => {
    const values = projectAppraisedValues({
      startingValue: 400_000,
      years: 5,
      marketGrowthRate: 0.02,
      capActive: true,
    });
    values.forEach((value, index) => {
      expect(value).toBeLessThanOrEqual(400_000 * Math.pow(1.02, index + 1) + 1);
    });
  });

  it("leaves the first two years uncapped by default", () => {
    const values = projectAppraisedValues({
      startingValue: 400_000,
      years: 3,
      marketGrowthRate: 0.25,
      capActive: true,
    });

    expect(values[0]).toBeCloseTo(500_000, 0);
    expect(values[1]).toBeCloseTo(625_000, 0);
    expect(values[2]).toBeCloseTo(687_500, 0);
  });
});
