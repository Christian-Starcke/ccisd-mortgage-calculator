import { requireUnit } from "@/lib/lookups/resolveCodes";
import type { County, TaxingUnit } from "@/lib/propertyTax";
import type { WindExposure } from "@/lib/windstorm";

/**
 * Location presets used when no parcel has been picked.
 *
 * A selected parcel never uses this file for rates. It resolves the appraisal
 * district's own taxing-unit codes through `harrisTaxUnitCodes.ts` (generated
 * from the Harris County rate table) or `galvestonTaxUnitCodes.ts` (from the
 * Galveston CAD rate and exemption PDF). Typing the address is always the
 * better path; these presets exist so the calculator answers before an address
 * is known, and so the cost of guessing the wrong location can be priced.
 *
 * Every rate below is read out of those generated tables by code rather than
 * restated here. There is exactly one copy of each rate in this project.
 *
 * Texas units adopt by September 30, so 2025 is the billing set for a 2026
 * purchase until 2026 rates land.
 */

export const TAX_YEAR = 2025;

const h = (code: string) => requireUnit("harris", code);
const g = (code: string) => requireUnit("galveston", code);

// ---------------------------------------------------------------------------
// Always-on units
//
// Every Harris parcel in the district is billed by six units before any city
// or utility district: the school district, the county, flood control, the
// hospital district, the department of education and the Port of Houston.
// Galveston bills three: the school district, the county and Road & Flood.
// That difference alone is about 24 cents per $100 before a city is added.
// ---------------------------------------------------------------------------

export const CLEAR_CREEK_ISD_HARRIS = h("027");
export const CLEAR_CREEK_ISD_GALVESTON = g("S16");

export const HARRIS_COUNTYWIDE: TaxingUnit[] = [
  h("040"), // Harris County
  h("041"), // Flood Control District
  h("043"), // Hospital District (Harris Health)
  h("044"), // Department of Education
  h("042"), // Port of Houston Authority
];

export const GALVESTON_COUNTYWIDE: TaxingUnit[] = [
  g("GGA"), // Galveston County
  g("RFL"), // Road & Flood
];

const HARRIS_BASE = [CLEAR_CREEK_ISD_HARRIS, ...HARRIS_COUNTYWIDE];
const GALVESTON_BASE = [CLEAR_CREEK_ISD_GALVESTON, ...GALVESTON_COUNTYWIDE];

// ---------------------------------------------------------------------------
// Utility districts
//
// The largest swing between two otherwise identical homes, and the reason the
// engine bills units separately. On the Galveston side a house in MUD 36 pays
// $1.15 per $100 more than a house in WCID 12 — more than the school tax.
// ---------------------------------------------------------------------------

const NO_UTILITY: TaxingUnit = {
  id: "none",
  name: "No utility district",
  kind: "mud",
  ratePer100: 0,
  taxYear: TAX_YEAR,
  note: "Established neighbourhoods inside a city, where water and sewer come from the city rather than a district.",
};

/**
 * Listed by county and code, ordered so the districts a buyer is most likely
 * to land in come first. `footprintShare` in the generated tables is what that
 * ordering is based on.
 */
const UTILITY_DISTRICT_CODES: { county: County; code: string }[] = [
  { county: "harris", code: "142" }, // Clear Lake City Water Authority
  { county: "harris", code: "355" }, // HC MUD 055
  { county: "harris", code: "313" }, // Clearbrook City MUD
  { county: "harris", code: "604" }, // HC WCID 050
  { county: "harris", code: "351" }, // HC WCID 161
  { county: "harris", code: "248" }, // HC MUD 481
  { county: "harris", code: "400" }, // HC RID 001
  { county: "harris", code: "616" }, // HC WCID 156
  { county: "harris", code: "510" }, // HC MUD 373
  { county: "harris", code: "124" }, // Baybrook MUD 1
  { county: "galveston", code: "W03" }, // WCID No. 12
  { county: "galveston", code: "M08" }, // MUD No. 6
  { county: "galveston", code: "M45" },
  { county: "galveston", code: "M39" },
  { county: "galveston", code: "M46" },
  { county: "galveston", code: "M27" }, // South Shore Harbour MUD No. 7
  { county: "galveston", code: "M19" }, // Westwood Management District
  { county: "galveston", code: "M43" },
  { county: "galveston", code: "M36" },
  { county: "galveston", code: "M82" },
  { county: "galveston", code: "M23" }, // Kemah Management District No. 1
  { county: "galveston", code: "M05" }, // Bayview MUD
  { county: "galveston", code: "M73" },
  { county: "galveston", code: "M22" }, // Bay Colony West MUD
  { county: "galveston", code: "M21" },
  { county: "galveston", code: "M04" }, // Bacliff MUD
];

