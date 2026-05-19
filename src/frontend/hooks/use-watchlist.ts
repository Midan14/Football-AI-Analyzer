"use client";

import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";

const LOCAL_KEY = "football-ai-starred";
const QUERY_KEY = ["watchlist"] as const;

type ApiEnvelope<T> = { success: boolean; data?: T; error?: { message?: string } };
type WatchlistRow = { fixtureId: string };

function readLocalIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeLocalIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore quota errors
  }
}

async function fetchWatchlist(): Promise<Set<string>> {
  const res = await fetch("/api/user/watchlist", { credentials: "include" });
  if (!res.ok) throw new Error("No se pudo cargar la watchlist");
  const body = (await res.json()) as ApiEnvelope<WatchlistRow[]>;
  return new Set((body.data ?? []).map((row) => row.fixtureId));
}

async function postAdd(fixture: Fixture) {
  const res = await fetch("/api/user/watchlist", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fixtureId: fixture.id,
      homeTeam: fixture.home.name,
      awayTeam: fixture.away.name,
      league: fixture.leagueName,
      country: fixture.countryId,
      date: fixture.kickoff,
    }),
  });
  if (!res.ok && res.status !== 400 /* already present */) {
    throw new Error("No se pudo agregar a la watchlist");
  }
}

async function postRemove(fixtureId: string) {
  const res = await fetch(`/api/user/watchlist/${encodeURIComponent(fixtureId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error("No se pudo quitar de la watchlist");
  }
}

/**
 * Returns [starred, toggle].
 * - When the user is signed in: persisted via /api/user/watchlist (with optimistic updates).
 * - Unauthenticated: falls back to localStorage so guest browsing still works.
 *
 * `toggle` accepts the full Fixture (preferred) or just `{ id }`. POST requires
 * the full fixture, so an id-only call when adding is a no-op server-side.
 */
export function useWatchlist(): [Set<string>, (fixture: Fixture | { id: string }) => void] {
  const { status } = useSession();
  const authed = status === "authenticated";
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchWatchlist,
    enabled: authed,
    staleTime: 60_000,
  });

  const starred = useMemo<Set<string>>(() => {
    if (authed) return query.data ?? new Set();
    return readLocalIds();
  }, [authed, query.data]);

  const addMutation = useMutation({
    mutationFn: (fixture: Fixture) => postAdd(fixture),
    onMutate: async (fixture) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Set<string>>(QUERY_KEY) ?? new Set<string>();
      const next = new Set(prev);
      next.add(fixture.id);
      qc.setQueryData(QUERY_KEY, next);
      return { prev };
    },
    onError: (_err, _fixture, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const removeMutation = useMutation({
    mutationFn: (fixtureId: string) => postRemove(fixtureId),
    onMutate: async (fixtureId) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Set<string>>(QUERY_KEY) ?? new Set<string>();
      const next = new Set(prev);
      next.delete(fixtureId);
      qc.setQueryData(QUERY_KEY, next);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const toggle = useCallback(
    (fixture: Fixture | { id: string }) => {
      if (authed) {
        const isStarred = (qc.getQueryData<Set<string>>(QUERY_KEY) ?? new Set()).has(fixture.id);
        if (isStarred) {
          removeMutation.mutate(fixture.id);
        } else if ("home" in fixture && "away" in fixture) {
          addMutation.mutate(fixture);
        }
        return;
      }

      const current = readLocalIds();
      if (current.has(fixture.id)) current.delete(fixture.id);
      else current.add(fixture.id);
      writeLocalIds(current);
      qc.setQueryData(QUERY_KEY, new Set(current));
    },
    [authed, addMutation, removeMutation, qc]
  );

  return [starred, toggle];
}
