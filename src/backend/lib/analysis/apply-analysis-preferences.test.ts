import { describe, expect, it } from "vitest";
import { analyzeFixture } from "./analysis-engine";
import { applyAnalysisPreferences } from "./apply-analysis-preferences";
import { createTestFixture } from "@/frontend/lib/test-fixture";

describe("applyAnalysisPreferences", () => {
  it("lowers confidence for conservative + rotation scenario", () => {
    const base = analyzeFixture(createTestFixture());
    const adjusted = applyAnalysisPreferences(base, {
      modelMode: "Conservador",
      scenario: "rotation",
    });

    expect(adjusted.confidence.baseScore).toBe(base.confidence.score);
    expect(adjusted.confidence.score).toBe(
      Math.max(0, Math.min(100, base.confidence.score - 3 - 9))
    );
    expect(adjusted.confidence.adjustments?.totalDelta).toBe(-12);
  });

  it("raises confidence for aggressive + lineups scenario", () => {
    const base = analyzeFixture(createTestFixture());
    const adjusted = applyAnalysisPreferences(base, {
      modelMode: "Agresivo",
      scenario: "lineups",
    });

    expect(adjusted.confidence.score).toBe(
      Math.max(0, Math.min(100, base.confidence.score + 2 + 4))
    );
  });
});
