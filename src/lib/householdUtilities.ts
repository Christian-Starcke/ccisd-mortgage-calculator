import { roundCents } from "./money";
import type { TaxingUnit } from "./propertyTax";
import type { WaterService } from "./waterService";

/**
 * What it costs to run the house, as opposed to what it costs to buy it.
 *
 * These figures are deliberately kept OUT of the mortgage payment and every
 * number derived from it. A lender does not count electricity in your
 * debt-to-income ratio, does not escrow your internet bill, and does not care
 * what your gas heat costs; folding any of it into `monthly.total` would
 * corrupt the DTI test, the affordability solver, the cash-to-close escrow
 * maths and the loan comparison all at once. So this is a separate estimate
 * that sits beside the payment and is added to it only for the buyer's own
 * budgeting.
 *
 * Two honest limits on the whole exercise:
 *
 *   Usage dominates. A household's own habits move these numbers more than any
 *   address does. Two identical houses next door to each other can differ by
 *   $150 a month on electricity alone.
 *
 *   August is not the average. A Houston electricity bill runs about $104 in
 *   March and $219 in August. An annual average is the right number for a
 *   budget and the wrong number for the first summer, which is exactly when
 *   new owners get caught out — so the peak is reported alongside it.
 *
 * Only water, sewer and refuse genuinely vary by address here, and those are
 * driven by who supplies them: a city, or a utility district. Electricity is a
 * deregulated retail choice that is the same market across the whole district
 * and scales with the size of the house rather than its location.
 */

export type UtilityConfidence =
  /** Read off the provider's own current published rate schedule. */
  | "sourced"
  /** A defensible regional figure; this provider's own schedule was not read. */
  | "estimated"
  /** Depends on the house or the household and has to be supplied. */
  | "ask";

export interface UtilityEstimate {
  id: string;
  label: string;
  monthly: number;
  /** How the figure was arrived at, shown in the UI. */
  basis: string;
  confidence: UtilityConfidence;
  /** Seasonal spread, where it is large enough to matter. */
  seasonal?: { low: number; high: number; note: string };
  sourceUrl?: string;
}

