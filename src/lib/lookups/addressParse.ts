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

const CITY_STOPWORDS = new Set([
  "ROSHARON",
  "RICHMOND",
  "HOUSTON",
  "FULSHEAR",
  "ROSENBERG",
  "STAFFORD",
  "ARCOLA",
  "NEEDVILLE",
  "KATY",
  "FRESNO",
  "BEASLEY",
  "MISSOURI",
  "MEADOWS",
  "SUGARLAND",
]);

export interface ParsedAddressQuery {
  raw: string;
  houseNumber: string | null;
  streetTokens: string[];
}

/**
 * Splits a typed address into a house number plus street-name tokens.
 *
 * FBCAD's `situs` concatenates everything into one string and is unreliable on
 * city, so we never search on city. Street-type words (Dr, Ln, Pkwy) are dropped
 * because they vary in the county record.
 */
export function parseAddressQuery(raw: string): ParsedAddressQuery {
  const cleaned = raw
    .toUpperCase()
    .replace(/[.#,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(/^(\d+)\s+(.+)$/);
  const houseNumber = match ? match[1] : null;
  const rest = match ? match[2] : cleaned;

  const streetTokens = rest
    .replace(/\bSUGAR\s+LAND\b/, " ")
    .split(" ")
    .map((token) => token.replace(/[^A-Z0-9]/g, ""))
    .filter(
      (token) =>
        token.length >= 2 &&
        !STOPWORDS.has(token) &&
        !CITY_STOPWORDS.has(token) &&
        !/^\d{5}$/.test(token),
    );

  return { raw, houseNumber, streetTokens };
}

export function buildSitusWhere(parsed: ParsedAddressQuery): string | null {
  // FBCAD's LIKE operator is case-sensitive. Always compare UPPER(situs).
  const clauses: string[] = [];
  if (parsed.houseNumber) {
    clauses.push(`UPPER(situs) LIKE '${escapeSql(parsed.houseNumber)} %'`);
  }
  for (const token of parsed.streetTokens.slice(0, 4)) {
    clauses.push(`UPPER(situs) LIKE '%${escapeSql(token)}%'`);
  }
  if (clauses.length === 0) return null;
  return clauses.join(" AND ");
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
