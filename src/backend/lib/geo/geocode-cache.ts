type GeoPoint = { lat: number; lon: number };

type CacheEntry = {
  point: GeoPoint;
  expiresAt: number;
};

const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — stadiums rarely move
const cache = new Map<string, CacheEntry>();

export function geocodeCacheKey(parts: Array<string | undefined | null>): string {
  return parts
    .map((p) =>
      (p ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
    )
    .filter(Boolean)
    .join("|");
}

export function readGeocodeCache(key: string): GeoPoint | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.point;
}

export function writeGeocodeCache(key: string, point: GeoPoint): void {
  cache.set(key, { point, expiresAt: Date.now() + TTL_MS });
}

export function clearGeocodeCacheForTests(): void {
  cache.clear();
}
