import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELECTRICITY_RATE_PER_KWH,
  districtWaterBillFor,
  estimateHouseholdUtilities,
} from "@/lib/householdUtilities";
import { buildCalculatorInputs, buildScenarioOptions } from "@/lib/buildFromState";
import { buildScenario } from "@/lib/scenario";
import { DEFAULT_STATE } from "@/lib/defaults";
import { requireUnit } from "@/lib/lookups/resolveCodes";

const BASE = {
  livingSqFt: 2_000,
  electricityRatePerKwh: DEFAULT_ELECTRICITY_RATE_PER_KWH,
  hasNaturalGas: false,
  monthlyGas: 40,
  monthlyInternet: 70,
  districtWaterAlreadyInPayment: 0,
  districts: [],
};

const LEAGUE_CITY = [
  requireUnit("galveston", "S16"),
  requireUnit("galveston", "GGA"),
  requireUnit("galveston", "C40"),
];
const CLEAR_LAKE = [
  requireUnit("harris", "027"),
  requireUnit("harris", "040"),
  requireUnit("harris", "061"),
];
const WEBSTER = [
  requireUnit("harris", "027"),
  requireUnit("harris", "040"),
  requireUnit("harris", "084"),
];

function item(u: ReturnType<typeof estimateHouseholdUtilities>, id: string) {
  return u.items.find((i) => i.id === id);
}

describe("electricity", () => {
  it("scales with floor area, because air conditioning dominates here", () => {
    const small = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
      livingSqFt: 1_200,
    });
    const large = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
      livingSqFt: 3_600,
    });
    expect(item(large, "electricity")!.monthly).toBeGreaterThan(
      item(small, "electricity")!.monthly * 2.5,
    );
  });

  it("lands a 2,000 sq ft house near the Houston average", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
    });
    // ~1,150 kWh at 15c is about $172; the area average bill is ~$165.
    const power = item(u, "electricity")!;
    expect(power.monthly).toBeGreaterThan(150);
    expect(power.monthly).toBeLessThan(190);
  });

  it("reports the summer peak, not just the mean", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
    });
    const power = item(u, "electricity")!;
    expect(power.seasonal).toBeDefined();
    expect(power.seasonal!.high).toBeGreaterThan(power.monthly);
    expect(power.seasonal!.low).toBeLessThan(power.monthly);
    expect(u.peakMonthlyTotal).toBeGreaterThan(u.monthlyTotal);
  });

  it("does not depend on the address, because the market is deregulated", () => {
    const a = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
    });
    const b = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: CLEAR_LAKE,
    });
    expect(item(a, "electricity")!.monthly).toBe(
      item(b, "electricity")!.monthly,
    );
  });
});

