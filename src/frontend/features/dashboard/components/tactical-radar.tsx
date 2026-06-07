"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import { useMemo } from "react";

type TacticalRadarProps = {
  fixture: Fixture;
  analysis: AnalysisResult;
};

type RadarRow = {
  axis: string;
  home: number;
  away: number;
  criticality: "critical" | "watch" | "stable" | "dominant";
};

const RADAR_COLORS = {
  home: "#2563eb",
  away: "#f59e0b",
  grid: "rgba(226,232,240,.18)",
  label: "#cbd5e1",
} as const;

function criticalityFor(value: number): RadarRow["criticality"] {
  if (value < 45) return "critical";
  if (value < 65) return "watch";
  if (value < 80) return "stable";
  return "dominant";
}

function levelLabel(value: number) {
  if (value < 45) return "Crítico";
  if (value < 65) return "Vigilar";
  if (value < 80) return "Competitivo";
  return "Dominante";
}

function toRadarRows(radar: AnalysisResult["radar"]): RadarRow[] {
  return radar.map((row) => {
    const home = Math.round(Math.max(0, Math.min(100, row.home ?? row.value)));
    const away = Math.round(Math.max(0, Math.min(100, row.away ?? row.value)));
    return {
      axis: row.axis,
      home,
      away,
      criticality: criticalityFor(Math.max(home, away)),
    };
  });
}

function buildTacticalInsights(fixture: Fixture, analysis: AnalysisResult) {
  const insights: Array<{ title: string; text: string }> = [];
  const ensemble = analysis.ensemble;
  const advanced = analysis.advancedModels;
  const xg = advanced?.xgModel;
  const ht = advanced?.halfTime;
  const kalman = advanced?.kalman;
  const xThreat = advanced?.xThreat;
  const valueBets = advanced?.valueBets;
  const hybrid = advanced?.hybridPipeline;

  if (ensemble) {
    insights.push({
      title: "ENSEMBLE PREDICTIVO",
      text: `Modelo dominante: ${ensemble.dominantModel}. Acuerdo entre modelos ${ensemble.modelAgreement}%. Probabilidades ensemble: ${ensemble.homeWin}% / ${ensemble.draw}% / ${ensemble.awayWin}%.`,
    });
  }

  if (xg) {
    insights.push({
      title: "xG DEL MOTOR",
      text: `xG esperado (${xg.engine}): ${xg.homeXg.toFixed(2)} local · ${xg.awayXg.toFixed(2)} visitante · total ${xg.totalXg.toFixed(2)}. BTTS desde xG: ${xg.bttsFromXg}%.`,
    });
  }

  if (hybrid?.consistencyFlags && hybrid.consistencyFlags.length > 0) {
    const dc = hybrid.dixonColes1x2
      ? `Dixon-Coles 1X2 ${hybrid.dixonColes1x2.homeWin}% / ${hybrid.dixonColes1x2.draw}% / ${hybrid.dixonColes1x2.awayWin}%.`
      : "";
    const market = hybrid.marketPrior1x2
      ? ` Mercado ${hybrid.marketPrior1x2.homeWin}% / ${hybrid.marketPrior1x2.draw}% / ${hybrid.marketPrior1x2.awayWin}%.`
      : "";
    insights.push({
      title: "CONSISTENCIA ML",
      text: `Compuerta activa (${hybrid.consistencyFlags.join(", ")}). ${dc}${market} La salida 1X2 se reconcilia antes de value/Kelly.`,
    });
  }

  const bestValue = analysis.valueTable
    .filter((row) => row.edge > 0 && row.marketProbability > 0)
    .sort((a, b) => b.edge - a.edge)[0];

  if (bestValue) {
    insights.push({
      title: "VALOR DETECTADO",
      text: `${bestValue.market}: modelo ${bestValue.modelProbability}% vs mercado ${bestValue.marketProbability}% (edge +${bestValue.edge}%). ${bestValue.verdict}.`,
    });
  } else if (valueBets?.bestBet) {
    insights.push({
      title: "MEJOR APUESTA EV",
      text: `${valueBets.bestBet.market} con EV ${valueBets.bestBet.ev}% (grado ${valueBets.bestBet.grade}). Eficiencia del mercado ${valueBets.marketEfficiency}%.`,
    });
  } else {
    insights.push({
      title: "SIN VALOR CLARO",
      text: `Confianza ${analysis.confidence.score}%. Ningún mercado supera el umbral de edge accionable con las cuotas actuales.`,
    });
  }

  if (ht) {
    insights.push({
      title: "ARRANQUE / 1ER TIEMPO",
      text: `1X2 HT: ${ht.homeWinHT}% / ${ht.drawHT}% / ${ht.awayWinHT}%. Goles esperados HT ${ht.expectedGoalsHT}. Over 0.5 HT ${ht.over05HT}%.`,
    });
  }

  if (kalman && xThreat) {
    insights.push({
      title: "DINÁMICA TÁCTICA",
      text: `Kalman: ataque ${kalman.homeAttack}/${kalman.awayAttack}, defensa ${kalman.homeDefense}/${kalman.awayDefense}. xThreat: ${xThreat.homeThreat}/${xThreat.awayThreat} (${xThreat.dominance}). Tendencia ${kalman.homeTrend}/${kalman.awayTrend}.`,
    });
  }

  if (analysis.riskFlags.length > 0) {
    const topRisk = analysis.riskFlags.slice(0, 2).map((r) => r.label).join(" · ");
    insights.push({
      title: "ALERTAS DEL MODELO",
      text: topRisk,
    });
  } else {
    insights.push({
      title: "COBERTURA DE DATOS",
      text: `Tier ${fixture.coverage.tier}. ${fixture.coverage.hasOdds ? "Cuotas reales." : "Cuotas estimadas."} ${fixture.coverage.hasXg ? "xG real." : "xG proxy."}`,
    });
  }

  return insights.slice(0, 5);
}

