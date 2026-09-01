import type { TaxingUnit } from "@/lib/propertyTax";

/**
 * Location presets used when no FBCAD parcel is selected.
 *
 * Parcel lookups do **not** use this file for rates. They resolve FBCAD
 * `taxunits` codes through `fortBendTaxUnitCodes.ts`, which is generated from
 * the county Truth-in-Taxation portal (`npm run build:tax-units`).
 *
 * Homestead exemption overlays on known units still follow the county
 * Tax Assessor-Collector worksheet:
 * https://www.fortbendcountytx.gov/sites/default/files/document-central/document-central/tax-assessor-documents/property-taxes-additional-information/2025-Tax-Rate-and-Exemption-worksheet.pdf
 *
 * Rates are per $100 of taxable value. Texas units adopt by September 30;
 * until 2026 rates are adopted, 2025 is the billing set for a 2026 purchase.
 */

export const TAX_YEAR = 2025;

const WORKSHEET_URL =
  "https://www.fortbendcountytx.gov/sites/default/files/document-central/document-central/tax-assessor-documents/property-taxes-additional-information/2025-Tax-Rate-and-Exemption-worksheet.pdf";

// ---------------------------------------------------------------------------
// County
// ---------------------------------------------------------------------------

export const FORT_BEND_COUNTY_GENERAL: TaxingUnit = {
  id: "county-general",
  name: "Fort Bend County (General Fund)",
  kind: "county",
  ratePer100: 0.412,
  homesteadPercentExemption: 0.2,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note:
    "The county grants a 20% homestead exemption, the largest percentage exemption on your bill. The county proposed holding this rate flat at $0.412 for 2026.",
};

export const FORT_BEND_COUNTY_DRAINAGE: TaxingUnit = {
  id: "county-drainage",
  name: "Fort Bend County Drainage District",
  kind: "drainage",
  ratePer100: 0.01,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note: "Grants no general homestead exemption, but at one cent per $100 it is a trivial line item.",
};

// ---------------------------------------------------------------------------
// School district
// ---------------------------------------------------------------------------

export const FORT_BEND_ISD: TaxingUnit = {
  id: "fbisd",
  name: "Fort Bend ISD",
  kind: "school",
  ratePer100: 1.0569,
  homesteadFlatExemption: 140_000,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note:
    "Made up of a $0.7869 maintenance and operations rate plus a $0.2700 debt service rate. The $140,000 homestead exemption comes from Texas Proposition 13, approved by voters in November 2025. District officials have projected a 2026 rate near $0.9969 as seven disaster pennies expire, which has not yet been adopted.",
};

/**
 * Deliberately not part of any Fort Bend ISD scenario. It is here because
 * Richmond mailing addresses straddle the Fort Bend ISD / Lamar CISD line, and a
 * buyer who assumes the wrong district has mispriced the largest single line on
 * the bill. Used only to quantify that risk.
 */
export const LAMAR_CISD: TaxingUnit = {
  id: "lamar-cisd",
  name: "Lamar Consolidated ISD",
  kind: "school",
  ratePer100: 1.1469,
  homesteadFlatExemption: 140_000,
  taxYear: 2025,
  sourceUrl: "https://www.lcisd.org/23968_4",
  note:
    "A $0.6669 maintenance and operations rate plus a $0.4800 debt service rate. That debt rate is nearly double Fort Bend ISD's because Lamar is building schools for faster growth, which is what makes it about nine cents per $100 more expensive.",
};

// ---------------------------------------------------------------------------
// Cities within or overlapping Fort Bend ISD
// ---------------------------------------------------------------------------

export const CITY_SUGAR_LAND: TaxingUnit = {
  id: "city-sugar-land",
  name: "City of Sugar Land",
  kind: "city",
  ratePer100: 0.358827,
  homesteadPercentExemption: 0.15,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note: "One of the lowest city rates in the Houston area, and it grants a 15% homestead exemption on top.",
};

export const CITY_MISSOURI_CITY: TaxingUnit = {
  id: "city-missouri-city",
  name: "City of Missouri City",
  kind: "city",
  ratePer100: 0.570825,
  homesteadPercentExemption: 0.025,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note:
    "Costs about 21 cents per $100 more than Sugar Land, and its homestead exemption is only 2.5%. On a $400,000 home that difference is roughly $900 a year.",
};