describe("water, sewer and refuse follow the supplier", () => {
  it("uses League City's own published rates", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
    });
    expect(u.providerName).toBe("City of League City");
    expect(item(u, "water-sewer")!.confidence).toBe("sourced");
    expect(item(u, "refuse")!.monthly).toBeCloseTo(21.69, 2);
    expect(item(u, "water-sewer")!.sourceUrl).toContain("leaguecitytx.gov");
  });

  it("bills no separate refuse line inside Houston", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: CLEAR_LAKE,
    });
    expect(u.providerName).toBe("City of Houston");
    // Houston funds single-family collection from general revenue, so a bin
    // charge here would be double-counting what the city tax already paid.
    expect(item(u, "refuse")).toBeUndefined();
  });

  it("uses Webster's own rate ordinance, drainage fee included", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: WEBSTER,
    });
    expect(u.providerName).toBe("City of Webster");
    expect(item(u, "water-sewer")!.confidence).toBe("sourced");
    // $10.71 + 3x$4.82 water, $16.13 + 3x$7.17 sewer, $1.24 drainage.
    expect(item(u, "water-sewer")!.monthly).toBeCloseTo(64.05, 2);
  });

  it("uses Seabrook's own schedule, the dearest city bill here", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: [
        requireUnit("harris", "027"),
        requireUnit("harris", "040"),
        requireUnit("harris", "076"),
      ],
    });
    expect(u.providerName).toBe("City of Seabrook");
    expect(item(u, "water-sewer")!.monthly).toBeCloseTo(88.87, 2);
    expect(item(u, "refuse")!.monthly).toBeCloseTo(32.06, 2);
    /*
     * Dearest on the total, not on water alone: Houston's water and sewer is
     * $95 against Seabrook's $88.87, but Houston bills no refuse and Seabrook
     * bills $32. Comparing the water line alone would rank them backwards.
     */
    const seabrookTotal =
      item(u, "water-sewer")!.monthly + item(u, "refuse")!.monthly;
    for (const [county, code] of [
      ["galveston", "C40"],
      ["harris", "061"],
      ["harris", "084"],
    ] as const) {
      const other = estimateHouseholdUtilities({
        ...BASE,
        service: "city",
        taxingUnits: [requireUnit(county, code)],
      });
      const otherTotal =
        item(other, "water-sewer")!.monthly +
        (item(other, "refuse")?.monthly ?? 0);
      expect(seabrookTotal).toBeGreaterThan(otherTotal);
    }
  });

  it("keeps Friendswood an estimate, because only its sewer was read", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: [
        requireUnit("harris", "027"),
        requireUnit("harris", "058"),
      ],
    });
    expect(u.providerName).toBe("City of Friendswood");
    // Part sourced, part placeholder, so it must not claim to be sourced.
    expect(item(u, "water-sewer")!.confidence).toBe("estimated");
    expect(item(u, "water-sewer")!.basis).toMatch(/part placeholder/i);
  });

  it("bills Friendswood the same either side of the county line", () => {
    const harris = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: [requireUnit("harris", "058")],
    });
    const galveston = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: [requireUnit("galveston", "C37")],
    });
    expect(item(harris, "water-sewer")!.monthly).toBe(
      item(galveston, "water-sewer")!.monthly,
    );
  });

  it("uses Nassau Bay's own rates, where usage is charged from gallon one", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: [
        requireUnit("harris", "027"),
        requireUnit("harris", "073"),
      ],
    });
    expect(u.providerName).toBe("City of Nassau Bay");
    expect(item(u, "water-sewer")!.confidence).toBe("sourced");
    // $15.00 + 5x$3.99 water, $16.98 + 5x$2.95 sewer. No free allowance.
    expect(item(u, "water-sewer")!.monthly).toBeCloseTo(66.68, 2);
  });

  it("uses Pasadena's FY 2026 blocks, with sewer at 90% of water", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: [
        requireUnit("harris", "027"),
        requireUnit("harris", "074"),
      ],
    });
    expect(u.providerName).toBe("City of Pasadena");
    expect(item(u, "water-sewer")!.monthly).toBeCloseTo(49.61, 2);
    // The dearest refuse charge in the district.
    expect(item(u, "refuse")!.monthly).toBeCloseTo(33.95, 2);
  });

  /**
   * Every city in the district is now sourced or part-sourced, so the fallback
   * is exercised with a stand-in rather than with a real city that will keep
   * getting sourced out from under the test.
   */
  it("falls back to a labelled estimate for a city with no entry", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: [
        requireUnit("harris", "027"),
        {
          id: "harris-zzz",
          name: "City of Nowhere",
          kind: "city",
          ratePer100: 0.4,
          taxYear: 2025,
          code: "ZZZ",
          county: "harris",
        },
      ],
    });
    expect(u.providerName).toBe("City of Nowhere");
    expect(item(u, "water-sewer")!.confidence).toBe("estimated");
    expect(item(u, "water-sewer")!.basis).toMatch(/has not been read/i);
  });

  it("asks rather than guesses when no supplier resolved", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "unknown",
      taxingUnits: [requireUnit("harris", "027")],
    });
    expect(u.providerName).toBeNull();
    expect(item(u, "water-sewer")!.confidence).toBe("ask");
  });
});