export const UTILITY_DISTRICTS: TaxingUnit[] = [
  NO_UTILITY,
  ...UTILITY_DISTRICT_CODES.map(({ county, code }) =>
    requireUnit(county, code),
  ),
];

// ---------------------------------------------------------------------------
// Location presets
// ---------------------------------------------------------------------------

export interface LocationPreset {
  id: string;
  name: string;
  description: string;
  /** Which appraisal district bills this location. */
  county: County;
  /** Units that always apply at this location. */
  baseUnits: TaxingUnit[];
  /** Default utility district id for this location. */
  defaultUtilityDistrictId: string;
  /**
   * Coastal wind exposure, which decides whether a separate windstorm policy
   * belongs in the payment. The single largest cost difference between the
   * Harris and Galveston halves of the same school district.
   */
  windExposure: WindExposure;
  /**
   * Whether USDA financing is plausible here. False everywhere in this
   * district: Clear Creek ISD is continuously built-up suburban Houston and
   * the whole footprint sits inside a USDA ineligible area. The field is kept
   * so the comparison table can say so rather than stay silent.
   */
  usdaPlausible: boolean;
  /** Typical annual HOA dues range for this location. */
  typicalHoaAnnual: [number, number];
  /** Whether this location is inside Houston city limits (unlocks Houston DPA). */
  insideHoustonCityLimits: boolean;
  note?: string;
  /**
   * Set only where the mailing city on a listing does not reliably imply Clear
   * Creek ISD. The alternate units describe what the same house costs if the
   * address turns out to be on the other side of the boundary, which lets the
   * UI quote the mistake as a dollar figure instead of a caveat.
   */
  districtRisk?: {
    alternateName: string;
    alternateUnits: TaxingUnit[];
    explanation: string;
  };
}

