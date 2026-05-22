import type { Fixture } from "@/shared/domain";

/** Max fixtures to analyze in batch scans (summary, opportunities). */
export const FIXTURE_SCAN_BATCH_SIZE = 12;

/**
 * Prioritize watchlist, then fixtures with odds (elite leagues first), then rest of the day.
 */
export function pickFixtureScanCandidates(
  fixtures: Fixture[],
  watchlistIds: Set<string>,
  maxScan = FIXTURE_SCAN_BATCH_SIZE
): Fixture[] {
  const onDate = fixtures.filter((f) => f.status !== "final");
  const watchlist = onDate.filter((f) => watchlistIds.has(f.id));
  const withOdds = onDate.filter((f) => f.market.homeWinOdds > 0);
  const tierRank = (f: Fixture) =>
    f.coverage.tier === "elite" ? 0 : f.coverage.tier === "standard" ? 1 : 2;

  const ordered = [...watchlist];
  const seen = new Set(ordered.map((f) => f.id));

  for (const fixture of withOdds.sort((a, b) => tierRank(a) - tierRank(b))) {
    if (seen.has(fixture.id)) continue;
    ordered.push(fixture);
    seen.add(fixture.id);
    if (ordered.length >= maxScan * 2) break;
  }

  for (const fixture of onDate) {
    if (seen.has(fixture.id)) continue;
    ordered.push(fixture);
    seen.add(fixture.id);
    if (ordered.length >= maxScan * 2) break;
  }

  return ordered.slice(0, maxScan);
}
