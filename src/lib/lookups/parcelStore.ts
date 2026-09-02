import type { County } from "@/lib/propertyTax";

/**
 * The Clear Creek ISD parcel footprint, held in Supabase.
 *
 * Two things live here for two different reasons.
 *
 * Harris rows are jurisdiction codes only. HCAD serves parcels live but its
 * layer carries no taxing-unit list, so the codes come from the annual bulk
 * drop and are joined to the live lookup on the account number. An account
 * absent from this table is a parcel outside the district.
 *
 * Galveston rows are the whole parcel: situs, values and codes. GCAD publishes
 * no query service at all, only a yearly shapefile, so this table *is* the
 * Galveston lookup and its rows are a dated snapshot rather than live data.
 * `source_vintage` travels with every row so the UI can say which is which.
 *
 * Accessed over PostgREST rather than through @supabase/supabase-js: the
 * engine and its lookups have no third-party dependencies, and this is two
 * SELECTs against a public read-only table.
 */

function config(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export interface ParcelRow {
  county: County;
  parcel_id: string;
  situs: string | null;
  situs_number: string | null;
  situs_zip: string | null;
  entity_codes: string[];
  exemption_codes: string | null;
  land_value: number | null;
  improvement_value: number | null;
  total_value: number | null;
  land_use: string | null;
  source_vintage: string;
}

const SELECT =
  "county,parcel_id,situs,situs_number,situs_zip,entity_codes,exemption_codes,land_value,improvement_value,total_value,land_use,source_vintage";

async function query(
  path: string,
): Promise<{ ok: true; rows: ParcelRow[] } | { ok: false; error: string }> {
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      error:
        "The parcel database is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      signal: controller.signal,
      headers: {
        apikey: cfg.key,
        authorization: `Bearer ${cfg.key}`,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Parcel database returned HTTP ${response.status}.`,
      };
    }
    return { ok: true, rows: (await response.json()) as ParcelRow[] };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "The parcel database timed out."
        : error instanceof Error
          ? error.message
          : "Unknown parcel database failure";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** Looks up one parcel's stored row. */
export async function getParcelRow(
  county: County,
  parcelId: string,
): Promise<{ ok: true; row: ParcelRow | null } | { ok: false; error: string }> {
  const result = await query(
    `parcel?select=${SELECT}&county=eq.${county}&parcel_id=eq.${enc(parcelId)}&limit=1`,
  );
  if (!result.ok) return result;
  return { ok: true, row: result.rows[0] ?? null };
}

/**
 * Fetches the stored rows for a batch of Harris accounts at once, so a search
 * that returned a dozen candidates costs one round trip rather than a dozen.
 * Accounts with no row are outside Clear Creek ISD and simply come back absent.
 */
export async function getParcelRows(
  county: County,
  parcelIds: string[],
): Promise<
  { ok: true; rows: Map<string, ParcelRow> } | { ok: false; error: string }
> {
  if (parcelIds.length === 0) return { ok: true, rows: new Map() };
  const list = parcelIds.map((id) => `"${id.replace(/"/g, '""')}"`).join(",");
  const result = await query(
    `parcel?select=${SELECT}&county=eq.${county}&parcel_id=in.(${enc(list)})`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    rows: new Map(result.rows.map((row) => [row.parcel_id, row])),
  };
}

/**
 * Address search for Galveston County, which has no live parcel service.
 *
 * The house number is an exact match on the indexed `situs_number` column and
 * the street name goes through a trigram index on the full situs string. That
 * mirrors what the Harris query does against HCAD, so a typed address behaves
 * the same on both sides of the county line.
 */
export async function searchGalvestonParcels(args: {
  houseNumber: string | null;
  streetTokens: string[];
  limit?: number;
}): Promise<{ ok: true; rows: ParcelRow[] } | { ok: false; error: string }> {
  const { houseNumber, streetTokens, limit = 12 } = args;
  if (!houseNumber && streetTokens.length === 0) {
    return { ok: true, rows: [] };
  }

  const filters = [`select=${SELECT}`, "county=eq.galveston", "situs=not.is.null"];
  if (houseNumber) filters.push(`situs_number=eq.${enc(houseNumber)}`);
  for (const token of streetTokens.slice(0, 3)) {
    filters.push(`situs=ilike.${enc(`*${token}*`)}`);
  }
  filters.push(`limit=${limit}`);

  return query(`parcel?${filters.join("&")}`);
}