export const LOCATION_PRESETS: LocationPreset[] = [
  {
    id: "league-city",
    name: "League City",
    description:
      "The Galveston County side of the district, from Bay Ridge and Brittany Lakes to South Shore Harbour and Victory Lakes.",
    county: "galveston",
    baseUnits: [...GALVESTON_BASE, g("C40")],
    defaultUtilityDistrictId: "none",
    windExposure: "designated",
    usdaPlausible: false,
    typicalHoaAnnual: [400, 1_200],
    insideHoustonCityLimits: false,
    note: "Nearly nine in ten Galveston-side parcels in the district. The tax bill is the cheapest of any incorporated option here — three countywide units instead of Harris's six, plus a low city rate with a 20% city homestead exemption. Windstorm insurance takes most of that saving back.",
    districtRisk: {
      alternateName: "Dickinson ISD",
      alternateUnits: [
        g("S11"),
        ...GALVESTON_COUNTYWIDE,
        g("C40"),
      ],
      explanation:
        "A League City mailing address does not settle the school district. The southern and western parts of the city are Dickinson ISD, which costs about 17 cents per $100 more and grants no local option homestead exemption on top of the state's. Check the street address on the CCISD attendance map.",
    },
  },
  {
    id: "houston-clear-lake",
    name: "Houston (Clear Lake City)",
    description:
      "Clear Lake City, Bay Oaks, Pine Brook and the other Houston-annexed neighbourhoods inside the district.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("061")],
    defaultUtilityDistrictId: "142",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [300, 1_100],
    insideHoustonCityLimits: true,
    note: "Worth checking carefully: being inside Houston city limits opens the City of Houston down payment assistance programme, the largest award available in the region. Most of these addresses are also in the Clear Lake City Water Authority, which is defaulted in here.",
  },
  {
    id: "webster",
    name: "Webster",
    description: "The city of Webster, entirely inside Clear Creek ISD.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("084")],
    defaultUtilityDistrictId: "none",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 700],
    insideHoustonCityLimits: false,
    note: "A low city rate with a 20% city homestead exemption, and outside the windstorm catastrophe area. On total housing cost this is usually the cheapest place in the district to buy the same house.",
  },
  {
    id: "nassau-bay",
    name: "Nassau Bay",
    description: "The city of Nassau Bay, across NASA Parkway from Johnson Space Center.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("073")],
    defaultUtilityDistrictId: "none",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 900],
    insideHoustonCityLimits: false,
    note: "The city rate is high for this district and its homestead exemption is only 1%, so the city line costs more here than anywhere else on the Harris side.",
  },
  {
    id: "el-lago",
    name: "El Lago",
    description: "The city of El Lago, between Taylor Lake and Clear Lake.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("056")],
    defaultUtilityDistrictId: "none",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 600],
    insideHoustonCityLimits: false,
  },
  {
    id: "taylor-lake-village",
    name: "Taylor Lake Village",
    description: "The city of Taylor Lake Village, on the west shore of Taylor Lake.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("082")],
    defaultUtilityDistrictId: "none",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 600],
    insideHoustonCityLimits: false,
    note: "The lowest city rate on the Harris side at 23 cents per $100, all maintenance and no debt service. It grants no homestead exemption, but at that rate the exemption would be worth little anyway.",
  },
  {
    id: "seabrook",
    name: "Seabrook",
    description: "The city of Seabrook, on Galveston Bay east of Highway 146.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("076")],
    defaultUtilityDistrictId: "none",
    windExposure: "boundary-uncertain",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 800],
    insideHoustonCityLimits: false,
    note: "The one Harris County city in this district where the windstorm catastrophe area reaches. Eligibility applies only east of Highway 146, so it turns on the exact address. A separate windstorm policy is assumed here, which is the conservative reading; confirm it, because west of 146 that premium comes off entirely.",
  },
  {
    id: "kemah",
    name: "Kemah",
    description: "The city of Kemah, at the mouth of Clear Creek.",
    county: "galveston",
    baseUnits: [...GALVESTON_BASE, g("C38")],
    defaultUtilityDistrictId: "none",
    windExposure: "designated",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 1_000],
    insideHoustonCityLimits: false,
    note: "No city debt service rate at all and a 20% city homestead exemption, so the city line is close to nothing. Windstorm and flood are the costs that matter here.",
  },
  {
    id: "clear-lake-shores",
    name: "Clear Lake Shores",
    description: "The island city of Clear Lake Shores, between Clear Lake and Galveston Bay.",
    county: "galveston",
    baseUnits: [...GALVESTON_BASE, g("C46")],
    defaultUtilityDistrictId: "none",
    windExposure: "designated",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 600],
    insideHoustonCityLimits: false,
    note: "Levies no city property tax whatsoever — the adopted rate is zero — so the bill is school, county and Road & Flood only. That is the lowest tax rate in the district by a wide margin, and it is offset by the highest windstorm and flood exposure in it.",
  },
  {
    id: "friendswood-ccisd",
    name: "Friendswood (Clear Creek ISD portion)",
    description: "The Harris County part of Friendswood, which is Clear Creek ISD.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("058")],
    defaultUtilityDistrictId: "none",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 900],
    insideHoustonCityLimits: false,
    note: "Friendswood is split between two school districts and two counties. The Harris County part is Clear Creek ISD; the Galveston County part is Friendswood ISD. A Friendswood address on a listing settles neither.",
    districtRisk: {
      alternateName: "Friendswood ISD",
      alternateUnits: [g("S12"), ...GALVESTON_COUNTYWIDE, g("C37")],
      explanation:
        "If the address is in the Galveston County part of Friendswood it is Friendswood ISD, not Clear Creek. That district costs about six cents per $100 more and grants no local option homestead exemption, though it is billed by Galveston County, which has three countywide units rather than Harris's six. Check the street address on the CCISD attendance map before assuming either.",
    },
  },
  {
    id: "pasadena-ccisd",
    name: "Pasadena (Clear Creek ISD portion)",
    description: "The southern part of Pasadena that is zoned to Clear Creek ISD.",
    county: "harris",
    baseUnits: [...HARRIS_BASE, h("074")],
    defaultUtilityDistrictId: "none",
    windExposure: "boundary-uncertain",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 600],
    insideHoustonCityLimits: false,
    note: "Most of Pasadena is Pasadena ISD; only the southern edge is Clear Creek. This is the most commonly mistaken address in the district.",
    districtRisk: {
      alternateName: "Pasadena ISD",
      alternateUnits: [h("021"), ...HARRIS_COUNTYWIDE, h("074"), h("047")],
      explanation:
        "Pasadena ISD costs about 20 cents per $100 more than Clear Creek ISD, and a Pasadena address is more likely to be in it than not. It also brings the San Jacinto College levy. On a $400,000 home the difference is roughly $700 a year. Check the street address on the CCISD attendance map.",
    },
  },
  {
    id: "unincorporated-harris-mud",
    name: "Unincorporated Harris County, in a utility district",
    description:
      "Newer Harris County subdivisions inside the district that are not in any city.",
    county: "harris",
    baseUnits: HARRIS_BASE,
    defaultUtilityDistrictId: "355",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [500, 1_400],
    insideHoustonCityLimits: false,
    note: "No city tax, but a utility district instead, and the district usually costs more than the city would have. Find the actual district on the appraisal record: the range across the ones in this area runs from 5 cents to $1.11 per $100.",
  },
  {
    id: "unincorporated-harris",
    name: "Unincorporated Harris County, no utility district",
    description:
      "Harris County addresses inside the district with neither a city nor a utility district.",
    county: "harris",
    baseUnits: HARRIS_BASE,
    defaultUtilityDistrictId: "none",
    windExposure: "inland",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 700],
    insideHoustonCityLimits: false,
    note: "The cheapest tax bill available on the Harris side, and rare. Confirm on the appraisal record that there really is no district, because assuming this wrongly understates the payment by more than any other mistake in the calculator.",
  },
  {
    id: "unincorporated-galveston",
    name: "Unincorporated Galveston County",
    description:
      "Galveston County addresses inside the district and outside any city, including the Bacliff and San Leon corridor.",
    county: "galveston",
    baseUnits: [...GALVESTON_BASE, g("D08")],
    defaultUtilityDistrictId: "none",
    windExposure: "designated",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 600],
    insideHoustonCityLimits: false,
    note: "No city tax, and often a consolidated drainage district instead. This is also where the district boundary is least predictable, so the address matters more here than anywhere else.",
    districtRisk: {
      alternateName: "Dickinson ISD",
      alternateUnits: [g("S11"), ...GALVESTON_COUNTYWIDE, g("D08")],
      explanation:
        "The Bacliff and San Leon corridor is split between Clear Creek ISD and Dickinson ISD parcel by parcel. Dickinson costs about 17 cents per $100 more. Nothing about the mailing address predicts which one applies.",
    },
  },
];

