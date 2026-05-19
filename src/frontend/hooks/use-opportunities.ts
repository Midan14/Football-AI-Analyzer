import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

export function useOpportunities(minEdge = 3, minConfidence = 55) {
  const { data: session } = useSession();

  return useQuery({
    queryKey: ["opportunities", minEdge, minConfidence],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities?minEdge=${minEdge}&minConfidence=${minConfidence}`);
      if (!res.ok) throw new Error("Failed to fetch opportunities");
      return res.json();
    },
    enabled: !!session?.user?.id,
    refetchInterval: 60000, // Refresh every minute
  });
}
