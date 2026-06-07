import { describe, expect, it } from "vitest";
import { buildAnalysisPipelineStatus } from "./analysis-pipeline";
import type { AnalysisResult } from "./domain";

const baseAnalysis = {
  probabilities: { homeWin: 40, draw: 28, awayWin: 32, over25: 55, under35: 60, btts: 52, over15: 70 },
  advancedModels: {
    modelSources: { timeSeries: "prophet, statsmodels-arima" },
  },
  ensemble: { dominantModel: "Multi-Ensemble", homeWin: 40, draw: 28, awayWin: 32, models: [], modelAgreement: 70 },
} as unknown as AnalysisResult;

describe("buildAnalysisPipelineStatus", () => {
  it("labels max tier when all layers trained", () => {
    const status = buildAnalysisPipelineStatus({
      analysis: baseAnalysis,
      extendedMerged: true,
      mlBlended: true,
      mlPrediction: {
        models_used: ["xgboost", "voting"],
        probabilities: { ensemble: { HOME_WIN: 45, DRAW: 25, AWAY_WIN: 30 } },
      },
    });
    expect(status.tier).toBe("max");
    expect(status.layers).toEqual(["typescript", "python", "ml"]);
  });

  it("marks ML heuristic with asterisk tier high", () => {
    const status = buildAnalysisPipelineStatus({
      analysis: baseAnalysis,
      extendedMerged: true,
      mlBlended: true,
      mlPrediction: {
        models_used: ["heuristic-blend"],
        probabilities: { ensemble: { HOME_WIN: 40, DRAW: 30, AWAY_WIN: 30 } },
      },
    });
    expect(status.mlHeuristic).toBe(true);
    expect(status.label).toContain("ML*");
  });
});
