import { useQuery } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";
import { todayIsoDateColombia } from "@/frontend/lib/date-utils";

export async function fetchFixturesWithMeta(
  leagueId: string | undefined,
  date: string
): Promise<{ fixtures: Fixture[]; dataSource?: string }> {
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  params.set("date", date);
  const response = await fetch(`/api/fixtures?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al cargar partidos" }));
    throw new Error(error.error ?? `Error ${response.status}`);
  }
  const data = unwrapApiData(await response.json() as { fixtures: Fixture[]; dataSource?: string });
  return data;
}

export async function fetchFixtures(leagueId: string | undefined, date: string): Promise<Fixture[]> {
  const result = await fetchFixturesWithMeta(leagueId, date);
  return result.fixtures;
}

export function useFixtures(
  leagueId: string | undefined,
  date: string,
  options?: { enabled?: boolean }
) {
  const isToday = date === todayIsoDateColombia();

  const query = useQuery<{ fixtures: Fixture[]; dataSource?: string }, Error>({
    queryKey: ["fixtures", "v2", leagueId ?? "all", date],
    queryFn: () => fetchFixturesWithMeta(leagueId, date),
    enabled: options?.enabled ?? true,
    refetchInterval: (q) => {
      const fixtures = q.state.data?.fixtures;
      const hasLive = fixtures?.some((fixture) => fixture.status === "live");
      if (hasLive) return 10_000;
      if (isToday) return 30_000;
      return false;
    },
    refetchIntervalInBackground: true,
    staleTime: isToday ? 8_000 : 5 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    data: query.data?.fixtures,
    dataSource: query.data?.dataSource,
  };
}
