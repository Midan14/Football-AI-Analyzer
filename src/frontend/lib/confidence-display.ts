import type { AnalysisResult } from "@/shared/domain";
import {
  applyPreferenceDelta,
  getPreferenceDeltas,
  preferenceAdjustmentHint,
  normalizeAnalysisPreferences,
  type AnalysisModelMode,
  type AnalysisScenarioId,
} from "@/shared/analysis-preferences";
import {
  CONFIDENCE_THRESHOLDS,
  decisionFromConfidence,
  riskLevelFromConfidence,
  type ConfidenceDecision,
  type ConfidenceRisk,
} from "@/shared/confidence-thresholds";

export type DisplayConfidence = {
  baseScore: number;
  displayedScore: number;
  scenarioDelta: number;
  modeDelta: number;
  isVisualAdjustment: boolean;
  hint: string;
};

export function riskFromConfidence(score: number): ConfidenceRisk {
  return riskLevelFromConfidence(score);
}

export { CONFIDENCE_THRESHOLDS, decisionFromConfidence };

/** Derive display metadata from server-adjusted analysis when available. */
export function confidenceFromAnalysis(
  analysis: AnalysisResult | null | undefined,
  modelMode: AnalysisModelMode,
  scenario: AnalysisScenarioId
): DisplayConfidence {
  if (analysis?.confidence.adjustments) {
    const adj = analysis.confidence.adjustments;
    return {
      baseScore: analysis.confidence.baseScore ?? analysis.confidence.score,
      displayedScore: analysis.confidence.score,
      modeDelta: adj.modeDelta,
      scenarioDelta: adj.scenarioDelta,
      isVisualAdjustment: adj.totalDelta !== 0,
      hint: adj.hint,
    };
  }

  return computeDisplayConfidence(analysis?.confidence.score, modelMode, scenario);
}

/** Fallback when analysis is not loaded yet (uses same deltas as backend). */
export function computeDisplayConfidence(
  baseScore: number | undefined,
  modelMode: AnalysisModelMode,
  scenario: AnalysisScenarioId
): DisplayConfidence {
  const prefs = normalizeAnalysisPreferences({ modelMode, scenario });
  const base = baseScore ?? 0;
  const { modeDelta, scenarioDelta, totalDelta } = getPreferenceDeltas(prefs);
  const displayedScore = applyPreferenceDelta(base, prefs);
  const isVisualAdjustment = totalDelta !== 0;

  return {
    baseScore: base,
    displayedScore,
    scenarioDelta,
    modeDelta,
    isVisualAdjustment,
    hint: preferenceAdjustmentHint(base, displayedScore, prefs),
  };
}
