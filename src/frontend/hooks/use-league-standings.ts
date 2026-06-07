"use client";

import { useQuery } from "@tanstack/react-query";
import type { LeagueSeasonStats, LeagueStandingRow } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

type StandingsResponse = {
  leagueId: string;
  rows: LeagueStandingRow[];
  count: number;
};

async function fetchLeagueStandings(
  leagueId: string,
  countryId?: string,
  limit = 5
): Promise<StandingsResponse> {
  const search = new URLSearchParams({ limit: String(limit) });
  if (countryId) search.set("countryId", countryId);
  const response = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/standings?${search.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Error al cargar tabla (${response.status})`);
  }
  return unwrapApiData(await response.json() as StandingsResponse);
}

export function useLeagueStandings(
  leagueId: string | undefined,
  options?: { countryId?: string; limit?: number; enabled?: boolean }
) {
  return useQuery<StandingsResponse, Error>({
    queryKey: ["league-standings", leagueId, options?.countryId ?? "all", options?.limit ?? 5],
    queryFn: () => fetchLeagueStandings(leagueId!, options?.countryId, options?.limit ?? 5),
    enabled: (options?.enabled ?? true) && Boolean(leagueId),
    staleTime: 15 * 60_000,
  });
}

async function fetchLeagueStats(
  leagueId: string,
  date: string,
  windowDays = 14
): Promise<LeagueSeasonStats> {
  const search = new URLSearchParams({ date, windowDays: String(windowDays) });
  const response = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/stats?${search.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Error al cargar stats (${response.status})`);
  }
  return unwrapApiData(await response.json() as LeagueSeasonStats);
}

export function useLeagueSeasonStats(
  leagueId: string | undefined,
  date: string,
  options?: { windowDays?: number; enabled?: boolean }
) {
  return useQuery<LeagueSeasonStats, Error>({
    queryKey: ["league-stats", leagueId, date, options?.windowDays ?? 14],
    queryFn: () => fetchLeagueStats(leagueId!, date, options?.windowDays ?? 14),
    enabled: (options?.enabled ?? true) && Boolean(leagueId && date),
    staleTime: 10 * 60_000,
  });
}
