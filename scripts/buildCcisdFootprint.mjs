/**
 * Builds src/data/generated/harrisFootprint.json from HCAD's annual bulk drop.
 *
 * Two things come out of it, and neither is available any other way:
 *
 *   which jurisdictions bill a Clear Creek ISD parcel, and how many parcels
 *   each one reaches. HCAD's live parcel service carries no taxing-unit list,
 *   so the only source for the account-to-jurisdiction mapping is the bulk
 *   file. The per-unit share is what tells an always-on countywide unit from a
 *   subdivision-specific MUD, and it orders the utility district picker.
 *
 *   the residential homestead exemption each of those jurisdictions grants.
 *   The RES row of HCAD's own exemption table is the appraisal district's
 *   rule, which beats any published summary — and Harris does not publish one
 *   in a machine-readable form at all.
 *
 * Input, unzipped into ./data-drop first:
 *   jur_value.txt
 *   jur_tax_dist_exempt_value_rate.txt
 * both from https://download.hcad.org/data/CAMA/<year>/Real_jur_exempt.zip
 *
 * Run this after HCAD certifies (mid-August), then run buildHarrisTaxUnits to
 * pick up the newly adopted rates:
 *   node scripts/buildCcisdFootprint.mjs
 *   npm run build:harris-units
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DROP = path.join(ROOT, "data-drop");
const JUR_VALUE = path.join(DROP, "jur_value.txt");
const JUR_EXEMPT = path.join(DROP, "jur_tax_dist_exempt_value_rate.txt");
const OUT = path.join(ROOT, "src", "data", "generated", "harrisFootprint.json");

/** Clear Creek ISD's Harris County jurisdiction code. */
const CCISD = "027";

/**
 * Neighbouring school districts, kept even though they bill few or no parcels
 * in the footprint. They are what the "your address may not be in Clear Creek
 * ISD" comparison prices against, and a Pasadena or Friendswood address is the
 * most commonly mistaken one in the district.
 */
const NEIGHBOUR_ISDS = ["021", "002", "029", "020", "001"];

const VINTAGE = process.env.HARRIS_VINTAGE ?? "HCAD PDATA 2026 certified";

async function* lines(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "latin1" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) yield line;
}

function requireFile(file) {
  if (fs.existsSync(file)) return;
  console.error(
    `Missing ${path.relative(ROOT, file)}.\n` +
      "Download Real_jur_exempt.zip from download.hcad.org and unzip it into data-drop/.\n" +
      "See the README section on refreshing the data.",
  );
  process.exit(1);
}

/** RES (residential homestead) exemption rule per jurisdiction. */
async function readExemptions() {
  const out = new Map();
  let header = true;
  for await (const line of lines(JUR_EXEMPT)) {
    if (header) {
      header = false;
      continue;
    }
    // RP_TYPE, tax_dist, name, exempt_cd, prop, curr, exempt_val, exempt_rate
    const c = line.split("\t");
    if (c.length < 8 || c[0] !== "Real" || c[3] !== "RES") continue;
    out.set(c[1].trim(), {
      name: c[2].trim(),
      flat: Math.round(Number(c[6]) || 0),
      pct: Number(c[7]) || 0,
    });
  }
  return out;
}

/**
 * Which jurisdictions bill a Clear Creek parcel, and how many each reaches.
 * Two streaming passes: the first finds the accounts, the second counts the
 * districts on them. One pass would mean holding every account's district list
 * in memory across 40-odd million rows.
 */
async function readFootprint() {
  const accounts = new Set();
  let header = true;
  for await (const line of lines(JUR_VALUE)) {
    if (header) {
      header = false;
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const second = line.indexOf("\t", tab + 1);
    const district = line.slice(tab + 1, second < 0 ? undefined : second).trim();
    if (district === CCISD) accounts.add(line.slice(0, tab));
  }
  console.log(`  ${accounts.size.toLocaleString()} accounts billed by ${CCISD}.`);

  const freq = new Map();
  const seenPerAccount = new Map();
  header = true;
  for await (const line of lines(JUR_VALUE)) {
    if (header) {
      header = false;
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const acct = line.slice(0, tab);
    if (!accounts.has(acct)) continue;
    const second = line.indexOf("\t", tab + 1);
    const district = line.slice(tab + 1, second < 0 ? undefined : second).trim();
    // A district can appear twice on one account when the parcel is split, so
    // count accounts rather than rows.
    let seen = seenPerAccount.get(acct);
    if (!seen) seenPerAccount.set(acct, (seen = new Set()));
    if (seen.has(district)) continue;
    seen.add(district);
    freq.set(district, (freq.get(district) ?? 0) + 1);
  }

  return { total: accounts.size, freq };
}

async function main() {
  requireFile(JUR_VALUE);
  requireFile(JUR_EXEMPT);

  console.log("Reading HCAD exemption rules...");
  const exemptions = await readExemptions();
  console.log(`  ${exemptions.size.toLocaleString()} jurisdictions with a RES rule.`);

  console.log("Finding the Clear Creek ISD footprint...");
  const { total, freq } = await readFootprint();

  const codes = {};
  for (const code of [...new Set([...freq.keys(), ...NEIGHBOUR_ISDS])].sort()) {
    const e = exemptions.get(code);
    const accounts = freq.get(code) ?? 0;
    codes[code] = {
      name: e?.name ?? "",
      accounts,
      share: Number((accounts / total).toFixed(5)),
      homesteadFlat: e?.flat ?? 0,
      homesteadPct: e?.pct ?? 0,
    };
  }

  const payload = {
    vintage: VINTAGE,
    ccisdCode: CCISD,
    accountsInFootprint: total,
    codes,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(ROOT, OUT)}: ${Object.keys(codes).length} jurisdictions over ${total.toLocaleString()} accounts.`,
  );
  console.log("Now run: npm run build:harris-units");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
