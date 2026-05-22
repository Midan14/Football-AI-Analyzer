import type { Fixture } from "@/shared/domain";
import { buildDashboardUrl, mergeDashboardUrl } from "@/frontend/lib/calendar-export";

export type LiveSortKey = "minute" | "league" | "favorites";

export type LiveFilterState = {
  countryId: string;
  leagueId: string;
  query: string;
  favoritesOnly: boolean;
  sortKey: LiveSortKey;
};

export function formatLiveStatus(fixture: Fixture): string {
  const elapsed = fixture.elapsed ?? null;
  if (elapsed === null) return "LIVE";
  if (elapsed <= 45) return `${elapsed}' · 1T`;
  if (elapsed === 46) return "HT";
  if (elapsed <= 90) return `${elapsed}' · 2T`;
  return `${elapsed}' · ET`;
}

export function filterLiveFixtures(fixtures: Fixture[], filters: LiveFilterState, favoriteTeamIds: string[]): Fixture[] {
  return fixtures.filter((fixture) => {
    if (filters.countryId && fixture.countryId !== filters.countryId) return false;
    if (filters.leagueId && fixture.leagueId !== filters.leagueId) return false;
    if (filters.favoritesOnly) {
      const favorite =
        favoriteTeamIds.includes(fixture.home.id) || favoriteTeamIds.includes(fixture.away.id);
      if (!favorite) return false;
    }
    if (!filters.query.trim()) return true;
    const q = filters.query.toLowerCase();
    return (
      fixture.home.name.toLowerCase().includes(q) ||
      fixture.away.name.toLowerCase().includes(q) ||
      fixture.leagueName.toLowerCase().includes(q)
    );
  });
}

export function sortLiveFixtures(
  fixtures: Fixture[],
  sortKey: LiveSortKey,
  favoriteTeamIds: string[]
): Fixture[] {
  const copy = [...fixtures];
  copy.sort((a, b) => {
    if (sortKey === "minute") {
      return (b.elapsed ?? 0) - (a.elapsed ?? 0);
    }
    if (sortKey === "favorites") {
      const favA =
        favoriteTeamIds.includes(a.home.id) || favoriteTeamIds.includes(a.away.id) ? 1 : 0;
      const favB =
        favoriteTeamIds.includes(b.home.id) || favoriteTeamIds.includes(b.away.id) ? 1 : 0;
      if (favA !== favB) return favB - favA;
      return (b.elapsed ?? 0) - (a.elapsed ?? 0);
    }
    return a.leagueName.localeCompare(b.leagueName, "es");
  });
  return copy;
}

export function groupLiveByLeague(fixtures: Fixture[]): Array<[string, { leagueName: string; leagueLogo?: string; fixtures: Fixture[] }]> {
  const map = new Map<string, { leagueName: string; leagueLogo?: string; fixtures: Fixture[] }>();
  for (const fixture of fixtures) {
    const group = map.get(fixture.leagueId) ?? {
      leagueName: fixture.leagueName,
      leagueLogo: fixture.leagueLogo,
      fixtures: [],
    };
    group.fixtures.push(fixture);
    map.set(fixture.leagueId, group);
  }
  return Array.from(map.entries()).sort((a, b) => a[1].leagueName.localeCompare(b[1].leagueName, "es"));
}

export function parseStatNumber(value: string): number {
  const normalized = value.replace("%", "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildLiveShareUrl(params: {
  date?: string;
  fixtureId?: string;
  countryId?: string;
  leagueId?: string;
}): string {
  return buildDashboardUrl({
    view: "Partidos en Vivo",
    date: params.date,
    fixtureId: params.fixtureId,
    countryId: params.countryId,
    leagueId: params.leagueId,
  });
}

export function syncLiveUrl(params: {
  date?: string;
  fixtureId?: string;
  countryId?: string;
  leagueId?: string;
}): void {
  mergeDashboardUrl({
    view: "Partidos en Vivo",
    date: params.date,
    fixtureId: params.fixtureId,
    countryId: params.countryId,
    leagueId: params.leagueId,
  });
}

export function pickStartingSoon(fixtures: Fixture[], withinMinutes = 120): Fixture[] {
  const now = Date.now();
  const horizon = now + withinMinutes * 60_000;
  return fixtures
    .filter((fixture) => fixture.status === "pre-match")
    .filter((fixture) => {
      const kickoff = new Date(fixture.kickoff).getTime();
      return kickoff >= now - 15 * 60_000 && kickoff <= horizon;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
