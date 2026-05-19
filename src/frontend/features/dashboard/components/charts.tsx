"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import type { AnalysisResult, Fixture } from "@/shared/domain";

interface SignalRadarChartProps {
  radar: AnalysisResult["radar"];
  confidence: number;
  fixture?: Fixture;
}

export function SignalRadarChart({ radar, confidence, fixture }: SignalRadarChartProps) {
  if (!radar || radar.length === 0) return null;

  const data = radar.map((item) => ({
    axis: item.axis,
    valor: item.value,
    umbral: Math.min(100, confidence * 0.85),
  }));

  const homeName = fixture?.home.name ?? "Local";
  const awayName = fixture?.away.name ?? "Visitante";

  return (
    <div className="radar-container">
      {/* Header con equipos */}
      <div className="radar-header">
        <div className="radar-team home">
          {fixture?.home.logo && <img src={fixture.home.logo} alt="" className="radar-team-logo" />}
          <span>{homeName}</span>
        </div>
        <div className="radar-title">
          <strong>Radar de Señal</strong>
          <span className="radar-confidence">{confidence}% confianza</span>
        </div>
        <div className="radar-team away">
          <span>{awayName}</span>
          {fixture?.away.logo && <img src={fixture.away.logo} alt="" className="radar-team-logo" />}
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="68%" data={data}>
            <PolarGrid stroke="rgba(52, 211, 153, 0.12)" strokeWidth={1} />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "#8fa89a", fontSize: 11, fontWeight: 600 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: "#4b5e55", fontSize: 9 }}
              axisLine={false}
            />
            <Radar
              name={`${homeName} vs ${awayName}`}
              dataKey="valor"
              stroke="#34d399"
              fill="url(#radarGradient)"
              fillOpacity={0.35}
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#34d399", stroke: "#052e16", strokeWidth: 2 }}
            />
            <Radar
              name="Umbral mínimo"
              dataKey="umbral"
              stroke="#f59e0b"
              fill="none"
              fillOpacity={0}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
            />
            <Legend
              wrapperStyle={{ color: "#8fa89a", fontSize: 11, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            <defs>
              <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.1} />
              </radialGradient>
            </defs>
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics grid below */}
      <div className="radar-metrics-grid">
        {radar.map((item) => (
          <div key={item.axis} className="radar-metric-item">
            <div className="radar-metric-bar-bg">
              <div
                className="radar-metric-bar-fill"
                style={{
                  width: `${item.value}%`,
                  background: item.value >= 70 ? "#34d399" : item.value >= 45 ? "#f59e0b" : "#f43f5e",
                }}
              />
            </div>
            <span className="radar-metric-label">{item.axis}</span>
            <strong
              className="radar-metric-value"
              style={{ color: item.value >= 70 ? "#34d399" : item.value >= 45 ? "#f59e0b" : "#f43f5e" }}
            >
              {item.value}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProbabilityBarChartProps {
  probabilities: AnalysisResult["probabilities"];
  fixture?: Fixture;
}

export function ProbabilityBarChart({ probabilities, fixture }: ProbabilityBarChartProps) {
  const homeName = fixture?.home.name ?? "Local";
  const awayName = fixture?.away.name ?? "Visitante";

  const data = [
    { name: homeName.length > 12 ? homeName.slice(0, 12) + "…" : homeName, prob: probabilities.homeWin, color: "#34d399" },
    { name: "Empate", prob: probabilities.draw, color: "#8fa89a" },
    { name: awayName.length > 12 ? awayName.slice(0, 12) + "…" : awayName, prob: probabilities.awayWin, color: "#f59e0b" },
    { name: "Over 2.5", prob: probabilities.over25, color: "#a78bfa" },
    { name: "Under 3.5", prob: probabilities.under35, color: "#38bdf8" },
    { name: "BTTS", prob: probabilities.btts, color: "#f43f5e" },
  ];

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#8fa89a", fontSize: 11, fontWeight: 600 }}
            axisLine={{ stroke: "rgba(52, 211, 153, 0.15)" }}
          />
          <YAxis
            tick={{ fill: "#4b5e55", fontSize: 11 }}
            axisLine={{ stroke: "rgba(52, 211, 153, 0.15)" }}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(6, 10, 14, 0.95)",
              border: "1px solid rgba(52, 211, 153, 0.25)",
              borderRadius: 8,
              color: "#f0f6f2",
              fontSize: 13,
            }}
            formatter={(value: number) => [`${value}%`, "Probabilidad"]}
          />
          <Bar dataKey="prob" radius={[6, 6, 0, 0]} maxBarSize={48}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EdgeComparisonChartProps {
  valueTable: AnalysisResult["valueTable"];
}

export function EdgeComparisonChart({ valueTable }: EdgeComparisonChartProps) {
  if (!valueTable || valueTable.length === 0) return null;

  const data = valueTable.map((row) => ({
    mercado: row.market.length > 10 ? row.market.slice(0, 10) + "…" : row.market,
    modelo: row.modelProbability,
    mercadoReal: row.marketProbability,
    edge: row.edge,
  }));

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(52, 211, 153, 0.08)" />
          <XAxis
            dataKey="mercado"
            tick={{ fill: "#8fa89a", fontSize: 10, fontWeight: 600 }}
            axisLine={{ stroke: "rgba(52, 211, 153, 0.15)" }}
          />
          <YAxis
            tick={{ fill: "#4b5e55", fontSize: 11 }}
            axisLine={{ stroke: "rgba(52, 211, 153, 0.15)" }}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(6, 10, 14, 0.95)",
              border: "1px solid rgba(52, 211, 153, 0.25)",
              borderRadius: 8,
              color: "#f0f6f2",
              fontSize: 13,
            }}
          />
          <Legend wrapperStyle={{ color: "#8fa89a", fontSize: 11 }} iconType="circle" iconSize={8} />
          <Bar dataKey="modelo" name="Modelo IA" fill="#34d399" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
          <Bar dataKey="mercadoReal" name="Mercado" fill="#4b5e55" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
