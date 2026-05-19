"use client";

import { useState, useCallback } from "react";
import {
  AlertTriangle,
  Activity,
  Brain,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Gauge,
  Lightbulb,
  Shield,
  ShieldAlert,
  TrendingUp,
  Users,
  Zap,
  Target,
  Gamepad2,
} from "lucide-react";
import type { Fixture } from "@/shared/domain";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { useDeepAnalysis } from "@/frontend/hooks/use-deep-analysis";

type DeepAnalysisViewProps = {
  fixture?: Fixture;
};

const riskGradeConfig: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: "#10b981", bg: "rgba(16, 185, 129, 0.12)", label: "Grado A — Confianza muy alta" },
  B: { color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", label: "Grado B — Confianza alta" },
  C: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)", label: "Grado C — Confianza moderada" },
  D: { color: "#ff6258", bg: "rgba(255, 98, 88, 0.12)", label: "Grado D — Confianza baja" },
};

const categoryIcons: Record<string, React.ReactNode> = {
  Viaje: <Target size={20} />,
  Presión: <AlertTriangle size={20} />,
  Psicológico: <Brain size={20} />,
  Arbitraje: <Gauge size={20} />,
  H2H: <TrendingUp size={20} />,
  Forma: <TrendingUp size={20} />,
  Económico: <Target size={20} />,
  Lesiones: <Users size={20} />,
};

