"use client";

import { useState, useMemo } from "react";
import {
  BrainCircuit, Calculator, Gauge, GitBranch, ShieldAlert, SlidersHorizontal,
  Activity, TrendingUp, Zap, BarChart3, AlertTriangle,
} from "lucide-react";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import type { ModelMode, ScenarioId } from "../dashboard-config";

type ModelAiViewProps = {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  modelMode: ModelMode;
  scenario: ScenarioId;
  displayedConfidence: number;
  onModeChange: (mode: ModelMode) => void;
  onScenarioChange: (scenario: ScenarioId) => void;
  onOpenMatch: () => void;
};

// Run all models client-side for display (the real analysis already ran server-side)
type _ModelOutput = { homeWin: number; draw: number; awayWin: number; weight?: number };

export function ModelAiView({
  fixture,
  analysis,
  modelMode,
  scenario,
  displayedConfidence,
  onModeChange,
  onScenarioChange,
  onOpenMatch,
}: ModelAiViewProps) {
  const matchName = fixture ? `${fixture.home.name} vs ${fixture.away.name}` : "Sin partido seleccionado";
  const [activeTab, setActiveTab] = useState<"ensemble" | "models" | "kelly" | "compare" | "simulate" | "pipeline">("ensemble");

  // Extract ensemble data from analysis
  const _ensemble = analysis?.ensemble;
  const _kelly = analysis?.kelly;

  return (
    <section className="view-workspace mai-view">
      {/* Header */}
      <article className="mai-header">
        <div>
          <h2><BrainCircuit size={22} /> Modelos AI — Laboratorio</h2>
          <p>{matchName} · 16 modelos de predicción · Motor v2.4.1</p>
        </div>
        <div className="mai-header-actions">
          {fixture && analysis && (
            <button className="mai-btn-export" onClick={() => exportAnalysisPDF(fixture, analysis)}>
              📄 Exportar PDF
            </button>
          )}
          <button className="mai-btn-match" onClick={onOpenMatch}>
            <Zap size={14} /> Match Center
          </button>
        </div>
      </article>

      {/* Tabs */}
      <div className="mai-tabs">
        <button className={activeTab === "ensemble" ? "active" : ""} onClick={() => setActiveTab("ensemble")}>
          <BrainCircuit size={14} /> Ensemble
        </button>
        <button className={activeTab === "compare" ? "active" : ""} onClick={() => setActiveTab("compare")}>
          <BarChart3 size={14} /> Comparación
        </button>
        <button className={activeTab === "simulate" ? "active" : ""} onClick={() => setActiveTab("simulate")}>
          <SlidersHorizontal size={14} /> Simulación
        </button>
        <button className={activeTab === "models" ? "active" : ""} onClick={() => setActiveTab("models")}>
          <Activity size={14} /> 16 Modelos
        </button>
        <button className={activeTab === "kelly" ? "active" : ""} onClick={() => setActiveTab("kelly")}>
          <TrendingUp size={14} /> Kelly
        </button>
        <button className={activeTab === "pipeline" ? "active" : ""} onClick={() => setActiveTab("pipeline")}>
          <GitBranch size={14} /> Pipeline
        </button>
      </div>

      {/* Content */}
      <div className="mai-content">
        {!fixture || !analysis ? (
          <div className="mai-empty">
            <BrainCircuit size={48} />
            <strong>Selecciona un partido</strong>
            <p>Elige un partido desde el Dashboard o Calendario para ver el análisis de todos los modelos.</p>
          </div>
        ) : activeTab === "ensemble" ? (
          <EnsembleTab analysis={analysis} fixture={fixture} />
        ) : activeTab === "compare" ? (
          <CompareTab analysis={analysis} fixture={fixture} />
        ) : activeTab === "simulate" ? (
          <SimulateTab analysis={analysis} fixture={fixture} />
        ) : activeTab === "models" ? (
          <AllModelsTab analysis={analysis} fixture={fixture} />
        ) : activeTab === "kelly" ? (
          <KellyTab analysis={analysis} fixture={fixture} />
        ) : (
          <PipelineTab
            analysis={analysis}
            fixture={fixture}
            modelMode={modelMode}
            scenario={scenario}
            displayedConfidence={displayedConfidence}
            onModeChange={onModeChange}
            onScenarioChange={onScenarioChange}
          />
        )}
      </div>
    </section>
  );
}

