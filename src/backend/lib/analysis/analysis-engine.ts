import type { AnalysisResult, Fixture } from "@/shared/domain";
import {
  round1,
  impliedProbability,
  expectedGoals,
  buildPoissonMatrix,
  compute1X2Probabilities,
  computeExactScoreProbabilities,
  computeAllGoalMarkets,
  buildValueTable,
  formScore,
} from "./shared-math";
import {
  computeConfidence,
  computeStakeUnits,
  clampConfidenceForSample,
  applyContextualPenalties,
} from "./risk-policy";
import { ensembleModel } from "./models/ensemble";
import { kellyPortfolio } from "./models/kelly-criterion";

type ValueRow = AnalysisResult["valueTable"][number];

function fallbackMarket(probabilities: AnalysisResult["probabilities"]): ValueRow {
  const options = [
    ["Local gana", probabilities.homeWin],
    ["Empate", probabilities.draw],
    ["Visitante gana", probabilities.awayWin],
    ["Over 2.5", probabilities.over25],
    ["Under 3.5", probabilities.under35],
    ["BTTS Sí", probabilities.btts],
  ] as const;
  const [market, modelProbability] = [...options].sort((a, b) => b[1] - a[1])[0];
  return {
    market: `Sin cuota real disponible (${market})`,
    modelProbability,
    marketProbability: 0,
    edge: 0,
    verdict: "Sin cuotas",
  };
}

