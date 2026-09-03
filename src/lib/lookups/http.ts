export type LookupResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface FetchOptions {
  timeoutMs?: number;
  /**
   * Extra attempts after the first, for services that fail intermittently
   * rather than slowly.
   *
   * FEMA's National Flood Hazard Layer is the reason this exists: it drops
   * roughly two connections in five, usually within a fraction of a second, so
   * a single attempt loses a flood answer that is perfectly well known. Two
   * retries take that from about a 40% miss rate to under 7%.
   *
   * Deliberately opt-in. A failure from HCAD or the parcel database means
   * something real and should surface immediately rather than be retried.
   */
  retries?: number;
}

export async function fetchJson<T>(
  url: string,
  options: FetchOptions | number = {},
): Promise<LookupResult<T>> {
  // Older callers passed a bare timeout.
  const { timeoutMs = 12_000, retries = 0 } =
    typeof options === "number" ? { timeoutMs: options } : options;

  let lastError = "Unknown lookup failure";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      // Short, growing pause. These failures are transient, not rate limits.
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status} from ${url}`;
        // A 4xx will not fix itself; only server-side faults are worth retrying.
        if (response.status < 500) return { ok: false, error: lastError };
        continue;
      }
      return { ok: true, data: (await response.json()) as T };
    } catch (error) {
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? `Timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : "Unknown lookup failure";
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: lastError };
}

export function withQuery(
  base: string,
  params: Record<string, string | number | boolean>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
