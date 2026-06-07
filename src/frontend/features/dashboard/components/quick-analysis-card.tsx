"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain, ShieldCheck, Star, TrendingUp, AlertTriangle, Zap, Target,
  Calendar, Trophy, Activity, BarChart3, RefreshCw, Users, Clock,
} from "lucide-react";
import type { AnalysisResult, Fixture, MatchLineup, MatchEvent, MatchStatistic, TeamRecentMatch, TeamSnapshot } from "@/shared/domain";
import type { AnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import { isActionableValueListing } from "@/shared/market-recommendation-rules";
import { AnalysisPipelineBadge } from "./analysis-pipeline-badge";
import { TacticalRadar } from "./tactical-radar";
import {
  MatchCenterContextPanel,
  MatchCenterH2HPanel,
  MatchCenterSquadPanel,
  MatchCenterTabBar,
  type MatchCenterTab,
} from "./match-center-panels";
import { MatchEventTimeline } from "./match-event-timeline";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import { useOddsClvSummary } from "@/frontend/hooks/use-odds-intelligence";
import { usePerformanceMetrics } from "@/frontend/hooks/use-performance-metrics";
import { FAVORITE_TEAM_IDS_KEY } from "@/frontend/lib/favorite-team-storage";
import { createPredictionFromAnalysis } from "@/frontend/lib/predictions-api";
import { formatKickoffColombia } from "@/frontend/lib/date-utils";
import {
  CONFIDENCE_THRESHOLDS,
  decisionFromConfidence,
  riskFromConfidence,
} from "@/frontend/lib/confidence-display";
import { fixtureStatusLabelEs } from "@/shared/fixture-status";
import { normalizeRecommendationMarket, predictionMarketKey } from "@/shared/prediction-market-mapping";

type MLPrediction = {
  prediction: string;
  confidence: number;
  probabilities: Record<string, Record<string, number>>;
  classes: string[];
  shap: {
    top_features: Array<{ feature: string; impact: number }>;
    error?: string;
  };
};

type QuickAnalysisCardProps = {
  fixture: Fixture;
  onAnalyze: () => void;
  analysis: AnalysisResult | null;
  lineups?: MatchLineup[];
  events?: MatchEvent[];
  statistics?: MatchStatistic[];
  loading: boolean;
  isFetching?: boolean;
  isReanalyzing?: boolean;
  lastUpdatedAt?: number;
  onOpenDeep: () => void;
  addToast?: (message: string, type: "success" | "error" | "warning" | "info") => void;
  mlPrediction?: MLPrediction | null;
  analysisPipeline?: AnalysisPipelineStatus | null;
  analysisError?: boolean;
  analysisErrorMessage?: string | null;
  onRetryAnalysis?: () => void;
};

function _FormBadges({ form }: { form: string[] }) {
  return (
    <div className="qa-form">
      {form.map((r, i) => (
        <span key={i} className={`qa-form-badge qa-form-${r.toLowerCase()}`}>{r}</span>
      ))}
    </div>
  );
}

function formatRecentDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function TeamRecentHistory({ team }: { team: TeamSnapshot }) {
  const matches = team.recentMatches ?? [];
  const wins = team.form.filter((r) => r === "W").length;
  const draws = team.form.filter((r) => r === "D").length;
  const losses = team.form.filter((r) => r === "L").length;

  return (
    <div className="qa-form-team qa-recent-team">
      <span className="qa-form-label">Últimos 5 — {team.name}</span>
      {matches.length > 0 ? (
        <ul className="qa-recent-list">
          {matches.map((match, index) => (
            <RecentMatchRow key={`${match.date}-${index}`} match={match} />
          ))}
        </ul>
      ) : (
        <div className="qa-form-list">
          {team.form.map((result, index) => (
            <div key={index} className={`qa-form-match ${result.toLowerCase()}`}>
              <span className="qa-form-result">{result}</span>
              <span className="qa-form-bar" />
            </div>
          ))}
        </div>
      )}
      <span className="qa-form-summary">{wins}V {draws}E {losses}D</span>
    </div>
  );
}

function RecentMatchRow({ match }: { match: TeamRecentMatch }) {
  return (
    <li className={`qa-recent-item ${match.result.toLowerCase()}`}>
      <div className="qa-recent-head">
        <time className="qa-recent-date" dateTime={match.date}>
          {formatRecentDate(match.date)}
        </time>
        <span className="qa-recent-result">{match.result}</span>
      </div>
      <div className="qa-recent-body">
        <p className="qa-recent-teams">
          <span className="qa-recent-team-name">{match.homeTeam}</span>
          <span className="qa-recent-vs">vs</span>
          <span className="qa-recent-team-name">{match.awayTeam}</span>
        </p>
        <strong className="qa-recent-score">
          {match.homeGoals} - {match.awayGoals}
        </strong>
      </div>
    </li>
  );
}

function getFixtureOddsForMarket(fixture: Fixture, market: string): number {
  const clean = normalizeRecommendationMarket(market);
  const oddsMap: Record<string, number | undefined> = {
    "Local gana": fixture.market.homeWinOdds,
    Empate: fixture.market.drawOdds,
    "Visitante gana": fixture.market.awayWinOdds,
    "Doble Chance 1X": fixture.market.dc1xOdds,
    "Doble Chance X2": fixture.market.dcx2Odds,
    "Doble Chance 12": fixture.market.dc12Odds,
    "Over 1.5": fixture.market.over15Odds,
    "Over 2.5": fixture.market.over25Odds,
    "Over 3.5": fixture.market.over35Odds,
    "Under 1.5": fixture.market.under15Odds,
    "Under 2.5": fixture.market.under25Odds,
    "Under 3.5": fixture.market.under35Odds,
    "BTTS Sí": fixture.market.bttsYesOdds,
    "BTTS No": fixture.market.bttsNoOdds,
    "AH Local -1": fixture.market.ahHomeMinus1,
    "AH Visitante +1": fixture.market.ahAwayPlus1,
  };
  return oddsMap[clean] ?? 0;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function buildStakeValidationReason(input: {
  stakeUnits: number;
  realOdds: number;
  fairOdds: number;
  edge: number;
}): string {
  if (input.stakeUnits <= 0) return "Kelly conservador no asigna stake para este mercado.";
  if (input.realOdds <= 1.01) return "No hay cuota real del proveedor para respaldar el stake.";
  if (input.fairOdds <= 1.01) return "Falta cuota justa calculada para comparar valor.";
  if (input.realOdds <= input.fairOdds) return "La cuota real no supera la cuota justa del modelo.";
  if (input.edge <= 0) return "El edge calculado no es positivo.";
  return "Stake permitido: existe cuota real, edge positivo y cuota real por encima de cuota justa.";
}

function auditedPredictionLabel(analysis: AnalysisResult): string {
  const { homeWin, draw, awayWin } = analysis.probabilities;
  if (draw >= homeWin && draw >= awayWin) return "Empate";
  return homeWin >= awayWin ? "Local" : "Visita";
}

function consistencyReason(flags: string[] = []): string {
  if (flags.includes("hybrid_away_market_contradiction")) {
    return "El ML elevaba demasiado la visita contra Dixon-Coles y la cuota de mercado; se redujo antes de recomendar.";
  }
  if (flags.includes("hybrid_home_market_contradiction")) {
    return "El ML elevaba demasiado al local contra Dixon-Coles y la cuota de mercado; se redujo antes de recomendar.";
  }
  if (flags.includes("hybrid_goal_model_contradiction")) {
    return "El 1X2 del ML no cuadraba con los goles esperados y marcadores probables; se reconciliaron probabilidades.";
  }
  return "La predicción auditada coincide con las señales principales del motor.";
}

export function QuickAnalysisCard({ fixture, onAnalyze, analysis, lineups, events, statistics, loading, isFetching, isReanalyzing = false, lastUpdatedAt, onOpenDeep, addToast, mlPrediction, analysisPipeline, analysisError, analysisErrorMessage, onRetryAnalysis }: QuickAnalysisCardProps) {
  const [favoriteTeams, setFavoriteTeams] = useLocalStorage<string[]>(FAVORITE_TEAM_IDS_KEY, []);
  const [activeTab, setActiveTab] = useState<MatchCenterTab>("resumen");
  const savedFixtureRef = useRef<string>("");
  const [saved, setSaved] = useState(false);
  const performanceQuery = usePerformanceMetrics("market");
  const clvQuery = useOddsClvSummary();
  const hybridConsistencyFlags = analysis?.advancedModels?.hybridPipeline?.consistencyFlags ?? [];
  const auditedPrediction = analysis ? auditedPredictionLabel(analysis) : null;

  const handleReanalyze = async () => {
    setSaved(false);
    savedFixtureRef.current = "";
    await onAnalyze();
  };

  // Auto-save prediction when analysis completes
  useEffect(() => {
    if (!analysis || !fixture || savedFixtureRef.current === fixture.id) return;
    if (analysis.recommendation.market === "Sin valor claro" || analysis.recommendation.stakeUnits <= 0) {
      setSaved(false);
      return;
    }
    savedFixtureRef.current = fixture.id;
    const riskLevel = riskFromConfidence(analysis.confidence.score);
    createPredictionFromAnalysis(fixture, analysis, riskLevel)
      .then(() => setSaved(true))
      .catch((err) => {
        addToast?.(
          err instanceof Error
            ? `Predicción no guardada: ${err.message}`
            : "No se pudo guardar la predicción automáticamente",
          "warning"
        );
      });
  }, [analysis, fixture, addToast]);

  const toggleFav = (teamId: string) => {
    setFavoriteTeams((prev) => prev.includes(teamId) ? prev.filter((x) => x !== teamId) : [...prev, teamId]);
  };

  const formatKickoff = (kickoff: string) => formatKickoffColombia(kickoff).label;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (analysisError && !analysis && !loading) {
    return (
      <div className="qa-card qa-empty">
        <MatchHeader fixture={fixture} favoriteTeams={favoriteTeams} toggleFav={toggleFav} formatKickoff={formatKickoff} />
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <span>{analysisErrorMessage ?? "No se pudo ejecutar el análisis"}</span>
          {onRetryAnalysis ? (
            <button type="button" onClick={onRetryAnalysis}>
              Reintentar
            </button>
          ) : null}
        </div>
        <button className="qa-analyze-btn" onClick={handleReanalyze} disabled={isReanalyzing}>
          <Brain size={24} />
          <span>Re-ejecutar análisis</span>
        </button>
      </div>
    );
  }

  if (!analysis && !loading) {
    return (
      <div className="qa-card qa-empty">
        <MatchHeader fixture={fixture} favoriteTeams={favoriteTeams} toggleFav={toggleFav} formatKickoff={formatKickoff} />
        <button className="qa-analyze-btn" onClick={handleReanalyze} disabled={isReanalyzing}>
          <Brain size={24} />
          <span>⚡ Ejecutar Análisis AI</span>
          <small>XGBoost · CatBoost · LightGBM · Redes Neuronales · Poisson · Monte Carlo · Kelly</small>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="qa-card qa-loading">
        <div className="qa-loading-content">
          <Brain size={36} className="spin" />
          <strong>Ejecutando modelos auditados de predicción...</strong>
          <div className="qa-loading-steps">
            <span className="qa-step done">✓ Modelos Estadísticos (Baseline)</span>
            <span className="qa-step active">⟳ Evaluando XGBoost</span>
            <span className="qa-step">○ Evaluando CatBoost</span>
            <span className="qa-step">○ Evaluando LightGBM</span>
            <span className="qa-step">○ Redes Neuronales (Deep Learning)</span>
            <span className="qa-step">○ Monte Carlo híbrido (50k)</span>
            <span className="qa-step">○ Generando recomendación</span>
          </div>
          <small>Consultando API-Football + ejecutando modelos...</small>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const handleSavePrediction = async () => {
    const riskLevel = riskFromConfidence(analysis.confidence.score);
    try {
      await createPredictionFromAnalysis(fixture, analysis, riskLevel);
      setSaved(true);
      addToast?.("Predicción guardada en Mis Predicciones", "success");
    } catch {
      addToast?.("Error al guardar predicción", "error");
    }
  };

  // ── Result state ───────────────────────────────────────────────────────────
  const bestMarket = analysis.recommendation;
  const cleanBestMarket = normalizeRecommendationMarket(bestMarket.market);
  const recommendationValueRow = analysis.valueTable.find((row) => normalizeRecommendationMarket(row.market) === cleanBestMarket);
  const realOdds = getFixtureOddsForMarket(fixture, bestMarket.market);
  const bookmakerName = fixture.market.bookmakerName ?? null;
  const edge = recommendationValueRow?.edge ?? (realOdds > 1.01 && bestMarket.fairOdds > 1.01 ? (realOdds / bestMarket.fairOdds - 1) * 100 : 0);
  const stakeAllowed = bestMarket.stakeUnits > 0 && realOdds > 1.01 && bestMarket.fairOdds > 1.01 && realOdds > bestMarket.fairOdds && edge > 0;
  const stakeReason = buildStakeValidationReason({
    stakeUnits: bestMarket.stakeUnits,
    realOdds,
    fairOdds: bestMarket.fairOdds,
    edge,
  });
  const marketMetricKey = predictionMarketKey(bestMarket.market);
  const marketMetric = performanceQuery.data?.metrics.find((metric) => metric.key === marketMetricKey);
  const modelLabel = analysisPipeline?.label ?? analysis.ensemble?.dominantModel ?? "Ensemble interno";
  const modelDetail = analysisPipeline?.detail ?? "Modelos estadisticos internos con Kelly conservador.";
  const confidence = analysis.confidence.score;
  const noClearValue = bestMarket.market === "Sin valor claro" || bestMarket.stakeUnits <= 0;
  const riskLevel = riskFromConfidence(confidence);
  const rawDecision = decisionFromConfidence(confidence);
  const decision = noClearValue
    ? "NO APOSTAR"
    : rawDecision === "PRECAUCION"
      ? "PRECAUCIÓN"
      : rawDecision === "NO_APOSTAR"
        ? "NO APOSTAR"
        : "APOSTAR";
  const decisionColor =
    noClearValue || rawDecision === "NO_APOSTAR"
      ? "#f43f5e"
      : rawDecision === "PRECAUCION"
        ? "#f59e0b"
        : "#34d399";

  const valueMarkets = analysis.valueTable
    .filter((r) => isActionableValueListing(r, fixture))
    .sort((a, b) => b.edge - a.edge);

  const topScores = analysis.topExactScores?.slice(0, 5) ?? [];

  // Double chance probabilities
  const dc1X = Math.round(analysis.probabilities.homeWin + analysis.probabilities.draw);
  const dcX2 = Math.round(analysis.probabilities.draw + analysis.probabilities.awayWin);
  const dc12 = Math.round(analysis.probabilities.homeWin + analysis.probabilities.awayWin);

  return (
    <div className="qa-card qa-result">
      <div className="qa-sticky-header">
        <MatchHeader fixture={fixture} favoriteTeams={favoriteTeams} toggleFav={toggleFav} formatKickoff={formatKickoff} analysis={analysis} />

        <div className="qa-realtime-strip">
          {isFetching && (
            <span className="qa-updating">
              <RefreshCw size={12} className="spin" /> Actualizando...
            </span>
          )}
          {lastUpdatedAt && lastUpdatedAt > 0 && (
            <span className="qa-last-updated">
              Última actualización: {new Date(lastUpdatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Bogota" })}
            </span>
          )}
          {fixture.status === "live" && (
            <span className="qa-live-badge">
              <span className="qa-live-dot" /> EN VIVO {fixture.elapsed ? `· ${fixture.elapsed}'` : ""}
            </span>
          )}
        </div>

        <MatchCenterTabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          fixture={fixture}
          lineupsCount={lineups?.length ?? 0}
          eventsCount={events?.length ?? 0}
        />
      </div>

      <div className="qa-tab-body">
        {activeTab === "resumen" && (
          <>
            <AnalysisPipelineBadge
              pipeline={analysisPipeline}
              analysis={analysis}
              mlPrediction={mlPrediction}
              compact
            />

            <div className="qa-decision" style={{ borderColor: decisionColor, background: `${decisionColor}11` }}>
              <div className="qa-decision-left">
                <ShieldCheck size={28} color={decisionColor} />
                <div>
                  <strong style={{ color: decisionColor }}>{decision}</strong>
                  <span>Confianza {confidence}% · Riesgo {riskLevel}</span>
                </div>
              </div>
              <div className="qa-decision-right">
                <span>Stake recomendado</span>
                <strong>{bestMarket.stakeUnits}u</strong>
              </div>
            </div>

            <div className="qa-context-strip">
              <div>
                <span>Estadio</span>
                <strong>{fixture.venue?.name ?? "Por confirmar"}</strong>
              </div>
              <div>
                <span>Clima</span>
                <strong>
                  {fixture.weather?.temperatureC != null ? `${fixture.weather.temperatureC}°C` : "N/D"}
                </strong>
              </div>
              <div>
                <span>Viaje</span>
                <strong>{fixture.away.travelKm} km</strong>
              </div>
              <div>
                <span>Motivación</span>
                <strong>{fixture.home.motivation}/{fixture.away.motivation}</strong>
              </div>
              <div>
                <span>Bajas</span>
                <strong>
                  {(fixture.squad?.home.injuries.length ?? 0) + (fixture.squad?.away.injuries.length ?? 0)} lesiones ·{" "}
                  {(fixture.squad?.home.suspensions.length ?? 0) + (fixture.squad?.away.suspensions.length ?? 0)} sanciones
                </strong>
              </div>
            </div>

            <div className="qa-recommendation">
              <div className="qa-rec-header">
                <Target size={20} />
                <h3>⭐ Mercado Recomendado</h3>
              </div>
              <div className="qa-rec-market">
                <strong className="qa-rec-name">{bestMarket.market}</strong>
                <div className="qa-rec-odds">
                  <div className="qa-rec-odd-item"><span>Cuota justa</span><b>{bestMarket.fairOdds}</b></div>
                  <div className="qa-rec-odd-item"><span>Cuota mínima</span><b>{bestMarket.minimumOdds}</b></div>
                  <div className="qa-rec-odd-item"><span>Stake</span><b>{bestMarket.stakeUnits}u</b></div>
                </div>
              </div>
              <p className="qa-rec-rationale">{bestMarket.rationale}</p>

              <div className="qa-bet-validation" aria-label="Validacion de apuesta">
                <div className="qa-bet-validation-head">
                  <div>
                    <span>Validacion de apuesta</span>
                    <strong className={stakeAllowed ? "ok" : "blocked"}>
                      {stakeAllowed ? "Stake permitido" : "Stake bloqueado"}
                    </strong>
                  </div>
                  <span className={`qa-bet-status ${stakeAllowed ? "ok" : "blocked"}`}>
                    {stakeAllowed ? "REAL" : "NO ACCIONABLE"}
                  </span>
                </div>

                <div className="qa-bet-validation-grid">
                  <div>
                    <span>Modelo usado</span>
                    <b>{modelLabel}</b>
                    <small>{modelDetail}</small>
                  </div>
                  <div>
                    <span>Bookmaker / proveedor</span>
                    <b>{realOdds > 1.01 ? bookmakerName ?? "Proveedor sin nombre" : "Sin cuota real"}</b>
                    <small>{realOdds > 1.01 ? "Nombre recibido desde el proveedor de cuotas" : "Solo lectura predictiva"}</small>
                  </div>
                  <div>
                    <span>Cuota real</span>
                    <b>{realOdds > 1.01 ? realOdds.toFixed(2) : "-"}</b>
                    <small>Debe superar la cuota justa</small>
                  </div>
                  <div>
                    <span>Cuota justa</span>
                    <b>{bestMarket.fairOdds > 1.01 ? bestMarket.fairOdds.toFixed(2) : "-"}</b>
                    <small>Precio minimo del modelo</small>
                  </div>
                  <div>
                    <span>Edge</span>
                    <b className={edge > 0 ? "ok" : "blocked"}>{formatSignedPercent(edge)}</b>
                    <small>{recommendationValueRow ? "Modelo vs mercado" : "Derivado de cuota real / justa"}</small>
                  </div>
                  <div>
                    <span>Stake permitido</span>
                    <b className={stakeAllowed ? "ok" : "blocked"}>{stakeAllowed ? `${bestMarket.stakeUnits}u` : "0u"}</b>
                    <small>{stakeReason}</small>
                  </div>
                </div>

                <div className="qa-bet-history">
                  <div>
                    <span>Historico del mercado</span>
                    {marketMetric ? (
                      <strong>
                        {marketMetric.sampleSize} picks · Hit {(marketMetric.hitRate * 100).toFixed(1)}% · ROI/u {formatSignedPercent(marketMetric.roiPerUnit * 100)}
                      </strong>
                    ) : (
                      <strong>Sin muestra suficiente para {marketMetricKey ?? cleanBestMarket}</strong>
                    )}
                  </div>
                  <div>
                    <span>Brier / calibracion</span>
                    <strong>
                      {marketMetric
                        ? `${marketMetric.brier.toFixed(4)} · LL ${marketMetric.logLoss.toFixed(3)}`
                        : "N/D"}
                    </strong>
                  </div>
                  <div>
                    <span>CLV promedio</span>
                    <strong>
                      {marketMetric?.avgClvPercent != null
                        ? `${formatSignedPercent(marketMetric.avgClvPercent)} (${marketMetric.clvSampleSize})`
                        : clvQuery.data && clvQuery.data.sampleSize > 0
                          ? `${formatSignedPercent(clvQuery.data.avgClvPercent)} (${clvQuery.data.sampleSize})`
                        : "N/D"}
                    </strong>
                  </div>
                  <div>
                    <span>Decision ROI</span>
                    <strong className={analysis.advancedModels?.calibration?.abstained ? "blocked" : "ok"}>
                      {analysis.advancedModels?.calibration
                        ? `${analysis.advancedModels.calibration.calibratedProbability}% · ${analysis.advancedModels.calibration.source}`
                        : "Sin calibracion"}
                    </strong>
                    <small>{analysis.advancedModels?.calibration?.reason ?? "Aun sin muestra historica aplicable"}</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="qa-form-section">
              <TeamRecentHistory team={fixture.home} />
              <TeamRecentHistory team={fixture.away} />
            </div>

            <div className="qa-odds-grid">
              <div className="qa-odds-section">
                <h4><BarChart3 size={14} /> Cuotas 1X2</h4>
                <div className="qa-odds-row">
                  <div className="qa-odd-card">
                    <span>1</span>
                    <b>{fixture.market.homeWinOdds > 0 ? fixture.market.homeWinOdds.toFixed(2) : "-"}</b>
                    <small>{analysis.probabilities.homeWin}%</small>
                  </div>
                  <div className="qa-odd-card">
                    <span>X</span>
                    <b>{fixture.market.drawOdds > 0 ? fixture.market.drawOdds.toFixed(2) : "-"}</b>
                    <small>{analysis.probabilities.draw}%</small>
                  </div>
                  <div className="qa-odd-card">
                    <span>2</span>
                    <b>{fixture.market.awayWinOdds > 0 ? fixture.market.awayWinOdds.toFixed(2) : "-"}</b>
                    <small>{analysis.probabilities.awayWin}%</small>
                  </div>
                </div>
              </div>

              <div className="qa-odds-section">
                <h4><Activity size={14} /> Doble Chance</h4>
                <div className="qa-odds-row">
                  <div className="qa-odd-card"><span>1X</span><b>{dc1X}%</b><small>local/empate</small></div>
                  <div className="qa-odd-card"><span>X2</span><b>{dcX2}%</b><small>empate/visita</small></div>
                  <div className="qa-odd-card"><span>12</span><b>{dc12}%</b><small>sin empate</small></div>
                </div>
              </div>

              <div className="qa-odds-section">
                <h4><Target size={14} /> Goles & BTTS</h4>
                <div className="qa-odds-row">
                  <div className="qa-odd-card">
                    <span>Over 2.5</span>
                    <b>{fixture.market.over25Odds > 0 ? fixture.market.over25Odds.toFixed(2) : "-"}</b>
                    <small>{analysis.probabilities.over25}%</small>
                  </div>
                  <div className="qa-odd-card">
                    <span>Under 3.5</span>
                    <b>{fixture.market.under35Odds > 0 ? fixture.market.under35Odds.toFixed(2) : "-"}</b>
                    <small>{analysis.probabilities.under35}%</small>
                  </div>
                  <div className="qa-odd-card">
                    <span>BTTS</span>
                    <b>{fixture.market.bttsYesOdds > 0 ? fixture.market.bttsYesOdds.toFixed(2) : "-"}</b>
                    <small>{analysis.probabilities.btts}%</small>
                  </div>
                </div>
              </div>

              {analysis.advancedModels && (
                <div className="qa-odds-section">
                  <h4><Activity size={14} /> HT · Córners · Tarjetas</h4>
                  <div className="qa-odds-row">
                    <div className="qa-odd-card">
                      <span>1X2 HT</span>
                      <b>{analysis.advancedModels.halfTime.homeWinHT}/{analysis.advancedModels.halfTime.drawHT}/{analysis.advancedModels.halfTime.awayWinHT}</b>
                      <small>Over 0.5 HT {analysis.advancedModels.halfTime.over05HT}%</small>
                    </div>
                    <div className="qa-odd-card">
                      <span>Córners</span>
                      <b>{analysis.advancedModels.cornersEsp.expectedTotalCorners}</b>
                      <small>Over 9.5 {analysis.advancedModels.cornersEsp.over95Corners}%</small>
                    </div>
                    <div className="qa-odd-card">
                      <span>Tarjetas</span>
                      <b>{analysis.advancedModels.cardsRisk.expectedYellows}</b>
                      <small>{analysis.advancedModels.cardsRisk.highCardRisk ? "Riesgo alto" : "Riesgo normal"}</small>
                    </div>
                    {analysis.advancedModels.multiMarket && (
                      <div className="qa-odd-card">
                        <span>Multi-mercado</span>
                        <b>{analysis.advancedModels.multiMarket.calibration.valueFilterScore}%</b>
                        <small>
                          Córners {analysis.advancedModels.multiMarket.corners.dataQuality}% · Tarjetas {analysis.advancedModels.multiMarket.cards.dataQuality}%
                        </small>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="qa-scores-section">
              <h4><Trophy size={14} /> Marcadores más probables</h4>
              {topScores.length > 0 ? (
                <div className="qa-scores-list">
                  {topScores.map((s, i) => (
                    <div key={s.score} className={`qa-score-item ${i === 0 ? "best" : ""}`}>
                      <strong>{s.score}</strong>
                      <div className="qa-score-bar">
                        <div className="qa-score-bar-fill" style={{ width: `${Math.min(100, s.probability * 4)}%` }} />
                      </div>
                      <span>{s.probability}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="qa-scores-empty">Cargando predicción de marcador desde datos de xG y Poisson...</p>
              )}
            </div>

            <TacticalRadar fixture={fixture} analysis={analysis} />

            {mlPrediction && (
              <div className="qa-ml-section">
                <h4><Brain size={16} /> Inteligencia Artificial (Deep Learning & Gradient Boosting)</h4>
                <div className="qa-ensemble-header">
                  <span className="qa-ensemble-dominant">
                    Predicción auditada: <strong>{auditedPrediction}</strong>
                  </span>
                  <span className="qa-ensemble-agreement">
                    Confianza AI: <strong>{mlPrediction.confidence}%</strong>
                  </span>
                </div>

                {hybridConsistencyFlags.length > 0 && (
                  <div className="qa-risk-chip" style={{ margin: "0.75rem 0", width: "fit-content" }}>
                    <AlertTriangle size={14} />
                    {consistencyReason(hybridConsistencyFlags)}
                  </div>
                )}
                
                <div className="qa-ensemble-grid">
                  {Object.entries(mlPrediction.probabilities).map(([modelName, probs]) => {
                    const is1x2 = probs["HOME_WIN"] !== undefined;
                    if (!is1x2) return null; // Solo mostrar modelos 1x2 en este panel
                    return (
                      <div key={modelName} className="qa-model-card">
                        <div className="qa-model-header">
                          <strong>{modelName.toUpperCase()}</strong>
                        </div>
                        <div className="qa-model-probs">
                          <div className="qa-model-prob">
                            <span>1</span>
                            <div className="qa-model-bar"><div style={{ width: `${probs["HOME_WIN"]}%` }} /></div>
                            <b>{Math.round(probs["HOME_WIN"])}%</b>
                          </div>
                          <div className="qa-model-prob">
                            <span>X</span>
                            <div className="qa-model-bar draw"><div style={{ width: `${probs["DRAW"]}%` }} /></div>
                            <b>{Math.round(probs["DRAW"])}%</b>
                          </div>
                          <div className="qa-model-prob">
                            <span>2</span>
                            <div className="qa-model-bar away"><div style={{ width: `${probs["AWAY_WIN"]}%` }} /></div>
                            <b>{Math.round(probs["AWAY_WIN"])}%</b>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {mlPrediction.shap?.top_features && mlPrediction.shap.top_features.length > 0 && (
                  <div className="qa-shap-section" style={{ marginTop: "1rem", background: "var(--bg-layer-1)", padding: "1rem", borderRadius: "8px" }}>
                    <h4><Activity size={14} style={{ display: "inline", marginRight: "4px" }} /> Importancia de Factores (SHAP Values)</h4>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                      Estas son las variables que más impactaron la decisión de la Inteligencia Artificial.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {mlPrediction.shap.top_features.slice(0, 5).map((feat, i) => {
                        const maxImpact = mlPrediction.shap.top_features[0].impact;
                        const pct = (feat.impact / maxImpact) * 100;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.75rem", width: "120px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                              {feat.feature.replace(/_/g, " ").toUpperCase()}
                            </span>
                            <div style={{ flex: 1, height: "6px", background: "var(--bg-layer-2)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                            </div>
                            <span style={{ fontSize: "0.75rem", width: "30px", textAlign: "right", fontWeight: "bold" }}>
                              {Math.round((feat.impact * 100))}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!mlPrediction && analysis.ensemble && (
              <div className="qa-ensemble-section">
                <h4><Brain size={16} /> Ensemble — 4 Modelos de Predicción</h4>
                <div className="qa-ensemble-header">
                  <span className="qa-ensemble-agreement">
                    Acuerdo: <strong>{analysis.ensemble.modelAgreement}%</strong>
                  </span>
                  <span className="qa-ensemble-dominant">
                    Dominante: <strong>{analysis.ensemble.dominantModel}</strong>
                  </span>
                </div>
                <div className="qa-ensemble-grid">
                  {Object.entries(analysis.ensemble.models).map(([name, model]) => (
                    <div key={name} className="qa-model-card">
                      <div className="qa-model-header">
                        <strong>{name === "poisson" ? "Poisson" : name === "negBinom" ? "Neg. Binomial" : name === "elo" ? "ELO Rating" : "Forma"}</strong>
                        <span className="qa-model-weight">{Math.round(model.weight * 100)}%</span>
                      </div>
                      <div className="qa-model-probs">
                        <div className="qa-model-prob">
                          <span>1</span>
                          <div className="qa-model-bar"><div style={{ width: `${model.homeWin}%` }} /></div>
                          <b>{model.homeWin}%</b>
                        </div>
                        <div className="qa-model-prob">
                          <span>X</span>
                          <div className="qa-model-bar draw"><div style={{ width: `${model.draw}%` }} /></div>
                          <b>{model.draw}%</b>
                        </div>
                        <div className="qa-model-prob">
                          <span>2</span>
                          <div className="qa-model-bar away"><div style={{ width: `${model.awayWin}%` }} /></div>
                          <b>{model.awayWin}%</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="qa-ensemble-result">
                  <span>Resultado Ensemble:</span>
                  <div className="qa-ensemble-final">
                    <b className="home">{analysis.ensemble.homeWin}%</b>
                    <b className="draw">{analysis.ensemble.draw}%</b>
                    <b className="away">{analysis.ensemble.awayWin}%</b>
                  </div>
                </div>
              </div>
            )}

            {analysis.kelly && analysis.kelly.bets.length > 0 && (
              <div className="qa-kelly-section">
                <h4><TrendingUp size={16} /> Kelly Criterion — Apuestas Óptimas</h4>
                <div className="qa-kelly-metrics">
                  <div className="qa-kelly-metric">
                    <span>Exposición</span>
                    <b>{analysis.kelly.totalExposure}%</b>
                  </div>
                  <div className="qa-kelly-metric">
                    <span>ROI esperado</span>
                    <b>{(analysis.kelly.expectedROI * 100).toFixed(1)}%</b>
                  </div>
                  <div className="qa-kelly-metric">
                    <span>Sharpe Ratio</span>
                    <b>{analysis.kelly.sharpeRatio}</b>
                  </div>
                </div>
                <div className="qa-kelly-bets">
                  {analysis.kelly.bets.map((bet, i) => (
                    <div key={i} className={`qa-kelly-bet ${bet.riskLevel}`}>
                      <div className="qa-kelly-bet-header">
                        <strong>{bet.market}</strong>
                        <span className={`qa-kelly-risk ${bet.riskLevel}`}>{bet.riskLevel === "high" ? "AGRESIVA" : bet.riskLevel === "medium" ? "ESTÁNDAR" : "CONSERVADORA"}</span>
                      </div>
                      <div className="qa-kelly-bet-data">
                        <div><span>Stake</span><b>{bet.stakeUnits}u</b></div>
                        <div><span>Edge</span><b>+{bet.edge}%</b></div>
                        <div><span>EV</span><b>{(bet.expectedValue * 100).toFixed(1)}%</b></div>
                      </div>
                      <p className="qa-kelly-rec">{bet.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lineups && lineups.length > 0 && (
              <div className="qa-lineups-section">
                <h4><Users size={16} /> Alineaciones</h4>
                <div className="qa-lineups-grid">
                  {lineups.map((lineup) => (
                    <div key={lineup.teamId} className="qa-lineup-team">
                      <div className="qa-lineup-header">
                        {lineup.teamLogo && <img src={lineup.teamLogo} alt="" className="qa-lineup-logo" />}
                        <strong>{lineup.teamName}</strong>
                        {lineup.formation && <span className="qa-formation">{lineup.formation}</span>}
                      </div>
                      {lineup.coach && (
                        <div className="qa-coach">
                          {lineup.coach.photo && <img src={lineup.coach.photo} alt="" className="qa-coach-photo" />}
                          <span>DT: {lineup.coach.name}</span>
                        </div>
                      )}
                      <div className="qa-lineup-players">
                        <div className="qa-lineup-starters">
                          <small className="qa-lineup-label">Titulares</small>
                          {lineup.startXI.map((p) => (
                            <div key={p.id || p.name} className="qa-player-row">
                              <span className="qa-player-number">{p.number}</span>
                              <span className="qa-player-name">{p.name}</span>
                              <span className="qa-player-pos">{p.position}</span>
                              {p.rating && <span className="qa-player-rating">{parseFloat(p.rating).toFixed(1)}</span>}
                              {p.captain && <span className="qa-captain">©</span>}
                            </div>
                          ))}
                        </div>
                        <div className="qa-lineup-subs">
                          <small className="qa-lineup-label">Suplentes</small>
                          {lineup.substitutes.slice(0, 9).map((p) => (
                            <div key={p.id || p.name} className="qa-player-row sub">
                              <span className="qa-player-number">{p.number}</span>
                              <span className="qa-player-name">{p.name}</span>
                              <span className="qa-player-pos">{p.position}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {events && events.length > 0 && (
              <div className="qa-events-section">
                <h4><Clock size={16} /> Desarrollo del partido ({events.length})</h4>
                <MatchEventTimeline events={events} statistics={statistics} />
              </div>
            )}

            {statistics && statistics.length > 0 && (
              <div className="qa-stats-section">
                <h4><BarChart3 size={16} /> Estadísticas del Partido</h4>
                <div className="qa-stats-grid">
                  {statistics.map((stat) => {
                    const homeVal = parseFloat(stat.home) || 0;
                    const awayVal = parseFloat(stat.away) || 0;
                    const total = homeVal + awayVal || 1;
                    const homePct = (homeVal / total) * 100;
                    return (
                      <div key={stat.type} className="qa-stat-row">
                        <span className="qa-stat-home-val">{stat.home}</span>
                        <div className="qa-stat-bar-container">
                          <div className="qa-stat-bar-home" style={{ width: `${homePct}%` }} />
                          <div className="qa-stat-bar-away" style={{ width: `${100 - homePct}%` }} />
                        </div>
                        <span className="qa-stat-label">{stat.type}</span>
                        <div className="qa-stat-bar-container">
                          <div className="qa-stat-bar-home" style={{ width: `${homePct}%` }} />
                          <div className="qa-stat-bar-away" style={{ width: `${100 - homePct}%` }} />
                        </div>
                        <span className="qa-stat-away-val">{stat.away}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="qa-markets-table">
              <h4><BarChart3 size={14} /> Análisis de Valor — Todos los Mercados</h4>
              <table>
                <thead>
                  <tr>
                    <th>Mercado</th>
                    <th>Modelo</th>
                    <th>Mercado</th>
                    <th>Edge</th>
                    <th>Veredicto</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.valueTable.map((row) => (
                    <tr key={row.market} className={row.edge >= 5 ? "value" : row.edge < -7 ? "avoid" : ""}>
                      <td>{row.market}</td>
                      <td>{row.modelProbability}%</td>
                      <td>{row.marketProbability}%</td>
                      <td className={row.edge > 0 ? "edge-positive" : "edge-negative"}>
                        {row.edge > 0 ? "+" : ""}{row.edge}%
                      </td>
                      <td>
                        <span className={`qa-verdict ${row.verdict.toLowerCase()}`}>{row.verdict}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {valueMarkets.length > 0 && (
              <div className="qa-value-section">
                <h4><TrendingUp size={16} /> Mercados con Mayor Valor</h4>
                <div className="qa-value-list">
                  {valueMarkets.map((m) => (
                    <div key={m.market} className="qa-value-item">
                      <span className="qa-value-name">{m.market}</span>
                      <span className="qa-value-prob">{m.modelProbability}%</span>
                      <span className="qa-value-edge">+{m.edge}%</span>
                      <span className="qa-value-verdict">{m.verdict}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.riskFlags.length > 0 && (
              <div className="qa-risks">
                <h4><AlertTriangle size={16} /> Riesgos detectados ({analysis.riskFlags.length})</h4>
                <div className="qa-risk-list">
                  {analysis.riskFlags.map((flag) => (
                    <span key={flag.id} className={`qa-risk-tag ${flag.severity}`}>
                      {flag.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {mlPrediction && (
              <div className="qa-ml-section">
                <div className="qa-ml-header">
                  <Brain size={16} />
                  <strong>ML crudo (diagnóstico)</strong>
                </div>
                <p className="qa-muted-copy">
                  Señal directa del modelo antes de compuertas de consistencia, value, calibración ROI y Kelly.
                </p>
                <div className="qa-ml-probs">
                  {mlPrediction.classes.map((cls) => {
                    const prob = mlPrediction.probabilities.ensemble?.[cls] ?? 0;
                    const isBest = cls === mlPrediction.prediction;
                    return (
                      <div key={cls} className={`qa-ml-prob ${isBest ? "best" : ""}`}>
                        <div className="qa-ml-label">{cls === "HOME_WIN" ? "Local" : cls === "AWAY_WIN" ? "Visitante" : "Empate"}</div>
                        <div className="qa-ml-value">{prob}%</div>
                        <div className="qa-ml-bar">
                          <div style={{ width: `${prob}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="qa-ml-shap" style={{ marginTop: "0.75rem" }}>
                  <div className="qa-ml-shap-title">Salida final auditada</div>
                  <div className="qa-ml-shap-chips">
                    <span>Local: {analysis.probabilities.homeWin}%</span>
                    <span>Empate: {analysis.probabilities.draw}%</span>
                    <span>Visitante: {analysis.probabilities.awayWin}%</span>
                    <span>{analysis.recommendation.market} · {analysis.recommendation.stakeUnits}u</span>
                  </div>
                </div>
                {mlPrediction.shap?.top_features?.length > 0 && (
                  <div className="qa-ml-shap">
                    <div className="qa-ml-shap-title">Factores clave (SHAP)</div>
                    <div className="qa-ml-shap-chips">
                      {mlPrediction.shap.top_features.map((f) => (
                        <span key={f.feature} className={f.impact > 0 ? "pos" : "neg"}>
                          {f.feature}: {f.impact > 0 ? "+" : ""}{f.impact}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "h2h" && <MatchCenterH2HPanel fixture={fixture} />}

        {activeTab === "partido" && (
          <>
            {lineups && lineups.length > 0 && (
              <div className="qa-lineups-section">
                <h4><Users size={16} /> Alineaciones</h4>
                <div className="qa-lineups-grid">
                  {lineups.map((lineup) => (
                    <div key={lineup.teamId} className="qa-lineup-team">
                      <div className="qa-lineup-header">
                        {lineup.teamLogo && <img src={lineup.teamLogo} alt="" className="qa-lineup-logo" />}
                        <strong>{lineup.teamName}</strong>
                        {lineup.formation && <span className="qa-formation">{lineup.formation}</span>}
                      </div>
                      {lineup.coach && (
                        <div className="qa-coach">
                          {lineup.coach.photo && <img src={lineup.coach.photo} alt="" className="qa-coach-photo" />}
                          <span>DT: {lineup.coach.name}</span>
                        </div>
                      )}
                      <div className="qa-lineup-players">
                        <div className="qa-lineup-starters">
                          <small className="qa-lineup-label">Titulares</small>
                          {lineup.startXI.map((p) => (
                            <div key={p.id || p.name} className="qa-player-row">
                              <span className="qa-player-number">{p.number}</span>
                              <span className="qa-player-name">{p.name}</span>
                              <span className="qa-player-pos">{p.position}</span>
                              {p.rating && <span className="qa-player-rating">{parseFloat(p.rating).toFixed(1)}</span>}
                              {p.captain && <span className="qa-captain">©</span>}
                            </div>
                          ))}
                        </div>
                        <div className="qa-lineup-subs">
                          <small className="qa-lineup-label">Suplentes</small>
                          {lineup.substitutes.slice(0, 9).map((p) => (
                            <div key={p.id || p.name} className="qa-player-row sub">
                              <span className="qa-player-number">{p.number}</span>
                              <span className="qa-player-name">{p.name}</span>
                              <span className="qa-player-pos">{p.position}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!lineups || lineups.length === 0) && (
              <div className="mc-panel mc-empty">
                <Users size={20} />
                <p>Alineaciones no confirmadas aún. El modelo aplica penalización automática hasta que se publiquen.</p>
              </div>
            )}

            {events && events.length > 0 && (
              <div className="qa-events-section">
                <h4><Clock size={16} /> Desarrollo del partido ({events.length})</h4>
                <MatchEventTimeline events={events} statistics={statistics} />
              </div>
            )}

            {statistics && statistics.length > 0 && (
              <div className="qa-stats-section">
                <h4><BarChart3 size={16} /> Estadísticas del Partido</h4>
                <div className="qa-stats-grid">
                  {statistics.map((stat) => {
                    const homeVal = parseFloat(stat.home) || 0;
                    const awayVal = parseFloat(stat.away) || 0;
                    const total = homeVal + awayVal || 1;
                    const homePct = (homeVal / total) * 100;
                    return (
                      <div key={stat.type} className="qa-stat-row">
                        <span className="qa-stat-home-val">{stat.home}</span>
                        <div className="qa-stat-bar-container">
                          <div className="qa-stat-bar-home" style={{ width: `${homePct}%` }} />
                          <div className="qa-stat-bar-away" style={{ width: `${100 - homePct}%` }} />
                        </div>
                        <span className="qa-stat-label">{stat.type}</span>
                        <div className="qa-stat-bar-container">
                          <div className="qa-stat-bar-home" style={{ width: `${homePct}%` }} />
                          <div className="qa-stat-bar-away" style={{ width: `${100 - homePct}%` }} />
                        </div>
                        <span className="qa-stat-away-val">{stat.away}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "plantilla" && (
          <MatchCenterSquadPanel fixture={fixture} lineups={lineups} />
        )}

        {activeTab === "contexto" && <MatchCenterContextPanel fixture={fixture} analysis={analysis} />}
      </div>
      {/* Actions */}
      <div className="qa-actions">
        {confidence >= CONFIDENCE_THRESHOLDS.caution && (
          <button
            className="qa-btn-primary"
            onClick={handleSavePrediction}
            disabled={saved}
            style={{ opacity: saved ? 0.6 : 1 }}
          >
            <Target size={16} />
            {saved ? "Predicción Guardada ✓" : "Guardar Predicción"}
          </button>
        )}
        <button className="qa-btn-deep" onClick={onOpenDeep}>
          <Zap size={16} /> Análisis Profundo
        </button>
        <button className="qa-btn-reanalyze" onClick={handleReanalyze} disabled={isReanalyzing || loading}>
          <Brain size={16} className={isReanalyzing ? "spin" : undefined} />
          {isReanalyzing ? "Re-ejecutando..." : "Re-ejecutar Modelos"}
        </button>
      </div>

      <p className="qa-disclaimer">
        ⚠️ Análisis informativo. Verifica alineaciones antes del partido. Apuesta responsable.
      </p>
    </div>
  );
}

// ── Sub-component: Match Header ──────────────────────────────────────────────
function MatchHeader({
  fixture, favoriteTeams, toggleFav, formatKickoff, analysis,
}: {
  fixture: Fixture;
  favoriteTeams: string[];
  toggleFav: (id: string) => void;
  formatKickoff: (k: string) => string;
  analysis?: AnalysisResult;
}) {
  const isLive = fixture.status === "live";
  const isFinal = fixture.status === "final";
  const isPostponed = fixture.status === "postponed";
  const isCancelled = fixture.status === "cancelled";
  const score = fixture.result;

  return (
    <>
      {/* Match info bar */}
      <div className="qa-match-info">
        <div className="qa-info-item">
          {fixture.leagueFlag && <img src={fixture.leagueFlag} alt="" className="qa-info-flag" />}
          {fixture.leagueLogo && <img src={fixture.leagueLogo} alt="" className="qa-info-logo" />}
          <span>{fixture.leagueName}</span>
          {fixture.round && <small>· {fixture.round}</small>}
        </div>
        <div className="qa-info-item">
          <Calendar size={13} />
          <span>{formatKickoff(fixture.kickoff)}</span>
        </div>
        <div className="qa-info-item">
          {isLive && <span className="qa-live-status">● EN VIVO {fixture.elapsed ? `${fixture.elapsed}'` : ""}</span>}
          {isFinal && <span className="qa-final-status">FINALIZADO</span>}
          {isPostponed && (
            <span className="qa-postponed-status" title={fixture.statusLong}>
              {fixtureStatusLabelEs("postponed", fixture.statusLong).toUpperCase()}
            </span>
          )}
          {isCancelled && (
            <span className="qa-cancelled-status" title={fixture.statusLong}>
              {fixtureStatusLabelEs("cancelled", fixture.statusLong).toUpperCase()}
            </span>
          )}
          {!isLive && !isFinal && !isPostponed && !isCancelled && (
            <span className="qa-pre-status">PROGRAMADO</span>
          )}
        </div>
        {fixture.venue?.name && (
          <div className="qa-info-item">
            <span>{fixture.venue.name}{fixture.venue.city ? ` · ${fixture.venue.city}` : ""}</span>
          </div>
        )}
        {fixture.weather?.temperatureC != null && (
          <div className="qa-info-item">
            <span>{fixture.weather.temperatureC}°C · {fixture.weather.condition ?? "Clima"}{fixture.weather.source === "estimate" ? " (est.)" : ""}</span>
          </div>
        )}
      </div>

      {/* Teams + score */}
      <div className="qa-match-header">
        <div className="qa-team">
          {fixture.home.logo && <img src={fixture.home.logo} alt="" className="qa-logo" />}
          <strong>{fixture.home.name}</strong>
          <button
            type="button"
            className={`qa-fav-btn ${favoriteTeams.includes(fixture.home.id) ? "active" : ""}`}
            title={favoriteTeams.includes(fixture.home.id) ? "Quitar alertas en vivo" : "Alertas en vivo (gol, tarjeta, penalti)"}
            onClick={() => toggleFav(fixture.home.id)}
          >
            <Star size={16} />
          </button>
        </div>

        <div className="qa-score-center">
          {score ? (
            <div className={`qa-live-score ${isLive ? "live" : ""}`}>
              <span>{score.homeGoals}</span>
              <span className="qa-score-dash">-</span>
              <span>{score.awayGoals}</span>
            </div>
          ) : analysis ? (
            <>
              <div className="qa-probs">
                <span className="qa-prob home">{analysis.probabilities.homeWin}%</span>
                <span className="qa-prob draw">{analysis.probabilities.draw}%</span>
                <span className="qa-prob away">{analysis.probabilities.awayWin}%</span>
              </div>
              <small>1 · X · 2</small>
            </>
          ) : (
            <span className="qa-vs">VS</span>
          )}
          {score?.firstHalfHome !== undefined && score.firstHalfHome !== null && (
            <small className="qa-ht">HT {score.firstHalfHome}-{score.firstHalfAway}</small>
          )}
        </div>

        <div className="qa-team away">
          <button
            type="button"
            className={`qa-fav-btn ${favoriteTeams.includes(fixture.away.id) ? "active" : ""}`}
            title={favoriteTeams.includes(fixture.away.id) ? "Quitar alertas en vivo" : "Alertas en vivo (gol, tarjeta, penalti)"}
            onClick={() => toggleFav(fixture.away.id)}
          >
            <Star size={16} />
          </button>
          <strong>{fixture.away.name}</strong>
          {fixture.away.logo && <img src={fixture.away.logo} alt="" className="qa-logo" />}
        </div>
      </div>
    </>
  );
}
