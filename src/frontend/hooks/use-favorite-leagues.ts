"use client";

import { useCallback } from "react";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";

export type FavoriteLeagueEntry = {
  leagueId: string;
  countryId: string;
  name: string;
  pinnedAt: string;
};

const MAX_FAVORITES = 12;
const MAX_RECENT = 8;

export function useFavoriteLeagues() {
  const [favorites, setFavorites] = useLocalStorage<FavoriteLeagueEntry[]>(
    "football-ai-favorite-leagues",
    []
  );
  const [recent, setRecent] = useLocalStorage<FavoriteLeagueEntry[]>(
    "football-ai-recent-leagues",
    []
  );

  const isPinned = useCallback(
    (leagueId: string) => favorites.some((entry) => entry.leagueId === leagueId),
    [favorites]
  );

  const togglePin = useCallback(
    (entry: Omit<FavoriteLeagueEntry, "pinnedAt">) => {
      setFavorites((prev) => {
        const exists = prev.some((item) => item.leagueId === entry.leagueId);
        if (exists) {
          return prev.filter((item) => item.leagueId !== entry.leagueId);
        }
        const next = [{ ...entry, pinnedAt: new Date().toISOString() }, ...prev];
        return next.slice(0, MAX_FAVORITES);
      });
    },
    [setFavorites]
  );

  const touchRecent = useCallback(
    (entry: Omit<FavoriteLeagueEntry, "pinnedAt">) => {
      setRecent((prev) => {
        const filtered = prev.filter((item) => item.leagueId !== entry.leagueId);
        return [{ ...entry, pinnedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_RECENT);
      });
    },
    [setRecent]
  );

  return { favorites, recent, isPinned, togglePin, touchRecent };
}
