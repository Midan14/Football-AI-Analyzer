import type { AnalysisPreferences } from "@/shared/analysis-preferences";

export function buildAnalysisQuery(
  preferences: AnalysisPreferences,
  options?: { refresh?: boolean }
): string {
  const params = new URLSearchParams({
    modelMode: preferences.modelMode,
    scenario: preferences.scenario,
  });
  if (options?.refresh) {
    params.set("refresh", "1");
  }
  return `?${params.toString()}`;
}
