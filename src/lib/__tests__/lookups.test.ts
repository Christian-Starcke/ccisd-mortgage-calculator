import { describe, expect, it } from "vitest";
import { GALVESTON_TAX_UNIT_CODES } from "@/data/galvestonTaxUnitCodes";
import { HARRIS_TAX_UNIT_CODES } from "@/data/harrisTaxUnitCodes";
import { DEFAULT_STATE } from "@/lib/defaults";
import { buildCalculatorInputs, buildScenarioOptions } from "@/lib/buildFromState";
import { buildScenario } from "@/lib/scenario";
import { parseAddressQuery } from "@/lib/lookups/addressParse";
import { buildHarrisWhere } from "@/lib/lookups/hcad";
import {
  inferLocationId,
  resolveUnitsFromCodes,
} from "@/lib/lookups/resolveCodes";
import type { ParcelRef, ResolvedParcel } from "@/lib/lookups/types";
import { decodeParcelRef, encodeParcelRef } from "@/lib/lookups/types";
import { assessWindExposure } from "@/lib/windstorm";

/** A resolved parcel with the boring fields filled in. */
function parcelFixture(over: Partial<ResolvedParcel> & { ref: ParcelRef }): ResolvedParcel {
  return {
    situs: "1234 EXAMPLE ST LEAGUE CITY, TX 77573",
    taxUnitCodes: [],
    taxingUnits: [],
    missingRateCodes: [],
    nonLevyingCodes: [],
    totalValue: 310_000,
    landValue: 50_000,
    improvementValue: 260_000,
    yearBuilt: null,
    livingSqFt: null,
    sellerExemptions: null,
    centroid: null,
    usdaEligible: false,
    flood: null,
    isClearCreekIsd: true,
    schoolCodes: [],
    schoolNames: [],
    splitBetweenSchoolDistricts: false,
    inferredLocationId: "league-city",
    hasUtilityDistrict: false,
    inWindstormArea: true,
    vintage: "test",
    lookupAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("parseAddressQuery", () => {
  it("strips the trailing city, state and ZIP", () => {
    const parsed = parseAddressQuery("1234 Sea Lark Rd, League City TX 77573");
    expect(parsed.houseNumber).toBe("1234");
    expect(parsed.streetTokens).toEqual(["SEA", "LARK"]);
    expect(parsed.streetTokens).not.toContain("RD");
    expect(parsed.streetTokens).not.toContain("LEAGUE");
    expect(parsed.streetTokens).not.toContain("77573");
  });

  /**
   * The reason city names are stripped as a trailing phrase rather than
   * filtered token by token. Around Clear Lake the city names ARE street
   * names, and dropping them wherever they appeared would delete the street
   * and turn a precise search into a house-number sweep of two counties.
   */
  it("keeps city words that are part of the street name", () => {
    expect(
      parseAddressQuery("16000 Clear Lake City Blvd, Houston TX 77062")
        .streetTokens,
    ).toEqual(["CLEAR", "LAKE", "CITY"]);

    expect(
      parseAddressQuery("2450 League City Pkwy, League City TX 77573")
        .streetTokens,
    ).toEqual(["LEAGUE", "CITY"]);

    expect(
      parseAddressQuery("801 El Camino Real, Webster TX 77598").streetTokens,
    ).toEqual(["EL", "CAMINO", "REAL"]);
  });

  it("consumes the longest city name first", () => {
    expect(
      parseAddressQuery("500 Cedar Rd, Taylor Lake Village TX").streetTokens,
    ).toEqual(["CEDAR"]);
    expect(
      parseAddressQuery("18 Marina Dr, Clear Lake Shores TX 77565")
        .streetTokens,
    ).toEqual(["MARINA"]);
  });
});

describe("buildHarrisWhere", () => {
  it("matches the house number as an integer and the street with LIKE", () => {
    const where = buildHarrisWhere(
      parseAddressQuery("18100 Upper Bay Rd, Nassau Bay TX 77058"),
    );
    expect(where).toContain("site_str_num=18100");
    expect(where).toContain("UPPER(site_str_name) LIKE '%UPPER%'");
    expect(where).toContain("UPPER(site_str_name) LIKE '%BAY%'");
    // HCAD's site_city is the postal city, so it is never a search term.
    expect(where).not.toMatch(/site_city/);
  });

  it("escapes quotes rather than letting them reach the query", () => {
    const where = buildHarrisWhere(parseAddressQuery("100 O'CONNOR ST"));
    expect(where).toContain("OCONNOR");
    expect(where).not.toContain("O'CONNOR");
  });
});

describe("parcel references", () => {
  it("round-trips a county and id", () => {
    const ref: ParcelRef = { county: "harris", id: "0402110010004" };
    expect(decodeParcelRef(encodeParcelRef(ref))).toEqual(ref);
    expect(
      decodeParcelRef("galveston:0009-0001-0000-000"),
    ).toEqual({ county: "galveston", id: "0009-0001-0000-000" });
  });

  it("rejects an unknown county or an empty id", () => {
    expect(decodeParcelRef("brazoria:123")).toBeNull();
    expect(decodeParcelRef("harris:")).toBeNull();
    expect(decodeParcelRef("0402110010004")).toBeNull();
  });
});

describe("resolveUnitsFromCodes", () => {
  it("resolves a typical League City stack from Galveston codes", () => {
    const result = resolveUnitsFromCodes("galveston", [
      "C40",
      "CAD",
      "GGA",
      "RFL",
      "S16",
    ]);
    expect(result.isClearCreekIsd).toBe(true);
    expect(result.schoolCodes).toEqual(["S16"]);
    expect(result.schoolNames).toEqual(["Clear Creek ISD"]);
    expect(result.units.map((u) => u.code).sort()).toEqual([
      "C40",
      "GGA",
      "RFL",
      "S16",
    ]);
    expect(result.units.find((u) => u.code === "S16")?.ratePer100).toBe(0.969);
    expect(result.missingRateCodes).toEqual([]);
  });

  it("resolves a typical Clear Lake City stack from Harris codes", () => {
    const result = resolveUnitsFromCodes("harris", [
      "027",
      "040",
      "041",
      "042",
      "043",
      "044",
      "061",
      "142",
    ]);
    expect(result.isClearCreekIsd).toBe(true);
    expect(result.schoolNames).toEqual(["Clear Creek ISD"]);
    // Six countywide units plus the city plus the water authority.
    expect(result.units).toHaveLength(8);
    expect(result.hasUtilityDistrict).toBe(true);
    expect(result.units.find((u) => u.code === "027")?.ratePer100).toBe(0.969);
  });

  it("prices Clear Creek ISD identically from either county's code", () => {
    const harris = resolveUnitsFromCodes("harris", ["027"]).units[0];
    const galveston = resolveUnitsFromCodes("galveston", ["S16"]).units[0];
    expect(harris.ratePer100).toBe(galveston.ratePer100);
    expect(harris.homesteadFlatExemption).toBe(galveston.homesteadFlatExemption);
    expect(harris.homesteadPercentExemption).toBe(
      galveston.homesteadPercentExemption,
    );
  });

  it("drops each district's own CAD code", () => {
    expect(
      resolveUnitsFromCodes("galveston", ["S16", "CAD"]).units.some(
        (u) => u.code === "CAD",
      ),
    ).toBe(false);
  });

  /**
   * A TIRZ redirects part of the city's existing levy into the zone. Billing
   * it as an extra unit would roughly double-count the city tax.
   */
  it("does not bill reinvestment zones, and reports them", () => {
    const harris = resolveUnitsFromCodes("harris", ["027", "058", "A43"]);
    expect(harris.units.some((u) => u.code === "A43")).toBe(false);
    expect(harris.missingRateCodes).toEqual([]);
    expect(harris.nonLevyingCodes.map((r) => r.code)).toEqual(["A43"]);

    const galveston = resolveUnitsFromCodes("galveston", ["S16", "C40", "T15"]);
    expect(galveston.units.some((u) => u.code === "T15")).toBe(false);
    expect(galveston.nonLevyingCodes.map((r) => r.code)).toEqual(["T15"]);
    expect(galveston.missingRateCodes).toEqual([]);
  });

  it("keeps a genuinely zero city rate out of the bill without flagging it", () => {
    // Clear Lake Shores levies no city property tax at all.
    const result = resolveUnitsFromCodes("galveston", ["S16", "GGA", "C46"]);
    expect(GALVESTON_TAX_UNIT_CODES.C46.ratePer100).toBe(0);
    expect(result.units.some((u) => u.code === "C46")).toBe(false);
    expect(result.missingRateCodes).toEqual([]);
    expect(result.nonLevyingCodes).toEqual([]);
  });

  it("keeps missing-rate codes out of the bill until an override is entered", () => {
    const missing = resolveUnitsFromCodes("harris", ["027", "A76"]);
    expect(missing.isClearCreekIsd).toBe(true);
    expect(missing.missingRateCodes.map((r) => r.code)).toEqual(["A76"]);
    expect(missing.units.some((u) => u.code === "A76")).toBe(false);

    const overridden = resolveUnitsFromCodes("harris", ["027", "A76"], {
      A76: 0.9,
    });
    expect(overridden.missingRateCodes).toEqual([]);
    expect(overridden.units.find((u) => u.code === "A76")?.ratePer100).toBe(0.9);
  });

  it("gates Clear Creek ISD on the school code, per county", () => {
    const dickinson = resolveUnitsFromCodes("galveston", ["S11", "GGA", "C40"]);
    expect(dickinson.isClearCreekIsd).toBe(false);
    expect(dickinson.schoolCodes).toEqual(["S11"]);
    expect(dickinson.schoolNames[0]).toMatch(/Dickinson/i);

    const pasadena = resolveUnitsFromCodes("harris", ["021", "040", "074"]);
    expect(pasadena.isClearCreekIsd).toBe(false);
    expect(pasadena.schoolNames[0]).toMatch(/Pasadena/i);
  });

  it("reports a parcel split across two school districts", () => {
    const split = resolveUnitsFromCodes("galveston", ["S16", "S11", "GGA"]);
    expect(split.schoolCodes.sort()).toEqual(["S11", "S16"]);
    // Still Clear Creek, but the caller has to see the second district.
    expect(split.isClearCreekIsd).toBe(true);
    expect(split.schoolCodes).toHaveLength(2);
  });

  it("stacks utility districts as additive lines", () => {
    const result = resolveUnitsFromCodes("galveston", [
      "S16",
      "GGA",
      "C40",
      "M27",
      "W03",
    ]);
    expect(result.hasUtilityDistrict).toBe(true);
    expect(result.units.filter((u) => u.code === "M27")).toHaveLength(1);
    expect(result.units.filter((u) => u.code === "W03")).toHaveLength(1);
  });
});

describe("inferLocationId", () => {
  it("maps city codes to the matching preset, per county", () => {
    const base = { situs: "123 MAIN ST", hasUtilityDistrict: false };
    expect(
      inferLocationId({ county: "galveston", codes: ["C40", "S16"], ...base }),
    ).toBe("league-city");
    expect(
      inferLocationId({ county: "galveston", codes: ["C38", "S16"], ...base }),
    ).toBe("kemah");
    expect(
      inferLocationId({ county: "galveston", codes: ["C46", "S16"], ...base }),
    ).toBe("clear-lake-shores");
    expect(
      inferLocationId({ county: "harris", codes: ["084", "027"], ...base }),
    ).toBe("webster");
    expect(
      inferLocationId({ county: "harris", codes: ["061", "027"], ...base }),
    ).toBe("houston-clear-lake");
  });

  it("distinguishes unincorporated Harris by whether a district is present", () => {
    const base = { county: "harris" as const, codes: ["027", "040"], situs: "" };
    expect(inferLocationId({ ...base, hasUtilityDistrict: true })).toBe(
      "unincorporated-harris-mud",
    );
    expect(inferLocationId({ ...base, hasUtilityDistrict: false })).toBe(
      "unincorporated-harris",
    );
  });
});

describe("assessWindExposure", () => {
  it("treats every Galveston County address as designated", () => {
    const wind = assessWindExposure({
      county: "galveston",
      taxUnitCodes: ["S16", "GGA", "C40"],
    });
    expect(wind.exposure).toBe("designated");
    expect(wind.separatePolicyRequired).toBe(true);
    expect(wind.verifyByAddress).toBe(false);
    expect(wind.windstormRatePerThousand).toBeGreaterThan(0);
  });

  it("treats most Harris County addresses as outside the area", () => {
    for (const city of ["084", "073", "056", "082", "061", "058"]) {
      const wind = assessWindExposure({
        county: "harris",
        taxUnitCodes: ["027", "040", city],
      });
      expect(wind.exposure).toBe("inland");
      expect(wind.separatePolicyRequired).toBe(false);
      expect(wind.windstormRatePerThousand).toBe(0);
    }
  });

  /**
   * Harris County is designated only east of Highway 146 AND inside one of
   * five city limits. Of the cities in this district only Seabrook and
   * Pasadena can satisfy that, and the calculator will not guess which side of
   * the highway an address falls on.
   */
  it("flags Seabrook and Pasadena as needing address-level confirmation", () => {
    for (const city of ["076", "074"]) {
      const wind = assessWindExposure({
        county: "harris",
        taxUnitCodes: ["027", "040", city],
      });
      expect(wind.exposure).toBe("boundary-uncertain");
      expect(wind.verifyByAddress).toBe(true);
      // Conservative: assume the premium applies until told otherwise.
      expect(wind.separatePolicyRequired).toBe(true);
    }
  });

  it("prices the homeowners policy lower where wind is carved out of it", () => {
    const designated = assessWindExposure({
      county: "galveston",
      taxUnitCodes: ["S16"],
    });
    const inland = assessWindExposure({
      county: "harris",
      taxUnitCodes: ["027", "084"],
    });
    // Otherwise the same peril is paid for twice.
    expect(designated.homeownersRatePerThousand).toBeLessThan(
      inland.homeownersRatePerThousand,
    );
  });
});

describe("windstorm in the payment", () => {
  it("adds a windstorm line inside the designated area and none outside it", () => {
    const galveston = buildCalculatorInputs({
      ...DEFAULT_STATE,
      locationId: "league-city",
      separateWindstormPolicy: true,
    });
    expect(galveston.property.annualWindstormInsurance).toBeGreaterThan(0);

    const harris = buildCalculatorInputs({
      ...DEFAULT_STATE,
      locationId: "webster",
      separateWindstormPolicy: false,
    });
    expect(harris.property.annualWindstormInsurance).toBe(0);
  });

  it("carries windstorm into the monthly total and the escrow deposit", () => {
    const withWind = {
      ...DEFAULT_STATE,
      locationId: "league-city",
      separateWindstormPolicy: true,
    };
    const withoutWind = { ...withWind, separateWindstormPolicy: false };

    const a = buildScenario(
      buildCalculatorInputs(withWind),
      buildScenarioOptions(withWind),
    );
    const b = buildScenario(
      buildCalculatorInputs(withoutWind),
      buildScenarioOptions(withoutWind),
    );

    expect(a.monthly.windstormInsurance).toBeGreaterThan(0);
    expect(b.monthly.windstormInsurance).toBe(0);
    // The premium has to reach the total, not just the breakdown line.
    expect(a.monthly.total - b.monthly.total).toBeCloseTo(
      a.monthly.windstormInsurance,
      2,
    );
    // And it is escrowed and prepaid like any other hazard premium.
    expect(a.cashToClose.prepaidsAndEscrow).toBeGreaterThan(
      b.cashToClose.prepaidsAndEscrow,
    );
  });
});

describe("buildCalculatorInputs lookup fallback", () => {
  it("uses the location preset when no parcel is selected", () => {
    const inputs = buildCalculatorInputs(DEFAULT_STATE);
    expect(
      inputs.property.taxingUnits.some((unit) => unit.code === "S16"),
    ).toBe(true);
    expect(
      inputs.property.taxingUnits.some((unit) => unit.code === "C40"),
    ).toBe(true);
  });

  it("prefers the parcel codes over the location preset", () => {
    const parcel = parcelFixture({
      ref: { county: "harris", id: "0402110010004" },
      situs: "18100 UPPER BAY RD, HOUSTON 77058",
      taxUnitCodes: ["027", "040", "041", "042", "043", "044", "073"],
      schoolCodes: ["027"],
      schoolNames: ["Clear Creek ISD"],
      inferredLocationId: "nassau-bay",
      totalValue: 310_000,
    });

    const inputs = buildCalculatorInputs({
      ...DEFAULT_STATE,
      locationId: "league-city",
      resolvedParcel: parcel,
    });

    expect(inputs.property.taxingUnits.some((u) => u.code === "027")).toBe(true);
    expect(inputs.property.taxingUnits.some((u) => u.code === "073")).toBe(true);
    // The League City preset's own units must not survive the parcel pick.
    expect(inputs.property.taxingUnits.some((u) => u.code === "C40")).toBe(false);
    expect(inputs.property.taxingUnits.some((u) => u.code === "S16")).toBe(false);
    expect(inputs.property.taxAppraisedValue).toBe(310_000);
  });

  it("does not reuse one county's units for the other county's parcel", () => {
    const galvestonParcel = parcelFixture({
      ref: { county: "galveston", id: "0009-0001-0000-000" },
      taxUnitCodes: ["S16", "GGA", "RFL", "C40", "M27"],
      inferredLocationId: "league-city",
      hasUtilityDistrict: true,
    });

    const inputs = buildCalculatorInputs({
      ...DEFAULT_STATE,
      // Deliberately mismatched: a Harris preset with a Galveston parcel.
      locationId: "webster",
      resolvedParcel: galvestonParcel,
    });

    // Harris's six countywide units must not appear on a Galveston bill.
    for (const code of ["040", "041", "042", "043", "044", "084"]) {
      expect(inputs.property.taxingUnits.some((u) => u.code === code)).toBe(
        false,
      );
    }
    expect(inputs.property.taxingUnits.some((u) => u.code === "GGA")).toBe(true);
  });
});

describe("generated tax unit tables", () => {
  it("carries Clear Creek ISD in both counties with the same figures", () => {
    expect(HARRIS_TAX_UNIT_CODES["027"].name).toBe("Clear Creek ISD");
    expect(HARRIS_TAX_UNIT_CODES["027"].ratePer100).toBe(0.969);
    expect(GALVESTON_TAX_UNIT_CODES.S16.name).toBe("Clear Creek ISD");
    expect(GALVESTON_TAX_UNIT_CODES.S16.ratePer100).toBe(0.969);

    // The state $140,000 exemption stacked with the district's 5% local option.
    for (const record of [
      HARRIS_TAX_UNIT_CODES["027"],
      GALVESTON_TAX_UNIT_CODES.S16,
    ]) {
      expect(record.homesteadFlatExemption).toBe(140_000);
      expect(record.homesteadPercentExemption).toBe(0.05);
    }
  });

  it("does not store tax assessor names as unit names", () => {
    const assessors = /terri aragon|cheryl e\.? johnson|annette ramirez|robyn tilitzki/i;
    for (const table of [HARRIS_TAX_UNIT_CODES, GALVESTON_TAX_UNIT_CODES]) {
      expect(
        Object.values(table).some((record) => assessors.test(record.name)),
      ).toBe(false);
    }
  });

  it("marks every reinvestment zone non-levying rather than rate-unknown", () => {
    for (const record of Object.values(HARRIS_TAX_UNIT_CODES)) {
      if (record.kind !== "zone") continue;
      expect(record.nonLevying).toBe(true);
      expect(record.rateUnknown).toBeUndefined();
    }
  });

  it("never gives a unit a rate of zero by omission", () => {
    for (const table of [HARRIS_TAX_UNIT_CODES, GALVESTON_TAX_UNIT_CODES]) {
      for (const record of Object.values(table)) {
        if (record.ratePer100 !== null) continue;
        // A null rate must be declared unknown so the UI asks for it.
        expect(record.rateUnknown).toBe(true);
      }
    }
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
      locationId: "league-city",
    });
    expect(estimated.property.annualHoaDues).toBe(800);
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
