"use client";

import { useCallback, useEffect } from "react";
import type { ModelMode } from "@/frontend/features/dashboard/dashboard-config";

const PRISMA_TO_UI: Record<string, ModelMode> = {
  CONSERVATIVE: "Conservador",
  BALANCED: "Balanceado",
  AGGRESSIVE: "Agresivo",
};

type UseUserPreferencesOptions = {
  modelMode: ModelMode;
  bankroll: number;
  setModelMode: (mode: ModelMode) => void;
  setBankroll: (amount: number) => void;
};

/**
 * Hydrates local dashboard prefs from the authenticated user profile when available.
 */
export function useUserPreferences({
  modelMode,
  bankroll,
  setModelMode,
  setBankroll,
}: UseUserPreferencesOptions) {
  const syncFromServer = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/profile");
      if (!res.ok) return;
      const json = await res.json();
      const user = json?.data;
      if (!user) return;

      if (user.modelMode && PRISMA_TO_UI[user.modelMode]) {
        setModelMode(PRISMA_TO_UI[user.modelMode]);
      }
      if (typeof user.bankroll === "number" && user.bankroll > 0) {
        setBankroll(user.bankroll);
      }
    } catch {
      // Guest or offline — keep localStorage values
    }
  }, [setModelMode, setBankroll]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  const persistModelMode = useCallback(
    async (mode: ModelMode) => {
      setModelMode(mode);
      try {
        await fetch("/api/auth/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelMode: mode }),
        });
      } catch {
        // Non-blocking
      }
    },
    [setModelMode]
  );

  const persistBankroll = useCallback(
    async (amount: number) => {
      setBankroll(amount);
      try {
        await fetch("/api/bankroll", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        });
      } catch {
        // Non-blocking
      }
    },
    [setBankroll]
  );

  return { persistModelMode, persistBankroll, syncFromServer };
}
