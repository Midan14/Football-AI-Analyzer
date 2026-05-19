/**
 * Hawkes Process — Self-exciting point process for in-match events.
 *
 * Key insight: Goals breed goals. After a team scores, the probability
 * of another goal (by either team) increases temporarily due to:
 * - Losing team pushes forward (more open play)
 * - Winning team gains confidence (momentum)
 * - Tactical changes (substitutions, formation shifts)
 *
 * λ(t) = μ + Σ α * exp(-β * (t - t_i))
 * where:
 * - μ = base intensity (goals per minute)
 * - α = excitation (how much each event boosts intensity)
 * - β = decay (how quickly the boost fades)
 * - t_i = time of previous events
 *
 * Applications:
 * - Live betting: predict next goal probability
 * - Over/Under timing: when are goals most likely?
 * - Momentum detection: is a team about to score?
 */

import type { Fixture, MatchEvent } from "@/shared/domain";

export type HawkesResult = {
  // Current intensity (goals per minute) at different match phases
  intensity0_15: number;   // Opening phase
  intensity15_30: number;  // Mid first half
  intensity30_45: number;  // End first half
  intensity45_60: number;  // Start second half
  intensity60_75: number;  // Mid second half
  intensity75_90: number;  // Final push

  // Probability of next goal in next N minutes (from current state)
  nextGoalIn5min: number;
  nextGoalIn10min: number;
  nextGoalIn15min: number;

  // Momentum score (who is more likely to score next)
  homeMomentum: number; // 0-100
  awayMomentum: number; // 0-100

  // Expected total goals by end of match
  expectedTotalGoals: number;

  // Clustering coefficient (how much goals cluster together)
  clusteringCoeff: number;

  // Parameters used
  params: {
    baseIntensityHome: number;
    baseIntensityAway: number;
    excitation: number;
    decay: number;
  };
};

/**
 * Estimate Hawkes parameters from team characteristics.
 */
function estimateParams(fixture: Fixture, xgHome: number, xgAway: number) {
  // Base intensity: goals per minute
  const muHome = xgHome / 90;
  const muAway = xgAway / 90;

  // Excitation: how much a goal increases intensity
  // Higher for attacking teams, lower for defensive teams
  let alpha = 0.015; // Base: each goal adds 0.015 goals/min temporarily

  // Open, attacking teams have higher excitation
  const totalXg = xgHome + xgAway;
  if (totalXg > 3.0) alpha += 0.005;
  if (totalXg > 4.0) alpha += 0.005;

  // Derby/rivalry increases excitation (more emotional, more open)
  if (fixture.context.derby || fixture.context.rivalRivalry) alpha += 0.008;

  // Must-win situations increase excitation
  if (fixture.context.mustWinHome || fixture.context.mustWinAway) alpha += 0.005;

  // Decay: how quickly the boost fades (per minute)
  // Typical: boost lasts ~10-15 minutes
  let beta = 0.08; // Boost halves every ~9 minutes

  // Experienced teams recover composure faster
  if (fixture.coverage.tier === "elite") beta += 0.02;

  // Low division: slower recovery, more chaos
  if (fixture.context.lowDivision) beta -= 0.02;

  return {
    baseIntensityHome: muHome,
    baseIntensityAway: muAway,
    excitation: Math.max(0.005, alpha),
    decay: Math.max(0.03, beta),
  };
}

/**
 * Calculate intensity at time t given previous events.
 */
function intensityAtTime(
  t: number,
  events: Array<{ time: number }>,
  baseIntensity: number,
  alpha: number,
  beta: number
): number {
  let intensity = baseIntensity;

  for (const event of events) {
    if (event.time < t) {
      intensity += alpha * Math.exp(-beta * (t - event.time));
    }
  }

  return intensity;
}

/**
 * Run Hawkes process simulation for a match.
 * Can use real events (live match) or simulate from scratch (pre-match).
 */
