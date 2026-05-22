import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

export type OpportunitiesScope = "day" | "watchlist";

export function useOpportunities(options: {
  date: string;
  leagueId?: string;
  scope?: OpportunitiesScope;
  minEdge?: number;
  minConfidence?: number;
}) {
  const { data: session } = useSession();
  const {
    date,
    leagueId,
    scope = "day",
    minEdge = 3,
    minConfidence = 55,
  } = options;

  return useQuery({
    queryKey: ["opportunities", date, leagueId ?? "all", scope, minEdge, minConfidence],
    queryFn: async () => {
      const params = new URLSearchParams({
        date,
        minEdge: String(minEdge),
        minConfidence: String(minConfidence),
        scope,
      });
      if (leagueId) params.set("leagueId", leagueId);
      const res = await fetch(`/api/opportunities?${params.toString()}`);
      if (!res.ok) throw new Error("No se pudo escanear oportunidades");
      return res.json();
    },
    enabled: Boolean(session?.user?.id && date),
    staleTime: 45_000,
    refetchInterval: 90_000,
  });
}
