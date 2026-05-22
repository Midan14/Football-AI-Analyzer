/**
 * Merge Python extended-model output into AnalysisResult.advancedModels.
 * Python sections replace TS approximations when source === "python" or engines present.
 */

import type { AnalysisResult } from "@/shared/domain";

export type ExtendedMLResponse = {
  libraries?: Record<string, boolean>;
  models_run?: number;
  timeSeries?: ExtendedSection & {
    prophetTrend: number;
    arimaHomeWin: number;
    tftHomeWin: number;
    nbeatsHomeWin: number;
    sarimaHomeWin?: number;
    sarimaSeasonality?: number;
    ensembleHomeWin: number;
    ensembleDraw: number;
    ensembleAwayWin: number;
    engines?: string[];
  };
  halfTime?: ExtendedSection & {
    homeWinHT: number;
    drawHT: number;
    awayWinHT: number;
    expectedGoalsHT: number;
    over05HT: number;
  };
  cornersEsp?: ExtendedSection & {
    expectedTotalCorners: number;
    homeCorners: number;
    awayCorners: number;
    over95Corners: number;
  };
  cardsRisk?: ExtendedSection & {
    expectedYellows: number;
    expectedReds: number;
    homeCardsIndex: number;
    awayCardsIndex: number;
    highCardRisk: boolean;
  };
  xgModel?: ExtendedSection & {
    homeXg: number;
    awayXg: number;
    totalXg: number;
    bttsFromXg: number;
    engine?: string;
  };
  explainability?: ExtendedSection & {
    topDrivers: Array<{ feature: string; impact: number }>;
    method: string;
    dominantOutcome?: string;
  };
  featureEngineering?: ExtendedSection & {
    rollingFeatureCount: number;
    tsfreshProxyScore: number;
  };
  autoMl?: ExtendedSection & {
    championModel: string;
    engines: string[];
    optunaEnabled?: boolean;
    randomForestEnabled?: boolean;
  };
  bivariatePoisson?: ExtendedSection & {
    lambdaHome: number;
    lambdaAway: number;
    kappa: number;
    homeWin: number;
    draw: number;
    awayWin: number;
    covariance: number;
  };
  temporalBlend?: ExtendedSection & {
    recentWeight: number;
    seasonWeight: number;
    blendedHomeXg: number;
    blendedAwayXg: number;
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  mlOps?: ExtendedSection & {
    runId: string;
    schemaValid: boolean;
    driftScore: number;
    driftStatus: string;
    featureCompleteness: number;
    qualityGatePassed: boolean;
    engines?: string[];
  };
  causalSurvival?: ExtendedSection & {
    gnnDelta: number;
    causalLift: number;
    survivalProbNoGoal60: number;
    medianMinutesToNextGoal: number;
    engines?: string[];
  };
  quantumOptimizer?: ExtendedSection & {
    method: string;
    optimalExposure: number;
    energy: number;
    topMarket: string | null;
    engine?: string;
  };
};

type ExtendedSection = {
  source?: "python" | "partial" | "fallback";
  engine?: string;
  engines?: string[];
};

function isPythonSection(section?: ExtendedSection): boolean {
  if (!section) return false;
  return (
    section.source === "python" ||
    section.source === "partial" ||
    Boolean(section.engine) ||
    Boolean(section.engines?.length)
  );
}

export function mergeExtendedModels(
  analysis: AnalysisResult,
  extended: ExtendedMLResponse | null
): AnalysisResult {
  if (!extended || !analysis.advancedModels) return analysis;

  const advanced = { ...analysis.advancedModels };
  const sources: NonNullable<AnalysisResult["advancedModels"]>["modelSources"] = {
    ...(advanced.modelSources ?? {}),
  };

  if (extended.timeSeries && isPythonSection(extended.timeSeries)) {
    advanced.timeSeries = {
      prophetTrend: extended.timeSeries.prophetTrend,
      arimaHomeWin: extended.timeSeries.arimaHomeWin,
      tftHomeWin: extended.timeSeries.tftHomeWin,
      nbeatsHomeWin: extended.timeSeries.nbeatsHomeWin,
      sarimaHomeWin: extended.timeSeries.sarimaHomeWin ?? advanced.timeSeries.sarimaHomeWin,
      sarimaSeasonality: extended.timeSeries.sarimaSeasonality ?? advanced.timeSeries.sarimaSeasonality,
      ensembleHomeWin: extended.timeSeries.ensembleHomeWin,
      ensembleDraw: extended.timeSeries.ensembleDraw,
      ensembleAwayWin: extended.timeSeries.ensembleAwayWin,
    };
    sources.timeSeries = extended.timeSeries.engines?.join(", ") ?? "python";
  }

  if (extended.halfTime && isPythonSection(extended.halfTime)) {
    advanced.halfTime = {
      homeWinHT: extended.halfTime.homeWinHT,
      drawHT: extended.halfTime.drawHT,
      awayWinHT: extended.halfTime.awayWinHT,
      expectedGoalsHT: extended.halfTime.expectedGoalsHT,
      over05HT: extended.halfTime.over05HT,
    };
    sources.halfTime = extended.halfTime.engine ?? "python";
  }

  if (extended.cornersEsp && isPythonSection(extended.cornersEsp)) {
    advanced.cornersEsp = {
      expectedTotalCorners: extended.cornersEsp.expectedTotalCorners,
      homeCorners: extended.cornersEsp.homeCorners,
      awayCorners: extended.cornersEsp.awayCorners,
      over95Corners: extended.cornersEsp.over95Corners,
    };
    sources.cornersEsp = extended.cornersEsp.engine ?? "python";
  }

  if (extended.cardsRisk && isPythonSection(extended.cardsRisk)) {
    advanced.cardsRisk = {
      expectedYellows: extended.cardsRisk.expectedYellows,
      expectedReds: extended.cardsRisk.expectedReds,
      homeCardsIndex: extended.cardsRisk.homeCardsIndex,
      awayCardsIndex: extended.cardsRisk.awayCardsIndex,
      highCardRisk: extended.cardsRisk.highCardRisk,
    };
    sources.cardsRisk = extended.cardsRisk.engine ?? "python";
  }

  if (extended.xgModel && isPythonSection(extended.xgModel)) {
    advanced.xgModel = {
      homeXg: extended.xgModel.homeXg,
      awayXg: extended.xgModel.awayXg,
      totalXg: extended.xgModel.totalXg,
      bttsFromXg: extended.xgModel.bttsFromXg,
      engine: extended.xgModel.engine ?? "python",
    };
    sources.xgModel = extended.xgModel.engine ?? "python";
  }

  if (extended.explainability && isPythonSection(extended.explainability)) {
    advanced.explainability = {
      topDrivers: extended.explainability.topDrivers,
      method: extended.explainability.method,
      dominantOutcome: extended.explainability.dominantOutcome ?? advanced.explainability.dominantOutcome,
    };
    sources.explainability = extended.explainability.engine ?? extended.explainability.method;
  }

  if (extended.featureEngineering && isPythonSection(extended.featureEngineering)) {
    advanced.featureEngineering = {
      rollingFeatureCount: extended.featureEngineering.rollingFeatureCount,
      tsfreshProxyScore: extended.featureEngineering.tsfreshProxyScore,
    };
  }

  if (extended.autoMl && isPythonSection(extended.autoMl)) {
    advanced.autoMl = {
      championModel: extended.autoMl.championModel,
      engines: extended.autoMl.engines,
      optunaEnabled: extended.autoMl.optunaEnabled ?? advanced.autoMl.optunaEnabled,
      randomForestEnabled: extended.autoMl.randomForestEnabled ?? true,
    };
  }

  if (extended.bivariatePoisson && isPythonSection(extended.bivariatePoisson)) {
    advanced.bivariatePoisson = {
      lambdaHome: extended.bivariatePoisson.lambdaHome,
      lambdaAway: extended.bivariatePoisson.lambdaAway,
      kappa: extended.bivariatePoisson.kappa,
      homeWin: extended.bivariatePoisson.homeWin,
      draw: extended.bivariatePoisson.draw,
      awayWin: extended.bivariatePoisson.awayWin,
      covariance: extended.bivariatePoisson.covariance,
    };
    sources.bivariatePoisson = extended.bivariatePoisson.engine ?? "python";
  }

  if (extended.temporalBlend && isPythonSection(extended.temporalBlend)) {
    advanced.temporalBlend = {
      recentWeight: extended.temporalBlend.recentWeight,
      seasonWeight: extended.temporalBlend.seasonWeight,
      blendedHomeXg: extended.temporalBlend.blendedHomeXg,
      blendedAwayXg: extended.temporalBlend.blendedAwayXg,
      homeWin: extended.temporalBlend.homeWin,
      draw: extended.temporalBlend.draw,
      awayWin: extended.temporalBlend.awayWin,
    };
    sources.temporalBlend = extended.temporalBlend.engine ?? "python";
  }

  if (extended.mlOps && isPythonSection(extended.mlOps)) {
    advanced.mlOps = {
      runId: extended.mlOps.runId,
      schemaValid: extended.mlOps.schemaValid,
      driftScore: extended.mlOps.driftScore,
      driftStatus: extended.mlOps.driftStatus,
      featureCompleteness: extended.mlOps.featureCompleteness,
      qualityGatePassed: extended.mlOps.qualityGatePassed,
    };
    sources.mlOps = extended.mlOps.engines?.join(", ") ?? "python";
  }

  if (extended.causalSurvival && isPythonSection(extended.causalSurvival)) {
    advanced.causalSurvival = {
      gnnDelta: extended.causalSurvival.gnnDelta,
      causalLift: extended.causalSurvival.causalLift,
      survivalProbNoGoal60: extended.causalSurvival.survivalProbNoGoal60,
      medianMinutesToNextGoal: extended.causalSurvival.medianMinutesToNextGoal,
    };
    sources.causalSurvival = extended.causalSurvival.engines?.join(", ") ?? "python";
  }

  if (extended.quantumOptimizer && isPythonSection(extended.quantumOptimizer)) {
    advanced.quantumOptimizer = {
      method: extended.quantumOptimizer.method,
      optimalExposure: extended.quantumOptimizer.optimalExposure,
      energy: extended.quantumOptimizer.energy,
      topMarket: extended.quantumOptimizer.topMarket,
    };
    sources.quantumOptimizer =
      extended.quantumOptimizer.engine ?? extended.quantumOptimizer.method;
  }

  if (extended.libraries) {
    sources.pythonLibraries = extended.libraries;
  }

  return {
    ...analysis,
    advancedModels: {
      ...advanced,
      modelSources: sources,
    },
  };
}
