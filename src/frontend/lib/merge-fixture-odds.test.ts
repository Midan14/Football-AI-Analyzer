import { describe, expect, it } from "vitest";
import { mergeOddsIntoFixtures } from "@/frontend/lib/merge-fixture-odds";
import type { Fixture } from "@/shared/domain";

function makeFixture(id: string): Fixture {
  return {
    id,
    countryId: "england",
    leagueId: "39",
    leagueName: "Premier League",
    kickoff: "2026-05-20T18:00:00+00:00",
    elapsed: null,
    status: "pre-match",
    home: { id: "1", name: "Home", form: [], recentMatches: [], goalsFor: 0, goalsAgainst: 0, xgFor: 1, xgAgainst: 1, tablePosition: 1, restDays: 4, travelKm: 0, motivation: 50, keyPlayer: "N/D", keyPlayerStatus: "available", squadRotationRisk: 0, pointsTotal: 0, matchesPlayed: 0 },
    away: { id: "2", name: "Away", form: [], recentMatches: [], goalsFor: 0, goalsAgainst: 0, xgFor: 1, xgAgainst: 1, tablePosition: 2, restDays: 4, travelKm: 0, motivation: 50, keyPlayer: "N/D", keyPlayerStatus: "available", squadRotationRisk: 0, pointsTotal: 0, matchesPlayed: 0 },
    coverage: { tier: "elite", hasLineups: false, hasOdds: false, hasXg: false, hasInjuries: false, hasReferee: false, hasH2H: false, hasMomentum: false },
    market: { homeWinOdds: 0, drawOdds: 0, awayWinOdds: 0, over15Odds: 0, over25Odds: 0, over35Odds: 0, under15Odds: 0, under25Odds: 0, under35Odds: 0, bttsYesOdds: 0, bttsNoOdds: 0, dc1xOdds: 0, dcx2Odds: 0, dc12Odds: 0, ahHomeMinus1: 0, ahAwayPlus1: 0, exactScore: [], firstGoalScorer: [] },
    context: { derby: false, mustWinHome: false, mustWinAway: false, lowDivision: false, weatherRisk: "low", playoff: false, relegationRisk: 0, rivalRivalry: false, copaVsLeague: false, prizeMoney: 0, psychologicalPressure: 0, underdogFreedom: 0, favoriteParalysis: 0 },
  };
}

describe("mergeOddsIntoFixtures", () => {
  it("merges odds from API map into fixtures", () => {
    const fixtures = [makeFixture("100")];
    const merged = mergeOddsIntoFixtures(fixtures, {
      "100": { homeWinOdds: 2.1, drawOdds: 3.4, awayWinOdds: 3.2 },
    });

    expect(merged[0].market.homeWinOdds).toBe(2.1);
    expect(merged[0].coverage.hasOdds).toBe(true);
  });
});
