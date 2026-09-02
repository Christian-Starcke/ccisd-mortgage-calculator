import { describe, expect, it } from "vitest";
import { assessWaterService, isUtilityDistrict } from "@/lib/waterService";
import { calculatePropertyTax, type TaxUnitCodeRecord } from "@/lib/propertyTax";
import { requireUnit } from "@/lib/lookups/resolveCodes";

const CLEAR_LAKE_UNITS = [
  requireUnit("harris", "027"), // Clear Creek ISD
  requireUnit("harris", "040"), // Harris County
  requireUnit("harris", "041"), // Flood Control
  requireUnit("harris", "042"), // Port of Houston
  requireUnit("harris", "043"), // Hospital District
  requireUnit("harris", "044"), // Department of Education
  requireUnit("harris", "061"), // City of Houston
];

/** The same neighbourhood, but inside the Clear Lake City Water Authority. */
const WITH_WATER_AUTHORITY = [
  ...CLEAR_LAKE_UNITS,
  requireUnit("harris", "142"),
];

function tax(units: typeof CLEAR_LAKE_UNITS, appraisedValue = 302_392) {
  return calculatePropertyTax({ appraisedValue, units, claimHomestead: true });
}

describe("isUtilityDistrict", () => {
  it("counts MUDs and water authorities, not cities or schools", () => {
    expect(isUtilityDistrict(requireUnit("harris", "142"))).toBe(true); // water authority
    expect(isUtilityDistrict(requireUnit("galveston", "M36"))).toBe(true); // MUD
    expect(isUtilityDistrict(requireUnit("galveston", "W03"))).toBe(true); // WCID
    expect(isUtilityDistrict(requireUnit("harris", "061"))).toBe(false); // city
    expect(isUtilityDistrict(requireUnit("harris", "027"))).toBe(false); // school
    // Drainage is a real unit but it does not supply anyone's water.
    expect(isUtilityDistrict(requireUnit("galveston", "D08"))).toBe(false);
  });
});

