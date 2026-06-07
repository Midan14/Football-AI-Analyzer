"use client";

/**
 * Figuras del informe de 27 secciones — cada gráfico se calcula en código
 * a partir de fixture + analysis + deepAnalysis (misma lógica que Análisis Profundo).
 */

import { useMemo } from "react";
import type { AnalysisResult, DeepAnalysisResult, Fixture } from "@/shared/domain";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DonutChart1X2,
  PoissonDistribution,
  RadarMultifactorial,
  ScoreHeatmap,
  ValueBetBars,
} from "./advanced-charts";

const HOME = "#38bdf8";
const AWAY = "#f97316";
const POISSON = "#38bdf8";
const STUDENT = "#f43f5e";
const VALUE = "#34d399";

function poissonPmf(lambda: number, k: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
}

function expectedLambdas(fixture: Fixture) {
  const homeMP = Math.max(1, fixture.home.matchesPlayed);
  const awayMP = Math.max(1, fixture.away.matchesPlayed);
  const lambdaHome = fixture.coverage.hasXg
    ? fixture.home.xgFor / homeMP * 0.58 + fixture.away.goalsAgainst / awayMP * 0.42 + 0.18
    : fixture.home.goalsFor / homeMP * 0.58 + fixture.away.goalsAgainst / awayMP * 0.42 + 0.18;
  const lambdaAway = fixture.coverage.hasXg
    ? fixture.away.xgFor / awayMP * 0.56 + fixture.home.goalsAgainst / homeMP * 0.44
    : fixture.away.goalsFor / awayMP * 0.56 + fixture.home.goalsAgainst / homeMP * 0.44;
  return { lambdaHome, lambdaAway };
}

