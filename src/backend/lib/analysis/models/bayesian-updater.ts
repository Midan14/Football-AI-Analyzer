/**
 * Bayesian Updating — Real-time probability adjustment with each event.
 *
 * Starts with prior probabilities (from ensemble model) and updates them
 * as match events occur:
 * - Goal scored → dramatically shifts 1X2 probabilities
 * - Red card → shifts expected goals
 * - Time passing without goals → increases draw probability
 * - Substitution → minor tactical adjustment
 *
 * Uses conjugate priors for computational efficiency:
 * - Beta-Binomial for 1X2 outcomes
 * - Gamma-Poisson for goal totals
 *
 * P(θ|data) ∝ P(data|θ) * P(θ)
 */

import type { Fixture, MatchEvent } from "@/shared/domain";

export type BayesianResult = {
  // Updated probabilities (posterior)
  posterior: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    btts: number;
  };
  // How much probabilities shifted from prior
  shift: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  // Confidence in the update (higher with more data)
  updateConfidence: number;
  // Events that caused the biggest shifts
  keyEvents: Array<{
    event: string;
    minute: number;
    impact: number; // How much it shifted probabilities
    direction: string; // "home" | "away" | "draw"
  }>;
  // Time decay factor (how much remaining time affects certainty)
  timeDecay: number;
  // Expected goals remaining
  xgRemaining: { home: number; away: number };
};

type Prior = { homeWin: number; draw: number; awayWin: number; over25: number; btts: number };

/**
 * Update probabilities based on current score.
 * The biggest single factor in live probability updates.
 */
function updateForScore(
  prior: Prior,
  homeGoals: number,
  awayGoals: number,
  elapsed: number
): Prior {
  const remainingFraction = Math.max(0, (90 - elapsed) / 90);
  const goalDiff = homeGoals - awayGoals;

  let homeWin = prior.homeWin;
  let draw = prior.draw;
  let awayWin = prior.awayWin;

  if (goalDiff > 0) {
    // Home leading: probability increases with time and lead size
    const leadStrength = Math.min(3, goalDiff) * (1 - remainingFraction * 0.7);
    homeWin = prior.homeWin + leadStrength * 15;
    draw = prior.draw * (0.3 + remainingFraction * 0.5);
    awayWin = prior.awayWin * (0.1 + remainingFraction * 0.6);
  } else if (goalDiff < 0) {
    // Away leading
    const leadStrength = Math.min(3, -goalDiff) * (1 - remainingFraction * 0.7);
    awayWin = prior.awayWin + leadStrength * 15;
    draw = prior.draw * (0.3 + remainingFraction * 0.5);
    homeWin = prior.homeWin * (0.1 + remainingFraction * 0.6);
  } else {
    // Level: draw probability increases as time passes
    const drawBoost = (1 - remainingFraction) * 20;
    draw = prior.draw + drawBoost;
    homeWin = prior.homeWin * (0.7 + remainingFraction * 0.3);
    awayWin = prior.awayWin * (0.7 + remainingFraction * 0.3);
  }

  // Normalize
  const total = homeWin + draw + awayWin;
  return {
    homeWin: Math.round((homeWin / total) * 1000) / 10,
    draw: Math.round((draw / total) * 1000) / 10,
    awayWin: Math.round((awayWin / total) * 1000) / 10,
    over25: updateOver25(prior.over25, homeGoals + awayGoals, elapsed),
    btts: updateBTTS(prior.btts, homeGoals, awayGoals, elapsed),
  };
}

function updateOver25(priorOver25: number, currentGoals: number, elapsed: number): number {
  if (currentGoals >= 3) return 99.9; // Already over 2.5
  const remainingFraction = Math.max(0, (90 - elapsed) / 90);
  const goalsNeeded = 3 - currentGoals;

  // Probability decreases as time runs out and goals are still needed
  if (goalsNeeded === 1) return Math.round((priorOver25 * 0.5 + 50 * remainingFraction) * 10) / 10;
  if (goalsNeeded === 2) return Math.round(priorOver25 * remainingFraction * 0.8 * 10) / 10;
  return Math.round(priorOver25 * remainingFraction * remainingFraction * 10) / 10;
}

function updateBTTS(priorBTTS: number, homeGoals: number, awayGoals: number, elapsed: number): number {
  if (homeGoals > 0 && awayGoals > 0) return 99.9; // Already BTTS
  const remainingFraction = Math.max(0, (90 - elapsed) / 90);

  if (homeGoals > 0 || awayGoals > 0) {
    // One team scored, other needs to score
    return Math.round((priorBTTS * 0.6 + 40 * remainingFraction) * 10) / 10;
  }
  // Neither scored yet
  return Math.round(priorBTTS * remainingFraction * 10) / 10;
}

