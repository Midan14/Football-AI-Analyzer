import type { League } from "@/shared/domain";
import { pickSeasonYearFromLeagueDetail } from "@/backend/lib/providers/api-football-season";

export type LeagueCategory = "men" | "women" | "youth" | "reserve" | "cup" | "other";

type ApiFootballLeagueRow = {
  league: {
    id: number;
    name: string;
    type?: string;
    logo?: string;
  };
  country: {
    name: string;
  };
  seasons?: Array<{
    year: number;
    start?: string;
    end?: string;
    current?: boolean;
  }>;
};

export function inferLeagueCategory(name: string, type?: string): LeagueCategory {
  const normalized = name.toLowerCase();
  if (type === "Cup" || normalized.includes("copa ") || normalized.endsWith(" cup")) {
    return "cup";
  }
  if (
    /women|woman|femenil|femenina|femenino|feminin|féminin|femmes|damas|ladies|\bwsl\b|\bnwsl\b|\(w\)/i.test(
      name
    )
  ) {
    return "women";
  }
  if (/u\d{2}|u-\d{2}|under \d{2}|youth|junior|juvenil|primavera|academy/i.test(name)) {
    return "youth";
  }
  if (/reserve|reserves|filial|b team|segunda reserva|development/i.test(name)) {
    return "reserve";
  }
  if (type === "League") return "men";
  return "other";
}

/** Season years to query when listing leagues globally (no country filter).
 *
 * Anchored on the current CALENDAR year so the catalog reflects the latest
 * published season (e.g. 2026), not the European season label which lags to the
 * previous year during the May–July off-season. Prior years are still queried so
 * leagues whose new season is not published yet remain visible — `mergeLeagueCatalogRows`
 * keeps the first (newest) occurrence. */
export function leagueCatalogSeasonCandidates(date = new Date(), _countryId?: string): number[] {
  const calendarYear = date.getFullYear();
  return [calendarYear, calendarYear - 1, calendarYear - 2];
}

export function isSupportedLeagueType(type?: string): boolean {
  return type === "League" || type === "Cup";
}

export function mapApiFootballLeagueRow(
  item: ApiFootballLeagueRow,
  countryId: string | undefined,
  determineTier: (name: string) => League["tier"]
): League {
  const resolvedCountryId = countryId ?? slugCountryId(item.country.name);
  const tier = determineTier(item.league.name);
  const category = inferLeagueCategory(item.league.name, item.league.type);
  const seasonYear = pickSeasonYearFromLeagueDetail(
    item,
    new Date(),
    countryId ?? item.country.name
  );

  return {
    id: String(item.league.id),
    countryId: resolvedCountryId,
    name: item.league.name,
    tier,
    season: String(seasonYear),
    category,
    coverageScore: tier === "elite" ? 90 : tier === "standard" ? 72 : 55,
    logo: item.league.logo ?? undefined,
  };
}

export function mergeLeagueCatalogRows<T extends { league: { id: number } }>(
  target: Map<number, T>,
  rows: T[]
): void {
  for (const row of rows) {
    if (!target.has(row.league.id)) {
      target.set(row.league.id, row);
    }
  }
}

function slugCountryId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
