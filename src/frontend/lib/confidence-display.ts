import type { AnalysisResult } from "@/shared/domain";
import {
  applyPreferenceDelta,
  getPreferenceDeltas,
  preferenceAdjustmentHint,
  normalizeAnalysisPreferences,
  type AnalysisModelMode,
  type AnalysisScenarioId,
} from "@/shared/analysis-preferences";

export type DisplayConfidence = {
  baseScore: number;
  displayedScore: number;
  scenarioDelta: number;
  modeDelta: number;
  isVisualAdjustment: boolean;
  hint: string;
};

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
