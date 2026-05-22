import { describe, expect, it } from "vitest";
import { bivariatePoissonModel } from "@/backend/lib/analysis/models/bivariate-poisson";
import { temporalBlendModel } from "@/backend/lib/analysis/models/temporal-blend";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

describe("extended models", () => {
  it("bivariate poisson returns normalized 1X2", () => {
    const fixture = demoFixtures[0];
    const result = bivariatePoissonModel(fixture, 1.4, 1.1);
    const total = result.homeWin + result.draw + result.awayWin;
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
    expect(result.kappa).toBeGreaterThan(0);
  });

  it("temporal blend uses 70/30 weights by default", () => {
    const fixture = demoFixtures[0];
    const result = temporalBlendModel(fixture, 1.5, 1.2);
    expect(result.recentWeight).toBe(0.7);
    expect(result.seasonWeight).toBeCloseTo(0.3);
  });
});
