import { describe, expect, it } from "vitest";
import { reconcileHybridProbabilities } from "./hybrid-consistency";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

describe("reconcileHybridProbabilities", () => {
  it("downweights away win when hybrid 1X2 contradicts Dixon-Coles goals and market prior", () => {
    const fixture = {
      ...demoFixtures[0],
      market: {
        ...demoFixtures[0].market,
        homeWinOdds: 1.46,
        drawOdds: 3.95,
        awayWinOdds: 6.6,
      },
    };

    const result = reconcileHybridProbabilities({
      fixture,
      hybridProbabilities: { homeWin: 20.6, draw: 39.3, awayWin: 40.2 },
      dixonColes: { lambdaHome: 0.803, lambdaAway: 0.1518, rho: 0.05 },
      modelAgreement: 40.2,
    });

    expect(result.flags).toContain("hybrid_away_market_contradiction");
    expect(result.probabilities.awayWin).toBeLessThan(30);
    expect(result.probabilities.homeWin).toBeGreaterThan(result.probabilities.awayWin);
  });

  it("keeps hybrid probabilities when model, goals, and market are aligned", () => {
    const fixture = {
      ...demoFixtures[0],
      market: {
        ...demoFixtures[0].market,
        homeWinOdds: 1.9,
        drawOdds: 3.4,
        awayWinOdds: 4.2,
      },
    };

    const result = reconcileHybridProbabilities({
      fixture,
      hybridProbabilities: { homeWin: 48, draw: 27, awayWin: 25 },
      dixonColes: { lambdaHome: 1.45, lambdaAway: 1.0, rho: -0.03 },
      modelAgreement: 72,
    });

    expect(result.flags).toEqual([]);
    expect(result.probabilities.homeWin).toBeCloseTo(48, 1);
  });
});
