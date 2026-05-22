/** Model mode + scenario shared by API and UI. */

export const ANALYSIS_MODEL_MODES = ["Conservador", "Balanceado", "Agresivo"] as const;
export type AnalysisModelMode = (typeof ANALYSIS_MODEL_MODES)[number];

export const ANALYSIS_SCENARIO_IDS = ["base", "lineups", "rotation", "weather"] as const;
export type AnalysisScenarioId = (typeof ANALYSIS_SCENARIO_IDS)[number];

export type AnalysisPreferences = {
  modelMode: AnalysisModelMode;
  scenario: AnalysisScenarioId;
};

export const DEFAULT_ANALYSIS_PREFERENCES: AnalysisPreferences = {
  modelMode: "Balanceado",
  scenario: "base",
};

const SCENARIO_DELTA: Record<AnalysisScenarioId, number> = {
  base: 0,
  lineups: 4,
  rotation: -9,
  weather: -5,
};

const MODE_DELTA: Record<AnalysisModelMode, number> = {
  Conservador: -3,
  Balanceado: 0,
  Agresivo: 2,
};

const SCENARIO_LABELS: Record<AnalysisScenarioId, string> = {
  base: "Base",
  lineups: "Once confirmado",
  rotation: "Rotación probable",
  weather: "Clima adverso",
};

export function parseModelMode(value: string | null | undefined): AnalysisModelMode {
  if (value && (ANALYSIS_MODEL_MODES as readonly string[]).includes(value)) {
    return value as AnalysisModelMode;
  }
  return "Balanceado";
}

export function parseScenarioId(value: string | null | undefined): AnalysisScenarioId {
  if (value && (ANALYSIS_SCENARIO_IDS as readonly string[]).includes(value)) {
    return value as AnalysisScenarioId;
  }
  return "base";
}

export function normalizeAnalysisPreferences(
  input?: Partial<AnalysisPreferences> | null
): AnalysisPreferences {
  return {
    modelMode: parseModelMode(input?.modelMode),
    scenario: parseScenarioId(input?.scenario),
  };
}

export function getPreferenceDeltas(preferences: AnalysisPreferences): {
  modeDelta: number;
  scenarioDelta: number;
  totalDelta: number;
} {
  const modeDelta = MODE_DELTA[preferences.modelMode];
  const scenarioDelta = SCENARIO_DELTA[preferences.scenario];
  return { modeDelta, scenarioDelta, totalDelta: modeDelta + scenarioDelta };
}

export function clampConfidenceScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function applyPreferenceDelta(baseScore: number, preferences: AnalysisPreferences): number {
  const { totalDelta } = getPreferenceDeltas(preferences);
  return clampConfidenceScore(baseScore + totalDelta);
}

/** Maps UI/API model mode to Prisma `ModelMode` enum values. */
export function analysisModelModeToPrisma(
  mode: AnalysisModelMode
): "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE" {
  switch (mode) {
    case "Conservador":
      return "CONSERVATIVE";
    case "Agresivo":
      return "AGGRESSIVE";
    default:
      return "BALANCED";
  }
}

export function preferenceAdjustmentHint(
  baseScore: number,
  adjustedScore: number,
  preferences: AnalysisPreferences
): string {
  const { modeDelta, scenarioDelta, totalDelta } = getPreferenceDeltas(preferences);
  if (totalDelta === 0) {
    return "Confianza del motor sin ajuste por modo o escenario.";
  }
  const parts: string[] = [];
  if (modeDelta !== 0) parts.push(`modo ${preferences.modelMode}`);
  if (preferences.scenario !== "base") {
    parts.push(`escenario ${SCENARIO_LABELS[preferences.scenario]}`);
  }
  return `Motor ${baseScore}% → ${adjustedScore}% (${parts.join(", ")}; Δ ${totalDelta >= 0 ? "+" : ""}${totalDelta})`;
}
