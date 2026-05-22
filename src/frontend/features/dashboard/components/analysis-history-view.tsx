"use client";

import { useEffect, useState } from "react";
import { History, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

type AnalysisRecord = {
  id: string;
  fixtureId: string;
  league: string;
  country: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  confidenceScore: number;
  bestBet: string | null;
  stakeUnits: number;
  result: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  createdAt: string;
};

type AnalysisHistoryViewProps = {
  addToast?: (message: string, type?: "info" | "success" | "error" | "warning") => void;
  onOpenFixture?: (record: AnalysisRecord) => void;
};

const PAGE_SIZE = 15;

export function AnalysisHistoryView({ addToast, onOpenFixture }: AnalysisHistoryViewProps) {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis-history?limit=100");
      if (!res.ok) {
        if (res.status === 401) {
          setError("Inicia sesión para ver tu historial de análisis.");
          return;
        }
        throw new Error(`Error ${res.status}`);
      }
      const data = await res.json();
      setRecords(data.data?.analyses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar historial");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.homeTeam.toLowerCase().includes(q) ||
      r.awayTeam.toLowerCase().includes(q) ||
      r.league.toLowerCase().includes(q) ||
      r.bestBet?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const avgConfidence =
    records.length > 0
      ? Math.round(records.reduce((s, r) => s + r.confidenceScore, 0) / records.length)
      : 0;

  const resolvedCount = records.filter((r) => r.result && r.result !== "PENDING").length;

  const handleReanalyze = async (fixtureId: string) => {
    try {
      const bust = await fetch(`/api/analyze/${encodeURIComponent(fixtureId)}?bust=1`, {
        method: "DELETE",
      });
      if (!bust.ok) throw new Error(`Cache: ${bust.status}`);
      const run = await fetch(`/api/analyze/${encodeURIComponent(fixtureId)}`);
      if (!run.ok) throw new Error(`Análisis: ${run.status}`);
      await fetchHistory();
      addToast?.("Análisis actualizado correctamente.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo re-analizar";
      addToast?.(`Re-análisis fallido: ${msg}`, "error");
    }
  };

  function confidenceColor(score: number) {
    if (score >= 70) return "#4ade80";
    if (score >= 55) return "#facc15";
    return "#f87171";
  }

  function resultBadge(record: AnalysisRecord) {
    const result = record.result;
    if (!result || result === "PENDING") return <span className="badge badge-neutral">Pendiente</span>;
    const score =
      record.homeGoals !== null && record.awayGoals !== null
        ? ` ${record.homeGoals}-${record.awayGoals}`
        : "";
    if (result === "HOME_WIN") return <span className="badge badge-good">Local{score}</span>;
    if (result === "AWAY_WIN") return <span className="badge badge-good">Visitante{score}</span>;
    if (result === "DRAW") return <span className="badge badge-warn">Empate{score}</span>;
    return <span className="badge badge-neutral">{result}</span>;
  }

  return (
    <section className="view-workspace">
      <article className="workspace-hero">
        <div>
          <span>Historial</span>
          <h2>Análisis Guardados</h2>
          <p>Todos los análisis ejecutados mientras estabas autenticado. Haz clic en un partido para re-analizarlo.</p>
        </div>
        <button onClick={fetchHistory} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </article>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 140, padding: "16px 20px" }}>
          <div style={{ color: "#71717a", fontSize: 12, marginBottom: 4 }}>Total análisis</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f4f4f5" }}>{records.length}</div>
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 140, padding: "16px 20px" }}>
          <div style={{ color: "#71717a", fontSize: 12, marginBottom: 4 }}>Confianza media</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: confidenceColor(avgConfidence) }}>{avgConfidence}%</div>
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 140, padding: "16px 20px" }}>
          <div style={{ color: "#71717a", fontSize: 12, marginBottom: 4 }}>Con resultado</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f4f4f5" }}>{resolvedCount}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar equipo, liga o mercado..."
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            color: "#f4f4f5",
            fontSize: 14,
          }}
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="panel" style={{ padding: 24, textAlign: "center", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="panel" style={{ padding: 32, textAlign: "center", color: "#71717a" }}>
          Cargando historial...
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <article className="panel workspace-panel">
          <div className="panel-head">
            <h2>
              <History size={16} style={{ display: "inline", marginRight: 6 }} />
              Registros
            </h2>
            <span>{filtered.length} análisis · Página {page} de {totalPages}</span>
          </div>

          {paginated.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#52525b" }}>
              {records.length === 0
                ? "No hay análisis guardados. Analiza un partido para que aparezca aquí."
                : "No hay resultados para esa búsqueda."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="value-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Partido</th>
                    <th>Liga</th>
                    <th>Fecha</th>
                    <th>1 / X / 2</th>
                    <th>Confianza</th>
                    <th>Mejor apuesta</th>
                    <th>Stake</th>
                    <th>Resultado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {r.homeTeam} vs {r.awayTeam}
                      </td>
                      <td style={{ color: "#a1a1aa" }}>{r.league}</td>
                      <td style={{ color: "#71717a", whiteSpace: "nowrap" }}>
                        {new Date(r.matchDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {r.homeWinProb.toFixed(0)}% / {r.drawProb.toFixed(0)}% / {r.awayWinProb.toFixed(0)}%
                      </td>
                      <td>
                        <span style={{ color: confidenceColor(r.confidenceScore), fontWeight: 700 }}>
                          {r.confidenceScore.toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ color: "#4ade80" }}>{r.bestBet ?? "—"}</td>
                      <td>{r.stakeUnits}u</td>
                      <td>{resultBadge(r)}</td>
                      <td>
                        {onOpenFixture && (
                          <button
                            onClick={() => onOpenFixture(r)}
                            style={{
                              padding: "4px 10px",
                              background: "#16a34a22",
                              border: "1px solid #16a34a44",
                              borderRadius: 6,
                              color: "#4ade80",
                              fontSize: 12,
                              cursor: "pointer",
                              marginRight: 6,
                            }}
                          >
                            Ver
                          </button>
                        )}
                        <button
                          onClick={() => handleReanalyze(r.fixtureId)}
                          style={{
                            padding: "4px 10px",
                            background: "#2563eb22",
                            border: "1px solid #2563eb44",
                            borderRadius: 6,
                            color: "#60a5fa",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Re-analizar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination" style={{ marginTop: 16 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft size={16} /> Anterior
              </button>
              <span>Página {page} de {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
