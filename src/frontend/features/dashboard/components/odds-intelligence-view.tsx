"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  LineChart,
  RefreshCw,
  Scale,
} from "lucide-react";
import type { Fixture } from "@/shared/domain";
import {
  useBookmakerCompare,
  useLineMovements,
  useOddsClvSummary,
  useOddsQualityReport,
} from "@/frontend/hooks/use-odds-intelligence";
import { DataStatusBanner } from "./data-status-banner";

type OddsIntelligenceViewProps = {
  selectedDate: string;
  selectedFixture?: Fixture;
  fixturesDataSource?: string;
  onOpenFixture?: (fixtureId: string) => void;
  onOpenMatchCenter?: () => void;
};

export function OddsIntelligenceView({
  selectedDate,
  selectedFixture,
  fixturesDataSource,
  onOpenFixture,
  onOpenMatchCenter,
}: OddsIntelligenceViewProps) {
  const [groupBy, setGroupBy] = useState<"league" | "market">("league");
  const [movementThreshold, setMovementThreshold] = useState(5);

  const clvQuery = useOddsClvSummary();
  const reportQuery = useOddsQualityReport(selectedDate, groupBy);
  const compareQuery = useBookmakerCompare(selectedFixture?.id ?? "");
  const movementsQuery = useLineMovements(selectedFixture?.id ?? "", movementThreshold);

  const bookmakers = compareQuery.data?.compare.bookmakers ?? [];
  const [bookmakerA, setBookmakerA] = useState("");
  const [bookmakerB, setBookmakerB] = useState("");

  const focusedCompare = useBookmakerCompare(
    selectedFixture?.id ?? "",
    bookmakerA || undefined,
    bookmakerB || undefined
  );

  const compare = (bookmakerA && bookmakerB ? focusedCompare.data : compareQuery.data)?.compare;

  const clv = clvQuery.data;
  const report = reportQuery.data?.report;

  const topSpreadFixtures = useMemo(
    () => reportQuery.data?.fixtures ?? [],
    [reportQuery.data?.fixtures]
  );

  return (
    <section className="view-workspace odds-intelligence-view">
      <article className="workspace-hero">
        <div>
          <span>Odds Intelligence</span>
          <h2>Calidad de cuotas, CLV y movimiento de línea</h2>
          <p>
            Compara bookmakers, detecta outliers del proveedor, mide Closing Line Value en tus
            predicciones y recibe alertas cuando una cuota se mueve de forma relevante.
          </p>
        </div>
      </article>

      <DataStatusBanner fixturesDataSource={fixturesDataSource} />

      <div className="oi-grid">
        <article className="panel workspace-panel">
          <div className="panel-head">
            <h2>
              <LineChart size={18} /> Closing Line Value (CLV)
            </h2>
            <button type="button" className="qa-btn-deep" onClick={() => void clvQuery.refetch()}>
              <RefreshCw size={14} className={clvQuery.isFetching ? "spin" : ""} /> Actualizar
            </button>
          </div>
          {clvQuery.isLoading ? (
            <p className="empty-state">Calculando CLV...</p>
          ) : !clv || clv.sampleSize === 0 ? (
            <p className="empty-state">
              Aún no hay predicciones resueltas con cuota tomada y cierre. Ejecuta análisis, guarda
              predicciones y usa «Resolver predicciones finalizadas» en Mis Predicciones.
            </p>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>Muestra CLV</span>
                  <strong>{clv.sampleSize}</strong>
                </div>
                <div className="stat-card">
                  <span>CLV medio</span>
                  <strong className={clv.avgClvPercent >= 0 ? "positive" : "negative"}>
                    {clv.avgClvPercent >= 0 ? "+" : ""}
                    {clv.avgClvPercent}%
                  </strong>
                </div>
                <div className="stat-card">
                  <span>CLV positivo</span>
                  <strong>{clv.positiveClvRate}%</strong>
                </div>
                <div className="stat-card">
                  <span>Cuota tomada → cierre</span>
                  <strong>
                    {clv.avgTakenOdds.toFixed(2)} → {clv.avgClosingOdds.toFixed(2)}
                  </strong>
                </div>
              </div>
              {clv.byLeague.length > 0 && (
                <div className="oi-table-wrap">
                  <table className="oi-table">
                    <thead>
                      <tr>
                        <th>Liga</th>
                        <th>Muestra</th>
                        <th>CLV medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clv.byLeague.map((row) => (
                        <tr key={row.leagueId}>
                          <td>{row.leagueId}</td>
                          <td>{row.sampleSize}</td>
                          <td className={row.avgClvPercent >= 0 ? "positive" : "negative"}>
                            {row.avgClvPercent >= 0 ? "+" : ""}
                            {row.avgClvPercent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </article>

        <article className="panel workspace-panel">
          <div className="panel-head">
            <h2>
              <BarChart3 size={18} /> Error de cuotas agregado
            </h2>
            <div className="oi-toggle">
              <button
                type="button"
                className={groupBy === "league" ? "active" : ""}
                onClick={() => setGroupBy("league")}
              >
                Por liga
              </button>
              <button
                type="button"
                className={groupBy === "market" ? "active" : ""}
                onClick={() => setGroupBy("market")}
              >
                Por mercado
              </button>
            </div>
          </div>
          {reportQuery.isLoading ? (
            <p className="empty-state">Escaneando {selectedDate}...</p>
          ) : !report ? (
            <p className="empty-state">No hay datos de calidad para esta fecha.</p>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>Partidos escaneados</span>
                  <strong>{report.summary.fixturesScanned}</strong>
                </div>
                <div className="stat-card">
                  <span>Multi-bookmaker</span>
                  <strong>{report.summary.fixturesWithMultiBook}</strong>
                </div>
                <div className="stat-card">
                  <span>Spread medio</span>
                  <strong>{report.summary.avgSpreadPercent}%</strong>
                </div>
              </div>
              <div className="oi-table-wrap">
                <table className="oi-table">
                  <thead>
                    <tr>
                      <th>{groupBy === "league" ? "Liga" : "Mercado"}</th>
                      <th>Muestras</th>
                      <th>Spread medio</th>
                      <th>Outlier medio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.buckets.slice(0, 12).map((bucket) => (
                      <tr key={bucket.key}>
                        <td>{bucket.label}</td>
                        <td>{bucket.sampleSize}</td>
                        <td>{bucket.avgSpreadPercent}%</td>
                        <td>{bucket.avgOutlierPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {topSpreadFixtures.length > 0 && (
                <div className="oi-fixture-list">
                  <h3>Partidos con mayor discrepancia entre bookmakers</h3>
                  {topSpreadFixtures.map((row) => (
                    <button
                      key={row.fixtureId}
                      type="button"
                      className="oi-fixture-row"
                      onClick={() => onOpenFixture?.(row.fixtureId)}
                    >
                      <span>
                        {row.home} vs {row.away}
                      </span>
                      <strong>{row.avgSpreadPercent}% spread</strong>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </article>
      </div>

      <article className="panel workspace-panel">
        <div className="panel-head">
          <h2>
            <ArrowLeftRight size={18} /> Comparación de bookmakers
          </h2>
          {selectedFixture ? (
            <span>
              {selectedFixture.home.name} vs {selectedFixture.away.name}
            </span>
          ) : (
            <span>Selecciona un partido en Match Center</span>
          )}
        </div>

        {!selectedFixture ? (
          <div className="empty-state">
            Elige un partido para comparar cuotas entre casas.
            {onOpenMatchCenter ? (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="qa-btn-primary" onClick={onOpenMatchCenter}>
                  Ir a Match Center
                </button>
              </div>
            ) : null}
          </div>
        ) : compareQuery.isLoading ? (
          <p className="empty-state">Cargando cuotas multi-bookmaker...</p>
        ) : !compare || compare.bookmakers.length < 2 ? (
          <p className="empty-state">
            Este partido no tiene suficientes bookmakers en el proveedor para comparar.
          </p>
        ) : (
          <>
            <div className="oi-bookmaker-pickers">
              <label>
                <span>Bookmaker A</span>
                <select value={bookmakerA} onChange={(e) => setBookmakerA(e.target.value)}>
                  <option value="">Auto</option>
                  {bookmakers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Bookmaker B</span>
                <select value={bookmakerB} onChange={(e) => setBookmakerB(e.target.value)}>
                  <option value="">Auto</option>
                  {bookmakers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="oi-table-wrap">
              <table className="oi-table">
                <thead>
                  <tr>
                    <th>Mercado</th>
                    {compare.bookmakers.slice(0, 4).map((name) => (
                      <th key={name}>{name}</th>
                    ))}
                    <th>Spread</th>
                    <th>Outlier</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.rows.map((row) => (
                    <tr key={row.marketKey}>
                      <td>{row.label}</td>
                      {compare.bookmakers.slice(0, 4).map((name) => (
                        <td key={name}>{row.oddsByBookmaker[name]?.toFixed(2) ?? "—"}</td>
                      ))}
                      <td>{row.spreadPercent}%</td>
                      <td>
                        {row.outlierBookmaker
                          ? `${row.outlierBookmaker} (${row.outlierDeviationPercent}%)`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <article className="panel workspace-panel">
        <div className="panel-head">
          <h2>
            <Activity size={18} /> Movimiento de cuota (line movement)
          </h2>
          <label className="oi-threshold">
            <span>Umbral {movementThreshold}%</span>
            <input
              type="range"
              min={3}
              max={15}
              value={movementThreshold}
              onChange={(e) => setMovementThreshold(Number(e.target.value))}
            />
          </label>
        </div>
        {!selectedFixture ? (
          <p className="empty-state">
            Se registran snapshots en cada análisis. Selecciona un partido para ver movimientos.
          </p>
        ) : movementsQuery.isLoading ? (
          <p className="empty-state">Buscando movimientos...</p>
        ) : (movementsQuery.data?.movements.length ?? 0) === 0 ? (
          <p className="empty-state">
            Sin movimientos ≥ {movementThreshold}% todavía. Vuelve a analizar el partido más tarde
            para acumular historial.
          </p>
        ) : (
          <div className="oi-movement-list">
            {movementsQuery.data?.movements.map((move) => (
              <div key={`${move.marketKey}-${move.bookmaker}-${move.capturedAt}`} className="oi-movement-row">
                <div>
                  <strong>{move.label}</strong>
                  <span>
                    {move.bookmaker} · {move.previousOdds.toFixed(2)} → {move.currentOdds.toFixed(2)}
                  </span>
                </div>
                <b className={move.movementPercent > 0 ? "positive" : "negative"}>
                  {move.movementPercent > 0 ? "+" : ""}
                  {move.movementPercent}%
                </b>
              </div>
            ))}
          </div>
        )}
        <p className="oi-footnote">
          <Scale size={14} /> Las alertas tipo <strong>ODD_MOVEMENT</strong> usan estos snapshots.
          Crea una alerta en la pestaña Alertas con umbral en % de movimiento.
        </p>
      </article>
    </section>
  );
}
