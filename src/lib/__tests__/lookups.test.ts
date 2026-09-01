import { describe, expect, it } from "vitest";
import { FORT_BEND_TAX_UNIT_CODES } from "@/data/fortBendTaxUnitCodes";
import { DEFAULT_STATE } from "@/lib/defaults";
import { buildCalculatorInputs, buildScenarioOptions } from "@/lib/buildFromState";
import { buildScenario } from "@/lib/scenario";
import { buildSitusWhere, parseAddressQuery } from "@/lib/lookups/addressParse";
import {
  inferLocationId,
  resolveUnitsFromCodes,
} from "@/lib/lookups/resolveCodes";
import type { ResolvedParcel } from "@/lib/lookups/types";

describe("parseAddressQuery", () => {
  it("matches FBCAD situs on house number and street-name tokens only", () => {
    const parsed = parseAddressQuery("1234 Caldwell Ranch Dr, Rosharon TX 77583");
    expect(parsed.houseNumber).toBe("1234");
    expect(parsed.streetTokens).toEqual(["CALDWELL", "RANCH"]);
    expect(parsed.streetTokens).not.toContain("DR");
    expect(parsed.streetTokens).not.toContain("ROSHARON");
    expect(parsed.streetTokens).not.toContain("77583");
  });

  it("builds a situs WHERE that never requires the city", () => {
    const where = buildSitusWhere(
      parseAddressQuery("1234 Caldwell Ranch Dr, Rosharon TX 77583"),
    );
    expect(where).toContain("UPPER(situs) LIKE '1234 %'");
    expect(where).toContain("UPPER(situs) LIKE '%CALDWELL%'");
    expect(where).toContain("UPPER(situs) LIKE '%RANCH%'");
    expect(where).not.toMatch(/ROSHARON/);
  });
});

describe("resolveUnitsFromCodes", () => {
  it("resolves a typical Rosharon Fort Bend ISD stack", () => {
    const result = resolveUnitsFromCodes(["D01", "G01", "R52", "S07", "CAD"]);
    expect(result.isFortBendIsd).toBe(true);
    expect(result.schoolCode).toBe("S07");
    expect(result.schoolName).toBe("Fort Bend ISD");
    expect(result.units.map((unit) => unit.code).sort()).toEqual(
      ["D01", "G01", "R52", "S07"].sort(),
    );
    expect(result.missingRateCodes).toEqual([]);
    expect(result.units.find((unit) => unit.code === "S07")?.ratePer100).toBe(
      1.0569,
    );
  });

  it("keeps missing-rate codes out of the bill until an override is entered", () => {
    const missing = resolveUnitsFromCodes(["S07", "A239"]);
    expect(missing.isFortBendIsd).toBe(true);
    expect(missing.missingRateCodes.map((record) => record.code)).toEqual([
      "A239",
    ]);
    expect(missing.units.some((unit) => unit.code === "A239")).toBe(false);

    const overridden = resolveUnitsFromCodes(["S07", "A239"], { A239: 0.9 });
    expect(overridden.missingRateCodes).toEqual([]);
    expect(overridden.units.find((unit) => unit.code === "A239")?.ratePer100).toBe(
      0.9,
    );
  });

  it("gates Fort Bend ISD on the S07 code", () => {
    const lamar = resolveUnitsFromCodes(["S01", "G01", "D01"]);
    expect(lamar.isFortBendIsd).toBe(false);
    expect(lamar.schoolCode).toBe("S01");
    expect(lamar.schoolName).toMatch(/Lamar/i);
  });

  it("stacks a MUD, LID and management district as three additive lines", () => {
    const sienna = resolveUnitsFromCodes(["S07", "G01", "D01", "M278", "W05", "SM105"]);
    expect(sienna.hasMud).toBe(true);
    expect(sienna.units.filter((unit) => unit.code === "M278")).toHaveLength(1);
    expect(sienna.units.filter((unit) => unit.code === "W05")).toHaveLength(1);
    expect(sienna.units.filter((unit) => unit.code === "SM105")).toHaveLength(1);
  });
});

describe("inferLocationId", () => {
  it("maps city codes to the matching location preset", () => {
    expect(
      inferLocationId({
        codes: ["C21", "S07"],
        situs: "123 MAIN ST",
        hasMud: false,
      }),
    ).toBe("sugar-land");
    expect(
      inferLocationId({
        codes: ["C05", "S07"],
        situs: "123 MAIN ST",
        hasMud: false,
      }),
    ).toBe("houston-in-fbisd");
    expect(
      inferLocationId({
        codes: ["R52", "S07"],
        situs: "1234 CALDWELL RANCH 77583",
        hasMud: true,
      }),
    ).toBe("rosharon-fbisd");
  });
});

describe("buildCalculatorInputs lookup fallback", () => {
  it("uses the location preset when no parcel is selected", () => {
    const inputs = buildCalculatorInputs(DEFAULT_STATE);
    expect(inputs.property.taxingUnits.some((unit) => unit.id === "fbisd")).toBe(
      true,
    );
    expect(
      inputs.property.taxingUnits.some((unit) => unit.id === "city-sugar-land"),
    ).toBe(true);
  });

  it("prefers the parcel codes over the location preset", () => {
    const parcel: ResolvedParcel = {
      objectId: 1,
      situs: "1234 CALDWELL RANCH 77583",
      taxUnitCodes: ["D01", "G01", "R52", "S07"],
      taxingUnits: [],
      missingRateCodes: [],
      totalValue: 310_000,
      landValue: 50_000,
      improvementValue: 260_000,
      yearBuilt: 2019,
      livingSqFt: 2_100,
      sellerExemptions: null,
      centroid: { lon: -95.42, lat: 29.44 },
      usdaEligible: true,
      flood: { zone: "AE", inSpecialFloodHazardArea: true },
      isFortBendIsd: true,
      schoolCode: "S07",
      schoolName: "Fort Bend ISD",
      inferredLocationId: "rosharon-fbisd",
      hasMud: false,
      lookupAt: "2026-09-01T00:00:00.000Z",
    };

    const inputs = buildCalculatorInputs({
      ...DEFAULT_STATE,
      locationId: "sugar-land",
      resolvedParcel: parcel,
    });

    expect(inputs.property.taxingUnits.some((unit) => unit.code === "S07")).toBe(
      true,
    );
    expect(inputs.property.taxingUnits.some((unit) => unit.code === "R52")).toBe(
      true,
    );
    expect(
      inputs.property.taxingUnits.some((unit) => unit.id === "city-sugar-land"),
    ).toBe(false);
    expect(inputs.property.taxAppraisedValue).toBe(310_000);
  });
});

