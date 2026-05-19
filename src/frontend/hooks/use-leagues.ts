import { useQuery } from "@tanstack/react-query";
import type { League } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

async function fetchLeagues(countryId?: string): Promise<League[]> {
  const query = countryId ? `?countryId=${encodeURIComponent(countryId)}` : "";
  const response = await fetch(`/api/leagues${query}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al cargar ligas" }));
    throw new Error(error.error ?? `Error ${response.status}`);
  }
  const data = unwrapApiData(await response.json() as { leagues: League[] });
  return data.leagues;
}

export function useLeagues(countryId?: string, options?: { enabled?: boolean }) {
  return useQuery<League[], Error>({
    queryKey: ["leagues", countryId ?? "all"],
    queryFn: () => fetchLeagues(countryId),
    enabled: options?.enabled ?? true,
  });
}
