export const CONFIDENCE_THRESHOLDS = {
  bet: 72,
  caution: 58,
} as const;

export type ConfidenceDecision = "APOSTAR" | "PRECAUCION" | "NO_APOSTAR";
export type ConfidenceRisk = "BAJO" | "MODERADO" | "ALTO";

export function riskLevelFromConfidence(score: number): ConfidenceRisk {
  if (score >= CONFIDENCE_THRESHOLDS.bet) return "BAJO";
  if (score >= CONFIDENCE_THRESHOLDS.caution) return "MODERADO";
  return "ALTO";
}

export function decisionFromConfidence(score: number): ConfidenceDecision {
  if (score >= CONFIDENCE_THRESHOLDS.bet) return "APOSTAR";
  if (score >= CONFIDENCE_THRESHOLDS.caution) return "PRECAUCION";
  return "NO_APOSTAR";
}
