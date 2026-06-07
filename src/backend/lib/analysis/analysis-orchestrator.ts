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
import { buildMultiMarketLayer } from "./models/multi-market-layer";
import { ensureMLServiceRunning } from "@/backend/lib/ml/ml-service-manager";
import { pickBestMarket } from "@/backend/lib/analysis/market-picker";
import { buildMLStatsPayload, predictWithML, type HybridMLPrediction, type MLPrediction } from "@/backend/lib/ml/predictor";
import { applyAnalysisPreferences } from "./apply-analysis-preferences";
import { buildAnalysisPipelineStatus, type AnalysisPipelineStatus } from "@/shared/analysis-pipeline";
import { buildValueTable, round1 } from "./shared-math";
import { kellyPortfolio } from "./models/kelly-criterion";
import {
  applyRoiCalibration,
  shouldAbstainRecommendation,
  type CalibrationGroupMetrics,
} from "./roi-calibration";
import { reconcileHybridProbabilities } from "./hybrid-consistency";
import { predictionMarketKey } from "@/shared/prediction-market-mapping";

type AnalyzeOptions = {
  events?: MatchEvent[];
  preferences?: AnalysisPreferences;
  roiCalibration?: RoiCalibrationContext;
};

export type RoiCalibrationContext = {
  marketMetrics?: CalibrationGroupMetrics | null;
  leagueMetrics?: CalibrationGroupMetrics | null;
  globalMetrics?: CalibrationGroupMetrics | null;
};

// The decorative "extended" models (Prophet/quantum/GNN/etc.) have no measured
// predictive validity, so they no longer influence 1X2 probabilities (display only).
const ML_BLEND_WEIGHT = 0.38;
const EXT_BLEND_WEIGHT = 0;
const TS_BLEND_WEIGHT = 0.62;

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
    const multiMarket = buildMultiMarketLayer(fixture, analysis);
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
        multiMarket,
        modelSources: { multiMarket: "typescript-multi-market-layer" },
      },
    };
  }

  const adv = analysis.advancedModels;
  const pack = buildExtendedStatisticalPack(fixture, adv.xgModel?.homeXg ?? 1.3, adv.xgModel?.awayXg ?? 1.1, analysis.probabilities);
  const multiMarket = buildMultiMarketLayer(fixture, analysis);
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
      multiMarket: adv.multiMarket ?? multiMarket,
      modelSources: {
        ...adv.modelSources,
        multiMarket: adv.modelSources?.multiMarket ?? "typescript-multi-market-layer",
      },
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

function isHybridPrediction(ml: MLPrediction | null): ml is HybridMLPrediction {
  return ml?.source === "hybrid";
}

/**
 * Hybrid pipeline output replaces blend — single coherent motor (DC → XGB → markets).
 */
