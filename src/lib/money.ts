/**
 * Money helpers.
 *
 * Every dollar amount in this project is carried as a plain number of dollars
 * (not cents). Rounding is applied only at display boundaries and at the points
 * where a real lender would round, which are called out at each use site.
 */

/** Rounds to whole cents, killing floating point dust like 1234.5600000000002. */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundDollars(value: number): number {
  return Math.round(value);
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function formatUSD(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Formats a fraction as a percent, e.g. 0.0625 -> "6.250%". */
export function formatPercent(fraction: number, fractionDigits = 3): string {
  return `${(fraction * 100).toFixed(fractionDigits)}%`;
}

/**
 * Parses loose user input like "$425,000", "425k", or "6.25%" into a number.
 * Returns null when nothing numeric is present so callers can distinguish
 * "empty field" from "zero".
 */
export function parseLooseNumber(raw: string): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const hasThousandsSuffix = /k$/i.test(trimmed);
  const hasMillionsSuffix = /m$/i.test(trimmed);
  const cleaned = trimmed.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;

  if (hasMillionsSuffix) return parsed * 1_000_000;
  if (hasThousandsSuffix) return parsed * 1_000;
  return parsed;
}
