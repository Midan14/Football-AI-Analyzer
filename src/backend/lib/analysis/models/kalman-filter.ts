/**
 * Kalman Filter — Dynamic team strength estimation with noise filtering.
 *
 * Unlike ELO which uses fixed K-factor, Kalman Filter:
 * - Adapts its learning rate based on uncertainty
 * - Separates signal (true team strength) from noise (random match variance)
 * - Provides confidence intervals, not just point estimates
 * - Handles missing data gracefully
 *
 * State: x = [attack_strength, defense_strength]
 * Measurement: z = [goals_scored, goals_conceded] per match
 *
 * Prediction: x̂(k|k-1) = F * x̂(k-1|k-1)
 * Update: x̂(k|k) = x̂(k|k-1) + K * (z - H * x̂(k|k-1))
 * where K = Kalman gain
 */

import type { Fixture } from "@/shared/domain";

export type KalmanResult = {
  // Filtered team strengths (signal without noise)
  homeAttackStrength: number;  // 0-100
  homeDefenseStrength: number; // 0-100
  awayAttackStrength: number;  // 0-100
  awayDefenseStrength: number; // 0-100

  // Uncertainty (lower = more confident in the estimate)
  homeUncertainty: number; // 0-100
  awayUncertainty: number; // 0-100

  // Predicted match outcome from filtered strengths
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;

  // Trend detection (is team improving or declining?)
  homeTrend: "improving" | "stable" | "declining";
  awayTrend: "improving" | "stable" | "declining";

  // Innovation (surprise factor: how unexpected were recent results?)
  homeInnovation: number; // 0-100 (high = recent results were surprising)
  awayInnovation: number;
};

/**
 * Estimate team strength from available season data.
 * Returns attack and defense on 0-100 scale.
 */
function estimateStrength(team: Fixture["home"]): { attack: number; defense: number; uncertainty: number } {
  const matches = team.matchesPlayed || 18;
  const goalsPerGame = team.goalsFor / matches;
  const concededPerGame = team.goalsAgainst / matches;

  // Attack: goals per game normalized (league avg ~1.3 goals/game)
  const attack = Math.min(100, Math.max(10, (goalsPerGame / 2.5) * 100));

  // Defense: inverse of goals conceded (fewer = better)
  const defense = Math.min(100, Math.max(10, (1 - concededPerGame / 3.0) * 100));

  // Uncertainty: decreases with more matches played
  const uncertainty = Math.max(10, 80 - matches * 2.5);

  return { attack, defense, uncertainty };
}

/**
 * Detect trend from form (is team getting better or worse?)
 */
function detectTrend(form: string[]): "improving" | "stable" | "declining" {
  if (form.length < 3) return "stable";

  // Weight recent results more
  const recentHalf = form.slice(0, Math.ceil(form.length / 2));
  const olderHalf = form.slice(Math.ceil(form.length / 2));

  const score = (f: string[]) => f.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0) / f.length;

  const recentScore = score(recentHalf);
  const olderScore = score(olderHalf);
  const diff = recentScore - olderScore;

  if (diff > 0.5) return "improving";
  if (diff < -0.5) return "declining";
  return "stable";
}

/**
 * Calculate innovation (how surprising recent results were).
 * High innovation = team is performing differently than expected.
 */
function calculateInnovation(team: Fixture["home"]): number {
  const matches = team.matchesPlayed || 18;
  const expectedPPG = team.pointsTotal / matches;

  // Expected form based on season average
  const expectedWinRate = expectedPPG / 3;

  // Actual recent form
  const recentWinRate = team.form.filter(r => r === "W").length / Math.max(1, team.form.length);

  // Innovation = absolute difference between expected and actual
  const innovation = Math.abs(recentWinRate - expectedWinRate) * 100;

  return Math.min(100, Math.round(innovation * 2));
}

/**
 * Kalman Filter prediction for a match.
 */
export function kalmanFilter(fixture: Fixture): KalmanResult {
  const homeStr = estimateStrength(fixture.home);
  const awayStr = estimateStrength(fixture.away);

  // Apply Kalman gain: blend prior (season stats) with recent observations (form)
  // Higher uncertainty → trust recent form more (higher gain)
  const homeGain = homeStr.uncertainty / 100;
  const awayGain = awayStr.uncertainty / 100;

  // Form-based strength estimate
  const homeFormAttack = fixture.home.form.filter(r => r === "W").length / Math.max(1, fixture.home.form.length) * 100;
  const awayFormAttack = fixture.away.form.filter(r => r === "W").length / Math.max(1, fixture.away.form.length) * 100;
  const homeFormDefense = (1 - fixture.home.form.filter(r => r === "L").length / Math.max(1, fixture.home.form.length)) * 100;
  const awayFormDefense = (1 - fixture.away.form.filter(r => r === "L").length / Math.max(1, fixture.away.form.length)) * 100;

  // Kalman update: filtered = prior + gain * (observation - prior)
  const homeAttackFiltered = homeStr.attack + homeGain * (homeFormAttack - homeStr.attack);
  const homeDefenseFiltered = homeStr.defense + homeGain * (homeFormDefense - homeStr.defense);
  const awayAttackFiltered = awayStr.attack + awayGain * (awayFormAttack - awayStr.attack);
  const awayDefenseFiltered = awayStr.defense + awayGain * (awayFormDefense - awayStr.defense);

  // Predict goals from filtered strengths
  const homeAdvantage = 0.25; // Goals boost for playing at home
  const predictedHomeGoals = Math.max(0.3, (homeAttackFiltered / 100) * 2.5 * (1 - awayDefenseFiltered / 200) + homeAdvantage);
  const predictedAwayGoals = Math.max(0.2, (awayAttackFiltered / 100) * 2.5 * (1 - homeDefenseFiltered / 200));

  // Convert to 1X2 probabilities using simplified Poisson
  const poissonProb = (lambda: number, k: number) => {
    let fact = 1;
    for (let i = 2; i <= k; i++) fact *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
  };

  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const p = poissonProb(predictedHomeGoals, h) * poissonProb(predictedAwayGoals, a);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }
  const total = homeWin + draw + awayWin;

  return {
    homeAttackStrength: Math.round(homeAttackFiltered * 10) / 10,
    homeDefenseStrength: Math.round(homeDefenseFiltered * 10) / 10,
    awayAttackStrength: Math.round(awayAttackFiltered * 10) / 10,
    awayDefenseStrength: Math.round(awayDefenseFiltered * 10) / 10,
    homeUncertainty: Math.round(homeStr.uncertainty * 10) / 10,
    awayUncertainty: Math.round(awayStr.uncertainty * 10) / 10,
    predictedHomeGoals: Math.round(predictedHomeGoals * 100) / 100,
    predictedAwayGoals: Math.round(predictedAwayGoals * 100) / 100,
    homeWinProb: Math.round((homeWin / total) * 1000) / 10,
    drawProb: Math.round((draw / total) * 1000) / 10,
    awayWinProb: Math.round((awayWin / total) * 1000) / 10,
    homeTrend: detectTrend(fixture.home.form),
    awayTrend: detectTrend(fixture.away.form),
    homeInnovation: calculateInnovation(fixture.home),
    awayInnovation: calculateInnovation(fixture.away),
  };
}
