import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";
import type { FixtureOddsMap } from "@/frontend/lib/merge-fixture-odds";

async function fetchOddsByDate(
  date: string,
  leagueId?: string,
  fixtureIds?: string[]
): Promise<FixtureOddsMap> {
  const params = new URLSearchParams({ date });
  if (leagueId) params.set("leagueId", leagueId);
  if (fixtureIds && fixtureIds.length > 0) {
    params.set("fixtureIds", fixtureIds.join(","));
  }
  const response = await fetch(`/api/odds/by-date?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Error al cargar odds (${response.status})`);
  }
  const data = unwrapApiData(await response.json() as { odds: FixtureOddsMap; count: number });
  return data.odds ?? {};
}

export function useOddsByDate(
  date: string,
  leagueId?: string,
  options?: { enabled?: boolean; fixtureIds?: string[] }
) {
  const fixtureIds = options?.fixtureIds;
  const fixtureKey = fixtureIds?.length ? fixtureIds.join(",") : "";

  return useQuery<FixtureOddsMap, Error>({
    queryKey: ["odds-by-date", date, leagueId ?? "all", fixtureKey],
    queryFn: () => fetchOddsByDate(date, leagueId, fixtureIds),
    enabled: (options?.enabled ?? true) && Boolean(date),
    staleTime: 60_000,
    refetchOnMount: "always",
    retry: 1,
    placeholderData: {},
  });
}
