/**
 * Risk policy: the single source of truth for how confidence and stake
 * are derived from penalties. Both analysis-engine and deep-analysis-engine
 * MUST go through this module. Do not re-derive these formulas elsewhere.
 *
 * Phase 1B (consolidation) + critical-rules pass:
 *   - Sample-size cap: <30 matches → confidence cap 70.
 *   - Market divergence: |model - market| >15% → -20 points.
 *   - Low-division automatic 30% confidence cut.
 *   - Cross-divisional underdog adjustment.
 *   - Heavy-tail black-swan floor (8%).
 *
 * See docs/engine-roadmap.md (Phase 1B).
 */

import type { Fixture } from "@/shared/domain";

export type Penalty = { id: string; label: string; points: number };
export type Severity = "low" | "medium" | "high";

export type RiskPolicy = {
  baseConfidence: number;
  confidenceFloor: number;
  stakeBands: ReadonlyArray<{ minScore: number; units: number }>;
};

// Bands MUST be sorted descending by minScore. First match wins.
// Reconsider after Phase 3 surfaces hit-rate / ROI by confidence band.
export const DEFAULT_POLICY: RiskPolicy = {
  baseConfidence: 82,
  confidenceFloor: 30,
  stakeBands: [
    { minScore: 70, units: 1.0 },
    { minScore: 56, units: 0.75 },
    { minScore: 40, units: 0.5 },
    { minScore: 0, units: 0.25 },
  ],
};

/**
 * Hard ceilings that override the points-based confidence calculation.
 * A penalty can only subtract — these clamp from above when a structural
 * data quality issue makes any high-confidence claim irresponsible.
 */
export const CONFIDENCE_CAPS = {
  lowSampleMatches: 30,        // <30 matches played → cap at 70
  lowSampleMaxConfidence: 70,
  marketDivergencePct: 15,     // |model - market| > 15 → -12 points
  marketDivergencePenalty: 12,
  lowDivisionPct: 30,          // low-division: -15 points (reduced from 30)
  lowDivisionPenalty: 15,
  blackSwanFloorPct: 8,        // black-swan probability never drops below 8%
} as const;

export function computeConfidence(
  penalties: ReadonlyArray<Penalty>,
  policy: RiskPolicy = DEFAULT_POLICY
): number {
  const total = penalties.reduce((sum, p) => sum + p.points, 0);
  return Math.max(policy.confidenceFloor, policy.baseConfidence - total);
}

export function computeStakeUnits(
  confidenceScore: number,
  policy: RiskPolicy = DEFAULT_POLICY
): number {
  for (const band of policy.stakeBands) {
    if (confidenceScore >= band.minScore) return band.units;
  }
  return 0;
}

/**
 * Apply structural ceilings AFTER points-based confidence is computed.
 * Use this at the very end of the engine pipeline. Returns the final score.
 */
export function clampConfidenceForSample(
  computedScore: number,
  homeMatchesPlayed: number,
  awayMatchesPlayed: number
): number {
  const minMatches = Math.min(homeMatchesPlayed, awayMatchesPlayed);
  if (minMatches < CONFIDENCE_CAPS.lowSampleMatches) {
    return Math.min(computedScore, CONFIDENCE_CAPS.lowSampleMaxConfidence);
  }
  return computedScore;
}

/**
 * Floor for black-swan probability. The engine's heavy-tail computation
 * can yield 0 when no outliers are recorded — that's overconfident.
 * Enforces the 8-12% rule from the critical-instructions audit.
 */
export function floorBlackSwanProb(computed: number): number {
  return Math.max(CONFIDENCE_CAPS.blackSwanFloorPct, computed);
}

/**
 * Single source of truth for the penalty list. Both engines call this
 * instead of inlining their own checks. Mutates the `push` callback so
 * each engine controls how to surface penalties (with riskFlags or not).
 *
 * Order matters: penalties are listed deterministically for reproducibility.
 */