export function findLocationPreset(id: string): LocationPreset {
  return (
    LOCATION_PRESETS.find((preset) => preset.id === id) ?? LOCATION_PRESETS[0]
  );
}

/** Typical annual HOA for a location when the listing amount is unknown. */
export function typicalHoaForLocation(locationId: string): {
  low: number;
  high: number;
  midpoint: number;
} {
  const [low, high] = findLocationPreset(locationId).typicalHoaAnnual;
  return { low, high, midpoint: Math.round((low + high) / 2) };
}

export function findUtilityDistrict(id: string): TaxingUnit {
  return (
    UTILITY_DISTRICTS.find((unit) => unit.id === id) ?? UTILITY_DISTRICTS[0]
  );
}

/**
 * Utility districts that can apply at a location, which is county-scoped: a
 * Galveston MUD cannot bill a Harris parcel. Without this the picker would
 * offer 26 districts, 16 of which are impossible for any given address.
 */
export function utilityDistrictsForLocation(locationId: string): TaxingUnit[] {
  const { county } = findLocationPreset(locationId);
  return UTILITY_DISTRICTS.filter(
    (unit) => unit.id === "none" || unit.county === county,
  );
}

/**
 * Nominal combined rate for a preset, as a fraction of value, using the
 * location's default utility district. This is the number to compare locations
 * on, before exemptions, which is what makes it useful for ranking.
 */
