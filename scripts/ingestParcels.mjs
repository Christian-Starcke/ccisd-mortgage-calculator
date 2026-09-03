/**
 * Loads the Clear Creek ISD parcel footprint into Supabase.
 *
 * Run once a year, after both appraisal districts publish. Neither district
 * offers what Fort Bend did — a live parcel service with the taxing units
 * already on the record — so each side needs its own path:
 *
 *   Harris    HCAD serves parcels live but publishes the account-to-jurisdiction
 *             mapping only in its annual bulk drop. Only the codes are stored;
 *             addresses and values still come from the live service at query
 *             time. An account absent from the table is outside the district.
 *
 *   Galveston GCAD publishes no query service at all. The whole parcel is
 *             stored — situs, values, codes — so this table *is* the lookup,
 *             and every row is stamped with the drop it came from.
 *
 * Inputs, unzipped into ./data-drop first (they are 1GB uncompressed between
 * them, which is why they are not fetched here):
 *
 *   jur_value.txt                 from https://download.hcad.org/data/CAMA/<year>/Real_jur_exempt.zip
 *   parcels.dbf and parcels.shp   from https://galvestoncad.org/wp-content/uploads/<year>/<mm>/parcels.zip
 *
 * Use parcels.zip rather than parcel_data.zip: it holds the same attributes
 * plus the geometry, and without geometry every Galveston address has an
 * unknown flood zone.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/ingestParcels.mjs
 *   ... --harris-only | --galveston-only | --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { shapeCentroids } from "./lib/shapefile.mjs";
import { selfCheck, texasSouthCentralToWgs84 } from "./lib/statePlane.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DROP = path.join(ROOT, "data-drop");
const HARRIS_FILE = path.join(DROP, "jur_value.txt");
// parcels.zip carries the same 26 attribute fields as the data-only download
// plus the geometry, so it is the only Galveston file needed.
const GALVESTON_FILE = path.join(DROP, "parcels.dbf");
const GALVESTON_SHP = path.join(DROP, "parcels.shp");

/** Clear Creek ISD, as each district codes it. */
const CCISD_HARRIS = "027";
const CCISD_GALVESTON = "S16";

const HARRIS_VINTAGE = process.env.HARRIS_VINTAGE ?? "HCAD PDATA 2026 certified";
const GALVESTON_VINTAGE =
  process.env.GALVESTON_VINTAGE ?? "GCAD parcel drop, April 2026";

const BATCH = 1_000;
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

function requireConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!DRY_RUN && (!url || !key)) {
    console.error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_KEY (the service role key: this writes).",
    );
    process.exit(1);
  }
  return { url: url?.replace(/\/$/, ""), key };
}

const cfg = requireConfig();
let written = 0;

async function upsert(rows) {
  if (rows.length === 0) return;
  if (DRY_RUN) {
    written += rows.length;
    return;
  }
  const response = await fetch(`${cfg.url}/rest/v1/parcel`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      "content-type": "application/json",
      // Idempotent: re-running a drop updates rows rather than colliding.
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(
      `Supabase upsert failed: HTTP ${response.status} ${await response.text()}`,
    );
  }
  written += rows.length;
  if (written % 10_000 === 0) console.log(`  ${written.toLocaleString()} rows`);
}

// ---------------------------------------------------------------------------
// Harris: two streaming passes over the bulk jurisdiction file.
// ---------------------------------------------------------------------------

async function* lines(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "latin1" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) yield line;
}

