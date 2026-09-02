import { describe, expect, it } from "vitest";
import { calculatePropertyTax, projectAppraisedValues } from "../propertyTax";
import {
  CLEAR_CREEK_ISD_GALVESTON,
  GALVESTON_COUNTYWIDE,
  HARRIS_COUNTYWIDE,
  findLocationPreset,
  resolveAlternateDistrictUnits,
  resolveTaxingUnits,
  utilityDistrictsForLocation,
} from "@/data/clearCreekTaxRates";
import { requireUnit } from "@/lib/lookups/resolveCodes";

const CITY_LEAGUE_CITY = requireUnit("galveston", "C40");
const LEAGUE_CITY_UNITS = [
  CLEAR_CREEK_ISD_GALVESTON,
  ...GALVESTON_COUNTYWIDE,
  CITY_LEAGUE_CITY,
];

describe("calculatePropertyTax", () => {
  it("applies the flat school exemption and percentage exemptions per unit", () => {
    const result = calculatePropertyTax({
      appraisedValue: 400_000,
      units: LEAGUE_CITY_UNITS,
      claimHomestead: true,
    });

    const school = result.lineItems.find((r) => r.unit.code === "S16")!;
    // Clear Creek stacks the $140,000 state exemption with its own 5% local
    // option, so $400k less $140k less $20k is taxable at $0.969 per $100.
    expect(school.exemptionApplied).toBe(160_000);
    expect(school.taxableValue).toBe(240_000);
    expect(school.annualTax).toBeCloseTo((240_000 * 0.969) / 100, 2);

    const county = result.lineItems.find((r) => r.unit.code === "GGA")!;
    // Galveston County grants 20%, so $320k taxable at $0.32266 per $100.
    expect(county.taxableValue).toBe(320_000);
    expect(county.annualTax).toBeCloseTo((320_000 * 0.32266) / 100, 2);

    const city = result.lineItems.find((r) => r.unit.code === "C40")!;
    // League City grants 20% too.
    expect(city.taxableValue).toBe(320_000);

    const roadFlood = result.lineItems.find((r) => r.unit.code === "RFL")!;
    // Road & Flood grants both a $3,000 flat exemption and 20%.
    expect(roadFlood.exemptionApplied).toBe(83_000);
  });

  it("taxes the full value when no homestead is claimed", () => {
    const withHomestead = calculatePropertyTax({
      appraisedValue: 400_000,
      units: LEAGUE_CITY_UNITS,
      claimHomestead: true,
    });
    const without = calculatePropertyTax({
      appraisedValue: 400_000,
      units: LEAGUE_CITY_UNITS,
      claimHomestead: false,
    });

    expect(without.annualTax).toBeGreaterThan(withHomestead.annualTax);
    expect(without.homesteadSavings).toBe(0);
    expect(withHomestead.homesteadSavings).toBeCloseTo(
      without.annualTax - withHomestead.annualTax,
      2,
    );
  });

  it("saves a meaningful amount on a typical home in the district", () => {
    const result = calculatePropertyTax({
      appraisedValue: 400_000,
      units: LEAGUE_CITY_UNITS,
      claimHomestead: true,
    });
    expect(result.homesteadSavings).toBeGreaterThan(2_000);
  });

  /**
   * The Harris side bills six countywide units where Galveston bills three.
   * That structural difference is a real cost of buying north of the county
   * line, and it should show up before any city or district is considered.
   */
  it("shows Harris County billing more countywide units than Galveston", () => {
    expect(HARRIS_COUNTYWIDE).toHaveLength(5);
    expect(GALVESTON_COUNTYWIDE).toHaveLength(2);

    const harrisRate = HARRIS_COUNTYWIDE.reduce(
      (sum, u) => sum + u.ratePer100,
      0,
    );
    const galvestonRate = GALVESTON_COUNTYWIDE.reduce(
      (sum, u) => sum + u.ratePer100,
      0,
    );
    expect(harrisRate).toBeGreaterThan(galvestonRate);
  });

  it("honors the $5,000 floor on percentage exemptions for low values", () => {
    // At $20,000 appraised, League City's 20% would be $4,000, so the
    // statutory $5,000 minimum should govern instead.
    const result = calculatePropertyTax({
      appraisedValue: 20_000,
      units: [CITY_LEAGUE_CITY],
      claimHomestead: true,
    });
    expect(result.lineItems[0].exemptionApplied).toBe(5_000);
  });

  it("never produces a negative taxable value", () => {
    const result = calculatePropertyTax({
      appraisedValue: 100_000,
      units: [CLEAR_CREEK_ISD_GALVESTON],
      claimHomestead: true,
    });
    // A $100k home with a $140k exemption owes zero school tax, not negative.
    expect(result.lineItems[0].taxableValue).toBe(0);
    expect(result.annualTax).toBe(0);
  });

  it("produces an effective rate below the nominal rate when homesteaded", () => {
    const result = calculatePropertyTax({
      appraisedValue: 400_000,
      units: LEAGUE_CITY_UNITS,
      claimHomestead: true,
    });
    expect(result.effectiveRate).toBeLessThan(result.combinedNominalRate);
  });

  it("shows a utility district adding materially to the bill", () => {
    const withoutDistrict = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("league-city", "none", null),
      claimHomestead: true,
    });
    // Galveston County MUD 36 is $1.15 per $100 with no homestead exemption,
    // so it should add about $4,600 a year on a $400,000 home.
    const withExpensiveDistrict = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("league-city", "galveston-m36", null),
      claimHomestead: true,
    });
    expect(
      withExpensiveDistrict.annualTax - withoutDistrict.annualTax,
    ).toBeCloseTo(4_600, -2);
  });

  it("prices Clear Lake Shores below every other city in the district", () => {
    const shores = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("clear-lake-shores", "none", null),
      claimHomestead: true,
    });
    for (const id of ["league-city", "kemah", "webster", "nassau-bay"]) {
      const other = calculatePropertyTax({
        appraisedValue: 400_000,
        units: resolveTaxingUnits(id, "none", null),
        claimHomestead: true,
      });
      expect(shores.annualTax).toBeLessThan(other.annualTax);
    }
  });
});

