/**
 * Galveston County taxing-unit codes that bill a Clear Creek ISD parcel.
 *
 * Hand-maintained rather than generated, because Galveston publishes the whole
 * county on one page: a single PDF carrying code, entity, M&O, I&S, total rate
 * and the homestead exemption rules together. Harris needs a generator only
 * because its table is 617 units over five years of HTML.
 *
 * Source (rates AND exemptions, both columns of the same table):
 * https://galvestoncad.org/wp-content/uploads/2025/11/2025_Galveston_Tax_Rates.pdf
 *
 * Re-verify against that PDF after September 30, when units adopt. Rates are
 * per $100 of taxable value; 2025 is the billing set for a 2026 purchase.
 *
 * `Opt %` in the PDF maps to `homesteadPercentExemption` and `HS` to
 * `homesteadFlatExemption`. The PDF's `W/Min` column is the $5,000 floor that
 * Texas Tax Code 11.13(n) puts under any percentage exemption; the engine
 * applies that floor itself, so it is not repeated here.
 *
 * `footprintShare` is the fraction of the 39,405 Galveston parcels inside Clear
 * Creek ISD that this unit bills, measured from the GCAD parcel drop.
 */
import type { TaxUnitCodeRecord } from "@/lib/propertyTax";

const SOURCE =
  "https://galvestoncad.org/wp-content/uploads/2025/11/2025_Galveston_Tax_Rates.pdf";

/** Clear Creek ISD, as Galveston County codes it. Harris codes it `027`. */
export const CLEAR_CREEK_ISD_GALVESTON_CODE = "S16";

/** Galveston parcels inside Clear Creek ISD at the 2026 GCAD drop. */
export const GALVESTON_FOOTPRINT_PARCELS = 39_405;

export const GALVESTON_RATES_SOURCE_URL = SOURCE;

/**
 * Codes GCAD records on a parcel but never publishes a rate for. They are
 * absent from the rate table entirely rather than listed with a blank rate,
 * which is how the district writes overlays that levy nothing of their own:
 * `T` for tax increment reinvestment zones and `P`, `I` and `E` for the
 * assessment and improvement zones that bill outside the ad valorem roll.
 *
 * Harris names its equivalents in full ("TIRZ 1 CITY OF FRIENDSWOOD"), so that
 * county's are classified from the name. Galveston's are bare codes, so the
 * prefix is the only signal and this inference is explicitly unverified: the
 * UI says so and tells the buyer to check the appraisal record when one of
 * these is on their parcel.
 */
export const GALVESTON_NON_RATE_PREFIXES = ["T", "P", "I", "E"];