export function analyzeFixture(fixture: Fixture): AnalysisResult {
  const xg = expectedGoals(fixture);
  const matrix = buildPoissonMatrix(xg);
  const probabilities = compute1X2Probabilities(matrix);
  const topExactScores = computeExactScoreProbabilities(matrix);
  const goalMarkets = computeAllGoalMarkets(matrix);

  const penalties: AnalysisResult["confidence"]["penalties"] = [];
  const riskFlags: AnalysisResult["riskFlags"] = [];
  const addPenalty = (id: string, label: string, points: number, severity: "low" | "medium" | "high") => {
    penalties.push({ id, label, points });
    riskFlags.push({ id, label, severity });
  };

  const marketHomePct = impliedProbability(fixture.market.homeWinOdds);
  applyContextualPenalties(fixture, probabilities.homeWin, marketHomePct, addPenalty);

  const rawConfidence = computeConfidence(penalties);
  const confidenceScore = clampConfidenceForSample(
    rawConfidence,
    fixture.home.matchesPlayed,
    fixture.away.matchesPlayed
  );
  const stakeUnits = computeStakeUnits(confidenceScore);

  const valueTable = buildValueTable(probabilities, fixture);

  // Pick best market: balance edge, model probability, and odds attractiveness
  // Prioritize markets where model has high conviction AND positive edge
  const attractiveMarkets = valueTable
    .filter((row) => {
      const impliedOdds = 100 / row.modelProbability;
      return row.edge > 0 && impliedOdds >= 1.4 && impliedOdds <= 8.0;
    })
    .sort((a, b) => {
      // Score = edge * sqrt(modelProbability) — rewards both edge and conviction
      const scoreA = a.edge * Math.sqrt(a.modelProbability);
      const scoreB = b.edge * Math.sqrt(b.modelProbability);
      return scoreB - scoreA;
    });

  const best = attractiveMarkets[0]
    ?? valueTable.filter((row) => row.edge > 0).sort((a, b) => b.edge - a.edge)[0]
    ?? valueTable.sort((a, b) => b.edge - a.edge)[0]
    ?? fallbackMarket(probabilities);

  const homeForm = formScore(fixture.home.form);
  const awayForm = formScore(fixture.away.form);

  // ── Ensemble Model (4 models blended) ─────────────────────────────────
  const poissonProbs = { homeWin: probabilities.homeWin, draw: probabilities.draw, awayWin: probabilities.awayWin };
  const ensemble = ensembleModel(fixture, poissonProbs, xg.home, xg.away);

  // ── Kelly Criterion (optimal staking) ─────────────────────────────────
  const kelly = kellyPortfolio(
    valueTable.filter(r => r.edge > 0),
    fixture as any,
    confidenceScore
  );

  // Build dynamic rationale
  const bestFairOdds = round1(100 / best.modelProbability);
  const riskLevelText = confidenceScore >= 68 ? "bajo" : confidenceScore >= 52 ? "moderado" : "alto";
  const edgeText = valueTable.length === 0
    ? "sin cuota real para calcular edge"
    : best.edge > 5 ? "edge significativo" : best.edge > 2 ? "edge moderado" : "edge mínimo";
  const formContext = homeForm > awayForm + 20
    ? `${fixture.home.name} en mejor forma (${homeForm} vs ${awayForm}).`
    : awayForm > homeForm + 20
    ? `${fixture.away.name} en mejor forma (${awayForm} vs ${homeForm}).`
    : "Equipos en forma similar.";

  const modelsUsed = `Ensemble: ${ensemble.dominantModel} dominante (acuerdo ${ensemble.modelAgreement}%).`;
  const rationale = valueTable.length === 0
    ? `${best.market}: modelo ${best.modelProbability}%, pero no hay cuotas reales del bookmaker. Cuota justa ${bestFairOdds}. Riesgo ${riskLevelText}. ${formContext} ${modelsUsed}`
    : `${best.market}: modelo ${best.modelProbability}% vs mercado ${best.marketProbability}% (${edgeText} +${best.edge}%). ` +
      `Cuota justa ${bestFairOdds}. Riesgo ${riskLevelText}. ${formContext} ${modelsUsed}`;

  return {
    fixtureId: fixture.id,
    probabilities,
    topExactScores,
    goalMarkets,
    confidence: { score: confidenceScore, penalties },
    riskFlags,
    radar: [
      { axis: "Forma", value: round1((homeForm + awayForm) / 2) },
      { axis: "Ataque", value: round1(Math.min(100, (xg.home + xg.away) * 31)) },
      { axis: "Defensa", value: round1(Math.max(25, 100 - (fixture.home.goalsAgainst + fixture.away.goalsAgainst) * 0.8)) },
      { axis: "Motivación", value: round1((fixture.home.motivation + fixture.away.motivation) / 2) },
      { axis: "Fatiga", value: round1(Math.max(20, 100 - Math.abs(fixture.home.restDays - fixture.away.restDays) * 9 - fixture.away.travelKm / 30)) },
      { axis: "Mercado", value: fixture.coverage.hasOdds ? 72 : 35 },
      { axis: "Cobertura", value: fixture.coverage.tier === "elite" ? 94 : fixture.coverage.tier === "standard" ? 74 : 45 },
      { axis: "Outlier", value: fixture.context.lowDivision ? 34 : 62 },
    ],
    recommendation: {
      market: best.market,
      fairOdds: bestFairOdds,
      minimumOdds: round1(bestFairOdds * 1.05),
      stakeUnits: kelly.bets.length > 0 ? Math.min(kelly.bets[0].stakeUnits, stakeUnits) : stakeUnits,
      rationale,
    },
    valueTable,
    ensemble: {
      homeWin: ensemble.homeWin,
      draw: ensemble.draw,
      awayWin: ensemble.awayWin,
      models: ensemble.models,
      modelAgreement: ensemble.modelAgreement,
      dominantModel: ensemble.dominantModel,
    },
    kelly: {
      bets: kelly.bets.map(b => ({
        market: b.market,
        edge: b.edge,
        stakeUnits: b.stakeUnits,
        expectedValue: b.expectedValue,
        riskLevel: b.riskLevel,
        recommendation: b.recommendation,
      })),
      totalExposure: kelly.totalExposure,
      expectedROI: kelly.expectedROI,
      sharpeRatio: kelly.sharpeRatio,
    },
  };
}


/**
 * Blend base analysis with ML ensemble probabilities.
 * Recomputes valueTable, recommendation, Kelly, and ensemble metadata
 * using ML 1X2 probabilities while keeping Poisson for goal markets.
 */
