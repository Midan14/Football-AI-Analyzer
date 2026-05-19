import { useQuery } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

async function fetchFixtures(leagueId: string | undefined, date: string): Promise<Fixture[]> {
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  params.set("date", date);
  const response = await fetch(`/api/fixtures?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al cargar partidos" }));
    throw new Error(error.error ?? `Error ${response.status}`);
  }
  const data = unwrapApiData(await response.json() as { fixtures: Fixture[] });
  return data.fixtures;
}

export function useFixtures(leagueId: string | undefined, date: string, options?: { enabled?: boolean }) {
  return useQuery<Fixture[], Error>({
    queryKey: ["fixtures", leagueId ?? "all", date],
    queryFn: () => fetchFixtures(leagueId, date),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000, // Refresh every 30 seconds for live scores
    staleTime: 15_000,
  });
}
