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
    // Only the sewer schedule was read: $32.00 minimum covering the first
    // 2,000 gallons plus $4.90 per thousand, so $46.70 at 5,000. The water and
    // refuse halves are the regional placeholder, which is why this stays
    // marked as an estimate rather than sourced.
    waterAndSewer: 82,
    refuse: 22,
    confidence: "estimated",
    note: "Friendswood's sewer schedule is published and works out to about $46.70 at 5,000 gallons — a high minimum at $32.00. The water and refuse halves have not been read, so the total here is part sourced and part placeholder. Check the city's utility billing page before relying on it.",
    sourceUrl: "https://www.ci.friendswood.tx.us/246/Utility-Billing",
  },
  C37: {
    name: "City of Friendswood",
    waterAndSewer: 82,
    refuse: 22,
    confidence: "estimated",
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

// ---------------------------------------------------------------------------
// The rest
// ---------------------------------------------------------------------------

/**
 * Natural gas, where the house has it. Many homes in this district are
 * all-electric, so this is a property attribute rather than something the
 * address settles, and it defaults to off.
 *
 * Deliberately marked `estimated`: CenterPoint's residential tariff was not
 * read for this figure, and gas is strongly seasonal because it is heating and
 * hot water rather than cooling.
 */
export const DEFAULT_GAS_MONTHLY = 40;

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
  monthlyGas: number;
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
    monthlyGas,
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
    providerName = districts[0]?.name ?? "Utility district";
    // The district's water bill is already a line in the mortgage payment, so
    // only the shortfall (if any) and the refuse charge are added here.
    const extra = Math.max(
      0,
      DISTRICT_ESTIMATE.waterAndSewer - districtWaterAlreadyInPayment,
    );
    if (extra > 0) {
      items.push({
        id: "water-sewer",
        label: "Water and sewer, beyond what the payment already counts",
        monthly: roundCents(extra),
        basis: `The payment above already carries ${formatMoneyish(districtWaterAlreadyInPayment)} of district water. A typical district bill runs about ${formatMoneyish(DISTRICT_ESTIMATE.waterAndSewer)}. ${DISTRICT_ESTIMATE.note}`,
        confidence: "estimated",
      });
    }
    items.push({
      id: "refuse",
      label: "Refuse collection",
      monthly: DISTRICT_ESTIMATE.refuse,
      basis: DISTRICT_ESTIMATE.note,
      confidence: "estimated",
    });
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
    items.push({
      id: "gas",
      label: "Natural gas",
      monthly: roundCents(monthlyGas),
      basis: "Heating and hot water, so it peaks in winter rather than summer. Many homes in this district are all-electric and pay nothing here — check which this one is.",
      confidence: "estimated",
      seasonal: {
        low: roundCents(monthlyGas * 0.35),
        high: roundCents(monthlyGas * 2.1),
        note: "Almost all of it is winter heating. January can be twice the annual average and July close to nothing.",
      },
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
