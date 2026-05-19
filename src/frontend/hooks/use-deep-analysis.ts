import { useQuery } from "@tanstack/react-query";
import type { DeepAnalysisResult } from "@/shared/domain";
import { unwrapApiData } from "@/frontend/lib/api-response";

async function fetchDeepAnalysis(fixtureId: string): Promise<DeepAnalysisResult> {
  const response = await fetch(`/api/deep-analyze/${encodeURIComponent(fixtureId)}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const msg = body?.error?.message ?? body?.error ?? `Error ${response.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  const envelope = await response.json();
  const payload = unwrapApiData<{ fixture: unknown; deepAnalysis: DeepAnalysisResult }>(envelope);
  if (!payload.deepAnalysis) {
    throw new Error("El análisis profundo no devolvió datos. Intenta con otro partido.");
  }
  return payload.deepAnalysis;
}

export function useDeepAnalysis(fixtureId: string) {
  return useQuery<DeepAnalysisResult, Error>({
    queryKey: ["deep-analysis", fixtureId],
    queryFn: () => fetchDeepAnalysis(fixtureId),
    enabled: Boolean(fixtureId),
    staleTime: 1000 * 60 * 2,
  });
}