export function hawkesModel(
  fixture: Fixture,
  xgHome: number,
  xgAway: number,
  liveEvents?: MatchEvent[]
): HawkesResult {
  const params = estimateParams(fixture, xgHome, xgAway);
  const { baseIntensityHome, baseIntensityAway, excitation, decay } = params;

  // If we have live events, use them; otherwise simulate
  const goalEvents: Array<{ time: number; team: "home" | "away" }> = [];

  if (liveEvents && liveEvents.length > 0) {
    for (const ev of liveEvents) {
      if (ev.type === "Goal" || ev.detail?.includes("Goal")) {
        const team = ev.team === fixture.home.name ? "home" : "away";
        goalEvents.push({ time: ev.time, team });
      }
    }
  }

  // Calculate intensity at different phases
  const calcPhaseIntensity = (startMin: number, endMin: number) => {
    const midpoint = (startMin + endMin) / 2;
    const homeInt = intensityAtTime(midpoint, goalEvents, baseIntensityHome, excitation, decay);
    const awayInt = intensityAtTime(midpoint, goalEvents, baseIntensityAway, excitation, decay);
    return Math.round((homeInt + awayInt) * 1000) / 1000;
  };

  // Second half typically has higher intensity (fatigue, tactical changes)
  const secondHalfBoost = 1.15;

  const intensity0_15 = calcPhaseIntensity(0, 15);
  const intensity15_30 = calcPhaseIntensity(15, 30);
  const intensity30_45 = calcPhaseIntensity(30, 45) * 1.05; // Pre-HT push
  const intensity45_60 = calcPhaseIntensity(45, 60) * secondHalfBoost;
  const intensity60_75 = calcPhaseIntensity(60, 75) * secondHalfBoost * 1.05;
  const intensity75_90 = calcPhaseIntensity(75, 90) * secondHalfBoost * 1.15; // Final push

  // Current elapsed time (for live matches)
  const currentMin = fixture.elapsed ?? 0;
  const currentIntensityHome = intensityAtTime(currentMin, goalEvents, baseIntensityHome, excitation, decay);
  const currentIntensityAway = intensityAtTime(currentMin, goalEvents, baseIntensityAway, excitation, decay);
  const currentTotal = currentIntensityHome + currentIntensityAway;

  // Probability of next goal in N minutes: P = 1 - exp(-λ*t)
  const nextGoalIn5min = Math.round((1 - Math.exp(-currentTotal * 5)) * 1000) / 10;
  const nextGoalIn10min = Math.round((1 - Math.exp(-currentTotal * 10)) * 1000) / 10;
  const nextGoalIn15min = Math.round((1 - Math.exp(-currentTotal * 15)) * 1000) / 10;

  // Momentum: who is more likely to score next
  const totalIntensity = currentIntensityHome + currentIntensityAway;
  const homeMomentum = totalIntensity > 0
    ? Math.round((currentIntensityHome / totalIntensity) * 100)
    : 50;
  const awayMomentum = 100 - homeMomentum;

  // Expected total goals (integrate intensity over remaining time)
  const remainingMin = Math.max(0, 90 - currentMin);
  const avgIntensity = (intensity0_15 + intensity15_30 + intensity30_45 + intensity45_60 + intensity60_75 + intensity75_90) / 6;
  const expectedTotalGoals = Math.round((avgIntensity * 90 + goalEvents.length) * 10) / 10;

  // Clustering coefficient: ratio of actual clustering to random
  // Higher = goals come in bursts, not evenly spread
  let clusteringCoeff = 1.0;
  if (goalEvents.length >= 2) {
    const gaps = [];
    for (let i = 1; i < goalEvents.length; i++) {
      gaps.push(goalEvents[i].time - goalEvents[i - 1].time);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const expectedGap = 90 / (goalEvents.length + 1);
    clusteringCoeff = Math.round((expectedGap / Math.max(1, avgGap)) * 100) / 100;
  } else {
    // Estimate from team characteristics
    clusteringCoeff = 1.0 + (excitation / decay) * 0.5;
  }

  return {
    intensity0_15,
    intensity15_30,
    intensity30_45,
    intensity45_60,
    intensity60_75,
    intensity75_90,
    nextGoalIn5min,
    nextGoalIn10min,
    nextGoalIn15min,
    homeMomentum,
    awayMomentum,
    expectedTotalGoals,
    clusteringCoeff: Math.round(clusteringCoeff * 100) / 100,
    params,
  };
}
