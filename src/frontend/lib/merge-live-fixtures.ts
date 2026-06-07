import type { Fixture } from "@/shared/domain";

/** Overlay real-time fields from /api/live onto the day's fixture list. */
export function mergeLiveIntoFixtures(fixtures: Fixture[], liveFixtures: Fixture[]): Fixture[] {
  if (liveFixtures.length === 0) return fixtures;

  const liveById = new Map(liveFixtures.map((fixture) => [fixture.id, fixture]));
  const merged = fixtures.map((fixture) => {
    const live = liveById.get(fixture.id);
    if (!live) return fixture;

    return {
      ...fixture,
      status: live.status,
      elapsed: live.elapsed,
      result: live.result ?? fixture.result,
      market:
        live.market.homeWinOdds > 0
          ? { ...fixture.market, ...live.market }
          : fixture.market,
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

export function hasLiveFixtures(fixtures: Fixture[]): boolean {
  return fixtures.some((fixture) => fixture.status === "live");
}
