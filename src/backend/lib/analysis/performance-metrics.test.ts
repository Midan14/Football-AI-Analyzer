import { describe, expect, it } from "vitest";
import { computeMetrics } from "./performance-metrics";

const sample = [
  { market: "WIN_1X2", prediction: "HOME_WIN", status: "WON" as const, probability: 65, roi: 1.2, stakeUnits: 1 },
  { market: "WIN_1X2", prediction: "DRAW", status: "LOST" as const, probability: 30, roi: -1, stakeUnits: 1 },
  { market: "WIN_1X2", prediction: "HOME_WIN", status: "WON" as const, probability: 70, roi: 0.9, stakeUnits: 0.75 },
  { market: "OVER_UNDER", prediction: "OVER_2.5", status: "LOST" as const, probability: 55, roi: -0.5, stakeUnits: 0.5 },
  { market: "OVER_UNDER", prediction: "OVER_2.5", status: "WON" as const, probability: 60, roi: 0.4, stakeUnits: 0.5 },
];

describe("computeMetrics", () => {
  it("groups by market and computes hit rate", () => {
    const m = computeMetrics(sample, "market");
    const win1x2 = m.find((g) => g.key === "WIN_1X2")!;
    expect(win1x2.sampleSize).toBe(3);
    expect(win1x2.hitRate).toBeCloseTo(2 / 3, 4);
  });

  it("computes ROI per stake unit", () => {
    const m = computeMetrics(sample, "market");
    const win1x2 = m.find((g) => g.key === "WIN_1X2")!;
    // (1.2 + -1 + 0.9) / (1 + 1 + 0.75) = 1.1 / 2.75
    expect(win1x2.roiPerUnit).toBeCloseTo(0.4, 1);
  });

  it("excludes VOID rows from groups", () => {
    const withVoid = [
      ...sample,
      { market: "WIN_1X2", prediction: "DRAW", status: "VOID" as const, probability: 50, roi: 0, stakeUnits: 1 },
    ];
    const m = computeMetrics(withVoid, "market");
    const win1x2 = m.find((g) => g.key === "WIN_1X2")!;
    expect(win1x2.sampleSize).toBe(3);
  });

  it("returns groups sorted by sample size desc", () => {
    const m = computeMetrics(sample, "market");
    expect(m[0].sampleSize).toBeGreaterThanOrEqual(m[m.length - 1].sampleSize);
  });

  it("Brier score is bounded in [0,1] and lower for accurate calls", () => {
    const m = computeMetrics(sample, "market");
    for (const g of m) {
      expect(g.brier).toBeGreaterThanOrEqual(0);
      expect(g.brier).toBeLessThanOrEqual(1);
    }
  });
});
