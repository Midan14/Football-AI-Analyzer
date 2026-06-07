import { useQuery } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

async function fetchFixtureById(fixtureId: string): Promise<Fixture> {
  const response = await fetch(`/api/match/${encodeURIComponent(fixtureId)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "No se pudo cargar el partido" }));
    throw new Error(error.error ?? `Error ${response.status}`);
  }
  return unwrapApiData<Fixture>(await response.json());
}

/** Loads a fixture by ID when it is not in the current day's filtered list. */
export function useFixtureById(fixtureId: string, enabled: boolean) {
  return useQuery<Fixture, Error>({
    queryKey: ["fixture", fixtureId],
    queryFn: () => fetchFixtureById(fixtureId),
    enabled: enabled && Boolean(fixtureId),
    staleTime: 60_000,
  });
}
