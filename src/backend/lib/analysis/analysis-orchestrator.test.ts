import { describe, expect, it, vi } from "vitest";
import { demoFixtures } from "@/backend/lib/providers/demo-data";
import {
  ensureAdvancedModelsComplete,
  blendMultiModelAnalysis,
  applyRoiCalibrationToAnalysis,
  runFullAnalysis,
} from "./analysis-orchestrator";
import { analyzeFixture } from "./analysis-engine";

vi.mock("@/backend/lib/ml/predictor", () => ({
  predictWithML: vi.fn().mockResolvedValue(null),
  buildMLStatsPayload: vi.fn().mockReturnValue({ homeStats: {}, awayStats: {} }),
}));

vi.mock("./ml-client", () => ({
  getExtendedMLPrediction: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/backend/lib/ml/ml-service-manager", () => ({
  ensureMLServiceRunning: vi.fn().mockResolvedValue(false),
}));

describe("analysis-orchestrator", () => {
  it("ensureAdvancedModelsComplete fills missing sections", () => {
    const base = analyzeFixture(demoFixtures[0]);
    const stripped = { ...base, advancedModels: undefined };
    const fixed = ensureAdvancedModelsComplete(stripped, demoFixtures[0]);
    expect(fixed.advancedModels?.halfTime).toBeDefined();
    expect(fixed.advancedModels?.cornersEsp).toBeDefined();
    expect(fixed.advancedModels?.explainability.topDrivers.length).toBeGreaterThan(0);
  });

  it("blendMultiModelAnalysis merges ML probabilities", () => {
    const base = analyzeFixture(demoFixtures[0]);
    const blended = blendMultiModelAnalysis(base, demoFixtures[0], {
      prediction: "HOME_WIN",
      confidence: 72,
      probabilities: { ensemble: { HOME_WIN: 55, DRAW: 25, AWAY_WIN: 20 } },
      over_25: { over: 60, under: 40 },
      btts: { yes: 58, no: 42 },
      models_used: ["xgboost", "voting"],
      classes: ["HOME_WIN", "DRAW", "AWAY_WIN"],
      shap: { top_features: [{ feature: "form_diff", impact: 0.12 }] },
    });
    const total =
      blended.probabilities.homeWin + blended.probabilities.draw + blended.probabilities.awayWin;
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
    expect(blended.probabilities.over25).toBeGreaterThan(0);
  });

  it("applyRoiCalibrationToAnalysis blocks recommendations with negative historical ROI", () => {
    const base = analyzeFixture(demoFixtures[0]);
    const row = base.valueTable.find((r) => r.market === base.recommendation.market) ?? base.valueTable[0];
    const adjusted = applyRoiCalibrationToAnalysis(base, demoFixtures[0], {
      marketMetrics: {
        key: "WIN_1X2",
        sampleSize: 40,
        hitRate: Math.max(0.1, row.modelProbability / 100 - 0.1),
        totalRoi: -5,
        roiPerUnit: -0.12,
        brier: 0.31,
        logLoss: 0.9,
        avgClvPercent: -2,
        clvSampleSize: 20,
      },
    });

    expect(adjusted.recommendation.market).toBe("Sin valor claro");
    expect(adjusted.recommendation.stakeUnits).toBe(0);
    expect(adjusted.recommendation.rationale).toContain("ROI historico negativo");
    expect(adjusted.advancedModels?.calibration).toBeDefined();
  });

  it("runFullAnalysis never throws and returns analysis", async () => {
    const result = await runFullAnalysis(demoFixtures[0]);
    expect(result.analysis.probabilities.homeWin).toBeGreaterThan(0);
    expect(result.analysis.advancedModels?.halfTime).toBeDefined();
    expect(result.analysisPipeline.layers).toContain("typescript");
    expect(result.analysisPipeline.label).toMatch(/Motor:/);
  }, 15000);
});
