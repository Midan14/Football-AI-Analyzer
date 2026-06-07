"use client";

import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";

export type FixtureEdgeHint = {
  edge: number;
  market: string;
  hasValue: boolean;
  hasMlSignal: boolean;
};

type EdgeHintsResponse = {
  date: string;
  hints: Record<string, FixtureEdgeHint>;
  count: number;
};

async function fetchFixtureEdgeHints(params: {
  date: string;
  leagueId?: string;
  countryId?: string;
}): Promise<EdgeHintsResponse> {
  const search = new URLSearchParams({ date: params.date });
  if (params.leagueId) search.set("leagueId", params.leagueId);
  if (params.countryId) search.set("countryId", params.countryId);

  const response = await fetch(`/api/fixtures/edge-hints?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`Error al cargar edge hints (${response.status})`);
  }
  return unwrapApiData(await response.json() as EdgeHintsResponse);
}

export function useFixtureEdgeHints(
  date: string,
  options?: { leagueId?: string; countryId?: string; enabled?: boolean }
) {
  return useQuery<EdgeHintsResponse, Error>({
    queryKey: [
      "fixture-edge-hints",
      date,
      options?.leagueId ?? "all",
      options?.countryId ?? "all",
    ],
    queryFn: () =>
      fetchFixtureEdgeHints({
        date,
        leagueId: options?.leagueId,
        countryId: options?.countryId,
      }),
    enabled: (options?.enabled ?? true) && Boolean(date),
    staleTime: 10 * 60_000,
    gcTime: 15 * 60_000,
  });
}
