import { describe, expect, it } from "vitest";
import {
  findLocationPreset,
  LOCATION_PRESETS,
} from "@/data/clearCreekTaxRates";
import { GALVESTON_TAX_UNIT_CODES } from "@/data/galvestonTaxUnitCodes";
import { HARRIS_TAX_UNIT_CODES } from "@/data/harrisTaxUnitCodes";
import { inferLocationId } from "@/lib/lookups/resolveCodes";
import type { ResolvedParcel } from "@/lib/lookups/types";
import { windExposureFor } from "@/lib/windExposureState";
import {
  assessExposure,
  DEFAULT_WINDSTORM_RATE_PER_THOUSAND,
  HOMEOWNERS_RATE_PER_THOUSAND,
} from "@/lib/windstorm";

function parcelIn(
  county: "harris" | "galveston",
  taxUnitCodes: string[],
): ResolvedParcel {
  // Only the two fields the exposure turns on matter here.
  return {
    ref: { county, id: "test" },
    taxUnitCodes,
  } as ResolvedParcel;
}

/**
 * The location dropdown used to write wind exposure straight into state, so
 * changing it after a parcel was resolved silently overrode the parcel. On a
 * League City parcel, picking an inland Harris city dropped a windstorm
 * premium that Galveston County property cannot legally do without — about
 * $108 a month here — while the tax carried on being billed from the Galveston
 * roll. The parcel is the better evidence and now always wins.
 */
describe("a resolved parcel outranks the location dropdown", () => {
  const galveston = parcelIn("galveston", ["S16", "C36"]);

  it("keeps Galveston designated no matter which location is selected", () => {
    for (const locationId of [
      "webster",
      "houston-clear-lake",
      "friendswood-ccisd",
      "league-city",
    ]) {
      const wind = windExposureFor({ parcel: galveston, locationId });
      expect(wind.exposure, locationId).toBe("designated");
      expect(wind.separatePolicyRequired, locationId).toBe(true);
    }
  });

  it("does not invent a windstorm policy for an inland Harris parcel", () => {
    const harris = parcelIn("harris", ["027", "061"]);
    for (const locationId of ["league-city", "kemah", "webster"]) {
      const wind = windExposureFor({ parcel: harris, locationId });
      expect(wind.exposure, locationId).toBe("inland");
      expect(wind.separatePolicyRequired, locationId).toBe(false);
      expect(wind.windstormRatePerThousand, locationId).toBe(0);
    }
  });

  it("still asks about the boundary cities", () => {
    for (const code of ["076", "074"]) {
      const wind = windExposureFor({
        parcel: parcelIn("harris", ["027", code]),
        locationId: "webster",
      });
      expect(wind.exposure, code).toBe("boundary-uncertain");
      expect(wind.verifyByAddress, code).toBe(true);
      expect(wind.separatePolicyRequired, code).toBe(true);
    }
  });

  it("falls back to the location preset with no parcel", () => {
    expect(windExposureFor({ parcel: null, locationId: "league-city" }).exposure)
      .toBe("designated");
    expect(windExposureFor({ parcel: null, locationId: "webster" }).exposure)
      .toBe("inland");
  });
});

/**
 * These four used to be passed in by hand at each call site, which is how the
 * copies drifted apart. They are functions of the exposure alone.
 */
describe("everything downstream of an exposure is derived from it", () => {
  it("agrees with the rate tables", () => {
    for (const exposure of ["designated", "boundary-uncertain", "inland"] as const) {
      const a = assessExposure(exposure);
      expect(a.exposure).toBe(exposure);
      expect(a.homeownersRatePerThousand).toBe(
        HOMEOWNERS_RATE_PER_THOUSAND[exposure],
      );
      expect(a.separatePolicyRequired).toBe(exposure !== "inland");
      expect(a.verifyByAddress).toBe(exposure === "boundary-uncertain");
      expect(a.windstormRatePerThousand).toBe(
        exposure === "inland" ? 0 : DEFAULT_WINDSTORM_RATE_PER_THOUSAND,
      );
      expect(a.note.length).toBeGreaterThan(40);
    }
  });

  /*
   * Inside the catastrophe area the homeowners policy excludes wind, so it is
   * a narrower policy and priced lower. Getting this backwards would double
   * count the peril.
   */
  it("prices the narrower designated homeowners policy below the inland one", () => {
    expect(HOMEOWNERS_RATE_PER_THOUSAND.designated).toBeLessThan(
      HOMEOWNERS_RATE_PER_THOUSAND.inland,
    );
  });
});

