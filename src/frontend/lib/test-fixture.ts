import type { Fixture, FixtureCoverage, FixtureMarket, TeamSnapshot } from "@/shared/domain";

const defaultCoverage: FixtureCoverage = {
  tier: "standard",
  hasLineups: false,
  hasOdds: true,
  hasXg: false,
  hasInjuries: false,
  hasReferee: false,
  hasH2H: false,
  hasMomentum: false,
};

const defaultMarket: FixtureMarket = {
  homeWinOdds: 2.1,
  drawOdds: 3.4,
  awayWinOdds: 3.2,
  over15Odds: 1.3,
  over25Odds: 1.9,
  under35Odds: 1.4,
  bttsYesOdds: 1.8,
  bttsNoOdds: 1.95,
  ahHomeMinus1: 3.5,
  ahAwayPlus1: 1.5,
  exactScore: [],
  firstGoalScorer: [],
};

function defaultTeam(id: string, name: string): TeamSnapshot {
  return {
    id,
    name,
    form: ["W", "D", "L", "W", "W"],
    goalsFor: 12,
    goalsAgainst: 8,
    xgFor: 1.4,
    xgAgainst: 1.1,
    tablePosition: 3,
    restDays: 5,
    travelKm: 0,
    motivation: 70,
    keyPlayer: "—",
    keyPlayerStatus: "available",
    squadRotationRisk: 10,
    pointsTotal: 30,
    matchesPlayed: 15,
  };
}

const defaultContext: Fixture["context"] = {
  derby: false,
  mustWinHome: false,
  mustWinAway: false,
  lowDivision: false,
  weatherRisk: "low",
  playoff: false,
  relegationRisk: 0,
  rivalRivalry: false,
  copaVsLeague: false,
  prizeMoney: 0,
  psychologicalPressure: 0,
  underdogFreedom: 0,
  favoriteParalysis: 0,
};

/** Minimal valid fixture for unit tests. */
export function createTestFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "fixture-1",
    countryId: "england",
    leagueId: "premier-league",
    leagueName: "Premier League",
    kickoff: "2026-05-20T18:00:00Z",
    status: "pre-match",
    home: defaultTeam("home-1", "Home FC"),
    away: defaultTeam("away-1", "Away FC"),
    coverage: defaultCoverage,
    market: defaultMarket,
    context: defaultContext,
    ...overrides,
  };
}
