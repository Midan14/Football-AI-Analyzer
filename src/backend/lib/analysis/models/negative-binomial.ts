/**
 * Negative Binomial Model — Better than Poisson for high-variance matches.
 * Poisson assumes mean = variance, but football often has overdispersion
 * (variance > mean) due to red cards, penalties, tactical collapses.
 *
 * Uses the NB2 parameterization: P(X=k) = C(k+r-1, k) * p^r * (1-p)^k
 * where r = mean^2 / (variance - mean), p = mean / variance
 */

import type { Fixture } from "@/shared/domain";

export type NegBinomResult = {
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  under25: number;
  btts: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  overdispersion: number; // How much variance exceeds Poisson assumption
};

function negBinomPMF(k: number, r: number, p: number): number {
  // P(X=k) = C(k+r-1, k) * p^r * (1-p)^k
  // Using log-gamma for numerical stability
  const logCoeff = logGamma(k + r) - logGamma(k + 1) - logGamma(r);
  return Math.exp(logCoeff + r * Math.log(p) + k * Math.log(1 - p));
}

function logGamma(z: number): number {
  // Stirling's approximation for log(Gamma(z))
  if (z <= 0) return 0;
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  const coeffs = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = 1.000000000190015;
  for (let i = 0; i < 6; i++) {
    x += coeffs[i] / (z + i + 1);
  }
  const t = z + 5.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Estimate overdispersion from team's goal-scoring pattern.
 * Higher values = more unpredictable (more blowouts AND more 0-0s).
 */
function estimateOverdispersion(fixture: Fixture, side: "home" | "away"): number {
  const team = side === "home" ? fixture.home : fixture.away;
  const matches = team.matchesPlayed || 18;
  const avgGoals = team.goalsFor / matches;

  // Factors that increase overdispersion:
  let dispersion = 1.15; // Base: slightly overdispersed vs Poisson

  // Low-division matches are more volatile
  if (fixture.context.lowDivision) dispersion += 0.25;

  // Teams with extreme form (all W or all L) tend to be more predictable
  const formVariance = team.form.reduce((sum, r) => {
    const pts = r === "W" ? 3 : r === "D" ? 1 : 0;
    return sum + (pts - 1.5) ** 2;
  }, 0) / Math.max(1, team.form.length);
  dispersion += formVariance * 0.05;

  // High-scoring teams have more variance
  if (avgGoals > 2.0) dispersion += 0.15;

  // Derby/rivalry matches are more unpredictable
  if (fixture.context.derby || fixture.context.rivalRivalry) dispersion += 0.2;

  // Relegation pressure increases variance
  if (fixture.context.relegationRisk > 30) dispersion += 0.15;

  return Math.max(1.05, Math.min(2.5, dispersion));
}

export function negBinomModel(fixture: Fixture, xgHome: number, xgAway: number): NegBinomResult {
  const homeDisp = estimateOverdispersion(fixture, "home");
  const awayDisp = estimateOverdispersion(fixture, "away");

  // NB2 parameters: variance = mean + mean^2/r → r = mean^2 / (variance - mean)
  // variance = mean * dispersion → r = mean / (dispersion - 1)
  const rHome = Math.max(0.5, xgHome / (homeDisp - 1));
  const rAway = Math.max(0.5, xgAway / (awayDisp - 1));
  const pHome = rHome / (rHome + xgHome);
  const pAway = rAway / (rAway + xgAway);

  // Build probability matrix (0-7 goals each)
  const maxGoals = 8;
  let homeWin = 0, draw = 0, awayWin = 0;
  let over25 = 0, btts = 0;

  for (let h = 0; h < maxGoals; h++) {
    const pH = negBinomPMF(h, rHome, pHome);
    for (let a = 0; a < maxGoals; a++) {
      const pA = negBinomPMF(a, rAway, pAway);
      const joint = pH * pA;

      if (h > a) homeWin += joint;
      else if (h === a) draw += joint;
      else awayWin += joint;

      if (h + a >= 3) over25 += joint;
      if (h > 0 && a > 0) btts += joint;
    }
  }

  // Normalize
  const total = homeWin + draw + awayWin;
  homeWin = (homeWin / total) * 100;
  draw = (draw / total) * 100;
  awayWin = (awayWin / total) * 100;
  over25 = over25 * 100;
  btts = btts * 100;

  return {
    homeWin: Math.round(homeWin * 10) / 10,
    draw: Math.round(draw * 10) / 10,
    awayWin: Math.round(awayWin * 10) / 10,
    over25: Math.round(over25 * 10) / 10,
    under25: Math.round((100 - over25) * 10) / 10,
    btts: Math.round(btts * 10) / 10,
    expectedHomeGoals: xgHome,
    expectedAwayGoals: xgAway,
    overdispersion: (homeDisp + awayDisp) / 2,
  };
}
