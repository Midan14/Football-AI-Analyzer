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
  critical: "#ef4444",
  watch: "#f97316",
  stable: "#2563eb",
  dominant: "#facc15",
  grid: "rgba(226,232,240,.18)",
  label: "#cbd5e1",
} as const;

function roundMetric(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

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

function computeRadarFromAnalysis(radar: AnalysisResult["radar"]): RadarRow[] {
  return radar.map((row) => ({
    axis: row.axis,
    home: roundMetric(row.value * 1.08),
    away: roundMetric(row.value * 0.92),
    criticality: "stable" as const,
  })).map((row) => ({
    ...row,
    criticality: criticalityFor(Math.max(row.home, row.away)),
  }));
}

export function TacticalRadar({ fixture, analysis }: TacticalRadarProps) {
  const radarData = useMemo(() => computeRadarFromAnalysis(analysis.radar), [analysis.radar]);
  const homeMP = Math.max(1, fixture.home.matchesPlayed);
  const awayMP = Math.max(1, fixture.away.matchesPlayed);

  const xgHome = (fixture.home.xgFor / homeMP).toFixed(2);
  const xgAway = (fixture.away.xgFor / awayMP).toFixed(2);

  // Predict score aligned with the most likely outcome from the model
  const allScores = analysis.topExactScores ?? [];
  const homeWinProb = analysis.probabilities.homeWin;
  const drawProb = analysis.probabilities.draw;
  const awayWinProb = analysis.probabilities.awayWin;

  // Determine which outcome is most likely
  const mostLikelyOutcome = homeWinProb >= drawProb && homeWinProb >= awayWinProb
    ? "home" : drawProb >= homeWinProb && drawProb >= awayWinProb
    ? "draw" : "away";

  // Filter scores that match the most likely outcome
  const homeWinScores = allScores.filter(s => {
    const [h, a] = s.score.split("-").map(Number);
    return h > a;
  });
  const drawScores = allScores.filter(s => {
    const [h, a] = s.score.split("-").map(Number);
    return h === a;
  });
  const awayWinScores = allScores.filter(s => {
    const [h, a] = s.score.split("-").map(Number);
    return a > h;
  });

  // Pick the best score from the most likely outcome category
  let displayScore = allScores[0]; // fallback
  if (mostLikelyOutcome === "home" && homeWinScores.length > 0) {
    displayScore = homeWinScores[0];
  } else if (mostLikelyOutcome === "draw" && drawScores.length > 0) {
    // Prefer 1-1 over 0-0 for draws (more useful)
    displayScore = drawScores.find(s => s.score !== "0-0") ?? drawScores[0];
  } else if (mostLikelyOutcome === "away" && awayWinScores.length > 0) {
    displayScore = awayWinScores[0];
  }

  const scoreHome = displayScore?.score?.split("-")?.[0] ?? "-";
  const scoreAway = displayScore?.score?.split("-")?.[1] ?? "-";

  const insights: Array<{ title: string; text: string }> = [];
  const atkAxis = analysis.radar.find(r => r.axis === "Ataque");
  const defAxis = analysis.radar.find(r => r.axis === "Defensa");
  const atkVal = atkAxis?.value ?? 50;
  const defVal = defAxis?.value ?? 50;

  if (atkVal > 62) insights.push({ title: "DOMINIO OFENSIVO DETECTADO", text: "El análisis de Poisson + Monte Carlo indica un partido con sesgo ofensivo según los datos disponibles." });
  else if (atkVal < 42) insights.push({ title: "BAJA EXPECTATIVA OFENSIVA", text: "Los modelos de xG y forma reciente sugieren un partido con pocas ocasiones de gol." });
  else insights.push({ title: "EQUILIBRIO OFENSIVO", text: "Ambos equipos muestran capacidades ofensivas similares según el motor de análisis." });

  if (defVal > 62) insights.push({ title: "DEFENSAS SÓLIDAS", text: "Los datos de goles en contra y cobertura defensiva indican bloques defensivos fuertes." });
  else if (defVal < 42) insights.push({ title: "DEFENSAS VULNERABLES", text: "Ambos equipos presentan debilidades defensivas según el histórico de goles recibidos." });
  else insights.push({ title: "DEFENSAS PAREJAS", text: "Ambos equipos muestran solidez defensiva similar según los datos procesados." });

  insights.push({
    title: "ANÁLISIS BASADO EN DATOS REALES",
    text: `Cobertura ${fixture.coverage.tier}. ${fixture.coverage.hasOdds ? "Cuotas reales disponibles." : "Cuotas estimadas."} ${fixture.coverage.hasXg ? "xG real." : "xG proxy."}`
  });

  return (
    <div className="tr-container">
      {/* ═══ HEADER ═══ */}
      <div className="tr-header">
        <div className="tr-title">
          <h2>RADAR TÁCTICO PREMIUM</h2>
          <span>Análisis de 8 dimensiones · {fixture.home.name} vs {fixture.away.name}</span>
        </div>
        <div className="tr-brand">
          <div className="tr-brand-icon">⚽</div>
          <div>
            <strong>FOOTBALL<br/>INTELLIGENCE</strong>
            <small>DATA. CONTEXTO. VENTAJA.</small>
          </div>
        </div>
      </div>

      {/* ═══ EQUIPOS ═══ */}
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

      {/* ═══ MAIN GRID: 2 radares + predicción + xG + lectura táctica ═══ */}
      <div className="tr-main">
        {/* Col 1: Radar 1er tiempo */}
        <div className="tr-radar-box">
          <h3>ARRANQUE / 1ER TIEMPO</h3>
          <div className="tr-radar-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke={RADAR_COLORS.grid} gridType="polygon" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: RADAR_COLORS.label, fontSize: 9, fontWeight: 800 }} tickLine={false} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 700 }} axisLine={false} />
                <Radar dataKey="home" stroke={RADAR_COLORS.home} fill={RADAR_COLORS.home} fillOpacity={0.14} strokeWidth={2.2} dot={{ r: 2.8, fill: RADAR_COLORS.home }} />
                <Radar dataKey="away" stroke={RADAR_COLORS.away} fill={RADAR_COLORS.away} fillOpacity={0.08} strokeWidth={1.8} strokeDasharray="5 3" dot={{ r: 2.6, fill: RADAR_COLORS.away }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="tr-radar-legend">
            <span className="tr-legend-home">── {fixture.home.name}</span>
            <span className="tr-legend-away">╌╌ {fixture.away.name}</span>
          </div>
        </div>

        {/* Col 2: Radar partido completo */}
        <div className="tr-radar-box tr-radar-main">
          <h3>PARTIDO COMPLETO</h3>
          <div className="tr-radar-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
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
                <PolarGrid stroke={RADAR_COLORS.grid} gridType="polygon" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: RADAR_COLORS.label, fontSize: 9, fontWeight: 800 }} tickLine={false} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 700 }} axisLine={false} />
                <Radar dataKey="home" stroke={RADAR_COLORS.home} fill="url(#trFillHome)" strokeWidth={2.6} dot={{ r: 3, fill: RADAR_COLORS.home, stroke: "#eff6ff", strokeWidth: 1.2 }} />
                <Radar dataKey="away" stroke={RADAR_COLORS.away} fill="url(#trFillAway)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.8, fill: RADAR_COLORS.away, stroke: "#fff7ed", strokeWidth: 1 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="tr-radar-legend">
            <span className="tr-legend-home">── {fixture.home.name}</span>
            <span className="tr-legend-away">╌╌ {fixture.away.name}</span>
          </div>
          <div className="tr-scale-key">
            <span className="critical">0-44 Crítico</span>
            <span className="watch">45-64 Vigilar</span>
            <span className="stable">65-79 Competitivo</span>
            <span className="dominant">80+ Dominante</span>
          </div>
        </div>

        {/* Col 3: Predicción + xG */}
        <div className="tr-data-col">
          {/* Predicción de marcador */}
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
          </div>

          {/* xG */}
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
          </div>
        </div>

        {/* Col 4: Lectura táctica */}
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
        {radarData.map((row) => {
          const leader = row.home >= row.away ? fixture.home.name : fixture.away.name;
          const leaderValue = Math.max(row.home, row.away);
          return (
            <div className={`tr-metric-row ${row.criticality}`} key={row.axis}>
              <div className="tr-metric-axis">
                <strong>{row.axis}</strong>
                <span>{levelLabel(leaderValue)} · ventaja {leader}</span>
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

      {/* ═══ BARRA INFERIOR DE STATS ═══ */}
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

      {/* ═══ FOOTER ═══ */}
      <div className="tr-footer">
        <span>Los valores se muestran en una escala de 0 a 100.</span>
        <span>{fixture.leagueName} · {new Date(fixture.kickoff).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</span>
      </div>
    </div>
  );
}