describe("generated tax unit table", () => {
  it("carries Fort Bend ISD and does not store assessor names", () => {
    expect(FORT_BEND_TAX_UNIT_CODES.S07.name).toBe("Fort Bend ISD");
    expect(FORT_BEND_TAX_UNIT_CODES.S07.ratePer100).toBe(1.0569);
    expect(FORT_BEND_TAX_UNIT_CODES.C21.name).toMatch(/Sugar Land/i);
    expect(
      Object.values(FORT_BEND_TAX_UNIT_CODES).some((record) =>
        /carmen turner/i.test(record.name),
      ),
    ).toBe(false);
  });
});

describe("parcel vs location-preset tax bill", () => {
  it("does not silently reuse Sugar Land city tax for a Rosharon parcel", () => {
    const parcel: ResolvedParcel = {
      objectId: 1,
      situs: "954 LUKE DARRELL DR 77583",
      taxUnitCodes: ["D01", "G01", "R52", "S07"],
      taxingUnits: [],
      missingRateCodes: [],
      totalValue: 275_000,
      landValue: 40_000,
      improvementValue: 235_000,
      yearBuilt: 2019,
      livingSqFt: 1_800,
      sellerExemptions: "HS",
      centroid: { lon: -95.42, lat: 29.44 },
      usdaEligible: true,
      flood: { zone: "X", inSpecialFloodHazardArea: false },
      isFortBendIsd: true,
      schoolCode: "S07",
      schoolName: "Fort Bend ISD",
      inferredLocationId: "rosharon-fbisd",
      hasMud: true,
      lookupAt: "2026-09-01T00:00:00.000Z",
    };

    const typedAddressOnly = buildCalculatorInputs({
      ...DEFAULT_STATE,
      purchasePrice: 275_000,
      addressQuery: "954 Luke Darrell DR, Rosharon, TX 77583",
      resolvedParcel: null,
      locationId: "sugar-land",
      monthlyMudUtility: 0,
      cashAvailable: 0,
    });
    const pickedParcel = buildCalculatorInputs({
      ...DEFAULT_STATE,
      purchasePrice: 275_000,
      addressQuery: parcel.situs,
      resolvedParcel: parcel,
      locationId: parcel.inferredLocationId,
      taxAppraisedValueOverride: parcel.totalValue,
      monthlyMudUtility: 110,
      usdaAddressConfirmed: true,
    });

    expect(
      typedAddressOnly.property.taxingUnits.some(
        (unit) => unit.id === "city-sugar-land",
      ),
    ).toBe(true);
    expect(
      pickedParcel.property.taxingUnits.some(
        (unit) => unit.id === "city-sugar-land",
      ),
    ).toBe(false);
    expect(pickedParcel.property.monthlyMudUtility).toBe(110);
    expect(typedAddressOnly.property.monthlyMudUtility).toBe(0);
  });
});

describe("cash-on-hand shortfall warning", () => {
  it("does not treat a blank cash budget as money you are short", () => {
    const state = {
      ...DEFAULT_STATE,
      purchasePrice: 275_000,
      cashAvailable: 0,
    };
    const scenario = buildScenario(
      buildCalculatorInputs(state),
      buildScenarioOptions(state),
    );
    expect(scenario.cashToClose.shortfall).toBeGreaterThan(0);
    expect(
      scenario.warnings.some((warning) => /short of the cash/i.test(warning)),
    ).toBe(false);
  });

  it("still warns when cash on hand is entered and is not enough", () => {
    const state = {
      ...DEFAULT_STATE,
      purchasePrice: 275_000,
      cashAvailable: 1_000,
    };
    const scenario = buildScenario(
      buildCalculatorInputs(state),
      buildScenarioOptions(state),
    );
    expect(scenario.cashToClose.shortfall).toBeGreaterThan(0);
    expect(
      scenario.warnings.some((warning) => /short of the cash/i.test(warning)),
    ).toBe(true);
  });
});

describe("unknown HOA", () => {
  it("uses the location-typical midpoint instead of treating unknown as zero", () => {
    const estimated = buildCalculatorInputs({
      ...DEFAULT_STATE,
      hoaCertainty: "unknown",
      locationId: "sugar-land",
    });
    expect(estimated.property.annualHoaDues).toBe(950);
    expect(estimated.property.hoaEstimated).toBe(true);

    const none = buildCalculatorInputs({
      ...DEFAULT_STATE,
      hoaCertainty: "none",
      annualHoaDues: 2_400,
    });
    expect(none.property.annualHoaDues).toBe(0);
    expect(none.property.hoaEstimated).toBe(false);

    const known = buildCalculatorInputs({
      ...DEFAULT_STATE,
      hoaCertainty: "known",
      annualHoaDues: 1_200,
    });
    expect(known.property.annualHoaDues).toBe(1_200);
    expect(known.property.hoaEstimated).toBe(false);
  });
});
