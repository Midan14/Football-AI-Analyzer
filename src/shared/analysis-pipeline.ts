import type { AnalysisResult } from "./domain";

export type AnalysisPipelineLayer = "typescript" | "python" | "ml";

export type AnalysisPipelineTier = "max" | "high" | "standard" | "base";

export type AnalysisPipelineStatus = {
  layers: AnalysisPipelineLayer[];
  label: string;
  detail: string;
  tier: AnalysisPipelineTier;
  modelsUsed: string[];
  extendedMerged: boolean;
  mlBlended: boolean;
  mlHeuristic: boolean;
};

type BuildInput = {
  analysis: AnalysisResult;
  extendedMerged?: boolean;
  mlBlended?: boolean;
  mlPrediction?: {
    models_used?: string[];
    source?: string;
    probabilities?: { ensemble?: Record<string, number> };
  } | null;
};

function hasPythonSources(
  sources?: NonNullable<AnalysisResult["advancedModels"]>["modelSources"]
): boolean {
  if (!sources || typeof sources !== "object") return false;
  const s = sources as Record<string, string | Record<string, boolean> | undefined>;
  const keys = ["timeSeries", "bivariatePoisson", "temporalBlend", "mlOps", "causalSurvival", "quantumOptimizer", "halfTime", "cornersEsp", "multiMarket"];
  return keys.some((k) => {
    const v = s[k];
    return typeof v === "string" && v.length > 0 && !v.includes("typescript") && !v.includes("fallback");
  });
}

export function buildAnalysisPipelineStatus(input: BuildInput): AnalysisPipelineStatus {
  const layers: AnalysisPipelineLayer[] = ["typescript"];
  const modelsUsed = [...(input.mlPrediction?.models_used ?? [])];

  const extendedMerged =
    input.extendedMerged ?? hasPythonSources(input.analysis.advancedModels?.modelSources);
  const hasMl = Boolean(input.mlPrediction?.probabilities?.ensemble);
  const mlHeuristic = modelsUsed.some((m) => m.includes("heuristic"));
  const mlHybrid = input.mlPrediction?.source === "hybrid";
  const mlTrained = (hasMl && modelsUsed.length > 0 && !mlHeuristic) || mlHybrid;

  if (extendedMerged) layers.push("python");
  if (hasMl) layers.push("ml");

  const mlBlended = input.mlBlended ?? (hasMl && Boolean(input.analysis.ensemble?.dominantModel?.includes("Multi")));

  let tier: AnalysisPipelineTier = "base";
  let label = "Motor: TS";
  let detail = "Análisis estadístico en TypeScript (Poisson, ensemble, Kelly, modelos avanzados locales).";

  if (mlHybrid) {
    tier = "max";
    label = "Motor: Híbrido DC→XGB";
    detail = `Dixon-Coles (λ/μ) + XGBoost contextual → mercados unificados (${modelsUsed.join(", ")}).`;
  } else if (layers.length === 3 && mlTrained) {
    tier = "max";
    label = "Motor: TS + Python + ML";
    detail = `Mezcla ponderada TS + modelos extendidos (Prophet/ARIMA/SARIMA, etc.) + ML entrenado (${modelsUsed.join(", ")}).`;
  } else if (layers.length === 3) {
    tier = "high";
    label = "Motor: TS + Python + ML*";
    detail = "TS + Python extendido + señal ML heurística (sin modelos .joblib o voting aún).";
  } else if (extendedMerged && hasMl) {
    tier = "high";
    label = "Motor: TS + Python + ML";
    detail = detail;
  } else if (extendedMerged) {
    tier = "high";
    label = "Motor: TS + Python";
    detail = "TypeScript + ml-service (series temporales, causal, quantum, HT, córners, tarjetas).";
  } else if (hasMl) {
    tier = "standard";
    label = "Motor: TS + ML";
    detail = `TypeScript mezclado con predicción ML (${modelsUsed.join(", ") || "ensemble"}).`;
  } else if (mlBlended) {
    tier = "standard";
    label = "Motor: TS multi-capa";
    detail = "Ensemble TS con blend temporal interno (sin Python ni ML externo).";
  }

  return {
    layers,
    label,
    detail,
    tier,
    modelsUsed,
    extendedMerged,
    mlBlended,
    mlHeuristic,
  };
}

/** Derive pipeline from cached analysis when API meta is missing. */
export function deriveAnalysisPipelineStatus(
  analysis: AnalysisResult,
  mlPrediction?: BuildInput["mlPrediction"]
): AnalysisPipelineStatus {
  return buildAnalysisPipelineStatus({ analysis, mlPrediction });
}
