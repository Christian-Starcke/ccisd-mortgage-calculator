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
  /*
   * Anything that rounds to zero is shown as zero, not as "-$0".
   *
   * Whole-dollar display is the default here, so any amount between -50c and 0
   * — a lender credit that all but cancels a fee, a rounding residue — came out
   * as a minus sign in front of nothing.
   */
  const scale = 10 ** fractionDigits;
  const normalised = Math.round(value * scale) === 0 ? 0 : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(normalised);
}

/**
 * Rounds a set of components to whole dollars so that they still sum to the
 * rounded total.
 *
 * Independent rounding does not preserve the sum: ten rows each off by up to
 * half a dollar can drift a couple of dollars from the total beneath them, and
 * a reader who adds the column finds the discrepancy. The total is the
 * authoritative number, so the residue is pushed into the largest component,
 * where one dollar is proportionally least visible.
 *
 * Returns rounded values in the same order as the input.
 */
export function roundToMatchTotal(
  values: number[],
  total: number,
): number[] {
  const rounded = values.map((v) => Math.round(v));
  if (rounded.length === 0) return rounded;

  const target = Math.round(total);
  let drift = target - rounded.reduce((sum, v) => sum + v, 0);
  if (drift === 0) return rounded;

  let largest = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[largest]) largest = i;
  }
  rounded[largest] += drift;
  drift = 0;
  return rounded;
}

/** Formats a fraction as a percent, e.g. 0.0625 -> "6.250%". */
export function formatPercent(fraction: number, fractionDigits = 3): string {
  // A debt-to-income ratio is unbounded when income is zero. Rendering that as
  // "Infinity%" is worse than saying it cannot be computed.
  if (!Number.isFinite(fraction)) return "—";
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
