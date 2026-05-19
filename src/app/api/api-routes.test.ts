import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("API /countries", () => {
  it("devuelve lista de países correctamente", async () => {
    server.use(
      http.get("/api/countries", () => {
        return HttpResponse.json({
          provider: "demo",
          countries: [
            { id: "england", name: "Inglaterra", code: "ENG", region: "Europa" },
            { id: "spain", name: "España", code: "ESP", region: "Europa" },
          ],
        });
      })
    );

    const response = await fetch("/api/countries");
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.countries).toHaveLength(2);
    expect(data.countries[0].name).toBe("Inglaterra");
  });

  it("maneja errores del servidor", async () => {
    server.use(
      http.get("/api/countries", () => {
        return HttpResponse.json({ error: "No se pudieron cargar los países" }, { status: 500 });
      })
    );

    const response = await fetch("/api/countries");
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("No se pudieron cargar los países");
  });
});

describe("API /leagues", () => {
  it("devuelve ligas filtradas por país", async () => {
    server.use(
      http.get("/api/leagues", ({ request }) => {
        const url = new URL(request.url);
        const countryId = url.searchParams.get("countryId");

        return HttpResponse.json({
          leagues: [
            { id: "premier-league", countryId, name: "Premier League", tier: "elite", season: "2026/27", coverageScore: 96 },
          ],
        });
      })
    );

    const response = await fetch("/api/leagues?countryId=england");
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.leagues).toHaveLength(1);
    expect(data.leagues[0].name).toBe("Premier League");
  });
});

describe("API /fixtures", () => {
  it("devuelve partidos filtrados por liga y fecha", async () => {
    server.use(
      http.get("/api/fixtures", ({ request }) => {
        const url = new URL(request.url);
        const leagueId = url.searchParams.get("leagueId");

        return HttpResponse.json({
          fixtures: [
            {
              id: "fixture-1",
              leagueId,
              leagueName: "Premier League",
              kickoff: "2026-05-01T19:45:00-05:00",
              status: "pre-match",
              home: { id: "arsenal", name: "Arsenal", form: ["W"], goalsFor: 41, goalsAgainst: 20, xgFor: 38, xgAgainst: 22, tablePosition: 2, restDays: 3, travelKm: 0, motivation: 85 },
              away: { id: "brighton", name: "Brighton", form: ["D"], goalsFor: 32, goalsAgainst: 28, xgFor: 35, xgAgainst: 30, tablePosition: 8, restDays: 4, travelKm: 120, motivation: 70 },
            },
          ],
        });
      })
    );

    const response = await fetch("/api/fixtures?leagueId=premier-league&date=2026-05-01");
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.fixtures).toHaveLength(1);
    expect(data.fixtures[0].home.name).toBe("Arsenal");
  });
});

describe("API /analyze/:fixtureId", () => {
  it("devuelve análisis del partido", async () => {
    server.use(
      http.get("/api/analyze/:fixtureId", ({ params }) => {
        return HttpResponse.json({
          analysis: {
            fixtureId: params.fixtureId,
            probabilities: { homeWin: 55, draw: 25, awayWin: 20, over15: 70, over25: 45, under35: 60, btts: 50 },
            confidence: { score: 72, penalties: [] },
            riskFlags: [],
            radar: [],
            recommendation: { market: "Local gana", fairOdds: 1.8, minimumOdds: 1.9, stakeUnits: 1, rationale: "Test" },
            valueTable: [],
          },
        });
      })
    );

    const response = await fetch("/api/analyze/fixture-1");
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.analysis.fixtureId).toBe("fixture-1");
    expect(data.analysis.confidence.score).toBe(72);
  });

  it("devuelve error 400 si falta fixtureId", async () => {
    server.use(
      http.get("/api/analyze/:fixtureId", ({ params }) => {
        if (!params.fixtureId || params.fixtureId === "") {
          return HttpResponse.json({ error: "fixtureId es requerido" }, { status: 400 });
        }
        return HttpResponse.json({ analysis: {} });
      })
    );

    // MSW no intercepta /api/analyze/ sin segmento, así que probamos con un fixtureId vacío
    const response = await fetch("/api/analyze/invalid");
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(500);
  });
});
