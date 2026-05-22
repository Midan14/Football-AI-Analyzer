"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain, ShieldCheck, Star, TrendingUp, AlertTriangle, Zap, Target,
  Calendar, Trophy, Activity, BarChart3, RefreshCw, Users, Clock,
} from "lucide-react";
import type { AnalysisResult, Fixture, MatchLineup, MatchEvent, MatchStatistic, TeamRecentMatch, TeamSnapshot } from "@/shared/domain";
import type { AnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import { AnalysisPipelineBadge } from "./analysis-pipeline-badge";
import { TacticalRadar } from "./tactical-radar";
import {
  MatchCenterContextPanel,
  MatchCenterH2HPanel,
  MatchCenterTabBar,
  type MatchCenterTab,
} from "./match-center-panels";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import { createPredictionFromAnalysis } from "@/frontend/lib/predictions-api";

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

export function QuickAnalysisCard({ fixture, onAnalyze, analysis, lineups, events, statistics, loading, isFetching, isReanalyzing = false, lastUpdatedAt, onOpenDeep, addToast, mlPrediction, analysisPipeline, analysisError, analysisErrorMessage, onRetryAnalysis }: QuickAnalysisCardProps) {
  const [favoriteTeams, setFavoriteTeams] = useLocalStorage<string[]>("live-sound-favorite-teams", []);
  const [activeTab, setActiveTab] = useState<MatchCenterTab>("resumen");
  const savedFixtureRef = useRef<string>("");
  const [saved, setSaved] = useState(false);

  const handleReanalyze = async () => {
    setSaved(false);
    savedFixtureRef.current = "";
    await onAnalyze();
  };

  // Auto-save prediction when analysis completes
  useEffect(() => {
    if (!analysis || !fixture || savedFixtureRef.current === fixture.id) return;
    savedFixtureRef.current = fixture.id;
    const riskLevel = analysis.confidence.score >= 68 ? "BAJO" : analysis.confidence.score >= 52 ? "MODERADO" : "ALTO";
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

  const formatKickoff = (kickoff: string) => {
    const d = new Date(kickoff);
    return d.toLocaleString("es-CO", {
      weekday: "short", day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/Bogota",
    });
  };

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
          <small>Poisson Dixon-Coles · Neg.Binomial · ELO · Monte Carlo híbrido · Kelly · Bayesian</small>
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
            <span className="qa-step done">✓ Poisson Bivariado</span>
            <span className="qa-step done">✓ Binomial Negativa</span>
            <span className="qa-step done">✓ ELO Rating</span>
            <span className="qa-step active">⟳ Ensemble (4 modelos)</span>
            <span className="qa-step">○ Kelly Criterion</span>
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
    const riskLevel = analysis.confidence.score >= 72 ? "BAJO" : analysis.confidence.score >= 58 ? "MODERADO" : "ALTO";
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
  const confidence = analysis.confidence.score;
  const riskLevel = confidence >= 72 ? "BAJO" : confidence >= 58 ? "MODERADO" : "ALTO";
  const decision = confidence >= 72 ? "APOSTAR" : confidence >= 58 ? "PRECAUCIÓN" : "NO APOSTAR";
  const decisionColor = confidence >= 72 ? "#34d399" : confidence >= 58 ? "#f59e0b" : "#f43f5e";

  const valueMarkets = analysis.valueTable
    .filter((r) => r.edge > 3 && r.modelProbability > 30)
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

            {analysis.ensemble && (
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
                <h4><Clock size={16} /> Eventos del Partido ({events.length})</h4>
                <div className="qa-events-list">
                  {events.map((ev, i) => (
                    <div key={i} className={`qa-event-row qa-event-${ev.type.toLowerCase()}`}>
                      <span className="qa-event-time">{ev.time}{ev.extraTime ? `+${ev.extraTime}` : ""}′</span>
                      <span className={`qa-event-icon ${ev.type.toLowerCase()}`}>
                        {ev.type === "Goal" ? "⚽" : ev.detail?.includes("Red") ? "🟥" : ev.detail?.includes("Yellow") ? "🟨" : ev.type === "subst" ? "🔄" : ev.type === "Var" ? "📺" : "•"}
                      </span>
                      <div className="qa-event-info">
                        <strong>{ev.player}</strong>
                        {ev.assist && <span className="qa-event-assist">({ev.assist})</span>}
                        <small>{ev.detail} · {ev.team}</small>
                      </div>
                    </div>
                  ))}
                </div>
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
                    <tr key={row.market} className={row.edge > 3 ? "value" : row.edge < -7 ? "avoid" : ""}>
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
                  <strong>Predicción ML (Ensemble)</strong>
                </div>
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
                <h4><Clock size={16} /> Eventos del Partido ({events.length})</h4>
                <div className="qa-events-list">
                  {events.map((ev, i) => (
                    <div key={i} className={`qa-event-row qa-event-${ev.type.toLowerCase()}`}>
                      <span className="qa-event-time">{ev.time}{ev.extraTime ? `+${ev.extraTime}` : ""}′</span>
                      <span className={`qa-event-icon ${ev.type.toLowerCase()}`}>
                        {ev.type === "Goal" ? "⚽" : ev.detail?.includes("Red") ? "🟥" : ev.detail?.includes("Yellow") ? "🟨" : ev.type === "subst" ? "🔄" : ev.type === "Var" ? "📺" : "•"}
                      </span>
                      <div className="qa-event-info">
                        <strong>{ev.player}</strong>
                        {ev.assist && <span className="qa-event-assist">({ev.assist})</span>}
                        <small>{ev.detail} · {ev.team}</small>
                      </div>
                    </div>
                  ))}
                </div>
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

        {activeTab === "contexto" && <MatchCenterContextPanel fixture={fixture} analysis={analysis} />}
      </div>
      {/* Actions */}
      <div className="qa-actions">
        {confidence >= 52 && (
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
          {!isLive && !isFinal && <span className="qa-pre-status">PROGRAMADO</span>}
        </div>
      </div>

      {/* Teams + score */}
      <div className="qa-match-header">
        <div className="qa-team">
          {fixture.home.logo && <img src={fixture.home.logo} alt="" className="qa-logo" />}
          <strong>{fixture.home.name}</strong>
          <button className={`qa-fav-btn ${favoriteTeams.includes(fixture.home.id) ? "active" : ""}`} onClick={() => toggleFav(fixture.home.id)}>
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
          <button className={`qa-fav-btn ${favoriteTeams.includes(fixture.away.id) ? "active" : ""}`} onClick={() => toggleFav(fixture.away.id)}>
            <Star size={16} />
          </button>
          <strong>{fixture.away.name}</strong>
          {fixture.away.logo && <img src={fixture.away.logo} alt="" className="qa-logo" />}
        </div>
      </div>
    </>
  );
}
