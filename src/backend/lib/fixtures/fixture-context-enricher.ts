import type { Fixture, MatchWeather, MatchVenue, SquadDynamic, TeamRecentMatch } from "@/shared/domain";

type VenueInput = {
  name?: string | null;
  city?: string | null;
  country?: string | null;
};

/** Approximate coordinates for travel / weather heuristics (major football cities). */
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  london: { lat: 51.5074, lon: -0.1278 },
  madrid: { lat: 40.4168, lon: -3.7038 },
  barcelona: { lat: 41.3874, lon: 2.1686 },
  milan: { lat: 45.4642, lon: 9.19 },
  munich: { lat: 48.1351, lon: 11.582 },
  berlin: { lat: 52.52, lon: 13.405 },
  paris: { lat: 48.8566, lon: 2.3522 },
  rome: { lat: 41.9028, lon: 12.4964 },
  lisbon: { lat: 38.7223, lon: -9.1393 },
  amsterdam: { lat: 52.3676, lon: 4.9041 },
  istanbul: { lat: 41.0082, lon: 28.9784 },
  moscow: { lat: 55.7558, lon: 37.6173 },
  buenosaires: { lat: -34.6037, lon: -58.3816 },
  saopaulo: { lat: -23.5505, lon: -46.6333 },
  riodejaneiro: { lat: -22.9068, lon: -43.1729 },
  bogota: { lat: 4.711, lon: -74.0721 },
  medellin: { lat: 6.2476, lon: -75.5658 },
  mexicocity: { lat: 19.4326, lon: -99.1332 },
  newyork: { lat: 40.7128, lon: -74.006 },
  losangeles: { lat: 34.0522, lon: -118.2437 },
  vienna: { lat: 48.2082, lon: 16.3738 },
  graz: { lat: 47.0707, lon: 15.4395 },
  voitsberg: { lat: 47.045, lon: 15.1513 },
};

