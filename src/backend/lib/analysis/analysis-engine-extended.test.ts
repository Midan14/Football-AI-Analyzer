import { describe, expect, it } from "vitest";
import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { analyzeFixtureDeep } from "@/backend/lib/analysis/deep-analysis-engine";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

describe("analyzeFixture - motor de análisis", () => {
  it("calcula probabilidades 1X2 que suman ~100%", () => {
    const result = analyzeFixture(demoFixtures[0]);
    const total = result.probabilities.homeWin + result.probabilities.draw + result.probabilities.awayWin;

    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThan(100.5);
  });

  it("genera tabla de valor con mercados evaluados", () => {
    const result = analyzeFixture(demoFixtures[0]);

    expect(result.valueTable.length).toBeGreaterThan(0);
    expect(result.valueTable[0]).toHaveProperty("market");
    expect(result.valueTable[0]).toHaveProperty("modelProbability");
    expect(result.valueTable[0]).toHaveProperty("edge");
    expect(result.valueTable[0]).toHaveProperty("verdict");
  });

  it("penaliza fixtures con baja cobertura", () => {
    const lowCoverageFixture = {
      ...demoFixtures[0],
      coverage: {
        ...demoFixtures[0].coverage,
        tier: "low" as const,
        hasLineups: false,
      },
    };

    const result = analyzeFixture(lowCoverageFixture);

    expect(result.confidence.score).toBeLessThan(70);
    expect(result.riskFlags.length).toBeGreaterThan(0);
    expect(result.riskFlags.some((flag) => flag.id === "low_coverage_or_division")).toBe(true);
  });

  it("recomienda mercado con mayor probabilidad", () => {
    const result = analyzeFixture(demoFixtures[0]);

    expect(result.recommendation.market).toBeTruthy();
    expect(result.recommendation.fairOdds).toBeGreaterThan(0);
    expect(result.recommendation.stakeUnits).toBeGreaterThan(0);
  });

  it("genera radar de señal con 8 ejes", () => {
    const result = analyzeFixture(demoFixtures[0]);

    expect(result.radar).toHaveLength(8);
    expect(result.radar[0]).toHaveProperty("axis");
    expect(result.radar[0]).toHaveProperty("value");
  });

  it("detecta divergencia de mercado", () => {
    const divergentFixture = {
      ...demoFixtures[0],
      market: {
        ...demoFixtures[0].market,
        homeWinOdds: 1.2, // Cuota muy baja = alta probabilidad de mercado
      },
    };

    const result = analyzeFixture(divergentFixture);

    // Si el modelo dice ~55% local y el mercado dice ~83%, debería haber divergencia
    const hasDivergenceFlag = result.riskFlags.some((flag) => flag.id === "market_divergence_15");
    expect(hasDivergenceFlag).toBe(true);
  });

  it("genera Monte Carlo determinístico para el mismo fixture", () => {
    const first = analyzeFixtureDeep(demoFixtures[0]);
    const second = analyzeFixtureDeep(demoFixtures[0]);

    expect(second.monteCarlo.homeWinDist).toEqual(first.monteCarlo.homeWinDist);
    expect(second.monteCarlo.awayWinDist).toEqual(first.monteCarlo.awayWinDist);
    expect(second.monteCarlo.over25Confidence).toBe(first.monteCarlo.over25Confidence);
  });
});
