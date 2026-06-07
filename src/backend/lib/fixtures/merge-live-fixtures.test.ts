import { describe, expect, it } from "vitest";
import type { Fixture } from "@/shared/domain";
import { mergeLiveIntoFixtures } from "@/backend/lib/fixtures/merge-live-fixtures";

const baseFixture = (id: string, status: Fixture["status"] = "pre-match"): Fixture =>
  ({
    id,
    countryId: "england",
    leagueId: "39",
    leagueName: "Premier League",
    kickoff: "2026-05-23T15:00:00Z",
    status,
    home: { id: "1", name: "Home", form: [], goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0, tablePosition: 1, restDays: 3, travelKm: 0, motivation: 50, keyPlayer: "A", keyPlayerStatus: "available", squadRotationRisk: 0, pointsTotal: 0, matchesPlayed: 0 },
    away: { id: "2", name: "Away", form: [], goalsFor: 0, goalsAgainst: 0, xgFor: 0, xgAgainst: 0, tablePosition: 2, restDays: 3, travelKm: 0, motivation: 50, keyPlayer: "B", keyPlayerStatus: "available", squadRotationRisk: 0, pointsTotal: 0, matchesPlayed: 0 },
    coverage: { tier: "elite", hasLineups: false, hasOdds: false, hasXg: false, hasInjuries: false, hasReferee: false, hasH2H: false, hasMomentum: false },
    market: { homeWinOdds: 0, drawOdds: 0, awayWinOdds: 0, over15Odds: 0, over25Odds: 0, over35Odds: 0, under15Odds: 0, under25Odds: 0, under35Odds: 0, bttsYesOdds: 0, bttsNoOdds: 0, ahHomeMinus1: 0, ahAwayPlus1: 0, exactScore: [], firstGoalScorer: [] },
    context: { derby: false, mustWinHome: false, mustWinAway: false, lowDivision: false, weatherRisk: "low", playoff: false, relegationRisk: 0, rivalRivalry: false, copaVsLeague: false, prizeMoney: 0, psychologicalPressure: 30, underdogFreedom: 40, favoriteParalysis: 20 },
  }) as Fixture;

describe("mergeLiveIntoFixtures", () => {
  it("marks live status and score from API live feed", () => {
    const day = [baseFixture("100")];
    const live = [
      {
        ...baseFixture("100", "live"),
        elapsed: 67,
        result: { homeGoals: 2, awayGoals: 1, bttsActual: true, totalGoals: 3, firstHalfHome: 1, firstHalfAway: 0 },
      },
    ];

    const merged = mergeLiveIntoFixtures(day, live);
    expect(merged[0].status).toBe("live");
    expect(merged[0].elapsed).toBe(67);
    expect(merged[0].result?.homeGoals).toBe(2);
  });
});
