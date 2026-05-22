/**
 * Causal intelligence — GNN-style graph, DoWhy/CausalNex impact, Survival analysis.
 */

import type { Fixture } from "@/shared/domain";

export type CausalSurvivalResult = {
  gnn: {
    homeNodeStrength: number;
    awayNodeStrength: number;
    leagueBaseline: number;
    messagePassingDelta: number;
  };
  causal: {
    restDaysEffect: number;
    travelEffect: number;
    motivationEffect: number;
    totalCausalLift: number;
    confidence: number;
  };
  survival: {
    hazardRateHome: number;
    hazardRateAway: number;
    medianMinutesToNextGoal: number;
    survivalProbNoGoal60: number;
  };
};

export function causalSurvivalModel(fixture: Fixture, xgHome: number, xgAway: number): CausalSurvivalResult {
  const matchesH = fixture.home.matchesPlayed || 18;
  const matchesA = fixture.away.matchesPlayed || 18;
  const leagueBaseline = 1.35;

  // GNN 1-hop: nodo equipo + vecinos implícitos (liga, forma)
  const homeRaw = fixture.home.goalsFor / matchesH + fixture.home.pointsTotal / (matchesH * 3);
  const awayRaw = fixture.away.goalsFor / matchesA + fixture.away.pointsTotal / (matchesA * 3);
  const homeNode = 0.6 * homeRaw + 0.25 * leagueBaseline + 0.15 * (fixture.home.form.filter((r) => r === "W").length / Math.max(1, fixture.home.form.length));
  const awayNode = 0.6 * awayRaw + 0.25 * leagueBaseline + 0.15 * (fixture.away.form.filter((r) => r === "W").length / Math.max(1, fixture.away.form.length));
  const messagePassingDelta = Math.round((homeNode - awayNode) * 100) / 100;

  // DoWhy-style causal: counterfactual lift from rest/travel/motivation
  const restGap = fixture.home.restDays - fixture.away.restDays;
  const restDaysEffect = Math.max(-0.08, Math.min(0.08, restGap * 0.015));
  const travelEffect = Math.max(-0.12, Math.min(0, -fixture.away.travelKm / 12000));
  const motivationEffect = ((fixture.home.motivation - fixture.away.motivation) / 100) * 0.1;
  const totalCausalLift = restDaysEffect + travelEffect + motivationEffect;
  const causalConfidence = Math.round(
    (fixture.coverage.hasLineups ? 25 : 0) +
      (fixture.coverage.hasInjuries ? 20 : 0) +
      (fixture.coverage.hasReferee ? 15 : 0) +
      40
  );

  // Survival / hazard for next goal (Weibull-like from xG)
  const hazardRateHome = xgHome / 90;
  const hazardRateAway = xgAway / 90;
  const combinedHazard = hazardRateHome + hazardRateAway;
  const medianMinutesToNextGoal = combinedHazard > 0 ? Math.round(Math.log(2) / combinedHazard) : 90;
  const survivalProbNoGoal60 = Math.round(Math.exp(-combinedHazard * 60) * 1000) / 10;

  return {
    gnn: {
      homeNodeStrength: Math.round(homeNode * 100) / 100,
      awayNodeStrength: Math.round(awayNode * 100) / 100,
      leagueBaseline: Math.round(leagueBaseline * 100) / 100,
      messagePassingDelta,
    },
    causal: {
      restDaysEffect: Math.round(restDaysEffect * 1000) / 10,
      travelEffect: Math.round(travelEffect * 1000) / 10,
      motivationEffect: Math.round(motivationEffect * 1000) / 10,
      totalCausalLift: Math.round(totalCausalLift * 1000) / 10,
      confidence: causalConfidence,
    },
    survival: {
      hazardRateHome: Math.round(hazardRateHome * 10000) / 10000,
      hazardRateAway: Math.round(hazardRateAway * 10000) / 10000,
      medianMinutesToNextGoal,
      survivalProbNoGoal60,
    },
  };
}
