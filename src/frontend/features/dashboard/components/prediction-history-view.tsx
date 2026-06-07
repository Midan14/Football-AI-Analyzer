"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, CheckCircle } from "lucide-react";
import { parseResultsCSV } from "@/frontend/lib/import-csv";
import { usePredictionFilters } from "@/frontend/hooks/use-prediction-filters";
import {
  fetchPredictionRecordsForDisplay,
  resolvePredictions,
} from "@/frontend/lib/predictions-api";

export function PredictionHistoryView({ addToast }: { addToast: (message: string, type: "success" | "error" | "warning" | "info") => void }) {
  const queryClient = useQueryClient();
  const {
    data: history = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["predictions", "display"],
    queryFn: fetchPredictionRecordsForDisplay,
    staleTime: 30_000,
  });

  const stats = {
    total: history.length,
    withResult: history.filter((p) => p.result).length,
    won: history.filter((p) => p.result?.predictionWon).length,
    lost: history.filter((p) => !p.result?.predictionWon && p.result).length,
    withClv: history.filter((p) => p.clvPercent !== undefined).length,
    avgClv:
      history.filter((p) => p.clvPercent !== undefined).length > 0
        ? history
            .filter((p) => p.clvPercent !== undefined)
            .reduce((sum, p) => sum + (p.clvPercent ?? 0), 0) /
          history.filter((p) => p.clvPercent !== undefined).length
        : 0,
    winRate:
      history.filter((p) => p.result).length > 0
        ? (history.filter((p) => p.result?.predictionWon).length /
            history.filter((p) => p.result).length) *
          100
        : 0,
    totalProfit: history.reduce((sum, p) => sum + (p.result?.profit ?? 0), 0),
    avgProfit:
      history.filter((p) => p.result).length > 0
        ? history.reduce((sum, p) => sum + (p.result?.profit ?? 0), 0) /
          history.filter((p) => p.result).length
        : 0,
    totalStakeResolved: history
      .filter((p) => p.result)
      .reduce((sum, p) => sum + p.stakeUnits, 0),
  };
  const roiPercent =
    stats.totalStakeResolved > 0 ? (stats.totalProfit / stats.totalStakeResolved) * 100 : 0;

  const {
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
  } = usePredictionFilters(history);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["predictions", "display"] });
    void refetch();
  }, [queryClient, refetch]);

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseResultsCSV(text);
      refresh();
      addToast(result.messages[0], result.errors > 0 ? "warning" : "success");
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const [resolving, setResolving] = useState(false);

  const handleResolve = async () => {
    setResolving(true);
    try {
      const summary = await resolvePredictions();
      refresh();
      addToast(
        `${summary.resolved} predicciones resueltas · ${summary.skipped} omitidas`,
        summary.resolved > 0 ? "success" : "info"
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Error al resolver predicciones", "error");
    } finally {
      setResolving(false);
    }
  };

  const hasOpenPredictions = history.some((p) => !p.result);
  const hasActiveFilters =
    leagueFilter !== "" ||
    resultFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    minConfidence > 0;

  if (isLoading) {
    return (
      <section className="view-workspace">
        <div className="empty-state large">Cargando predicciones...</div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="view-workspace">
        <div className="error-banner" role="alert">
          <span>{error instanceof Error ? error.message : "Error al cargar predicciones"}</span>
          <button type="button" onClick={() => void refetch()}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="view-workspace">
      <article className="workspace-hero">
        <div>
          <span>Historial</span>
          <h2>Predicciones guardadas</h2>
          <p>
            Predicciones guardadas desde Match Center en tu cuenta (API). Importa CSV solo para
            actualizar resultados locales legacy.
          </p>
        </div>
        <div className="hero-metrics">
          <strong>{stats.total}</strong><span>total</span>
          <strong>{stats.withResult}</strong><span>con resultado</span>
          <strong>{stats.winRate.toFixed(1)}%</strong><span>acierto</span>
        </div>
      </article>

      <article className="panel workspace-panel">
        <div className="panel-head">
          <h2>Filtros</h2>
          <span>{filtered.length} resultados</span>
        </div>
        <div className="filter-grid">
          <label className="filter-field">
            <span>Liga</span>
            <select value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)}>
              <option value="">Todas</option>
              {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Resultado</span>
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as "all" | "won" | "lost" | "pending")}>
              <option value="all">Todos</option>
              <option value="won">Ganadas</option>
              <option value="lost">Perdidas</option>
              <option value="pending">Pendientes</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Desde</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Hasta</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Confianza mínima: {minConfidence}%</span>
            <input type="range" min={0} max={100} value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} />
          </label>
          <label className="filter-field csv-import">
            <span>Importar resultados CSV</span>
            <input type="file" accept=".csv" onChange={handleImportCSV} />
          </label>
        </div>

        <div className="filter-actions" style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <button
            className="qa-btn-reanalyze"
            onClick={handleResolve}
            disabled={resolving || !hasOpenPredictions}
            style={{ opacity: resolving ? 0.6 : 1 }}
          >
            <CheckCircle size={16} />
            {resolving ? "Resolviendo..." : "Resolver predicciones finalizadas"}
          </button>
          <button
            className="qa-btn-deep"
            onClick={() => refresh()}
            style={{ opacity: 1 }}
          >
            <RefreshCw size={16} />
            Actualizar lista
          </button>
        </div>
      </article>

      {stats.withResult > 0 && (
        <section className="ops-workspace-grid">
          <article className="panel ops-panel">
            <div className="panel-head">
              <h2>Estadísticas</h2>
              <span>{stats.withResult} evaluadas</span>
            </div>
            <div className="stats-grid">
              <div className="stat-card"><span>Ganadas</span><strong>{stats.won}</strong></div>
              <div className="stat-card"><span>Perdidas</span><strong>{stats.lost}</strong></div>
              <div className="stat-card"><span>Win Rate</span><strong>{stats.winRate.toFixed(1)}%</strong></div>
              <div className="stat-card"><span>Profit Total</span><strong className={stats.totalProfit >= 0 ? "positive" : "negative"}>{stats.totalProfit >= 0 ? "+" : ""}{stats.totalProfit.toFixed(2)}u</strong></div>
              <div className="stat-card">
                <span>ROI real</span>
                <strong className={roiPercent >= 0 ? "positive" : "negative"}>
                  {roiPercent >= 0 ? "+" : ""}
                  {roiPercent.toFixed(1)}%
                </strong>
              </div>
              <div className="stat-card"><span>Profit Medio</span><strong>{stats.avgProfit.toFixed(2)}u</strong></div>
              {stats.withClv > 0 && (
                <div className="stat-card">
                  <span>CLV medio</span>
                  <strong className={stats.avgClv >= 0 ? "positive" : "negative"}>
                    {stats.avgClv >= 0 ? "+" : ""}
                    {stats.avgClv.toFixed(1)}%
                  </strong>
                </div>
              )}
            </div>
          </article>
        </section>
      )}

      <article className="panel workspace-panel">
        <div className="panel-head">
          <h2>Registro de predicciones</h2>
          <span>{filtered.length} mostradas</span>
        </div>
        <div className="prediction-list">
          {filtered.map((item) => (
            <div className="prediction-row" key={`${item.fixtureId}-${item.createdAt}`}>
              <div className="prediction-main">
                <strong>{item.homeTeam} vs {item.awayTeam}</strong>
                <span>{item.leagueName} · {new Date(item.kickoff).toLocaleDateString("es-ES")}</span>
              </div>
              <div className="prediction-pick">
                <span>{item.predictedMarket}</span>
                <b>{item.confidence}% confianza</b>
              </div>
              <div className="prediction-stake">
                <span>{item.stakeUnits}u stake</span>
                <b>{item.riskLevel} riesgo</b>
                {item.takenOdds ? (
                  <small>
                    Cuota {item.takenOdds.toFixed(2)}
                    {item.clvPercent !== undefined
                      ? ` · CLV ${item.clvPercent >= 0 ? "+" : ""}${item.clvPercent.toFixed(1)}%`
                      : ""}
                  </small>
                ) : null}
              </div>
              {item.result && (
                <div className={`prediction-result ${item.result.predictionWon ? "won" : "lost"}`}>
                  <span>{item.result.predictionWon ? "✓ Ganada" : "✗ Perdida"}</span>
                  <b>{item.result.profit >= 0 ? "+" : ""}{item.result.profit.toFixed(2)}u</b>
                </div>
              )}
            </div>
          ))}
          {!filtered.length && (
            <div className="empty-state">
              <p>No hay predicciones que coincidan con los filtros.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="qa-btn-deep"
                  onClick={() => {
                    setLeagueFilter("");
                    setResultFilter("all");
                    setDateFrom("");
                    setDateTo("");
                    setMinConfidence(0);
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
