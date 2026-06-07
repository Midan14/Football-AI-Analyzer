import type { MatchWeather } from "@/shared/domain";

type GeoPoint = { lat: number; lon: number };

/** WMO weather code → short Spanish label (Open-Meteo). */
const WMO_LABELS: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla helada",
  51: "Llovizna ligera",
  53: "Llovizna",
  55: "Llovizna intensa",
  61: "Lluvia ligera",
  63: "Lluvia",
  65: "Lluvia fuerte",
  71: "Nieve ligera",
  73: "Nieve",
  75: "Nieve fuerte",
  80: "Chubascos ligeros",
  81: "Chubascos",
  82: "Chubascos fuertes",
  95: "Tormenta",
  96: "Tormenta con granizo",
  99: "Tormenta fuerte con granizo",
};

function wmoLabel(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return "Condición variable";
  return WMO_LABELS[code] ?? "Condición variable";
}

function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function pickHourIndex(times: string[], kickoffIso: string): number {
  const kickoff = new Date(kickoffIso).getTime();
  if (!Number.isFinite(kickoff) || times.length === 0) return 0;

  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]!).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - kickoff);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function isPastKickoff(kickoffIso: string): boolean {
  return new Date(kickoffIso).getTime() < Date.now() - 1000 * 60 * 30;
}

export async function fetchMatchWeatherFromOpenMeteo(
  coords: GeoPoint,
  kickoffIso: string,
  options?: { timeoutMs?: number }
): Promise<MatchWeather | null> {
  const timeoutMs = options?.timeoutMs ?? 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const date = isoDateOnly(kickoffIso);
  const base = isPastKickoff(kickoffIso)
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  const url = new URL(base);
  url.searchParams.set("latitude", String(coords.lat));
  url.searchParams.set("longitude", String(coords.lon));
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        relative_humidity_2m?: number[];
        wind_speed_10m?: number[];
        weather_code?: number[];
        precipitation?: number[];
      };
    };

    const hourly = body.hourly;
    if (!hourly?.time?.length) return null;

    const idx = pickHourIndex(hourly.time, kickoffIso);
    const temperatureC = Math.round(hourly.temperature_2m?.[idx] ?? NaN);
    const humidity = Math.round(hourly.relative_humidity_2m?.[idx] ?? NaN);
    const windKmh = Math.round(hourly.wind_speed_10m?.[idx] ?? NaN);
    const code = hourly.weather_code?.[idx];
    const precip = hourly.precipitation?.[idx] ?? 0;
    const condition = wmoLabel(code);

    if (!Number.isFinite(temperatureC)) return null;

    const precipNote =
      typeof precip === "number" && precip > 0.2 ? ` · ${precip.toFixed(1)} mm` : "";

    return {
      temperatureC,
      condition,
      humidity: Number.isFinite(humidity) ? humidity : undefined,
      windKmh: Number.isFinite(windKmh) ? windKmh : undefined,
      source: "open-meteo",
      description: `Open-Meteo · ${temperatureC}°C · ${condition}${precipNote}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
