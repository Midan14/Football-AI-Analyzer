import { useQuery } from "@tanstack/react-query";
import type { AnalysisResult, Fixture, MatchLineup, MatchEvent, MatchStatistic } from "@/shared/domain";
import type { AnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import {
  DEFAULT_ANALYSIS_PREFERENCES,
  normalizeAnalysisPreferences,
  type AnalysisPreferences,
} from "@/shared/analysis-preferences";
import { unwrapApiData } from "@/frontend/lib/api-response";
import { buildAnalysisQuery } from "@/frontend/lib/analysis-query";

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

export type AnalysisPayload = {
  fixture: Fixture;
  analysis: AnalysisResult;
  lineups?: MatchLineup[];
  events?: MatchEvent[];
  statistics?: MatchStatistic[];
  mlPrediction?: MLPrediction | null;
  analysisPipeline?: AnalysisPipelineStatus;
};

export type AnalysisFetchOptions = {
  refresh?: boolean;
  preferences?: Partial<AnalysisPreferences>;
};

async function fetchAnalysis(
  fixtureId: string,
  options?: AnalysisFetchOptions
): Promise<AnalysisPayload> {
  const preferences = normalizeAnalysisPreferences(
    options?.preferences ?? DEFAULT_ANALYSIS_PREFERENCES
  );
  const query = buildAnalysisQuery(preferences, { refresh: options?.refresh });
  const response = await fetch(`/api/analyze/${encodeURIComponent(fixtureId)}${query}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error al analizar partido" }));
    throw new Error(error.error ?? `Error ${response.status}`);
  }
  const envelope = await response.json();
  return unwrapApiData<AnalysisPayload>(envelope);
}

export { fetchAnalysis };

function analysisQueryKey(fixtureId: string, preferences: AnalysisPreferences) {
  return ["analysis", fixtureId, preferences.modelMode, preferences.scenario] as const;
}

function analysisFullQueryKey(fixtureId: string, preferences: AnalysisPreferences) {
  return ["analysis-full", fixtureId, preferences.modelMode, preferences.scenario] as const;
}

/**
 * useAnalysis — returns ONLY the analysis result (backward compatible).
 * Auto-refreshes every 30s for live data.
 */
export function useAnalysis(
  fixtureId: string,
  preferences: Partial<AnalysisPreferences> = DEFAULT_ANALYSIS_PREFERENCES
) {
  const prefs = normalizeAnalysisPreferences(preferences);
  const query = useQuery<AnalysisPayload, Error>({
    queryKey: analysisQueryKey(fixtureId, prefs),
    queryFn: () => fetchAnalysis(fixtureId, { preferences: prefs }),
    enabled: Boolean(fixtureId),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  return {
    ...query,
    data: query.data?.analysis,
    preferences: prefs,
  };
}

/**
 * useAnalysisWithFixture — returns both fixture (with live score/odds) and analysis.
 * Use this in Match Center for real-time updates.
 */
export function useAnalysisWithFixture(
  fixtureId: string,
  preferences: Partial<AnalysisPreferences> = DEFAULT_ANALYSIS_PREFERENCES
) {
  const prefs = normalizeAnalysisPreferences(preferences);
  return useQuery<AnalysisPayload, Error>({
    queryKey: analysisFullQueryKey(fixtureId, prefs),
    queryFn: () => fetchAnalysis(fixtureId, { preferences: prefs }),
    enabled: Boolean(fixtureId),
    staleTime: 10_000,
    refetchInterval: (query) => {
      const fixture = query.state.data?.fixture;
      if (fixture?.status === "live") return 15_000;
      return 30_000;
    },
  });
}
