import { useQuery } from "@tanstack/react-query";
import { unwrapApiData } from "@/frontend/lib/api-response";
import type {
  BookmakerCompareResult,
  ClvSummary,
  LineMovementAlert,
  OddsQualityReport,
} from "@/shared/odds-intelligence";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Error de red" }));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  const envelope = await res.json();
  return unwrapApiData<T>(envelope);
}

export function useOddsClvSummary() {
  return useQuery({
    queryKey: ["odds-intelligence", "clv"],
    queryFn: () => fetchJson<ClvSummary>("/api/odds-intelligence/clv"),
    staleTime: 60_000,
  });
}

export function useOddsQualityReport(date: string, groupBy: "league" | "market") {
  return useQuery({
    queryKey: ["odds-intelligence", "report", date, groupBy],
    queryFn: () =>
      fetchJson<{
        report: OddsQualityReport;
        fixtures: Array<{
          fixtureId: string;
          home: string;
          away: string;
          leagueName: string;
          avgSpreadPercent: number;
          outlierCount: number;
        }>;
      }>(`/api/odds-intelligence/report?date=${encodeURIComponent(date)}&groupBy=${groupBy}`),
    enabled: Boolean(date),
    staleTime: 120_000,
  });
}

export function useBookmakerCompare(fixtureId: string, bookmakerA?: string, bookmakerB?: string) {
  const params = new URLSearchParams({ fixtureId });
  if (bookmakerA) params.set("bookmakerA", bookmakerA);
  if (bookmakerB) params.set("bookmakerB", bookmakerB);

  return useQuery({
    queryKey: ["odds-intelligence", "compare", fixtureId, bookmakerA, bookmakerB],
    queryFn: () =>
      fetchJson<{ fixtureId: string; fixtureName: string; compare: BookmakerCompareResult }>(
        `/api/odds-intelligence/compare?${params.toString()}`
      ),
    enabled: Boolean(fixtureId),
    staleTime: 60_000,
  });
}

export function useLineMovements(fixtureId: string, threshold = 5) {
  return useQuery({
    queryKey: ["odds-intelligence", "movements", fixtureId, threshold],
    queryFn: () =>
      fetchJson<{
        fixtureId: string;
        fixtureName: string;
        threshold: number;
        movements: LineMovementAlert[];
      }>(
        `/api/odds-intelligence/movements?fixtureId=${encodeURIComponent(fixtureId)}&threshold=${threshold}`
      ),
    enabled: Boolean(fixtureId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
