import { useQuery } from "@tanstack/react-query";
import type { AnalysisResult, Fixture, MatchLineup, MatchEvent, MatchStatistic } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

type MLPrediction = {
  prediction: string;
  confidence: number;
  probabilities: Record<string, Record<string, number>>;
  classes: string[];
  shap: {
    top_features: Array<{ feature: string; impact: number }>;
    error?: string;
  };
};

type AnalysisPayload = {
  fixture: Fixture;
  analysis: AnalysisResult;
  lineups?: MatchLineup[];
  events?: MatchEvent[];
  statistics?: MatchStatistic[];
  mlPrediction?: MLPrediction | null;
};

async function fetchAnalysis(fixtureId: string): Promise<AnalysisPayload> {
  const response = await fetch(`/api/analyze/${encodeURIComponent(fixtureId)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al analizar partido" }));
    throw new Error(error.error ?? `Error ${response.status}`);
  }
  const envelope = await response.json();
  const payload = unwrapApiData<AnalysisPayload>(envelope);
  return payload;
}

/**
 * useAnalysis — returns ONLY the analysis result (backward compatible).
 * Auto-refreshes every 30s for live data.
 */
export function useAnalysis(fixtureId: string) {
  const query = useQuery<AnalysisPayload, Error>({
    queryKey: ["analysis", fixtureId],
    queryFn: () => fetchAnalysis(fixtureId),
    enabled: Boolean(fixtureId),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  return {
    ...query,
    data: query.data?.analysis,
  };
}

/**
 * useAnalysisWithFixture — returns both fixture (with live score/odds) and analysis.
 * Use this in Match Center for real-time updates.
 * Polls every 15s for live matches, 30s for pre-match/final.
 */
export function useAnalysisWithFixture(fixtureId: string) {
  const query = useQuery<AnalysisPayload, Error>({
    queryKey: ["analysis-full", fixtureId],
    queryFn: () => fetchAnalysis(fixtureId),
    enabled: Boolean(fixtureId),
    staleTime: 10_000,
    refetchInterval: (query) => {
      const fixture = query.state.data?.fixture;
      if (fixture?.status === "live") return 15_000; // 15s para partidos en vivo
      return 30_000; // 30s para pre-match o finalizados
    },
  });

  return query;
}