export interface HouseholdUtilities {
  service: WaterService;
  /** The city or district that supplies water, when it is known. */
  providerName: string | null;
  items: UtilityEstimate[];
  monthlyTotal: number;
  /** The same basket in the most expensive month of the year. */
  peakMonthlyTotal: number;
  /** Things a buyer still has to add themselves. */
  notIncluded: string[];
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

/**
 * Houston-area residential rate. The market is deregulated, so this is a
 * shopping decision rather than an attribute of the address: plans ran roughly
 * 12 to 19 cents in 2026 and the area averaged about 14.35.
 *
 * https://www.energysage.com/local-data/electricity-cost/tx/harris-county/houston/
 */
export const DEFAULT_ELECTRICITY_RATE_PER_KWH = 0.15;

/**
 * Monthly kWh per square foot, calibrated so a 2,000 sq ft house lands at the
 * ~1,150 kWh the average Houston residence uses. Air conditioning is the bulk
 * of it, which is why floor area is the useful predictor and why the summer
 * multiplier below is so large.
 */
const KWH_PER_SQFT_MONTH = 0.575;

/** August against the annual mean, from the ~$104 March / ~$219 August spread. */
const SUMMER_PEAK_MULTIPLIER = 1.33;
const WINTER_TROUGH_MULTIPLIER = 0.63;

export const DEFAULT_LIVING_SQFT = 2_000;

// ---------------------------------------------------------------------------
// Water, sewer and refuse, by who supplies them
// ---------------------------------------------------------------------------

interface WaterProviderRate {
  name: string;
  /** Water plus sewer at roughly 5,000 gallons a month, the usual benchmark. */
  waterAndSewer: number;
  /** Refuse collection, where it is billed separately from city taxes. */
  refuse: number;
  confidence: UtilityConfidence;
  note: string;
  sourceUrl?: string;
}

/**
 * Keyed by the taxing-unit code of the city, so the provider follows the same
 * resolution as the tax bill rather than being guessed from the address.
 * League City appears twice because the city straddles the county line and
 * each appraisal district codes it separately.
 */
const CITY_WATER_RATES: Record<string, WaterProviderRate> = {
  C40: {
    name: "City of League City",
    waterAndSewer: 68.76,
    refuse: 21.69,
    confidence: "sourced",
    note: "About $31.66 of water at 5,000 gallons plus $37.10 of wastewater, and refuse at $21.69 including fees and tax under the city's AmeriWaste contract. The city adopted staged increases running through 2029, so this rises annually.",
    sourceUrl: "https://www.leaguecitytx.gov/3371/Current-Residential-Utility-Rates",
  },
  "067": {
    name: "City of League City",
    waterAndSewer: 68.76,
    refuse: 21.69,
    confidence: "sourced",
    note: "The Harris County slice of League City is billed by the same city utility as the Galveston side.",
    sourceUrl: "https://www.leaguecitytx.gov/3371/Current-Residential-Utility-Rates",
  },
  "061": {
    name: "City of Houston",
    waterAndSewer: 95,
    refuse: 0,
    confidence: "sourced",
    note: "Water and wastewater at about 5,000 gallons on a 5/8 or 3/4 inch meter, on the rates effective April 2026. Houston funds single-family refuse collection out of general revenue rather than a separate line, so there is no bin charge. Rates have risen every April under a five-year plan.",
    sourceUrl: "https://www.houstonwaterbills.houstontx.gov/ProdDP/CalculateConsumptionrate/CalculateConsumptionrate",
  },
  "084": {
    name: "City of Webster",
    // Water $10.71 minimum covering the first 2,000 gallons plus $4.82 per
    // thousand after, wastewater $16.13 plus $7.17, and the $1.24 drainage
    // utility fee that applies to every house in the city.
    waterAndSewer: 64.05,
    refuse: 22,
    confidence: "sourced",
    note: "Water and wastewater at 5,000 gallons on the city's rate ordinance, plus the $1.24 monthly drainage utility fee every house in the city pays. The wastewater volumetric charge is capped at your winter average, so a household that irrigates heavily in summer pays less sewer than this suggests. Refuse is not in the rate ordinance and is a regional estimate.",
    sourceUrl: "https://www.webstertx.gov/484/Utilities",
  },
  "076": {
    name: "City of Seabrook",
    // Water $21.60 minimum to 2,000 gallons plus $7.56 per thousand; sewer
    // $25.00 plus $6.53. Houston's water and sewer is dearer on its own, but
    // Seabrook adds $32 of refuse where Houston charges none, so this is the
    // most expensive city utility bill in the district overall.
    waterAndSewer: 88.87,
    refuse: 32.06,
    confidence: "sourced",
    note: "Water and wastewater at 5,000 gallons on the city's published schedule, plus refuse at $32.06, the Waste Management rate effective October 2025. Adding up to the dearest city utility bill in the district — Houston's water is dearer on its own, but Houston charges no refuse.",
    sourceUrl: "http://www.seabrooktx.gov/441/Water-Sewer-and-Garbage-Rates",
  },
  "058": {
    name: "City of Friendswood",
    // Water $26.95 including the first 3,000 gallons, then $3.70 per thousand;
    // sewer $32.00 including 2,000, then $4.90. So $34.35 + $46.70. Both
    // minimums are high and both carry an allowance, which makes this the city
    // where low usage is punished least.
    waterAndSewer: 81.05,
    // $23.10 plus 8.25% sales tax, to Waste Connections.
    refuse: 25.01,
    confidence: "sourced",
    note: "Water is $26.95 for the first 3,000 gallons then $3.70 per thousand; sewer is $32.00 for the first 2,000 then $4.90. Refuse is $23.10 plus sales tax to Waste Connections, covering rubbish twice weekly plus recycling and green waste. Outside the city limits every charge is 1.5 times these figures.",
    sourceUrl: "https://www.ci.friendswood.tx.us/246/Utility-Billing",
  },
  "074": {
    name: "City of Pasadena",
    // FY 2026: water $14.04 to 2,000 gallons then $3.92 per thousand; sewer
    // $14.03 then $3.91, billed on 90% of metered water. Garbage $33.95, the
    // dearest refuse charge in the district.
    waterAndSewer: 49.61,
    refuse: 33.95,
    confidence: "sourced",
    note: "The city's FY 2026 schedule, effective October 2025 after a 1.2% CPI adjustment. Water and sewer come to about $49.61 at 5,000 gallons, the cheapest city water in the district, but garbage at $33.95 is the dearest, so the total lands mid-range. Sewer is billed on 90% of metered water rather than the full amount.",
    sourceUrl: "https://www.pasadenatx.gov/687/Current-Water-Wastewater-Sewer-Garbage-R",
  },
  "073": {
    name: "City of Nassau Bay",
    // Water $15.00 base plus $3.99 per thousand from the first gallon; sewer
    // $16.98 base plus $2.95. Neither base includes any usage.
    waterAndSewer: 66.68,
    refuse: 22,
    confidence: "sourced",
    note: "The rates council re-approved on 12 November 2025. Unusually, neither the water nor the sewer base fee includes any gallons: volumetric charging starts at the first thousand, which makes low-usage households pay relatively more here than elsewhere. The residential refuse rate is not published alongside them and is a regional estimate.",
    sourceUrl: "https://www.nassaubay.com/93/Taxes-Fees",
  },
  C37: {
    name: "City of Friendswood",
    waterAndSewer: 81.05,
    refuse: 25.01,
    confidence: "sourced",
    note: "The Galveston County part of Friendswood is billed by the same city utility as the Harris County part.",
    sourceUrl: "https://www.ci.friendswood.tx.us/246/Utility-Billing",
  },
};

/**
 * Cities in this district whose own utility supplies no water.
 *
 * Worth stating because it is counter-intuitive and it is most of them. Kemah
 * has no city water at all — Galveston County WCID 12 serves most of it and
 * Bayview MUD the rest. Clear Lake Shores is entirely inside WCID 12. El Lago
 * is 96% inside Harris County WCID 50, and Taylor Lake Village 90% inside the
 * Clear Lake City Water Authority.
 *
 * They never reach the city rate table above, because a parcel carrying any of
 * those districts resolves as district-served — which is the correct answer and
 * also why their city schedules were never worth chasing.
 */
export const CITIES_WITHOUT_CITY_WATER = [
  "C38", // Kemah
  "C46", // Clear Lake Shores
  "056", // El Lago
  "082", // Taylor Lake Village
] as const;

/**
 * Utility districts whose own rate schedule has been read.
 *
 * Worth having because the biggest one is also the cheapest, which is not what
 * a buyer expects. The Clear Lake City Water Authority bills single-family
 * customers *bimonthly*, and its usage rates are low precisely because it
 * funds debt service through a $0.25 per $100 property tax instead. A CLCWA
 * household pays through the tax line in the payment above rather than through
 * the water bill here, so comparing water bills alone across a district
 * boundary misleads in both directions.
 */
const DISTRICT_WATER_RATES: Record<string, WaterProviderRate> = {
  "142": {
    name: "Clear Lake City Water Authority",
    // Policy R&S-90 rev. 19, effective 8 August 2024. Single-family billing is
    // BIMONTHLY: 10,000 gallons over two months, the equivalent of 5,000 a
    // month, is $55.10 a bill, so $27.55 a month.
    waterAndSewer: 27.55,
    // CLCWA does not collect refuse. It follows the city, which the caller
    // resolves, so this is only the fallback for an address in no city.
    refuse: 28,
    confidence: "sourced",
    note: "Policy R&S-90, effective August 2024. Single-family customers are billed every two months: 10,000 gallons a bill, the equivalent of 5,000 a month, is $55.10 or about $27.55 monthly. That is the cheapest water in the district by a wide margin, because the authority raises its debt service through the $0.25 per $100 property tax already counted in the payment above rather than through usage rates. It does not collect refuse.",
    sourceUrl: "https://www.clcwa.org/rate-breakdown",
  },
};

/**
 * Used for the cities whose own rate schedule has not been read. It is the
 * middle of the range the sourced providers above actually charge, which makes
 * it a reasonable placeholder and a poor substitute for the real schedule —
 * hence the `estimated` marker the UI surfaces.
 */
const REGIONAL_CITY_ESTIMATE = {
  waterAndSewer: 85,
  refuse: 22,
  note: "This city's own rate schedule has not been read. The figure is the middle of what the neighbouring cities in this district charge, so treat it as a placeholder and check the city's utility page before relying on it.",
} as const;

/**
 * A utility district supplies water instead of a city. Districts set their own
 * rates and publish them individually, and the spread is wide. Refuse is
 * usually a private hauler the district contracts with, or one the owner
 * arranges directly.
 */
const DISTRICT_ESTIMATE = {
  waterAndSewer: 95,
  refuse: 28,
  note: "Utility districts each publish their own rate schedule and they vary widely. Refuse is normally a private hauler rather than a city service. Find your district's own schedule — it is the least standardised bill in this calculator.",
} as const;

function cityUnitOf(units: TaxingUnit[]): TaxingUnit | undefined {
  return units.find((unit) => unit.kind === "city");
}

/**
 * The monthly water and sewer bill to escrow for a parcel in a utility
 * district, using the district's own published schedule where it has been read.
 *
 * This feeds the payment, not just this estimate, which is why it lives here
 * next to the rates rather than being a constant in defaults.ts. It matters:
 * the generic district placeholder is $95 a month, and the Clear Lake City
 * Water Authority — the district serving more parcels here than any other —
 * actually bills about $27.55. Using the placeholder on those parcels
 * overstated the payment by roughly $67 a month.
 *
 * Returns null when no district applies, so the caller can zero the line
 * rather than being handed a number to ignore.
 */
export function districtWaterBillFor(
  districts: TaxingUnit[],
): { monthly: number; sourced: boolean; providerName: string } | null {
  if (districts.length === 0) return null;
  for (const unit of districts) {
    const rate = unit.code ? DISTRICT_WATER_RATES[unit.code] : undefined;
    if (rate) {
      return {
        monthly: rate.waterAndSewer,
        sourced: true,
        providerName: rate.name,
      };
    }
  }
  return {
    monthly: DISTRICT_ESTIMATE.waterAndSewer,
    sourced: false,
    providerName: districts[0].name,
  };
}

// ---------------------------------------------------------------------------
// The rest
// ---------------------------------------------------------------------------

/**
 * Natural gas, where the house has it, from CenterPoint's filed tariff.
 *
 * CenterPoint Energy (Entex) is the gas distribution utility for this whole
 * area, and residential service is Rate Schedule R-2099-GRIP 2026. The bill is
 * three parts, and modelling it as one flat number gets the shape wrong:
 *
 *   a fixed customer charge, paid every month whatever you burn;
 *   a commodity charge per Ccf, which is CenterPoint's delivery margin;
 *   the Purchased Gas Adjustment, a per-Ccf pass-through of what the gas
 *   itself cost, reset periodically.
 *
 * The fixed charge is why gas does not fall away in summer the way a
 * percentage-of-average estimate implies. At the RRC's Houston residential
 * average of 34 Ccf a month the bill is around $49; in July, on the ~8 Ccf a
 * water heater and range use, it is about $30 — and $24.83 of that is the
 * standing charge. Scaling the whole bill by a summer factor understated July
 * by more than half.
 *
 * The customer charge is identical for incorporated and unincorporated areas
 * in the Houston rate area, so nothing here depends on whether the address is
 * inside a city.
 */

/** Fixed monthly charge, Houston and Texas Coast rate areas. Sourced. */
export const CENTERPOINT_CUSTOMER_CHARGE = 24.83;

/**
 * Commodity charge per Ccf, Houston rate area at the 14.65 pressure base.
 * Sourced. The other pressure bases differ by well under a cent.
 */
export const CENTERPOINT_COMMODITY_PER_CCF = 0.15834;

/**
 * Purchased Gas Adjustment per Ccf. This is the cost of the gas itself, passed
 * straight through and refiled periodically as the market moves, so it is the
 * one part of the bill that cannot be pinned to a tariff sheet. Estimated in
 * the middle of where it has recently sat; it is exposed as an input because a
 * cold winter moves it more than anything else here.
 */
export const DEFAULT_PGA_PER_CCF = 0.55;

/**
 * Average monthly usage. The Railroad Commission of Texas puts Houston
 * residential consumption at about 3.4 Mcf, or 34 Ccf, a month, having ranged
 * 23 to 43 Ccf over the preceding fifteen years.
 */
export const DEFAULT_GAS_CCF_PER_MONTH = 34;

/**
 * Seasonal factors on *usage*, not on the bill. Space heating is the bulk of
 * residential gas here, and water heating alone is 18-20% of annual use, which
 * is what sets the summer floor.
 */
const GAS_WINTER_USAGE_FACTOR = 2.05;
const GAS_SUMMER_USAGE_FACTOR = 0.22;

/** The tariff, applied. Fixed charge plus usage, never a flat guess. */
export function centerPointGasBill(args: {
  ccf: number;
  pgaPerCcf: number;
}): number {
  const { ccf, pgaPerCcf } = args;
  const perCcf = CENTERPOINT_COMMODITY_PER_CCF + Math.max(0, pgaPerCcf);
  return roundCents(
    CENTERPOINT_CUSTOMER_CHARGE + perCcf * Math.max(0, ccf),
  );
}

/** Internet. Availability varies by address; price barely does. */
export const DEFAULT_INTERNET_MONTHLY = 70;

export function estimateHouseholdUtilities(args: {
  service: WaterService;
  taxingUnits: TaxingUnit[];
  /** Districts billing the parcel, from the water service assessment. */
  districts: TaxingUnit[];
  livingSqFt: number;
  electricityRatePerKwh: number;
  hasNaturalGas: boolean;
  /** Average monthly usage in Ccf; the tariff is applied to it. */
  gasCcfPerMonth: number;
  /** Purchased Gas Adjustment per Ccf, the pass-through cost of the gas. */
  gasPgaPerCcf: number;
  monthlyInternet: number;
  /**
   * Water and sewer already counted inside the mortgage payment as the utility
   * district's separate bill. Subtracted here so the two views do not both
   * charge for it.
   */
  districtWaterAlreadyInPayment: number;
}): HouseholdUtilities {
  const {
    service,
    taxingUnits,
    districts,
    livingSqFt,
    electricityRatePerKwh,
    hasNaturalGas,
    gasCcfPerMonth,
    gasPgaPerCcf,
    monthlyInternet,
    districtWaterAlreadyInPayment,
  } = args;

  const items: UtilityEstimate[] = [];

  // --- Electricity -------------------------------------------------------
  const sqft = Math.max(livingSqFt, 400);
  const kwh = sqft * KWH_PER_SQFT_MONTH;
  const electricity = roundCents(kwh * electricityRatePerKwh);
  items.push({
    id: "electricity",
    label: "Electricity",
    monthly: electricity,
    basis: `About ${Math.round(kwh).toLocaleString()} kWh a month for ${sqft.toLocaleString()} sq ft, at ${(electricityRatePerKwh * 100).toFixed(1)}¢. Texas is deregulated, so the rate is yours to shop and does not depend on the address.`,
    confidence: "sourced",
    seasonal: {
      low: roundCents(electricity * WINTER_TROUGH_MULTIPLIER),
      high: roundCents(electricity * SUMMER_PEAK_MULTIPLIER),
      note: "Air conditioning drives the summer. Budget on the annual figure but expect August to run about a third above it.",
    },
    sourceUrl:
      "https://www.energysage.com/local-data/electricity-cost/tx/harris-county/houston/",
  });

  // --- Water, sewer and refuse ------------------------------------------
  let providerName: string | null = null;

  if (service === "district") {
    const districtRate = districts
      .map((unit) => (unit.code ? DISTRICT_WATER_RATES[unit.code] : undefined))
      .find(Boolean);
    providerName =
      districtRate?.name ?? districts[0]?.name ?? "Utility district";

    const typical =
      districtRate?.waterAndSewer ?? DISTRICT_ESTIMATE.waterAndSewer;
    const basisNote = districtRate?.note ?? DISTRICT_ESTIMATE.note;

    /*
     * The district's water bill is already a line in the mortgage payment, so
     * only the shortfall is added here. With CLCWA that shortfall is normally
     * nothing, because its real bill is well under the generic district figure
     * the payment carries, which is itself worth knowing.
     */
    const extra = Math.max(0, typical - districtWaterAlreadyInPayment);
    if (extra > 0) {
      items.push({
        id: "water-sewer",
        label:
          districtWaterAlreadyInPayment > 0
            ? "Water and sewer, beyond what the payment already counts"
            : "Water and sewer",
        monthly: roundCents(extra),
        basis:
          districtWaterAlreadyInPayment > 0
            ? `The payment above already carries ${formatMoneyish(districtWaterAlreadyInPayment)} of district water, against about ${formatMoneyish(typical)} for this district. ${basisNote}`
            : basisNote,
        confidence: districtRate?.confidence ?? "estimated",
        sourceUrl: districtRate?.sourceUrl,
      });
    }

    /*
     * Refuse follows the city, not the district. A utility district supplies
     * water and sewer; rubbish is collected by whichever city the parcel sits
     * in, or by a private hauler where there is none. Charging the district
     * estimate inside Houston would invent a bin fee the city funds from
     * general revenue.
     */
    const city = cityUnitOf(taxingUnits);
    const cityRate = city?.code ? CITY_WATER_RATES[city.code] : undefined;
    if (cityRate) {
      if (cityRate.refuse > 0) {
        items.push({
          id: "refuse",
          label: "Refuse collection",
          monthly: cityRate.refuse,
          basis: `Collected by ${cityRate.name}, not by the utility district: a district supplies water and sewer only.`,
          confidence: cityRate.confidence,
          sourceUrl: cityRate.sourceUrl,
        });
      }
    } else {
      items.push({
        id: "refuse",
        label: "Refuse collection",
        monthly: DISTRICT_ESTIMATE.refuse,
        basis: city
          ? `${city.name} does not publish a refuse rate here, so this is a private-hauler estimate. A utility district supplies water and sewer only.`
          : DISTRICT_ESTIMATE.note,
        confidence: "estimated",
      });
    }
  } else {
    const city = cityUnitOf(taxingUnits);
    const rate = city?.code ? CITY_WATER_RATES[city.code] : undefined;

    if (rate) {
      providerName = rate.name;
      items.push({
        id: "water-sewer",
        label: "Water and sewer",
        monthly: rate.waterAndSewer,
        basis: rate.note,
        confidence: rate.confidence,
        sourceUrl: rate.sourceUrl,
      });
      if (rate.refuse > 0) {
        items.push({
          id: "refuse",
          label: "Refuse collection",
          monthly: rate.refuse,
          basis: "Billed by the city on the same utility account as water.",
          confidence: rate.confidence,
          sourceUrl: rate.sourceUrl,
        });
      }
    } else if (city) {
      providerName = city.name;
      items.push({
        id: "water-sewer",
        label: "Water and sewer",
        monthly: REGIONAL_CITY_ESTIMATE.waterAndSewer,
        basis: REGIONAL_CITY_ESTIMATE.note,
        confidence: "estimated",
      });
      items.push({
        id: "refuse",
        label: "Refuse collection",
        monthly: REGIONAL_CITY_ESTIMATE.refuse,
        basis: REGIONAL_CITY_ESTIMATE.note,
        confidence: "estimated",
      });
    } else {
      // No city and no district: unincorporated with a private well, a private
      // water supply corporation, or simply not resolved yet.
      items.push({
        id: "water-sewer",
        label: "Water and sewer",
        monthly: REGIONAL_CITY_ESTIMATE.waterAndSewer,
        basis: "No city or utility district resolved for this address, so nothing here is specific to it. Pick the parcel above, or find the supplier on the appraisal record.",
        confidence: "ask",
      });
    }
  }

  // --- Gas and internet --------------------------------------------------
  if (hasNaturalGas) {
    const gasMonthly = centerPointGasBill({
      ccf: gasCcfPerMonth,
      pgaPerCcf: gasPgaPerCcf,
    });
    /*
     * The seasonal factors apply to usage, so the fixed customer charge stays
     * put. That is the whole point: in July the bill is mostly the standing
     * charge and barely falls, which a percentage of the annual figure gets
     * badly wrong.
     */
    items.push({
      id: "gas",
      label: "Natural gas",
      monthly: gasMonthly,
      basis: `CenterPoint's residential tariff applied to ${Math.round(gasCcfPerMonth)} Ccf a month: a fixed $${CENTERPOINT_CUSTOMER_CHARGE.toFixed(2)} customer charge plus ${Math.round((CENTERPOINT_COMMODITY_PER_CCF + gasPgaPerCcf) * 100)}¢ per Ccf, of which ${Math.round(gasPgaPerCcf * 100)}¢ is the pass-through cost of the gas itself. Many homes in this district are all-electric and pay none of it — check which this one is.`,
      confidence: "sourced",
      seasonal: {
        low: centerPointGasBill({
          ccf: gasCcfPerMonth * GAS_SUMMER_USAGE_FACTOR,
          pgaPerCcf: gasPgaPerCcf,
        }),
        high: centerPointGasBill({
          ccf: gasCcfPerMonth * GAS_WINTER_USAGE_FACTOR,
          pgaPerCcf: gasPgaPerCcf,
        }),
        note: `Space heating is nearly all of the swing. The summer figure is a water heater and a range, and it does not fall further because $${CENTERPOINT_CUSTOMER_CHARGE.toFixed(2)} of it is the standing charge you pay whatever you burn.`,
      },
      sourceUrl:
        "https://www.centerpointenergy.com/en-us/our-services/rates-tariffs/texas",
    });
  }

  items.push({
    id: "internet",
    label: "Internet",
    monthly: roundCents(monthlyInternet),
    basis: "Which providers reach the address varies; what they charge barely does. Set it to your own plan.",
    confidence: "ask",
  });

  const monthlyTotal = roundCents(
    items.reduce((sum, item) => sum + item.monthly, 0),
  );
  const peakMonthlyTotal = roundCents(
    items.reduce(
      (sum, item) => sum + (item.seasonal?.high ?? item.monthly),
      0,
    ),
  );

  return {
    service,
    providerName,
    items,
    monthlyTotal,
    peakMonthlyTotal,
    notIncluded: [
      "Lawn care, pest control and pool service, which are common here and easily $100 a month between them",
      "Any HOA amenity billed separately from the dues in the payment above",
      "Maintenance, which on a house this age averages 1% to 2% of value a year",
    ],
  };
}

/** Rounded dollars for prose, without pulling the formatter into this module. */
function formatMoneyish(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}
