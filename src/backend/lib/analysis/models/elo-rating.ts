/**
 * ELO Rating System — Dynamic team strength estimation.
 * Adapted from chess ELO for football with:
 * - Home advantage factor (+65 ELO points)
 * - Goal difference multiplier (bigger wins = bigger ELO change)
 * - K-factor adjusted by match importance
 * - Form-weighted recent performance
 *
 * Since we don't have historical ELO, we estimate from current season data:
 * table position, points, goal difference, and form.
 */

import type { Fixture } from "@/shared/domain";

export type EloResult = {
  homeElo: number;
  awayElo: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  eloDiff: number;
  homeAdvantage: number;
};

const HOME_ADVANTAGE = 65; // ELO points for home field
const BASE_ELO = 1500;

/**
 * Estimate ELO from season performance.
 * Uses: points per game, goal difference, table position, form.
 */
function estimateElo(team: Fixture["home"], isHome: boolean): number {
  const matches = team.matchesPlayed || 18;
  const ppg = team.pointsTotal / matches; // 0-3 scale
  const gd = (team.goalsFor - team.goalsAgainst) / matches; // goal diff per game

  // Base ELO from points per game (champion ~2.2 ppg = ~1700 ELO, relegation ~0.8 = ~1300)
  let elo = BASE_ELO + (ppg - 1.5) * 285;

  // Goal difference adjustment (±50 max)
  elo += Math.max(-50, Math.min(50, gd * 25));

  // Table position adjustment (top = +40, bottom = -40)
  const positionFactor = (10 - Math.min(20, team.tablePosition)) / 10; // -1 to +0.9
  elo += positionFactor * 40;

  // Form adjustment (recent 5 games weighted more)
  const formPts = team.form.reduce((sum, r, i) => {
    const weight = 1 + i * 0.2; // More recent = higher weight
    return sum + (r === "W" ? 3 * weight : r === "D" ? 1 * weight : 0);
  }, 0);
  const maxFormPts = team.form.length * 3 * (1 + (team.form.length - 1) * 0.2);
  const formRatio = formPts / (maxFormPts || 1);
  elo += (formRatio - 0.5) * 60;

  // xG quality bonus (if available)
  if (team.xgFor > 0) {
    const xgDiff = (team.xgFor - team.xgAgainst) / matches;
    elo += Math.max(-30, Math.min(30, xgDiff * 20));
  }

  // Home advantage
  if (isHome) elo += HOME_ADVANTAGE;

  return Math.round(elo);
}

/**
 * Convert ELO difference to win/draw/loss probabilities.
 * Uses the standard logistic function with draw adjustment.
 */
function eloProbabilities(homeElo: number, awayElo: number): { home: number; draw: number; away: number } {
  const diff = homeElo - awayElo;

  // Expected score (0-1) from ELO formula
  const expectedHome = 1 / (1 + Math.pow(10, -diff / 400));
  const expectedAway = 1 - expectedHome;

  // Draw probability estimation (higher when teams are close in ELO)
  // Empirical: draw rate in football is ~25-28%, higher when ELO diff is small
  const drawBase = 0.26;
  const drawBoost = Math.max(0, 0.08 - Math.abs(diff) * 0.0003); // Up to +8% for equal teams
  const drawProb = Math.min(0.35, drawBase + drawBoost);

  // Distribute remaining probability
  const remaining = 1 - drawProb;
  const homeWin = remaining * expectedHome;
  const awayWin = remaining * expectedAway;

  return {
    home: Math.round(homeWin * 1000) / 10,
    draw: Math.round(drawProb * 1000) / 10,
    away: Math.round(awayWin * 1000) / 10,
  };
}

export function eloModel(fixture: Fixture): EloResult {
  const homeElo = estimateElo(fixture.home, true);
  const awayElo = estimateElo(fixture.away, false);
  const probs = eloProbabilities(homeElo, awayElo);

  return {
    homeElo,
    awayElo,
    homeWinProb: probs.home,
    drawProb: probs.draw,
    awayWinProb: probs.away,
    eloDiff: homeElo - awayElo,
    homeAdvantage: HOME_ADVANTAGE,
  };
}