function RadarPanel({
  title,
  data,
  homeName,
  awayName,
  showScale,
}: {
  title: string;
  data: RadarRow[];
  homeName: string;
  awayName: string;
  showScale?: boolean;
}) {
  return (
    <div className={`tr-radar-box${showScale ? " tr-radar-main" : ""}`}>
      <h3>{title}</h3>
      <div className="tr-radar-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            {showScale && (
              <defs>
                <linearGradient id="trFillHome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={RADAR_COLORS.home} stopOpacity={0.36} />
                  <stop offset="100%" stopColor={RADAR_COLORS.home} stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="trFillAway" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={RADAR_COLORS.away} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={RADAR_COLORS.away} stopOpacity={0.05} />
                </linearGradient>
              </defs>
            )}
            <PolarGrid stroke={RADAR_COLORS.grid} gridType="polygon" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: RADAR_COLORS.label, fontSize: 9, fontWeight: 800 }} tickLine={false} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 700 }} axisLine={false} />
            <Radar
              dataKey="home"
              stroke={RADAR_COLORS.home}
              fill={showScale ? "url(#trFillHome)" : RADAR_COLORS.home}
              fillOpacity={showScale ? 1 : 0.14}
              strokeWidth={showScale ? 2.6 : 2.2}
              dot={{ r: showScale ? 3 : 2.8, fill: RADAR_COLORS.home }}
            />
            <Radar
              dataKey="away"
              stroke={RADAR_COLORS.away}
              fill={showScale ? "url(#trFillAway)" : RADAR_COLORS.away}
              fillOpacity={showScale ? 1 : 0.08}
              strokeWidth={showScale ? 2 : 1.8}
              strokeDasharray="5 3"
              dot={{ r: showScale ? 2.8 : 2.6, fill: RADAR_COLORS.away }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="tr-radar-legend">
        <span className="tr-legend-home">── {homeName}</span>
        <span className="tr-legend-away">╌╌ {awayName}</span>
      </div>
      {showScale && (
        <div className="tr-scale-key">
          <span className="critical">0-44 Crítico</span>
          <span className="watch">45-64 Vigilar</span>
          <span className="stable">65-79 Competitivo</span>
          <span className="dominant">80+ Dominante</span>
        </div>
      )}
    </div>
  );
}

