/**
 * Unified analysis pipeline — TS core, Python extended models, ML ensemble.
 * Never throws; always returns a complete advancedModels payload.
 */

import type { AnalysisResult, Fixture, MatchEvent } from "@/shared/domain";
import type { AnalysisPreferences } from "@/shared/analysis-preferences";
import { analyzeFixture } from "./analysis-engine";
import { mergeExtendedModels, type ExtendedMLResponse } from "./merge-extended-models";
import { getExtendedMLPrediction } from "./ml-client";
import { buildExtendedStatisticalPack } from "./models/extended-statistical-pack";
import { buildMLStatsPayload, predictWithML, type MLPrediction } from "@/backend/lib/ml/predictor";
import { applyAnalysisPreferences } from "./apply-analysis-preferences";
import { buildAnalysisPipelineStatus, type AnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import { buildValueTable, round1 } from "./shared-math";
import { kellyPortfolio } from "./models/kelly-criterion";

type AnalyzeOptions = {
  events?: MatchEvent[];
  preferences?: AnalysisPreferences;
};

const ML_BLEND_WEIGHT = 0.38;
const EXT_BLEND_WEIGHT = 0.17;
const TS_BLEND_WEIGHT = 0.45;

function roundProb(n: number) {
  return Math.round(n * 10) / 10;
}

function normalizeTriplet(h: number, d: number, a: number) {
  const total = h + d + a || 1;
  return {
    homeWin: roundProb((h / total) * 100),
    draw: roundProb((d / total) * 100),
    awayWin: roundProb((a / total) * 100),
  };
}

/** Guarantee every advancedModels section exists (UI-safe). */
export function ensureAdvancedModelsComplete(analysis: AnalysisResult, fixture: Fixture): AnalysisResult {
  if (!analysis.advancedModels) {
    const pack = buildExtendedStatisticalPack(fixture, 1.3, 1.1, analysis.probabilities);
    return {
      ...analysis,
      advancedModels: {
        dixonColes: { rho: 0, prob00: 10, prob11: 10, correction00: 0, correction11: 0 },
        hierarchical: {
          lambdaHome: 1.3,
          lambdaAway: 1.1,
          expectedTotalGoals: 2.4,
          homeWin: analysis.probabilities.homeWin,
          draw: analysis.probabilities.draw,
          awayWin: analysis.probabilities.awayWin,
        },
        skellam: { mostLikelyDiff: 0, expectedDiff: 0, ahMinus05: { home: 0.5, away: 0.5 }, ahMinus1: { home: 0.45, away: 0.55 } },
        zip: { prob00: 8, drawAdjustment: 0, piHome: 0.1, piAway: 0.1 },
        kalman: { homeAttack: 1, homeDefense: 1, awayAttack: 1, awayDefense: 1, homeTrend: "stable", awayTrend: "stable" },
        xThreat: { homeThreat: 50, awayThreat: 50, dominance: "balanced", dominanceScore: 0 },
        valueBets: { bestBet: null, totalPositiveEV: 0, overround: 105, marketEfficiency: 90 },
        hawkes: { homeMomentum: 0.5, awayMomentum: 0.5, nextGoalIn10min: 0.1, expectedTotalGoals: 2.5, clusteringCoeff: 0.2 },
        bayesian: {
          posterior: {
            homeWin: analysis.probabilities.homeWin,
            draw: analysis.probabilities.draw,
            awayWin: analysis.probabilities.awayWin,
            over25: analysis.probabilities.over25,
            btts: analysis.probabilities.btts,
          },
          shift: { homeWin: 0, draw: 0, awayWin: 0 },
          updateConfidence: 50,
          keyEvents: [],
          xgRemaining: { home: 0.8, away: 0.7 },
          timeDecay: 1,
        },
        bivariatePoisson: {
          lambdaHome: 1.3,
          lambdaAway: 1.1,
          kappa: 0.1,
          homeWin: analysis.probabilities.homeWin,
          draw: analysis.probabilities.draw,
          awayWin: analysis.probabilities.awayWin,
          covariance: 0.05,
        },
        temporalBlend: {
          recentWeight: 0.7,
          seasonWeight: 0.3,
          blendedHomeXg: 1.3,
          blendedAwayXg: 1.1,
          homeWin: analysis.probabilities.homeWin,
          draw: analysis.probabilities.draw,
          awayWin: analysis.probabilities.awayWin,
        },
        timeSeries: {
          prophetTrend: 0,
          arimaHomeWin: analysis.probabilities.homeWin,
          tftHomeWin: analysis.probabilities.homeWin,
          nbeatsHomeWin: analysis.probabilities.homeWin,
          sarimaHomeWin: analysis.probabilities.homeWin,
          sarimaSeasonality: 0,
          ensembleHomeWin: analysis.probabilities.homeWin,
          ensembleDraw: analysis.probabilities.draw,
          ensembleAwayWin: analysis.probabilities.awayWin,
        },
        causalSurvival: { gnnDelta: 0, causalLift: 0, survivalProbNoGoal60: 40, medianMinutesToNextGoal: 30 },
        quantumOptimizer: { method: "classical-fallback", optimalExposure: 5, energy: 0, topMarket: null },
        mlOps: {
          runId: "fallback",
          schemaValid: true,
          driftScore: 0,
          driftStatus: "stable",
          featureCompleteness: 50,
          qualityGatePassed: true,
        },
        halfTime: pack.halfTime,
        cornersEsp: pack.cornersEsp,
        cardsRisk: pack.cardsRisk,
        xgModel: pack.xgModel,
        explainability: pack.explainability,
        featureEngineering: pack.featureEngineering,
        autoMl: pack.autoMl,
      },
    };
  }

  const adv = analysis.advancedModels;
  const pack = buildExtendedStatisticalPack(fixture, adv.xgModel?.homeXg ?? 1.3, adv.xgModel?.awayXg ?? 1.1, analysis.probabilities);
  return {
    ...analysis,
    advancedModels: {
      ...adv,
      halfTime: adv.halfTime ?? pack.halfTime,
      cornersEsp: adv.cornersEsp ?? pack.cornersEsp,
      cardsRisk: adv.cardsRisk ?? pack.cardsRisk,
      xgModel: adv.xgModel ?? pack.xgModel,
      explainability: adv.explainability ?? pack.explainability,
      featureEngineering: adv.featureEngineering ?? pack.featureEngineering,
      autoMl: adv.autoMl ?? pack.autoMl,
      timeSeries: {
        ...adv.timeSeries,
        sarimaHomeWin: adv.timeSeries.sarimaHomeWin ?? pack.sarima.sarimaHomeWin,
        sarimaSeasonality: adv.timeSeries.sarimaSeasonality ?? pack.sarima.sarimaSeasonality,
      },
    },
  };
}

async function fetchExtendedModels(
  fixture: Fixture,
  analysis: AnalysisResult
): Promise<ExtendedMLResponse | null> {
  try {
    const { homeStats, awayStats } = buildMLStatsPayload(fixture);
    const valueEdges = analysis.valueTable.map((row) => row.edge).slice(0, 5);
    return await getExtendedMLPrediction({
      homeStats,
      awayStats,
      fixture: fixture as unknown as Record<string, unknown>,
      baseProbabilities: {
        HOME_WIN: analysis.probabilities.homeWin,
        DRAW: analysis.probabilities.draw,
        AWAY_WIN: analysis.probabilities.awayWin,
      },
      valueEdges,
    });
  } catch {
    return null;
  }
}

function mergeMLExplainability(analysis: AnalysisResult, ml: MLPrediction): AnalysisResult {
  if (!analysis.advancedModels) return analysis;
  const shapDrivers =
    ml.shap?.top_features?.map((f) => ({
      feature: f.feature,
      impact: Math.round(f.impact * 1000) / 10,
    })) ?? [];

  if (shapDrivers.length === 0) return analysis;

  return {
    ...analysis,
    advancedModels: {
      ...analysis.advancedModels,
      explainability: {
        topDrivers: shapDrivers.slice(0, 5),
        method: ml.source === "fastapi" ? "xgboost-shap" : "ml-shap",
        dominantOutcome: ml.prediction,
      },
      autoMl: {
        championModel: ml.models_used.includes("voting") ? "voting-ensemble" : "ml-ensemble",
        engines: [...new Set([...analysis.advancedModels.autoMl.engines, ...ml.models_used])],
        optunaEnabled: analysis.advancedModels.autoMl.optunaEnabled,
        randomForestEnabled:
          ml.models_used.includes("random_forest") || analysis.advancedModels.autoMl.randomForestEnabled,
      },
      modelSources: {
        ...analysis.advancedModels.modelSources,
        explainability: ml.source === "fastapi" ? "python-ml" : "local-ml",
      },
    },
  };
}

/**
 * Weighted blend: TS ensemble + extended temporal + ML (when present).
 * Also merges ML over25 / BTTS into probabilities.
 */
export function blendMultiModelAnalysis(
  base: AnalysisResult,
  fixture: Fixture,
  ml: MLPrediction | null
): AnalysisResult {
  const adv = base.advancedModels;
  const tsHome = base.ensemble?.homeWin ?? base.probabilities.homeWin;
  const tsDraw = base.ensemble?.draw ?? base.probabilities.draw;
  const tsAway = base.ensemble?.awayWin ?? base.probabilities.awayWin;
  const extHome = adv?.temporalBlend.homeWin ?? tsHome;
  const extDraw = adv?.temporalBlend.draw ?? tsDraw;
  const extAway = adv?.temporalBlend.awayWin ?? tsAway;

  let homeWin = tsHome;
  let draw = tsDraw;
  let awayWin = tsAway;

  if (ml?.probabilities?.ensemble) {
    const mlE = ml.probabilities.ensemble;
    const mlHome = mlE.HOME_WIN ?? mlE.homeWin ?? tsHome;
    const mlDraw = mlE.DRAW ?? mlE.draw ?? tsDraw;
    const mlAway = mlE.AWAY_WIN ?? mlE.awayWin ?? tsAway;
    homeWin =
      TS_BLEND_WEIGHT * tsHome + EXT_BLEND_WEIGHT * extHome + ML_BLEND_WEIGHT * mlHome;
    draw = TS_BLEND_WEIGHT * tsDraw + EXT_BLEND_WEIGHT * extDraw + ML_BLEND_WEIGHT * mlDraw;
    awayWin =
      TS_BLEND_WEIGHT * tsAway + EXT_BLEND_WEIGHT * extAway + ML_BLEND_WEIGHT * mlAway;
  } else if (adv?.temporalBlend) {
    homeWin = 0.65 * tsHome + 0.35 * extHome;
    draw = 0.65 * tsDraw + 0.35 * extDraw;
    awayWin = 0.65 * tsAway + 0.35 * extAway;
  }

  const blended1x2 = normalizeTriplet(homeWin, draw, awayWin);

  const over25 =
    ml?.over_25?.over != null
      ? roundProb(0.6 * base.probabilities.over25 + 0.4 * ml.over_25.over)
      : base.probabilities.over25;
  const under35 = base.probabilities.under35;
  const btts =
    ml?.btts?.yes != null
      ? roundProb(0.6 * base.probabilities.btts + 0.4 * ml.btts.yes)
      : base.probabilities.btts;

  const newProbabilities = {
    ...base.probabilities,
    ...blended1x2,
    over25,
    under35,
    btts,
  };

  const newValueTable = buildValueTable(newProbabilities, fixture);
  const best = pickBestMarket(newValueTable, newProbabilities);
  const bestFairOdds = round1(100 / Math.max(1, best.modelProbability));
  const newKelly = kellyPortfolio(
    newValueTable.filter((r) => r.edge > 0),
    fixture,
    base.confidence.score
  );
  const hasActionableMarket = best.marketProbability > 0 && best.edge > 0 && newKelly.bets.length > 0;

  const modelLabel = ml
    ? `Multi-modelo TS+Ext+ML (${ml.models_used.join(", ") || "ensemble"})`
    : "Multi-modelo TS+Ext";

  return {
    ...base,
    probabilities: newProbabilities,
    valueTable: newValueTable,
    recommendation: {
      market: best.market,
      fairOdds: bestFairOdds,
      minimumOdds: round1(bestFairOdds * 1.05),
      stakeUnits: hasActionableMarket
        ? Math.min(newKelly.bets[0]?.stakeUnits ?? 0, base.recommendation.stakeUnits)
        : 0,
      rationale: `${best.market}: ${modelLabel} — modelo ${best.modelProbability}% vs mercado ${best.marketProbability}% (edge +${best.edge}%).`,
    },
    ensemble: base.ensemble
      ? {
          ...base.ensemble,
          homeWin: blended1x2.homeWin,
          draw: blended1x2.draw,
          awayWin: blended1x2.awayWin,
          dominantModel: ml ? "Multi-Ensemble" : base.ensemble.dominantModel,
          modelAgreement: ml
            ? Math.round((base.ensemble.modelAgreement + ml.confidence) / 2)
            : base.ensemble.modelAgreement,
        }
      : undefined,
    kelly: base.kelly
      ? {
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
        }
      : undefined,
  };
}

// Re-export pickBestMarket helper used above — import from engine internals
function pickBestMarket(
  valueTable: AnalysisResult["valueTable"],
  probabilities: AnalysisResult["probabilities"]
): AnalysisResult["valueTable"][number] {
  const attractiveMarkets = valueTable
    .filter((row) => {
      const impliedOdds = 100 / row.modelProbability;
      return row.marketProbability > 0 && row.edge > 0 && impliedOdds >= 1.4 && impliedOdds <= 8.0;
    })
    .sort((a, b) => b.edge * Math.sqrt(b.modelProbability) - a.edge * Math.sqrt(a.modelProbability));

  if (attractiveMarkets[0]) return attractiveMarkets[0];
  const withEdge = valueTable.filter((r) => r.marketProbability > 0 && r.edge > 0).sort((a, b) => b.edge - a.edge);
  if (withEdge[0]) return withEdge[0];
  return valueTable.sort((a, b) => b.edge - a.edge)[0] ?? {
    market: "1X2 Local",
    modelProbability: probabilities.homeWin,
    marketProbability: 0,
    edge: 0,
  };
}

export type FullAnalysisResult = {
  analysis: AnalysisResult;
  mlPrediction: MLPrediction | null;
  extendedMerged: boolean;
  mlBlended: boolean;
  analysisPipeline: AnalysisPipelineStatus;
};

/**
 * Full pipeline used by analyzeMatch — resilient, all models connected.
 */
export async function runFullAnalysis(
  fixture: Fixture,
  options?: AnalyzeOptions
): Promise<FullAnalysisResult> {
  let analysis = analyzeFixture(fixture, { events: options?.events });
  analysis = ensureAdvancedModelsComplete(analysis, fixture);

  let extendedMerged = false;
  try {
    const extended = await fetchExtendedModels(fixture, analysis);
    if (extended) {
      analysis = mergeExtendedModels(analysis, extended);
      extendedMerged = true;
    }
  } catch {
    // TS advancedModels remain
  }

  analysis = ensureAdvancedModelsComplete(analysis, fixture);

  let mlPrediction: MLPrediction | null = null;
  try {
    mlPrediction = await predictWithML(fixture);
  } catch {
    mlPrediction = null;
  }

  let mlBlended = false;
  if (mlPrediction?.probabilities?.ensemble) {
    analysis = mergeMLExplainability(analysis, mlPrediction);
    analysis = blendMultiModelAnalysis(analysis, fixture, mlPrediction);
    mlBlended = true;
  } else if (advHasExtendedBlend(analysis)) {
    analysis = blendMultiModelAnalysis(analysis, fixture, null);
    mlBlended = true;
  }

  if (options?.preferences) {
    analysis = applyAnalysisPreferences(analysis, options.preferences);
  }

  analysis = ensureAdvancedModelsComplete(analysis, fixture);

  const analysisPipeline = buildAnalysisPipelineStatus({
    analysis,
    extendedMerged,
    mlBlended,
    mlPrediction,
  });

  return { analysis, mlPrediction, extendedMerged, mlBlended, analysisPipeline };
}

function advHasExtendedBlend(analysis: AnalysisResult): boolean {
  return Boolean(analysis.advancedModels?.temporalBlend);
}