export function DeepAnalysisView({ fixture }: DeepAnalysisViewProps) {
  const { data: deepAnalysis, isLoading, error, dataUpdatedAt, isFetching } = useDeepAnalysis(fixture?.id ?? "");
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopyPrompt = useCallback(() => {
    if (!deepAnalysis?.aiPrompt) return;
    navigator.clipboard.writeText(deepAnalysis.aiPrompt).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    });
  }, [deepAnalysis?.aiPrompt]);

  if (!fixture) {
    return (
      <article className="panel deep-analysis">
        <div className="panel-head">
          <h2><Brain size={22} /> Análisis Profundo</h2>
          <span>Selecciona un partido</span>
        </div>
        <div className="empty-state large">Selecciona un partido para ejecutar el análisis profundo.</div>
      </article>
    );
  }

  if (isLoading) {
    return (
      <article className="panel deep-analysis">
        <div className="panel-head">
          <h2><Brain size={22} /> Análisis Profundo</h2>
          <span>Procesando...</span>
        </div>
        <div className="empty-state large">Ejecutando modelo profundo: Poisson + Monte Carlo + Teoría de Juegos + Análisis Psicológico...</div>
      </article>
    );
  }

  if (error) {
    return (
      <article className="panel deep-analysis">
        <div className="panel-head">
          <h2><Brain size={22} /> Análisis Profundo</h2>
          <span>Error</span>
        </div>
        <div className="empty-state large">Error al cargar el análisis profundo: {error instanceof Error ? error.message : String(error)}</div>
      </article>
    );
  }

  if (!deepAnalysis) {
    return (
      <article className="panel deep-analysis">
        <div className="panel-head">
          <h2><Brain size={22} /> Análisis Profundo</h2>
          <span>Sin datos</span>
        </div>
        <div className="empty-state large">No hay datos de análisis profundo disponibles para este partido.</div>
      </article>
    );
  }

  const rc = riskGradeConfig[deepAnalysis.safeMarket.riskGrade] ?? riskGradeConfig.D;

  return (
    <article className="panel deep-analysis">
      <div className="panel-head">
        <h2><Brain size={22} /> Análisis Profundo</h2>
        <span>{fixture.leagueName}</span>
      </div>

      <div className="match-hero compact">
        <div className="team home">
          {fixture.home.logo ? (
            <img src={fixture.home.logo} alt={fixture.home.name} className="club-logo" />
          ) : (
            <div className="club-shield red-shield" />
          )}
          <strong>{fixture.home.name}</strong>
        </div>
        <div className="venue">
          <strong>{formatDateTime(fixture.kickoff)}</strong>
          <span>{fixture.leagueName}</span>
          <span>Confianza modelo: {deepAnalysis.confidence.score}/100</span>
        </div>
        <div className="team away">
          {fixture.away.logo ? (
            <img src={fixture.away.logo} alt={fixture.away.name} className="club-logo" />
          ) : (
            <div className="club-shield orange-shield" />
          )}
          <strong>{fixture.away.name}</strong>
        </div>
      </div>

      {/* Update indicator */}
      <div className="deep-update-strip">
        {isFetching && <span className="deep-updating">⟳ Actualizando...</span>}
        {dataUpdatedAt > 0 && (
          <span className="deep-timestamp">
            Análisis generado: {new Date(dataUpdatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Bogota" })} COT
          </span>
        )}
        <span className="deep-models-badge">16 modelos activos</span>
      </div>

      <section className="deep-grid">
        <div className="deep-card safe-market-card" style={{ borderColor: rc.color, background: rc.bg }}>
          <div className="deep-card-header">
            <Shield size={24} color={rc.color} />
            <h3>Mercado Seguro Recomendado</h3>
            <span className="risk-grade-badge" style={{ background: rc.color }}>
              {deepAnalysis.safeMarket.riskGrade}
            </span>
          </div>
          <div className="safe-market-detail">
            <strong>{deepAnalysis.safeMarket.market}</strong>
            <div className="safe-metrics">
              <span>Confianza: <b>{deepAnalysis.safeMarket.confidence}%</b></span>
              <span>Edge: <b className={deepAnalysis.safeMarket.edge > 0 ? "positive" : "negative"}>
                {deepAnalysis.safeMarket.edge > 0 ? "+" : ""}{deepAnalysis.safeMarket.edge}%
              </b></span>
            </div>
            <p>{deepAnalysis.safeMarket.explanation}</p>
            <small>{rc.label}</small>
          </div>
        </div>

        <div className="deep-card monte-carlo-card">
          <div className="deep-card-header">
            <Zap size={24} />
            <h3>Monte Carlo (1000 iter.)</h3>
          </div>
          <div className="monte-carlo-stats">
            <div className="mc-stat">
              <span>Sharp Ratio</span>
              <strong>{deepAnalysis.monteCarlo.sharpRatio}</strong>
            </div>
            <div className="mc-stat">
              <span>Over 2.5 Confianza</span>
              <strong>{deepAnalysis.monteCarlo.over25Confidence}%</strong>
            </div>
            <div className="mc-stat">
              <span>Muestras Local</span>
              <strong>{deepAnalysis.monteCarlo.homeWinDist.length}</strong>
            </div>
            <div className="mc-stat">
              <span>Iteraciones</span>
              <strong>{deepAnalysis.monteCarlo.iterations}</strong>
            </div>
          </div>
          <div className="distribution-mini">
            <span className="dist-label">Distribución goles local:</span>
            <div className="dist-bars">
              {deepAnalysis.monteCarlo.homeWinDist.slice(0, 8).map((g, i) => (
                <div key={`h-${i}`} className="dist-bar-wrap">
                  <span>{g}</span>
                  <div className="dist-bar" style={{ height: `${Math.min(100, g * 18)}%`, background: "#ff6258" }} />
                  <small>{i}</small>
                </div>
              ))}
            </div>
            <span className="dist-label">Distribución goles visita:</span>
            <div className="dist-bars">
              {deepAnalysis.monteCarlo.awayWinDist.slice(0, 8).map((g, i) => (
                <div key={`a-${i}`} className="dist-bar-wrap">
                  <span>{g}</span>
                  <div className="dist-bar" style={{ height: `${Math.min(100, g * 18)}%`, background: "#38bdf8" }} />
                  <small>{i}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="deep-card radar-360-card">
          <div className="deep-card-header">
            <Target size={24} />
            <h3>Radar 360° — Comparativa Local vs Visitante</h3>
            <span>{deepAnalysis.radar.length} dimensiones</span>
          </div>

          {/* Teams header */}
          <div className="radar-360-teams">
            <div className="radar-360-team">
              {fixture.home.logo && <img src={fixture.home.logo} alt="" className="radar-360-logo" />}
              <strong>{fixture.home.name}</strong>
            </div>
            <div className="radar-360-vs">
              <span>VS</span>
              <small>{fixture.leagueName}</small>
            </div>
            <div className="radar-360-team away">
              <strong>{fixture.away.name}</strong>
              {fixture.away.logo && <img src={fixture.away.logo} alt="" className="radar-360-logo" />}
            </div>
          </div>

          {/* Large radar chart */}
          <div className="radar-360-chart">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="72%" data={deepAnalysis.radar}>
                <defs>
                  <radialGradient id="deepRadarGradHome" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.36} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.08} />
                  </radialGradient>
                  <radialGradient id="deepRadarGradAway" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="rgba(226,232,240,.18)" gridType="polygon" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: "#cbd5e1", fontSize: 9, fontWeight: 800 }}
                  tickLine={false}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  axisLine={false}
                  tickCount={5}
                />
                <Radar
                  name={fixture.home.name}
                  dataKey="home"
                  stroke="#2563eb"
                  fill="url(#deepRadarGradHome)"
                  strokeWidth={2.6}
                  dot={{ r: 3, fill: "#2563eb", stroke: "#eff6ff", strokeWidth: 1.2 }}
                />
                <Radar
                  name={fixture.away.name}
                  dataKey="away"
                  stroke="#f59e0b"
                  fill="url(#deepRadarGradAway)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 2.8, fill: "#f59e0b", stroke: "#fff7ed", strokeWidth: 1 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Metrics breakdown */}
          <div className="radar-360-metrics">
            {deepAnalysis.radar.map((r) => {
              const homeColor = r.home >= r.away ? "#2563eb" : "#94a3b8";
              const awayColor = r.away >= r.home ? "#f59e0b" : "#94a3b8";
              return (
                <div key={r.axis} className="radar-360-metric">
                  <div className="radar-360-metric-header">
                    <span className="radar-360-metric-name">{r.axis}</span>
                  </div>
                  <div className="radar-360-metric-bar">
                    <div className="radar-360-metric-fill" style={{ width: `${r.home}%`, background: homeColor }} />
                  </div>
                  <strong className="radar-360-metric-value" style={{ color: homeColor }}>{r.home}</strong>
                  <span className="radar-360-metric-label" style={{ color: homeColor }}>{fixture.home.name}</span>

                  <div className="radar-360-metric-bar away">
                    <div className="radar-360-metric-fill" style={{ width: `${r.away}%`, background: awayColor }} />
                  </div>
                  <strong className="radar-360-metric-value" style={{ color: awayColor }}>{r.away}</strong>
                  <span className="radar-360-metric-label" style={{ color: awayColor }}>{fixture.away.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="deep-card game-theory-card">
          <div className="deep-card-header">
            <Gamepad2 size={24} />
            <h3>Teoría de Juegos</h3>
          </div>
          <div className="nash-box">
            <strong>Equilibrio Nash:</strong>
            <p>{deepAnalysis.gameTheory.nashEquilibrium}</p>
          </div>
          <table className="game-theory-table">
            <thead>
              <tr>
                <th>Estrategia</th>
                <th>Pago Local</th>
                <th>Pago Visita</th>
              </tr>
            </thead>
            <tbody>
              {deepAnalysis.gameTheory.payoffMatrix.map((row) => (
                <tr key={row.strategy}>
                  <td>{row.strategy}</td>
                  <td className={row.homePayoff > 50 ? "advantage" : ""}>{row.homePayoff}</td>
                  <td className={row.awayPayoff > 50 ? "advantage" : ""}>{row.awayPayoff}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dominant-strategies">
            <div className="dom-strat">
              <span>Dominante Local:</span>
              <strong>{deepAnalysis.gameTheory.homeDominantStrategy}</strong>
            </div>
            <div className="dom-strat">
              <span>Dominante Visita:</span>
              <strong>{deepAnalysis.gameTheory.awayDominantStrategy}</strong>
            </div>
          </div>
        </div>

        {/* Fatigue & Logistics */}
        <div className="deep-card fatigue-card">
          <div className="deep-card-header">
            <Activity size={24} />
            <h3>Factores de Fatiga y Logística</h3>
          </div>
          <div className="fatigue-grid">
            <div className="fatigue-team">
              <strong>{fixture.home.name}</strong>
              <div className="fatigue-metrics">
                <div className="fatigue-item">
                  <span>Descanso</span>
                  <b className={fixture.home.restDays >= 5 ? "good" : fixture.home.restDays >= 3 ? "warn" : "bad"}>
                    {fixture.home.restDays} días
                  </b>
                </div>
                <div className="fatigue-item">
                  <span>Partidos jugados</span>
                  <b>{fixture.home.matchesPlayed}</b>
                </div>
                <div className="fatigue-item">
                  <span>Rotación riesgo</span>
                  <b className={fixture.home.squadRotationRisk > 25 ? "warn" : "good"}>
                    {fixture.home.squadRotationRisk}%
                  </b>
                </div>
                <div className="fatigue-item">
                  <span>Condición</span>
                  <b className="good">Local</b>
                </div>
              </div>
            </div>
            <div className="fatigue-team">
              <strong>{fixture.away.name}</strong>
              <div className="fatigue-metrics">
                <div className="fatigue-item">
                  <span>Descanso</span>
                  <b className={fixture.away.restDays >= 5 ? "good" : fixture.away.restDays >= 3 ? "warn" : "bad"}>
                    {fixture.away.restDays} días
                  </b>
                </div>
                <div className="fatigue-item">
                  <span>Viaje</span>
                  <b className={fixture.away.travelKm > 800 ? "bad" : fixture.away.travelKm > 300 ? "warn" : "good"}>
                    {fixture.away.travelKm} km
                  </b>
                </div>
                <div className="fatigue-item">
                  <span>Rotación riesgo</span>
                  <b className={fixture.away.squadRotationRisk > 25 ? "warn" : "good"}>
                    {fixture.away.squadRotationRisk}%
                  </b>
                </div>
                <div className="fatigue-item">
                  <span>Condición</span>
                  <b className={fixture.away.travelKm > 500 ? "bad" : "warn"}>Visitante</b>
                </div>
              </div>
            </div>
          </div>
          <div className="fatigue-analysis">
            {fixture.away.travelKm > 800 && (
              <p className="fatigue-alert bad">⚠️ Viaje extenso ({fixture.away.travelKm}km): fatiga acumulada probable en segundo tiempo. Considerar apuesta in-play si no anota antes del min 30.</p>
            )}
            {Math.abs(fixture.home.restDays - fixture.away.restDays) >= 3 && (
              <p className="fatigue-alert warn">⚡ Diferencia de descanso significativa ({fixture.home.restDays}d vs {fixture.away.restDays}d): ventaja física para {fixture.home.restDays > fixture.away.restDays ? fixture.home.name : fixture.away.name}.</p>
            )}
            {fixture.home.restDays >= 5 && fixture.away.restDays >= 5 && fixture.away.travelKm < 300 && (
              <p className="fatigue-alert good">✅ Ambos equipos descansados y sin viaje largo. Factor fatiga neutral.</p>
            )}
            {fixture.context.weatherRisk !== "low" && (
              <p className="fatigue-alert warn">🌧️ Riesgo climático: {fixture.context.weatherRisk}. Puede afectar ritmo y precisión.</p>
            )}
          </div>
        </div>

        <div className="deep-card psych-card">
          <div className="deep-card-header">
            <Brain size={24} />
            <h3>Análisis Psicológico</h3>
          </div>
          <div className="psych-grid">
            <PsychMetric
              label="Riesgo de Choking"
              value={deepAnalysis.psychological.chokingRisk}
              color="#ff6258"
              detail="Favorito bajo presión"
            />
            <PsychMetric
              label="Ventaja Motivacional"
              value={deepAnalysis.psychological.motivationAdvantage}
              color="#38bdf8"
              detail={`${deepAnalysis.psychological.motivationAdvantage > 0 ? "Visitante" : "Equilibrado"}`}
            />
            <PsychMetric
              label="Manejo de Presión"
              value={deepAnalysis.psychological.pressureHandlingScore}
              color="#10b981"
              detail="Score compuesto"
            />
            <PsychMetric
              label="Score Momento"
              value={deepAnalysis.psychological.momentumScore}
              color="#fbbf24"
              detail="Forma ponderada"
            />
          </div>
          <div className="context-mini">
            <span>Presión psicológica: {fixture.context.psychologicalPressure}%</span>
            <span>Parálisis favorito: {fixture.context.favoriteParalysis}%</span>
            <span>Libertad underdog: {fixture.context.underdogFreedom}%</span>
          </div>
        </div>

        <div className="deep-card referee-card">
          <div className="deep-card-header">
            <Gauge size={24} />
            <h3>Impacto Arbitral</h3>
            <span>{fixture.referee?.name ?? "Sin asignar"}</span>
          </div>
          <div className="ref-metrics">
            <div className="ref-metric">
              <span>Tarjetas esperadas</span>
              <strong>{deepAnalysis.referee.expectedCards}</strong>
            </div>
            <div className="ref-metric">
              <span>Sesgo local</span>
              <strong>{deepAnalysis.referee.homeBiasAdj}</strong>
            </div>
            <div className="ref-metric">
              <span>Riesgo penal</span>
              <strong>{deepAnalysis.referee.penaltyRisk}%</strong>
            </div>
            <div className="ref-metric">
              <span>Rigor</span>
              <strong>{fixture.referee?.strictness ?? "N/A"}</strong>
            </div>
          </div>
          {(fixture.referee?.controversyHistory?.length ?? 0) > 0 && (
            <div className="ref-controversies">
              <AlertTriangle size={16} />
              <span>Controversias: {fixture.referee?.controversyHistory.join("; ")}</span>
            </div>
          )}
        </div>

        <div className="deep-card heavy-tail-card">
          <div className="deep-card-header">
            <ShieldAlert size={24} />
            <h3>Cola Pesada / Black Swan</h3>
          </div>
          <div className="heavy-tail-stats">
            <div className="ht-stat">
              <span>Distribución</span>
              <strong>{deepAnalysis.heavyTail.distribution}</strong>
              <small>g.l.: {deepAnalysis.heavyTail.degreesOfFreedom}</small>
            </div>
            <div className="ht-stat danger">
              <span>Prob. Black Swan</span>
              <strong>{deepAnalysis.heavyTail.blackSwanProb}%</strong>
            </div>
            <div className="ht-stat">
              <span>Score Máx. Sorpresa</span>
              <strong>{deepAnalysis.heavyTail.maxSurpriseScore}/100</strong>
            </div>
          </div>
          {(fixture.historicalOutliers?.length ?? 0) > 0 && (
            <div className="outliers-list">
              <span>Outliers Liga MX Femenil:</span>
              {fixture.historicalOutliers?.map((o) => (
                <div key={o.date} className="outlier-row">
                  <small>{o.date}</small>
                  <strong>{o.match}</strong>
                  <p>{o.description}</p>
                  <span className="outlier-tag">{o.category}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="deep-card insights-full-card">
          <div className="deep-card-header">
            <Lightbulb size={24} />
            <h3>Insights Accionables</h3>
            <span>{deepAnalysis.insights.length} hallazgos</span>
          </div>
          <div className="insights-list">
            {deepAnalysis.insights.map((insight, idx) => (
              <div key={idx} className="insight-card-detailed">
                <div className="insight-card-top">
                  <span className="insight-category">
                    {categoryIcons[insight.category] ?? <Lightbulb size={20} />}
                    {insight.category}
                  </span>
                  <span className="insight-confidence" title={`${insight.confidence}% confianza`}>
                    {insight.confidence}%
                  </span>
                </div>
                <strong>{insight.finding}</strong>
                <p className="insight-action"><Zap size={14} /> {insight.action}</p>
              </div>
            ))}
            {!deepAnalysis.insights.length && (
              <div className="empty-state">No se generaron insights adicionales para este partido.</div>
            )}
          </div>
        </div>

        <div className="deep-card ai-prompt-card">
          <div
            className="deep-card-header clickable"
            onClick={() => setShowAiPrompt(!showAiPrompt)}
          >
            <Brain size={24} />
            <h3>Prompt para IA</h3>
            <span className="prompt-actions">
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyPrompt(); }}
                title="Copiar prompt"
              >
                {promptCopied ? <Clipboard size={16} /> : <Copy size={16} />}
                {promptCopied ? "Copiado" : "Copiar"}
              </button>
              {showAiPrompt ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </div>
          {showAiPrompt && (
            <pre className="ai-prompt-content">{deepAnalysis.aiPrompt}</pre>
          )}
        </div>
      </section>
    </article>
  );
}

function PsychMetric({ label, value, color, detail }: { label: string; value: number; color: string; detail: string }) {
  return (
    <div className="psych-metric">
      <span>{label}</span>
      <div className="psych-bar-bg">
        <div className="psych-bar-fill" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
      <div className="psych-metric-values">
        <strong style={{ color }}>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString("es-CO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }) + " COT";
}
