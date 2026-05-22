import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  CONFIDENCE_CAPS,
  computeConfidence,
  computeStakeUnits,
  clampConfidenceForSample,
  floorBlackSwanProb,
} from "./risk-policy";

describe("risk-policy", () => {
  it("subtracts penalties from base confidence", () => {
    expect(computeConfidence([{ id: "a", label: "x", points: 10 }])).toBe(68);
  });

  it("clamps confidence to the policy floor", () => {
    const big = [{ id: "a", label: "x", points: 999 }];
    expect(computeConfidence(big)).toBe(DEFAULT_POLICY.confidenceFloor);
  });

  it("returns zero confidence loss when there are no penalties", () => {
    expect(computeConfidence([])).toBe(DEFAULT_POLICY.baseConfidence);
  });

  it("maps confidence to stake bands", () => {
    expect(computeStakeUnits(82)).toBe(0.5);
    expect(computeStakeUnits(80)).toBe(0.5);
    expect(computeStakeUnits(79)).toBe(0.25);
    expect(computeStakeUnits(70)).toBe(0.25);
    expect(computeStakeUnits(69)).toBe(0);
    expect(computeStakeUnits(0)).toBe(0);
  });

  it("caps confidence at 70 when either team has <30 matches", () => {
    expect(clampConfidenceForSample(82, 25, 50)).toBe(CONFIDENCE_CAPS.lowSampleMaxConfidence);
    expect(clampConfidenceForSample(82, 50, 25)).toBe(CONFIDENCE_CAPS.lowSampleMaxConfidence);
    expect(clampConfidenceForSample(60, 25, 50)).toBe(60);
    expect(clampConfidenceForSample(85, 30, 50)).toBe(85); // above threshold passes clean
  });

  it("enforces black-swan floor of 8%", () => {
    expect(floorBlackSwanProb(0)).toBe(CONFIDENCE_CAPS.blackSwanFloorPct);
    expect(floorBlackSwanProb(5)).toBe(CONFIDENCE_CAPS.blackSwanFloorPct);
    expect(floorBlackSwanProb(20)).toBe(20);
  });

  it("policy bands are sorted descending by minScore (invariant)", () => {
    const scores = DEFAULT_POLICY.stakeBands.map((b) => b.minScore);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });
});