export function applyHybridAnalysis(
  base: AnalysisResult,
  fixture: Fixture,
  hybrid: HybridMLPrediction
): AnalysisResult {
  const e = hybrid.probabilities.ensemble;
  const reconciled = reconcileHybridProbabilities({
    fixture,
    hybridProbabilities: {
      homeWin: e.HOME_WIN ?? base.probabilities.homeWin,
      draw: e.DRAW ?? base.probabilities.draw,
      awayWin: e.AWAY_WIN ?? base.probabilities.awayWin,
    },
    dixonColes: {
      lambdaHome: hybrid.dixonColes.lambda_local,
      lambdaAway: hybrid.dixonColes.mu_visitante,
      rho: hybrid.dixonColes.rho,
    },
    modelAgreement: hybrid.confidence,
  });
  const newProbabilities = {
    ...base.probabilities,
    homeWin: roundProb(reconciled.probabilities.homeWin),
    draw: roundProb(reconciled.probabilities.draw),
    awayWin: roundProb(reconciled.probabilities.awayWin),
    over25: roundProb(hybrid.over_25.over),
    btts: roundProb(hybrid.btts.yes),
  };

  const newValueTable = buildValueTable(newProbabilities, fixture);
  const picked = pickBestMarket(newValueTable, newProbabilities, fixture, hybrid.confidence);
  const best = picked.row;
  const bestFairOdds = best.modelProbability > 0 ? round1(100 / best.modelProbability) : 0;
  const newKelly = kellyPortfolio(
    newValueTable.filter((r) => r.edge > 0),
    fixture,
    hybrid.confidence
  );

  const markets = hybrid.markets as {
    ExactScore?: Array<{ score: string; probability: number }>;
    AsianHandicap?: Record<string, { Home?: number; Away?: number }>;
    ValueBets?: Array<{ market: string; modelProbability: number; marketProbability: number; edge: number; odds?: number }>;
  };

  const adv = base.advancedModels;
  const consistencyNote =
    reconciled.flags.length > 0
      ? " Compuerta de consistencia: 1X2 reconciliado con Dixon-Coles y mercado disponible por contradiccion fuerte."
      : "";
  const recommendationRationale =
    best.market === "Sin valor claro"
      ? `Sin valor claro: no hay cuota real con edge y Kelly positivo. Híbrido DC→XGB (λ=${hybrid.dixonColes.lambda_local}, μ=${hybrid.dixonColes.mu_visitante}).${consistencyNote}`
      : `${best.market}: Híbrido DC→XGB (λ=${hybrid.dixonColes.lambda_local}, μ=${hybrid.dixonColes.mu_visitante}) — modelo ${best.modelProbability}% vs mercado ${best.marketProbability}% (edge +${best.edge}%).${consistencyNote}`;
  return {
    ...base,
    probabilities: newProbabilities,
    valueTable: newValueTable,
    recommendation: {
      market: best.market,
      fairOdds: bestFairOdds,
      minimumOdds: round1(bestFairOdds * 1.05),
      stakeUnits: picked.actionable && picked.kellyBet ? Math.min(picked.kellyBet.stakeUnits, base.recommendation.stakeUnits) : 0,
      rationale: recommendationRationale,
    },
    ensemble: base.ensemble
      ? {
          ...base.ensemble,
          homeWin: newProbabilities.homeWin,
          draw: newProbabilities.draw,
          awayWin: newProbabilities.awayWin,
          dominantModel: "Hybrid DC→XGB",
          modelAgreement: Math.round(hybrid.confidence),
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
    advancedModels: adv
      ? {
          ...adv,
          dixonColes: {
            ...adv.dixonColes,
            rho: hybrid.dixonColes.rho,
          },
          hierarchical: {
            ...adv.hierarchical,
            lambdaHome: hybrid.dixonColes.lambda_local,
            lambdaAway: hybrid.dixonColes.mu_visitante,
            expectedTotalGoals: hybrid.dixonColes.expected_total_goals,
            homeWin: newProbabilities.homeWin,
            draw: newProbabilities.draw,
            awayWin: newProbabilities.awayWin,
          },
          hybridPipeline: {
            active: true,
            pipeline: hybrid.pipeline,
            lambdaLocal: hybrid.dixonColes.lambda_local,
            muVisitante: hybrid.dixonColes.mu_visitante,
            rho: hybrid.dixonColes.rho,
            modelsUsed: hybrid.models_used,
            exactScoreTop: markets.ExactScore?.slice(0, 6) ?? [],
            asianHandicap: markets.AsianHandicap ?? {},
            valueBets: markets.ValueBets ?? [],
            consistencyFlags: reconciled.flags,
            dixonColes1x2: reconciled.dixonColesProbabilities,
            marketPrior1x2: reconciled.marketPrior,
          },
          explainability: {
            topDrivers:
              hybrid.shap?.top_features?.map((f) => ({
                feature: f.feature,
                impact: Math.round(f.impact * 1000) / 10,
              })) ?? adv.explainability.topDrivers,
            method: hybrid.hybridReady ? "hybrid-xgb-shap" : "dixon-coles-fallback",
            dominantOutcome: hybrid.prediction,
          },
        }
      : undefined,
  };
}

/**
 * Display-only merge of the hybrid goal model (λ/μ, rho) when the model has NOT
 * passed its quality gate. Probabilities are left as the trusted Poisson core —
 * the untrusted XGBoost never overwrites them, it only annotates the payload.
 */
export function attachHybridGoalModelDisplay(
  base: AnalysisResult,
  hybrid: HybridMLPrediction
): AnalysisResult {
  const adv = base.advancedModels;
  if (!adv) return base;
  return {
    ...base,
    advancedModels: {
      ...adv,
      dixonColes: { ...adv.dixonColes, rho: hybrid.dixonColes.rho },
      hierarchical: {
        ...adv.hierarchical,
        lambdaHome: hybrid.dixonColes.lambda_local,
        lambdaAway: hybrid.dixonColes.mu_visitante,
        expectedTotalGoals: hybrid.dixonColes.expected_total_goals,
      },
      hybridPipeline: {
        active: false,
        pipeline: hybrid.pipeline,
        lambdaLocal: hybrid.dixonColes.lambda_local,
        muVisitante: hybrid.dixonColes.mu_visitante,
        rho: hybrid.dixonColes.rho,
        modelsUsed: hybrid.models_used,
        exactScoreTop: [],
        asianHandicap: {},
        valueBets: [],
        consistencyFlags: ["hybrid_quality_gate_not_passed"],
        dixonColes1x2: {
          homeWin: base.probabilities.homeWin,
          draw: base.probabilities.draw,
          awayWin: base.probabilities.awayWin,
        },
        marketPrior1x2: null,
      },
    },
  };
}

/**
 * Weighted blend: TS ensemble + ML (when a trusted model is present).
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
  }
  // Without a trusted ML model, the Poisson/Dixon-Coles core (tsHome/Draw/Away)
  // stands on its own — the extended statistical pack is no longer blended in.
  void extHome;
  void extDraw;
  void extAway;

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
  const picked = pickBestMarket(newValueTable, newProbabilities, fixture, base.confidence.score);
  const best = picked.row;
  const bestFairOdds = best.modelProbability > 0 ? round1(100 / best.modelProbability) : 0;
  const newKelly = kellyPortfolio(
    newValueTable.filter((r) => r.edge > 0),
    fixture,
    base.confidence.score
  );
  const hasActionableMarket = picked.actionable;

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
      stakeUnits: hasActionableMarket && picked.kellyBet
        ? Math.min(picked.kellyBet.stakeUnits, base.recommendation.stakeUnits)
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

export function applyRoiCalibrationToAnalysis(
  analysis: AnalysisResult,
  fixture: Fixture,
  context?: RoiCalibrationContext
): AnalysisResult {
  if (!context) return analysis;
  const marketKey = predictionMarketKey(analysis.recommendation.market);
  const row = analysis.valueTable.find((r) => r.market === analysis.recommendation.market);
  const rawProbability = row?.modelProbability ?? analysis.confidence.score;
  const edge = row?.edge ?? 0;
  const calibration = applyRoiCalibration({
    rawProbability,
    marketKey,
    leagueId: fixture.leagueId,
    marketMetrics: context.marketMetrics,
    leagueMetrics: context.leagueMetrics,
    globalMetrics: context.globalMetrics,
  });
  const abstention = shouldAbstainRecommendation({
    market: analysis.recommendation.market,
    stakeUnits: analysis.recommendation.stakeUnits,
    rawProbability,
    calibratedProbability: calibration.calibratedProbability,
    edge,
    marketMetrics: context.marketMetrics,
  });

  const advancedModels = analysis.advancedModels
    ? {
        ...analysis.advancedModels,
        calibration: {
          rawProbability: calibration.rawProbability,
          calibratedProbability: calibration.calibratedProbability,
          adjustment: calibration.adjustment,
          source: calibration.source,
          reliability: calibration.reliability,
          sampleSize: calibration.sampleSize,
          abstained: abstention.abstain,
          reason: abstention.abstain ? abstention.reason : calibration.reason,
        },
      }
    : analysis.advancedModels;

  if (!abstention.abstain) {
    return {
      ...analysis,
      recommendation: {
        ...analysis.recommendation,
        stakeUnits: abstention.adjustedStakeUnits,
        rationale: `${analysis.recommendation.rationale} Calibracion ROI: ${calibration.reason}`,
      },
      advancedModels,
    };
  }

  return {
    ...analysis,
    recommendation: {
      market: "Sin valor claro",
      fairOdds: 0,
      minimumOdds: 0,
      stakeUnits: 0,
      rationale: `${abstention.reason} Probabilidad calibrada ${calibration.calibratedProbability}% (${calibration.reason})`,
    },
    advancedModels,
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
  const mlServiceReady = await ensureMLServiceRunning();
  try {
    const extended = mlServiceReady ? await fetchExtendedModels(fixture, analysis) : null;
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
  if (isHybridPrediction(mlPrediction)) {
    analysis = mergeMLExplainability(analysis, mlPrediction);
    if (mlPrediction.qualityGatePassed) {
      // Trusted, backtested + calibrated model: blend into probabilities.
      analysis = applyHybridAnalysis(analysis, fixture, mlPrediction);
      mlBlended = true;
    } else {
      // Untrusted model (synthetic / failed backtest): keep the Poisson core
      // as the answer and only surface λ/μ + explainability for transparency.
      analysis = attachHybridGoalModelDisplay(analysis, mlPrediction);
    }
  } else if (mlPrediction?.probabilities?.ensemble) {
    // Legacy / heuristic ensemble is not quality-gated → display only, never
    // overwrites the Poisson probabilities.
    analysis = mergeMLExplainability(analysis, mlPrediction);
  }

  if (options?.preferences) {
    analysis = applyAnalysisPreferences(analysis, options.preferences);
  }

  analysis = applyRoiCalibrationToAnalysis(analysis, fixture, options?.roiCalibration);

  analysis = ensureAdvancedModelsComplete(analysis, fixture);
  if (analysis.advancedModels) {
    analysis = {
      ...analysis,
      advancedModels: {
        ...analysis.advancedModels,
        multiMarket: buildMultiMarketLayer(fixture, analysis, options?.events),
        modelSources: {
          ...analysis.advancedModels.modelSources,
          multiMarket: "typescript-multi-market-layer",
        },
      },
    };
  }

  const analysisPipeline = buildAnalysisPipelineStatus({
    analysis,
    extendedMerged,
    mlBlended,
    mlPrediction,
  });

  return { analysis, mlPrediction, extendedMerged, mlBlended, analysisPipeline };
}