export function applyContextualPenalties(
  fixture: Fixture,
  modelHomeWinPct: number,
  marketHomeWinPct: number,
  push: (id: string, label: string, points: number, severity: Severity) => void
): void {
  // ── Data quality ──────────────────────────────────────────────────────
  if (fixture.coverage.tier === "low" || fixture.context.lowDivision) {
    push(
      "low_coverage_or_division",
      `Liga de baja cobertura/división: -${CONFIDENCE_CAPS.lowDivisionPenalty} pts`,
      CONFIDENCE_CAPS.lowDivisionPenalty,
      "medium"
    );
  }
  if (!fixture.coverage.hasLineups) push("missing_lineups", "Alineaciones no confirmadas", 5, "low");
  if (!fixture.coverage.hasXg) push("missing_xg", "xG no disponible; se usa proxy de goles", 4, "low");
  if (!fixture.coverage.hasOdds) push("missing_odds", "Mercado sin cuota confiable", 8, "medium");

  // ── Sample size ───────────────────────────────────────────────────────
  const minMatches = Math.min(fixture.home.matchesPlayed, fixture.away.matchesPlayed);
  if (minMatches < CONFIDENCE_CAPS.lowSampleMatches) {
    push(
      "low_sample",
      `Muestra insuficiente (${minMatches} partidos). Confianza limitada al ${CONFIDENCE_CAPS.lowSampleMaxConfidence}%`,
      0, // ceiling-based, not point-based; documented for transparency
      "medium"
    );
  }

  // ── Context ───────────────────────────────────────────────────────────
  if (fixture.context.weatherRisk === "high") push("weather_risk", "Riesgo climático/logístico alto", 6, "medium");
  if (fixture.context.relegationRisk > 20) {
    push("relegation_pressure", `Riesgo de descenso elevado (${fixture.context.relegationRisk}%)`, 8, "medium");
  }
  if (fixture.away.travelKm > 800) {
    push("travel_fatigue", `Viaje visitante extenso (${fixture.away.travelKm}km)`, 5, "low");
  }

  // ── Squad ─────────────────────────────────────────────────────────────
  if (fixture.home.keyPlayerStatus !== "available") {
    push("home_key_player", `Jugador clave local ${fixture.home.keyPlayerStatus}: ${fixture.home.keyPlayer}`, 5, "medium");
  }
  if (fixture.away.keyPlayerStatus !== "available") {
    push("away_key_player", `Jugador clave visitante ${fixture.away.keyPlayerStatus}: ${fixture.away.keyPlayer}`, 4, "low");
  }
  const homeInjCount = fixture.squad?.home.injuries.length ?? 0;
  const awayInjCount = fixture.squad?.away.injuries.length ?? 0;
  if (homeInjCount > 0) push("home_injuries", `Bajas locales (${homeInjCount})`, Math.min(8, homeInjCount * 2), "medium");
  if (awayInjCount > 0) push("away_injuries", `Bajas visitantes (${awayInjCount})`, Math.min(6, awayInjCount * 2), "low");

  // ── Referee ───────────────────────────────────────────────────────────
  if ((fixture.referee?.controversyHistory?.length ?? 0) >= 2) {
    push("referee_controversy", "Árbitro con historial polémico reciente", 6, "medium");
  }

  // ── Market divergence ─────────────────────────────────────────────────
  const divergence = Math.abs(modelHomeWinPct - marketHomeWinPct);
  if (divergence > CONFIDENCE_CAPS.marketDivergencePct) {
    push(
      "market_divergence_15",
      `Divergencia modelo vs mercado >${CONFIDENCE_CAPS.marketDivergencePct}% (${divergence.toFixed(1)}%) — ${CONFIDENCE_CAPS.marketDivergencePenalty}pts`,
      CONFIDENCE_CAPS.marketDivergencePenalty,
      "high"
    );
  } else if (divergence > 10) {
    push(
      "market_divergence_10",
      `Divergencia modelo vs mercado >10% (${divergence.toFixed(1)}%) — investigar causa`,
      6,
      "medium"
    );
  }
}
