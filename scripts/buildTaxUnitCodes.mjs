/**
 * Builds src/data/fortBendTaxUnitCodes.ts from the county rate portal.
 *
 * Codes come from FBCAD parcel `taxunits` (the same codes the live lookup
 * returns). Rates come from taxrateinfo.fortbendcountytx.gov, which is keyed by
 * those codes and publishes five years of adopted rates per unit.
 *
 * Re-run each October when units adopt the next year's rates:
 *   node scripts/buildTaxUnitCodes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "fortBendTaxUnitCodes.ts");
const PORTAL = "https://taxrateinfo.fortbendcountytx.gov/Home/View_TaxUnit";
const FBCAD_QUERY =
  "https://gisweb.fbcad.org/arcgis/rest/services/Hosted/FBCAD_Public_Data/FeatureServer/0/query";
const CODE_RE = /^[A-Z]{1,3}\d+[A-Z]?$|^CAD$/;
const CONCURRENCY = 6;

function kindFor(code) {
  if (code === "CAD") return "other";
  if (code.startsWith("SM")) return "other";
  if (code.startsWith("S")) return "school";
  if (code.startsWith("G")) return "county";
  if (code.startsWith("D")) return "drainage";
  if (code.startsWith("C")) return "city";
  if (code.startsWith("J")) return "college";
  if (code.startsWith("R")) return "esd";
  if (code.startsWith("M")) return "mud";
  if (code.startsWith("W") || code.startsWith("L")) return "lid";
  return "other";
}

function titleCase(name) {
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bIsd\b/g, "ISD")
    .replace(/\bCisd\b/g, "CISD")
    .replace(/\bMsd\b/g, "MSD")
    .replace(/\bMud\b/g, "MUD")
    .replace(/\bLid\b/g, "LID")
    .replace(/\bWcid\b/g, "WCID")
    .replace(/\bEsd\b/g, "ESD")
    .replace(/\bCad\b/g, "CAD")
    .replace(/\bHcc\b/g, "HCC")
    .replace(/\bWcjc\b/g, "WCJC")
    .replace(/\bPid\b/g, "PID")
    .replace(/\bFwsd\b/g, "FWSD")
    .replace(/\bDd\b/g, "DD");
}

const CITY_HOMESTEAD_BY_CODE = {
  C01: 0.2, // Arcola
  C05: 0.2, // Houston
  C08: 0.2, // Meadows Place
  C09: 0.025, // Missouri City
  C15: 0.035, // Richmond
  C21: 0.15, // Sugar Land
};

function exemptionsFor(code, name) {
  const upper = name.toUpperCase();
  const out = {};
  if (code.startsWith("S") && !code.startsWith("SM")) {
    out.homesteadFlatExemption = 140_000;
  }
  if (code === "G01") out.homesteadPercentExemption = 0.2;
  if (code === "J07") out.homesteadPercentExemption = 0.17;
  if (CITY_HOMESTEAD_BY_CODE[code] != null) {
    out.homesteadPercentExemption = CITY_HOMESTEAD_BY_CODE[code];
  }
  if (/SUGAR LAND/.test(upper) && code.startsWith("C")) {
    out.homesteadPercentExemption = 0.15;
  }
  if (/MISSOURI CITY/.test(upper) && code.startsWith("C")) {
    out.homesteadPercentExemption = 0.025;
  }
  if (/MEADOWS PLACE/.test(upper)) out.homesteadPercentExemption = 0.2;
  if (/\bARCOLA\b/.test(upper) && code.startsWith("C")) {
    out.homesteadPercentExemption = 0.2;
  }
  if (/\bRICHMOND\b/.test(upper) && code.startsWith("C")) {
    out.homesteadPercentExemption = 0.035;
  }
  if (/\bHOUSTON\b/.test(upper) && code.startsWith("C")) {
    out.homesteadPercentExemption = 0.2;
  }
  if (/ESD\s*2\b/.test(upper) || /ESD 02/.test(upper)) {
    out.homesteadPercentExemption = 0.2;
  }
  if (/ESD\s*5\b/.test(upper)) out.homesteadPercentExemption = 0.1;
  return out;
}

function decode(html) {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#xD;&#xA;/g, " ")
    .replace(/&#39;/g, "'")
    .trim();
}

function parsePortalHtml(html, code) {
  // The page lists the county tax assessor first (currently Carmen Turner).
  // The taxing unit's own name is in the later "TAXING UNIT CONTACT INFORMATION"
  // table. Using the first Name: cell produced a table of assessor names.
  const unitSection = html.split(/TAXING UNIT CONTACT INFORMATION/i)[1] ?? "";
  const nameMatch =
    unitSection.match(
      /<td><strong>Name:<\/strong><\/td>\s*<td>([^<]+)<\/td>/i,
    ) ??
    [...html.matchAll(/<td><strong>Name:<\/strong><\/td>\s*<td>([^<]+)<\/td>/gi)]
      .map((match) => match[1])
      .find((value) => !/carmen\s+turner|annette\s+ramirez/i.test(value));
  if (!nameMatch) {
    return { code, name: code, ratePer100: null, taxYear: 2025, found: false };
  }
  const rawName = typeof nameMatch === "string" ? nameMatch : nameMatch[1];
  const name = titleCase(decode(rawName));
  const rows = [
    ...html.matchAll(/<tr>\s*<td>(20\d{2})<\/td>\s*<td>([0-9.]+)<\/td>/gi),
  ];
  let rate = null;
  let year = 2025;
  for (const [, y, r] of rows) {
    const n = Number(r);
    if (Number(y) === 2026 && n > 0) {
      rate = n;
      year = 2026;
      break;
    }
  }
  if (rate == null) {
    for (const [, y, r] of rows) {
      const n = Number(r);
      if (Number(y) === 2025 && n > 0) {
        rate = n;
        year = 2025;
        break;
      }
    }
  }
  if (rate == null) {
    for (const [, y, r] of rows) {
      const n = Number(r);
      if (n > 0) {
        rate = n;
        year = Number(y);
        break;
      }
    }
  }
  return { code, name, ratePer100: rate, taxYear: year, found: true };
}

async function fetchText(url, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "fbisd-mortgage-calculator/0.1" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function discoverCodes() {
  const url = new URL(FBCAD_QUERY);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "taxunits");
  url.searchParams.set("returnDistinctValues", "true");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");
  const json = JSON.parse(await fetchText(url));
  const codes = new Set();
  for (const feature of json.features ?? []) {
    for (const raw of String(feature.attributes?.taxunits ?? "").split(",")) {
      const code = raw.trim().toUpperCase();
      if (CODE_RE.test(code)) codes.add(code);
    }
  }
  return [...codes].sort();
}

async function mapPool(items, limit, mapper) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await mapper(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function serializeRecord(record) {
  const lines = [
    `    code: ${JSON.stringify(record.code)},`,
    `    name: ${JSON.stringify(record.name)},`,
    `    kind: ${JSON.stringify(record.kind)},`,
    `    ratePer100: ${record.ratePer100 == null ? "null" : record.ratePer100},`,
    `    taxYear: ${record.taxYear},`,
  ];
  if (record.homesteadFlatExemption) {
    lines.push(`    homesteadFlatExemption: ${record.homesteadFlatExemption},`);
  }
  if (record.homesteadPercentExemption) {
    lines.push(
      `    homesteadPercentExemption: ${record.homesteadPercentExemption},`,
    );
  }
  if (record.rateUnknown) lines.push("    rateUnknown: true,");
  if (record.note) lines.push(`    note: ${JSON.stringify(record.note)},`);
  return `  ${JSON.stringify(record.code)}: {\n${lines.join("\n")}\n  }`;
}

async function main() {
  console.log("Discovering tax unit codes from FBCAD parcels...");
  const codes = await discoverCodes();
  console.log(`Found ${codes.length} codes. Fetching county rate portal...`);

  const parsed = await mapPool(codes, CONCURRENCY, async (code, idx) => {
    process.stdout.write(`\r${idx + 1}/${codes.length} ${code.padEnd(8)}`);
    try {
      const html = await fetchText(`${PORTAL}?VarTaxUnitID=${encodeURIComponent(code)}`);
      return parsePortalHtml(html, code);
    } catch (error) {
      return {
        code,
        name: code,
        ratePer100: null,
        taxYear: 2025,
        found: false,
        error: String(error),
      };
    }
  });
  process.stdout.write("\n");

  const records = {};
  let known = 0;
  let unknown = 0;
  for (const row of parsed) {
    const rateUnknown = !row.found || row.ratePer100 == null;
    if (rateUnknown) unknown += 1;
    else known += 1;
    const exemptions = exemptionsFor(row.code, row.name);
    records[row.code] = {
      code: row.code,
      name: row.found ? row.name : `Taxing unit ${row.code} (rate not on county roll)`,
      kind: kindFor(row.code),
      ratePer100: row.ratePer100,
      taxYear: row.taxYear,
      ...exemptions,
      rateUnknown,
      note: rateUnknown
        ? "This unit is billed by a private collector or is missing from the county rate portal. Enter the rate from the appraisal record rather than treating it as zero."
        : undefined,
    };
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  const body = `/* eslint-disable */
/**
 * Fort Bend County taxing-unit codes as they appear on FBCAD parcel records.
 *
 * Generated by scripts/buildTaxUnitCodes.mjs on ${generatedAt}.
 * Rates are the latest non-zero adopted year from the county Truth-in-Taxation
 * portal (tax year 2025 until 2026 rates are adopted). Homestead exemptions are
 * overlaid from known unit rules, not from the portal.
 *
 * Re-run the generator after September 30 each year.
 */
import type { TaxingUnitKind } from "@/lib/propertyTax";

export const FORT_BEND_ISD_CODE = "S07";

export interface TaxUnitCodeRecord {
  code: string;
  name: string;
  kind: TaxingUnitKind;
  /** Adopted rate per $100 of taxable value, or null when unpublished. */
  ratePer100: number | null;
  taxYear: number;
  homesteadFlatExemption?: number;
  homesteadPercentExemption?: number;
  rateUnknown?: boolean;
  note?: string;
}

export const FORT_BEND_TAX_UNIT_CODES: Record<string, TaxUnitCodeRecord> = {
${Object.keys(records)
    .sort()
    .map((code) => serializeRecord(records[code]))
    .join(",\n")}
};
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log(`Wrote ${OUT}`);
  console.log(`Known rates: ${known}. Missing/private: ${unknown}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
