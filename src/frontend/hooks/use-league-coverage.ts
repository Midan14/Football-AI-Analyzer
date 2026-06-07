"use client";

import { useQuery } from "@tanstack/react-query";
import type { LeagueCoverageReport } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

async function fetchLeagueCoverage(leagueId: string, countryId?: string): Promise<LeagueCoverageReport> {
  const search = countryId ? `?countryId=${encodeURIComponent(countryId)}` : "";
  const response = await fetch(`/api/leagues/${encodeURIComponent(leagueId)}/coverage${search}`);
  if (!response.ok) {
    throw new Error(`Error al cargar cobertura (${response.status})`);
  }
  return unwrapApiData(await response.json() as LeagueCoverageReport);
}

export function useLeagueCoverage(
  leagueId: string | undefined,
  options?: { countryId?: string; enabled?: boolean }
) {
  return useQuery<LeagueCoverageReport, Error>({
    queryKey: ["league-coverage", leagueId, options?.countryId ?? "all"],
    queryFn: () => fetchLeagueCoverage(leagueId!, options?.countryId),
    enabled: (options?.enabled ?? true) && Boolean(leagueId),
    staleTime: 10 * 60_000,
  });
}