export const GALVESTON_TAX_UNIT_CODES: Record<string, TaxUnitCodeRecord> = {
  // ---------------------------------------------------------------------
  // Countywide. On every Galveston parcel in the district.
  // ---------------------------------------------------------------------
  GGA: {
    code: "GGA",
    name: "Galveston County",
    kind: "county",
    ratePer100: 0.32266,
    maintenanceRate: 0.27366,
    debtRate: 0.049,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 1,
    note: "Grants a 20% homestead exemption, the largest percentage exemption on a Galveston County bill.",
  },
  RFL: {
    code: "RFL",
    name: "Galveston County Road & Flood",
    kind: "drainage",
    ratePer100: 0.003,
    maintenanceRate: 0.003,
    taxYear: 2025,
    homesteadFlatExemption: 3_000,
    homesteadPercentExemption: 0.2,
    footprintShare: 1,
    note: "Three tenths of a cent per $100. A rounding error on the bill, but it is a real unit and it is billed.",
  },

  // ---------------------------------------------------------------------
  // School districts
  // ---------------------------------------------------------------------
  S16: {
    code: "S16",
    name: "Clear Creek ISD",
    kind: "school",
    ratePer100: 0.969,
    maintenanceRate: 0.699,
    debtRate: 0.27,
    taxYear: 2025,
    homesteadFlatExemption: 140_000,
    homesteadPercentExemption: 0.05,
    footprintShare: 1,
    note: "A $0.699 maintenance and operations rate plus a $0.270 debt service rate, held flat for 2025-26. The exemption is the $140,000 state homestead exemption from Texas Proposition 13 (November 2025) stacked with the district's own 5% local option, which is floored at $5,000. Harris County codes the same district `027` and publishes identical figures.",
  },
  /**
   * The next three are not part of any Clear Creek scenario. They are here
   * because League City, Friendswood and the Bacliff corridor all straddle a
   * school district line, and a buyer who assumes the wrong district has
   * mispriced the largest single line on the bill. Used only to quantify that.
   */
  S11: {
    code: "S11",
    name: "Dickinson ISD",
    kind: "school",
    ratePer100: 1.142,
    maintenanceRate: 0.722,
    debtRate: 0.42,
    taxYear: 2025,
    homesteadFlatExemption: 140_000,
    footprintShare: 0.00102,
    note: "About 17 cents per $100 more than Clear Creek ISD, and it grants no local option exemption on top of the state $140,000. South and west League City addresses are the ones at risk of being Dickinson rather than Clear Creek.",
  },
  S12: {
    code: "S12",
    name: "Friendswood ISD",
    kind: "school",
    ratePer100: 1.03,
    maintenanceRate: 0.7869,
    debtRate: 0.2431,
    taxYear: 2025,
    homesteadFlatExemption: 140_000,
    footprintShare: 0.00015,
    note: "Six cents per $100 more than Clear Creek ISD, with no local option exemption. A Friendswood mailing address settles nothing: the city is split between the two districts.",
  },
  S17: {
    code: "S17",
    name: "Santa Fe ISD",
    kind: "school",
    ratePer100: 1.1014,
    maintenanceRate: 0.7522,
    debtRate: 0.3492,
    taxYear: 2025,
    homesteadFlatExemption: 140_000,
    footprintShare: 0.00023,
  },

  // ---------------------------------------------------------------------
  // Cities
  // ---------------------------------------------------------------------
  C40: {
    code: "C40",
    name: "City of League City",
    kind: "city",
    ratePer100: 0.36355,
    maintenanceRate: 0.30355,
    debtRate: 0.06,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.89902,
    note: "Nearly nine in ten Galveston-side parcels in the district are in League City. A low city rate paired with a 20% homestead exemption. Harris County bills the small slice of the city north of the county line at the same rate under code `067`.",
  },
  C38: {
    code: "C38",
    name: "City of Kemah",
    kind: "city",
    ratePer100: 0.1999,
    maintenanceRate: 0.1999,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.04619,
    note: "No debt service rate at all, and a 20% homestead exemption. One of the cheapest city taxes in the district.",
  },
  C46: {
    code: "C46",
    name: "City of Clear Lake Shores",
    kind: "city",
    ratePer100: 0,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.03281,
    note: "Levies no city property tax at all: the adopted rate is zero. The city funds itself without an ad valorem levy, so a Clear Lake Shores address pays school, county and utility district tax only.",
  },
  C37: {
    code: "C37",
    name: "City of Friendswood",
    kind: "city",
    ratePer100: 0.514172,
    maintenanceRate: 0.399749,
    debtRate: 0.114423,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.00119,
    note: "Harris County bills the larger, northern part of the city at this same rate under code `058`.",
  },
  C31: {
    code: "C31",
    name: "City of Texas City",
    kind: "city",
    ratePer100: 0.478433,
    maintenanceRate: 0.399737,
    debtRate: 0.078696,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.00117,
  },

  // ---------------------------------------------------------------------
  // College and drainage
  // ---------------------------------------------------------------------
  J05: {
    code: "J05",
    name: "College of the Mainland",
    kind: "college",
    ratePer100: 0.2638,
    maintenanceRate: 0.1394,
    debtRate: 0.1244,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.00568,
    note: "Only about one in every 175 Galveston-side parcels in the district is in the college's taxing boundary. Most of League City is not, which is why a community college line is missing from most bills here.",
  },
  D08: {
    code: "D08",
    name: "Galveston County Consolidated Drainage District",
    kind: "drainage",
    ratePer100: 0.11555,
    maintenanceRate: 0.11555,
    taxYear: 2025,
    homesteadPercentExemption: 0.1,
    footprintShare: 0.03332,
  },

  // ---------------------------------------------------------------------
  // Utility districts. The biggest swing between two otherwise similar homes.
  // ---------------------------------------------------------------------
  W03: {
    code: "W03",
    name: "Galveston County WCID No. 12",
    kind: "lid",
    ratePer100: 0.1812,
    debtRate: 0.1812,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.07647,
    note: "The most common utility district on the Galveston side, and an unusually cheap one.",
  },
  M08: {
    code: "M08",
    name: "Galveston County MUD No. 6",
    kind: "mud",
    ratePer100: 0.06,
    maintenanceRate: 0.04,
    debtRate: 0.02,
    taxYear: 2025,
    footprintShare: 0.06755,
  },
  M45: {
    code: "M45",
    name: "Galveston County MUD No. 45",
    kind: "mud",
    ratePer100: 0.71,
    maintenanceRate: 0.12,
    debtRate: 0.59,
    taxYear: 2025,
    homesteadPercentExemption: 0.2,
    footprintShare: 0.04025,
  },
  M39: {
    code: "M39",
    name: "Galveston County MUD No. 39",
    kind: "mud",
    ratePer100: 0.36,
    maintenanceRate: 0.05,
    debtRate: 0.31,
    taxYear: 2025,
    footprintShare: 0.03738,
  },
  M46: {
    code: "M46",
    name: "Galveston County MUD No. 46",
    kind: "mud",
    ratePer100: 0.545,
    maintenanceRate: 0.035,
    debtRate: 0.51,
    taxYear: 2025,
    footprintShare: 0.0367,
  },
  M27: {
    code: "M27",
    name: "South Shore Harbour MUD No. 7",
    kind: "mud",
    ratePer100: 0.42,
    maintenanceRate: 0.04,
    debtRate: 0.38,
    taxYear: 2025,
    footprintShare: 0.03218,
  },
  M19: {
    code: "M19",
    name: "Westwood Management District",
    kind: "other",
    ratePer100: 0.92,
    maintenanceRate: 0.56,
    debtRate: 0.36,
    taxYear: 2025,
    footprintShare: 0.03122,
    note: "Grants no homestead exemption and levies 92 cents per $100, so it costs more than the county and the city put together.",
  },
  M43: {
    code: "M43",
    name: "Galveston County MUD No. 43",
    kind: "mud",
    ratePer100: 0.45,
    maintenanceRate: 0.06,
    debtRate: 0.39,
    taxYear: 2025,
    footprintShare: 0.02484,
  },
  M36: {
    code: "M36",
    name: "Galveston County MUD No. 36",
    kind: "mud",
    ratePer100: 1.15,
    maintenanceRate: 0.45,
    debtRate: 0.7,
    taxYear: 2025,
    footprintShare: 0.01914,
    note: "At $1.15 per $100 this is the most expensive unit in the district and more than the school tax. Heavy debt service on new development. Two otherwise identical houses, one here and one in WCID No. 12, differ by nearly a full percent of value every year.",
  },
  M82: {
    code: "M82",
    name: "Galveston County MUD No. 82",
    kind: "mud",
    ratePer100: 1.15,
    maintenanceRate: 1.15,
    taxYear: 2025,
    footprintShare: 0.01477,
    note: "All maintenance and no debt service, which is unusual, and expensive at $1.15 per $100.",
  },
  M23: {
    code: "M23",
    name: "Kemah Management District No. 1",
    kind: "other",
    ratePer100: 1,
    maintenanceRate: 0.675,
    debtRate: 0.325,
    taxYear: 2025,
    footprintShare: 0.01459,
  },
  M05: {
    code: "M05",
    name: "Bayview MUD",
    kind: "mud",
    ratePer100: 0.3806,
    maintenanceRate: 0.131,
    debtRate: 0.2496,
    taxYear: 2025,
    footprintShare: 0.01772,
  },
  M73: {
    code: "M73",
    name: "Galveston County MUD No. 73",
    kind: "mud",
    ratePer100: 1.1,
    maintenanceRate: 0.3,
    debtRate: 0.8,
    taxYear: 2025,
    footprintShare: 0.0054,
  },
  M22: {
    code: "M22",
    name: "Bay Colony West MUD",
    kind: "mud",
    ratePer100: 0.86,
    maintenanceRate: 0.15,
    debtRate: 0.71,
    taxYear: 2025,
    footprintShare: 0.00208,
  },
  M21: {
    code: "M21",
    name: "Galveston County Management District No. 1",
    kind: "other",
    ratePer100: 0.95,
    maintenanceRate: 0.62,
    debtRate: 0.33,
    taxYear: 2025,
    footprintShare: 0.00061,
  },
  M04: {
    code: "M04",
    name: "Bacliff MUD",
    kind: "mud",
    ratePer100: 0.28,
    debtRate: 0.28,
    taxYear: 2025,
    footprintShare: 0.0002,
  },
};
