import { geocodeCacheKey, readGeocodeCache, writeGeocodeCache } from "@/backend/lib/geo/geocode-cache";

export type GeoPoint = { lat: number; lon: number };

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Football-AI-Analyzer/1.0 (fixture context; contact: local-dev)";

/** Last resort throttle between live Nominatim calls (policy: max ~1 req/s). */
let lastNominatimCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleNominatim(): Promise<void> {
  const elapsed = Date.now() - lastNominatimCallAt;
  if (elapsed < 1100) await sleep(1100 - elapsed);
  lastNominatimCallAt = Date.now();
}

export async function geocodePlace(
  queryParts: { name?: string; city?: string; country?: string },
  options?: { timeoutMs?: number }
): Promise<GeoPoint | null> {
  const key = geocodeCacheKey([queryParts.name, queryParts.city, queryParts.country]);
  const cached = readGeocodeCache(key);
  if (cached) return cached;

  const q = [queryParts.name, queryParts.city, queryParts.country].filter(Boolean).join(", ");
  if (!q.trim()) return null;

  const timeoutMs = options?.timeoutMs ?? 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await throttleNominatim();

    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;

    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = rows[0];
    if (!first?.lat || !first?.lon) return null;

    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const point = { lat, lon };
    writeGeocodeCache(key, point);
    return point;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