export const CITY_MEADOWS_PLACE: TaxingUnit = {
  id: "city-meadows-place",
  name: "City of Meadows Place",
  kind: "city",
  ratePer100: 0.94364,
  homesteadPercentExemption: 0.2,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note: "The highest city rate inside Fort Bend ISD, partly offset by a 20% homestead exemption.",
};

export const CITY_ARCOLA: TaxingUnit = {
  id: "city-arcola",
  name: "City of Arcola",
  kind: "city",
  ratePer100: 0.649619,
  homesteadPercentExemption: 0.2,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note: "A small city on FM 521 at the south end of the district. Some subdivisions with Rosharon mailing addresses sit just outside it and pay no city tax at all.",
};

/**
 * Like Lamar CISD, this exists to price a risk rather than a scenario. Property
 * inside Richmond city limits is overwhelmingly Lamar CISD, so this rate shows
 * up only in the alternate case for a Richmond mailing address.
 */
export const CITY_RICHMOND: TaxingUnit = {
  id: "city-richmond",
  name: "City of Richmond",
  kind: "city",
  ratePer100: 0.63,
  homesteadPercentExemption: 0.035,
  taxYear: 2025,
  sourceUrl: "https://www.richmondtx.gov/Home/Components/News/News/8917/",
  note:
    "Adopted September 15, 2025, down a penny from $0.640000. Its 3.5% homestead exemption is the smallest of any city here, though Texas law floors it at $5,000.",
};

// ---------------------------------------------------------------------------
// Community college districts
// ---------------------------------------------------------------------------

export const HCC_MISSOURI_CITY: TaxingUnit = {
  id: "hcc-missouri-city",
  name: "Houston Community College (Missouri City annexation)",
  kind: "college",
  ratePer100: 0.098802,
  homesteadPercentExemption: 0.17,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
};

export const WCJC: TaxingUnit = {
  id: "wcjc",
  name: "Wharton County Junior College District",
  kind: "college",
  ratePer100: 0.14,
  taxYear: 2025,
  sourceUrl: WORKSHEET_URL,
  note: "Grants no homestead exemption.",
};

// ---------------------------------------------------------------------------
// Emergency services districts
// ---------------------------------------------------------------------------