describe("assessWaterService", () => {
  it("reports city service when a picked parcel has no district", () => {
    const water = assessWaterService({
      propertyTax: tax(CLEAR_LAKE_UNITS),
      monthlyWaterBill: 0,
      hasParcel: true,
    });
    expect(water.service).toBe("city");
    expect(water.districts).toEqual([]);
    expect(water.monthlyTotal).toBe(0);
    expect(water.districtTaxAtClosing).toBe(0);
  });

  /**
   * With no parcel, the absence of a district only means the preset did not
   * assume one. Calling that "city-served" would be a guess, and it is the
   * guess that costs the most when it is wrong.
   */
  it("reports unknown rather than city when no parcel has been picked", () => {
    const water = assessWaterService({
      propertyTax: tax(CLEAR_LAKE_UNITS),
      monthlyWaterBill: 0,
      hasParcel: false,
    });
    expect(water.service).toBe("unknown");
  });

  it("prices both halves of a district, and the escrow deposit", () => {
    const water = assessWaterService({
      propertyTax: tax(WITH_WATER_AUTHORITY),
      monthlyWaterBill: 95,
      hasParcel: true,
      taxEscrowMonths: 12,
    });

    expect(water.service).toBe("district");
    expect(water.districts.map((u) => u.code)).toEqual(["142"]);

    // Clear Lake City Water Authority: $0.25 per $100 with a 20% homestead
    // exemption, on $302,392 appraised.
    const taxable = 302_392 * 0.8;
    expect(water.annualDistrictTax).toBeCloseTo((taxable * 0.25) / 100, 1);
    expect(water.monthlyDistrictTax).toBeCloseTo(water.annualDistrictTax / 12, 1);

    // The water bill is the other half, and both belong in the headline.
    expect(water.monthlyWaterBill).toBe(95);
    expect(water.monthlyTotal).toBeCloseTo(water.monthlyDistrictTax + 95, 1);

    // And a full year of the tax half is due in cash at closing.
    expect(water.districtTaxAtClosing).toBeCloseTo(water.annualDistrictTax, 1);
  });

  it("adds the district on top of the bill rather than reshuffling it", () => {
    const without = tax(CLEAR_LAKE_UNITS);
    const withDistrict = tax(WITH_WATER_AUTHORITY);
    const water = assessWaterService({
      propertyTax: withDistrict,
      monthlyWaterBill: 95,
      hasParcel: true,
    });
    // The district's own tax is exactly the difference between the two bills.
    expect(withDistrict.annualTax - without.annualTax).toBeCloseTo(
      water.annualDistrictTax,
      1,
    );
    expect(water.shareOfTaxBill).toBeGreaterThan(0);
    expect(water.shareOfTaxBill).toBeLessThan(1);
  });

  /**
   * The expensive end of the range. Galveston County MUD 36 levies $1.15 per
   * $100 with no homestead exemption at all — more than Clear Creek ISD's
   * school tax on the same house.
   */
  it("shows the worst-case district costing more than the school district", () => {
    const units = [
      requireUnit("galveston", "S16"),
      requireUnit("galveston", "GGA"),
      requireUnit("galveston", "RFL"),
      requireUnit("galveston", "C40"),
      requireUnit("galveston", "M36"),
    ];
    const bill = calculatePropertyTax({
      appraisedValue: 300_000,
      units,
      claimHomestead: true,
    });
    const water = assessWaterService({
      propertyTax: bill,
      monthlyWaterBill: 95,
      hasParcel: true,
    });

    const school = bill.lineItems.find((r) => r.unit.code === "S16")!;
    expect(water.annualDistrictTax).toBeGreaterThan(school.annualTax);
    // Over $300 a month once the water bill is counted.
    expect(water.monthlyTotal).toBeGreaterThan(300);
  });

  it("treats a district with no published rate as unknown, never as zero", () => {
    const unknown: TaxUnitCodeRecord = {
      code: "A76",
      name: "HC MUD 568",
      kind: "mud",
      ratePer100: null,
      taxYear: 2025,
      rateUnknown: true,
    };
    const water = assessWaterService({
      propertyTax: tax(CLEAR_LAKE_UNITS),
      monthlyWaterBill: 0,
      hasParcel: true,
      unknownRateCodes: [unknown],
    });
    // A parcel that names a district must never come back "city-served".
    expect(water.service).toBe("unknown");
    expect(water.unknownRateDistricts.map((r) => r.code)).toEqual(["A76"]);
  });

  it("ignores non-district codes with unpublished rates", () => {
    const zone: TaxUnitCodeRecord = {
      code: "T15",
      name: "Assessment or reinvestment zone T15",
      kind: "zone",
      ratePer100: 0,
      taxYear: 2025,
      nonLevying: true,
    };
    const water = assessWaterService({
      propertyTax: tax(CLEAR_LAKE_UNITS),
      monthlyWaterBill: 0,
      hasParcel: true,
      unknownRateCodes: [zone],
    });
    // A reinvestment zone says nothing about who supplies the water.
    expect(water.service).toBe("city");
    expect(water.unknownRateDistricts).toEqual([]);
  });
});

/**
 * The comparison that motivated this card: two houses at the same price, both
 * Clear Creek ISD, one on city water and one in a district.
 */
describe("the cost of a district, same price and same schools", () => {
  it("is worth more than the school-rate difference between districts", () => {
    const price = 250_000;
    const cityBill = tax(CLEAR_LAKE_UNITS, price);
    const districtBill = tax(WITH_WATER_AUTHORITY, price);
    const water = assessWaterService({
      propertyTax: districtBill,
      monthlyWaterBill: 95,
      hasParcel: true,
    });

    // Clear Creek at 0.969 with a 5% local exemption against Fort Bend ISD at
    // 1.0569 with none is worth about $18 a month at this price.
    const ccisd = calculatePropertyTax({
      appraisedValue: price,
      units: [requireUnit("harris", "027")],
      claimHomestead: true,
    });
    const fbisdEquivalent = calculatePropertyTax({
      appraisedValue: price,
      units: [
        {
          id: "fbisd-reference",
          name: "Fort Bend ISD (reference only)",
          kind: "school",
          ratePer100: 1.0569,
          homesteadFlatExemption: 140_000,
          taxYear: 2025,
        },
      ],
      claimHomestead: true,
    });
    const schoolGap = (fbisdEquivalent.annualTax - ccisd.annualTax) / 12;

    expect(schoolGap).toBeGreaterThan(15);
    expect(schoolGap).toBeLessThan(25);
    // Even the cheapest district in the district costs several times that.
    expect(water.monthlyTotal).toBeGreaterThan(schoolGap * 3);
    expect(districtBill.annualTax).toBeGreaterThan(cityBill.annualTax);
  });
});
