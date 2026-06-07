import { describe, expect, it } from "vitest";
import { analyzeFixture } from "@/backend/lib/analysis/analysis-engine";
import { applyAnalysisPreferences } from "@/backend/lib/analysis/apply-analysis-preferences";
import { confidenceFromAnalysis, computeDisplayConfidence } from "@/frontend/lib/confidence-display";
import { createTestFixture } from "@/frontend/lib/test-fixture";

describe("confidence display", () => {
  it("reads server-side adjustments from analysis payload", () => {
    const base = analyzeFixture(createTestFixture());
    const adjusted = applyAnalysisPreferences(base, {
      modelMode: "Agresivo",
      scenario: "lineups",
    });
    const display = confidenceFromAnalysis(adjusted, "Agresivo", "lineups");

    expect(display.baseScore).toBe(base.confidence.score);
    expect(display.displayedScore).toBe(adjusted.confidence.score);
    expect(display.isVisualAdjustment).toBe(true);
    expect(display.hint).toContain("Motor");
  });

  it("falls back to local deltas when analysis has no adjustments", () => {
    const result = computeDisplayConfidence(60, "Conservador", "rotation");
    expect(result.displayedScore).toBe(48);
  });
});
