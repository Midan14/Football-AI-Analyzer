import type { FixtureMarket } from "@/shared/domain";

/**
 * Kelly Criterion — Optimal stake sizing based on edge and bankroll.
 *
 * Full Kelly: f* = (bp - q) / b
 * where b = decimal odds - 1, p = model probability, q = 1 - p
 *
 * We use Fractional Kelly (25%) because:
 * - Full Kelly is too aggressive for football (high variance)
 * - Model probabilities have estimation error
 * - Bankroll preservation is priority
 *
 * Also implements:
 * - Confidence-adjusted Kelly (reduces stake when model confidence is low)
 * - Multi-bet Kelly (for parlays/accumulators)
 * - Maximum stake cap (never risk more than 1% of bankroll)
 */

export type KellyResult = {
  market: string;
  modelProbability: number;
  bookmakerOdds: number;
  edge: number;
  fullKelly: number;       // % of bankroll (full Kelly)
  fractionalKelly: number; // % of bankroll (adjusted)
  stakeUnits: number;      // Units to bet (1 unit = 1% bankroll)
  expectedValue: number;   // Expected profit per unit staked
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
};

export type KellyPortfolio = {
  bets: KellyResult[];
  totalExposure: number;   // Total % of bankroll at risk
  expectedROI: number;     // Expected return on total stake
  maxDrawdown: number;     // Worst-case loss estimate
  sharpeRatio: number;     // Risk-adjusted return
};

const MAX_STAKE_PCT = 1.0;    // Never bet more than 1% of bankroll
const KELLY_FRACTION = 0.25;  // Use 25% of full Kelly for real-money safety
const MIN_EDGE_TO_BET = 3.0;  // Minimum edge % to consider betting

/**
 * Calculate Kelly stake for a single bet.
 */
export function kellyStake(
  modelProbability: number, // 0-100
  bookmakerOdds: number,   // Decimal odds (e.g., 2.50)
  confidence: number,       // Model confidence 0-100
  market: string
): KellyResult {
  const p = modelProbability / 100;
  const q = 1 - p;
  const b = bookmakerOdds - 1; // Net odds

  // Edge = expected value per unit
  const ev = (p * b) - q;
  const edge = (modelProbability - (100 / bookmakerOdds));

  // Full Kelly fraction
  const fullKelly = b > 0 ? Math.max(0, (b * p - q) / b) * 100 : 0;

  // Confidence adjustment: reduce Kelly when model is uncertain
  const confidenceMultiplier = Math.max(0.3, confidence / 100);

  // Fractional Kelly with confidence adjustment
  let fractional = fullKelly * KELLY_FRACTION * confidenceMultiplier;

  // Cap at maximum stake
  fractional = Math.min(MAX_STAKE_PCT, fractional);

  // Don't bet if edge is too small
  if (edge < MIN_EDGE_TO_BET || fractional < 0.1) {
    fractional = 0;
  }

  // Convert to units (1 unit = 1% of bankroll)
  const stakeUnits = Math.round(fractional * 10) / 10;

  // Risk level
  const riskLevel: "low" | "medium" | "high" =
    fractional > 3 ? "high" :
    fractional > 1.5 ? "medium" : "low";

  // Recommendation
  let recommendation: string;
  if (fractional === 0) {
    recommendation = edge < 0
      ? "No apostar: el mercado tiene mejor precio que el modelo."
      : "Edge insuficiente para justificar apuesta.";
  } else if (riskLevel === "low") {
    recommendation = `Apuesta conservadora: ${stakeUnits}u. Edge moderado, buen valor a largo plazo.`;
  } else if (riskLevel === "medium") {
    recommendation = `Apuesta estándar: ${stakeUnits}u. Edge sólido con buena relación riesgo/recompensa.`;
  } else {
    recommendation = `Apuesta agresiva: ${stakeUnits}u. Edge alto pero verificar alineaciones antes.`;
  }

  return {
    market,
    modelProbability,
    bookmakerOdds,
    edge: Math.round(edge * 10) / 10,
    fullKelly: Math.round(fullKelly * 100) / 100,
    fractionalKelly: Math.round(fractional * 100) / 100,
    stakeUnits,
    expectedValue: Math.round(ev * 1000) / 1000,
    riskLevel,
    recommendation,
  };
}

/**
 * Build a Kelly portfolio from multiple value bets.
 * Ensures total exposure doesn't exceed safe limits.
 */
export function kellyPortfolio(
  valueTable: Array<{ market: string; modelProbability: number; edge: number }>,
  fixture: { market: FixtureMarket },
  confidence: number
): KellyPortfolio {
  // Map market names to odds — ALL markets from buildValueTable must be here
  const oddsMap: Record<string, number> = {
    "Local gana": fixture.market.homeWinOdds ?? 0,
    "Empate": fixture.market.drawOdds ?? 0,
    "Visitante gana": fixture.market.awayWinOdds ?? 0,
    "Doble Chance 1X": fixture.market.dc1xOdds ?? 0,
    "Doble Chance X2": fixture.market.dcx2Odds ?? 0,
    "Doble Chance 12": fixture.market.dc12Odds ?? 0,
    "Over 1.5": fixture.market.over15Odds ?? 0,
    "Over 2.5": fixture.market.over25Odds ?? 0,
    "Over 3.5": fixture.market.over35Odds ?? 0,
    "Under 1.5": fixture.market.under15Odds ?? 0,
    "Under 2.5": fixture.market.under25Odds ?? 0,
    "Under 3.5": fixture.market.under35Odds ?? 0,
    "BTTS Sí": fixture.market.bttsYesOdds ?? 0,
    "BTTS No": fixture.market.bttsNoOdds ?? 0,
    "AH Local -1": fixture.market.ahHomeMinus1 ?? 0,
    "AH Visitante +1": fixture.market.ahAwayPlus1 ?? 0,
  };

  const bets: KellyResult[] = [];

  for (const row of valueTable) {
    const odds = oddsMap[row.market] ?? (100 / row.modelProbability);
    if (odds <= 1.01 || row.edge < MIN_EDGE_TO_BET) continue;

    const result = kellyStake(row.modelProbability, odds, confidence, row.market);
    if (result.stakeUnits > 0) {
      bets.push(result);
    }
  }

  // Sort by expected value
  bets.sort((a, b) => b.expectedValue - a.expectedValue);

  // Cap total exposure at 3% of bankroll
  let totalExposure = 0;
  const cappedBets: KellyResult[] = [];
  for (const bet of bets) {
    if (totalExposure + bet.fractionalKelly > 3) break;
    cappedBets.push(bet);
    totalExposure += bet.fractionalKelly;
  }

  // Portfolio metrics
  const expectedROI = cappedBets.length > 0
    ? cappedBets.reduce((sum, b) => sum + b.expectedValue * b.fractionalKelly, 0) / totalExposure
    : 0;

  const maxDrawdown = totalExposure; // Worst case: lose all bets

  const sharpeRatio = maxDrawdown > 0
    ? Math.round((expectedROI / (maxDrawdown / 100)) * 100) / 100
    : 0;

  return {
    bets: cappedBets,
    totalExposure: Math.round(totalExposure * 100) / 100,
    expectedROI: Math.round(expectedROI * 1000) / 1000,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio,
  };
}
