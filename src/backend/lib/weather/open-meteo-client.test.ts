import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchMatchWeatherFromOpenMeteo } from "@/backend/lib/weather/open-meteo-client";

describe("open-meteo-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps hourly forecast to MatchWeather", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hourly: {
            time: ["2026-05-21T16:00:00Z", "2026-05-21T17:00:00Z", "2026-05-21T18:00:00Z"],
            temperature_2m: [12, 14, 16],
            relative_humidity_2m: [60, 62, 64],
            wind_speed_10m: [10, 11, 12],
            weather_code: [3, 3, 61],
            precipitation: [0, 0, 0.4],
          },
        }),
      })
    );

    const weather = await fetchMatchWeatherFromOpenMeteo(
      { lat: 40.4, lon: -3.7 },
      "2026-05-21T18:00:00Z"
    );

    expect(weather?.source).toBe("open-meteo");
    expect(weather?.temperatureC).toBe(16);
    expect(weather?.condition).toBe("Lluvia ligera");
    expect(weather?.description).toContain("Open-Meteo");
  });

  it("returns null when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const weather = await fetchMatchWeatherFromOpenMeteo(
      { lat: 40.4, lon: -3.7 },
      "2026-05-21T18:00:00Z"
    );
    expect(weather).toBeNull();
  });
});
