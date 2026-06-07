import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";
import type { FixtureOddsMap } from "@/frontend/lib/merge-fixture-odds";
import { todayIsoDateColombia } from "@/frontend/lib/date-utils";

async function fetchOddsByDate(date: string, leagueId?: string): Promise<FixtureOddsMap> {
  const params = new URLSearchParams({ date });
  if (leagueId) params.set("leagueId", leagueId);
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
  options?: { enabled?: boolean }
) {
  return useQuery<FixtureOddsMap, Error>({
    queryKey: ["odds-by-date", date, leagueId ?? "all"],
    queryFn: () => fetchOddsByDate(date, leagueId),
    enabled: (options?.enabled ?? true) && Boolean(date),
    staleTime: 60_000,
    refetchInterval: date === todayIsoDateColombia() ? 90_000 : false,
    refetchOnMount: "always",
    retry: 2,
    placeholderData: {},
  });
}