export const ESD_RATES: TaxingUnit[] = [
  {
    id: "esd-1",
    name: "Fort Bend County ESD 1",
    kind: "esd",
    ratePer100: 0.065659,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "esd-2",
    name: "Fort Bend County ESD 2",
    kind: "esd",
    ratePer100: 0.095749,
    homesteadPercentExemption: 0.2,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "esd-3",
    name: "Fort Bend County ESD 3",
    kind: "esd",
    ratePer100: 0.1,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "esd-4",
    name: "Fort Bend County ESD 4",
    kind: "esd",
    ratePer100: 0.096628,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "esd-5",
    name: "Fort Bend County ESD 5",
    kind: "esd",
    ratePer100: 0.1,
    homesteadPercentExemption: 0.1,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "esd-6",
    name: "Fort Bend County ESD 6",
    kind: "esd",
    ratePer100: 0.1,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "esd-7",
    name: "Fort Bend County ESD 7",
    kind: "esd",
    ratePer100: 0.098479,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
];

/** A representative ESD for unincorporated areas that have no city fire service. */
export const ESD_TYPICAL: TaxingUnit = ESD_RATES[3];

/** The district that actually covers the Arcola and Rosharon end of FM 521. */
export const ESD_ROSHARON: TaxingUnit = ESD_RATES[6];

// ---------------------------------------------------------------------------
// MUD, LID, WCID and fresh water supply districts
// ---------------------------------------------------------------------------

/**
 * Utility districts are the single largest source of variation in a Fort Bend
 * property tax bill. Every one of these rates is real and adopted for 2025, and
 * the spread runs from four cents to a dollar and ten cents per $100. On a
 * $400,000 home that is the difference between $160 and $4,400 a year.
 *
 * Two things drive the spread. A district that recently issued bonds to build
 * water, sewer and drainage for a new subdivision carries a heavy debt service
 * rate. A district whose bonds are largely paid off carries almost nothing. So
 * the newest, shiniest neighborhood is usually the most expensive to hold.
 *
 * Note: this list covers only districts the Fort Bend County Tax
 * Assessor-Collector bills for. Several large master-planned communities,
 * including Sienna, Riverstone, Aliana and Harvest Green, use private tax
 * collectors and are not on the county worksheet. For those, look the exact
 * address up on the Fort Bend Central Appraisal District site and enter the rate
 * manually.
 */
export const UTILITY_DISTRICTS: TaxingUnit[] = [
  {
    id: "none",
    name: "No utility district",
    kind: "other",
    ratePer100: 0,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
    note: "Typical of older established neighborhoods inside city limits where the city provides utilities.",
  },
  {
    id: "lid-12",
    name: "Fort Bend LID 12",
    kind: "lid",
    ratePer100: 0.04,
    homesteadPercentExemption: 0.2,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
    note: "The cheapest district on the county roll, and it grants a 20% homestead exemption.",
  },
  {
    id: "lid-14",
    name: "Fort Bend LID 14",
    kind: "lid",
    ratePer100: 0.101,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "lid-2",
    name: "Fort Bend LID 2",
    kind: "lid",
    ratePer100: 0.118,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "willow-fork-drainage",
    name: "Willow Fork Drainage District",
    kind: "drainage",
    ratePer100: 0.145,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "first-colony-lid-2",
    name: "First Colony LID 2",
    kind: "lid",
    ratePer100: 0.1541,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
    note: "Serves parts of the First Colony area of Sugar Land.",
  },
  {
    id: "mud-129",
    name: "Fort Bend MUD 129",
    kind: "mud",
    ratePer100: 0.18,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "wcid-2",
    name: "Fort Bend WCID 2",
    kind: "mud",
    ratePer100: 0.2125,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "cinco-mud-7",
    name: "Cinco MUD 7",
    kind: "mud",
    ratePer100: 0.2242,
    homesteadPercentExemption: 0.03,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "lid-15",
    name: "Fort Bend LID 15",
    kind: "lid",
    ratePer100: 0.245,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "mud-46",
    name: "Fort Bend MUD 46",
    kind: "mud",
    ratePer100: 0.34,
    homesteadPercentExemption: 0.1,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "lid-17",
    name: "Fort Bend LID 17",
    kind: "lid",
    ratePer100: 0.39,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "lid-19",
    name: "Fort Bend LID 19",
    kind: "lid",
    ratePer100: 0.4,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "mud-41",
    name: "Fort Bend MUD 41",
    kind: "mud",
    ratePer100: 0.426,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "fwsd-2",
    name: "Fort Bend Fresh Water Supply District 2",
    kind: "mud",
    ratePer100: 0.5145,
    homesteadPercentExemption: 0.2,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "mud-155",
    name: "Fort Bend MUD 155",
    kind: "mud",
    ratePer100: 0.86,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
    note: "A newer district carrying heavy bond debt.",
  },
  {
    id: "mud-134c",
    name: "Fort Bend MUD 134C",
    kind: "mud",
    ratePer100: 0.95,
    homesteadPercentExemption: 0.05,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "mud-134b",
    name: "Fort Bend MUD 134B",
    kind: "mud",
    ratePer100: 0.965,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "fwsd-1",
    name: "Fort Bend Fresh Water Supply District 1",
    kind: "mud",
    ratePer100: 1.0,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
  },
  {
    id: "mud-162",
    name: "Fort Bend MUD 162",
    kind: "mud",
    ratePer100: 1.1,
    taxYear: 2025,
    sourceUrl: WORKSHEET_URL,
    note: "It alone adds more than the entire county and city portions combined.",
  },
  {
    id: "fbmud-141",
    name: "Fort Bend MUD 141",
    kind: "mud",
    ratePer100: 1.01,
    taxYear: 2024,
    sourceUrl: "https://www.fbcad.org/",
    note: "Serves Glendale Lakes on FM 521. This rate comes from listing-service tax records that still reflect the 2024 roll, so confirm the current figure on the appraisal district record before you rely on it.",
  },
  {
    id: "brazoria-fbmud-3",
    name: "Brazoria-Fort Bend County MUD 3",
    kind: "mud",
    ratePer100: 1.35,
    taxYear: 2024,
    sourceUrl: "https://www.fbcad.org/",
    note: "Serves Caldwell Ranch in Rosharon and is the most expensive district here, adding roughly $5,400 a year on a $400,000 home. Its name is its own warning: the district crosses the county line, and only the Fort Bend side is in Fort Bend ISD. Rate is from 2024 listing-service records, so verify it.",
  },
];

// ---------------------------------------------------------------------------
// Location presets
// ---------------------------------------------------------------------------

export interface LocationPreset {
  id: string;
  name: string;
  description: string;
  /** Units that always apply at this location. */
  baseUnits: TaxingUnit[];
  /** Default utility district id for this location. */
  defaultUtilityDistrictId: string;
  /** Whether USDA financing is plausible here. */
  usdaPlausible: boolean;
  /** Typical annual HOA dues range for this location. */
  typicalHoaAnnual: [number, number];
  /** Whether this location is inside Houston city limits (unlocks Houston DPA). */
  insideHoustonCityLimits: boolean;
  note?: string;
  /**
   * Set only where the mailing city on a listing does not reliably imply Fort
   * Bend ISD. The alternate units describe what the same house costs if the
   * address turns out to be on the other side of the boundary, which lets the UI
   * quote the mistake as a dollar figure instead of a caveat.
   */
  districtRisk?: {
    alternateName: string;
    alternateUnits: TaxingUnit[];
    explanation: string;
  };
}

export const LOCATION_PRESETS: LocationPreset[] = [
  {
    id: "sugar-land",
    name: "Sugar Land",
    description:
      "First Colony, Telfair, New Territory, Greatwood-adjacent Sugar Land addresses.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      CITY_SUGAR_LAND,
    ],
    defaultUtilityDistrictId: "none",
    usdaPlausible: false,
    typicalHoaAnnual: [500, 1_400],
    insideHoustonCityLimits: false,
    note: "The lowest total rate of any incorporated option in Fort Bend ISD, thanks to a low city rate plus a 15% city homestead exemption.",
  },
  {
    id: "missouri-city",
    name: "Missouri City",
    description:
      "Missouri City limits, including the Quail Valley and Lake Olympia areas.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      CITY_MISSOURI_CITY,
      HCC_MISSOURI_CITY,
    ],
    defaultUtilityDistrictId: "none",
    usdaPlausible: false,
    typicalHoaAnnual: [400, 1_200],
    insideHoustonCityLimits: false,
    note: "Carries both a higher city rate and the Houston Community College levy, so it runs roughly 0.3% above Sugar Land before any utility district.",
  },
  {
    id: "meadows-place",
    name: "Meadows Place",
    description: "The small city of Meadows Place, entirely inside Fort Bend ISD.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      CITY_MEADOWS_PLACE,
    ],
    defaultUtilityDistrictId: "none",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 400],
    insideHoustonCityLimits: false,
  },
  {
    id: "unincorporated-mud",
    name: "Unincorporated Fort Bend ISD, in a utility district",
    description:
      "Sienna, Riverstone, Aliana, Harvest Green and most new-construction master-planned communities.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      ESD_TYPICAL,
    ],
    defaultUtilityDistrictId: "mud-155",
    usdaPlausible: false,
    typicalHoaAnnual: [900, 2_000],
    insideHoustonCityLimits: false,
    note: "No city tax, but the utility district almost always costs more than a city would have. Pick the specific district, or enter its rate by hand after looking it up.",
  },
  {
    id: "unincorporated-no-mud",
    name: "Unincorporated Fort Bend ISD, no utility district",
    description:
      "Older unincorporated pockets on well and septic, or where district bonds are retired.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      ESD_TYPICAL,
    ],
    defaultUtilityDistrictId: "none",
    usdaPlausible: true,
    typicalHoaAnnual: [0, 600],
    insideHoustonCityLimits: false,
    note: "The cheapest tax profile available in the district, and the most likely to sit inside a USDA-eligible area.",
  },
  {
    id: "richmond-fbisd",
    name: "Richmond mailing address, in Fort Bend ISD",
    description:
      "Aliana, Long Meadow Farms and the eastern edge of Pecan Grove. All unincorporated, despite the Richmond address.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      ESD_TYPICAL,
    ],
    defaultUtilityDistrictId: "mud-155",
    usdaPlausible: false,
    typicalHoaAnnual: [900, 1_800],
    insideHoustonCityLimits: false,
    note: "Richmond is the address in this county you should trust the least. Most of it is Lamar CISD, not Fort Bend ISD, and the boundary runs through neighborhoods rather than along roads.",
    districtRisk: {
      alternateName: "Lamar CISD, inside Richmond city limits",
      alternateUnits: [
        LAMAR_CISD,
        FORT_BEND_COUNTY_GENERAL,
        FORT_BEND_COUNTY_DRAINAGE,
        CITY_RICHMOND,
      ],
      explanation:
        "Richmond is the Fort Bend County seat, and the historic city and its older neighborhoods feed Lamar CISD. The Fort Bend ISD parts are the newer master-planned communities outside the city limits. Guess wrong and you pick up both a higher school rate and a city rate you had not counted on.",
    },
  },
  {
    id: "rosharon-fbisd",
    name: "Rosharon mailing address, in Fort Bend ISD",
    description:
      "The FM 521 corridor at the far south end of the district: Caldwell Ranch, Glendale Lakes and the southern Sienna edge.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      ESD_ROSHARON,
    ],
    defaultUtilityDistrictId: "fbmud-141",
    usdaPlausible: true,
    typicalHoaAnnual: [600, 1_200],
    insideHoustonCityLimits: false,
    note: "The one corner of Fort Bend ISD where zero-down USDA financing is realistically in play, which can outweigh the punishing utility district rates out here. Confirm two things: that the parcel is in Fort Bend County rather than Brazoria, since only the Fort Bend side is Fort Bend ISD, and which utility district it sits in, because the two common ones differ by 34 cents per $100.",
  },
  {
    id: "houston-in-fbisd",
    name: "City of Houston, inside Fort Bend ISD",
    description:
      "Fort Bend ISD addresses that fall inside Houston city limits, mostly along the northeast edge of the district.",
    baseUnits: [
      FORT_BEND_ISD,
      FORT_BEND_COUNTY_GENERAL,
      FORT_BEND_COUNTY_DRAINAGE,
      {
        id: "city-houston",
        name: "City of Houston",
        kind: "city",
        ratePer100: 0.51919,
        homesteadPercentExemption: 0.2,
        taxYear: 2025,
        sourceUrl: "https://www.houstontx.gov/finance/",
        note: "Houston grants a 20% homestead exemption. Verify the exact adopted rate for your address, since Houston is billed by Harris County in some areas.",
      },
      HCC_MISSOURI_CITY,
    ],
    defaultUtilityDistrictId: "none",
    usdaPlausible: false,
    typicalHoaAnnual: [0, 900],
    insideHoustonCityLimits: true,
    note: "Worth checking carefully: being inside Houston city limits opens the City of Houston down payment assistance program, which is by far the largest award available in the region.",
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
  utilityDistrictId: string,
  manualUtilityRatePer100: number | null,
): TaxingUnit[] {
  const units = [...baseUnits];

  if (manualUtilityRatePer100 != null && manualUtilityRatePer100 > 0) {
    units.push({
      id: "manual-utility",
      name: "Utility district (entered manually)",
      kind: "mud",
      ratePer100: manualUtilityRatePer100,
      taxYear: 2025,
      note: "Rate you entered from the appraisal district record for this address.",
    });
    return units;
  }

  const district = findUtilityDistrict(utilityDistrictId);
  if (district.ratePer100 > 0) units.push(district);

  return units;
}

export function resolveTaxingUnits(
  locationId: string,
  utilityDistrictId: string,
  manualUtilityRatePer100: number | null,
): TaxingUnit[] {
  return withUtilityDistrict(
    findLocationPreset(locationId).baseUnits,
    utilityDistrictId,
    manualUtilityRatePer100,
  );
}

/**
 * The same property priced as if it fell on the other side of a school district
 * boundary. Returns null for locations where the district is not in doubt. The
 * utility district carries over untouched, since it follows the parcel rather
 * than the school or city boundary.
 */
export function resolveAlternateDistrictUnits(
  locationId: string,
  utilityDistrictId: string,
  manualUtilityRatePer100: number | null,
): TaxingUnit[] | null {
  const risk = findLocationPreset(locationId).districtRisk;
  if (!risk) return null;

  return withUtilityDistrict(
    risk.alternateUnits,
    utilityDistrictId,
    manualUtilityRatePer100,
  );
}