function normalizeCityKey(city?: string | null): string {
  return (city ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function lookupCoords(city?: string | null, country?: string | null): { lat: number; lon: number } | null {
  const key = normalizeCityKey(city);
  if (key && CITY_COORDS[key]) return CITY_COORDS[key];

  const countryKey = normalizeCityKey(country);
  const countryDefaults: Record<string, { lat: number; lon: number }> = {
    england: CITY_COORDS.london,
    spain: CITY_COORDS.madrid,
    germany: CITY_COORDS.munich,
    italy: CITY_COORDS.milan,
    france: CITY_COORDS.paris,
    argentina: CITY_COORDS.buenosaires,
    brazil: CITY_COORDS.saopaulo,
    colombia: CITY_COORDS.bogota,
    austria: CITY_COORDS.vienna,
    mexico: CITY_COORDS.mexicocity,
  };
  return countryDefaults[countryKey] ?? null;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

export function computeRestDays(kickoffIso: string, recentMatches: TeamRecentMatch[]): number {
  if (recentMatches.length === 0) return 4;
  const kickoff = new Date(kickoffIso).getTime();
  const last = new Date(recentMatches[0].date).getTime();
  if (!Number.isFinite(kickoff) || !Number.isFinite(last)) return 4;
  const days = Math.floor((kickoff - last) / (1000 * 60 * 60 * 24));
  return Math.max(2, Math.min(14, days));
}

export function estimateTravelKm(
  venueCity: string | undefined,
  awayBaseCity: string | undefined,
  country?: string
): number {
  const from = lookupCoords(awayBaseCity, country);
  const to = lookupCoords(venueCity, country);
  if (from && to) {
    const km = haversineKm(from, to);
    return km < 25 ? 0 : km;
  }
  if (normalizeCityKey(venueCity) && normalizeCityKey(awayBaseCity)) {
    if (normalizeCityKey(venueCity) === normalizeCityKey(awayBaseCity)) return 0;
  }
  return 450;
}

export function estimateWeather(kickoffIso: string, city?: string, country?: string): MatchWeather {
  const date = new Date(kickoffIso);
  const month = date.getMonth();
  const coords = lookupCoords(city, country);
  const lat = coords?.lat ?? 45;

  const isWinter = lat > 0 ? month === 11 || month <= 1 : month >= 5 && month <= 7;
  const isSummer = lat > 0 ? month >= 5 && month <= 8 : month === 11 || month <= 2;

  let temperatureC = 16;
  let condition = "Despejado";
  if (isWinter) {
    temperatureC = lat > 35 ? 12 : lat > 0 ? 6 : 22;
    condition = "Frío";
  } else if (isSummer) {
    temperatureC = lat > 35 ? 28 : lat > 0 ? 22 : 14;
    condition = "Cálido";
  } else {
    temperatureC = lat > 35 ? 20 : 14;
    condition = "Templado";
  }

  const humidity = isSummer ? 55 : 68;
  const windKmh = 12;

  return {
    temperatureC,
    condition,
    humidity,
    windKmh,
    source: "estimate",
    description: `${condition} · ~${temperatureC}°C · estimado por estación`,
  };
}

export function weatherRiskFromEstimate(weather: MatchWeather): "low" | "medium" | "high" {
  const temp = weather.temperatureC ?? 16;
  const wind = weather.windKmh ?? 0;
  if (temp <= 2 || temp >= 32 || wind >= 35) return "high";
  if (temp <= 6 || temp >= 28 || wind >= 22) return "medium";
  return "low";
}

export function isSuspensionStatus(status: string): boolean {
  const text = status.toLowerCase();
  return (
    text.includes("susp") ||
    text.includes("ban") ||
    text.includes("sanc") ||
    text.includes("red card") ||
    text.includes("tarjeta roja")
  );
}

export function splitInjuriesAndSuspensions(
  entries: SquadDynamic["injuries"]
): { injuries: SquadDynamic["injuries"]; suspensions: SquadDynamic["suspensions"] } {
  const injuries: SquadDynamic["injuries"] = [];
  const suspensions: SquadDynamic["suspensions"] = [];

  for (const entry of entries) {
    if (isSuspensionStatus(entry.status)) {
      suspensions.push({ player: entry.player, position: entry.position });
    } else {
      injuries.push(entry);
    }
  }

  return { injuries, suspensions };
}

export function buildVenue(input: VenueInput, leagueCountry?: string): MatchVenue | undefined {
  if (!input.name && !input.city) return undefined;
  return {
    name: input.name ?? "Estadio por confirmar",
    city: input.city ?? undefined,
    country: input.country ?? leagueCountry,
  };
}

export function computeTravelKmFromCoords(
  from: { lat: number; lon: number } | null,
  to: { lat: number; lon: number } | null
): number | null {
  if (!from || !to) return null;
  const km = haversineKm(from, to);
  return km < 25 ? 0 : km;
}

function isRealWeatherTravelEnabled(): boolean {
  return process.env.ENABLE_REAL_WEATHER_TRAVEL !== "false";
}

/**
 * Tries Open-Meteo + geocoded travel; on any failure keeps heuristic values from sync enricher.
 * Safe for production: never throws, bounded timeouts, opt-out via ENABLE_REAL_WEATHER_TRAVEL=false.
 */
export async function enrichFixtureOperationalContextAsync(
  fixture: Fixture,
  venueInput?: VenueInput,
  awayBaseCity?: string | null
): Promise<Fixture> {
  const base = enrichFixtureOperationalContext(fixture, venueInput, awayBaseCity);
  if (!isRealWeatherTravelEnabled()) return base;

  try {
    const { geocodePlace } = await import("@/backend/lib/geo/nominatim-geocoder");
    const { fetchMatchWeatherFromOpenMeteo } = await import("@/backend/lib/weather/open-meteo-client");

    const leagueCountry = venueInput?.country ?? base.venue?.country ?? fixture.leagueName;

    const [venueCoords, awayCoords] = await Promise.all([
      geocodePlace(
        {
          name: venueInput?.name ?? base.venue?.name,
          city: venueInput?.city ?? base.venue?.city,
          country: leagueCountry,
        },
        { timeoutMs: 2500 }
      ),
      geocodePlace(
        {
          city: awayBaseCity ?? undefined,
          country: leagueCountry,
        },
        { timeoutMs: 2500 }
      ),
    ]);

    let weather = base.weather;
    if (venueCoords) {
      const liveWeather = await fetchMatchWeatherFromOpenMeteo(venueCoords, base.kickoff, {
        timeoutMs: 2500,
      });
      if (liveWeather) {
        weather = liveWeather;
      }
    }

    let awayTravelKm = base.away.travelKm;
    let travelNote: string | undefined;
    const geocodedKm = computeTravelKmFromCoords(awayCoords, venueCoords);
    if (geocodedKm != null) {
      awayTravelKm = geocodedKm;
      const fromLabel = awayBaseCity ?? "origen visitante";
      const toLabel = base.venue?.city ?? base.venue?.name ?? "estadio";
      travelNote = `${geocodedKm} km · ${fromLabel} → ${toLabel} · geocodificado`;
    }

    const weatherRisk = weather ? weatherRiskFromEstimate(weather) : base.context.weatherRisk;

    return {
      ...base,
      weather,
      away: { ...base.away, travelKm: awayTravelKm, travelNote },
      context: { ...base.context, weatherRisk },
    };
  } catch {
    return base;
  }
}

export function enrichFixtureOperationalContext(
  fixture: Fixture,
  venueInput?: VenueInput,
  awayBaseCity?: string | null
): Fixture {
  const venue = buildVenue(venueInput ?? {}, fixture.leagueName);
  const homeRest = computeRestDays(fixture.kickoff, fixture.home.recentMatches ?? []);
  const awayRest = computeRestDays(fixture.kickoff, fixture.away.recentMatches ?? []);
  const travelKm = estimateTravelKm(venue?.city, awayBaseCity ?? venue?.city, venue?.country);
  const weather = estimateWeather(fixture.kickoff, venue?.city, venue?.country);
  const weatherRisk = weatherRiskFromEstimate(weather);

  let squad = fixture.squad;
  if (squad) {
    const homeSplit = splitInjuriesAndSuspensions(squad.home.injuries);
    const awaySplit = splitInjuriesAndSuspensions(squad.away.injuries);
    squad = {
      home: {
        ...squad.home,
        injuries: homeSplit.injuries,
        suspensions: [...squad.home.suspensions, ...homeSplit.suspensions],
      },
      away: {
        ...squad.away,
        injuries: awaySplit.injuries,
        suspensions: [...squad.away.suspensions, ...awaySplit.suspensions],
      },
    };
  }

  return {
    ...fixture,
    venue,
    weather,
    home: { ...fixture.home, restDays: homeRest, travelKm: 0 },
    away: { ...fixture.away, restDays: awayRest, travelKm },
    context: { ...fixture.context, weatherRisk },
    squad,
  };
}

export function applyLineupsToSquad(
  fixture: Fixture,
  lineups: Array<{ teamId: string; startXI: Array<{ name: string }> }>
): Fixture {
  if (!fixture.squad || lineups.length === 0) return fixture;

  const homeId = fixture.home.id;
  const awayId = fixture.away.id;
  const homeLineup = lineups.find((l) => l.teamId === homeId);
  const awayLineup = lineups.find((l) => l.teamId === awayId);

  return {
    ...fixture,
    squad: {
      home: {
        ...fixture.squad.home,
        lastLineup: homeLineup?.startXI.map((p) => p.name) ?? fixture.squad.home.lastLineup,
      },
      away: {
        ...fixture.squad.away,
        lastLineup: awayLineup?.startXI.map((p) => p.name) ?? fixture.squad.away.lastLineup,
      },
    },
    coverage: {
      ...fixture.coverage,
      hasLineups: lineups.length >= 2 || fixture.coverage.hasLineups,
    },
  };
}
