"use client";

import { useState, useCallback } from "react";
import { RefreshCw, CheckCircle } from "lucide-react";
import { getPredictionHistory, getPredictionStats } from "@/frontend/lib/prediction-history";
import { parseResultsCSV } from "@/frontend/lib/import-csv";
import { usePredictionFilters } from "@/frontend/hooks/use-prediction-filters";
import { resolvePredictions, syncPredictionResultsFromBackend } from "@/frontend/lib/predictions-api";

export function PredictionHistoryView({ addToast }: { addToast: (message: string, type: "success" | "error" | "warning" | "info") => void }) {
  const [history, setHistory] = useState(() => getPredictionHistory());
  const [resolving, setResolving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const stats = getPredictionStats();
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
    setHistory(getPredictionHistory());
  }, []);

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

  const handleResolve = async () => {
    setResolving(true);
    try {
      const summary = await resolvePredictions();
      await syncPredictionResultsFromBackend();
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { updated, skipped } = await syncPredictionResultsFromBackend();
      refresh();
      addToast(
        `${updated} resultados sincronizados · ${skipped} omitidos`,
        updated > 0 ? "success" : "info"
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Error al sincronizar", "error");
    } finally {
      setSyncing(false);
    }
  };

  const hasOpenPredictions = history.some((p) => !p.result);

  return (
    <section className="view-workspace">
      <article className="workspace-hero">
        <div>
          <span>Historial</span>
          <h2>Predicciones guardadas</h2>
          <p>Seguimiento de decisiones del modelo: picks, confianza, stake y resultados.</p>
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
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as any)}>
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
            onClick={handleSync}
            disabled={syncing}
            style={{ opacity: syncing ? 0.6 : 1 }}
          >
            <RefreshCw size={16} />
            {syncing ? "Sincronizando..." : "Sincronizar resultados"}
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
              <div className="stat-card"><span>Profit Medio</span><strong>{stats.avgProfit.toFixed(2)}u</strong></div>
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
            <div className="prediction-row" key={item.fixtureId}>
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
              </div>
              {item.result && (
                <div className={`prediction-result ${item.result.predictionWon ? "won" : "lost"}`}>
                  <span>{item.result.predictionWon ? "✓ Ganada" : "✗ Perdida"}</span>
                  <b>{item.result.profit >= 0 ? "+" : ""}{item.result.profit.toFixed(2)}u</b>
                </div>
              )}
            </div>
          ))}
          {!filtered.length && <div className="empty-state">No hay predicciones que coincidan con los filtros.</div>}
        </div>
      </article>
    </section>
  );
}