describe("the Clear Lake City Water Authority", () => {
  const CLCWA = requireUnit("harris", "142");

  /**
   * The district that serves the most parcels here is also the cheapest, which
   * is the opposite of what a buyer expects from a utility district. It funds
   * debt service through its $0.25 per $100 property tax instead of through
   * usage rates, so the cost sits in the tax line of the payment rather than in
   * the water bill.
   */
  it("is sourced, and cheaper than every city water bill in the district", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "district",
      taxingUnits: [requireUnit("harris", "027"), CLCWA],
      districts: [CLCWA],
      districtWaterAlreadyInPayment: 0,
    });
    expect(u.providerName).toBe("Clear Lake City Water Authority");
    const water = item(u, "water-sewer")!;
    expect(water.confidence).toBe("sourced");
    // 10,000 gallons bimonthly = $55.10 a bill = $27.55 a month.
    expect(water.monthly).toBeCloseTo(27.55, 2);
    expect(water.basis).toMatch(/every two months/i);
    expect(water.sourceUrl).toContain("clcwa.org");

    for (const [county, code] of [
      ["galveston", "C40"],
      ["harris", "061"],
      ["harris", "084"],
      ["harris", "073"],
    ] as const) {
      const city = estimateHouseholdUtilities({
        ...BASE,
        service: "city",
        taxingUnits: [requireUnit(county, code)],
      });
      expect(water.monthly).toBeLessThan(item(city, "water-sewer")!.monthly);
    }
  });

  /**
   * Refuse is a city service. A district supplies water and sewer only, so
   * charging the generic district refuse estimate on a Clear Lake City parcel
   * would invent a bin fee that Houston funds from general revenue.
   */
  it("adds no refuse line inside Houston, because the city collects it", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "district",
      taxingUnits: [
        requireUnit("harris", "027"),
        requireUnit("harris", "061"),
        CLCWA,
      ],
      districts: [CLCWA],
    });
    expect(item(u, "refuse")).toBeUndefined();
  });

  it("falls back to a private hauler where the city publishes no rate", () => {
    // Taylor Lake Village: CLCWA water, no published city refuse rate.
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "district",
      taxingUnits: [
        requireUnit("harris", "027"),
        requireUnit("harris", "082"),
        CLCWA,
      ],
      districts: [CLCWA],
    });
    const refuse = item(u, "refuse")!;
    expect(refuse.confidence).toBe("estimated");
    expect(refuse.basis).toMatch(/private-hauler/i);
  });

  it("still does not double-charge water the payment already carries", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "district",
      taxingUnits: [requireUnit("harris", "027"), CLCWA],
      districts: [CLCWA],
      // The payment's district water default is well above CLCWA's real bill.
      districtWaterAlreadyInPayment: 95,
    });
    expect(item(u, "water-sewer")).toBeUndefined();
  });
});

describe("a utility district is not charged for twice", () => {
  it("subtracts the district water already inside the mortgage payment", () => {
    const district = requireUnit("galveston", "M36");
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "district",
      taxingUnits: [...LEAGUE_CITY, district],
      districts: [district],
      // The payment already carries $95 of district water as its own line.
      districtWaterAlreadyInPayment: 95,
    });
    expect(u.providerName).toBe(district.name);
    // Nothing left to add, so no water line at all here.
    expect(item(u, "water-sewer")).toBeUndefined();
    // Refuse is still extra: a district is not a city service.
    expect(item(u, "refuse")).toBeDefined();
  });

  it("adds only the shortfall when the payment counts less than a typical bill", () => {
    const district = requireUnit("galveston", "M36");
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "district",
      taxingUnits: [...LEAGUE_CITY, district],
      districts: [district],
      districtWaterAlreadyInPayment: 60,
    });
    const water = item(u, "water-sewer");
    expect(water).toBeDefined();
    expect(water!.monthly).toBeCloseTo(35, 0);
  });
});

