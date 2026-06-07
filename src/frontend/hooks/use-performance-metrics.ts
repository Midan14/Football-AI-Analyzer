import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";

export type PerformanceGroupMetrics = {
  key: string;
  sampleSize: number;
  hitRate: number;
  totalRoi: number;
  roiPerUnit: number;
  brier: number;
  logLoss: number;
  avgClvPercent: number | null;
  clvSampleSize: number;
};

type PerformancePayload = {
  groupBy: "market" | "league" | "model";
  sampleSize: number;
  filters?: { from: string | null; to: string | null };
  metrics: PerformanceGroupMetrics[];
};

export function usePerformanceMetrics(groupBy: "market" | "league" | "model" = "market") {
  return useQuery({
    queryKey: ["performance", groupBy],
    queryFn: async (): Promise<PerformancePayload> => {
      const res = await fetch(`/api/performance?groupBy=${groupBy}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "No se pudo cargar el rendimiento historico");
      }
      return unwrapApiData<PerformancePayload>(await res.json());
    },
    staleTime: 120_000,
  });
}
