import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

export function useCalibration() {
  const { data: session } = useSession();

  return useQuery({
    queryKey: ["calibration"],
    queryFn: async () => {
      const res = await fetch("/api/calibration");
      if (!res.ok) throw new Error("Failed to fetch calibration");
      return res.json();
    },
    enabled: !!session?.user?.id,
    refetchInterval: 300000, // Refresh every 5 minutes
  });
}
