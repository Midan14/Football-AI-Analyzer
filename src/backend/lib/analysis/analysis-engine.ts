import type { AnalysisResult, Fixture, MatchEvent } from "@/shared/domain";
import {
  round1,
  impliedProbability,
  expectedGoals,
  buildAdjustedPoissonMatrix,
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
import { dixonColesModel } from "./models/dixon-coles";
import { hierarchicalPoisson } from "./models/hierarchical-poisson";
import { calculateValueBets } from "./models/value-bet-calculator";
import { skellamModel } from "./models/skellam";
import { zipModel } from "./models/zero-inflated-poisson";
import { kalmanFilter } from "./models/kalman-filter";
import { expectedThreatModel } from "./models/expected-threat";
import { hawkesModel } from "./models/hawkes-process";
import { bayesianUpdate } from "./models/bayesian-updater";
import { bivariatePoissonModel } from "./models/bivariate-poisson";
import { temporalBlendModel } from "./models/temporal-blend";
import { mlOpsMonitor } from "./models/ml-ops-monitor";
import { timeSeriesForecastModel } from "./models/time-series-forecast";
import { causalSurvivalModel } from "./models/causal-survival";
import { quantumStakeOptimizer } from "./models/quantum-optimizer";
import { buildExtendedStatisticalPack, sarimaExtension } from "./models/extended-statistical-pack";

type ValueRow = AnalysisResult["valueTable"][number];

type AnalyzeFixtureOptions = {
  events?: MatchEvent[];
};

function pickBestMarket(
  valueTable: AnalysisResult["valueTable"],
  probabilities: AnalysisResult["probabilities"]
): ValueRow {
  const attractiveMarkets = valueTable
    .filter((row) => {
      const impliedOdds = 100 / row.modelProbability;
      return row.marketProbability > 0 && row.edge > 0 && impliedOdds >= 1.4 && impliedOdds <= 8.0;
    })
    .sort((a, b) => {
      const scoreA = a.edge * Math.sqrt(a.modelProbability);
      const scoreB = b.edge * Math.sqrt(b.modelProbability);
      return scoreB - scoreA;
    });

  return attractiveMarkets[0]
    ?? valueTable.filter((row) => row.marketProbability > 0 && row.edge > 0).sort((a, b) => b.edge - a.edge)[0]
    ?? valueTable.sort((a, b) => b.edge - a.edge)[0]
    ?? fallbackMarket(probabilities);
}

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
    market: `${market}`,
    modelProbability,
    marketProbability: 0,
    edge: 0,
    verdict: "Solo modelo (sin cuotas de bookmaker)",
  };
}

