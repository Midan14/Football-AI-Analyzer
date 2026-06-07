import type { AnalysisResult } from "@/shared/domain";
import {
  applyPreferenceDelta,
  getPreferenceDeltas,
  preferenceAdjustmentHint,
  type AnalysisPreferences,
} from "@/shared/analysis-preferences";
import { computeStakeUnits } from "./risk-policy";

/**
 * Applies user-selected model mode and scenario to an analysis result.
 * Adjusts confidence score, stake units, and rationale.
 */
export function applyAnalysisPreferences(
  analysis: AnalysisResult,
  preferences: AnalysisPreferences
): AnalysisResult {
  const baseScore = analysis.confidence.score;
  const { modeDelta, scenarioDelta, totalDelta } = getPreferenceDeltas(preferences);

  if (totalDelta === 0) {
    return {
      ...analysis,
      confidence: {
        ...analysis.confidence,
        baseScore,
        adjustments: {
          modelMode: preferences.modelMode,
          scenario: preferences.scenario,
          modeDelta: 0,
          scenarioDelta: 0,
          totalDelta: 0,
          hint: preferenceAdjustmentHint(baseScore, baseScore, preferences),
        },
      },
    };
  }

  const adjustedScore = applyPreferenceDelta(baseScore, preferences);
  const penalties = [...analysis.confidence.penalties];

  if (modeDelta < 0) {
    penalties.push({
      id: "user_model_mode",
      label: `Modo ${preferences.modelMode} (${modeDelta} confianza)`,
      points: Math.abs(modeDelta),
    });
  }
  if (scenarioDelta < 0) {
    penalties.push({
      id: `user_scenario_${preferences.scenario}`,
      label: `Escenario ${preferences.scenario} (${scenarioDelta} confianza)`,
      points: Math.abs(scenarioDelta),
    });
  }

  const stakeUnits = computeStakeUnits(adjustedScore);
  const hint = preferenceAdjustmentHint(baseScore, adjustedScore, preferences);
  const rationaleSuffix = ` Ajuste activo: ${preferences.modelMode}, escenario ${preferences.scenario} (${hint}).`;

  return {
    ...analysis,
    confidence: {
      score: adjustedScore,
      baseScore,
      adjustments: {
        modelMode: preferences.modelMode,
        scenario: preferences.scenario,
        modeDelta,
        scenarioDelta,
        totalDelta,
        hint,
      },
      penalties,
    },
    recommendation: {
      ...analysis.recommendation,
      stakeUnits: analysis.recommendation.stakeUnits > 0 ? Math.min(analysis.recommendation.stakeUnits, stakeUnits) : stakeUnits,
      rationale: `${analysis.recommendation.rationale}${rationaleSuffix}`,
    },
  };
}
