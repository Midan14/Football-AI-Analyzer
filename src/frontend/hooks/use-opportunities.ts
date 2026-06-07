import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { CONFIDENCE_THRESHOLDS } from "@/shared/confidence-thresholds";

export type OpportunitiesScope = "day" | "watchlist";

export function useOpportunities(options: {
  date: string;
  leagueId?: string;
  scope?: OpportunitiesScope;
  minEdge?: number;
  minConfidence?: number;
  minEv?: number;
  autoTrack?: boolean;
  radarMode?: boolean;
}) {
  const { data: session } = useSession();
  const {
    date,
    leagueId,
    scope = "day",
    minEdge = 3,
    minConfidence = CONFIDENCE_THRESHOLDS.caution,
    minEv = 0,
    autoTrack = false,
    radarMode = false,
  } = options;

  return useQuery({
    queryKey: [
      "opportunities",
      date,
      leagueId ?? "all",
      scope,
      minEdge,
      minConfidence,
      minEv,
      autoTrack,
      radarMode,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        date,
        minEdge: String(minEdge),
        minConfidence: String(minConfidence),
        minEv: String(minEv),
        autoTrack: autoTrack ? "1" : "0",
        scope,
      });
      if (leagueId) params.set("leagueId", leagueId);
      const res = await fetch(`/api/opportunities?${params.toString()}`);
      if (!res.ok) throw new Error("No se pudo escanear oportunidades");
      return res.json();
    },
    enabled: Boolean(session?.user?.id && date),
    staleTime: radarMode ? 8_000 : 45_000,
    refetchInterval: radarMode ? 20_000 : 90_000,
  });
}
