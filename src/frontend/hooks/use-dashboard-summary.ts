import { useQuery } from "@tanstack/react-query";

export type FixtureInsight = {
  fixtureId: string;
  confidence: number;
  topEdge: number;
  market: string;
  riskLevel: "BAJO" | "MODERADO" | "ALTO";
};

type DashboardSummaryPayload = {
  insights: FixtureInsight[];
  topPicks: FixtureInsight[];
};

export function useDashboardSummary(date: string, leagueId?: string) {
  return useQuery({
    queryKey: ["dashboard-summary", date, leagueId ?? "all"],
    queryFn: async (): Promise<DashboardSummaryPayload> => {
      const params = new URLSearchParams({ date });
      if (leagueId) params.set("leagueId", leagueId);
      const res = await fetch(`/api/dashboard/summary?${params.toString()}`);
      if (!res.ok) throw new Error("No se pudo cargar el resumen del dashboard");
      const body = await res.json();
      return body.data ?? { insights: [], topPicks: [] };
    },
    enabled: Boolean(date),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
