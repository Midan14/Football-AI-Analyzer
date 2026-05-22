"use client";

import { Cpu, FlaskConical, Layers } from "lucide-react";
import type { AnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import { deriveAnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import type { AnalysisResult } from "@/shared/domain";

type AnalysisPipelineBadgeProps = {
  pipeline?: AnalysisPipelineStatus | null;
  analysis?: AnalysisResult | null;
  mlPrediction?: {
    models_used?: string[];
    source?: string;
    probabilities?: { ensemble?: Record<string, number> };
  } | null;
  compact?: boolean;
};

const LAYER_META = {
  typescript: { short: "TS", label: "TypeScript", icon: Cpu, color: "#38bdf8" },
  python: { short: "Py", label: "Python extendido", icon: FlaskConical, color: "#a78bfa" },
  ml: { short: "ML", label: "ML entrenado", icon: Layers, color: "#34d399" },
} as const;

export function AnalysisPipelineBadge({
  pipeline: pipelineProp,
  analysis,
  mlPrediction,
  compact = false,
}: AnalysisPipelineBadgeProps) {
  const pipeline =
    pipelineProp ??
    (analysis ? deriveAnalysisPipelineStatus(analysis, mlPrediction) : null);
  if (!pipeline) return null;

  const tierClass = `pipeline-tier-${pipeline.tier}`;

  return (
    <div
      className={`analysis-pipeline-badge ${tierClass} ${compact ? "compact" : ""}`}
      title={pipeline.detail}
      role="status"
      aria-label={pipeline.label}
    >
      <span className="pipeline-label">{pipeline.label}</span>
      <div className="pipeline-chips">
        {(Object.keys(LAYER_META) as Array<keyof typeof LAYER_META>).map((layer) => {
          const meta = LAYER_META[layer];
          const active = pipeline.layers.includes(layer);
          const Icon = meta.icon;
          return (
            <span
              key={layer}
              className={`pipeline-chip ${active ? "active" : "inactive"}`}
              style={active ? { borderColor: meta.color, color: meta.color } : undefined}
              title={active ? meta.label : `${meta.label} (no activo en este análisis)`}
            >
              <Icon size={12} />
              {meta.short}
              {layer === "ml" && active && pipeline.mlHeuristic ? "*" : ""}
            </span>
          );
        })}
      </div>
      {!compact && pipeline.modelsUsed.length > 0 && (
        <small className="pipeline-models">{pipeline.modelsUsed.join(" · ")}</small>
      )}
    </div>
  );
}