export function TacticalRadar({ fixture, analysis }: TacticalRadarProps) {
  const radarFullTime = useMemo(() => toRadarRows(analysis.radar), [analysis.radar]);
  const radarHalfTime = useMemo(
    () => toRadarRows(analysis.radarHalfTime ?? analysis.radar),
    [analysis.radar, analysis.radarHalfTime]
  );
  const insights = useMemo(() => buildTacticalInsights(fixture, analysis), [fixture, analysis]);

  const xgHome = analysis.advancedModels?.xgModel?.homeXg?.toFixed(2)
    ?? (fixture.home.xgFor / Math.max(1, fixture.home.matchesPlayed)).toFixed(2);
  const xgAway = analysis.advancedModels?.xgModel?.awayXg?.toFixed(2)
    ?? (fixture.away.xgFor / Math.max(1, fixture.away.matchesPlayed)).toFixed(2);

  const allScores = analysis.topExactScores ?? [];
  const { homeWin, draw, awayWin } = analysis.probabilities;
  const mostLikelyOutcome = homeWin >= draw && homeWin >= awayWin
    ? "home"
    : draw >= homeWin && draw >= awayWin
      ? "draw"
      : "away";

  const homeWinScores = allScores.filter((s) => {
    const [h, a] = s.score.split("-").map(Number);
    return h > a;
  });
  const drawScores = allScores.filter((s) => {
    const [h, a] = s.score.split("-").map(Number);
    return h === a;
  });
  const awayWinScores = allScores.filter((s) => {
    const [h, a] = s.score.split("-").map(Number);
    return a > h;
  });

  let displayScore = allScores[0];
  if (mostLikelyOutcome === "home" && homeWinScores.length > 0) displayScore = homeWinScores[0];
  else if (mostLikelyOutcome === "draw" && drawScores.length > 0) {
    displayScore = drawScores.find((s) => s.score !== "0-0") ?? drawScores[0];
  } else if (mostLikelyOutcome === "away" && awayWinScores.length > 0) displayScore = awayWinScores[0];

  const scoreHome = displayScore?.score?.split("-")?.[0] ?? "-";
  const scoreAway = displayScore?.score?.split("-")?.[1] ?? "-";

  return (
    <div className="tr-container">
      <div className="tr-header">
        <div className="tr-title">
          <h2>RADAR TÁCTICO PREMIUM</h2>
          <span>8 dimensiones por equipo · ensemble + xG + HT · {fixture.home.name} vs {fixture.away.name}</span>
        </div>
        <div className="tr-brand">
          <div className="tr-brand-icon">⚽</div>
          <div>
            <strong>FOOTBALL<br/>INTELLIGENCE</strong>
            <small>DATA. CONTEXTO. VENTAJA.</small>
          </div>
        </div>
      </div>

      <div className="tr-teams">
        <div className="tr-team-card">
          {fixture.home.logo ? <img src={fixture.home.logo} alt="" className="tr-team-logo" /> : <div className="tr-team-placeholder">🏠</div>}
          <div>
            <small>LOCAL</small>
            <strong>{fixture.home.name}</strong>
          </div>
        </div>
        <span className="tr-vs">VS</span>
        <div className="tr-team-card away">
          <div>
            <small>VISITANTE</small>
            <strong>{fixture.away.name}</strong>
          </div>
          {fixture.away.logo ? <img src={fixture.away.logo} alt="" className="tr-team-logo" /> : <div className="tr-team-placeholder">✈️</div>}
        </div>
      </div>

      <div className="tr-main">
        <RadarPanel
          title="ARRANQUE / 1ER TIEMPO"
          data={radarHalfTime}
          homeName={fixture.home.name}
          awayName={fixture.away.name}
        />
        <RadarPanel
          title="PARTIDO COMPLETO"
          data={radarFullTime}
          homeName={fixture.home.name}
          awayName={fixture.away.name}
          showScale
        />

        <div className="tr-data-col">
          <div className="tr-pred-box">
            <h3>PREDICCIÓN DE MARCADOR</h3>
            <div className="tr-pred-score">
              {fixture.home.logo && <img src={fixture.home.logo} alt="" className="tr-pred-logo" />}
              <span className="tr-pred-num">{scoreHome}</span>
              <span className="tr-pred-sep">–</span>
              <span className="tr-pred-num">{scoreAway}</span>
              {fixture.away.logo && <img src={fixture.away.logo} alt="" className="tr-pred-logo" />}
            </div>
            {displayScore && <small className="tr-pred-prob">{displayScore.probability}% probabilidad</small>}
            <div className="tr-pred-probs">
              <div className="tr-pp"><b>{analysis.probabilities.homeWin}%</b><small>VICTORIA<br/>LOCAL</small></div>
              <div className="tr-pp"><b>{analysis.probabilities.draw}%</b><small>EMPATE</small></div>
              <div className="tr-pp"><b>{analysis.probabilities.awayWin}%</b><small>VICTORIA<br/>VISITANTE</small></div>
            </div>
            {analysis.ensemble && (
              <small className="tr-pred-prob">
                Ensemble {analysis.ensemble.dominantModel} · confianza {analysis.confidence.score}%
              </small>
            )}
          </div>

          <div className="tr-xg-box">
            <h3>GOLES ESPERADOS (xG)</h3>
            <div className="tr-xg-row">
              <div className="tr-xg-val">
                <strong>{xgHome}</strong>
                <small>xG LOCAL</small>
              </div>
              <div className="tr-xg-val">
                <strong>{xgAway}</strong>
                <small>xG VISITANTE</small>
              </div>
            </div>
            {analysis.advancedModels?.xgModel && (
              <small className="tr-pred-prob">
                Total {analysis.advancedModels.xgModel.totalXg.toFixed(2)} · {analysis.advancedModels.xgModel.engine}
              </small>
            )}
          </div>
        </div>

        <div className="tr-tactics-col">
          <h3>LECTURA TÁCTICA</h3>
          {insights.map((ins, i) => (
            <div key={i} className="tr-tactic-card">
              <strong>{ins.title}</strong>
              <p>{ins.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="tr-metric-matrix">
        {radarFullTime.map((row) => {
          const leader = row.home >= row.away ? fixture.home.name : fixture.away.name;
          const leaderValue = Math.max(row.home, row.away);
          const htRow = radarHalfTime.find((r) => r.axis === row.axis);
          return (
            <div className={`tr-metric-row ${row.criticality}`} key={row.axis}>
              <div className="tr-metric-axis">
                <strong>{row.axis}</strong>
                <span>
                  {levelLabel(leaderValue)} · ventaja {leader}
                  {htRow && htRow.home !== row.home ? ` · HT ${htRow.home}/${htRow.away}` : ""}
                </span>
              </div>
              <div className="tr-metric-bars">
                <div className="tr-metric-side">
                  <span>{fixture.home.name}</span>
                  <i><b className="home" style={{ width: `${row.home}%` }} /></i>
                  <strong>{row.home}</strong>
                </div>
                <div className="tr-metric-side">
                  <span>{fixture.away.name}</span>
                  <i><b className="away" style={{ width: `${row.away}%` }} /></i>
                  <strong>{row.away}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tr-stats-bar">
        <div className="tr-stat-item">
          <span className="tr-stat-icon">⚽</span>
          <span className="tr-stat-label">GOLES</span>
          <div className="tr-stat-values">
            <b className="tr-val-home">{fixture.home.goalsFor}</b>
            <b className="tr-val-away">{fixture.away.goalsFor}</b>
          </div>
        </div>
        <div className="tr-stat-item">
          <span className="tr-stat-icon">📊</span>
          <span className="tr-stat-label">POSICIÓN</span>
          <div className="tr-stat-values">
            <b className="tr-val-home">#{fixture.home.tablePosition}</b>
            <b className="tr-val-away">#{fixture.away.tablePosition}</b>
          </div>
        </div>
        <div className="tr-stat-item">
          <span className="tr-stat-icon">🎯</span>
          <span className="tr-stat-label">xG TOTAL</span>
          <div className="tr-stat-values">
            <b className="tr-val-home">{fixture.home.xgFor.toFixed(0)}</b>
            <b className="tr-val-away">{fixture.away.xgFor.toFixed(0)}</b>
          </div>
        </div>
        <div className="tr-stat-item">
          <span className="tr-stat-icon">🛡️</span>
          <span className="tr-stat-label">GC</span>
          <div className="tr-stat-values">
            <b className="tr-val-home">{fixture.home.goalsAgainst}</b>
            <b className="tr-val-away">{fixture.away.goalsAgainst}</b>
          </div>
        </div>
        <div className="tr-stat-item">
          <span className="tr-stat-icon">🔥</span>
          <span className="tr-stat-label">MOTIVACIÓN</span>
          <div className="tr-stat-values">
            <b className="tr-val-home">{fixture.home.motivation}%</b>
            <b className="tr-val-away">{fixture.away.motivation}%</b>
          </div>
        </div>
        <div className="tr-stat-item">
          <span className="tr-stat-icon">📅</span>
          <span className="tr-stat-label">PARTIDOS</span>
          <div className="tr-stat-values">
            <b className="tr-val-home">{fixture.home.matchesPlayed}</b>
            <b className="tr-val-away">{fixture.away.matchesPlayed}</b>
          </div>
        </div>
      </div>

      <div className="tr-footer">
        <span>Radar FT conectado a ensemble, Kalman, xThreat y xG del motor. HT usa modelo de primer tiempo.</span>
        <span>{fixture.leagueName} · {new Date(fixture.kickoff).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</span>
      </div>
    </div>
  );
}
