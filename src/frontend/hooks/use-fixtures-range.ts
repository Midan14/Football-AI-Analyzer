import { useQuery } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

export type FixturesRangeResponse = {
  from: string;
  to: string;
  counts: Record<string, number>;
  fixturesByDate?: Record<string, Fixture[]>;
  totalFixtures: number;
};

export async function fetchFixturesRange(params: {
  from: string;
  to: string;
  leagueId?: string;
  countryId?: string;
  includeFixtures?: boolean;
}): Promise<FixturesRangeResponse> {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.leagueId) search.set("leagueId", params.leagueId);
  if (params.countryId) search.set("countryId", params.countryId);
  if (params.includeFixtures) search.set("includeFixtures", "true");

  const response = await fetch(`/api/fixtures/range?${search.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al cargar rango" }));
    throw new Error(error.error?.message ?? error.error ?? `Error ${response.status}`);
  }
  return unwrapApiData(await response.json() as FixturesRangeResponse);
}

export function useFixturesRange(
  from: string,
  to: string,
  options?: {
    leagueId?: string;
    countryId?: string;
    includeFixtures?: boolean;
    enabled?: boolean;
  }
) {
  return useQuery<FixturesRangeResponse, Error>({
    queryKey: [
      "fixtures-range",
      from,
      to,
      options?.leagueId ?? "all",
      options?.countryId ?? "all",
      options?.includeFixtures ?? false,
    ],
    queryFn: () =>
      fetchFixturesRange({
        from,
        to,
        leagueId: options?.leagueId,
        countryId: options?.countryId,
        includeFixtures: options?.includeFixtures,
      }),
    enabled: (options?.enabled ?? true) && Boolean(from && to),
    staleTime: options?.includeFixtures ? 30_000 : 120_000,
  });
}
