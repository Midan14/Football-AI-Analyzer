import { describe, expect, it } from "vitest";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import { demoFixtures } from "@/backend/lib/providers/demo-data";
import { buildMultiMarketLayer } from "./multi-market-layer";

function analysisFixture(): { fixture: Fixture; analysis: AnalysisResult } {
  const fixture = {
    ...demoFixtures[0],
    referee: { name: "Strict Ref", avgCards: 5.8, avgPenalties: 0.22, strictness: "high" as const, homeBias: 0, controversyHistory: [], lastMatches: 40 },
    coverage: { ...demoFixtures[0].coverage, hasXg: true, hasMomentum: true, hasLineups: false },
    market: { ...demoFixtures[0].market, firstGoalScorer: [] },
  };
  const analysis: AnalysisResult = {
    fixtureId: fixture.id,
    probabilities: { homeWin: 52, draw: 25, awayWin: 23, over15: 78, over25: 56, under35: 70, btts: 54 },
    topExactScores: [],
    goalMarkets: {
      doubleChance: { "1X": 77, "X2": 48, "12": 75 },
      overUnder: {},
      exactTotalGoals: {},
      goalsOddEven: { ODD: 52, EVEN: 48 },
      winToNil: { HOME: 28, AWAY: 12 },
      cleanSheet: { HOME: 34, AWAY: 20 },
      teamToScore: { HOME: 78, AWAY: 62 },
    },
    confidence: { score: 68, penalties: [] },
    riskFlags: [],
    radar: [],
    recommendation: { market: "Over 2.5", fairOdds: 1.79, minimumOdds: 1.88, stakeUnits: 0.5, rationale: "test" },
    valueTable: [],
    ensemble: {
      homeWin: 52,
      draw: 25,
      awayWin: 23,
      models: {
        poisson: { homeWin: 52, draw: 25, awayWin: 23, weight: 0.25 },
        negBinom: { homeWin: 51, draw: 26, awayWin: 23, weight: 0.25 },
        elo: { homeWin: 53, draw: 24, awayWin: 23, weight: 0.25 },
        form: { homeWin: 52, draw: 25, awayWin: 23, weight: 0.25 },
      },
      modelAgreement: 82,
      dominantModel: "Ensemble",
    },
    kelly: { bets: [], totalExposure: 0, expectedROI: 0, sharpeRatio: 0 },
  };
  return { fixture, analysis };
}

describe("buildMultiMarketLayer", () => {
  it("builds actionable cards and corners layers from available match context", () => {
    const { fixture, analysis } = analysisFixture();
    const layer = buildMultiMarketLayer(fixture, analysis);

    expect(layer.cards.marketsUnlocked).toContain("Over/Under tarjetas");
    expect(layer.cards.refereeFactor).toBeGreaterThan(5);
    expect(layer.corners.marketsUnlocked).toContain("Over/Under corners");
    expect(layer.corners.dataQuality).toBeGreaterThanOrEqual(70);
    expect(layer.calibration.applyBeforeKelly).toBe(true);
  });

  it("blocks player props when lineups and player odds are missing", () => {
    const { fixture, analysis } = analysisFixture();
    const layer = buildMultiMarketLayer(fixture, analysis);

    expect(layer.playerProps.status).toBe("blocked");
    expect(layer.playerProps.dataGaps).toContain("faltan alineaciones confirmadas");
    expect(layer.dataReadiness.some((row) => row.layer === "Fase 4 props" && row.status === "blocked")).toBe(true);
  });
});