export function analyzeFixture(fixture: Fixture, options?: AnalyzeFixtureOptions): AnalysisResult {
  const xg = expectedGoals(fixture);
  const matrix = buildAdjustedPoissonMatrix(xg, fixture);
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
  let confidenceScore = clampConfidenceForSample(
    rawConfidence,
    fixture.home.matchesPlayed,
    fixture.away.matchesPlayed
  );
  const stakeUnits = computeStakeUnits(confidenceScore);

  const valueTable = buildValueTable(probabilities, fixture);

  // Pick best market: balance edge, model probability, and odds attractiveness
  const best = pickBestMarket(valueTable, probabilities);

  const homeForm = formScore(fixture.home.form);
  const awayForm = formScore(fixture.away.form);

  // ── Ensemble Model (4 models blended) ─────────────────────────────────
  const poissonProbs = { homeWin: probabilities.homeWin, draw: probabilities.draw, awayWin: probabilities.awayWin };
  const ensemble = ensembleModel(fixture, poissonProbs, xg.home, xg.away);

  // ── Kelly Criterion (optimal staking) ─────────────────────────────────
  const kelly = kellyPortfolio(
    valueTable.filter(r => r.edge > 0),
    fixture,
    confidenceScore
  );

  // ── Dixon-Coles Correction ────────────────────────────────────────────
  const dixonColes = dixonColesModel(fixture, xg.home, xg.away);

  // ── Hierarchical Poisson (multi-factor λ) ─────────────────────────────
  const hierarchical = hierarchicalPoisson(fixture);

  // ── Value Bet Calculator (EV-based) ───────────────────────────────────
  // Runs after we have the analysis result, so we pass a partial result
  const partialAnalysis = { probabilities, valueTable, confidence: { score: confidenceScore, penalties }, recommendation: { market: best.market, fairOdds: round1(100 / Math.max(1, best.modelProbability)), minimumOdds: 0, stakeUnits: 0, rationale: "" }, riskFlags, radar: [], topExactScores, goalMarkets, fixtureId: fixture.id } as AnalysisResult;
  const valueBetReport = calculateValueBets(partialAnalysis, fixture, confidenceScore);

  // ── Skellam (goal difference / handicaps) ─────────────────────────────
  const skellam = skellamModel(xg.home, xg.away);

  // ── Zero-Inflated Poisson (defensive matches) ─────────────────────────
  const zip = zipModel(fixture, xg.home, xg.away);

  // ── Kalman Filter (team strength trend) ───────────────────────────────
  const kalman = kalmanFilter(fixture);

  // ── Expected Threat (territorial dominance) ───────────────────────────
  const xThreat = expectedThreatModel(fixture);

  // ── Hawkes (goal clustering / live momentum) ──────────────────────────
  const hawkes = hawkesModel(fixture, xg.home, xg.away, options?.events);

  // ── Bayesian updating (live score/events → posterior) ─────────────────
  const bayesian = bayesianUpdate(
    fixture,
    {
      homeWin: ensemble.homeWin,
      draw: ensemble.draw,
      awayWin: ensemble.awayWin,
      over25: probabilities.over25,
      btts: probabilities.btts,
    },
    options?.events
  );

  // ── Extended models (previously inactive) ─────────────────────────────
  const bivariatePoisson = bivariatePoissonModel(fixture, xg.home, xg.away);
  const temporalBlend = temporalBlendModel(fixture, xg.home, xg.away, 0.7);
  const timeSeries = timeSeriesForecastModel(fixture);
  const sarima = sarimaExtension(fixture);
  const extendedPack = buildExtendedStatisticalPack(fixture, xg.home, xg.away, {
    homeWin: probabilities.homeWin,
    draw: probabilities.draw,
    awayWin: probabilities.awayWin,
  });
  const causalSurvival = causalSurvivalModel(fixture, xg.home, xg.away);

  let finalProbabilities = probabilities;
  let finalValueTable = valueTable;
  let finalBest = best;
  let finalKelly = kelly;

  if (fixture.status === "live" && (fixture.elapsed ?? 0) > 0) {
    finalProbabilities = {
      ...probabilities,
      homeWin: bayesian.posterior.homeWin,
      draw: bayesian.posterior.draw,
      awayWin: bayesian.posterior.awayWin,
      over25: bayesian.posterior.over25,
      btts: bayesian.posterior.btts,
    };
    finalValueTable = buildValueTable(finalProbabilities, fixture);
    finalBest = pickBestMarket(finalValueTable, finalProbabilities);
    finalKelly = kellyPortfolio(
      finalValueTable.filter((r) => r.edge > 0),
      fixture,
      confidenceScore
    );
    if (Math.abs(bayesian.shift.homeWin) >= 5 || Math.abs(bayesian.shift.awayWin) >= 5) {
      addPenalty(
        "live_bayesian_shift",
        `Actualización en vivo (Bayes): ${bayesian.keyEvents[0]?.event ?? "marcador actual"}`,
        3,
        "medium"
      );
      confidenceScore = clampConfidenceForSample(
        computeConfidence(penalties),
        fixture.home.matchesPlayed,
        fixture.away.matchesPlayed
      );
      finalKelly = kellyPortfolio(
        finalValueTable.filter((r) => r.edge > 0),
        fixture,
        confidenceScore
      );
    }
  }

  // Build dynamic rationale
  const bestFairOdds = round1(100 / Math.max(1, finalBest.modelProbability));
  const riskLevelText = confidenceScore >= 72 ? "bajo" : confidenceScore >= 58 ? "moderado" : "alto";
  const hasActionableMarket = finalBest.marketProbability > 0 && finalBest.edge > 0 && finalKelly.bets.length > 0;
  const edgeText = finalBest.marketProbability <= 0
    ? "sin cuota real para calcular edge"
    : finalBest.edge > 5 ? "edge significativo" : finalBest.edge > 2 ? "edge moderado" : "edge mínimo";
  const formContext = homeForm > awayForm + 20
    ? `${fixture.home.name} en mejor forma (${homeForm} vs ${awayForm}).`
    : awayForm > homeForm + 20
    ? `${fixture.away.name} en mejor forma (${awayForm} vs ${homeForm}).`
    : "Equipos en forma similar.";

  const modelsUsed = `Ensemble: ${ensemble.dominantModel} dominante (acuerdo ${ensemble.modelAgreement}%).${
    fixture.status === "live" ? ` Hawkes: momentum ${hawkes.homeMomentum}/${hawkes.awayMomentum}.` : ""
  }`;
  const rationale = finalBest.marketProbability <= 0
    ? `${finalBest.market}: modelo ${finalBest.modelProbability}%, pero no hay cuotas reales del bookmaker. Cuota justa ${bestFairOdds}. Riesgo ${riskLevelText}. ${formContext} ${modelsUsed}`
    : `${finalBest.market}: modelo ${finalBest.modelProbability}% vs mercado ${finalBest.marketProbability}% (${edgeText} +${finalBest.edge}%). ` +
      `Cuota justa ${bestFairOdds}. Riesgo ${riskLevelText}. ${formContext} ${modelsUsed}`;

  const resultDraft: AnalysisResult = {
    fixtureId: fixture.id,
    probabilities: finalProbabilities,
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
      market: finalBest.market,
      fairOdds: bestFairOdds,
      minimumOdds: round1(bestFairOdds * 1.05),
      stakeUnits: hasActionableMarket ? Math.min(finalKelly.bets[0].stakeUnits, stakeUnits) : 0,
      rationale,
    },
    valueTable: finalValueTable,
    ensemble: {
      homeWin: ensemble.homeWin,
      draw: ensemble.draw,
      awayWin: ensemble.awayWin,
      models: ensemble.models,
      modelAgreement: ensemble.modelAgreement,
      dominantModel: ensemble.dominantModel,
    },
    kelly: {
      bets: finalKelly.bets.map(b => ({
        market: b.market,
        edge: b.edge,
        stakeUnits: b.stakeUnits,
        expectedValue: b.expectedValue,
        riskLevel: b.riskLevel,
        recommendation: b.recommendation,
      })),
      totalExposure: finalKelly.totalExposure,
      expectedROI: finalKelly.expectedROI,
      sharpeRatio: finalKelly.sharpeRatio,
    },
    advancedModels: {
      dixonColes: {
        rho: dixonColes.rho,
        prob00: dixonColes.prob00,
        prob11: dixonColes.prob11,
        correction00: dixonColes.correction00,
        correction11: dixonColes.correction11,
      },
      hierarchical: {
        lambdaHome: hierarchical.lambdaHome,
        lambdaAway: hierarchical.lambdaAway,
        expectedTotalGoals: hierarchical.expectedTotalGoals,
        homeWin: hierarchical.homeWin,
        draw: hierarchical.draw,
        awayWin: hierarchical.awayWin,
      },
      skellam: {
        mostLikelyDiff: skellam.mostLikelyDiff,
        expectedDiff: skellam.expectedDiff,
        ahMinus05: skellam.ahMinus05,
        ahMinus1: skellam.ahMinus1,
      },
      zip: {
        prob00: zip.prob00,
        drawAdjustment: zip.drawAdjustment,
        piHome: zip.piHome,
        piAway: zip.piAway,
      },
      kalman: {
        homeAttack: kalman.homeAttackStrength,
        homeDefense: kalman.homeDefenseStrength,
        awayAttack: kalman.awayAttackStrength,
        awayDefense: kalman.awayDefenseStrength,
        homeTrend: kalman.homeTrend,
        awayTrend: kalman.awayTrend,
      },
      xThreat: {
        homeThreat: xThreat.homeThreat,
        awayThreat: xThreat.awayThreat,
        dominance: xThreat.territorialDominance,
        dominanceScore: xThreat.dominanceScore,
      },
      valueBets: {
        bestBet: valueBetReport.bestBet ? {
          market: valueBetReport.bestBet.market,
          ev: valueBetReport.bestBet.evPercent,
          grade: valueBetReport.bestBet.grade,
        } : null,
        totalPositiveEV: valueBetReport.valueBets.length,
        overround: valueBetReport.overround,
        marketEfficiency: valueBetReport.marketEfficiency,
      },
      hawkes: {
        homeMomentum: hawkes.homeMomentum,
        awayMomentum: hawkes.awayMomentum,
        nextGoalIn10min: hawkes.nextGoalIn10min,
        expectedTotalGoals: hawkes.expectedTotalGoals,
        clusteringCoeff: hawkes.clusteringCoeff,
      },
      bayesian: {
        posterior: bayesian.posterior,
        shift: bayesian.shift,
        updateConfidence: bayesian.updateConfidence,
        keyEvents: bayesian.keyEvents,
        xgRemaining: bayesian.xgRemaining,
        timeDecay: bayesian.timeDecay,
      },
      bivariatePoisson: {
        lambdaHome: bivariatePoisson.lambdaHome,
        lambdaAway: bivariatePoisson.lambdaAway,
        kappa: bivariatePoisson.kappa,
        homeWin: bivariatePoisson.homeWin,
        draw: bivariatePoisson.draw,
        awayWin: bivariatePoisson.awayWin,
        covariance: bivariatePoisson.covariance,
      },
      temporalBlend: {
        recentWeight: temporalBlend.recentWeight,
        seasonWeight: temporalBlend.seasonWeight,
        blendedHomeXg: temporalBlend.blendedHomeXg,
        blendedAwayXg: temporalBlend.blendedAwayXg,
        homeWin: temporalBlend.homeWin,
        draw: temporalBlend.draw,
        awayWin: temporalBlend.awayWin,
      },
      timeSeries: {
        prophetTrend: timeSeries.prophet.trend,
        arimaHomeWin: timeSeries.arima.forecastHomeWin,
        tftHomeWin: timeSeries.tft.homeWin,
        nbeatsHomeWin: timeSeries.nbeats.homeWin,
        sarimaHomeWin: sarima.sarimaHomeWin,
        sarimaSeasonality: sarima.sarimaSeasonality,
        ensembleHomeWin: timeSeries.ensembleHomeWin,
        ensembleDraw: timeSeries.ensembleDraw,
        ensembleAwayWin: timeSeries.ensembleAwayWin,
      },
      halfTime: extendedPack.halfTime,
      cornersEsp: extendedPack.cornersEsp,
      cardsRisk: extendedPack.cardsRisk,
      xgModel: extendedPack.xgModel,
      explainability: extendedPack.explainability,
      featureEngineering: extendedPack.featureEngineering,
      autoMl: extendedPack.autoMl,
      causalSurvival: {
        gnnDelta: causalSurvival.gnn.messagePassingDelta,
        causalLift: causalSurvival.causal.totalCausalLift,
        survivalProbNoGoal60: causalSurvival.survival.survivalProbNoGoal60,
        medianMinutesToNextGoal: causalSurvival.survival.medianMinutesToNextGoal,
      },
      quantumOptimizer: {
        method: "QAOA-simulated",
        optimalExposure: 0,
        energy: 0,
        topMarket: null,
      },
      mlOps: {
        runId: "",
        schemaValid: true,
        driftScore: 0,
        driftStatus: "stable",
        featureCompleteness: 0,
        qualityGatePassed: true,
      },
    },
  };

  const mlOps = mlOpsMonitor(fixture, resultDraft);
  const quantum = quantumStakeOptimizer(resultDraft);

  resultDraft.advancedModels!.mlOps = {
    runId: mlOps.runId,
    schemaValid: mlOps.schemaValid,
    driftScore: mlOps.driftScore,
    driftStatus: mlOps.driftStatus,
    featureCompleteness: mlOps.featureCompleteness,
    qualityGatePassed: mlOps.qualityGatePassed,
  };
  resultDraft.advancedModels!.quantumOptimizer = {
    method: quantum.method,
    optimalExposure: quantum.optimalExposure,
    energy: quantum.energy,
    topMarket: quantum.stakeVector[0]?.market ?? null,
  };

  if (!mlOps.qualityGatePassed && mlOps.driftStatus === "critical") {
    addPenalty("ml_ops_drift", "Drift crítico detectado (Evidently)", 4, "medium");
    resultDraft.confidence.score = clampConfidenceForSample(
      computeConfidence(penalties),
      fixture.home.matchesPlayed,
      fixture.away.matchesPlayed
    );
  }

  return resultDraft;
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
      return row.marketProbability > 0 && row.edge > 0 && impliedOdds >= 1.4 && impliedOdds <= 8.0;
    })
    .sort((a, b) => {
      const scoreA = a.edge * Math.sqrt(a.modelProbability);
      const scoreB = b.edge * Math.sqrt(b.modelProbability);
      return scoreB - scoreA;
    });

  const best = attractiveMarkets[0]
    ?? newValueTable.filter((row) => row.marketProbability > 0 && row.edge > 0).sort((a, b) => b.edge - a.edge)[0]
    ?? newValueTable.sort((a, b) => b.edge - a.edge)[0]
    ?? fallbackMarket(newProbabilities);

  const bestFairOdds = round1(100 / best.modelProbability);
  const riskLevelText = base.confidence.score >= 68 ? "bajo" : base.confidence.score >= 52 ? "moderado" : "alto";
  const edgeText = best.marketProbability <= 0
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
    fixture,
    base.confidence.score
  );
  const hasActionableMarket = best.marketProbability > 0 && best.edge > 0 && newKelly.bets.length > 0;

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
      stakeUnits: hasActionableMarket ? Math.min(newKelly.bets[0].stakeUnits, base.recommendation.stakeUnits) : 0,
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
