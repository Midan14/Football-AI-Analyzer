"use client";

import { useMemo } from "react";
import type { AnalysisResult, Fixture } from "@/shared/domain";

/**
 * Radar Multifactorial 7D — Dual (Local vs Visitante)
 * Usa datos REALES del análisis, no fórmulas genéricas
 */
export function RadarMultifactorial({ fixture, analysis }: { fixture: Fixture; analysis: AnalysisResult }) {
  const homeMP = Math.max(1, fixture.home.matchesPlayed);
  const awayMP = Math.max(1, fixture.away.matchesPlayed);

  // Calculate REAL differentiated values from actual team data
  const homeGPG = fixture.home.goalsFor / homeMP;
  const awayGPG = fixture.away.goalsFor / awayMP;
  const homeCPG = fixture.home.goalsAgainst / homeMP;
  const awayCPG = fixture.away.goalsAgainst / awayMP;
  const homeWins = fixture.home.form.filter(f => f === "W").length;
  const awayWins = fixture.away.form.filter(f => f === "W").length;
  const homeLosses = fixture.home.form.filter(f => f === "L").length;
  const awayLosses = fixture.away.form.filter(f => f === "L").length;
  const homePoints = fixture.home.pointsTotal;
  const awayPoints = fixture.away.pointsTotal;

  const data = [
    {
      axis: "Ataque",
      home: Math.min(98, Math.max(5, homeGPG * 40 + 10)),
      away: Math.min(98, Math.max(5, awayGPG * 40 + 10)),
    },
    {
      axis: "Defensa",
      home: Math.min(98, Math.max(5, 100 - homeCPG * 45)),
      away: Math.min(98, Math.max(5, 100 - awayCPG * 45)),
    },
    {
      axis: "Forma",
      home: Math.min(98, Math.max(5, homeWins * 20 - homeLosses * 10 + 30)),
      away: Math.min(98, Math.max(5, awayWins * 20 - awayLosses * 10 + 30)),
    },
    {
      axis: "H2H",
      // Use probabilities from analysis as H2H proxy
      home: Math.min(95, Math.max(10, analysis.probabilities.homeWin * 1.3)),
      away: Math.min(95, Math.max(10, analysis.probabilities.awayWin * 1.3)),
    },
    {
      axis: "Liga Pos.",
      home: Math.min(98, Math.max(5, 105 - fixture.home.tablePosition * 5)),
      away: Math.min(98, Math.max(5, 105 - fixture.away.tablePosition * 5)),
    },
    {
      axis: "Local/Visit.",
      home: Math.min(90, Math.max(20, 55 + (homePoints / homeMP) * 12)),
      away: Math.min(70, Math.max(10, 25 + (awayPoints / awayMP) * 8)),
    },
    {
      axis: "Motivación",
      home: Math.min(98, Math.max(10, fixture.home.motivation)),
      away: Math.min(98, Math.max(10, fixture.away.motivation)),
    },
  ];

  // SVG radar calculation
  const cx = 150, cy = 150, r = 110;
  const angles = data.map((_, i) => (i * 360 / data.length - 90) * Math.PI / 180);

  const getPoint = (value: number, angleIdx: number) => {
    const dist = (value / 100) * r;
    return { x: cx + dist * Math.cos(angles[angleIdx]), y: cy + dist * Math.sin(angles[angleIdx]) };
  };

  const homePath = data.map((d, i) => getPoint(d.home, i)).map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
  const awayPath = data.map((d, i) => getPoint(d.away, i)).map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  // Grid circles
  const gridLevels = [20, 40, 60, 80, 100];

  return (
    <div className="adv-chart radar-mf-chart">
      <h4>Radar 7D — Análisis Multifactorial</h4>
      <p className="adv-subtitle">Score 0-100 por dimensión | {fixture.leagueName}</p>
      <div className="radar-mf-container">
        <svg viewBox="0 0 300 300" className="radar-mf-svg">
          {/* Grid */}
          {gridLevels.map(level => {
            const points = angles.map(a => ({
              x: cx + (level / 100) * r * Math.cos(a),
              y: cy + (level / 100) * r * Math.sin(a),
            }));
            return (
              <polygon
                key={level}
                points={points.map(p => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.5"
              />
            );
          })}
          {/* Axis lines */}
          {angles.map((a, i) => (
            <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          ))}
          {/* Away area (red/pink) */}
          <path d={awayPath} fill="rgba(244, 63, 94, 0.15)" stroke="#f43f5e" strokeWidth="2" />
          {/* Home area (cyan/green) */}
          <path d={homePath} fill="rgba(52, 211, 153, 0.15)" stroke="#34d399" strokeWidth="2" />
          {/* Dots */}
          {data.map((d, i) => {
            const hp = getPoint(d.home, i);
            const ap = getPoint(d.away, i);
            return (
              <g key={i}>
                <circle cx={hp.x} cy={hp.y} r="3" fill="#34d399" />
                <circle cx={ap.x} cy={ap.y} r="3" fill="#f43f5e" />
              </g>
            );
          })}
          {/* Labels */}
          {data.map((d, i) => {
            const labelDist = r + 18;
            const lx = cx + labelDist * Math.cos(angles[i]);
            const ly = cy + labelDist * Math.sin(angles[i]);
            return (
              <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="#8fa89a" fontSize="9" fontWeight="700">
                {d.axis}
              </text>
            );
          })}
        </svg>
        <div className="radar-mf-legend">
          <span className="radar-mf-leg home">── {fixture.home.name} (local)</span>
          <span className="radar-mf-leg away">── {fixture.away.name} (visitante)</span>
        </div>
      </div>
    </div>
  );
}
export function ScoreHeatmap({ fixture, analysis }: { fixture: Fixture; analysis: AnalysisResult }) {
  // Calculate Poisson matrix for heatmap
  const matrix = useMemo(() => {
    const homeMP = Math.max(1, fixture.home.matchesPlayed);
    const awayMP = Math.max(1, fixture.away.matchesPlayed);
    const lambdaHome = fixture.coverage.hasXg
      ? (fixture.home.xgFor / homeMP * 0.58 + fixture.away.goalsAgainst / awayMP * 0.42 + 0.18)
      : (fixture.home.goalsFor / homeMP * 0.58 + fixture.away.goalsAgainst / awayMP * 0.42 + 0.18);
    const lambdaAway = fixture.coverage.hasXg
      ? (fixture.away.xgFor / awayMP * 0.56 + fixture.home.goalsAgainst / homeMP * 0.44)
      : (fixture.away.goalsFor / awayMP * 0.56 + fixture.home.goalsAgainst / homeMP * 0.44);

    const poisson = (lambda: number, k: number) => {
      let fact = 1;
      for (let i = 2; i <= k; i++) fact *= i;
      return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
    };

    const grid: number[][] = [];
    for (let h = 0; h <= 6; h++) {
      const row: number[] = [];
      for (let a = 0; a <= 6; a++) {
        row.push(Math.round(poisson(lambdaHome, h) * poisson(lambdaAway, a) * 1000) / 10);
      }
      grid.push(row);
    }
    return { grid, lambdaHome: Math.round(lambdaHome * 100) / 100, lambdaAway: Math.round(lambdaAway * 100) / 100 };
  }, [fixture]);

  const maxProb = Math.max(...matrix.grid.flat());

  // Color interpolation: green (low) → yellow (mid) → red (high) like reference image
  const getHeatColor = (prob: number) => {
    if (prob <= 0.1) return "rgba(30, 70, 40, 0.5)";
    const ratio = prob / maxProb;
    if (ratio < 0.25) return `rgb(40, ${Math.round(100 + ratio * 400)}, 50)`;
    if (ratio < 0.5) return `rgb(${Math.round(ratio * 400)}, ${Math.round(160 + ratio * 100)}, 30)`;
    if (ratio < 0.75) return `rgb(${Math.round(200 + ratio * 70)}, ${Math.round(140 - ratio * 100)}, 20)`;
    return `rgb(${Math.round(220 + ratio * 35)}, ${Math.round(50 - ratio * 30)}, 20)`;
  };

  return (
    <div className="adv-chart heatmap-chart">
      <h4>Heatmap — Probabilidad por Marcador (%)</h4>
      <p className="adv-subtitle">{fixture.home.name} (filas) vs {fixture.away.name} (cols) | Monte Carlo</p>
      <div className="heatmap-grid">
        {/* Column headers */}
        <div className="heatmap-header">
          <span className="heatmap-corner"></span>
          {[0,1,2,3,4,5,6].map(a => <span key={a} className="heatmap-col-label">{fixture.away.name.slice(0,4)} {a}</span>)}
        </div>
        {/* Rows */}
        {matrix.grid.map((row, h) => (
          <div key={h} className="heatmap-row">
            <span className="heatmap-row-label">{fixture.home.name.slice(0,4)} {h}</span>
            {row.map((prob, a) => (
              <span
                key={a}
                className="heatmap-cell"
                style={{ backgroundColor: getHeatColor(prob) }}
              >
                {prob > 0 ? `${prob}%` : "0%"}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-scale">
        <span>0%</span>
        <div className="heatmap-scale-bar" />
        <span>{maxProb}%</span>
      </div>
    </div>
  );
}

/**
 * Donut Chart — Probabilidades 1X2 Monte Carlo
 */
export function DonutChart1X2({ fixture, analysis }: { fixture: Fixture; analysis: AnalysisResult }) {
  const { homeWin, draw, awayWin } = analysis.probabilities;
  const total = homeWin + draw + awayWin;
  const segments = [
    { label: `${fixture.home.name} Gana`, value: homeWin, color: "#34d399", offset: 0 },
    { label: "Empate", value: draw, color: "#f43f5e", offset: homeWin },
    { label: `${fixture.away.name} Gana`, value: awayWin, color: "#38bdf8", offset: homeWin + draw },
  ];

  return (
    <div className="adv-chart donut-chart">
      <h4>Probabilidades Finales — Monte Carlo</h4>
      <p className="adv-subtitle">Modelo Bivariate Poisson + t-Student cola gruesa</p>
      <div className="donut-container">
        <svg viewBox="0 0 200 200" className="donut-svg">
          {segments.map((seg, i) => {
            const startAngle = (seg.offset / total) * 360 - 90;
            const endAngle = ((seg.offset + seg.value) / total) * 360 - 90;
            const largeArc = seg.value / total > 0.5 ? 1 : 0;
            const r = 80;
            const cx = 100, cy = 100;
            const x1 = cx + r * Math.cos(startAngle * Math.PI / 180);
            const y1 = cy + r * Math.sin(startAngle * Math.PI / 180);
            const x2 = cx + r * Math.cos(endAngle * Math.PI / 180);
            const y2 = cy + r * Math.sin(endAngle * Math.PI / 180);
            return (
              <path
                key={i}
                d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={seg.color}
                stroke="#0a0a0a"
                strokeWidth="2"
              />
            );
          })}
          <circle cx="100" cy="100" r="45" fill="#0a0a0a" />
          <text x="100" y="95" textAnchor="middle" fill="#f4f4f5" fontSize="12" fontWeight="700">1X2</text>
          <text x="100" y="112" textAnchor="middle" fill="#71717a" fontSize="8">Monte Carlo</text>
        </svg>
        <div className="donut-legend">
          {segments.map((seg, i) => (
            <div key={i} className="donut-legend-item">
              <span className="donut-dot" style={{ background: seg.color }} />
              <span>{seg.label}</span>
              <b>{seg.value}%</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Distribución Poisson de Goles Esperados — Barras superpuestas
 */
export function PoissonDistribution({ fixture }: { fixture: Fixture }) {
  const distribution = useMemo(() => {
    const homeMP = Math.max(1, fixture.home.matchesPlayed);
    const awayMP = Math.max(1, fixture.away.matchesPlayed);
    const lambdaHome = fixture.coverage.hasXg
      ? (fixture.home.xgFor / homeMP * 0.58 + fixture.away.goalsAgainst / awayMP * 0.42 + 0.18)
      : (fixture.home.goalsFor / homeMP * 0.58 + fixture.away.goalsAgainst / awayMP * 0.42 + 0.18);
    const lambdaAway = fixture.coverage.hasXg
      ? (fixture.away.xgFor / awayMP * 0.56 + fixture.home.goalsAgainst / homeMP * 0.44)
      : (fixture.away.goalsFor / awayMP * 0.56 + fixture.home.goalsAgainst / homeMP * 0.44);

    const poisson = (lambda: number, k: number) => {
      let fact = 1;
      for (let i = 2; i <= k; i++) fact *= i;
      return Math.round(Math.exp(-lambda) * Math.pow(lambda, k) / fact * 1000) / 10;
    };

    const goals = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    return {
      goals,
      home: goals.map(k => poisson(lambdaHome, k)),
      away: goals.map(k => poisson(lambdaAway, k)),
      lambdaHome: Math.round(lambdaHome * 100) / 100,
      lambdaAway: Math.round(lambdaAway * 100) / 100,
    };
  }, [fixture]);

  const maxProb = Math.max(...distribution.home, ...distribution.away);

  return (
    <div className="adv-chart poisson-chart">
      <h4>Distribución Poisson de Goles Esperados</h4>
      <p className="adv-subtitle">λ_{fixture.home.name.slice(0,3)}={distribution.lambdaHome} | λ_{fixture.away.name.slice(0,3)}={distribution.lambdaAway} | Modelo blended 70/30</p>
      <div className="poisson-bars">
        {distribution.goals.map((k, i) => (
          <div key={k} className="poisson-bar-group">
            <div className="poisson-bar-pair">
              <div
                className="poisson-bar home"
                style={{ height: `${(distribution.home[i] / maxProb) * 100}%` }}
                title={`${fixture.home.name}: ${distribution.home[i]}%`}
              >
                {distribution.home[i] > 3 && <span>{distribution.home[i]}%</span>}
              </div>
              <div
                className="poisson-bar away"
                style={{ height: `${(distribution.away[i] / maxProb) * 100}%` }}
                title={`${fixture.away.name}: ${distribution.away[i]}%`}
              >
                {distribution.away[i] > 3 && <span>{distribution.away[i]}%</span>}
              </div>
            </div>
            <span className="poisson-label">{k}</span>
          </div>
        ))}
      </div>
      <div className="poisson-legend">
        <span className="poisson-leg-item"><span className="poisson-dot home" /> {fixture.home.name}</span>
        <span className="poisson-leg-item"><span className="poisson-dot away" /> {fixture.away.name}</span>
      </div>
    </div>
  );
}

/**
 * Barras Modelo vs Mercado — Value Bet comparison
 */
export function ValueBetBars({ analysis }: { analysis: AnalysisResult }) {
  const markets = analysis.valueTable.slice(0, 8);
  const maxProb = Math.max(...markets.map(m => Math.max(m.modelProbability, m.marketProbability)));

  return (
    <div className="adv-chart valuebars-chart">
      <h4>Valor de Apuesta — Modelo vs Mercado</h4>
      <p className="adv-subtitle">Edge positivo = value bet | Barras azules = modelo, naranjas = mercado</p>
      <div className="valuebars-container">
        {markets.map((m) => (
          <div key={m.market} className="valuebar-group">
            <div className="valuebar-bars">
              <div className="valuebar modelo" style={{ height: `${(m.modelProbability / maxProb) * 100}%` }}>
                <span>{m.modelProbability}%</span>
              </div>
              <div className="valuebar mercado" style={{ height: `${(m.marketProbability / maxProb) * 100}%` }}>
                {m.marketProbability > 0 && <span>{m.marketProbability}%</span>}
              </div>
            </div>
            <span className="valuebar-label">{m.market.replace("Visitante", "Vis.").replace("Local", "Loc.")}</span>
            <span className={`valuebar-edge ${m.edge > 0 ? "positive" : "negative"}`}>
              {m.edge > 0 ? "+" : ""}{m.edge}%
            </span>
          </div>
        ))}
      </div>
      <div className="valuebars-legend">
        <span><span className="vb-dot modelo" /> Prob. Modelo (%)</span>
        <span><span className="vb-dot mercado" /> Prob. Mercado (%)</span>
      </div>
    </div>
  );
}