export function presetCombinedRate(preset: LocationPreset): number {
  const utility = findUtilityDistrict(preset.defaultUtilityDistrictId);
  const total =
    preset.baseUnits.reduce((sum, unit) => sum + unit.ratePer100, 0) +
    utility.ratePer100;
  return total / 100;
}

/** Resolves the full set of taxing units for a location plus utility district. */
function withUtilityDistrict(
  baseUnits: TaxingUnit[],
  county: County,
  utilityDistrictId: string,
  manualUtilityRatePer100: number | null,
): TaxingUnit[] {
  // Drop units that levy nothing, so this path agrees with the parcel path in
  // `resolveUnitsFromCodes`. Clear Lake Shores has a zero adopted city rate;
  // without this, the same house would show a different number of line items
  // depending on whether the buyer picked a parcel or used the preset.
  const units = baseUnits.filter((unit) => unit.ratePer100 > 0);

  if (manualUtilityRatePer100 != null && manualUtilityRatePer100 > 0) {
    units.push({
      id: "manual-utility",
      name: "Utility district (entered manually)",
      kind: "mud",
      ratePer100: manualUtilityRatePer100,
      taxYear: TAX_YEAR,
      county,
      note: "Rate you entered from the appraisal district record for this address.",
    });
    return units;
  }

  const district = findUtilityDistrict(utilityDistrictId);
  // A district can only bill a parcel its own appraisal district appraises, so
  // a stale Galveston selection must not follow the buyer to a Harris address.
  // This happens whenever the location changes after a district was picked.
  if (district.ratePer100 > 0 && district.county === county) {
    units.push(district);
  }

  return units;
}

export function resolveTaxingUnits(
  locationId: string,
  utilityDistrictId: string,
  manualUtilityRatePer100: number | null,
): TaxingUnit[] {
  const preset = findLocationPreset(locationId);
  return withUtilityDistrict(
    preset.baseUnits,
    preset.county,
    utilityDistrictId,
    manualUtilityRatePer100,
  );
}

/**
 * The same property priced as if it fell on the other side of a school
 * district boundary. Returns null for locations where the district is not in
 * doubt. The utility district carries over untouched, since it follows the
 * parcel rather than the school or city boundary.
 */
export function resolveAlternateDistrictUnits(
  locationId: string,
  utilityDistrictId: string,
  manualUtilityRatePer100: number | null,
): TaxingUnit[] | null {
  const risk = findLocationPreset(locationId).districtRisk;
  if (!risk) return null;

  // The alternate can be in the other county — a Friendswood address is Clear
  // Creek in Harris and Friendswood ISD in Galveston — so the county comes
  // from the alternate's own units rather than from the preset.
  const alternateCounty =
    risk.alternateUnits.find((unit) => unit.county)?.county ??
    findLocationPreset(locationId).county;

  return withUtilityDistrict(
    risk.alternateUnits,
    alternateCounty,
    utilityDistrictId,
    manualUtilityRatePer100,
  );
}