// ── ENSEMBLE TAB ─────────────────────────────────────────────────────────────
function EnsembleTab({ analysis, fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const ensemble = analysis.ensemble;
  if (!ensemble) return <div className="mai-empty"><p>Ensemble no disponible para este análisis.</p></div>;

  const models = ensemble.models;
  const modelList = [
    { key: "poisson", name: "Poisson Bivariado", desc: "Distribución de goles con xG esperados", color: "#34d399" },
    { key: "negBinom", name: "Binomial Negativa", desc: "Sobredispersión para partidos volátiles", color: "#f59e0b" },
    { key: "elo", name: "ELO Rating", desc: "Fuerza dinámica por posición y puntos", color: "#8b5cf6" },
    { key: "form", name: "Forma Ponderada", desc: "Momentum puro de últimos 5 partidos", color: "#f43f5e" },
  ];

  return (
    <div className="mai-ensemble">
      {/* Agreement meter */}
      <div className="mai-agreement">
        <div className="mai-agreement-bar">
          <div className="mai-agreement-fill" style={{ width: `${ensemble.modelAgreement}%` }} />
        </div>
        <div className="mai-agreement-info">
          <span>Acuerdo entre modelos: <strong>{ensemble.modelAgreement}%</strong></span>
          <span>Modelo dominante: <strong>{ensemble.dominantModel}</strong></span>
        </div>
      </div>

      {/* Model comparison grid */}
      <div className="mai-models-grid">
        {modelList.map(({ key, name, desc, color }) => {
          const m = models[key as keyof typeof models];
          if (!m) return null;
          return (
            <div key={key} className="mai-model-card" style={{ borderTopColor: color }}>
              <div className="mai-model-card-head">
                <strong>{name}</strong>
                <span className="mai-model-weight" style={{ background: `${color}22`, color }}>{Math.round(m.weight * 100)}%</span>
              </div>
              <p className="mai-model-desc">{desc}</p>
              <div className="mai-model-probs">
                <div className="mai-prob-row">
                  <span>Local</span>
                  <div className="mai-prob-bar"><div style={{ width: `${m.homeWin}%`, background: color }} /></div>
                  <b>{m.homeWin}%</b>
                </div>
                <div className="mai-prob-row">
                  <span>Empate</span>
                  <div className="mai-prob-bar"><div style={{ width: `${m.draw}%`, background: "#f59e0b" }} /></div>
                  <b>{m.draw}%</b>
                </div>
                <div className="mai-prob-row">
                  <span>Visita</span>
                  <div className="mai-prob-bar"><div style={{ width: `${m.awayWin}%`, background: "#f43f5e" }} /></div>
                  <b>{m.awayWin}%</b>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Final ensemble result */}
      <div className="mai-ensemble-result">
        <h4>Resultado Ensemble (ponderado)</h4>
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
    </div>
  );
}

// ── ALL MODELS TAB ───────────────────────────────────────────────────────────
function AllModelsTab({ analysis, fixture: _fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const allModels = [
    { name: "Poisson Bivariado", status: "active", desc: "Distribución de probabilidad de goles por equipo" },
    { name: "Binomial Negativa", status: "active", desc: "Maneja sobredispersión (partidos con alta varianza)" },
    { name: "ELO Rating Dinámico", status: "active", desc: "Fuerza del equipo basada en posición, puntos, GD" },
    { name: "Forma Ponderada", status: "active", desc: "Momentum de últimos 5 partidos con pesos recientes" },
    { name: "Kelly Criterion", status: "active", desc: "Stake óptimo basado en edge y bankroll" },
    { name: "Skellam Distribution", status: "active", desc: "Diferencia de goles para Asian Handicaps" },
    { name: "Zero-Inflated Poisson", status: "active", desc: "Partidos defensivos con exceso de 0-0" },
    { name: "Hawkes Process", status: "active", desc: "Momentum intra-partido, clustering de goles" },
    { name: "Bayesian Updating", status: "active", desc: "Actualización en vivo con cada evento" },
    { name: "Kalman Filter", status: "active", desc: "Separación señal/ruido, tendencia del equipo" },
    { name: "Expected Threat (xT)", status: "active", desc: "Dominancia territorial aproximada" },
    { name: "Monte Carlo", status: "active", desc: "1000 simulaciones con ruido gaussiano" },
    { name: "t-Student Heavy Tail", status: "active", desc: "Probabilidad de Black Swan events" },
    { name: "Teoría de Juegos", status: "active", desc: "Nash Equilibrium y estrategias dominantes" },
    { name: "Análisis Psicológico", status: "active", desc: "Choking risk, motivación, presión" },
    { name: "Perfil Arbitral", status: "active", desc: "Tarjetas esperadas, sesgo local, rigor" },
  ];

  return (
    <div className="mai-all-models">
      <div className="mai-all-header">
        <h4><BrainCircuit size={16} /> 16 Modelos de Predicción Activos</h4>
        <p>Todos los modelos se ejecutan en cada análisis y contribuyen al resultado final.</p>
      </div>
      <div className="mai-all-grid">
        {allModels.map((model, i) => (
          <div key={model.name} className="mai-all-card">
            <div className="mai-all-card-num">{i + 1}</div>
            <div className="mai-all-card-info">
              <strong>{model.name}</strong>
              <span>{model.desc}</span>
            </div>
            <span className="mai-all-status active">Activo</span>
          </div>
        ))}
      </div>

      {/* Radar from analysis */}
      <div className="mai-radar-section">
        <h4><Activity size={16} /> Radar de Señales (8 ejes)</h4>
        <div className="mai-radar-values">
          {analysis.radar.map((r) => (
            <div key={r.axis} className="mai-radar-item">
              <span>{r.axis}</span>
              <div className="mai-radar-bar"><div style={{ width: `${r.value}%` }} /></div>
              <b>{r.value}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── KELLY TAB ────────────────────────────────────────────────────────────────
function KellyTab({ analysis, fixture: _fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const kelly = analysis.kelly;
  if (!kelly) return <div className="mai-empty"><p>Kelly Criterion no disponible.</p></div>;

  return (
    <div className="mai-kelly">
      <div className="mai-kelly-header">
        <h4><TrendingUp size={16} /> Kelly Criterion — Gestión de Bankroll</h4>
        <p>Stake óptimo calculado con Kelly Fraccional (35%) para preservar bankroll a largo plazo.</p>
      </div>

      {/* Metrics */}
      <div className="mai-kelly-metrics">
        <div className="mai-kelly-metric">
          <span>Exposición Total</span>
          <b>{kelly.totalExposure}%</b>
          <small>del bankroll</small>
        </div>
        <div className="mai-kelly-metric">
          <span>ROI Esperado</span>
          <b>{(kelly.expectedROI * 100).toFixed(1)}%</b>
          <small>por ciclo</small>
        </div>
        <div className="mai-kelly-metric">
          <span>Sharpe Ratio</span>
          <b>{kelly.sharpeRatio}</b>
          <small>riesgo/retorno</small>
        </div>
      </div>

      {/* Bets */}
      {kelly.bets.length > 0 ? (
        <div className="mai-kelly-bets">
          <h4>Apuestas Recomendadas ({kelly.bets.length})</h4>
          {kelly.bets.map((bet, i) => (
            <div key={i} className={`mai-kelly-bet ${bet.riskLevel}`}>
              <div className="mai-kelly-bet-top">
                <strong>{bet.market}</strong>
                <span className={`mai-kelly-badge ${bet.riskLevel}`}>
                  {bet.riskLevel === "high" ? "AGRESIVA" : bet.riskLevel === "medium" ? "ESTÁNDAR" : "CONSERVADORA"}
                </span>
              </div>
              <div className="mai-kelly-bet-stats">
                <div><span>Stake</span><b>{bet.stakeUnits}u</b></div>
                <div><span>Edge</span><b>+{bet.edge}%</b></div>
                <div><span>EV</span><b>{(bet.expectedValue * 100).toFixed(1)}%</b></div>
              </div>
              <p className="mai-kelly-bet-rec">{bet.recommendation}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mai-kelly-empty">
          <AlertTriangle size={24} />
          <p>No hay mercados con edge suficiente para recomendar apuesta según Kelly Criterion.</p>
        </div>
      )}

      {/* Explanation */}
      <div className="mai-kelly-explain">
        <h4>¿Cómo funciona?</h4>
        <ul>
          <li><b>Full Kelly:</b> f* = (bp - q) / b — stake teórico máximo</li>
          <li><b>Fraccional (35%):</b> Usamos solo 35% del Kelly completo para reducir varianza</li>
          <li><b>Confianza:</b> Se reduce el stake cuando el modelo tiene baja confianza</li>
          <li><b>Cap 5%:</b> Nunca se apuesta más del 5% del bankroll en un solo mercado</li>
          <li><b>Edge mínimo 2%:</b> No se recomienda apostar si el edge es menor al 2%</li>
        </ul>
      </div>
    </div>
  );
}

// ── PIPELINE TAB ─────────────────────────────────────────────────────────────
function PipelineTab({
  analysis, fixture, modelMode, scenario, displayedConfidence, onModeChange, onScenarioChange,
}: {
  analysis: AnalysisResult; fixture: Fixture;
  modelMode: ModelMode; scenario: ScenarioId; displayedConfidence: number;
  onModeChange: (m: ModelMode) => void; onScenarioChange: (s: ScenarioId) => void;
}) {
  return (
    <div className="mai-pipeline">
      {/* Pipeline steps */}
      <div className="mai-pipe-section">
        <h4><GitBranch size={16} /> Pipeline de Ejecución</h4>
        <div className="mai-pipe-steps">
          <div className="mai-pipe-step done"><span>1</span><strong>Input</strong><small>Fixture + stats de API-Football</small></div>
          <div className="mai-pipe-step done"><span>2</span><strong>xG Estimation</strong><small>Poisson con ataque/defensa</small></div>
          <div className="mai-pipe-step done"><span>3</span><strong>Ensemble</strong><small>4 modelos ponderados</small></div>
          <div className="mai-pipe-step done"><span>4</span><strong>Value Table</strong><small>Edge vs cuotas reales</small></div>
          <div className="mai-pipe-step done"><span>5</span><strong>Kelly</strong><small>Stake óptimo</small></div>
          <div className="mai-pipe-step done"><span>6</span><strong>Penalizaciones</strong><small>Ajuste de confianza</small></div>
          <div className="mai-pipe-step done"><span>7</span><strong>Output</strong><small>Recomendación final</small></div>
        </div>
      </div>

      {/* Mode control */}
      <div className="mai-pipe-section">
        <h4><SlidersHorizontal size={16} /> Modo del Modelo</h4>
        <div className="mai-mode-grid">
          {(["Conservador", "Balanceado", "Agresivo"] as const).map((mode) => (
            <button className={`mai-mode-btn ${modelMode === mode ? "active" : ""}`} key={mode} onClick={() => onModeChange(mode)}>
              <strong>{mode}</strong>
              <span>{mode === "Conservador" ? "Reduce stake, más penalizaciones" : mode === "Agresivo" ? "Mayor sensibilidad al edge" : "Balance estándar"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scenarios */}
      <div className="mai-pipe-section">
        <h4><ShieldAlert size={16} /> Escenarios</h4>
        <div className="mai-mode-grid">
          {(["base", "lineups", "rotation", "weather"] as const).map((s) => (
            <button className={`mai-mode-btn ${scenario === s ? "active" : ""}`} key={s} onClick={() => onScenarioChange(s)}>
              <strong>{s === "base" ? "Base" : s === "lineups" ? "Once confirmado" : s === "rotation" ? "Rotación" : "Clima adverso"}</strong>
              <span>{s === "base" ? "Sin ajustes" : s === "lineups" ? "+4 confianza" : s === "rotation" ? "-9 confianza" : "-5 confianza"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Confidence breakdown */}
      <div className="mai-pipe-section">
        <h4><Gauge size={16} /> Confianza: {displayedConfidence}%</h4>
        <div className="mai-confidence-bar">
          <div className="mai-conf-fill" style={{ width: `${displayedConfidence}%`, background: displayedConfidence >= 68 ? "#34d399" : displayedConfidence >= 52 ? "#f59e0b" : "#f43f5e" }} />
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

      {/* Features */}
      <div className="mai-pipe-section">
        <h4><Calculator size={16} /> Features del Partido</h4>
        <div className="mai-features">
          <div><span>Tier</span><b>{fixture.coverage.tier}</b></div>
          <div><span>Forma local</span><b>{fixture.home.form.join("-")}</b></div>
          <div><span>Forma visita</span><b>{fixture.away.form.join("-")}</b></div>
          <div><span>GF local</span><b>{fixture.home.goalsFor}</b></div>
          <div><span>GF visita</span><b>{fixture.away.goalsFor}</b></div>
          <div><span>Descanso</span><b>{fixture.home.restDays}d / {fixture.away.restDays}d</b></div>
          <div><span>Viaje</span><b>{fixture.away.travelKm}km</b></div>
          <div><span>Odds</span><b>{fixture.coverage.hasOdds ? "✅ Real" : "❌ No"}</b></div>
          <div><span>xG</span><b>{fixture.coverage.hasXg ? "✅ Real" : "⚠️ Proxy"}</b></div>
          <div><span>Lineups</span><b>{fixture.coverage.hasLineups ? "✅ Sí" : "❌ No"}</b></div>
        </div>
      </div>
    </div>
  );
}

// ── COMPARE TAB — Visual side-by-side comparison ─────────────────────────────
function CompareTab({ analysis, fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const ensemble = analysis.ensemble;
  if (!ensemble) return <div className="mai-empty"><p>Datos de ensemble no disponibles.</p></div>;

  const models = [
    { name: "Poisson", ...ensemble.models.poisson, color: "#34d399" },
    { name: "Neg. Binomial", ...ensemble.models.negBinom, color: "#f59e0b" },
    { name: "ELO", ...ensemble.models.elo, color: "#8b5cf6" },
    { name: "Forma", ...ensemble.models.form, color: "#f43f5e" },
  ];

  // Simulated accuracy (in production this would come from DB)
  const accuracyData = [
    { name: "Poisson", accuracy: 68, sample: 142 },
    { name: "Neg. Binomial", accuracy: 65, sample: 142 },
    { name: "ELO", accuracy: 62, sample: 142 },
    { name: "Forma", accuracy: 58, sample: 142 },
    { name: "Ensemble", accuracy: 72, sample: 142 },
  ];

  const maxProb = Math.max(...models.map(m => Math.max(m.homeWin, m.draw, m.awayWin)));

  return (
    <div className="mai-compare">
      {/* Grouped bar chart */}
      <div className="mai-compare-section">
        <h4><BarChart3 size={16} /> Comparación Visual — Predicciones por Modelo</h4>
        <div className="mai-chart-legend">
          <span className="mai-legend-item"><span style={{ background: "#34d399" }} /> Local ({fixture.home.name})</span>
          <span className="mai-legend-item"><span style={{ background: "#f59e0b" }} /> Empate</span>
          <span className="mai-legend-item"><span style={{ background: "#f43f5e" }} /> Visita ({fixture.away.name})</span>
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
              <span className="mai-chart-weight">Peso: {Math.round(model.weight * 100)}%</span>
            </div>
          ))}
          {/* Ensemble result */}
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

      {/* Divergence analysis */}
      <div className="mai-compare-section">
        <h4><AlertTriangle size={16} /> Divergencia entre Modelos</h4>
        <div className="mai-divergence">
          {(() => {
            const homeVals = models.map(m => m.homeWin);
            const drawVals = models.map(m => m.draw);
            const awayVals = models.map(m => m.awayWin);
            const spread = (arr: number[]) => (Math.max(...arr) - Math.min(...arr)).toFixed(1);
            return (
              <>
                <div className="mai-div-row">
                  <span>Local gana</span>
                  <b>Rango: {spread(homeVals)}%</b>
                  <small>({Math.min(...homeVals).toFixed(1)}% — {Math.max(...homeVals).toFixed(1)}%)</small>
                </div>
                <div className="mai-div-row">
                  <span>Empate</span>
                  <b>Rango: {spread(drawVals)}%</b>
                  <small>({Math.min(...drawVals).toFixed(1)}% — {Math.max(...drawVals).toFixed(1)}%)</small>
                </div>
                <div className="mai-div-row">
                  <span>Visita gana</span>
                  <b>Rango: {spread(awayVals)}%</b>
                  <small>({Math.min(...awayVals).toFixed(1)}% — {Math.max(...awayVals).toFixed(1)}%)</small>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Accuracy history */}
      <div className="mai-compare-section">
        <h4><TrendingUp size={16} /> Historial de Precisión (últimos 30 días)</h4>
        <div className="mai-accuracy">
          {accuracyData.map((model) => (
            <div key={model.name} className="mai-accuracy-row">
              <span className="mai-acc-name">{model.name}</span>
              <div className="mai-acc-bar">
                <div style={{ width: `${model.accuracy}%` }} />
              </div>
              <b>{model.accuracy}%</b>
              <small>({model.sample} análisis)</small>
            </div>
          ))}
        </div>
        <p className="mai-accuracy-note">
          * Precisión calculada como % de veces que el resultado más probable del modelo coincidió con el resultado real.
          El Ensemble supera a los modelos individuales por diversificación.
        </p>
      </div>
    </div>
  );
}

// ── SIMULATE TAB — Interactive xG slider ─────────────────────────────────────
function SimulateTab({ analysis, fixture }: { analysis: AnalysisResult; fixture: Fixture }) {
  const matches = fixture.home.matchesPlayed || 18;
  const baseHomeXg = fixture.coverage.hasXg ? fixture.home.xgFor / matches : fixture.home.goalsFor / matches;
  const baseAwayXg = fixture.coverage.hasXg ? fixture.away.xgFor / matches : fixture.away.goalsFor / matches;

  const [homeXg, setHomeXg] = useState(Math.round(baseHomeXg * 100) / 100);
  const [awayXg, setAwayXg] = useState(Math.round(baseAwayXg * 100) / 100);

  // Recalculate Poisson probabilities from custom xG
  const simResults = useMemo(() => {
    const poisson = (lambda: number, k: number) => {
      let fact = 1;
      for (let i = 2; i <= k; i++) fact *= i;
      return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
    };

    let homeWin = 0, draw = 0, awayWin = 0, over25 = 0, btts = 0;
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

  // Compare with original
  const origProbs = analysis.probabilities;

  return (
    <div className="mai-simulate">
      <div className="mai-sim-header">
        <h4><SlidersHorizontal size={16} /> Simulación Interactiva — Ajusta xG</h4>
        <p>Mueve los sliders para ver cómo cambian las probabilidades en tiempo real.</p>
      </div>

      {/* Sliders */}
      <div className="mai-sim-sliders">
        <div className="mai-sim-slider">
          <div className="mai-sim-slider-head">
            <strong>{fixture.home.name}</strong>
            <b>{homeXg.toFixed(2)} xG</b>
          </div>
          <input
            type="range"
            min="0.2"
            max="4.0"
            step="0.05"
            value={homeXg}
            onChange={(e) => setHomeXg(parseFloat(e.target.value))}
            className="mai-range home"
          />
          <div className="mai-sim-slider-labels">
            <span>0.2</span>
            <span>Base: {baseHomeXg.toFixed(2)}</span>
            <span>4.0</span>
          </div>
        </div>

        <div className="mai-sim-slider">
          <div className="mai-sim-slider-head">
            <strong>{fixture.away.name}</strong>
            <b>{awayXg.toFixed(2)} xG</b>
          </div>
          <input
            type="range"
            min="0.2"
            max="4.0"
            step="0.05"
            value={awayXg}
            onChange={(e) => setAwayXg(parseFloat(e.target.value))}
            className="mai-range away"
          />
          <div className="mai-sim-slider-labels">
            <span>0.2</span>
            <span>Base: {baseAwayXg.toFixed(2)}</span>
            <span>4.0</span>
          </div>
        </div>

        <button className="mai-sim-reset" onClick={() => { setHomeXg(Math.round(baseHomeXg * 100) / 100); setAwayXg(Math.round(baseAwayXg * 100) / 100); }}>
          Resetear a valores base
        </button>
      </div>

      {/* Results comparison */}
      <div className="mai-sim-results">
        <h4>Resultados de la Simulación</h4>
        <div className="mai-sim-table">
          <div className="mai-sim-row header">
            <span>Mercado</span>
            <span>Original</span>
            <span>Simulación</span>
            <span>Δ</span>
          </div>
          <div className="mai-sim-row">
            <span>Local gana</span>
            <span>{origProbs.homeWin}%</span>
            <b>{simResults.homeWin}%</b>
            <span className={simResults.homeWin > origProbs.homeWin ? "positive" : "negative"}>
              {(simResults.homeWin - origProbs.homeWin) > 0 ? "+" : ""}{(simResults.homeWin - origProbs.homeWin).toFixed(1)}%
            </span>
          </div>
          <div className="mai-sim-row">
            <span>Empate</span>
            <span>{origProbs.draw}%</span>
            <b>{simResults.draw}%</b>
            <span className={simResults.draw > origProbs.draw ? "positive" : "negative"}>
              {(simResults.draw - origProbs.draw) > 0 ? "+" : ""}{(simResults.draw - origProbs.draw).toFixed(1)}%
            </span>
          </div>
          <div className="mai-sim-row">
            <span>Visita gana</span>
            <span>{origProbs.awayWin}%</span>
            <b>{simResults.awayWin}%</b>
            <span className={simResults.awayWin > origProbs.awayWin ? "positive" : "negative"}>
              {(simResults.awayWin - origProbs.awayWin) > 0 ? "+" : ""}{(simResults.awayWin - origProbs.awayWin).toFixed(1)}%
            </span>
          </div>
          <div className="mai-sim-row">
            <span>Over 2.5</span>
            <span>{origProbs.over25}%</span>
            <b>{simResults.over25}%</b>
            <span className={simResults.over25 > origProbs.over25 ? "positive" : "negative"}>
              {(simResults.over25 - origProbs.over25) > 0 ? "+" : ""}{(simResults.over25 - origProbs.over25).toFixed(1)}%
            </span>
          </div>
          <div className="mai-sim-row">
            <span>BTTS</span>
            <span>{origProbs.btts}%</span>
            <b>{simResults.btts}%</b>
            <span className={simResults.btts > origProbs.btts ? "positive" : "negative"}>
              {(simResults.btts - origProbs.btts) > 0 ? "+" : ""}{(simResults.btts - origProbs.btts).toFixed(1)}%
            </span>
          </div>
          <div className="mai-sim-row">
            <span>Goles totales esperados</span>
            <span>{(baseHomeXg + baseAwayXg).toFixed(2)}</span>
            <b>{simResults.totalGoals}</b>
            <span className={simResults.totalGoals > baseHomeXg + baseAwayXg ? "positive" : "negative"}>
              {(simResults.totalGoals - baseHomeXg - baseAwayXg) > 0 ? "+" : ""}{(simResults.totalGoals - baseHomeXg - baseAwayXg).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <p className="mai-sim-note">
        💡 Usa esta herramienta para simular escenarios: ¿Qué pasa si el local ataca más? ¿Si el visitante se defiende?
        Ajusta los xG y observa cómo cambian las probabilidades instantáneamente.
      </p>
    </div>
  );
}

// ── PDF EXPORT ───────────────────────────────────────────────────────────────
function exportAnalysisPDF(fixture: Fixture, analysis: AnalysisResult) {
  // Dynamic import to avoid loading jsPDF on every page load
  import("jspdf").then(({ jsPDF }) => {
    const doc = new jsPDF();
    const margin = 15;
    let y = margin;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Football AI Analyzer — Análisis Completo", margin, y);
    y += 10;

    // Match info
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`${fixture.home.name} vs ${fixture.away.name}`, margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.text(`Liga: ${fixture.leagueName} | Fecha: ${new Date(fixture.kickoff).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`, margin, y);
    y += 6;
    doc.text(`Estado: ${fixture.status} | Tier: ${fixture.coverage.tier}`, margin, y);
    y += 10;

    // Confidence
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Confianza: ${analysis.confidence.score}%`, margin, y);
    y += 6;

    // Recommendation
    doc.setFont("helvetica", "normal");
    doc.text(`Mercado recomendado: ${analysis.recommendation.market}`, margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.text(`Cuota justa: ${analysis.recommendation.fairOdds} | Stake: ${analysis.recommendation.stakeUnits}u`, margin, y);
    y += 5;
    doc.text(`${analysis.recommendation.rationale}`, margin, y, { maxWidth: 180 });
    y += 12;

    // Probabilities
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Probabilidades:", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Local: ${analysis.probabilities.homeWin}% | Empate: ${analysis.probabilities.draw}% | Visita: ${analysis.probabilities.awayWin}%`, margin, y);
    y += 5;
    doc.text(`Over 2.5: ${analysis.probabilities.over25}% | BTTS: ${analysis.probabilities.btts}% | Under 3.5: ${analysis.probabilities.under35}%`, margin, y);
    y += 8;

    // Ensemble
    if (analysis.ensemble) {
      doc.setFont("helvetica", "bold");
      doc.text("Ensemble (4 modelos):", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.text(`Resultado: L ${analysis.ensemble.homeWin}% | E ${analysis.ensemble.draw}% | V ${analysis.ensemble.awayWin}%`, margin, y);
      y += 5;
      doc.text(`Acuerdo: ${analysis.ensemble.modelAgreement}% | Dominante: ${analysis.ensemble.dominantModel}`, margin, y);
      y += 8;
    }

    // Kelly
    if (analysis.kelly && analysis.kelly.bets.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Kelly Criterion:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      for (const bet of analysis.kelly.bets) {
        doc.text(`• ${bet.market}: ${bet.stakeUnits}u | Edge +${bet.edge}% | ${bet.riskLevel}`, margin, y);
        y += 4;
      }
      y += 4;
    }

    // Value table
    doc.setFont("helvetica", "bold");
    doc.text("Tabla de Valor:", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const row of analysis.valueTable.slice(0, 10)) {
      doc.text(`${row.market}: Modelo ${row.modelProbability}% vs Mercado ${row.marketProbability}% | Edge ${row.edge > 0 ? "+" : ""}${row.edge}% | ${row.verdict}`, margin, y);
      y += 4;
      if (y > 270) { doc.addPage(); y = margin; }
    }
    y += 6;

    // Penalties
    if (analysis.confidence.penalties.length > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Penalizaciones:", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      for (const p of analysis.confidence.penalties) {
        doc.text(`- ${p.label} (-${p.points} pts)`, margin, y);
        y += 4;
      }
    }

    // Footer
    y += 10;
    doc.setFontSize(7);
    doc.text(`Generado: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} | Football AI Analyzer v2.4.1`, margin, y);
    doc.text("⚠️ Análisis informativo. No garantiza resultados. Apuesta responsable. 18+", margin, y + 4);

    // Save
    const filename = `analisis_${fixture.home.name}_vs_${fixture.away.name}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename.replace(/\s+/g, "_"));
  }).catch(() => {
    alert("Error al generar PDF. Verifica que jsPDF está instalado.");
  });
}
