import { describe, expect, it } from "vitest";
import { buildInferredCoverageReport, computeCoverageScore } from "@/backend/lib/leagues/league-confidence";

describe("league-confidence", () => {
  it("scores elite leagues higher than low tiers", () => {
    const elite = computeCoverageScore("elite", {
      fixtures: true,
      standings: true,
      odds: true,
      lineups: true,
      xg: true,
      injuries: true,
      referee: true,
      h2h: true,
      momentum: true,
    });
    const low = computeCoverageScore("low", {
      fixtures: true,
      standings: false,
      odds: false,
      lineups: false,
      xg: false,
      injuries: false,
      referee: true,
      h2h: false,
      momentum: false,
    });
    expect(elite).toBeGreaterThan(low);
  });

  it("builds a readable confidence impact", () => {
    const report = buildInferredCoverageReport({
      leagueId: "1",
      leagueName: "Test League",
      tier: "standard",
      provider: "demo",
      season: "2026",
    });
    expect(report.confidenceImpact.length).toBeGreaterThan(10);
    expect(report.capabilities.fixtures).toBe(true);
  });
});