describe("resolveTaxingUnits", () => {
  it("prefers a manually entered utility rate over the preset", () => {
    const units = resolveTaxingUnits("league-city", "galveston-m36", 0.55);
    const manual = units.find((u) => u.id === "manual-utility");
    expect(manual?.ratePer100).toBe(0.55);
    expect(units.some((u) => u.code === "M36")).toBe(false);
  });

  it("omits a zero-rate utility district entirely", () => {
    const units = resolveTaxingUnits("league-city", "none", null);
    expect(units.some((u) => u.kind === "mud")).toBe(false);
  });

  it("omits the city line for a city that levies nothing", () => {
    const units = resolveTaxingUnits("clear-lake-shores", "none", null);
    // Clear Lake Shores has a zero adopted rate, so there is no city line.
    expect(units.some((u) => u.kind === "city")).toBe(false);
    expect(units.some((u) => u.code === "S16")).toBe(true);
  });

  it("puts every preset in Clear Creek ISD", () => {
    for (const preset of [
      "league-city",
      "houston-clear-lake",
      "webster",
      "nassau-bay",
      "el-lago",
      "taylor-lake-village",
      "seabrook",
      "kemah",
      "clear-lake-shores",
      "friendswood-ccisd",
      "pasadena-ccisd",
      "unincorporated-harris",
      "unincorporated-harris-mud",
      "unincorporated-galveston",
    ]) {
      const units = resolveTaxingUnits(preset, "none", null);
      const school = units.find((u) => u.kind === "school");
      expect(school?.name).toBe("Clear Creek ISD");
      expect(school?.ratePer100).toBe(0.969);
    }
  });

  it("offers only the districts a location's own county can bill", () => {
    const harris = utilityDistrictsForLocation("webster");
    const galveston = utilityDistrictsForLocation("league-city");

    // "No utility district" is on both lists; nothing else is shared.
    expect(harris.some((u) => u.id === "none")).toBe(true);
    expect(galveston.some((u) => u.id === "none")).toBe(true);
    expect(harris.some((u) => u.county === "galveston")).toBe(false);
    expect(galveston.some((u) => u.county === "harris")).toBe(false);

    // Both lists are real, so this is not passing by being empty.
    expect(harris.length).toBeGreaterThan(3);
    expect(galveston.length).toBeGreaterThan(3);
    expect(harris.some((u) => u.code === "142")).toBe(true);
    expect(galveston.some((u) => u.code === "M36")).toBe(true);
  });

  it("never bills one county's utility district on the other's location", () => {
    // A Harris preset cannot be billed by a Galveston MUD, so asking for one
    // must not quietly attach it.
    const units = resolveTaxingUnits("webster", "galveston-m36", null);
    expect(units.some((u) => u.code === "M36")).toBe(false);
  });
});

