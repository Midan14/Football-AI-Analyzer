import React from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CircleCheck,
  Clock3,
  ShieldCheck,
  Star,
  SlidersHorizontal,
  Zap,
  Database,
  Search,
  ArrowUpRight,
} from "lucide-react";
import type { Fixture, AnalysisResult } from "@/shared/domain";
import type { ModelRun } from "./model-runs-builder";
import { modelModes, scenarios, type ModelMode, type ScenarioId, type DensityMode } from "./dashboard-config";
import { round } from "./dashboard-utils";

export function TopSelect({
  label,
  value,
  options,
  onChange,
  provider = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  provider?: boolean;
}) {
  return (
    <label className="top-select">
      <span>{label}</span>
      <select
        className={provider ? "provider-select" : ""}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Kpi({
  title,
  value,
  detail,
  icon,
  amber = false,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  amber?: boolean;
}) {
  return (
    <article className="kpi">
      <div>
        <span>{title}</span>
        <strong className={amber ? "amber" : ""}>{value}</strong>
        <small>{detail}</small>
      </div>
      {icon}
    </article>
  );
}

export function OperationalStrip({
  fixture,
  loading,
  confidence,
  riskLevel,
  qualityScore,
  actionableMarkets,
  fixtureStatus,
}: {
  fixture?: Fixture;
  loading: boolean;
  confidence: number;
  riskLevel: string;
  qualityScore: number;
  actionableMarkets: number;
  fixtureStatus: string;
}) {
  const matchName = fixture
    ? `${fixture.home.name} vs ${fixture.away.name}`
    : "Sin partido seleccionado";

  return (
    <section className="ops-strip" aria-label="Estado operacional">
      <div className="ops-primary">
        <span className={loading ? "ops-dot loading" : "ops-dot"} />
        <div>
          <strong>{matchName}</strong>
          <span>{fixtureStatus} · Motor AI sincronizado · proveedor activo</span>
        </div>
      </div>
      <MetricPill icon={<Activity size={18} />} label="Calidad" value={`${qualityScore}%`} />
      <MetricPill icon={<ShieldCheck size={18} />} label="Confianza" value={`${confidence}%`} />
      <MetricPill
        icon={<AlertTriangle size={18} />}
        label="Riesgo"
        value={riskLevel}
        tone={riskLevel === "ALTO" ? "danger" : riskLevel === "MODERADO" ? "warn" : "good"}
      />
      <MetricPill icon={<BarChart3 size={18} />} label="Mercados" value={String(actionableMarkets)} />
      <MetricPill icon={<Clock3 size={18} />} label="Estado" value={loading ? "Sync" : "Listo"} />
    </section>
  );
}

function MetricPill({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return (
    <div className={`metric-pill ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DecisionPanel({
  fixture,
  analysis,
  confidence,
  riskLevel,
  actionableMarkets,
  onOpenMatch,
  onOpenModel,
}: {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  confidence: number;
  riskLevel: string;
  actionableMarkets: number;
  onOpenMatch: () => void;
  onOpenModel: () => void;
}) {
  const decision = !analysis
    ? "SIN DATOS"
    : confidence >= 68 && actionableMarkets > 0
      ? "GO"
      : confidence >= 52
        ? "WAIT"
        : "NO BET";
  const decisionTone = decision === "GO" ? "go" : decision === "WAIT" ? "wait" : "stop";
  const topEdge = analysis?.valueTable.slice().sort((a, b) => b.edge - a.edge)[0];

  return (
    <article className={`decision-panel ${decisionTone}`}>
      <div className="decision-head">
        <div>
          <span>Decisión operativa</span>
          <strong>{decision}</strong>
        </div>
        <CircleCheck size={34} />
      </div>
      <div className="decision-match">
        <span>{fixture ? `${fixture.home.name} vs ${fixture.away.name}` : "Selecciona un partido"}</span>
        <b>{riskLevel} riesgo</b>
      </div>
      <div className="decision-grid">
        <div><span>Pick</span><strong>{analysis?.recommendation.market ?? "-"}</strong></div>
        <div><span>Stake</span><strong>{analysis ? `${analysis.recommendation.stakeUnits}u` : "-"}</strong></div>
        <div><span>Edge top</span><strong>{topEdge ? `${topEdge.edge > 0 ? "+" : ""}${topEdge.edge}%` : "-"}</strong></div>
        <div><span>Flags</span><strong>{analysis?.riskFlags.length ?? 0}</strong></div>
      </div>
      <p>{analysis?.recommendation.rationale ?? "Carga una liga y fecha para generar una recomendación auditable."}</p>
      <div className="decision-actions">
        <button onClick={onOpenMatch}>Match Center <ArrowUpRight size={16} /></button>
        <button onClick={onOpenModel}>Modelo AI <ArrowUpRight size={16} /></button>
      </div>
    </article>
  );
}

export function Panel({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <article className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      {children}
    </article>
  );
}

export function Watch({
  title,
  meta,
  active = false,
  starred = false,
  onOpen,
  onStar,
}: {
  title: string;
  meta: string;
  active?: boolean;
  starred?: boolean;
  onOpen: () => void;
  onStar: () => void;
}) {
  return (
    <div className={active ? "watch active" : "watch"}>
      <button className="watch-main" onClick={onOpen}>
        <strong>{title}</strong>
        <span>{meta}</span>
      </button>
      <Bell size={18} />
      <button className="icon-button" onClick={onStar}>
        <Star className={starred || active ? "gold" : ""} size={21} />
      </button>
    </div>
  );
}

export function AlertItem({
  icon,
  title,
  meta,
  onOpen,
}: {
  icon: string;
  title: string;
  meta: string;
  onOpen: () => void;
}) {
  return (
    <button className="alert-line" onClick={onOpen}>
      <i>{icon}</i>
      <div><strong>{title}</strong><span>{meta}</span></div>
      <Star size={21} />
    </button>
  );
}

export function InteractionDeck({
  modelMode,
  scenario,
  density,
  marketFilter,
  confidence,
  recommendation,
  onModeChange,
  onScenarioChange,
  onDensityChange,
  onMarketFilterChange,
  onOpenMarkets,
}: {
  modelMode: ModelMode;
  scenario: ScenarioId;
  density: DensityMode;
  marketFilter: string;
  confidence: number;
  recommendation: string;
  onModeChange: (mode: ModelMode) => void;
  onScenarioChange: (scenario: ScenarioId) => void;
  onDensityChange: (density: DensityMode) => void;
  onMarketFilterChange: (filter: string) => void;
  onOpenMarkets: () => void;
}) {
  return (
    <section className="interaction-deck" aria-label="Controles interactivos de análisis">
      <div className="command-search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Filtrar mercados"
          value={marketFilter}
          onChange={(event) => onMarketFilterChange(event.target.value)}
          placeholder="Filtrar mercados: over, empate, visitante..."
        />
      </div>

      <div className="segmented" aria-label="Modo del modelo">
        {modelModes.map((mode) => (
          <button
            key={mode}
            className={modelMode === mode ? "active" : ""}
            onClick={() => onModeChange(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="scenario-strip">
        {scenarios.map(([id, label, meta]) => (
          <button
            key={id}
            className={scenario === id ? "scenario active" : "scenario"}
            onClick={() => onScenarioChange(id)}
          >
            <span>{label}</span>
            <small>{meta}</small>
          </button>
        ))}
      </div>

      <button className="signal-card" onClick={onOpenMarkets}>
        <Zap size={20} aria-hidden="true" />
        <span>Mercado activo</span>
        <strong>{recommendation}</strong>
      </button>

      <div className="confidence-card">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <span>Confianza ajustada</span>
        <strong>{confidence}%</strong>
        <i><b style={{ width: `${confidence}%` }} /></i>
      </div>

      <button
        className="density-toggle"
        onClick={() => onDensityChange(density === "comfortable" ? "compact" : "comfortable")}
      >
        {density === "comfortable" ? "Compactar" : "Expandir"}
      </button>
    </section>
  );
}

export function ActionConsole({
  fixture,
  analysis,
  bankroll,
  confidence,
  riskLevel,
  activityLog,
  modelRuns,
  analyzing,
  starred,
  onBankrollChange,
  onRunAnalysis,
  onToggleWatch,
  onCreateReport,
  onSimulateRisk,
  onCommitDecision,
}: {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  bankroll: number;
  confidence: number;
  riskLevel: string;
  activityLog: Array<{ id: string; title: string; meta: string; tone: "good" | "warn" | "danger" | "neutral" }>;
  modelRuns: ModelRun[];
  analyzing: boolean;
  starred: boolean;
  onBankrollChange: (value: number) => void;
  onRunAnalysis: () => void;
  onToggleWatch: () => void;
  onCreateReport: () => void;
  onSimulateRisk: () => void;
  onCommitDecision: () => void;
}) {
  const stakeAmount = analysis ? round((bankroll * analysis.recommendation.stakeUnits) / 100) : 0;
  const exposure = analysis ? `${analysis.recommendation.stakeUnits}u` : "-";

  return (
    <section className="action-console" aria-label="Consola interactiva">
      <article className="run-analysis-card">
        <button className="run-analysis-button" onClick={onRunAnalysis} disabled={analyzing}>
          <Zap size={22} />
          <span>{analyzing ? "Ejecutando todos los modelos..." : "Ejecutar análisis profundo ML"}</span>
          <strong>{fixture ? `${fixture.home.name} vs ${fixture.away.name}` : "Selecciona un partido"}</strong>
        </button>
      </article>

      <article className="action-trade">
        <div>
          <span>Simulador de stake</span>
          <strong>${stakeAmount}</strong>
          <small>{exposure} sobre bankroll ${bankroll}</small>
        </div>
        <label>
          <span>Bankroll</span>
          <input
            type="range"
            min="100"
            max="5000"
            step="100"
            value={bankroll}
            onChange={(event) => onBankrollChange(Number(event.target.value))}
          />
        </label>
      </article>

      <article className="action-summary">
        <span>{fixture ? `${fixture.home.name} vs ${fixture.away.name}` : "Sin fixture"}</span>
        <strong>{analysis?.recommendation.market ?? "Sin pick"}</strong>
        <div><b>Confianza {confidence}%</b><b>Riesgo {riskLevel}</b></div>
      </article>

      <div className="action-buttons">
        <button onClick={onToggleWatch}><Star className={starred ? "gold" : ""} size={17} />{starred ? "Siguiendo" : "Watch"}</button>
        <button onClick={onSimulateRisk}><SlidersHorizontal size={17} />Simular</button>
        <button onClick={onCreateReport}><Database size={17} />Informe</button>
        <button className="primary" onClick={onCommitDecision}><Zap size={17} />Enviar</button>
      </div>

      <article className="activity-feed">
        {activityLog.map((item) => (
          <div className={`activity-item ${item.tone}`} key={item.id}>
            <span />
            <div><strong>{item.title}</strong><small>{item.meta}</small></div>
          </div>
        ))}
      </article>

      <ModelRunBoard runs={modelRuns} analyzing={analyzing} />
    </section>
  );
}

function ModelRunBoard({ runs, analyzing }: { runs: ModelRun[]; analyzing: boolean }) {
  const visibleRuns = runs.length
    ? runs
    : [
        { id: "idle-1", name: "Poisson Goals", status: "pending" as const, output: "Esperando ejecución", score: 0 },
        { id: "idle-2", name: "Monte Carlo", status: "pending" as const, output: "Esperando ejecución", score: 0 },
        { id: "idle-3", name: "Risk Gate", status: "pending" as const, output: "Esperando ejecución", score: 0 },
      ];

  return (
    <article className="model-run-board">
      <div className="model-run-head">
        <span>Pipeline ML</span>
        <strong>{analyzing ? "RUNNING" : runs.length ? "COMPLETO" : "IDLE"}</strong>
      </div>
      <div className="model-run-list">
        {visibleRuns.map((run) => (
          <div className={`model-run ${run.status}`} key={run.id}>
            <i />
            <div>
              <strong>{run.name}</strong>
              <span>{run.output}</span>
            </div>
            <b>{run.score ? `${run.score}%` : "--"}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

export function ViewConsole({
  activeView,
  activeTab,
  country,
  league,
  date,
  fixture,
  analysis,
  loading,
  onOpenMatch,
  onOpenModel,
  onOpenAlerts,
}: {
  activeView: string;
  activeTab: string;
  country: string;
  league: string;
  date: string;
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  loading: boolean;
  onOpenMatch: () => void;
  onOpenModel: () => void;
  onOpenAlerts: () => void;
}) {
  const matchName = fixture ? `${fixture.home.name} vs ${fixture.away.name}` : "Sin partido seleccionado";
  const cards: Record<string, { kicker: string; title: string; body: string; chips: string[] }> = {
    "Dashboard Global": {
      kicker: "Vista activa",
      title: "Dashboard Global",
      body: `Resumen operativo para ${country}, ${league}. Backend activo, proveedor configurado y motor AI listo para calcular mercados con penalizaciones de riesgo.`,
      chips: ["API interna", "KPIs", "Riesgo", "Watchlist"],
    },
    "Match Center": {
      kicker: "Partido seleccionado",
      title: matchName,
      body: `Pestaña abierta: ${activeTab}. Aquí se conectan probabilidades, forma, contexto, lineups si existen, valor esperado y recomendación de menor varianza relativa.`,
      chips: [
        `1: ${analysis?.probabilities.homeWin ?? 0}%`,
        `X: ${analysis?.probabilities.draw ?? 0}%`,
        `2: ${analysis?.probabilities.awayWin ?? 0}%`,
        analysis?.recommendation.market ?? "Sin mercado",
      ],
    },
    Calendario: {
      kicker: "Calendario",
      title: `${league} · ${date}`,
      body: "Selector de fecha/liga conectado al backend. Al cambiar país, liga o fecha se consultan fixtures reales y se recalcula el partido seleccionado.",
      chips: ["Pre-match", "Live", "Finalizado", "Filtro por liga"],
    },
    "Ligas y Países": {
      kicker: "Cobertura global",
      title: `${country} · ${league}`,
      body: "Los selectores superiores consultan países y ligas desde `/api/countries` y `/api/leagues`; si Sportmonks falla, el provider demo mantiene la app operativa.",
      chips: ["Países", "Ligas", "Temporadas", "Cobertura"],
    },
    "Modelos AI": {
      kicker: "Motor analítico",
      title: "Poisson + Monte Carlo + penalizaciones",
      body: "Modelo v1 calcula 1X2, over/under, BTTS, valor esperado, cola gruesa, baja cobertura, divergencia de mercado y stake sugerido sin prometer apuestas seguras.",
      chips: ["Poisson", "Binomial negativa", "Monte Carlo", "Outliers"],
    },
    "Análisis Profundo": {
      kicker: "Análisis profundo",
      title: "Monte Carlo + contexto 360",
      body: "Vista avanzada con simulaciones, cola pesada, teoría de juegos, psicología, arbitraje y prompt técnico auditable para el fixture seleccionado.",
      chips: ["Monte Carlo", "Radar 360", "Black Swan", "Prompt"],
    },
    "Historial de Análisis": {
      kicker: "Historial",
      title: "Análisis persistidos",
      body: "Consulta análisis guardados en base de datos por usuario, con fixture, probabilidades, confianza, mercado recomendado y resultado cuando exista.",
      chips: ["DB", "Usuario", "Filtros", "Resultados"],
    },
    "Mis Predicciones": {
      kicker: "Predicciones",
      title: "Seguimiento de picks",
      body: "Registro de decisiones enviadas al backend y al historial local, con filtros por liga, resultado, rango de fechas y confianza mínima.",
      chips: ["Picks", "Stake", "ROI", "CSV"],
    },
    "Partidos en Vivo": {
      kicker: "En vivo",
      title: "Partidos en Tiempo Real",
      body: "Datos en vivo desde API-Football con polling cada 30s. Marca equipos favoritos con ⭐ para recibir alertas de sonido en goles, tarjetas y penales.",
      chips: ["Live", "Alertas", "Favoritos", "Tiempo real"],
    },
    Alertas: {
      kicker: "Riesgos",
      title: "Alertas y validación manual",
      body: "Panel para lesiones, clima, rotación, arbitraje, cobertura baja y eventos inesperados. Cada riesgo reduce confianza antes de recomendar stake.",
      chips: ["Rotación", "Lesiones", "Clima", "Baja cobertura"],
    },
    Watchlist: {
      kicker: "Seguimiento",
      title: "Partidos marcados y alertas simuladas",
      body: "Las estrellas y filas de watchlist son botones reales. Permiten marcar fixtures, abrir el Match Center y mantener seguimiento operativo.",
      chips: ["Favoritos", "Notificaciones", "Stake", "Seguimiento"],
    },
    Informes: {
      kicker: "Reportes",
      title: "Informe técnico del partido",
      body: "Base para exportar análisis pre-partido con probabilidades, supuestos, flags, verificación manual y tabla de valor esperado.",
      chips: ["PDF futuro", "Auditoría", "Supuestos", "Riesgos"],
    },
    Configuración: {
      kicker: "Sistema",
      title: "Proveedor, zona horaria y stake",
      body: "La API key queda solo en `.env.local`; el frontend consume rutas internas para no exponer credenciales. El servidor Next.js sirve frontend y backend.",
      chips: ["Sportmonks", "America/Bogota", ".env.local", "API routes"],
    },
    Ayuda: {
      kicker: "Ayuda",
      title: "Guía operativa",
      body: "Usa los selectores superiores para elegir liga/fecha, abre un fixture, revisa Modelo AI y confirma lineups antes de tomar decisiones.",
      chips: ["Uso", "Validación", "Riesgo", "Soporte"],
    },
  };
  const card = cards[activeView] ?? cards["Dashboard Global"];

  return (
    <section className="view-console" aria-live="polite">
      <div>
        <span>{card.kicker}</span>
        <strong>{card.title}</strong>
        <p>{loading ? "Actualizando datos desde API..." : card.body}</p>
      </div>
      <div className="view-chips">
        {card.chips.map((chip) => (
          <button
            key={chip}
            onClick={
              chip.includes("Poisson") || chip.includes("Monte")
                ? onOpenModel
                : chip.includes("Rotación") || chip.includes("Lesiones")
                  ? onOpenAlerts
                  : onOpenMatch
            }
          >
            {chip}
          </button>
        ))}
      </div>
    </section>
  );
}

export function RiskMeter() {
  return (
    <div className="risk-meter">
      {Array.from({ length: 5 }).map((_, index) => (
        <i className={index < 2 ? "on" : ""} key={index} />
      ))}
    </div>
  );
}

export function Prob({ label, value, tone, width }: { label: string; value: string; tone: string; width: number }) {
  return (
    <div className="prob">
      <b className={tone}>{label}</b>
      <i><span className={tone} style={{ width: `${width}%` }} /></i>
      <strong>{value}</strong>
    </div>
  );
}
