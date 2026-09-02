/**
 * Builds src/data/harrisTaxUnitCodes.ts from the Harris County Tax Office
 * Truth-in-Taxation table.
 *
 * Harris publishes every jurisdiction's adopted rate keyed by the same numeric
 * code HCAD records on a parcel, which is what makes the join possible at all.
 * The table is server-rendered in one page with five years per unit, so this
 * needs no pagination and no per-unit fetches.
 *
 * Galveston needs no equivalent script: it publishes its whole county — codes,
 * rates and exemptions together — in one PDF, so that side is hand-maintained
 * in src/data/galvestonTaxUnitCodes.ts.
 *
 * Homestead exemptions are NOT on that table. They come from
 * src/data/generated/harrisFootprint.json, which is derived from HCAD's annual
 * PDATA drop by scripts/buildCcisdFootprint.mjs. The RES (residential
 * homestead) row there is the appraisal district's own exemption rule per
 * jurisdiction, which is a better source than any published summary.
 *
 * Only jurisdictions that actually bill a Clear Creek ISD parcel are emitted,
 * plus the neighbouring school districts kept for boundary-risk pricing. Any
 * code the calculator meets that is not in here falls through to
 * `rateUnknown`, which surfaces in the UI instead of billing as zero.
 *
 * Re-run each October once units adopt:
 *   npm run build:harris-units
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FOOTPRINT = path.join(ROOT, "src", "data", "generated", "harrisFootprint.json");
const OUT = path.join(ROOT, "src", "data", "harrisTaxUnitCodes.ts");
const PORTAL = "https://www.hctax.net/Property/JurisdictionTaxRates";

/** Clear Creek ISD's Harris County jurisdiction code. */
const CCISD_CODE = "027";

/**
 * Tax increment reinvestment zones. A TIRZ redirects a share of the city's
 * existing levy into the zone; it does not add a line to the homeowner's bill.
 * Harris names them explicitly, so they can be excluded on the strength of the
 * name rather than inferred. Billing them as an extra unit would roughly
 * double-count the city tax.
 */
const ZONE_RE = /TIRZ|RE-?INV(EST)?(MENT)? ZONE|REINVESTMENT ZONE/i;

function kindFor(name) {
  const n = name.toUpperCase();
  if (ZONE_RE.test(n)) return "zone";
  if (/\bISD\b|\bCISD\b|SCHOOL DIST/.test(n)) return "school";
  if (/FLOOD CNTRL|FLOOD CONTROL/.test(n)) return "drainage";
  if (/HOSP DIST|HOSPITAL/.test(n)) return "hospital";
  if (/EDUC DEPT|DEPARTMENT OF EDUCATION/.test(n)) return "education";
  if (/PORT OF/.test(n)) return "port";
  if (/^HARRIS COUNTY$|^HARRIS CO\b/.test(n) && !/MUD|WCID|ESD|EMERG|RID/.test(n)) {
    return "county";
  }
  if (/COLLEGE/.test(n)) return "college";
  if (/EMERG SRV|\bESD\b/.test(n)) return "esd";
  if (/\bMUD\b|\bUD\b|FRESH WATER|\bFWSD\b/.test(n)) return "mud";
  if (/WCID|WATER AUTH|\bWA\b|\bLID\b|\bID\b|IMPROVEMENT DIST/.test(n)) return "lid";
  if (/\bRID\b|ROAD IMP/.test(n)) return "drainage";
  if (/CITY OF|^CITY\b|, CITY OF|VILLAGE/.test(n)) return "city";
  if (/MGMT DIST|MANAGEMENT DIST/.test(n)) return "other";
  return "other";
}

