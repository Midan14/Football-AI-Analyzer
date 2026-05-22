"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Calendar,
  GitBranch,
  Layers,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { ModelInventoryState } from "@/frontend/lib/model-ai-utils";
import type { AnalysisResult, Fixture } from "@/shared/domain";
import type { AnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import { AnalysisPipelineBadge } from "./analysis-pipeline-badge";
import type { ModelMode, ScenarioId } from "../dashboard-config";
import { buildModelRuns } from "../model-runs-builder";
import { useMLStatus } from "@/frontend/hooks/use-ml-status";
import { useFixtures } from "@/frontend/hooks/use-fixtures";
import { todayIsoDateColombia } from "@/frontend/lib/date-utils";
import {
  AdvancedTab,
  AllModelsTab,
  CompareTab,
  EnsembleTab,
  exportAnalysisPDF,
  KellyTab,
  PipelineTab,
  SimulateTab,
  ValueTab,
} from "./model-ai-tabs";

type ModelAiViewProps = {
  fixture?: Fixture;
  analysis: AnalysisResult | null;
  analysisPipeline?: AnalysisPipelineStatus | null;
  mlPrediction?: {
    models_used?: string[];
    source?: string;
    probabilities?: { ensemble?: Record<string, number> };
  } | null;
  analysisLoading?: boolean;
  analysisError?: boolean;
  analysisErrorMessage?: string | null;
  onRetryAnalysis?: () => void;
  modelMode: ModelMode;
  scenario: ScenarioId;
  displayedConfidence: number;
  riskLevel: string;
  qualityScore: number;
  actionableMarkets: number;
  fixtureStatus: string;
  isReanalyzing?: boolean;
  onModeChange: (mode: ModelMode) => void;
  onScenarioChange: (scenario: ScenarioId) => void;
  onOpenMatch: () => void;
  onSelectFixture?: (fixture: Fixture) => void;
  onReanalyze?: () => void;
  onOpenCalendar?: () => void;
  onOpenDeepAnalysis?: () => void;
};

type ModelTab =
  | "ensemble"
  | "compare"
  | "simulate"
  | "value"
  | "models"
  | "kelly"
  | "advanced"
  | "pipeline";

export function ModelAiView({
  fixture,
  analysis,
  analysisPipeline,
  mlPrediction,
  analysisLoading,
  analysisError,
  analysisErrorMessage,
  onRetryAnalysis,
  modelMode,
  scenario,
  displayedConfidence,
  riskLevel,
  qualityScore,
  actionableMarkets,
  fixtureStatus,
  isReanalyzing,
  onModeChange,
  onScenarioChange,
  onOpenMatch,
  onSelectFixture,
  onReanalyze,
  onOpenCalendar,
  onOpenDeepAnalysis,
}: ModelAiViewProps) {
  const matchName = fixture ? `${fixture.home.name} vs ${fixture.away.name}` : "Sin partido seleccionado";
  const [activeTab, setActiveTab] = useState<ModelTab>("ensemble");
  const [modelFilter, setModelFilter] = useState<ModelInventoryState | "all">("all");
  const [valueMinEdge, setValueMinEdge] = useState(0);
  const [fixtureQuery, setFixtureQuery] = useState("");

  const today = todayIsoDateColombia();
  const { data: todayFixtures = [] } = useFixtures(undefined, today, {
    enabled: !fixture,
  });

  const filteredPickFixtures = useMemo(() => {
    const q = fixtureQuery.trim().toLowerCase();
    return todayFixtures
      .filter((f) => {
        if (!q) return true;
        return (
          f.home.name.toLowerCase().includes(q) ||
          f.away.name.toLowerCase().includes(q) ||
          f.leagueName.toLowerCase().includes(q)
        );
      })
      .slice(0, 12);
  }, [todayFixtures, fixtureQuery]);

  return (
    <section className="view-workspace mai-view">
      <article className="mai-header">
        <div>
          <span className="mai-kicker">Motor analítico</span>
          <h2>
            <BrainCircuit size={22} /> Modelos AI — Laboratorio
          </h2>
          <p>
            {matchName}
            {fixture ? ` · ${fixture.leagueName} · ${fixtureStatus}` : " · Selecciona un partido para auditar modelos"}
          </p>
          {fixture && analysis && (
            <AnalysisPipelineBadge
              pipeline={analysisPipeline}
              analysis={analysis}
              mlPrediction={mlPrediction}
            />
          )}
        </div>
        <div className="mai-header-actions">
          {onReanalyze && fixture && (
            <button
              type="button"
              className="mai-btn-refresh"
              onClick={onReanalyze}
              disabled={isReanalyzing || analysisLoading}
            >
              <RefreshCw size={14} className={isReanalyzing ? "spin" : ""} />
              {isReanalyzing ? "Re-ejecutando..." : "Re-ejecutar"}
            </button>
          )}
          {fixture && analysis && (
            <button type="button" className="mai-btn-export" onClick={() => exportAnalysisPDF(fixture, analysis)}>
              Exportar PDF
            </button>
          )}
          {onOpenDeepAnalysis && fixture && (
            <button type="button" className="mai-btn-secondary" onClick={onOpenDeepAnalysis}>
              <Layers size={14} /> Análisis profundo
            </button>
          )}
          <button type="button" className="mai-btn-match" onClick={onOpenMatch}>
            <Zap size={14} /> Match Center
          </button>
        </div>
      </article>

      {fixture && analysis && (
        <div className="mai-kpi-strip">
          <div className="mai-kpi">
            <span>Confianza</span>
            <strong>{displayedConfidence}%</strong>
            <small>
              {analysis?.confidence.adjustments?.hint ??
                (scenario !== "base" ? `Escenario ${scenario}` : modelMode)}
            </small>
          </div>
          <div className="mai-kpi">
            <span>Recomendación</span>
            <strong>{analysis.recommendation.market}</strong>
            <small>{analysis.recommendation.stakeUnits}u · cuota {analysis.recommendation.fairOdds}</small>
          </div>
          <div className="mai-kpi">
            <span>Riesgo</span>
            <strong>{riskLevel}</strong>
            <small>{analysis.riskFlags.length} flags activos</small>
          </div>
          <div className="mai-kpi">
            <span>Valor</span>
            <strong>{actionableMarkets}</strong>
            <small>mercados edge ≥ 4%</small>
          </div>
          <div className="mai-kpi">
            <span>Calidad</span>
            <strong>{qualityScore}</strong>
            <small>score compuesto</small>
          </div>
        </div>
      )}

      <div className="mai-tabs">
        {([
          ["ensemble", "Ensemble", BrainCircuit],
          ["compare", "Comparación", BarChart3],
          ["simulate", "Simulación", SlidersHorizontal],
          ["value", "Valor", Target],
          ["models", "Inventario", Activity],
          ["kelly", "Kelly", TrendingUp],
          ["advanced", "Avanzado", Sparkles],
          ["pipeline", "Pipeline", GitBranch],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "active" : ""}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="mai-content">
        {analysisLoading && fixture && !analysis ? (
          <div className="mai-empty">
            <RefreshCw size={32} className="spin" />
            <strong>Ejecutando modelos...</strong>
            <p>Poisson, ensemble, valor esperado y Kelly para {matchName}</p>
          </div>
        ) : fixture && analysisError && !analysis ? (
          <div className="mai-empty">
            <AlertTriangle size={32} />
            <strong>No se pudo analizar el partido</strong>
            <p>{analysisErrorMessage ?? "Error al ejecutar el pipeline de modelos."}</p>
            {onRetryAnalysis ? (
              <button type="button" className="mai-btn-refresh" onClick={onRetryAnalysis}>
                Reintentar análisis
              </button>
            ) : null}
          </div>
        ) : !fixture || !analysis ? (
          <EmptyFixturePicker
            query={fixtureQuery}
            onQueryChange={setFixtureQuery}
            fixtures={filteredPickFixtures}
            onSelect={onSelectFixture}
            onOpenCalendar={onOpenCalendar}
          />
        ) : activeTab === "ensemble" ? (
          <EnsembleTab analysis={analysis} fixture={fixture} displayedConfidence={displayedConfidence} />
        ) : activeTab === "compare" ? (
          <CompareTab analysis={analysis} fixture={fixture} />
        ) : activeTab === "simulate" ? (
          <SimulateTab analysis={analysis} fixture={fixture} />
        ) : activeTab === "value" ? (
          <ValueTab analysis={analysis} minEdge={valueMinEdge} onMinEdgeChange={setValueMinEdge} />
        ) : activeTab === "models" ? (
          <AllModelsTab analysis={analysis} filter={modelFilter} onFilterChange={setModelFilter} />
        ) : activeTab === "kelly" ? (
          <KellyTab analysis={analysis} fixture={fixture} />
        ) : activeTab === "advanced" ? (
          <AdvancedTab analysis={analysis} fixture={fixture} />
        ) : (
          <PipelineTab
            analysis={analysis}
            fixture={fixture}
            modelMode={modelMode}
            scenario={scenario}
            displayedConfidence={displayedConfidence}
            riskLevel={riskLevel}
            onModeChange={onModeChange}
            onScenarioChange={onScenarioChange}
          />
        )}
      </div>
    </section>
  );
}

function EmptyFixturePicker({
  query,
  onQueryChange,
  fixtures,
  onSelect,
  onOpenCalendar,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  fixtures: Fixture[];
  onSelect?: (fixture: Fixture) => void;
  onOpenCalendar?: () => void;
}) {
  return (
    <div className="mai-empty mai-empty-picker">
      <BrainCircuit size={48} />
      <strong>Selecciona un partido</strong>
      <p>Elige un fixture de hoy o abre el calendario para analizar todos los modelos sobre datos reales.</p>

      <div className="mai-picker-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar equipo o liga..."
        />
      </div>

      {fixtures.length > 0 ? (
        <div className="mai-picker-list">
          {fixtures.map((f) => (
            <button
              key={f.id}
              type="button"
              className="mai-picker-row"
              onClick={() => onSelect?.(f)}
            >
              <span className="mai-picker-time">
                {new Date(f.kickoff).toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "America/Bogota",
                })}
              </span>
              <strong>
                {f.home.name} vs {f.away.name}
              </strong>
              <small>{f.leagueName}</small>
              <span className={`mai-picker-status ${f.status}`}>{f.status}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mai-picker-empty">No hay partidos hoy que coincidan con la búsqueda.</p>
      )}

      {onOpenCalendar && (
        <button type="button" className="mai-empty-cta" onClick={onOpenCalendar}>
          <Calendar size={14} /> Abrir calendario
        </button>
      )}
    </div>
  );
}
