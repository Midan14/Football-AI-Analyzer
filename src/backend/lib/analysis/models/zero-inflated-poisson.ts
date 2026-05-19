/**
 * Zero-Inflated Poisson (ZIP) Model — For defensive/low-scoring matches.
 *
 * Standard Poisson underestimates 0-0 draws because it doesn't account for
 * "structural zeros" — matches where teams deliberately play for 0-0
 * (e.g., away teams parking the bus, dead rubbers, tactical draws).
 *
 * ZIP adds a zero-inflation parameter π:
 * P(X=0) = π + (1-π) * e^(-λ)
 * P(X=k) = (1-π) * (e^(-λ) * λ^k / k!)  for k > 0
 *
 * π is estimated from:
 * - Team defensive style (low xG conceded)
 * - Away team travel fatigue
 * - Match importance (dead rubber = more conservative)
 * - Historical 0-0 rate in the league
 */

import type { Fixture } from "@/shared/domain";

export type ZIPResult = {
  // Adjusted probabilities
  homeWin: number;
  draw: number;
  awayWin: number;
  prob00: number; // Probability of 0-0 specifically
  over25: number;
  under15: number;
  btts: number;
  // Zero-inflation parameters
  piHome: number; // Zero-inflation for home goals (probability of structural zero)
  piAway: number; // Zero-inflation for away goals
  // Comparison with standard Poisson
  poissonDraw: number;
  zipDraw: number;
  drawAdjustment: number; // How much ZIP increases draw probability
};

function poisson(lambda: number, k: number): number {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial;
}

/**
 * Estimate zero-inflation parameter from context.
 * Higher π = more likely to score 0 goals regardless of xG.
 */
function estimateZeroInflation(fixture: Fixture, side: "home" | "away"): number {
  const team = side === "home" ? fixture.home : fixture.away;
  const opponent = side === "home" ? fixture.away : fixture.home;
  const matches = team.matchesPlayed || 18;

  let pi = 0.05; // Base: 5% chance of structural zero

  // Strong defensive opponent increases zero-inflation
  const oppDefense = opponent.goalsAgainst / (opponent.matchesPlayed || 18);
  if (oppDefense < 0.8) pi += 0.08; // Very tight defense
  else if (oppDefense < 1.0) pi += 0.04;

  // Away teams are more likely to fail to score
  if (side === "away") {
    pi += 0.06;
    // Long travel increases fatigue → more likely to blank
    if (fixture.away.travelKm > 500) pi += 0.03;
    if (fixture.away.travelKm > 1000) pi += 0.03;
  }

  // Low-scoring team historically
  const avgGoals = team.goalsFor / matches;
  if (avgGoals < 1.0) pi += 0.08;
  else if (avgGoals < 1.3) pi += 0.04;

  // Dead rubber / low motivation → more conservative play
  if (team.motivation < 40) pi += 0.05;

  // Key player missing → harder to score
  if (team.keyPlayerStatus === "injured" || team.keyPlayerStatus === "suspended") {
    pi += 0.05;
  }

  // Recent form: many losses → team might park the bus
  const losses = team.form.filter(r => r === "L").length;
  if (losses >= 3) pi += 0.04;

  // Low division: more unpredictable, more 0-0s
  if (fixture.context.lowDivision) pi += 0.04;

  return Math.min(0.35, pi); // Cap at 35%
}

export function zipModel(fixture: Fixture, xgHome: number, xgAway: number): ZIPResult {
  const piHome = estimateZeroInflation(fixture, "home");
  const piAway = estimateZeroInflation(fixture, "away");

  // Build ZIP probability matrix
  const maxGoals = 7;
  let homeWin = 0, draw = 0, awayWin = 0;
  let prob00 = 0, over25 = 0, under15 = 0, btts = 0;
  let poissonDraw = 0;

  for (let h = 0; h <= maxGoals; h++) {
    // ZIP probability for home goals
    const pHome = h === 0
      ? piHome + (1 - piHome) * poisson(xgHome, 0)
      : (1 - piHome) * poisson(xgHome, h);

    for (let a = 0; a <= maxGoals; a++) {
      // ZIP probability for away goals
      const pAway = a === 0
        ? piAway + (1 - piAway) * poisson(xgAway, 0)
        : (1 - piAway) * poisson(xgAway, a);

      const joint = pHome * pAway;

      // Standard Poisson for comparison
      const poissonJoint = poisson(xgHome, h) * poisson(xgAway, a);
      if (h === a) poissonDraw += poissonJoint;

      if (h > a) homeWin += joint;
      else if (h === a) draw += joint;
      else awayWin += joint;

      if (h === 0 && a === 0) prob00 = joint;
      if (h + a >= 3) over25 += joint;
      if (h + a <= 1) under15 += joint;
      if (h > 0 && a > 0) btts += joint;
    }
  }

  // Normalize
  const total = homeWin + draw + awayWin;

  return {
    homeWin: Math.round((homeWin / total) * 1000) / 10,
    draw: Math.round((draw / total) * 1000) / 10,
    awayWin: Math.round((awayWin / total) * 1000) / 10,
    prob00: Math.round(prob00 * 1000) / 10,
    over25: Math.round(over25 * 1000) / 10,
    under15: Math.round(under15 * 1000) / 10,
    btts: Math.round(btts * 1000) / 10,
    piHome: Math.round(piHome * 1000) / 10,
    piAway: Math.round(piAway * 1000) / 10,
    poissonDraw: Math.round(poissonDraw * 1000) / 10,
    zipDraw: Math.round((draw / total) * 1000) / 10,
    drawAdjustment: Math.round(((draw / total) - poissonDraw) * 1000) / 10,
  };
}