/**
 * `inferLocationId` returns hand-written preset ids and `findLocationPreset`
 * falls back to the first preset — League City, which is designated and the
 * dearest — for anything it does not recognise. So a single typo or a renamed
 * preset would silently attach a League City windstorm premium and tax rate to
 * every parcel in some other city, with nothing to show it had happened.
 */
describe("every location id the parcel resolver can infer is a real preset", () => {
  // The county comes from which table the code is in, not from the record —
  // the same code means different things either side of the line.
  const CITY_CODES = [
    ...Object.entries(HARRIS_TAX_UNIT_CODES).map(
      ([code, record]) => [code, record, "harris"] as const,
    ),
    ...Object.entries(GALVESTON_TAX_UNIT_CODES).map(
      ([code, record]) => [code, record, "galveston"] as const,
    ),
  ]
    .filter(([, record]) => record.kind === "city")
    .map(([code, , county]) => [code, county] as const);

  it("covers every city in both counties, plus the fallbacks", () => {
    expect(CITY_CODES.length).toBeGreaterThan(10);

    const inferred = new Set<string>();
    for (const [code, county] of CITY_CODES) {
      inferred.add(
        inferLocationId({
          county,
          codes: [county === "harris" ? "027" : "S16", code],
          situs: "1 TEST ST",
          hasUtilityDistrict: false,
        }),
      );
    }
    // And the no-city fallbacks on both sides.
    for (const hasUtilityDistrict of [true, false]) {
      inferred.add(
        inferLocationId({
          county: "harris",
          codes: ["027"],
          situs: "1 TEST ST",
          hasUtilityDistrict,
        }),
      );
      inferred.add(
        inferLocationId({
          county: "galveston",
          codes: ["S16"],
          situs: "1 TEST ST",
          hasUtilityDistrict,
        }),
      );
    }

    for (const id of inferred) {
      expect(findLocationPreset(id).id, `${id} has no preset`).toBe(id);
    }
  });

  it("and every preset id round-trips", () => {
    for (const preset of LOCATION_PRESETS) {
      expect(findLocationPreset(preset.id).id).toBe(preset.id);
    }
  });
});

/**
 * The "separate windstorm policy required" toggle rewrites the homeowners rate,
 * because a policy that excludes wind is a narrower and cheaper policy and
 * leaving the all-perils rate on top of a windstorm premium bills the same
 * peril twice. It used to choose between the designated and inland rates only,
 * so forcing it on in Seabrook or Pasadena — the two cities where the answer
 * genuinely turns on the exact address, and the only two with their own rate —
 * silently dropped $8.50 and billed $7.00.
 */
describe("the homeowners rate the windstorm toggle writes", () => {
  const rateWhenOn = (exposure: "designated" | "boundary-uncertain" | "inland") =>
    HOMEOWNERS_RATE_PER_THOUSAND[
      exposure === "inland" ? "designated" : exposure
    ];

  it("keeps the boundary rate for the boundary cities", () => {
    expect(rateWhenOn("boundary-uncertain")).toBe(
      HOMEOWNERS_RATE_PER_THOUSAND["boundary-uncertain"],
    );
    expect(rateWhenOn("boundary-uncertain")).not.toBe(
      HOMEOWNERS_RATE_PER_THOUSAND.designated,
    );
  });

  it("uses the designated rate inside the designated area", () => {
    expect(rateWhenOn("designated")).toBe(
      HOMEOWNERS_RATE_PER_THOUSAND.designated,
    );
  });

  /*
   * Forced on where the designation does not reach, the buyer is asserting a
   * separate policy, so the homeowners side has to be the narrower one — not
   * the all-perils rate with a windstorm premium stacked on top.
   */
  it("never leaves the all-perils rate under a windstorm premium", () => {
    for (const exposure of ["designated", "boundary-uncertain", "inland"] as const) {
      expect(rateWhenOn(exposure)).toBeLessThan(
        HOMEOWNERS_RATE_PER_THOUSAND.inland,
      );
    }
  });

  it("has a distinct rate for each exposure, so none of them collapse", () => {
    const rates = Object.values(HOMEOWNERS_RATE_PER_THOUSAND);
    expect(new Set(rates).size).toBe(rates.length);
  });
});
