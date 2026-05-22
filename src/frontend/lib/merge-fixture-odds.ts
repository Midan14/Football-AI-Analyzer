import type { Fixture, FixtureMarket } from "@/shared/domain";

export type FixtureOddsMap = Record<string, Partial<FixtureMarket>>;

export function mergeOddsIntoFixtures(fixtures: Fixture[], oddsByFixtureId: FixtureOddsMap): Fixture[] {
  if (!oddsByFixtureId || Object.keys(oddsByFixtureId).length === 0) return fixtures;

  return fixtures.map((fixture) => {
    const odds = oddsByFixtureId[fixture.id];
    if (!odds?.homeWinOdds || odds.homeWinOdds <= 0) return fixture;

    return {
      ...fixture,
      market: { ...fixture.market, ...odds },
      coverage: { ...fixture.coverage, hasOdds: true },
    };
  });
}
