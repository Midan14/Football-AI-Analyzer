import { useQuery } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

export type LiveEvent = {
  time: number;
  team: string;
  teamLogo: string;
  player: string;
  type: string;
  detail: string;
};

export type LiveStatistic = {
  type: string;
  home: string;
  away: string;
};

export type LiveMatchDetail = {
  fixture: Fixture & { elapsed?: number; statusShort?: string };
  events: LiveEvent[];
  statistics: LiveStatistic[];
};

async function fetchLiveFixtures(): Promise<Fixture[]> {
  const res = await fetch("/api/live");
  if (!res.ok) throw new Error("Error fetching live fixtures");
  const data = unwrapApiData<{ fixtures: Fixture[]; count: number }>(await res.json());
  return data.fixtures;
}

async function fetchLiveDetail(fixtureId: string): Promise<LiveMatchDetail> {
  const res = await fetch(`/api/live?id=${fixtureId}`);
  if (!res.ok) throw new Error("Error fetching live detail");
  return unwrapApiData<LiveMatchDetail>(await res.json());
}

/**
 * Polls all live fixtures every 30 seconds
 */
export function useLiveFixtures() {
  return useQuery<Fixture[], Error>({
    queryKey: ["live-fixtures"],
    queryFn: fetchLiveFixtures,
    refetchInterval: 30_000, // Poll every 30s
    staleTime: 15_000,
  });
}

/**
 * Polls a specific live fixture every 20 seconds for real-time detail
 */
export function useLiveDetail(fixtureId: string | undefined) {
  return useQuery<LiveMatchDetail, Error>({
    queryKey: ["live-detail", fixtureId],
    queryFn: () => fetchLiveDetail(fixtureId!),
    enabled: Boolean(fixtureId),
    refetchInterval: 20_000, // Poll every 20s
    staleTime: 10_000,
  });
}
