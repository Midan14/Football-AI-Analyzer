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
  fixture: Fixture;
  events: LiveEvent[];
  statistics: LiveStatistic[];
};

type LiveFixturesPayload = {
  fixtures: Fixture[];
  count: number;
  provider: string;
};

async function fetchLiveFixtures(): Promise<LiveFixturesPayload> {
  const res = await fetch("/api/live");
  if (!res.ok) throw new Error("Error fetching live fixtures");
  return unwrapApiData<LiveFixturesPayload>(await res.json());
}

async function fetchLiveDetail(fixtureId: string): Promise<LiveMatchDetail> {
  const res = await fetch(`/api/live?id=${encodeURIComponent(fixtureId)}`);
  if (!res.ok) throw new Error("Error fetching live detail");
  return unwrapApiData<LiveMatchDetail>(await res.json());
}

export function useLiveFixtures(options?: { enabled?: boolean; aggressive?: boolean }) {
  const interval = options?.aggressive ? 10_000 : 15_000;
  return useQuery<LiveFixturesPayload, Error>({
    queryKey: ["live-fixtures"],
    queryFn: fetchLiveFixtures,
    enabled: options?.enabled ?? true,
    refetchInterval: interval,
    refetchIntervalInBackground: true,
    staleTime: 6_000,
    refetchOnWindowFocus: true,
  });
}

export function useLiveDetail(fixtureId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery<LiveMatchDetail, Error>({
    queryKey: ["live-detail", fixtureId],
    queryFn: () => fetchLiveDetail(fixtureId!),
    enabled: (options?.enabled ?? true) && Boolean(fixtureId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}
