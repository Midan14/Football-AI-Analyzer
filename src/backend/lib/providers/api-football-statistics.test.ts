import { describe, expect, it } from "vitest";
import {
  applyRollingMetricsToTeam,
  enrichRecentMatchWithTeamStats,
  parseFixtureStatisticsResponse,
  parseTeamStatisticsBlock,
  recentMatchesHaveRealXg,
} from "@/backend/lib/providers/api-football-statistics";
import type { TeamRecentMatch, TeamSnapshot } from "@/shared/domain";

describe("api-football-statistics", () => {
  it("parses xG, possession, corners and shots on target from API rows", () => {
    const parsed = parseTeamStatisticsBlock([
      { type: "Expected Goals", value: "1.42" },
      { type: "Ball Possession", value: "58%" },
      { type: "Corner Kicks", value: 7 },
      { type: "Shots on Goal", value: "5" },
    ]);
    expect(parsed).toEqual({
      expectedGoals: 1.42,
      possessionPct: 58,
      corners: 7,
      shotsOnTarget: 5,
    });
  });

  it("enriches recent match with both sides xG from fixture statistics", () => {
    const base: TeamRecentMatch = {
      date: "2025-01-01",
      fixtureId: "99",
      homeTeamId: "1",
      awayTeamId: "2",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      homeGoals: 2,
      awayGoals: 1,
      result: "W",
    };
    const sides = parseFixtureStatisticsResponse([
      {
        team: { id: 1 },
        statistics: [
          { type: "Expected Goals", value: 2.1 },
          { type: "Ball Possession", value: "62%" },
        ],
      },
      {
        team: { id: 2 },
        statistics: [{ type: "Expected Goals", value: 0.9 }],
      },
    ]);
    const enriched = enrichRecentMatchWithTeamStats(base, 1, sides);
    expect(enriched.homeXg).toBe(2.1);
    expect(enriched.awayXg).toBe(0.9);
    expect(enriched.teamPossession).toBe(62);
    expect(enriched.statsSource).toBe("api-football");
  });

  it("rolls tactical and xG metrics onto team snapshot from real recent matches", () => {
    const team: TeamSnapshot = {
      id: "1",
      name: "Home FC",
      form: ["W", "D", "L", "W", "W"],
      goalsFor: 30,
      goalsAgainst: 20,
      matchesPlayed: 10,
      xgFor: 0,
      xgAgainst: 0,
      pointsTotal: 20,
      tablePosition: 5,
      motivation: 70,
      restDays: 5,
      travelKm: 0,
      keyPlayer: "Striker",
      keyPlayerStatus: "available",
      squadRotationRisk: 10,
    };
    const recent: TeamRecentMatch[] = [
      {
        date: "2025-01-01",
        fixtureId: "1",
        homeTeamId: "1",
        awayTeamId: "2",
        homeTeam: "Home FC",
        awayTeam: "Away FC",
        homeGoals: 2,
        awayGoals: 0,
        result: "W",
        homeXg: 2.0,
        awayXg: 0.5,
        teamPossession: 60,
        teamCorners: 6,
        teamShotsOnTarget: 5,
        statsSource: "api-football",
      },
      {
        date: "2025-01-08",
        fixtureId: "2",
        homeTeamId: "3",
        awayTeamId: "1",
        homeTeam: "Other FC",
        awayTeam: "Home FC",
        homeGoals: 1,
        awayGoals: 1,
        result: "D",
        homeXg: 1.2,
        awayXg: 1.4,
        teamPossession: 48,
        teamCorners: 4,
        teamShotsOnTarget: 3,
        statsSource: "api-football",
      },
    ];
    const updated = applyRollingMetricsToTeam(team, 1, recent);
    expect(updated.tacticalStatsSource).toBe("api-football");
    expect(updated.xgSource).toBe("api-football");
    expect(updated.possessionAvg).toBe(54);
    expect(updated.cornersAvg).toBe(5);
    expect(updated.shotsOnTargetAvg).toBe(4);
    expect(updated.xgFor).toBe(17);
    expect(updated.xgAgainst).toBe(8.5);
    expect(recentMatchesHaveRealXg(recent)).toBe(true);
  });
});
