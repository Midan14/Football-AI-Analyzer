import { describe, expect, it } from "vitest";
import type { FixtureMarket } from "@/shared/domain";
import { computeClvPercent } from "@/shared/odds-intelligence";
import {
  buildOddsQualityReport,
  compareBookmakerOdds,
  detectLineMovements,
} from "@/backend/lib/odds/odds-intelligence";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

function sampleMarket(overrides: Partial<FixtureMarket> = {}): FixtureMarket {
  const base = demoFixtures[0].market;
  return { ...base, ...overrides };
}

describe("odds intelligence", () => {
  it("calcula CLV positivo cuando la cuota tomada es mejor que el cierre", () => {
    expect(computeClvPercent(2.1, 2.0)).toBe(5);
  });

  it("detecta spread y outlier entre bookmakers", () => {
    const compare = compareBookmakerOdds("fixture-1", {
      Bet365: sampleMarket({ homeWinOdds: 2.0, drawOdds: 3.4, awayWinOdds: 3.8 }),
      "1xBet": sampleMarket({ homeWinOdds: 2.18, drawOdds: 3.2, awayWinOdds: 3.5 }),
    });

    expect(compare.bookmakers.length).toBe(2);
    expect(compare.rows.length).toBeGreaterThan(0);
    expect(compare.avgSpreadPercent).toBeGreaterThan(0);
  });

  it("genera alertas de line movement entre snapshots", () => {
    const now = new Date();
    const before = new Date(now.getTime() - 60_000);
    const movements = detectLineMovements(
      [
        {
          fixtureId: "f1",
          bookmaker: "Bet365",
          marketKey: "1X2_HOME",
          label: "Local gana",
          odds: 2.0,
          impliedProb: 50,
          capturedAt: before,
        },
        {
          fixtureId: "f1",
          bookmaker: "Bet365",
          marketKey: "1X2_HOME",
          label: "Local gana",
          odds: 2.12,
          impliedProb: 47.2,
          capturedAt: now,
        },
      ],
      5
    );

    expect(movements.length).toBe(1);
    expect(movements[0].movementPercent).toBe(6);
  });

  it("agrega reporte de calidad por liga", () => {
    const fixture = demoFixtures[0];
    const compare = compareBookmakerOdds(fixture.id, {
      Bet365: fixture.market,
      "1xBet": sampleMarket({
        homeWinOdds: fixture.market.homeWinOdds + 0.07,
        over25Odds: fixture.market.over25Odds + 0.05,
      }),
    });

    const report = buildOddsQualityReport("2026-05-22", "league", [{ fixture, compare }]);
    expect(report.buckets.length).toBeGreaterThan(0);
    expect(report.summary.fixturesScanned).toBe(1);
  });
});
