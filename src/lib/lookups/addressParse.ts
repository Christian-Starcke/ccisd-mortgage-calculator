const STOPWORDS = new Set([
  "TX",
  "TEXAS",
  "USA",
  "US",
  "THE",
  "OF",
  "AND",
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
  "ST",
  "STREET",
  "AVE",
  "AVENUE",
  "DR",
  "DRIVE",
  "LN",
  "LANE",
  "RD",
  "ROAD",
  "CT",
  "COURT",
  "CIR",
  "CIRCLE",
  "BLVD",
  "BOULEVARD",
  "PKWY",
  "PARKWAY",
  "WAY",
  "PL",
  "PLACE",
  "TRL",
  "TRAIL",
  "HWY",
  "HIGHWAY",
  "FM",
  "CR",
  "APT",
  "UNIT",
  "STE",
  "SUITE",
]);

/**
 * Cities in and around Clear Creek ISD. Dropped from the search because
 * neither district stores a city the way a listing writes one: HCAD's
 * `site_city` is the postal city, so a Nassau Bay address reads "HOUSTON", and
 * GCAD's `CITY` column is the owner's mailing city, which disagrees with the
 * property on roughly a third of records. Matching on either loses real
 * parcels, so the street alone does the work.
 */
/**
 * City names are stripped as a trailing phrase, not filtered token by token.
 *
 * Dropping city words wherever they appear works in a district whose city
 * names are not also street names. Around Clear Lake it fails badly, because
 * they are, constantly: Clear Lake City Boulevard, El Camino Real, Lake Shore
 * Harbour, Bay Area Boulevard, Nassau Bay Drive, League City Parkway. Removing
 * those tokens wherever they appear would delete the street name itself and
 * turn a precise search into a house-number sweep of two counties.
 *
 * Anchoring to the end of the string is what makes it safe. Ordered longest
 * first so "LEAGUE CITY" is consumed before a bare "CITY" can be.
 */
const TRAILING_CITIES = [
  "TAYLOR LAKE VILLAGE",
  "CLEAR LAKE SHORES",
  "CLEAR LAKE CITY",
  "LEAGUE CITY",
  "NASSAU BAY",
  "EL LAGO",
  "SAN LEON",
  "LA PORTE",
  "SHOREACRES",
  "FRIENDSWOOD",
  "DICKINSON",
  "PASADENA",
  "SEABROOK",
  "PEARLAND",
  "WEBSTER",
  "BACLIFF",
  "HOUSTON",
  "KEMAH",
];

export interface ParsedAddressQuery {
  raw: string;
  houseNumber: string | null;
  streetTokens: string[];
}

/**
 * Splits a typed address into a house number plus street-name tokens.
 *
 * Neither appraisal district can be searched on city, so the city, state and
 * ZIP are stripped and the street carries the query. Street-type words (Dr,
 * Ln, Pkwy) go too, because both districts abbreviate them inconsistently.
 */
export function parseAddressQuery(raw: string): ParsedAddressQuery {
  let cleaned = raw
    .toUpperCase()
    .replace(/[.#,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Trailing ", TX 77573" / "TEXAS 77573-1139" and then the city phrase.
  cleaned = cleaned
    .replace(/\b(TX|TEXAS)\b\s*\d{5}(-\d{4})?\s*$/, " ")
    .replace(/\b\d{5}(-\d{4})?\s*$/, " ")
    .replace(/\b(TX|TEXAS)\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const city of TRAILING_CITIES) {
    const suffix = new RegExp(`\\s${city}\\s*$`);
    if (suffix.test(cleaned)) {
      cleaned = cleaned.replace(suffix, "").trim();
      break;
    }
  }

  const match = cleaned.match(/^(\d+)\s+(.+)$/);
  const houseNumber = match ? match[1] : null;
  const rest = match ? match[2] : cleaned;

  const streetTokens = rest
    .split(" ")
    .map((token) => token.replace(/[^A-Z0-9]/g, ""))
    .filter(
      (token) =>
        token.length >= 2 &&
        !STOPWORDS.has(token) &&
        !/^\d{5}$/.test(token),
    );

  return { raw, houseNumber, streetTokens };
}

