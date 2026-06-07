import { describe, expect, it } from "vitest";
import { mergeExtendedModels } from "./merge-extended-models";
import type { AnalysisResult } from "@/shared/domain";

const baseAnalysis = {
  advancedModels: {
    dixonColes: { rho: 0, prob00: 10, prob11: 12, correction00: 0, correction11: 0 },
    hierarchical: { lambdaHome: 1.4, lambdaAway: 1.1, expectedTotalGoals: 2.5, homeWin: 40, draw: 28, awayWin: 32 },
    skellam: { mostLikelyDiff: 0, expectedDiff: 0.2, ahMinus05: { home: 50, away: 50 }, ahMinus1: { home: 45, away: 55 } },
    zip: { prob00: 8, drawAdjustment: 0, piHome: 0.1, piAway: 0.1 },
    kalman: { homeAttack: 1, homeDefense: 1, awayAttack: 1, awayDefense: 1, homeTrend: "stable", awayTrend: "stable" },
    xThreat: { homeThreat: 50, awayThreat: 48, dominance: "home", dominanceScore: 2 },
    valueBets: { bestBet: null, totalPositiveEV: 0, overround: 105, marketEfficiency: 95 },
    hawkes: { homeMomentum: 0.5, awayMomentum: 0.4, nextGoalIn10min: 12, expectedTotalGoals: 2.6, clusteringCoeff: 0.2 },
    bayesian: {
      posterior: { homeWin: 40, draw: 28, awayWin: 32, over25: 55, btts: 52 },
      shift: { homeWin: 0, draw: 0, awayWin: 0 },
      updateConfidence: 60,
      keyEvents: [],
      xgRemaining: { home: 0.8, away: 0.7 },
      timeDecay: 1,
    },
    bivariatePoisson: { lambdaHome: 1.4, lambdaAway: 1.2, kappa: 0.1, homeWin: 38, draw: 27, awayWin: 35, covariance: 0.05 },
    temporalBlend: { recentWeight: 0.7, seasonWeight: 0.3, blendedHomeXg: 1.5, blendedAwayXg: 1.2, homeWin: 41, draw: 27, awayWin: 32 },
    mlOps: { runId: "ts", schemaValid: true, driftScore: 10, driftStatus: "stable", featureCompleteness: 60, qualityGatePassed: true },
    timeSeries: { prophetTrend: 0.1, arimaHomeWin: 40, tftHomeWin: 41, nbeatsHomeWin: 39, sarimaHomeWin: 39, sarimaSeasonality: 0.02, ensembleHomeWin: 40, ensembleDraw: 28, ensembleAwayWin: 32 },
    halfTime: { homeWinHT: 35, drawHT: 40, awayWinHT: 25, expectedGoalsHT: 1.1, over05HT: 72 },
    cornersEsp: { expectedTotalCorners: 10.2, homeCorners: 5.4, awayCorners: 4.8, over95Corners: 58 },
    cardsRisk: { expectedYellows: 4.8, expectedReds: 0.12, homeCardsIndex: 3.2, awayCardsIndex: 3.5, highCardRisk: false },
    xgModel: { homeXg: 1.45, awayXg: 1.15, totalXg: 2.6, bttsFromXg: 54, engine: "typescript-xg-blend" },
    explainability: { topDrivers: [{ feature: "form_diff", impact: 8 }], method: "lime-local-linear", dominantOutcome: "HOME_WIN" },
    featureEngineering: { rollingFeatureCount: 10, tsfreshProxyScore: 82 },
    autoMl: { championModel: "ensemble-voting", engines: ["xgboost"], optunaEnabled: false, randomForestEnabled: true },
    causalSurvival: { gnnDelta: 0.02, causalLift: 1, survivalProbNoGoal60: 0.4, medianMinutesToNextGoal: 30 },
    quantumOptimizer: { method: "QAOA-simulated", optimalExposure: 5, energy: 0, topMarket: "HOME_WIN" },
  },
} as unknown as AnalysisResult;

describe("mergeExtendedModels", () => {
  it("replaces TS sections when Python source is present", () => {
    const merged = mergeExtendedModels(baseAnalysis, {
      timeSeries: {
        source: "python",
        engines: ["prophet", "statsmodels-arima"],
        prophetTrend: 0.55,
        arimaHomeWin: 44,
        tftHomeWin: 43,
        nbeatsHomeWin: 42,
        ensembleHomeWin: 43,
        ensembleDraw: 26,
        ensembleAwayWin: 31,
      },
      quantumOptimizer: {
        source: "python",
        engine: "qiskit-qaoa",
        method: "QAOA",
        optimalExposure: 12,
        energy: -0.42,
        topMarket: "DRAW",
      },
    });

    expect(merged.advancedModels?.timeSeries.arimaHomeWin).toBe(44);
    expect(merged.advancedModels?.quantumOptimizer.method).toBe("QAOA");
    expect(merged.advancedModels?.modelSources?.timeSeries).toContain("prophet");
    expect(merged.advancedModels?.modelSources?.quantumOptimizer).toBe("qiskit-qaoa");
  });

  it("merges half-time and corners from Python", () => {
    const merged = mergeExtendedModels(baseAnalysis, {
      halfTime: {
        source: "python",
        engine: "numpy-half-time",
        homeWinHT: 42,
        drawHT: 38,
        awayWinHT: 20,
        expectedGoalsHT: 1.2,
        over05HT: 75,
      },
      cornersEsp: {
        source: "python",
        engine: "numpy-corners",
        expectedTotalCorners: 11.1,
        homeCorners: 6,
        awayCorners: 5.1,
        over95Corners: 62,
      },
    });
    expect(merged.advancedModels?.halfTime.homeWinHT).toBe(42);
    expect(merged.advancedModels?.cornersEsp.over95Corners).toBe(62);
  });

  it("returns unchanged analysis when extended is null", () => {
    expect(mergeExtendedModels(baseAnalysis, null)).toBe(baseAnalysis);
  });
});
