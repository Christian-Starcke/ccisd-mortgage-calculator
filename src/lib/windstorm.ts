import { roundCents } from "./money";
import type { County } from "./propertyTax";

/**
 * Coastal wind exposure: the payment line an inland calculator has no reason
 * to model and a Clear Creek ISD calculator cannot leave out.
 *
 * Along the Texas coast a standard homeowners policy does not cover wind and
 * hail. Inside the catastrophe area designated by the Texas Department of
 * Insurance, that peril is carved out and written separately, by the Texas
 * Windstorm Insurance Association or a private carrier, and a lender requires
 * it. So the buyer holds two policies where an inland buyer holds one, and the
 * escrowed payment carries both.
 *
 * What makes this the most important number in the district is that the line
 * runs straight through it. Clear Creek ISD spans two counties, and only the
 * Galveston side is in the designated area:
 *
 *   Galveston County  first tier, entirely designated. Every Galveston parcel
 *                     in the district needs separate windstorm coverage. That
 *                     is League City, Kemah, Clear Lake Shores, and the
 *                     Bacliff and San Leon corridor: about 44% of the district.
 *
 *   Harris County     second tier, and designated only where a property is
 *                     BOTH east of State Highway 146 AND inside the city
 *                     limits of La Porte, Morgan's Point, Pasadena, Seabrook
 *                     or Shoreacres. Of the cities in this district only
 *                     Seabrook and Pasadena can satisfy that, and only partly.
 *                     Webster, Nassau Bay, El Lago, Taylor Lake Village,
 *                     Friendswood and Clear Lake City are all outside it.
 *
 * Two houses zoned to the same schools, one in League City and one in Webster,
 * therefore differ by roughly $200 a month in insurance alone. Nothing else in
 * this calculator produces a gap that large from an address change.
 *
 * Sources:
 *   https://www.twia.org/coverage-eligibility/
 *   https://www.tdi.texas.gov/wind/generalquestio.html
 *   https://www.twia.org/rates/
 */

export type WindExposure =
  /** Designated catastrophe area. Windstorm is a separate, required policy. */
  | "designated"
  /**
   * Inside a city that can qualify, but eligibility turns on which side of
   * Highway 146 the address falls. Not a guess the calculator should make.
   */
  | "boundary-uncertain"
  /**
   * Outside the designated area. Wind stays on the homeowners policy, but a
   * named-storm deductible still applies this close to the bay.
   */
  | "inland";

/** Harris cities that can contain designated property, east of Highway 146. */
const HARRIS_BOUNDARY_CITY_CODES = new Set([
  "076", // Seabrook
  "074", // Pasadena
]);

/**
 * TWIA's average residential premium was about $2,541 as of June 30, 2026, and
 * Galveston County averages roughly $2,300 to $2,400. On the dwelling coverage
 * a $400,000 League City home carries, that is about $7.70 per $1,000.
 *
 * https://www.twia.org/rates/
 */
export const DEFAULT_WINDSTORM_RATE_PER_THOUSAND = 7.7;

/**
 * Homeowners rates per $1,000 of dwelling coverage, by exposure.
 *
 * The designated figure is deliberately lower than the inland one. Inside the
 * catastrophe area the homeowners policy excludes wind and hail, so it is a
 * narrower policy covering less; pricing it at the all-perils rate and then
 * adding windstorm on top would count the same peril twice and overstate the
 * payment by around $80 a month.
 *
 * The inland figure is still above the $9.50 that suits an inland Houston
 * suburb, because a policy fifteen miles from Galveston Bay carries hurricane
 * exposure and a percentage named-storm deductible even where TWIA does not
 * reach.
 *
 * Both are mid-range estimates. The spread between carriers on this coast is
 * wider than almost anywhere in the country, so these are a starting point for
 * a quote, not a substitute for one.
 */
export const HOMEOWNERS_RATE_PER_THOUSAND: Record<WindExposure, number> = {
  designated: 7.0,
  "boundary-uncertain": 8.5,
  inland: 10.5,
};

export interface WindstormAssessment {
  exposure: WindExposure;
  /** True when a separate windstorm policy should be assumed and escrowed. */
  separatePolicyRequired: boolean;
  /** True when the buyer has to confirm eligibility for their exact address. */
  verifyByAddress: boolean;
  homeownersRatePerThousand: number;
  windstormRatePerThousand: number;
  note: string;
}

/**
 * Works out wind exposure from the parcel's county and taxing units.
 *
 * Deliberately does not try to decide which side of Highway 146 a Seabrook or
 * Pasadena address sits on. The centroid is available and a longitude cutoff
 * would look precise, but the designation follows the highway right-of-way and
 * the city limit together, and inventing a threshold would produce confident
 * wrong answers on the handful of parcels where it matters. Those come back as
 * `boundary-uncertain` and the UI asks.
 */
export function assessWindExposure(args: {
  county: County;
  taxUnitCodes: string[];
}): WindstormAssessment {
  const { county, taxUnitCodes } = args;
  const codes = new Set(taxUnitCodes.map((c) => c.trim().toUpperCase()));

  if (county === "galveston") return assessExposure("designated");

  const inBoundaryCity = [...codes].some((c) =>
    HARRIS_BOUNDARY_CITY_CODES.has(c),
  );
  return assessExposure(inBoundaryCity ? "boundary-uncertain" : "inland");
}

const EXPOSURE_NOTES: Record<WindExposure, string> = {
  designated:
    "Galveston County is entirely inside the designated catastrophe area, so wind and hail are excluded from the homeowners policy and written separately. Both premiums are in the payment below. Budget for two policies plus flood.",
  "boundary-uncertain":
    "This address is in a Harris County city that is partly inside the designated catastrophe area. Eligibility applies only east of State Highway 146, so it turns on the exact address rather than the city. A separate windstorm policy is assumed here, which is the conservative reading; confirm with the Texas Department of Insurance, because if the address falls west of 146 this premium comes off the payment entirely.",
  inland:
    "Outside the designated catastrophe area, so wind and hail stay on the homeowners policy and no separate windstorm premium applies. The policy will still carry a percentage named-storm deductible, typically 1% to 2% of dwelling coverage, which is a deductible rather than a monthly cost and so does not appear in the payment.",
};

/**
 * Everything that follows from an exposure, in one place.
 *
 * Whether a separate policy is needed, whether the buyer has to check their own
 * address, and both rates are all functions of the exposure alone, so they are
 * derived here rather than passed in at each call site. They used to be, and
 * the copies drifted.
 */
export function assessExposure(exposure: WindExposure): WindstormAssessment {
  const separatePolicyRequired = exposure !== "inland";
  return {
    exposure,
    separatePolicyRequired,
    verifyByAddress: exposure === "boundary-uncertain",
    homeownersRatePerThousand: HOMEOWNERS_RATE_PER_THOUSAND[exposure],
    windstormRatePerThousand: separatePolicyRequired
      ? DEFAULT_WINDSTORM_RATE_PER_THOUSAND
      : 0,
    note: EXPOSURE_NOTES[exposure],
  };
}

/**
 * Annual windstorm premium, written against dwelling coverage rather than
 * purchase price, exactly as the homeowners premium is.
 */
export function estimateWindstormPremium(args: {
  purchasePrice: number;
  dwellingCoverageFraction: number;
  ratePerThousand: number;
}): number {
  const { purchasePrice, dwellingCoverageFraction, ratePerThousand } = args;
  if (ratePerThousand <= 0) return 0;
  return roundCents(
    ((purchasePrice * dwellingCoverageFraction) / 1_000) * ratePerThousand,
  );
}
