/**
 * Ensemble Model — Combines multiple prediction models with dynamic weighting.
 *
 * Models combined:
 * 1. Poisson (base) — Good for average matches
 * 2. Negative Binomial — Better for high-variance/low-division matches
 * 3. ELO Rating — Captures team strength independent of recent xG
 * 4. Form-weighted — Pure momentum-based prediction
 *
 * Weights are dynamic based on data quality:
 * - Elite leagues with xG: Poisson gets more weight
 * - Low divisions: Negative Binomial gets more weight
 * - Low sample size: ELO gets more weight (less dependent on season stats)
 * - Strong form differential: Form model gets more weight
 */

import type { Fixture } from "@/shared/domain";
import { negBinomModel } from "./negative-binomial";
import { eloModel } from "./elo-rating";

type Probs1X2 = { homeWin: number; draw: number; awayWin: number; over25?: number; btts?: number };

export type EnsembleResult = {
  // Final blended probabilities
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  btts: number;

  // Individual model outputs (for transparency)
  models: {
    poisson: { homeWin: number; draw: number; awayWin: number; weight: number; over25: number; btts: number };
    negBinom: { homeWin: number; draw: number; awayWin: number; over25: number; btts: number; weight: number };
    elo: { homeWin: number; draw: number; awayWin: number; weight: number };
    form: { homeWin: number; draw: number; awayWin: number; weight: number };
  };

  // Consensus metrics
  modelAgreement: number; // 0-100: how much models agree (high = more confident)
  dominantModel: string;
};

/**
 * Form-based model — Pure momentum prediction.
 * Teams on winning streaks get boosted, losing streaks get penalized.
 */
function formModel(fixture: Fixture): Probs1X2 {
  const homeForm = fixture.home.form;
  const awayForm = fixture.away.form;

  // Score form: W=3, D=1, L=0, weighted by recency
  const scoreForm = (form: string[]) => {
    let total = 0, maxTotal = 0;
    for (let i = 0; i < form.length; i++) {
      const weight = 1 + (form.length - 1 - i) * 0.3; // Most recent = highest weight
      total += (form[i] === "W" ? 3 : form[i] === "D" ? 1 : 0) * weight;
      maxTotal += 3 * weight;
    }
    return total / (maxTotal || 1); // 0-1 scale
  };

  const homeStrength = scoreForm(homeForm);
  const awayStrength = scoreForm(awayForm);

  // Convert to probabilities with home advantage
  const homeAdv = 0.08; // 8% home boost
  const rawHome = homeStrength + homeAdv;
  const rawAway = awayStrength;
  const rawDraw = 1 - Math.abs(rawHome - rawAway) * 0.8; // Draw more likely when teams are equal

  // Normalize
  const total = rawHome + rawDraw + rawAway;
  return {
    homeWin: Math.round((rawHome / total) * 1000) / 10,
    draw: Math.round((rawDraw / total) * 1000) / 10,
    awayWin: Math.round((rawAway / total) * 1000) / 10,
  };
}

/**
 * Calculate dynamic weights based on data quality and context.
 */
function calculateWeights(fixture: Fixture): { poisson: number; negBinom: number; elo: number; form: number } {
  let poisson = 0.35;
  let negBinom = 0.25;
  let elo = 0.25;
  let form = 0.15;

  // Elite leagues with xG → boost Poisson
  if (fixture.coverage.hasXg && fixture.coverage.tier === "elite") {
    poisson += 0.10;
    negBinom -= 0.05;
    elo -= 0.05;
  }

  // Low division → boost Negative Binomial (handles variance better)
  if (fixture.context.lowDivision || fixture.coverage.tier === "low") {
    negBinom += 0.10;
    poisson -= 0.05;
    elo -= 0.05;
  }

  // Low sample size → boost ELO (less dependent on season stats)
  const minMatches = Math.min(fixture.home.matchesPlayed, fixture.away.matchesPlayed);
  if (minMatches < 10) {
    elo += 0.15;
    poisson -= 0.08;
    negBinom -= 0.07;
  }

  // Strong form differential → boost form model
  const homeFormScore = fixture.home.form.filter(r => r === "W").length;
  const awayFormScore = fixture.away.form.filter(r => r === "W").length;
  if (Math.abs(homeFormScore - awayFormScore) >= 3) {
    form += 0.10;
    poisson -= 0.05;
    elo -= 0.05;
  }

  // Derby/rivalry → boost form and ELO (form matters more, stats less reliable)
  if (fixture.context.derby || fixture.context.rivalRivalry) {
    form += 0.05;
    elo += 0.05;
    poisson -= 0.05;
    negBinom -= 0.05;
  }

  // Normalize to sum = 1
  const total = poisson + negBinom + elo + form;
  return {
    poisson: poisson / total,
    negBinom: negBinom / total,
    elo: elo / total,
    form: form / total,
  };
}

/**
 * Measure agreement between models (0-100).
 * High agreement = models converge = higher confidence.
 */
