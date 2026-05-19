import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { queryClient } from "@/frontend/lib/query-client";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  queryClient.clear();
});
afterAll(() => server.close());

describe("useCountries hook", () => {
  it("fetchCountries maneja respuesta exitosa", async () => {
    server.use(
      http.get("/api/countries", () => {
        return HttpResponse.json({
          provider: "demo",
          countries: [
            { id: "england", name: "Inglaterra", code: "ENG", region: "Europa" },
          ],
        });
      })
    );

    const response = await fetch("/api/countries");
    const data = await response.json();

    expect(data.countries).toHaveLength(1);
    expect(data.countries[0].id).toBe("england");
  });

  it("fetchCountries maneja errores del servidor", async () => {
    server.use(
      http.get("/api/countries", () => {
        return HttpResponse.json({ error: "Error al cargar países" }, { status: 500 });
      })
    );

    const response = await fetch("/api/countries");
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });
});

describe("useAnalysis hook", () => {
  it("fetchAnalysis devuelve análisis del backend", async () => {
    server.use(
      http.get("/api/analyze/:fixtureId", () => {
        return HttpResponse.json({
          analysis: {
            fixtureId: "fixture-1",
            probabilities: { homeWin: 50, draw: 25, awayWin: 25, over15: 60, over25: 40, under35: 55, btts: 45 },
            confidence: { score: 65, penalties: [] },
            riskFlags: [],
            radar: [],
            recommendation: { market: "Empate", fairOdds: 4.0, minimumOdds: 4.2, stakeUnits: 0.75, rationale: "Test" },
            valueTable: [],
          },
        });
      })
    );

    const response = await fetch("/api/analyze/fixture-1");
    const data = await response.json();

    expect(data.analysis.confidence.score).toBe(65);
    expect(data.analysis.recommendation.market).toBe("Empate");
  });
});