describe("resolveAlternateDistrictUnits", () => {
  it("returns null where the school district is not in doubt", () => {
    expect(resolveAlternateDistrictUnits("webster", "none", null)).toBeNull();
  });

  it("swaps Clear Creek for Dickinson ISD on a League City address", () => {
    const units = resolveAlternateDistrictUnits("league-city", "none", null)!;
    expect(units.some((u) => u.code === "S16")).toBe(false);
    expect(units.some((u) => u.code === "S11")).toBe(true);
    // The city does not change when only the school district is in doubt.
    expect(units.some((u) => u.code === "C40")).toBe(true);
  });

  it("prices the Friendswood risk as a county change as well as a district one", () => {
    const preset = findLocationPreset("friendswood-ccisd");
    expect(preset.county).toBe("harris");
    const units = resolveAlternateDistrictUnits("friendswood-ccisd", "none", null)!;
    // Friendswood ISD is billed by Galveston County, so the countywide units
    // swap too. Getting this wrong in either direction misprices the bill.
    expect(units.some((u) => u.code === "S12")).toBe(true);
    expect(units.some((u) => u.code === "GGA")).toBe(true);
    expect(units.some((u) => u.code === "040")).toBe(false);
  });

  it("costs real money to be wrong about the district", () => {
    const clearCreek = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("league-city", "none", null),
      claimHomestead: true,
    });
    const dickinson = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveAlternateDistrictUnits("league-city", "none", null)!,
      claimHomestead: true,
    });
    // Dickinson is ~17 cents per $100 dearer and grants no local option
    // exemption, so the mistake is worth well over $600 a year.
    expect(dickinson.annualTax - clearCreek.annualTax).toBeGreaterThan(600);
  });

  it("carries the utility district across so it cancels out of the comparison", () => {
    const expected = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveTaxingUnits("league-city", "galveston-m27", null),
      claimHomestead: true,
    });
    const alternate = calculatePropertyTax({
      appraisedValue: 400_000,
      units: resolveAlternateDistrictUnits("league-city", "galveston-m27", null)!,
      claimHomestead: true,
    });
    const district = (result: typeof expected) =>
      result.lineItems.find((r) => r.unit.code === "M27")?.annualTax;
    expect(district(expected)).toBeDefined();
    expect(district(alternate)).toBe(district(expected));
  });
});

describe("projectAppraisedValues", () => {
  it("leaves the cap off until the purchase year plus two", () => {
    const values = projectAppraisedValues({
      startingValue: 400_000,
      years: 5,
      marketGrowthRate: 0.2,
      capActive: true,
    });
    // Years 1 and 2 track the market; the 10% cap bites only from year 3.
    expect(values[0]).toBeCloseTo(480_000, 0);
    expect(values[1]).toBeCloseTo(576_000, 0);
    expect(values[2]).toBeCloseTo(633_600, 0);
  });

  it("tracks the market exactly when the cap does not apply", () => {
    const values = projectAppraisedValues({
      startingValue: 400_000,
      years: 3,
      marketGrowthRate: 0.05,
      capActive: false,
    });
    expect(values[2]).toBeCloseTo(400_000 * 1.05 ** 3, 0);
  });
});