async function ingestHarris() {
  if (!fs.existsSync(HARRIS_FILE)) {
    console.log(`Skipping Harris: ${HARRIS_FILE} not found.`);
    return;
  }
  console.log("Harris pass 1: finding accounts billed by Clear Creek ISD...");

  // Column order is fixed by HCAD: acct, tax_district, tp_cd, pct_district,
  // appraised_val, taxable_val.
  const accounts = new Set();
  let header = true;
  for await (const line of lines(HARRIS_FILE)) {
    if (header) {
      header = false;
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const second = line.indexOf("\t", tab + 1);
    const district = line.slice(tab + 1, second < 0 ? undefined : second).trim();
    if (district === CCISD_HARRIS) accounts.add(line.slice(0, tab));
  }
  console.log(`  ${accounts.size.toLocaleString()} accounts in the footprint.`);

  console.log("Harris pass 2: collecting every district on those accounts...");
  const codes = new Map();
  header = true;
  for await (const line of lines(HARRIS_FILE)) {
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
    const list = codes.get(acct);
    if (list) list.add(district);
    else codes.set(acct, new Set([district]));
  }

  console.log(`Harris: writing ${codes.size.toLocaleString()} rows...`);
  let batch = [];
  for (const [acct, set] of codes) {
    batch.push({
      county: "harris",
      parcel_id: acct,
      entity_codes: [...set].sort(),
      source_vintage: HARRIS_VINTAGE,
    });
    if (batch.length >= BATCH) {
      await upsert(batch);
      batch = [];
    }
  }
  await upsert(batch);
}

// ---------------------------------------------------------------------------
// Galveston: a fixed-width DBF, read straight off the record.
// ---------------------------------------------------------------------------

function openDbf(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(32);
  fs.readSync(fd, head, 0, 32, 0);
  const recordCount = head.readUInt32LE(4);
  const headerLength = head.readUInt16LE(8);
  const recordLength = head.readUInt16LE(10);

  const descriptors = Buffer.alloc(headerLength - 32);
  fs.readSync(fd, descriptors, 0, descriptors.length, 32);

  const layout = new Map();
  let offset = 1; // byte 0 of each record is the deletion flag
  for (let i = 0; i * 32 + 32 <= descriptors.length; i += 1) {
    const d = descriptors.subarray(i * 32, i * 32 + 32);
    if (d[0] === 0x0d) break;
    const name = d.subarray(0, 11).toString("latin1").replace(/\0.*$/, "");
    layout.set(name, { offset, length: d[16] });
    offset += d[16];
  }
  return { fd, recordCount, headerLength, recordLength, layout };
}

function* dbfRecords(file, columns) {
  const { fd, recordCount, headerLength, recordLength, layout } = openDbf(file);
  const missing = columns.filter((c) => !layout.has(c));
  if (missing.length) {
    throw new Error(`DBF is missing expected columns: ${missing.join(", ")}`);
  }
  const buf = Buffer.alloc(recordLength);
  try {
    for (let i = 0; i < recordCount; i += 1) {
      const read = fs.readSync(fd, buf, 0, recordLength, headerLength + i * recordLength);
      if (read < recordLength || buf[0] === 0x2a) continue; // deleted
      const out = {};
      for (const col of columns) {
        const { offset, length } = layout.get(col);
        out[col] = buf.subarray(offset, offset + length).toString("latin1").trim();
      }
      yield out;
    }
  } finally {
    fs.closeSync(fd);
  }
}

function numeric(raw) {
  if (!raw) return null;
  const n = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * GCAD's SITUS is one string: "1234 MAIN ST LEAGUE CITY, TX 77573". The house
 * number is split out so it can be matched exactly, the same way the Harris
 * query matches site_str_num, and the zip is kept for disambiguating.
 *
 * The record's own CITY and ZIP columns are the *owner mailing* address and
 * disagree with the situs on roughly a third of rows, so they are never used.
 */
function splitSitus(situs) {
  const clean = situs.replace(/\s+/g, " ").trim().toUpperCase();
  const number = clean.match(/^(\d+)\b/);
  const zip = clean.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  return {
    situs: clean || null,
    situs_number: number ? number[1] : null,
    situs_zip: zip ? zip[1] : null,
  };
}

async function ingestGalveston() {
  if (!fs.existsSync(GALVESTON_FILE)) {
    console.log(`Skipping Galveston: ${GALVESTON_FILE} not found.`);
    return;
  }
  const columns = [
    "GEOID",
    "SITUS",
    "ENTITIES",
    "EXEMPT",
    "VAL26LAND",
    "VAL26IMP",
    "VAL26TOT",
    "LANDUSE",
  ];

  /*
   * Geometry comes from parcels.shp, whose records are 1:1 with the .dbf in
   * the same order. That ordering is the whole join, so the two are walked in
   * lockstep and a length mismatch is fatal rather than silently misaligning
   * every parcel's flood zone by one row.
   */
  let centroids = null;
  if (fs.existsSync(GALVESTON_SHP)) {
    const check = selfCheck();
    if (!check.ok) {
      throw new Error(
        `State plane reprojection self-check failed (origin came back as ${JSON.stringify(check.origin)}). Refusing to write centroids.`,
      );
    }
    centroids = shapeCentroids(GALVESTON_SHP);
    console.log("Galveston: reading geometry from parcels.shp alongside the DBF.");
  } else {
    console.warn(
      `Galveston: ${path.basename(GALVESTON_SHP)} not found — writing rows with no centroid, which leaves every flood zone unknown. Download parcels.zip rather than parcel_data.zip.`,
    );
  }

  console.log("Galveston: streaming the parcel DBF...");

  let seen = 0;
  let kept = 0;
  let duplicates = 0;
  let batch = [];
  // A parcel split by a road or easement gets one shapefile row per polygon
  // part, so ~218 GEOIDs in the district repeat with byte-identical
  // attributes. They are the same parcel, and sending both in one upsert makes
  // Postgres reject the whole batch ("cannot affect row a second time").
  const emitted = new Set();
  let withCentroid = 0;
  for (const record of dbfRecords(GALVESTON_FILE, columns)) {
    seen += 1;

    // Advance the geometry cursor for EVERY dbf record, including the ones
    // skipped below, or the two streams drift apart.
    let point = null;
    if (centroids) {
      const next = centroids.next();
      if (next.done) {
        throw new Error(
          `parcels.shp ran out of records at dbf row ${seen}. The two files are not from the same drop.`,
        );
      }
      point = next.value;
    }

    const geoid = record.GEOID;
    if (!geoid || geoid === "N/A") continue;
    const codes = record.ENTITIES.split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (!codes.includes(CCISD_GALVESTON)) continue;
    if (emitted.has(geoid)) {
      duplicates += 1;
      continue;
    }
    emitted.add(geoid);

    kept += 1;
    const wgs84 = point ? texasSouthCentralToWgs84(point.x, point.y) : null;
    if (wgs84) withCentroid += 1;
    batch.push({
      county: "galveston",
      parcel_id: geoid,
      centroid_lon: wgs84 ? Number(wgs84.lon.toFixed(7)) : null,
      centroid_lat: wgs84 ? Number(wgs84.lat.toFixed(7)) : null,
      ...splitSitus(record.SITUS),
      entity_codes: codes,
      exemption_codes: record.EXEMPT || null,
      land_value: numeric(record.VAL26LAND),
      improvement_value: numeric(record.VAL26IMP),
      total_value: numeric(record.VAL26TOT),
      land_use: record.LANDUSE || null,
      source_vintage: GALVESTON_VINTAGE,
    });
    if (batch.length >= BATCH) {
      await upsert(batch);
      batch = [];
    }
  }
  await upsert(batch);
  console.log(
    `Galveston: ${kept.toLocaleString()} of ${seen.toLocaleString()} parcels are in Clear Creek ISD` +
      ` (${duplicates.toLocaleString()} repeated polygon parts collapsed).`,
  );
  console.log(
    `Galveston: ${withCentroid.toLocaleString()} of those carry a centroid for the flood lookup.`,
  );
}

async function main() {
  if (DRY_RUN) console.log("Dry run: parsing only, nothing is written.\n");
  const onlyHarris = args.has("--harris-only");
  const onlyGalveston = args.has("--galveston-only");

  if (!onlyGalveston) await ingestHarris();
  if (!onlyHarris) await ingestGalveston();

  console.log(`\nDone. ${written.toLocaleString()} rows ${DRY_RUN ? "parsed" : "written"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
