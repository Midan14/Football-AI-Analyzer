import { describe, expect, it } from "vitest";
import {
  applyRoiCalibration,
  backtestChampionChallenger,
  shouldAbstainRecommendation,
  type CalibrationGroupMetrics,
} from "./roi-calibration";

const strongMarket: CalibrationGroupMetrics = {
  key: "WIN_1X2",
  sampleSize: 45,
  hitRate: 0.58,
  totalRoi: 8.4,
  roiPerUnit: 0.12,
  brier: 0.18,
  logLoss: 0.62,
  avgClvPercent: 2.1,
  clvSampleSize: 18,
};

describe("applyRoiCalibration", () => {
  it("adjusts raw probability toward observed hit rate when market sample is usable", () => {
    const calibrated = applyRoiCalibration({
      rawProbability: 70,
      marketKey: "WIN_1X2",
      leagueId: "39",
      marketMetrics: strongMarket,
    });

    expect(calibrated.calibratedProbability).toBeLessThan(70);
    expect(calibrated.calibratedProbability).toBeGreaterThan(58);
    expect(calibrated.source).toBe("market");
    expect(calibrated.sampleSize).toBe(45);
  });

  it("falls back to global metrics and marks low confidence when market sample is thin", () => {
    const calibrated = applyRoiCalibration({
      rawProbability: 62,
      marketKey: "BTTS",
      leagueId: "39",
      marketMetrics: { ...strongMarket, key: "BTTS", sampleSize: 4 },
      globalMetrics: { ...strongMarket, key: "global", hitRate: 0.52, sampleSize: 80 },
    });

    expect(calibrated.source).toBe("global");
    expect(calibrated.reliability).toBe("medium");
    expect(calibrated.reason).toContain("fallback global");
  });
});

describe("shouldAbstainRecommendation", () => {
  it("blocks positive-looking picks when historical ROI is negative", () => {
    const decision = shouldAbstainRecommendation({
      market: "WIN_1X2",
      stakeUnits: 1,
      rawProbability: 68,
      calibratedProbability: 64,
      edge: 7,
      marketMetrics: { ...strongMarket, roiPerUnit: -0.08, sampleSize: 35 },
    });

    expect(decision.abstain).toBe(true);
    expect(decision.reason).toContain("ROI historico negativo");
  });

  it("allows a pick with enough sample, positive ROI, positive CLV, and calibrated edge", () => {
    const decision = shouldAbstainRecommendation({
      market: "WIN_1X2",
      stakeUnits: 0.8,
      rawProbability: 63,
      calibratedProbability: 61,
      edge: 5,
      marketMetrics: strongMarket,
    });

    expect(decision.abstain).toBe(false);
  });
});

describe("backtestChampionChallenger", () => {
  it("rejects a challenger that worsens Brier or ROI", () => {
    const result = backtestChampionChallenger({
      champion: { brier: 0.19, roiPerUnit: 0.06, logLoss: 0.61, sampleSize: 120 },
      challenger: { brier: 0.21, roiPerUnit: 0.08, logLoss: 0.63, sampleSize: 120 },
    });

    expect(result.promote).toBe(false);
    expect(result.reason).toContain("Brier");
  });

  it("promotes a challenger only when calibration and ROI improve", () => {
    const result = backtestChampionChallenger({
      champion: { brier: 0.22, roiPerUnit: 0.03, logLoss: 0.7, sampleSize: 120 },
      challenger: { brier: 0.19, roiPerUnit: 0.07, logLoss: 0.64, sampleSize: 120 },
    });

    expect(result.promote).toBe(true);
  });
});