describe("gas and internet", () => {
  it("leaves gas out until the house is said to have it", () => {
    const without = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
    });
    expect(item(without, "gas")).toBeUndefined();

    const with_ = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
      hasNaturalGas: true,
    });
    expect(item(with_, "gas")!.monthly).toBe(40);
    // Gas peaks in winter, unlike everything else here.
    expect(item(with_, "gas")!.seasonal!.high).toBeGreaterThan(40);
  });

  it("totals every line it reports", () => {
    const u = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
      hasNaturalGas: true,
    });
    const sum = u.items.reduce((s, i) => s + i.monthly, 0);
    expect(u.monthlyTotal).toBeCloseTo(sum, 2);
  });
});

/**
 * The invariant that matters most. A lender counts none of this, escrows none
 * of it, and none of it belongs in a debt-to-income ratio. If any of it ever
 * reaches the payment it would silently corrupt the DTI test, the
 * affordability ceiling, the escrow deposit and the loan comparison at once.
 */
describe("utilities never touch the mortgage payment", () => {
  it("leaves the payment and cash to close unchanged whatever they are set to", () => {
    const lean = {
      ...DEFAULT_STATE,
      livingSqFt: 1_200,
      hasNaturalGas: false,
      monthlyInternet: 0,
      electricityRatePerKwh: 0.11,
    };
    const heavy = {
      ...DEFAULT_STATE,
      livingSqFt: 6_000,
      hasNaturalGas: true,
      monthlyGas: 300,
      monthlyInternet: 250,
      electricityRatePerKwh: 0.25,
    };

    const a = buildScenario(
      buildCalculatorInputs(lean),
      buildScenarioOptions(lean),
    );
    const b = buildScenario(
      buildCalculatorInputs(heavy),
      buildScenarioOptions(heavy),
    );

    expect(a.monthly.total).toBe(b.monthly.total);
    expect(a.cashToClose.totalRequired).toBe(b.cashToClose.totalRequired);
    expect(a.dti.backEnd).toBe(b.dti.backEnd);

    // And the two utility baskets really are very different, so the equality
    // above is not passing because nothing changed.
    const utilA = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
      livingSqFt: lean.livingSqFt,
      electricityRatePerKwh: lean.electricityRatePerKwh,
      monthlyInternet: lean.monthlyInternet,
    });
    const utilB = estimateHouseholdUtilities({
      ...BASE,
      service: "city",
      taxingUnits: LEAGUE_CITY,
      livingSqFt: heavy.livingSqFt,
      electricityRatePerKwh: heavy.electricityRatePerKwh,
      hasNaturalGas: true,
      monthlyGas: heavy.monthlyGas,
      monthlyInternet: heavy.monthlyInternet,
    });
    expect(utilB.monthlyTotal).toBeGreaterThan(utilA.monthlyTotal * 3);
  });
});

/**
 * This feeds the mortgage payment, not just the estimate, so it gets its own
 * coverage. Using the generic $95 placeholder on a Clear Lake parcel
 * overstated the payment by roughly $67 a month.
 */
describe("districtWaterBillFor", () => {
  it("returns the sourced bill for a district that publishes one", () => {
    const bill = districtWaterBillFor([requireUnit("harris", "142")])!;
    expect(bill.sourced).toBe(true);
    expect(bill.monthly).toBeCloseTo(27.55, 2);
    expect(bill.providerName).toBe("Clear Lake City Water Authority");
  });

  it("falls back to the placeholder for a district that does not", () => {
    const bill = districtWaterBillFor([requireUnit("galveston", "M36")])!;
    expect(bill.sourced).toBe(false);
    expect(bill.monthly).toBeGreaterThan(50);
    expect(bill.providerName).toMatch(/MUD No. 36/);
  });

  it("prefers a sourced district when a parcel carries more than one", () => {
    const bill = districtWaterBillFor([
      requireUnit("galveston", "M36"),
      requireUnit("harris", "142"),
    ])!;
    expect(bill.sourced).toBe(true);
    expect(bill.monthly).toBeCloseTo(27.55, 2);
  });

  it("returns null when there is no district at all", () => {
    expect(districtWaterBillFor([])).toBeNull();
  });
});
