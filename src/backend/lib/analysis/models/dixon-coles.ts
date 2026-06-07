/**
 * Dixon-Coles Correction — Fixes Poisson underestimation of low scores.
 *
 * Standard Poisson underestimates 0-0, 1-0, 0-1, and 1-1 results because
 * it assumes independence between home and away goals. In reality, these
 * scores are correlated (defensive matches produce more 0-0s than Poisson predicts).
 *
 * Dixon-Coles applies a correction factor τ(x,y,λ,μ,ρ) to the joint probability:
 * P(X=x, Y=y) = τ(x,y,λ,μ,ρ) × P_poisson(X=x|λ) × P_poisson(Y=y|μ)
 *
 * Where ρ (rho) is the correlation parameter:
 * - ρ < 0: fewer low-scoring draws than Poisson predicts (attacking teams)
 * - ρ > 0: more low-scoring draws (defensive teams)
 * - ρ = 0: standard Poisson (no correction)
 */

import type { Fixture } from "@/shared/domain";

export type DixonColesResult = {
  // Corrected probabilities
  homeWin: number;
  draw: number;
  awayWin: number;
  // Specific corrections
  prob00: number; // Corrected 0-0 probability
  prob10: number; // Corrected 1-0
  prob01: number; // Corrected 0-1
  prob11: number; // Corrected 1-1
  // Rho parameter
  rho: number;
  // How much the correction changed vs standard Poisson
  correction00: number; // % change in 0-0 probability
  correction11: number; // % change in 1-1 probability
};

function poisson(lambda: number, k: number): number {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial;
}

/**
 * Dixon-Coles tau correction factor.
 * Only applies to scores 0-0, 1-0, 0-1, 1-1.
 */
function tau(x: number, y: number, lambda: number, mu: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1; // No correction for other scores
}

/**
 * Estimate rho from team characteristics.
 * Defensive teams → positive rho (more 0-0s)
 * Attacking teams → negative rho (fewer 0-0s)
 */
function estimateRho(fixture: Fixture, xgHome: number, xgAway: number): number {
  const totalXg = xgHome + xgAway;

  // Base rho: slightly negative (football tends to have fewer 0-0s than Poisson predicts)
  let rho = -0.03;

  // Very defensive matchup → positive rho
  if (totalXg < 1.8) rho += 0.08;
  else if (totalXg < 2.2) rho += 0.04;

  // Very attacking matchup → more negative rho
  if (totalXg > 3.5) rho -= 0.06;
  else if (totalXg > 3.0) rho -= 0.03;

  // Low division: more unpredictable, rho closer to 0
  if (fixture.context.lowDivision) rho *= 0.5;

  // Derby/rivalry: more defensive → positive rho
  if (fixture.context.derby || fixture.context.rivalRivalry) rho += 0.04;

  // Must-win situations: more attacking → negative rho
  if (fixture.context.mustWinHome || fixture.context.mustWinAway) rho -= 0.03;

  // Clamp to valid range
  return Math.max(-0.15, Math.min(0.15, rho));
}

export function dixonColesModel(fixture: Fixture, xgHome: number, xgAway: number): DixonColesResult {
  const rho = estimateRho(fixture, xgHome, xgAway);

  // Calculate corrected probabilities
  let homeWin = 0, draw = 0, awayWin = 0;
  const maxGoals = 8;

  // Store specific low-score probabilities
  let prob00 = 0, prob10 = 0, prob01 = 0, prob11 = 0;
  let poissonProb00 = 0, poissonProb11 = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const pHome = poisson(xgHome, h);
      const pAway = poisson(xgAway, a);
      const correction = tau(h, a, xgHome, xgAway, rho);
      const joint = pHome * pAway * correction;

      if (h > a) homeWin += joint;
      else if (h === a) draw += joint;
      else awayWin += joint;

      if (h === 0 && a === 0) { prob00 = joint; poissonProb00 = pHome * pAway; }
      if (h === 1 && a === 0) prob10 = joint;
      if (h === 0 && a === 1) prob01 = joint;
      if (h === 1 && a === 1) { prob11 = joint; poissonProb11 = pHome * pAway; }
    }
  }

  // Normalize
  const total = homeWin + draw + awayWin;

  return {
    homeWin: Math.round((homeWin / total) * 1000) / 10,
    draw: Math.round((draw / total) * 1000) / 10,
    awayWin: Math.round((awayWin / total) * 1000) / 10,
    prob00: Math.round(prob00 * 1000) / 10,
    prob10: Math.round(prob10 * 1000) / 10,
    prob01: Math.round(prob01 * 1000) / 10,
    prob11: Math.round(prob11 * 1000) / 10,
    rho,
    correction00: poissonProb00 > 0 ? Math.round(((prob00 - poissonProb00) / poissonProb00) * 1000) / 10 : 0,
    correction11: poissonProb11 > 0 ? Math.round(((prob11 - poissonProb11) / poissonProb11) * 1000) / 10 : 0,
  };
}
