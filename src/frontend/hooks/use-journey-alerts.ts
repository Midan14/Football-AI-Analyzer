import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";
import type { FixtureInsight } from "@/frontend/hooks/use-dashboard-summary";
import { todayIsoDateColombia } from "@/frontend/lib/date-utils";

export type JourneyAlert = {
  id: string;
  type: "risk" | "value" | "live" | "lineup" | "custom";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  fixtureId: string;
  market?: string;
  edge?: number;
  confidence?: number;
  source: "api-live" | "api-odds" | "model-scan";
};

export type JourneyAlertsPayload = {
  dataSource: string;
  liveProvider: string;
  oddsLoaded: boolean;
  oddsWithQuotes: number;
  fixturesTotal: number;
  liveCount: number;
  alerts: JourneyAlert[];
  insights: FixtureInsight[];
  stats: {
    high: number;
    medium: number;
    low: number;
    value: number;
    live: number;
  };
  updatedAt: string;
};

async function fetchJourneyAlerts(date: string, leagueId?: string): Promise<JourneyAlertsPayload> {
  const params = new URLSearchParams({ date });
  if (leagueId) params.set("leagueId", leagueId);
  const res = await fetch(`/api/alerts/journey?${params.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("No se pudieron cargar las alertas de la jornada");
  return unwrapApiData<JourneyAlertsPayload>(await res.json());
}

export function useJourneyAlerts(date: string, leagueId?: string, options?: { enabled?: boolean }) {
  const isToday = date === todayIsoDateColombia();
  return useQuery<JourneyAlertsPayload, Error>({
    queryKey: ["journey-alerts", date, leagueId ?? "all"],
    queryFn: () => fetchJourneyAlerts(date, leagueId),
    enabled: (options?.enabled ?? true) && Boolean(date),
    staleTime: 15_000,
    refetchInterval: isToday ? 20_000 : false,
    refetchOnMount: "always",
  });
}