function titleCase(raw) {
  return raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    // Harris writes cities as "WEBSTER, CITY OF". Read it back the way a
    // person would say it, so the bill's line items are legible.
    .replace(/^(.*),\s*City Of$/i, "City of $1")
    .replace(/\bHc\b/g, "HC")
    .replace(/\bGc\b/g, "GC")
    .replace(/\bOf\b/g, "of")
    .replace(/\bIsd\b/g, "ISD")
    .replace(/\bCisd\b/g, "CISD")
    .replace(/\bMud\b/g, "MUD")
    .replace(/\bUd\b/g, "UD")
    .replace(/\bWcid\b/g, "WCID")
    .replace(/\bEsd\b/g, "ESD")
    .replace(/\bWa\b/g, "Water Authority")
    .replace(/\bRid\b/g, "RID")
    .replace(/\bTirz\b/g, "TIRZ")
    .replace(/\bCo\b/g, "County")
    .replace(/\bCnfrl\b|\bCntrl\b/g, "Control")
    .replace(/\bHosp\b/g, "Hospital")
    .replace(/\bDist\b/g, "District")
    .replace(/\bEduc\b/g, "Education")
    .replace(/\bDept\b/g, "Department")
    .replace(/\bSrv\b/g, "Service")
    .replace(/\bEmerg\b/g, "Emergency")
    .replace(/\bAuthy\b/g, "Authority")
    .replace(/\bCom\b/g, "Community")
    .replace(/\bCol\b/g, "College")
    .replace(/\bJr\b/g, "Junior")
    .replace(/\bMgmt\b/g, "Management");
}

function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

async function fetchText(url, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "ccisd-mortgage-calculator/0.1" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rows are one per (jurisdiction, tax year). Columns, in order:
 * code, _, _, entity, year, adopted, m&o, debt, no-new-revenue, nnr-m&o,
 * voter-approval, assessor, phone, worksheet link.
 */
function parsePortal(html) {
  const byCode = new Map();
  for (const [, tr] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      decode(m[1].replace(/<[^>]+>/g, "")),
    );
    if (cells.length < 11) continue;
    const [code, , , name, year] = cells;
    if (!/^[0-9A-Z]{3}$/.test(code) || !/^\d{4}$/.test(year)) continue;

    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const entry = byCode.get(code) ?? { code, name, years: new Map() };
    entry.years.set(Number(year), {
      adopted: num(cells[5]),
      mo: num(cells[6]),
      debt: num(cells[7]),
    });
    // The newest row carries the current legal name.
    if (Number(year) >= Math.max(...entry.years.keys())) entry.name = name;
    byCode.set(code, entry);
  }
  return byCode;
}

function latestAdopted(entry) {
  for (const year of [...entry.years.keys()].sort((a, b) => b - a)) {
    const row = entry.years.get(year);
    if (row.adopted > 0) return { year, ...row };
  }
  return null;
}

function serialize(record) {
  const lines = [
    `    code: ${JSON.stringify(record.code)},`,
    `    name: ${JSON.stringify(record.name)},`,
    `    kind: ${JSON.stringify(record.kind)},`,
    `    ratePer100: ${record.ratePer100 == null ? "null" : record.ratePer100},`,
    `    taxYear: ${record.taxYear},`,
  ];
  if (record.maintenanceRate != null) {
    lines.push(`    maintenanceRate: ${record.maintenanceRate},`);
  }
  if (record.debtRate != null) lines.push(`    debtRate: ${record.debtRate},`);
  if (record.homesteadFlatExemption) {
    lines.push(`    homesteadFlatExemption: ${record.homesteadFlatExemption},`);
  }
  if (record.homesteadPercentExemption) {
    lines.push(
      `    homesteadPercentExemption: ${record.homesteadPercentExemption},`,
    );
  }
  if (record.footprintShare != null) {
    lines.push(`    footprintShare: ${record.footprintShare},`);
  }
  if (record.nonLevying) lines.push("    nonLevying: true,");
  if (record.rateUnknown) lines.push("    rateUnknown: true,");
  if (record.note) lines.push(`    note: ${JSON.stringify(record.note)},`);
  return `  ${JSON.stringify(record.code)}: {\n${lines.join("\n")}\n  }`;
}

