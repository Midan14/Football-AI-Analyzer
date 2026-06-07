import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { enrichFixtureOperationalContextAsync } from "@/backend/lib/fixtures/fixture-context-enricher";
import { createTestFixture } from "@/frontend/lib/test-fixture";

describe("enrichFixtureOperationalContextAsync", () => {
  const prev = process.env.ENABLE_REAL_WEATHER_TRAVEL;

  beforeEach(() => {
    process.env.ENABLE_REAL_WEATHER_TRAVEL = "true";
  });

  afterEach(() => {
    process.env.ENABLE_REAL_WEATHER_TRAVEL = prev;
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("keeps heuristic data when geocoding fails", async () => {
    vi.doMock("@/backend/lib/geo/nominatim-geocoder", () => ({
      geocodePlace: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/backend/lib/weather/open-meteo-client", () => ({
      fetchMatchWeatherFromOpenMeteo: vi.fn(),
    }));

    const { enrichFixtureOperationalContextAsync: enrichAsync } = await import(
      "@/backend/lib/fixtures/fixture-context-enricher"
    );

    const fixture = createTestFixture({ kickoff: "2026-07-10T18:00:00Z" });
    const enriched = await enrichAsync(
      fixture,
      { name: "Allianz Arena", city: "Munich", country: "Germany" },
      "Paris"
    );

    expect(enriched.weather?.source).toBe("estimate");
    expect(enriched.away.travelKm).toBeGreaterThan(0);
    expect(enriched.away.travelNote).toBeUndefined();
  });

  it("uses real weather and geocoded travel when providers succeed", async () => {
    vi.doMock("@/backend/lib/geo/nominatim-geocoder", () => ({
      geocodePlace: vi
        .fn()
        .mockResolvedValueOnce({ lat: 48.22, lon: 11.63 })
        .mockResolvedValueOnce({ lat: 48.86, lon: 2.35 }),
    }));
    vi.doMock("@/backend/lib/weather/open-meteo-client", () => ({
      fetchMatchWeatherFromOpenMeteo: vi.fn().mockResolvedValue({
        temperatureC: 18,
        condition: "Despejado",
        source: "open-meteo",
        description: "Open-Meteo · 18°C · Despejado",
      }),
    }));

    const { enrichFixtureOperationalContextAsync: enrichAsync } = await import(
      "@/backend/lib/fixtures/fixture-context-enricher"
    );

    const fixture = createTestFixture({ kickoff: "2026-07-10T18:00:00Z" });
    const enriched = await enrichAsync(
      fixture,
      { name: "Allianz Arena", city: "Munich", country: "Germany" },
      "Paris"
    );

    expect(enriched.weather?.source).toBe("open-meteo");
    expect(enriched.weather?.temperatureC).toBe(18);
    expect(enriched.away.travelNote).toContain("geocodificado");
  });
});
