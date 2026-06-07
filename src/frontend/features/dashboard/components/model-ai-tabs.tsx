"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Calculator,
  Gauge,
  GitBranch,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import type { ModelMode, ScenarioId } from "../dashboard-config";
import { buildModelRuns } from "../model-runs-builder";
import { useMLStatus } from "@/frontend/hooks/use-ml-status";
import {
  MODEL_INVENTORY,
  MODEL_STATE_CLASS,
  agreementTone,
  sortValueTable,
  type ModelInventoryState,
} from "@/frontend/lib/model-ai-utils";
import { CONFIDENCE_THRESHOLDS } from "@/shared/confidence-thresholds";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function EnsembleTab({
  analysis,
  fixture,
  displayedConfidence,
}: {
  analysis: AnalysisResult;
  fixture: Fixture;
  displayedConfidence: number;
}) {
  const ensemble = analysis.ensemble;
  if (!ensemble) {
    return (
      <div className="mai-empty">
        <p>Ensemble no disponible para este análisis.</p>
      </div>
    );
  }

  const tone = agreementTone(ensemble.modelAgreement);
  const models = ensemble.models;
  const modelList = [
    { key: "poisson", name: "Poisson Bivariado", desc: "Distribución de goles con xG esperados", color: "#34d399" },
    { key: "negBinom", name: "Binomial Negativa", desc: "Sobredispersión para partidos volátiles", color: "#f59e0b" },
    { key: "elo", name: "ELO Rating", desc: "Fuerza dinámica por posición y puntos", color: "#8b5cf6" },
    { key: "form", name: "Forma Ponderada", desc: "Momentum de últimos 5 partidos", color: "#f43f5e" },
  ] as const;

  return (
    <div className="mai-ensemble">
      <div className={`mai-agreement mai-agreement-${tone}`}>
        <div className="mai-agreement-bar">
          <div className="mai-agreement-fill" style={{ width: `${ensemble.modelAgreement}%` }} />
        </div>
        <div className="mai-agreement-info">
          <span>
            Acuerdo entre modelos: <strong>{ensemble.modelAgreement}%</strong>
          </span>
          <span>
            Dominante: <strong>{ensemble.dominantModel}</strong>
          </span>
          <span>
            Confianza ajustada: <strong>{displayedConfidence}%</strong>
          </span>
        </div>
      </div>

      <div className="mai-rec-card">
        <div>
          <span>Mercado recomendado</span>
          <strong>{analysis.recommendation.market}</strong>
          <p>{analysis.recommendation.rationale}</p>
        </div>
        <div className="mai-rec-metrics">
          <b>{analysis.recommendation.stakeUnits}u</b>
          <small>stake sugerido</small>
        </div>
      </div>

      {analysis.riskFlags.length > 0 && (
        <div className="mai-risk-flags">
          {analysis.riskFlags.map((flag) => (
            <span key={flag.id} className={`mai-risk-chip ${flag.severity}`}>
              <AlertTriangle size={12} /> {flag.label}
            </span>
          ))}
        </div>
      )}

      <div className="mai-models-grid">
        {modelList.map(({ key, name, desc, color }) => {
          const m = models[key];
          if (!m) return null;
          return (
            <div key={key} className="mai-model-card" style={{ borderTopColor: color }}>
              <div className="mai-model-card-head">
                <strong>{name}</strong>
                <span className="mai-model-weight" style={{ background: `${color}22`, color }}>
                  {Math.round(m.weight * 100)}%
                </span>
              </div>
              <p className="mai-model-desc">{desc}</p>
              <div className="mai-model-probs">
                {([
                  ["Local", m.homeWin],
                  ["Empate", m.draw],
                  ["Visita", m.awayWin],
                ] as const).map(([label, value]) => (
                  <div key={label} className="mai-prob-row">
                    <span>{label}</span>
                    <div className="mai-prob-bar">
                      <div style={{ width: `${value}%`, background: color }} />
                    </div>
                    <b>{value}%</b>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mai-ensemble-result">
        <h4>Resultado ensemble (ponderado)</h4>
        <div className="mai-ensemble-final">
          <div className="mai-final-item home">
            <span>{fixture.home.name}</span>
            <b>{ensemble.homeWin}%</b>
          </div>
          <div className="mai-final-item draw">
            <span>Empate</span>
            <b>{ensemble.draw}%</b>
          </div>
          <div className="mai-final-item away">
            <span>{fixture.away.name}</span>
            <b>{ensemble.awayWin}%</b>
          </div>
        </div>
      </div>

      {analysis.topExactScores.length > 0 && (
        <div className="mai-scores-block">
          <h4>Marcadores exactos más probables</h4>
          <div className="mai-scores-grid">
            {analysis.topExactScores.slice(0, 6).map((row) => (
              <div key={row.score} className="mai-score-chip">
                <strong>{row.score}</strong>
                <span>{row.probability}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ValueTab({
  analysis,
  minEdge,
  onMinEdgeChange,
}: {
  analysis: AnalysisResult;
  minEdge: number;
  onMinEdgeChange: (value: number) => void;
}) {
  const rows = sortValueTable(analysis, minEdge);

  return (
    <div className="mai-value">
      <div className="mai-value-header">
        <h4>
          <Target size={16} /> Tabla de valor — modelo vs mercado
        </h4>
        <div className="mai-value-filters">
          {[0, 2, 4, 8].map((edge) => (
            <button
              key={edge}
              type="button"
              className={minEdge === edge ? "active" : ""}
              onClick={() => onMinEdgeChange(edge)}
            >
              Edge ≥ {edge}%
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mai-kelly-empty">
          <AlertTriangle size={24} />
          <p>No hay mercados con edge ≥ {minEdge}% en este partido.</p>
        </div>
      ) : (
        <div className="mai-value-table">
          <div className="mai-value-row header">
            <span>Mercado</span>
            <span>Modelo</span>
            <span>Mercado</span>
            <span>Edge</span>
            <span>Veredicto</span>
          </div>
          {rows.map((row) => (
            <div key={row.market} className={`mai-value-row ${row.edge >= 4 ? "positive" : row.edge > 0 ? "mild" : ""}`}>
              <strong>{row.market}</strong>
              <span>{row.modelProbability}%</span>
              <span>{row.marketProbability}%</span>
              <b>{row.edge > 0 ? "+" : ""}{row.edge}%</b>
              <small>{row.verdict}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AllModelsTab({
  analysis,
  filter,
  onFilterChange,
}: {
  analysis: AnalysisResult;
  filter: ModelInventoryState | "all";
  onFilterChange: (value: ModelInventoryState | "all") => void;
}) {
  const { data: mlStatus } = useMLStatus();
  const filtered = MODEL_INVENTORY.filter((model) => filter === "all" || model.state === filter);
  const counts = MODEL_INVENTORY.reduce(
    (acc, model) => {
      acc[model.state] += 1;
      return acc;
    },
    { real: 0, ml: 0, partial: 0, planned: 0, blocked: 0 }
  );

  return (
    <div className="mai-all-models">
      <div className="mai-ml-status">
        <div>
          <h4>Servicio ML (Python)</h4>
          <p>
            {mlStatus?.available
              ? `Conectado · ${mlStatus.models.length} modelos cargados`
              : "No disponible — ensemble estadístico activo"}
          </p>
        </div>
        <span className={`mai-ml-pill ${mlStatus?.available ? "on" : "off"}`}>
          {mlStatus?.available ? "ONLINE" : "OFFLINE"}
        </span>
      </div>

      <div className="mai-all-header">
        <h4>
          <BrainCircuit size={16} /> Inventario auditado
        </h4>
        <p>
          Real {counts.real} · ML {counts.ml} · Parcial {counts.partial} · Pendiente {counts.planned} · Bloqueado{" "}
          {counts.blocked}
        </p>
      </div>

      <div className="mai-pills">
        {(["all", "real", "ml", "partial", "planned", "blocked"] as const).map((state) => (
          <button
            key={state}
            type="button"
            className={filter === state ? "active" : ""}
            onClick={() => onFilterChange(state)}
          >
            {state === "all" ? "Todos" : state.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="mai-all-grid">
        {filtered.map((model, index) => (
          <div key={model.name} className="mai-all-card">
            <div className="mai-all-card-num">{index + 1}</div>
            <div className="mai-all-card-info">
              <strong>{model.name}</strong>
              <span>{model.desc}</span>
            </div>
            <span className={`mai-all-status ${MODEL_STATE_CLASS[model.state]}`}>{model.label}</span>
          </div>
        ))}
      </div>

      <div className="mai-radar-section">
        <h4>
          <Activity size={16} /> Radar de señales (8 ejes)
        </h4>
        <div className="mai-radar-values">
          {analysis.radar.map((r) => (
            <div key={r.axis} className="mai-radar-item">
              <span>{r.axis}</span>
              <div className="mai-radar-bar">
                <div className="home" style={{ width: `${r.home}%` }} />
                <div className="away" style={{ width: `${r.away}%` }} />
              </div>
              <b>{r.home}/{r.away}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EngineBadge({ engine }: { engine?: string }) {
  if (!engine) return null;
  const isPython = engine !== "typescript" && !engine.includes("fallback");
  return (
    <span className={`mai-engine-badge ${isPython ? "python" : "ts"}`} title={engine}>
      {isPython ? "Python" : "TS"}
    </span>
  );
}

export function AdvancedTab({ analysis, fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const advanced = analysis.advancedModels;
  const sources = advanced?.modelSources;
  if (!advanced) {
    return (
      <div className="mai-empty">
        <Sparkles size={32} />
        <strong>Modelos avanzados no incluidos</strong>
        <p>Este análisis no trae salida extendida (Dixon-Coles, Skellam, Kalman, Hawkes, etc.). Re-ejecuta el análisis.</p>
      </div>
    );
  }

  return (
    <div className="mai-advanced">
      <div className="mai-adv-grid">
        <div className="mai-adv-card">
          <h4>Bivariate Poisson <EngineBadge engine={sources?.bivariatePoisson} /></h4>
          <div className="mai-features">
            <div><span>κ covarianza</span><b>{advanced.bivariatePoisson.kappa}</b></div>
            <div><span>1X2</span><b>{advanced.bivariatePoisson.homeWin}/{advanced.bivariatePoisson.draw}/{advanced.bivariatePoisson.awayWin}</b></div>
            <div><span>λ L/V</span><b>{advanced.bivariatePoisson.lambdaHome}/{advanced.bivariatePoisson.lambdaAway}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Temporal 70/30 <EngineBadge engine={sources?.temporalBlend} /></h4>
          <div className="mai-features">
            <div><span>Peso reciente</span><b>{(advanced.temporalBlend.recentWeight * 100).toFixed(0)}%</b></div>
            <div><span>xG blend</span><b>{advanced.temporalBlend.blendedHomeXg}/{advanced.temporalBlend.blendedAwayXg}</b></div>
            <div><span>1X2</span><b>{advanced.temporalBlend.homeWin}/{advanced.temporalBlend.draw}/{advanced.temporalBlend.awayWin}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Time Series <EngineBadge engine={sources?.timeSeries} /></h4>
          <div className="mai-features">
            <div><span>Prophet trend</span><b>{advanced.timeSeries.prophetTrend}</b></div>
            <div><span>ARIMA / SARIMA / TFT</span><b>{advanced.timeSeries.arimaHomeWin}/{advanced.timeSeries.sarimaHomeWin}/{advanced.timeSeries.tftHomeWin}</b></div>
            <div><span>Ensemble 1X2</span><b>{advanced.timeSeries.ensembleHomeWin}/{advanced.timeSeries.ensembleDraw}/{advanced.timeSeries.ensembleAwayWin}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Primer tiempo <EngineBadge engine={sources?.halfTime} /></h4>
          <div className="mai-features">
            <div><span>1X2 HT</span><b>{advanced.halfTime.homeWinHT}/{advanced.halfTime.drawHT}/{advanced.halfTime.awayWinHT}</b></div>
            <div><span>Goles HT esp.</span><b>{advanced.halfTime.expectedGoalsHT}</b></div>
            <div><span>Over 0.5 HT</span><b>{advanced.halfTime.over05HT}%</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Corners / ESP <EngineBadge engine={sources?.cornersEsp} /></h4>
          <div className="mai-features">
            <div><span>Total esp.</span><b>{advanced.cornersEsp.expectedTotalCorners}</b></div>
            <div><span>L / V</span><b>{advanced.cornersEsp.homeCorners}/{advanced.cornersEsp.awayCorners}</b></div>
            <div><span>Over 9.5</span><b>{advanced.cornersEsp.over95Corners}%</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Tarjetas <EngineBadge engine={sources?.cardsRisk} /></h4>
          <div className="mai-features">
            <div><span>Amarillas esp.</span><b>{advanced.cardsRisk.expectedYellows}</b></div>
            <div><span>Rojas esp.</span><b>{advanced.cardsRisk.expectedReds}</b></div>
            <div><span>Riesgo alto</span><b>{advanced.cardsRisk.highCardRisk ? "Sí" : "No"}</b></div>
          </div>
        </div>
        {advanced.multiMarket && (
          <>
            <div className="mai-adv-card">
              <h4>Capa multi-mercado <EngineBadge engine={sources?.multiMarket} /></h4>
              <div className="mai-features">
                <div><span>Calibración</span><b>{advanced.multiMarket.calibration.marketCalibrationScore}%</b></div>
                <div><span>Filtro edge</span><b>{advanced.multiMarket.calibration.valueFilterScore}%</b></div>
                <div><span>Umbral edge</span><b>{advanced.multiMarket.calibration.edgeThreshold}%</b></div>
              </div>
            </div>
            <div className="mai-adv-card">
              <h4>Córners avanzado</h4>
              <div className="mai-features">
                <div><span>Motor</span><b>{advanced.multiMarket.corners.engine}</b></div>
                <div><span>Over 8.5 / 9.5</span><b>{advanced.multiMarket.corners.over85Corners}% / {advanced.multiMarket.corners.over95Corners}%</b></div>
                <div><span>PPDA proxy</span><b>{advanced.multiMarket.corners.ppdaProxy}</b></div>
              </div>
            </div>
            <div className="mai-adv-card">
              <h4>Tarjetas avanzado</h4>
              <div className="mai-features">
                <div><span>Motor</span><b>{advanced.multiMarket.cards.engine}</b></div>
                <div><span>Over 4.5</span><b>{advanced.multiMarket.cards.over45Cards}%</b></div>
                <div><span>Hawkes tensión</span><b>{advanced.multiMarket.cards.hawkesIntensity}%</b></div>
              </div>
            </div>
            <div className="mai-adv-card">
              <h4>Live / Props / Riesgo</h4>
              <div className="mai-features">
                <div><span>Game state</span><b>{advanced.multiMarket.live.gameStateIndex}%</b></div>
                <div><span>Props</span><b>{advanced.multiMarket.playerProps.status}</b></div>
                <div><span>Portfolio</span><b>{advanced.multiMarket.risk.portfolioMethod}</b></div>
              </div>
            </div>

            {/* --- Expected Threat & Field Tilt Visual Card --- */}
            <div className="mai-adv-card" style={{ gridColumn: "span 2", background: "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%)", borderColor: "rgba(99, 102, 241, 0.3)" }}>
              <h4 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Territorio y Amenaza (xT & Field Tilt)</span>
                <span className="mai-engine-badge python" style={{ background: "rgba(99, 102, 241, 0.15)", color: "#818cf8", border: "1px solid rgba(99, 102, 241, 0.35)" }}>Élite AI</span>
              </h4>
              <p className="mai-adv-note">Evaluación de dominio territorial y amenaza añadida en último tercio</p>
              
              <div style={{ padding: "8px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginBottom: "5px" }}>
                  <span>Field Tilt Local: <b>{advanced.multiMarket.expectedThreat?.fieldTilt ?? 50}%</b></span>
                  <span>Field Tilt Visita: <b>{round1(100 - (advanced.multiMarket.expectedThreat?.fieldTilt ?? 50))}%</b></span>
                </div>
                <div style={{ height: "10px", background: "rgba(255,255,255,0.06)", borderRadius: "5px", overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${advanced.multiMarket.expectedThreat?.fieldTilt ?? 50}%`, background: "linear-gradient(90deg, #3b82f6, #6366f1)", height: "100%" }} />
                  <div style={{ width: `${100 - (advanced.multiMarket.expectedThreat?.fieldTilt ?? 50)}%`, background: "linear-gradient(90deg, #f43f5e, #ec4899)", height: "100%" }} />
                </div>
              </div>

              <div className="mai-features" style={{ marginTop: "12px" }}>
                <div>
                  <span>xThreat Local</span>
                  <b>{advanced.multiMarket.expectedThreat?.homeXThreat.toFixed(2) ?? "0.00"} xT</b>
                </div>
                <div>
                  <span>xThreat Visita</span>
                  <b>{advanced.multiMarket.expectedThreat?.awayXThreat.toFixed(2) ?? "0.00"} xT</b>
                </div>
                <div>
                  <span>Dominancia</span>
                  <span style={{ 
                    background: (advanced.multiMarket.expectedThreat?.dominanceRatio ?? 1) >= 1.25 ? "rgba(52, 211, 153, 0.15)" : "rgba(244, 63, 94, 0.15)",
                    color: (advanced.multiMarket.expectedThreat?.dominanceRatio ?? 1) >= 1.25 ? "#34d399" : "#f43f5e",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontWeight: "bold",
                    fontSize: "11px"
                  }}>
                    {advanced.multiMarket.expectedThreat?.dominanceRatio.toFixed(2) ?? "1.00"}x
                  </span>
                </div>
              </div>
            </div>

            {/* --- Conformal Prediction 95% Confidence Intervals Visual Card --- */}
            <div className="mai-adv-card" style={{ background: "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%)", borderColor: "rgba(16, 185, 129, 0.3)" }}>
              <h4 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Intervalos Conformales 95%</span>
                <span className="mai-engine-badge ts" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.35)" }}>Calibrado</span>
              </h4>
              <p className="mai-adv-note">Intervalos de predicción calibrados matemáticamente libres de sesgo</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                  <span style={{ color: "var(--muted)" }}>Local Gana:</span>
                  <b style={{ color: "var(--text)" }}>[{advanced.multiMarket.conformalRange?.homeWinRange[0]}% - {advanced.multiMarket.conformalRange?.homeWinRange[1]}%]</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                  <span style={{ color: "var(--muted)" }}>Empate:</span>
                  <b style={{ color: "var(--text)" }}>[{advanced.multiMarket.conformalRange?.drawRange[0]}% - {advanced.multiMarket.conformalRange?.drawRange[1]}%]</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                  <span style={{ color: "var(--muted)" }}>Visita Gana:</span>
                  <b style={{ color: "var(--text)" }}>[{advanced.multiMarket.conformalRange?.awayWinRange[0]}% - {advanced.multiMarket.conformalRange?.awayWinRange[1]}%]</b>
                </div>
              </div>

              <div style={{ marginTop: "12px", textAlign: "center" }}>
                {advanced.multiMarket.conformalRange?.confidenceGuaranteed ? (
                  <span style={{ 
                    display: "inline-block", 
                    width: "100%", 
                    padding: "4px 8px", 
                    borderRadius: "6px", 
                    background: "rgba(52, 211, 153, 0.12)", 
                    color: "#34d399", 
                    fontSize: "10px", 
                    fontWeight: "bold",
                    textTransform: "uppercase"
                  }}>
                    🛡️ Garantía de Confianza Activa
                  </span>
                ) : (
                  <span style={{ 
                    display: "inline-block", 
                    width: "100%", 
                    padding: "4px 8px", 
                    borderRadius: "6px", 
                    background: "rgba(245, 158, 11, 0.12)", 
                    color: "#f59e0b", 
                    fontSize: "10px", 
                    fontWeight: "bold",
                    textTransform: "uppercase"
                  }}>
                    ⚠️ Especulativa (Varianza Alta)
                  </span>
                )}
              </div>
            </div>

            {/* --- Markov Chain MCMC Simulator Visual Card --- */}
            <div className="mai-adv-card" style={{ background: "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%)", borderColor: "rgba(139, 92, 246, 0.3)" }}>
              <h4 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Markov Chain MCMC</span>
                <span className="mai-engine-badge python" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", border: "1px solid rgba(139, 92, 246, 0.35)" }}>MCMC</span>
              </h4>
              <p className="mai-adv-note">Transiciones de estado simuladas minuto a minuto</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--muted)" }}>P(Gol por minuto):</span>
                  <b>{round2((advanced.multiMarket.mcmcSimulation?.transitionProbabilityGoal ?? 0) * 100)}%</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--muted)" }}>P(Córner por minuto):</span>
                  <b>{round2((advanced.multiMarket.mcmcSimulation?.transitionProbabilityCorner ?? 0) * 100)}%</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--muted)" }}>P(Tarjeta por minuto):</span>
                  <b>{round2((advanced.multiMarket.mcmcSimulation?.transitionProbabilityCard ?? 0) * 100)}%</b>
                </div>
              </div>

              <div style={{ marginTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--muted)", marginBottom: "4px" }}>
                  <span>Tensión del Partido:</span>
                  <b>{advanced.multiMarket.mcmcSimulation?.averageGameTension ?? 50}%</b>
                </div>
                <div style={{ height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ 
                    width: `${advanced.multiMarket.mcmcSimulation?.averageGameTension ?? 50}%`, 
                    background: "linear-gradient(90deg, #8b5cf6, #ec4899)", 
                    height: "100%" 
                  }} />
                </div>
              </div>
            </div>

            {/* --- Smart Money & Odds Dropping Tracker Visual Card --- */}
            <div className="mai-adv-card" style={{ 
              background: advanced.multiMarket.oddsDroppingTracker?.steamMoveDetected 
                ? "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.65) 100%)" 
                : "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%)", 
              borderColor: advanced.multiMarket.oddsDroppingTracker?.steamMoveDetected 
                ? "rgba(245, 158, 11, 0.4)" 
                : "var(--line)",
              transition: "all 0.3s ease"
            }}>
              <h4 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Smart Money & Steam Moves</span>
                <span className="mai-engine-badge ts" style={{ 
                  background: advanced.multiMarket.oddsDroppingTracker?.steamMoveDetected ? "rgba(245, 158, 11, 0.2)" : "rgba(255,255,255,0.06)", 
                  color: advanced.multiMarket.oddsDroppingTracker?.steamMoveDetected ? "#f59e0b" : "var(--muted)", 
                  border: advanced.multiMarket.oddsDroppingTracker?.steamMoveDetected ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--line)"
                }}>Steam Tracker</span>
              </h4>
              <p className="mai-adv-note">Seguimiento de caídas bruscas y flujos institucionales de dinero</p>
              
              <div className="mai-features" style={{ marginTop: "8px" }}>
                <div>
                  <span>Caída Cuota</span>
                  <b style={{ color: advanced.multiMarket.oddsDroppingTracker?.steamMoveDetected ? "#f59e0b" : "var(--text)" }}>
                    {advanced.multiMarket.oddsDroppingTracker?.dropPercent ?? 0}%
                  </b>
                </div>
                <div>
                  <span>Diferencia</span>
                  <b>{advanced.multiMarket.oddsDroppingTracker?.openingVsActiveDiff.toFixed(2) ?? "0.00"}</b>
                </div>
              </div>

              <div style={{ marginTop: "12px", textAlign: "center" }}>
                {advanced.multiMarket.oddsDroppingTracker?.steamMoveDetected ? (
                  <span style={{ 
                    display: "inline-block", 
                    width: "100%", 
                    padding: "5px 8px", 
                    borderRadius: "6px", 
                    background: "rgba(245, 158, 11, 0.15)", 
                    color: "#f59e0b", 
                    fontSize: "10px", 
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    boxShadow: "0 0 10px rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)"
                  }}>
                    🔥 Steam Move (Respaldo Institucional)
                  </span>
                ) : (
                  <span style={{ 
                    display: "inline-block", 
                    width: "100%", 
                    padding: "4px 8px", 
                    borderRadius: "6px", 
                    background: "rgba(255, 255, 255, 0.05)", 
                    color: "var(--muted)", 
                    fontSize: "10px", 
                    fontWeight: "bold"
                  }}>
                    Flujos de Mercado Estables
                  </span>
                )}
              </div>
            </div>
          </>
        )}
        <div className="mai-adv-card">
          <h4>xG blend <EngineBadge engine={sources?.xgModel} /></h4>
          <div className="mai-features">
            <div><span>xG L/V</span><b>{advanced.xgModel.homeXg}/{advanced.xgModel.awayXg}</b></div>
            <div><span>Total</span><b>{advanced.xgModel.totalXg}</b></div>
            <div><span>BTTS (xG)</span><b>{advanced.xgModel.bttsFromXg}%</b></div>
          </div>
        </div>
        <div className="mai-adv-card" style={{ gridColumn: "span 2" }}>
          <h4>Explicabilidad <EngineBadge engine={sources?.explainability} /></h4>
          <div className="mai-features" style={{ marginBottom: "12px" }}>
            <div><span>Método</span><b>{advanced.explainability.method}</b></div>
            <div><span>Driver Dominante</span><b>{advanced.explainability.topDrivers[0]?.feature ?? "—"} ({advanced.explainability.topDrivers[0]?.impact ?? 0})</b></div>
            <div><span>Outcome</span><b>{advanced.explainability.dominantOutcome}</b></div>
          </div>
          
          <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", fontWeight: "bold", display: "block", marginBottom: "8px" }}>
              Factores Clave (Valores SHAP)
            </span>
            {advanced.explainability.topDrivers && advanced.explainability.topDrivers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {advanced.explainability.topDrivers.map((driver) => {
                  const isPositive = driver.impact >= 0;
                  const absImpact = Math.abs(driver.impact);
                  const maxImpact = Math.max(
                    ...advanced.explainability.topDrivers.map((d) => Math.abs(d.impact)),
                    0.01
                  );
                  const barWidth = `${Math.min(100, (absImpact / maxImpact) * 100)}%`;
                  return (
                    <div key={driver.feature} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ flex: "1", minWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#94a3b8", fontSize: "11px" }} title={driver.feature}>
                        {driver.feature}
                      </span>
                      <div style={{ flex: "2", height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                        <div 
                          style={{ 
                            height: "100%", 
                            width: barWidth, 
                            background: isPositive ? "#34d399" : "#f43f5e", 
                            borderRadius: "4px",
                            transition: "width 0.3s ease" 
                          }} 
                        />
                      </div>
                      <span style={{ minWidth: "50px", textAlign: "right", fontSize: "11px", fontWeight: "bold", color: isPositive ? "#34d399" : "#f43f5e" }}>
                        {isPositive ? "+" : ""}{driver.impact.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <span style={{ fontSize: "11px", color: "#64748b" }}>Sin factores clave</span>
            )}
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>AutoML / Features</h4>
          <div className="mai-features">
            <div><span>Champion</span><b>{advanced.autoMl.championModel}</b></div>
            <div><span>RF / Optuna</span><b>{advanced.autoMl.randomForestEnabled ? "RF ✓" : "RF —"} / {advanced.autoMl.optunaEnabled ? "Optuna ✓" : "Optuna —"}</b></div>
            <div><span>TSFresh proxy</span><b>{advanced.featureEngineering.tsfreshProxyScore}% ({advanced.featureEngineering.rollingFeatureCount} feats)</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>GNN / Causal / Survival <EngineBadge engine={sources?.causalSurvival} /></h4>
          <div className="mai-features">
            <div><span>GNN delta</span><b>{advanced.causalSurvival.gnnDelta}</b></div>
            <div><span>Causal lift</span><b>{advanced.causalSurvival.causalLift}%</b></div>
            <div><span>Sin gol 60&apos;</span><b>{advanced.causalSurvival.survivalProbNoGoal60}%</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Optimizador de cartera <EngineBadge engine={sources?.quantumOptimizer} /></h4>
          <p className="mai-adv-note">Heurístico de exposición — no es computación cuántica real.</p>
          <div className="mai-features">
            <div><span>Método</span><b>{advanced.quantumOptimizer.method}</b></div>
            <div><span>Exposición</span><b>{advanced.quantumOptimizer.optimalExposure}u</b></div>
            <div><span>Top mercado</span><b>{advanced.quantumOptimizer.topMarket ?? "—"}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>ML Ops <EngineBadge engine={sources?.mlOps} /></h4>
          <div className="mai-features">
            <div><span>Drift</span><b>{advanced.mlOps.driftScore} ({advanced.mlOps.driftStatus})</b></div>
            <div><span>Features</span><b>{advanced.mlOps.featureCompleteness}%</b></div>
            <div><span>Quality gate</span><b>{advanced.mlOps.qualityGatePassed ? "PASS" : "FAIL"}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Dixon-Coles</h4>
          <div className="mai-features">
            <div><span>ρ</span><b>{advanced.dixonColes.rho}</b></div>
            <div><span>P(0-0)</span><b>{advanced.dixonColes.prob00}%</b></div>
            <div><span>P(1-1)</span><b>{advanced.dixonColes.prob11}%</b></div>
          </div>
        </div>
        {advanced.hybridPipeline?.active && (
          <div className="mai-adv-card">
            <h4>Pipeline híbrido DC→XGB</h4>
            <div className="mai-features">
              <div><span>λ local</span><b>{advanced.hybridPipeline.lambdaLocal}</b></div>
              <div><span>μ visita</span><b>{advanced.hybridPipeline.muVisitante}</b></div>
              <div><span>Motor</span><b>{advanced.hybridPipeline.modelsUsed.join(", ")}</b></div>
              {advanced.hybridPipeline.dixonColes1x2 && (
                <div>
                  <span>DC 1X2</span>
                  <b>
                    {advanced.hybridPipeline.dixonColes1x2.homeWin}% / {advanced.hybridPipeline.dixonColes1x2.draw}% / {advanced.hybridPipeline.dixonColes1x2.awayWin}%
                  </b>
                </div>
              )}
              {advanced.hybridPipeline.marketPrior1x2 && (
                <div>
                  <span>Mercado 1X2</span>
                  <b>
                    {advanced.hybridPipeline.marketPrior1x2.homeWin}% / {advanced.hybridPipeline.marketPrior1x2.draw}% / {advanced.hybridPipeline.marketPrior1x2.awayWin}%
                  </b>
                </div>
              )}
            </div>
            {advanced.hybridPipeline.consistencyFlags && advanced.hybridPipeline.consistencyFlags.length > 0 && (
              <p className="mai-adv-note">
                Compuerta activa: {advanced.hybridPipeline.consistencyFlags.join(", ")}. El 1X2 final fue reconciliado antes de calcular value y Kelly.
              </p>
            )}
            {advanced.hybridPipeline.exactScoreTop.length > 0 && (
              <p className="mai-adv-note">
                Marcador top: {advanced.hybridPipeline.exactScoreTop.slice(0, 3).map((s) => `${s.score} (${s.probability}%)`).join(" · ")}
              </p>
            )}
          </div>
        )}
        <div className="mai-adv-card">
          <h4>Skellam / Handicap</h4>
          <div className="mai-features">
            <div><span>Diff esperado</span><b>{advanced.skellam.expectedDiff.toFixed(2)}</b></div>
            <div><span>AH -0.5 local</span><b>{(advanced.skellam.ahMinus05.home * 100).toFixed(1)}%</b></div>
            <div><span>AH -1 local</span><b>{(advanced.skellam.ahMinus1.home * 100).toFixed(1)}%</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Kalman</h4>
          <div className="mai-features">
            <div><span>Ataque local</span><b>{advanced.kalman.homeAttack.toFixed(2)}</b></div>
            <div><span>Ataque visita</span><b>{advanced.kalman.awayAttack.toFixed(2)}</b></div>
            <div><span>Tendencia</span><b>{advanced.kalman.homeTrend} / {advanced.kalman.awayTrend}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>xThreat</h4>
          <div className="mai-features">
            <div><span>Local</span><b>{advanced.xThreat.homeThreat}</b></div>
            <div><span>Visita</span><b>{advanced.xThreat.awayThreat}</b></div>
            <div><span>Dominancia</span><b>{advanced.xThreat.dominance}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Hawkes (live)</h4>
          <div className="mai-features">
            <div><span>Momentum L/V</span><b>{advanced.hawkes.homeMomentum}/{advanced.hawkes.awayMomentum}</b></div>
            <div><span>Gol en 10&apos;</span><b>{(advanced.hawkes.nextGoalIn10min * 100).toFixed(1)}%</b></div>
            <div><span>Goles esp.</span><b>{advanced.hawkes.expectedTotalGoals.toFixed(2)}</b></div>
          </div>
        </div>
        <div className="mai-adv-card">
          <h4>Bayesian</h4>
          <div className="mai-features">
            <div><span>1X2 post.</span><b>{advanced.bayesian.posterior.homeWin}/{advanced.bayesian.posterior.draw}/{advanced.bayesian.posterior.awayWin}</b></div>
            <div><span>Conf. update</span><b>{advanced.bayesian.updateConfidence}%</b></div>
            <div><span>xG restante</span><b>{advanced.bayesian.xgRemaining.home}/{advanced.bayesian.xgRemaining.away}</b></div>
          </div>
        </div>
      </div>

      {advanced.valueBets.bestBet && (
        <div className="mai-rec-card">
          <div>
            <span>Mejor apuesta por EV</span>
            <strong>{advanced.valueBets.bestBet.market}</strong>
            <p>Eficiencia mercado {advanced.valueBets.marketEfficiency}% · overround {advanced.valueBets.overround}%</p>
          </div>
          <div className="mai-rec-metrics">
            <b>{advanced.valueBets.bestBet.grade}</b>
            <small>EV {(advanced.valueBets.bestBet.ev * 100).toFixed(1)}%</small>
          </div>
        </div>
      )}

      {fixture.status === "live" && advanced.bayesian.keyEvents.length > 0 && (
        <div className="mai-events-section">
          <h4>Eventos clave (impacto bayesiano)</h4>
          <div className="mai-events-list">
            {advanced.bayesian.keyEvents.map((event) => (
              <div key={`${event.minute}-${event.event}`} className="mai-event-row">
                <span className="live-event-time">{event.minute}&apos;</span>
                <div className="live-event-info">
                  <strong>{event.event}</strong>
                  <small>{event.direction} · impacto {event.impact}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function KellyTab({ analysis, fixture: _fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const kelly = analysis.kelly;
  if (!kelly) {
    return (
      <div className="mai-empty">
        <p>Kelly Criterion no disponible.</p>
      </div>
    );
  }

  return (
    <div className="mai-kelly">
      <div className="mai-kelly-header">
        <h4>
          <TrendingUp size={16} /> Kelly fraccional — gestión de bankroll
        </h4>
        <p>Stake óptimo con Kelly al 25% para reducir varianza.</p>
      </div>

      <div className="mai-kelly-metrics">
        <div className="mai-kelly-metric">
          <span>Exposición</span>
          <b>{kelly.totalExposure}%</b>
          <small>del bankroll</small>
        </div>
        <div className="mai-kelly-metric">
          <span>ROI esperado</span>
          <b>{(kelly.expectedROI * 100).toFixed(1)}%</b>
          <small>por ciclo</small>
        </div>
        <div className="mai-kelly-metric">
          <span>Sharpe</span>
          <b>{kelly.sharpeRatio}</b>
          <small>riesgo/retorno</small>
        </div>
      </div>

      {analysis.advancedModels?.multiMarket?.qLearningStakes && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          padding: "16px",
          margin: "16px 0",
          border: "1px solid rgba(139, 92, 246, 0.25)",
          borderRadius: "10px",
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)",
        }}>
          <div>
            <span style={{ 
              display: "block", 
              fontSize: "10px", 
              color: "#a78bfa", 
              textTransform: "uppercase",
              fontWeight: "bold",
              letterSpacing: "0.05em"
            }}>
              Optimizador Reinforcement Learning (Q-Learning)
            </span>
            <strong style={{ display: "block", fontSize: "15px", margin: "4px 0", color: "#f8fafc" }}>
              Stakes Sugeridos por Agente RL
            </strong>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: "1.4" }}>
              {analysis.advancedModels.multiMarket.qLearningStakes.stateDescription} · Win Rate Reciente: {round1(analysis.advancedModels.multiMarket.qLearningStakes.recentWinRate * 100)}%
            </p>
          </div>
          
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>Acción RL</span>
              <strong style={{ 
                color: analysis.advancedModels.multiMarket.qLearningStakes.optimalAction === "aggressive" ? "#34d399" : analysis.advancedModels.multiMarket.qLearningStakes.optimalAction === "conservative" ? "#f43f5e" : "#f59e0b",
                fontSize: "11px",
                textTransform: "uppercase",
                background: analysis.advancedModels.multiMarket.qLearningStakes.optimalAction === "aggressive" ? "rgba(52, 211, 153, 0.12)" : analysis.advancedModels.multiMarket.qLearningStakes.optimalAction === "conservative" ? "rgba(244, 63, 94, 0.12)" : "rgba(245, 158, 11, 0.12)",
                padding: "2px 8px",
                borderRadius: "4px",
                display: "inline-block",
                marginTop: "4px",
                fontWeight: "bold"
              }}>
                {analysis.advancedModels.multiMarket.qLearningStakes.optimalAction}
              </strong>
            </div>
            
            <div style={{ textAlign: "right", minWidth: "80px" }}>
              <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>Stake RL</span>
              <b style={{ display: "block", fontSize: "22px", color: "#a78bfa" }}>
                {analysis.advancedModels.multiMarket.qLearningStakes.suggestedStakes.toFixed(1)}u
              </b>
            </div>
          </div>
        </div>
      )}

      {kelly.bets.length > 0 ? (
        <div className="mai-kelly-bets">
          <h4>Apuestas recomendadas ({kelly.bets.length})</h4>
          {kelly.bets.map((bet, index) => (
            <div key={`${bet.market}-${index}`} className={`mai-kelly-bet ${bet.riskLevel}`}>
              <div className="mai-kelly-bet-top">
                <strong>{bet.market}</strong>
                <span className={`mai-kelly-badge ${bet.riskLevel}`}>
                  {bet.riskLevel === "high" ? "AGRESIVA" : bet.riskLevel === "medium" ? "ESTÁNDAR" : "CONSERVADORA"}
                </span>
              </div>
              <div className="mai-kelly-bet-stats">
                <div>
                  <span>Stake</span>
                  <b>{bet.stakeUnits}u</b>
                </div>
                <div>
                  <span>Edge</span>
                  <b>+{bet.edge}%</b>
                </div>
                <div>
                  <span>EV</span>
                  <b>{(bet.expectedValue * 100).toFixed(1)}%</b>
                </div>
              </div>
              <p className="mai-kelly-bet-rec">{bet.recommendation}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mai-kelly-empty">
          <AlertTriangle size={24} />
          <p>No hay mercados con edge suficiente según Kelly.</p>
        </div>
      )}

      <div className="mai-kelly-explain">
        <h4>Reglas aplicadas</h4>
        <ul>
          <li>
            <b>Kelly fraccional 25%:</b> reduce varianza vs Kelly pleno
          </li>
          <li>
            <b>Cap 1%:</b> máximo por mercado individual
          </li>
          <li>
            <b>Edge mínimo 2%:</b> filtro de ruido de mercado
          </li>
        </ul>
      </div>
    </div>
  );
}

export function PipelineTab({
  analysis,
  fixture,
  modelMode,
  scenario,
  displayedConfidence,
  riskLevel,
  onModeChange,
  onScenarioChange,
}: {
  analysis: AnalysisResult;
  fixture: Fixture;
  modelMode: ModelMode;
  scenario: ScenarioId;
  displayedConfidence: number;
  riskLevel: string;
  onModeChange: (m: ModelMode) => void;
  onScenarioChange: (s: ScenarioId) => void;
}) {
  const runs = buildModelRuns(fixture, analysis, displayedConfidence, riskLevel, modelMode);

  return (
    <div className="mai-pipeline">
      <div className="mai-pipe-section">
        <h4>
          <GitBranch size={16} /> Pipeline de ejecución
        </h4>
        <div className="mai-pipe-steps">
          {[
            ["Input", "Fixture + stats API"],
            ["xG", "Poisson ataque/defensa"],
            ["Ensemble", "4 modelos ponderados"],
            ["Valor", "Edge vs cuotas"],
            ["Kelly", "Stake óptimo"],
            ["Penalizaciones", "Confianza ajustada"],
            ["Output", "Recomendación"],
          ].map(([title, desc], index) => (
            <div key={title} className="mai-pipe-step done">
              <span>{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <small>{desc}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mai-pipe-section">
        <h4>
          <Activity size={16} /> Micro-checks ({runs.length})
        </h4>
        <div className="mai-runs-grid">
          {runs.map((run) => (
            <div key={run.id} className="mai-run-card">
              <div className="mai-run-head">
                <strong>{run.name}</strong>
                <span>{run.score}</span>
              </div>
              <p>{run.output}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mai-pipe-section">
        <h4>
          <SlidersHorizontal size={16} /> Modo del modelo
        </h4>
        <div className="mai-mode-grid">
          {(["Conservador", "Balanceado", "Agresivo"] as const).map((mode) => (
            <button
              type="button"
              className={`mai-mode-btn ${modelMode === mode ? "active" : ""}`}
              key={mode}
              onClick={() => onModeChange(mode)}
            >
              <strong>{mode}</strong>
              <span>
                {mode === "Conservador"
                  ? "Menor stake, más penalizaciones"
                  : mode === "Agresivo"
                    ? "Mayor sensibilidad al edge"
                    : "Balance estándar"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mai-pipe-section">
        <h4>
          <ShieldAlert size={16} /> Escenarios
        </h4>
        <div className="mai-mode-grid">
          {(["base", "lineups", "rotation", "weather"] as const).map((s) => (
            <button
              type="button"
              className={`mai-mode-btn ${scenario === s ? "active" : ""}`}
              key={s}
              onClick={() => onScenarioChange(s)}
            >
              <strong>
                {s === "base" ? "Base" : s === "lineups" ? "Once confirmado" : s === "rotation" ? "Rotación" : "Clima"}
              </strong>
              <span>
                {s === "base" ? "Sin ajustes" : s === "lineups" ? "+4 confianza" : s === "rotation" ? "-9 confianza" : "-5 confianza"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mai-pipe-section">
        <h4>
          <Gauge size={16} /> Confianza: {displayedConfidence}%
        </h4>
        <div className="mai-confidence-bar">
          <div
            className="mai-conf-fill"
            style={{
              width: `${displayedConfidence}%`,
              background:
                displayedConfidence >= CONFIDENCE_THRESHOLDS.bet
                  ? "#34d399"
                  : displayedConfidence >= CONFIDENCE_THRESHOLDS.caution
                    ? "#f59e0b"
                    : "#f43f5e",
            }}
          />
        </div>
        <div className="mai-penalties">
          {analysis.confidence.penalties.map((p) => (
            <div key={p.id} className="mai-penalty-row">
              <span>{p.label}</span>
              <b>-{p.points}</b>
            </div>
          ))}
          {analysis.confidence.penalties.length === 0 && <span className="mai-no-penalties">Sin penalizaciones</span>}
        </div>
      </div>

      <div className="mai-pipe-section">
        <h4>
          <Calculator size={16} /> Features del partido
        </h4>
        <div className="mai-features">
          <div>
            <span>Tier</span>
            <b>{fixture.coverage.tier}</b>
          </div>
          <div>
            <span>Forma L/V</span>
            <b>
              {fixture.home.form.join("-")} / {fixture.away.form.join("-")}
            </b>
          </div>
          <div>
            <span>GF</span>
            <b>
              {fixture.home.goalsFor} / {fixture.away.goalsFor}
            </b>
          </div>
          <div>
            <span>Descanso</span>
            <b>
              {fixture.home.restDays}d / {fixture.away.restDays}d
            </b>
          </div>
          <div>
            <span>Viaje</span>
            <b>{fixture.away.travelKm} km</b>
          </div>
          <div>
            <span>Odds</span>
            <b>{fixture.coverage.hasOdds ? "Real" : "No"}</b>
          </div>
          <div>
            <span>xG</span>
            <b>{fixture.coverage.hasXg ? "Real" : "Proxy"}</b>
          </div>
          <div>
            <span>Lineups</span>
            <b>{fixture.coverage.hasLineups ? "Sí" : "No"}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompareTab({ analysis, fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const ensemble = analysis.ensemble;
  if (!ensemble) {
    return (
      <div className="mai-empty">
        <p>Datos de ensemble no disponibles.</p>
      </div>
    );
  }

  const models = [
    { name: "Poisson", ...ensemble.models.poisson, color: "#34d399" },
    { name: "Neg. Binomial", ...ensemble.models.negBinom, color: "#f59e0b" },
    { name: "ELO", ...ensemble.models.elo, color: "#8b5cf6" },
    { name: "Forma", ...ensemble.models.form, color: "#f43f5e" },
  ];
  const maxProb = Math.max(...models.map((m) => Math.max(m.homeWin, m.draw, m.awayWin)));

  return (
    <div className="mai-compare">
      <div className="mai-compare-section">
        <h4>
          <BarChart3 size={16} /> Comparación visual
        </h4>
        <div className="mai-chart-legend">
          <span className="mai-legend-item">
            <span style={{ background: "#34d399" }} /> Local
          </span>
          <span className="mai-legend-item">
            <span style={{ background: "#f59e0b" }} /> Empate
          </span>
          <span className="mai-legend-item">
            <span style={{ background: "#f43f5e" }} /> Visita
          </span>
        </div>
        <div className="mai-chart">
          {models.map((model) => (
            <div key={model.name} className="mai-chart-group">
              <span className="mai-chart-label">{model.name}</span>
              <div className="mai-chart-bars">
                <div className="mai-chart-bar home" style={{ height: `${(model.homeWin / maxProb) * 100}%` }}>
                  <span>{model.homeWin}%</span>
                </div>
                <div className="mai-chart-bar draw" style={{ height: `${(model.draw / maxProb) * 100}%` }}>
                  <span>{model.draw}%</span>
                </div>
                <div className="mai-chart-bar away" style={{ height: `${(model.awayWin / maxProb) * 100}%` }}>
                  <span>{model.awayWin}%</span>
                </div>
              </div>
              <span className="mai-chart-weight">Peso {Math.round(model.weight * 100)}%</span>
            </div>
          ))}
          <div className="mai-chart-group ensemble">
            <span className="mai-chart-label">ENSEMBLE</span>
            <div className="mai-chart-bars">
              <div className="mai-chart-bar home" style={{ height: `${(ensemble.homeWin / maxProb) * 100}%` }}>
                <span>{ensemble.homeWin}%</span>
              </div>
              <div className="mai-chart-bar draw" style={{ height: `${(ensemble.draw / maxProb) * 100}%` }}>
                <span>{ensemble.draw}%</span>
              </div>
              <div className="mai-chart-bar away" style={{ height: `${(ensemble.awayWin / maxProb) * 100}%` }}>
                <span>{ensemble.awayWin}%</span>
              </div>
            </div>
            <span className="mai-chart-weight">Final</span>
          </div>
        </div>
      </div>

      <div className="mai-compare-section">
        <h4>
          <AlertTriangle size={16} /> Divergencia entre modelos
        </h4>
        <div className="mai-divergence">
          {(["homeWin", "draw", "awayWin"] as const).map((key, index) => {
            const labels = ["Local gana", "Empate", "Visita gana"];
            const vals = models.map((m) => m[key]);
            const spread = (Math.max(...vals) - Math.min(...vals)).toFixed(1);
            return (
              <div key={key} className="mai-div-row">
                <span>{labels[index]}</span>
                <b>Rango {spread}%</b>
                <small>
                  {Math.min(...vals).toFixed(1)}% — {Math.max(...vals).toFixed(1)}%
                </small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mai-compare-section">
        <h4>
          <TrendingUp size={16} /> Cobertura de señales
        </h4>
        <div className="mai-accuracy">
          {[
            { name: "Cuotas", value: fixture.coverage.hasOdds ? 100 : 0, label: fixture.coverage.hasOdds ? "OK" : "No" },
            { name: "xG", value: fixture.coverage.hasXg ? 100 : 45, label: fixture.coverage.hasXg ? "Real" : "Proxy" },
            { name: "Lineups", value: fixture.coverage.hasLineups ? 100 : 35, label: fixture.coverage.hasLineups ? "OK" : "Pendiente" },
            { name: "H2H", value: fixture.coverage.hasH2H ? 100 : 30, label: fixture.coverage.hasH2H ? "OK" : "Limitado" },
          ].map((signal) => (
            <div key={signal.name} className="mai-accuracy-row">
              <span className="mai-acc-name">{signal.name}</span>
              <div className="mai-acc-bar">
                <div style={{ width: `${signal.value}%` }} />
              </div>
              <b>{signal.label}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SimulateTab({ analysis, fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const matches = fixture.home.matchesPlayed || 18;
  const baseHomeXg = fixture.coverage.hasXg ? fixture.home.xgFor / matches : fixture.home.goalsFor / matches;
  const baseAwayXg = fixture.coverage.hasXg ? fixture.away.xgFor / matches : fixture.away.goalsFor / matches;

  const [homeXg, setHomeXg] = useState(Math.round(baseHomeXg * 100) / 100);
  const [awayXg, setAwayXg] = useState(Math.round(baseAwayXg * 100) / 100);

  const simResults = useMemo(() => {
    const poisson = (lambda: number, k: number) => {
      let fact = 1;
      for (let i = 2; i <= k; i++) fact *= i;
      return (Math.exp(-lambda) * lambda ** k) / fact;
    };

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let over25 = 0;
    let btts = 0;
    for (let h = 0; h <= 7; h++) {
      for (let a = 0; a <= 7; a++) {
        const p = poisson(homeXg, h) * poisson(awayXg, a);
        if (h > a) homeWin += p;
        else if (h === a) draw += p;
        else awayWin += p;
        if (h + a >= 3) over25 += p;
        if (h > 0 && a > 0) btts += p;
      }
    }
    const total = homeWin + draw + awayWin;
    return {
      homeWin: Math.round((homeWin / total) * 1000) / 10,
      draw: Math.round((draw / total) * 1000) / 10,
      awayWin: Math.round((awayWin / total) * 1000) / 10,
      over25: Math.round(over25 * 1000) / 10,
      btts: Math.round(btts * 1000) / 10,
      totalGoals: Math.round((homeXg + awayXg) * 100) / 100,
    };
  }, [homeXg, awayXg]);

  const origProbs = analysis.probabilities;

  return (
    <div className="mai-simulate">
      <div className="mai-sim-header">
        <h4>
          <SlidersHorizontal size={16} /> Simulación interactiva xG
        </h4>
        <p>Ajusta xG esperado y compara contra el análisis original.</p>
      </div>

      <div className="mai-sim-sliders">
        <div className="mai-sim-slider">
          <div className="mai-sim-slider-head">
            <strong>{fixture.home.name}</strong>
            <b>{homeXg.toFixed(2)} xG</b>
          </div>
          <input
            type="range"
            min="0.2"
            max="4"
            step="0.05"
            value={homeXg}
            onChange={(event) => setHomeXg(parseFloat(event.target.value))}
            className="mai-range home"
          />
        </div>
        <div className="mai-sim-slider">
          <div className="mai-sim-slider-head">
            <strong>{fixture.away.name}</strong>
            <b>{awayXg.toFixed(2)} xG</b>
          </div>
          <input
            type="range"
            min="0.2"
            max="4"
            step="0.05"
            value={awayXg}
            onChange={(event) => setAwayXg(parseFloat(event.target.value))}
            className="mai-range away"
          />
        </div>
        <button
          type="button"
          className="mai-sim-reset"
          onClick={() => {
            setHomeXg(Math.round(baseHomeXg * 100) / 100);
            setAwayXg(Math.round(baseAwayXg * 100) / 100);
          }}
        >
          Resetear
        </button>
      </div>

      <div className="mai-sim-results">
        <h4>Comparación original vs simulación</h4>
        <div className="mai-sim-table">
          <div className="mai-sim-row header">
            <span>Mercado</span>
            <span>Original</span>
            <span>Sim</span>
            <span>Δ</span>
          </div>
          {([
            ["Local", origProbs.homeWin, simResults.homeWin],
            ["Empate", origProbs.draw, simResults.draw],
            ["Visita", origProbs.awayWin, simResults.awayWin],
            ["Over 2.5", origProbs.over25, simResults.over25],
            ["BTTS", origProbs.btts, simResults.btts],
          ] as const).map(([label, orig, sim]) => (
            <div key={label} className="mai-sim-row">
              <span>{label}</span>
              <span>{orig}%</span>
              <b>{sim}%</b>
              <span className={sim > orig ? "positive" : "negative"}>
                {sim - orig > 0 ? "+" : ""}
                {(sim - orig).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function exportAnalysisPDF(fixture: Fixture, analysis: AnalysisResult) {
  import("jspdf")
    .then(({ jsPDF }) => {
      const doc = new jsPDF();
      const margin = 15;
      let y = margin;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Football AI Analyzer — Análisis Completo", margin, y);
      y += 10;

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`${fixture.home.name} vs ${fixture.away.name}`, margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.text(`Liga: ${fixture.leagueName}`, margin, y);
      y += 10;

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Confianza: ${analysis.confidence.score}%`, margin, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`Mercado: ${analysis.recommendation.market} · Stake ${analysis.recommendation.stakeUnits}u`, margin, y);
      y += 8;

      if (analysis.ensemble) {
        doc.text(
          `Ensemble: L ${analysis.ensemble.homeWin}% E ${analysis.ensemble.draw}% V ${analysis.ensemble.awayWin}%`,
          margin,
          y
        );
        y += 8;
      }

      for (const row of analysis.valueTable.slice(0, 12)) {
        doc.text(`${row.market}: edge ${row.edge > 0 ? "+" : ""}${row.edge}%`, margin, y);
        y += 4;
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
      }

      doc.save(`analisis_${fixture.home.name}_vs_${fixture.away.name}.pdf`.replace(/\s+/g, "_"));
    })
    .catch(() => {
      alert("Error al generar PDF.");
    });
}