export function blendAnalysisWithML(
  base: AnalysisResult,
  fixture: Fixture,
  mlProbabilities: Record<string, number>,
  mlConfidence: number
): AnalysisResult {
  const mlHomeWin = Math.round((mlProbabilities["HOME_WIN"] ?? base.probabilities.homeWin) * 100) / 100;
  const mlDraw = Math.round((mlProbabilities["DRAW"] ?? base.probabilities.draw) * 100) / 100;
  const mlAwayWin = Math.round((mlProbabilities["AWAY_WIN"] ?? base.probabilities.awayWin) * 100) / 100;

  const newProbabilities = {
    ...base.probabilities,
    homeWin: mlHomeWin,
    draw: mlDraw,
    awayWin: mlAwayWin,
  };

  // Recompute value table with ML 1X2 probabilities
  const newValueTable = buildValueTable(newProbabilities, fixture);

  // Rebuild recommendation
  const attractiveMarkets = newValueTable
    .filter((row) => {
      const impliedOdds = 100 / row.modelProbability;
      return row.edge > 0 && impliedOdds >= 1.4 && impliedOdds <= 8.0;
    })
    .sort((a, b) => {
      const scoreA = a.edge * Math.sqrt(a.modelProbability);
      const scoreB = b.edge * Math.sqrt(b.modelProbability);
      return scoreB - scoreA;
    });

  const best = attractiveMarkets[0]
    ?? newValueTable.filter((row) => row.edge > 0).sort((a, b) => b.edge - a.edge)[0]
    ?? newValueTable.sort((a, b) => b.edge - a.edge)[0]
    ?? fallbackMarket(newProbabilities);

  const bestFairOdds = round1(100 / best.modelProbability);
  const riskLevelText = base.confidence.score >= 68 ? "bajo" : base.confidence.score >= 52 ? "moderado" : "alto";
  const edgeText = newValueTable.length === 0
    ? "sin cuota real para calcular edge"
    : best.edge > 5 ? "edge significativo" : best.edge > 2 ? "edge moderado" : "edge mínimo";

  const homeForm = formScore(fixture.home.form);
  const awayForm = formScore(fixture.away.form);
  const formContext = homeForm > awayForm + 20
    ? `${fixture.home.name} en mejor forma (${homeForm} vs ${awayForm}).`
    : awayForm > homeForm + 20
    ? `${fixture.away.name} en mejor forma (${awayForm} vs ${homeForm}).`
    : "Equipos en forma similar.";

  const mlRationale = `${best.market}: ML-Ensemble ${best.modelProbability}% vs mercado ${best.marketProbability}% (${edgeText} +${best.edge}%). ` +
    `Cuota justa ${bestFairOdds}. Riesgo ${riskLevelText}. ${formContext} ` +
    `ML-Ensemble dominante (${mlConfidence}% confianza).`;

  // Recompute Kelly
  const newKelly = kellyPortfolio(
    newValueTable.filter((r) => r.edge > 0),
    fixture as any,
    base.confidence.score
  );

  // Update ensemble metadata
  const newEnsemble = base.ensemble ? {
    homeWin: mlHomeWin,
    draw: mlDraw,
    awayWin: mlAwayWin,
    models: base.ensemble.models,
    dominantModel: "ML-Ensemble",
    modelAgreement: Math.round(mlConfidence),
  } : undefined;

  return {
    ...base,
    probabilities: newProbabilities,
    valueTable: newValueTable,
    recommendation: {
      market: best.market,
      fairOdds: bestFairOdds,
      minimumOdds: round1(bestFairOdds * 1.05),
      stakeUnits: newKelly.bets.length > 0 ? Math.min(newKelly.bets[0].stakeUnits, base.recommendation.stakeUnits) : base.recommendation.stakeUnits,
      rationale: mlRationale,
    },
    ensemble: newEnsemble,
    kelly: base.kelly ? {
      bets: newKelly.bets.map((b) => ({
        market: b.market,
        edge: b.edge,
        stakeUnits: b.stakeUnits,
        expectedValue: b.expectedValue,
        riskLevel: b.riskLevel,
        recommendation: b.recommendation,
      })),
      totalExposure: newKelly.totalExposure,
      expectedROI: newKelly.expectedROI,
      sharpeRatio: newKelly.sharpeRatio,
    } : undefined,
  };
}
