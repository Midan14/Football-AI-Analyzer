/**
 * Blended temporal 70/30 — mezcla forma reciente vs estadística de temporada.
 */

import type { Fixture } from "@/shared/domain";
import { formScore } from "../shared-math";

export type TemporalBlendResult = {
  recentWeight: number;
  seasonWeight: number;
  blendedHomeXg: number;
  blendedAwayXg: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  recentFormHome: number;
  recentFormAway: number;
};

function poisson(lambda: number, k: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * lambda ** k) / fact;
}

function probsFromXg(homeXg: number, awayXg: number) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const p = poisson(homeXg, h) * poisson(awayXg, a);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }
  const total = homeWin + draw + awayWin;
  return {
    homeWin: Math.round((homeWin / total) * 1000) / 10,
    draw: Math.round((draw / total) * 1000) / 10,
    awayWin: Math.round((awayWin / total) * 1000) / 10,
  };
}

function recentAttackRate(team: Fixture["home"], hasXg: boolean): number {
  const form = team.form.slice(0, 5);
  const wins = form.filter((r) => r === "W").length;
  const draws = form.filter((r) => r === "D").length;
  const ppg = (wins * 3 + draws) / Math.max(1, form.length);
  const seasonPpg = team.pointsTotal / Math.max(1, team.matchesPlayed || 18);
  const boost = ppg / Math.max(0.5, seasonPpg);
  const base = hasXg ? team.xgFor / Math.max(1, team.matchesPlayed || 18) : team.goalsFor / Math.max(1, team.matchesPlayed || 18);
  return base * boost;
}

export function temporalBlendModel(
  fixture: Fixture,
  seasonHomeXg: number,
  seasonAwayXg: number,
  recentWeight = 0.7
): TemporalBlendResult {
  const seasonWeight = 1 - recentWeight;
  const recentHome = recentAttackRate(fixture.home, fixture.coverage.hasXg);
  const recentAway = recentAttackRate(fixture.away, fixture.coverage.hasXg);

  const blendedHomeXg = recentWeight * recentHome + seasonWeight * seasonHomeXg;
  const blendedAwayXg = recentWeight * recentAway + seasonWeight * seasonAwayXg;
  const probs = probsFromXg(blendedHomeXg, blendedAwayXg);

  return {
    recentWeight,
    seasonWeight,
    blendedHomeXg: Math.round(blendedHomeXg * 1000) / 1000,
    blendedAwayXg: Math.round(blendedAwayXg * 1000) / 1000,
    ...probs,
    recentFormHome: Math.round(formScore(fixture.home.form)),
    recentFormAway: Math.round(formScore(fixture.away.form)),
  };
}
