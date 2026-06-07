import type { Fixture } from "@/shared/domain";

/** Overlay real-time fields from /fixtures?live=all onto the day's fixture list. */
export function mergeLiveIntoFixtures(fixtures: Fixture[], liveFixtures: Fixture[]): Fixture[] {
  if (liveFixtures.length === 0) return fixtures;

  const liveById = new Map(liveFixtures.map((fixture) => [fixture.id, fixture]));
  const merged = fixtures.map((fixture) => {
    const live = liveById.get(fixture.id);
    if (!live) return fixture;

    return {
      ...fixture,
      status: live.status,
      statusShort: live.statusShort ?? fixture.statusShort,
      statusLong: live.statusLong ?? fixture.statusLong,
      elapsed: live.elapsed,
      result: live.result ?? fixture.result,
      market:
        live.market.homeWinOdds > 0
          ? { ...fixture.market, ...live.market }
          : fixture.market,
      coverage: {
        ...fixture.coverage,
        hasOdds: fixture.coverage.hasOdds || live.market.homeWinOdds > 0,
      },
    };
  });

  const seen = new Set(merged.map((fixture) => fixture.id));
  for (const live of liveFixtures) {
    if (live.status === "live" && !seen.has(live.id)) {
      merged.push(live);
      seen.add(live.id);
    }
  }

  return merged;
}
