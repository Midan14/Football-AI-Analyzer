import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

export function useBankroll() {
  const { data: session } = useSession();

  return useQuery({
    queryKey: ["bankroll"],
    queryFn: async () => {
      const res = await fetch("/api/bankroll");
      if (!res.ok) throw new Error("Failed to fetch bankroll");
      return res.json();
    },
    enabled: !!session?.user?.id,
    refetchInterval: 30000, // Refresh every 30s
  });
}

export async function updateBankroll(amount: number) {
  const res = await fetch("/api/bankroll", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error("Failed to update bankroll");
  return res.json();
}
