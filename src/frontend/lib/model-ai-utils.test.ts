import { describe, expect, it } from "vitest";
import { agreementTone, sortValueTable } from "@/frontend/lib/model-ai-utils";
import type { AnalysisResult } from "@/shared/domain";

const baseAnalysis = {
  valueTable: [
    { market: "Local", modelProbability: 55, marketProbability: 48, edge: 7, verdict: "VALUE" },
    { market: "Empate", modelProbability: 24, marketProbability: 26, edge: -2, verdict: "NO" },
    { market: "Over 2.5", modelProbability: 58, marketProbability: 50, edge: 8, verdict: "VALUE" },
  ],
} as AnalysisResult;

describe("model-ai-utils", () => {
  it("sorts value table by edge descending", () => {
    const rows = sortValueTable(baseAnalysis, 0);
    expect(rows[0]?.market).toBe("Over 2.5");
    expect(rows[0]?.edge).toBe(8);
  });

  it("filters by minimum edge", () => {
    const rows = sortValueTable(baseAnalysis, 4);
    expect(rows).toHaveLength(2);
  });

  it("classifies agreement tone", () => {
    expect(agreementTone(80)).toBe("high");
    expect(agreementTone(60)).toBe("medium");
    expect(agreementTone(40)).toBe("low");
  });
});
