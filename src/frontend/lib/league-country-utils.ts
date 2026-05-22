import type { Fixture, League } from "@/shared/domain";
import { buildDashboardUrl } from "@/frontend/lib/calendar-export";

export type LeagueSortKey = "name" | "coverageScore" | "fixturesToday";

export type LeagueWindowMode = "day" | "week";

export function buildLeagueCountryShareUrl(params: {
  countryId?: string;
  leagueId?: string;
  date?: string;
}): string {
  return buildDashboardUrl({
    view: "Ligas y Países",
    countryId: params.countryId,
    leagueId: params.leagueId,
    date: params.date,
  });
}

export function flattenRangeFixtures(
  fixturesByDate: Record<string, Fixture[]> | undefined
): Fixture[] {
  if (!fixturesByDate) return [];
  return Object.entries(fixturesByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, rows]) => rows);
}

export function fixturesForLeagueOnDate(fixtures: Fixture[], leagueId: string, date: string): Fixture[] {
  return fixtures.filter(
    (fixture) => fixture.leagueId === leagueId && fixture.kickoff.slice(0, 10) === date
  );
}

export function findNextLeagueFixture(fixtures: Fixture[], leagueId: string, afterDate: string): Fixture | null {
  const upcoming = fixtures
    .filter((fixture) => fixture.leagueId === leagueId && fixture.kickoff.slice(0, 10) >= afterDate)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return upcoming[0] ?? null;
}

export function countEdgeFixtures(
  fixtures: Fixture[],
  hints: Record<string, { hasValue?: boolean; hasMlSignal?: boolean }>
): number {
  return fixtures.filter((fixture) => {
    const hint = hints[fixture.id];
    return Boolean(hint?.hasValue || hint?.hasMlSignal);
  }).length;
}

export function sortLeagues(
  leagues: League[],
  sortKey: LeagueSortKey,
  fixtureCountByLeague: Map<string, number>
): League[] {
  const copy = [...leagues];
  copy.sort((a, b) => {
    if (sortKey === "coverageScore") return b.coverageScore - a.coverageScore;
    if (sortKey === "fixturesToday") {
      return (fixtureCountByLeague.get(b.id) ?? 0) - (fixtureCountByLeague.get(a.id) ?? 0);
    }
    return a.name.localeCompare(b.name, "es");
  });
  return copy;
}

export function groupCountriesByRegion(countries: Array<{ region: string }>): string[] {
  const regions = new Set(countries.map((country) => country.region || "Global"));
  return Array.from(regions).sort((a, b) => a.localeCompare(b, "es"));
}

export type LeagueCompareRow = {
  id: string;
  name: string;
  tier: League["tier"];
  coverageScore: number;
  fixturesToday: number;
  withOddsPct: number;
};

export function buildLeagueCompareRows(
  leagues: League[],
  statsByLeague: Map<string, { fixturesToday: number; withOddsPct: number }>
): LeagueCompareRow[] {
  return leagues.map((league) => {
    const stats = statsByLeague.get(league.id);
    return {
      id: league.id,
      name: league.name,
      tier: league.tier,
      coverageScore: league.coverageScore,
      fixturesToday: stats?.fixturesToday ?? 0,
      withOddsPct: stats?.withOddsPct ?? 0,
    };
  });
}