async function main() {
  const footprint = JSON.parse(fs.readFileSync(FOOTPRINT, "utf8"));
  const wanted = Object.keys(footprint.codes).sort();
  console.log(
    `Footprint: ${wanted.length} jurisdictions over ${footprint.accountsInFootprint.toLocaleString()} accounts.`,
  );

  console.log("Fetching the Harris County Truth-in-Taxation table...");
  const html = await fetchText(PORTAL);
  const portal = parsePortal(html);
  console.log(`Parsed ${portal.size} jurisdictions from the portal.`);

  const records = {};
  let known = 0;
  let unknown = 0;
  let zones = 0;

  for (const code of wanted) {
    const fp = footprint.codes[code];
    const entry = portal.get(code);
    const rawName = entry?.name ?? fp.name ?? code;
    const name = titleCase(rawName);
    const kind = kindFor(rawName);
    const latest = entry ? latestAdopted(entry) : null;

    if (kind === "zone") {
      zones += 1;
      records[code] = {
        code,
        name,
        kind,
        ratePer100: 0,
        taxYear: latest?.year ?? footprint.taxYearFallback ?? 2025,
        footprintShare: fp.share || undefined,
        nonLevying: true,
        note: "A tax increment reinvestment zone. It redirects part of the city's existing levy into the zone rather than adding a line to your bill, so it is recorded at zero here.",
      };
      continue;
    }

    if (!latest) {
      unknown += 1;
      records[code] = {
        code,
        name: name === code ? `Taxing unit ${code}` : name,
        kind,
        ratePer100: null,
        taxYear: 2025,
        homesteadFlatExemption: fp.homesteadFlat || undefined,
        homesteadPercentExemption: fp.homesteadPct || undefined,
        footprintShare: fp.share || undefined,
        rateUnknown: true,
        note: "No adopted rate on the county table. This unit is usually billed by a private collector. Enter the rate from the appraisal record rather than treating it as zero.",
      };
      continue;
    }

    known += 1;
    records[code] = {
      code,
      name,
      kind,
      ratePer100: latest.adopted,
      taxYear: latest.year,
      maintenanceRate: latest.mo || undefined,
      debtRate: latest.debt || undefined,
      homesteadFlatExemption: fp.homesteadFlat || undefined,
      homesteadPercentExemption: fp.homesteadPct || undefined,
      footprintShare: fp.share || undefined,
    };
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  const body = `/**
 * Harris County taxing-unit codes that bill a Clear Creek ISD parcel.
 *
 * Generated by scripts/buildHarrisTaxUnits.mjs on ${generatedAt}.
 *
 * Rates: the latest non-zero adopted year on the Harris County Tax Office
 * Truth-in-Taxation table (${PORTAL}).
 * Texas units adopt by September 30, so 2025 is the billing set for a 2026
 * purchase until the 2026 rates land.
 *
 * Homestead exemptions: the RES row of HCAD's own per-jurisdiction exemption
 * table, via src/data/generated/harrisFootprint.json.
 * Vintage: ${footprint.vintage}.
 *
 * \`footprintShare\` is the fraction of the ${footprint.accountsInFootprint.toLocaleString()} Harris parcels inside
 * Clear Creek ISD that this unit bills. A share of 1 is an always-on unit; a
 * small share is a subdivision-specific district.
 */
import type { TaxUnitCodeRecord } from "@/lib/propertyTax";

/** Clear Creek ISD, as Harris County codes it. Galveston codes it \`S16\`. */
export const CLEAR_CREEK_ISD_HARRIS_CODE = ${JSON.stringify(CCISD_CODE)};

/** Harris parcels inside Clear Creek ISD at the vintage above. */
export const HARRIS_FOOTPRINT_PARCELS = ${footprint.accountsInFootprint};

export const HARRIS_TAX_UNIT_CODES: Record<string, TaxUnitCodeRecord> = {
${Object.keys(records)
  .sort()
  .map((code) => serialize(records[code]))
  .join(",\n")}
};
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log(`Wrote ${OUT}`);
  console.log(
    `Rates found: ${known}. Reinvestment zones (zero-levy): ${zones}. Missing/private: ${unknown}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
