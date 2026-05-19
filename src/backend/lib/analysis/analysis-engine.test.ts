import { describe, expect, it } from "vitest";
import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

describe("analyzeFixture", () => {
  it("normalizes 1X2 probabilities to 100 percent", () => {
    const result = analyzeFixture(demoFixtures[0]);
    const total = result.probabilities.homeWin + result.probabilities.draw + result.probabilities.awayWin;

    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThan(100.5);
  });

  it("reduces confidence and stake for incomplete low-coverage fixtures", () => {
    const result = analyzeFixture({
      ...demoFixtures[0],
      coverage: {
        ...demoFixtures[0].coverage,
        tier: "low",
        hasLineups: false,
        hasOdds: false,
        hasXg: false,
      },
    });

    expect(result.confidence.score).toBeLessThanOrEqual(55);
    expect(result.recommendation.stakeUnits).toBeLessThanOrEqual(0.5);
    expect(result.riskFlags.some((flag) => flag.id === "low_coverage_or_division")).toBe(true);
  });

  it("flags market divergence above 15 percent and lowers confidence", () => {
    const result = analyzeFixture({
      ...demoFixtures[1],
      market: {
        ...demoFixtures[1].market,
        homeWinOdds: 5.2,
        drawOdds: 3.2,
        awayWinOdds: 1.55,
      },
    });

    expect(result.riskFlags.some((flag) => flag.id === "market_divergence_15")).toBe(true);
    expect(result.confidence.penalties.some((penalty) => penalty.id === "market_divergence_15")).toBe(true);
  });

  it("does not crash or invent value when bookmaker odds are missing", () => {
    const result = analyzeFixture({
      ...demoFixtures[0],
      coverage: {
        ...demoFixtures[0].coverage,
        hasOdds: false,
      },
      market: {
        ...demoFixtures[0].market,
        homeWinOdds: 0,
        drawOdds: 0,
        awayWinOdds: 0,
        over15Odds: 0,
        over25Odds: 0,
        over35Odds: 0,
        under15Odds: 0,
        under25Odds: 0,
        under35Odds: 0,
        bttsYesOdds: 0,
        bttsNoOdds: 0,
        dc1xOdds: 0,
        dcx2Odds: 0,
        dc12Odds: 0,
        ahHomeMinus1: 0,
        ahAwayPlus1: 0,
      },
    });

    expect(result.valueTable).toHaveLength(0);
    expect(result.recommendation.market).toContain("Sin cuota real disponible");
    expect(result.recommendation.fairOdds).toBeGreaterThan(0);
  });
});
