"use client";

import { useState, useMemo } from "react";
import type { PredictionRecord } from "@/frontend/lib/prediction-history";

export function usePredictionFilters(history: PredictionRecord[]) {
  const [leagueFilter, setLeagueFilter] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "won" | "lost" | "pending">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);

  const leagues = useMemo(() => {
    const set = new Set(history.map((item) => item.leagueName));
    return Array.from(set).sort();
  }, [history]);

  const filtered = useMemo(() => {
    return history.filter((item) => {
      if (leagueFilter && item.leagueName !== leagueFilter) return false;
      if (resultFilter === "won" && !item.result?.predictionWon) return false;
      if (resultFilter === "lost" && (item.result?.predictionWon ?? true)) return false;
      if (resultFilter === "pending" && item.result) return false;
      if (dateFrom && new Date(item.kickoff) < new Date(dateFrom)) return false;
      if (dateTo && new Date(item.kickoff) > new Date(dateTo)) return false;
      if (item.confidence < minConfidence) return false;
      return true;
    });
  }, [history, leagueFilter, resultFilter, dateFrom, dateTo, minConfidence]);

  return {
    filtered,
    leagues,
    leagueFilter,
    setLeagueFilter,
    resultFilter,
    setResultFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    minConfidence,
    setMinConfidence,
  };
}