function measureAgreement(models: Probs1X2[]): number {
  const homeWins = models.map(m => m.homeWin);
  const draws = models.map(m => m.draw);
  const awayWins = models.map(m => m.awayWin);

  const stdDev = (arr: number[]) => {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  // Average standard deviation across all outcomes
  const avgStd = (stdDev(homeWins) + stdDev(draws) + stdDev(awayWins)) / 3;

  // Convert to 0-100 scale (0 std = 100 agreement, 15+ std = 0 agreement)
  return Math.round(Math.max(0, Math.min(100, 100 - avgStd * 6.5)));
}

export function ensembleModel(
  fixture: Fixture,
  poissonProbs: Probs1X2,
  xgHome: number,
  xgAway: number
): EnsembleResult {
  // Run individual models
  const negBinom = negBinomModel(fixture, xgHome, xgAway);
  const elo = eloModel(fixture);
  const form = formModel(fixture);

  const negBinomProbs: Probs1X2 = { homeWin: negBinom.homeWin, draw: negBinom.draw, awayWin: negBinom.awayWin };
  const eloProbs: Probs1X2 = { homeWin: elo.homeWinProb, draw: elo.drawProb, awayWin: elo.awayWinProb };

  // Calculate dynamic weights
  const weights = calculateWeights(fixture);

  // Blend probabilities
  const blendedHome = poissonProbs.homeWin * weights.poisson +
    negBinomProbs.homeWin * weights.negBinom +
    eloProbs.homeWin * weights.elo +
    form.homeWin * weights.form;

  const blendedDraw = poissonProbs.draw * weights.poisson +
    negBinomProbs.draw * weights.negBinom +
    eloProbs.draw * weights.elo +
    form.draw * weights.form;

  const blendedAway = poissonProbs.awayWin * weights.poisson +
    negBinomProbs.awayWin * weights.negBinom +
    eloProbs.awayWin * weights.elo +
    form.awayWin * weights.form;

  // Normalize to 100%
  const total = blendedHome + blendedDraw + blendedAway;

  // Over 2.5 and BTTS: blend Poisson (from goal markets) and NegBinom
  // Need to get Poisson over25 from the calling code or compute it
  const poissonOver25Weight = fixture.coverage.hasXg ? 0.55 : 0.45;
  const negBinomOver25Weight = 1 - poissonOver25Weight;
  
  // Use NegBinom over25 since Poisson over25 isn't directly passed
  // But blend with Poisson implied via xG totals
  const poissonImpliedOver25 = Math.min(95, (xgHome + xgAway) * 18); // heuristic: 2.5 goals ~ 55% at 2.8 xG total
  const blendedOver25 = (poissonImpliedOver25 * poissonOver25Weight) + (negBinom.over25 * negBinomOver25Weight);

  // Model agreement
  const allModels = [poissonProbs, negBinomProbs, eloProbs, form];
  const agreement = measureAgreement(allModels);

  // Dominant model (which one is closest to the ensemble output)
  const ensembleProbs = { homeWin: (blendedHome / total) * 100, draw: (blendedDraw / total) * 100, awayWin: (blendedAway / total) * 100 };
  const distances = [
    { name: "Poisson", dist: Math.abs(poissonProbs.homeWin - ensembleProbs.homeWin) },
    { name: "Neg. Binomial", dist: Math.abs(negBinomProbs.homeWin - ensembleProbs.homeWin) },
    { name: "ELO", dist: Math.abs(eloProbs.homeWin - ensembleProbs.homeWin) },
    { name: "Forma", dist: Math.abs(form.homeWin - ensembleProbs.homeWin) },
  ];
  const dominant = distances.sort((a, b) => a.dist - b.dist)[0].name;

  return {
    homeWin: Math.round((blendedHome / total) * 100 * 10) / 10,
    draw: Math.round((blendedDraw / total) * 100 * 10) / 10,
    awayWin: Math.round((blendedAway / total) * 100 * 10) / 10,
    over25: Math.round(blendedOver25 * 10) / 10,
    btts: Math.round(negBinom.btts * 10) / 10,
    models: {
      poisson: { homeWin: poissonProbs.homeWin, draw: poissonProbs.draw, awayWin: poissonProbs.awayWin, weight: Math.round(weights.poisson * 100) / 100, over25: poissonImpliedOver25 ?? 0, btts: negBinom.btts ?? 0 },
      negBinom: { homeWin: negBinomProbs.homeWin, draw: negBinomProbs.draw, awayWin: negBinomProbs.awayWin, over25: negBinom.over25, btts: negBinom.btts, weight: Math.round(weights.negBinom * 100) / 100 },
      elo: { homeWin: eloProbs.homeWin, draw: eloProbs.draw, awayWin: eloProbs.awayWin, weight: Math.round(weights.elo * 100) / 100 },
      form: { homeWin: form.homeWin, draw: form.draw, awayWin: form.awayWin, weight: Math.round(weights.form * 100) / 100 },
    },
    modelAgreement: agreement,
    dominantModel: dominant,
  };
}