/** Figura 1 — H2H: goles por encuentro (datos reales del proveedor) */
export function H2HGoalsChart({ fixture }: { fixture: Fixture }) {
  const h2h = fixture.h2h?.slice(0, 7) ?? [];
  if (h2h.length === 0) return null;

  const data = h2h.map((m, i) => ({
    match: m.date?.slice(0, 10) ?? `P${i + 1}`,
    [fixture.home.name.slice(0, 12)]: m.homeGoals,
    [fixture.away.name.slice(0, 12)]: m.awayGoals,
    total: m.homeGoals + m.awayGoals,
  }));

  const homeKey = fixture.home.name.slice(0, 12);
  const awayKey = fixture.away.name.slice(0, 12);

  return (
    <div className="adv-chart">
      <h4>Figura — Head-to-Head: goles por encuentro</h4>
      <p className="adv-subtitle">{h2h.length} enfrentamientos directos recientes</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
          <XAxis dataKey="match" tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey={homeKey} fill={HOME} radius={[4, 4, 0, 0]} />
          <Bar dataKey={awayKey} fill={AWAY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Figura 2 — xG acumulado por intervalos de 15 min (modelo temporal) */
export function XGIntervalChart({ fixture, analysis }: { fixture: Fixture; analysis: AnalysisResult }) {
  const adv = analysis.advancedModels?.xgModel;
  const { lambdaHome, lambdaAway } = expectedLambdas(fixture);
  const homeXg = adv?.homeXg ?? lambdaHome;
  const awayXg = adv?.awayXg ?? lambdaAway;

  // Pesos empíricos de intensidad goleadora por cuarto de hora (suman 1)
  const weights = [0.16, 0.2, 0.24, 0.18, 0.14, 0.08];
  const labels = ["0-15", "15-30", "30-45", "45-60", "60-75", "75-90"];

  const data = useMemo(() => {
    let cumH = 0;
    let cumA = 0;
    return labels.map((interval, i) => {
      cumH += homeXg * weights[i];
      cumA += awayXg * weights[i];
      return {
        interval,
        home: Math.round(cumH * 100) / 100,
        away: Math.round(cumA * 100) / 100,
      };
    });
  }, [homeXg, awayXg]);

  return (
    <div className="adv-chart">
      <h4>Figura — Modelo xG temporal acumulado (intervalos 15 min)</h4>
      <p className="adv-subtitle">
        xG {fixture.home.name.slice(0, 10)}: {homeXg.toFixed(2)} · {fixture.away.name.slice(0, 10)}: {awayXg.toFixed(2)}
        {adv ? ` · motor ${adv.engine}` : " · proxy desde goles"}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
          <XAxis dataKey="interval" tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="home" name={fixture.home.name} stroke={HOME} fill={HOME} fillOpacity={0.25} />
          <Area type="monotone" dataKey="away" name={fixture.away.name} stroke={AWAY} fill={AWAY} fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Figura 3a — Poisson vs t-Student (cola gruesa) para goles totales */
export function PoissonVsStudentChart({
  fixture,
  deep,
}: {
  fixture: Fixture;
  deep?: DeepAnalysisResult | null;
}) {
  const { lambdaHome, lambdaAway } = expectedLambdas(fixture);
  const lambdaTotal = lambdaHome + lambdaAway;
  const df = deep?.heavyTail.degreesOfFreedom ?? (fixture.context.lowDivision ? 3 : 5);
  const goals = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  const data = useMemo(() => {
    const poissonRaw = goals.map((g) => poissonPmf(lambdaTotal, g));
    const poissonSum = poissonRaw.reduce((s, v) => s + v, 0);
    // t-Student proxy: cola más pesada — escala con (1 + g²/df)^(-(df+1)/2)
    const studentRaw = goals.map((g) => Math.pow(1 + (g - lambdaTotal) ** 2 / df, -(df + 1) / 2));
    const studentSum = studentRaw.reduce((s, v) => s + v, 0);
    return goals.map((g, i) => ({
      goals: String(g),
      Poisson: Math.round((poissonRaw[i] / poissonSum) * 1000) / 10,
      "t-Student": Math.round((studentRaw[i] / studentSum) * 1000) / 10,
    }));
  }, [lambdaTotal, df]);

  return (
    <div className="adv-chart">
      <h4>Figura — Distribución Poisson vs t-Student (cola gruesa)</h4>
      <p className="adv-subtitle">
        λ total {lambdaTotal.toFixed(2)} · df={df}
        {deep ? ` · P(cisne negro) ${deep.heavyTail.blackSwanProb}%` : ""}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
          <XAxis dataKey="goals" tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} unit="%" />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Poisson" stroke={POISSON} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="t-Student" stroke={STUDENT} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Figura 3b — Mapa de factores de fatiga/logística (calculado desde fixture) */
export function FatigueHeatmap({ fixture }: { fixture: Fixture }) {
  const factors = useMemo(() => {
    const restDiff = Math.abs(fixture.home.restDays - fixture.away.restDays);
    const travel = Math.min(100, fixture.away.travelKm / 5);
    const homeFatigue = Math.max(10, 100 - restDiff * 6);
    const awayFatigue = Math.max(10, 100 - restDiff * 6 - fixture.away.travelKm / 25);
    const homeMot = fixture.home.motivation;
    const awayMot = fixture.away.motivation;
    return [
      { factor: "Descanso (días)", home: Math.min(100, fixture.home.restDays * 14), away: Math.min(100, fixture.away.restDays * 14) },
      { factor: "Fatiga acum.", home: homeFatigue, away: awayFatigue },
      { factor: "Viaje (km)", home: 95, away: Math.max(20, 100 - travel) },
      { factor: "Motivación", home: homeMot, away: awayMot },
      { factor: "Presión", home: fixture.context.psychologicalPressure, away: Math.max(20, 100 - fixture.context.psychologicalPressure * 0.7) },
    ];
  }, [fixture]);

  const cellColor = (v: number) => {
    const r = v / 100;
    if (r < 0.35) return `rgb(40, ${Math.round(80 + r * 200)}, 50)`;
    if (r < 0.65) return `rgb(${Math.round(180 + r * 60)}, ${Math.round(140 - r * 40)}, 30)`;
    return `rgb(220, ${Math.round(60 - r * 30)}, 20)`;
  };

  return (
    <div className="adv-chart heatmap-chart">
      <h4>Figura — Mapa de calor: fatiga y logística</h4>
      <p className="adv-subtitle">
        Descanso {fixture.home.restDays}d / {fixture.away.restDays}d · Viaje visita {fixture.away.travelKm} km
      </p>
      <div className="heatmap-grid">
        <div className="heatmap-header">
          <span className="heatmap-corner">Factor</span>
          <span className="heatmap-col-label">{fixture.home.name.slice(0, 8)}</span>
          <span className="heatmap-col-label">{fixture.away.name.slice(0, 8)}</span>
        </div>
        {factors.map((row) => (
          <div key={row.factor} className="heatmap-row">
            <span className="heatmap-row-label">{row.factor}</span>
            <span className="heatmap-cell" style={{ backgroundColor: cellColor(row.home), width: 120 }}>
              {Math.round(row.home)}
            </span>
            <span className="heatmap-cell" style={{ backgroundColor: cellColor(row.away), width: 120 }}>
              {Math.round(row.away)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Figura 4 — Marcadores Monte Carlo (simulación real del motor profundo) */
export function MonteCarloScoreChart({ deep }: { deep: DeepAnalysisResult }) {
  const scores = deep.monteCarlo.topScorelines?.slice(0, 10) ?? [];
  if (scores.length === 0) return null;

  const data = scores.map((s) => ({ score: s.score, prob: s.probability }));

  return (
    <div className="adv-chart">
      <h4>Figura — Distribución Monte Carlo ({deep.monteCarlo.iterations.toLocaleString("es")} iter.)</h4>
      <p className="adv-subtitle">
        Mezcla {deep.monteCarlo.hybridMix?.poissonPct ?? 88}% Poisson / {deep.monteCarlo.hybridMix?.heavyTailPct ?? 12}% cola pesada
        · Over 2.5 {deep.monteCarlo.over25Confidence}%
      </p>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 22)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.15)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} unit="%" />
          <YAxis type="category" dataKey="score" tick={{ fill: "#cbd5e1", fontSize: 11 }} width={48} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
          <Bar dataKey="prob" fill={VALUE} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Figura 6 — Radar 10D desde build360Radar + H2H + eficacia goleadora */
export function Radar10DChart({
  fixture,
  deep,
}: {
  fixture: Fixture;
  deep: DeepAnalysisResult;
}) {
  const homeMP = Math.max(1, fixture.home.matchesPlayed);
  const awayMP = Math.max(1, fixture.away.matchesPlayed);
  const h2hWins = (fixture.h2h ?? []).filter((m) => m.homeGoals > m.awayGoals).length;
  const h2hTotal = Math.max(1, fixture.h2h?.length ?? 1);
  const homeH2H = Math.min(100, (h2hWins / h2hTotal) * 100);
  const awayH2H = Math.min(100, 100 - homeH2H);

  const extra = [
    { axis: "Dominio H2H", home: homeH2H, away: awayH2H },
    {
      axis: "Eficacia gol",
      home: Math.min(100, (fixture.home.goalsFor / homeMP) * 40),
      away: Math.min(100, (fixture.away.goalsFor / awayMP) * 40),
    },
    {
      axis: "Confianza",
      home: deep.confidence.score,
      away: Math.max(30, 100 - deep.confidence.score * 0.4),
    },
  ];

  const axes = [...deep.radar, ...extra].slice(0, 10);
  const data = axes.map((a) => ({ axis: a.axis, Local: a.home, Visita: a.away }));

  return (
    <div className="adv-chart">
      <h4>Figura — Perfil comparativo multivariable (radar {axes.length}D)</h4>
      <p className="adv-subtitle">Ejes del motor profundo + H2H y eficacia goleadora</p>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(148,163,184,.25)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <Radar name={fixture.home.name} dataKey="Local" stroke={HOME} fill={HOME} fillOpacity={0.3} strokeWidth={2} />
          <Radar name={fixture.away.name} dataKey="Visita" stroke={AWAY} fill={AWAY} fillOpacity={0.25} strokeWidth={2} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bloques reutilizados del análisis profundo, insertados por sección */
export function ReportFigureBlock({
  sectionIndex,
  fixture,
  analysis,
  deep,
}: {
  sectionIndex: number;
  fixture: Fixture;
  analysis: AnalysisResult;
  deep?: DeepAnalysisResult | null;
}) {
  switch (sectionIndex) {
    case 3:
      return <H2HGoalsChart fixture={fixture} />;
    case 4:
      return <XGIntervalChart fixture={fixture} analysis={analysis} />;
    case 5:
      return (
        <>
          <PoissonVsStudentChart fixture={fixture} deep={deep} />
          <FatigueHeatmap fixture={fixture} />
          <PoissonDistribution fixture={fixture} />
        </>
      );
    case 8:
      if (!deep) return <ScoreHeatmap fixture={fixture} analysis={analysis} />;
      return (
        <>
          <MonteCarloScoreChart deep={deep} />
          <DonutChart1X2 fixture={fixture} analysis={analysis} />
          <ScoreHeatmap fixture={fixture} analysis={analysis} />
        </>
      );
    case 9:
      return <ValueBetBars analysis={analysis} />;
    case 23:
      if (deep) return <Radar10DChart fixture={fixture} deep={deep} />;
      return <RadarMultifactorial fixture={fixture} analysis={analysis} />;
    default:
      return null;
  }
}
