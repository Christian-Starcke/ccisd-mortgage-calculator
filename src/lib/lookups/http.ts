export type LookupResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function fetchJson<T>(
  url: string,
  timeoutMs = 12_000,
): Promise<LookupResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} from ${url}` };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Unknown lookup failure";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
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
