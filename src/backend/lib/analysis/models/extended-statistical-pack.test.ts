import { describe, expect, it } from "vitest";
import { buildExtendedStatisticalPack, halfTimeModel } from "./extended-statistical-pack";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

describe("extended statistical pack", () => {
  it("half-time probabilities sum near 100", () => {
    const fixture = demoFixtures[0];
    const ht = halfTimeModel(fixture, 1.4, 1.1);
    const total = ht.homeWinHT + ht.drawHT + ht.awayWinHT;
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  it("buildExtendedStatisticalPack returns all sections", () => {
    const fixture = demoFixtures[0];
    const pack = buildExtendedStatisticalPack(fixture, 1.5, 1.2, { homeWin: 40, draw: 28, awayWin: 32 });
    expect(pack.cornersEsp.expectedTotalCorners).toBeGreaterThan(0);
    expect(pack.cardsRisk.expectedYellows).toBeGreaterThan(0);
    expect(pack.xgModel.totalXg).toBeGreaterThan(0);
    expect(pack.explainability.topDrivers.length).toBeGreaterThan(0);
  });
});