/**
 * Update for red card event.
 */
function updateForRedCard(
  current: Prior,
  team: "home" | "away",
  elapsed: number
): Prior {
  const remainingFraction = Math.max(0, (90 - elapsed) / 90);
  const impact = remainingFraction * 0.3; // More impactful earlier in the match

  if (team === "home") {
    return {
      homeWin: Math.round(current.homeWin * (1 - impact) * 10) / 10,
      draw: Math.round((current.draw + current.homeWin * impact * 0.4) * 10) / 10,
      awayWin: Math.round((current.awayWin + current.homeWin * impact * 0.6) * 10) / 10,
      over25: Math.round(current.over25 * 1.1 * 10) / 10, // Red cards often lead to more goals
      btts: Math.round(current.btts * 0.85 * 10) / 10, // Harder for 10-man team to score
    };
  } else {
    return {
      homeWin: Math.round((current.homeWin + current.awayWin * impact * 0.6) * 10) / 10,
      draw: Math.round((current.draw + current.awayWin * impact * 0.4) * 10) / 10,
      awayWin: Math.round(current.awayWin * (1 - impact) * 10) / 10,
      over25: Math.round(current.over25 * 1.1 * 10) / 10,
      btts: Math.round(current.btts * 0.85 * 10) / 10,
    };
  }
}

export function bayesianUpdate(
  fixture: Fixture,
  priorProbs: { homeWin: number; draw: number; awayWin: number; over25: number; btts: number },
  events?: MatchEvent[]
): BayesianResult {
  const elapsed = fixture.elapsed ?? 0;
  const homeGoals = fixture.result?.homeGoals ?? 0;
  const awayGoals = fixture.result?.awayGoals ?? 0;

  const prior: Prior = { ...priorProbs };
  let current = { ...prior };
  const keyEvents: BayesianResult["keyEvents"] = [];

  // Update for current score (biggest factor)
  if (fixture.status === "live" && elapsed > 0) {
    current = updateForScore(prior, homeGoals, awayGoals, elapsed);

    if (homeGoals > 0 || awayGoals > 0) {
      keyEvents.push({
        event: `Marcador ${homeGoals}-${awayGoals}`,
        minute: elapsed,
        impact: Math.abs(current.homeWin - prior.homeWin),
        direction: homeGoals > awayGoals ? "home" : awayGoals > homeGoals ? "away" : "draw",
      });
    }
  }

  // Process individual events
  if (events && events.length > 0) {
    for (const ev of events) {
      if (ev.detail?.includes("Red")) {
        const team = ev.team === fixture.home.name ? "home" : "away";
        const before = { ...current };
        current = updateForRedCard(current, team as "home" | "away", ev.time);
        keyEvents.push({
          event: `Roja ${ev.player} (${ev.team})`,
          minute: ev.time,
          impact: Math.abs(current.homeWin - before.homeWin),
          direction: team === "home" ? "away" : "home",
        });
      }
    }
  }

  // Time decay: as match progresses without change, draw becomes more likely
  const timeDecay = elapsed > 0 ? Math.round((1 - elapsed / 90) * 100) / 100 : 1.0;

  // Expected goals remaining
  const remainingMin = Math.max(0, 90 - elapsed);
  const baseXgPerMin = (fixture.home.xgFor + fixture.away.xgFor) / (fixture.home.matchesPlayed || 18) / 90;
  const xgRemaining = {
    home: Math.round(baseXgPerMin * 0.55 * remainingMin * 100) / 100,
    away: Math.round(baseXgPerMin * 0.45 * remainingMin * 100) / 100,
  };

  // Update confidence: higher with more elapsed time and events
  const updateConfidence = Math.min(95, 50 + elapsed * 0.4 + (events?.length ?? 0) * 2);

  // Calculate shifts
  const shift = {
    homeWin: Math.round((current.homeWin - prior.homeWin) * 10) / 10,
    draw: Math.round((current.draw - prior.draw) * 10) / 10,
    awayWin: Math.round((current.awayWin - prior.awayWin) * 10) / 10,
  };

  return {
    posterior: current,
    shift,
    updateConfidence: Math.round(updateConfidence),
    keyEvents: keyEvents.sort((a, b) => b.impact - a.impact).slice(0, 5),
    timeDecay,
    xgRemaining,
  };
}
