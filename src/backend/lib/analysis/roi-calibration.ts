export type CalibrationReliability = "high" | "medium" | "low";
export type CalibrationSource = "market" | "league" | "global" | "none";

export type CalibrationGroupMetrics = {
  key: string;
  sampleSize: number;
  hitRate: number;
  totalRoi: number;
  roiPerUnit: number;
  brier: number;
  logLoss?: number;
  avgClvPercent?: number | null;
  clvSampleSize?: number;
};

export type RoiCalibrationInput = {
  rawProbability: number;
  marketKey: string | null;
  leagueId?: string | null;
  marketMetrics?: CalibrationGroupMetrics | null;
  leagueMetrics?: CalibrationGroupMetrics | null;
  globalMetrics?: CalibrationGroupMetrics | null;
};

export type RoiCalibrationResult = {
  rawProbability: number;
  calibratedProbability: number;
  adjustment: number;
  sampleSize: number;
  source: CalibrationSource;
  reliability: CalibrationReliability;
  reason: string;
};

export type AbstentionInput = {
  market: string;
  stakeUnits: number;
  rawProbability: number;
  calibratedProbability: number;
  edge: number;
  marketMetrics?: CalibrationGroupMetrics | null;
};

export type AbstentionDecision = {
  abstain: boolean;
  reason: string;
  adjustedStakeUnits: number;
};

export type BacktestMetrics = {
  brier: number;
  roiPerUnit: number;
  logLoss: number;
  sampleSize: number;
};

const MIN_MARKET_SAMPLE = 20;
const MIN_LEAGUE_SAMPLE = 30;
const MIN_GLOBAL_SAMPLE = 40;
const MIN_ACTIONABLE_EDGE = 2.5;

export function applyRoiCalibration(input: RoiCalibrationInput): RoiCalibrationResult {
  const raw = clampPercent(input.rawProbability);
  const selected = selectCalibrationGroup(input);

  if (!selected.metrics) {
    return {
      rawProbability: raw,
      calibratedProbability: raw,
      adjustment: 0,
      sampleSize: 0,
      source: "none",
      reliability: "low",
      reason: "Sin muestra historica suficiente para calibrar; se conserva la probabilidad cruda.",
    };
  }

  const observed = clampPercent(selected.metrics.hitRate * 100);
  const weight = calibrationWeight(selected.metrics.sampleSize, selected.source);
  const calibrated = round1(raw * (1 - weight) + observed * weight);

  return {
    rawProbability: raw,
    calibratedProbability: calibrated,
    adjustment: round1(calibrated - raw),
    sampleSize: selected.metrics.sampleSize,
    source: selected.source,
    reliability: reliabilityFromSample(selected.metrics.sampleSize, selected.source),
    reason: calibrationReason(selected.source, selected.metrics.sampleSize),
  };
}

export function shouldAbstainRecommendation(input: AbstentionInput): AbstentionDecision {
  if (input.market === "Sin valor claro" || input.stakeUnits <= 0) {
    return { abstain: true, reason: "No hay mercado accionable con Kelly positivo.", adjustedStakeUnits: 0 };
  }

  if (input.calibratedProbability < input.rawProbability - 8) {
    return {
      abstain: true,
      reason: "Calibracion historica reduce demasiado la probabilidad del pick.",
      adjustedStakeUnits: 0,
    };
  }

  if (input.edge < MIN_ACTIONABLE_EDGE) {
    return {
      abstain: true,
      reason: `Edge calibrado insuficiente (< ${MIN_ACTIONABLE_EDGE}%).`,
      adjustedStakeUnits: 0,
    };
  }

  const metrics = input.marketMetrics;
  if (metrics && metrics.sampleSize >= MIN_MARKET_SAMPLE && metrics.roiPerUnit < 0) {
    return {
      abstain: true,
      reason: `ROI historico negativo en ${input.market} (${formatSigned(metrics.roiPerUnit * 100)}%/u).`,
      adjustedStakeUnits: 0,
    };
  }

  if (metrics?.avgClvPercent != null && (metrics.clvSampleSize ?? 0) >= 10 && metrics.avgClvPercent < -1) {
    return {
      abstain: true,
      reason: `CLV historico negativo (${formatSigned(metrics.avgClvPercent)}%); el precio suele empeorar contra cierre.`,
      adjustedStakeUnits: 0,
    };
  }

  return {
    abstain: false,
    reason: "Pick permitido: ROI historico, edge calibrado y stake son consistentes.",
    adjustedStakeUnits: input.stakeUnits,
  };
}

export function backtestChampionChallenger(input: {
  champion: BacktestMetrics;
  challenger: BacktestMetrics;
}): { promote: boolean; reason: string } {
  const minSample = Math.min(input.champion.sampleSize, input.challenger.sampleSize);
  if (minSample < MIN_GLOBAL_SAMPLE) {
    return { promote: false, reason: `Muestra insuficiente para promocion (${minSample}).` };
  }
  if (input.challenger.brier > input.champion.brier) {
    return { promote: false, reason: "Brier empeora frente al champion actual." };
  }
  if (input.challenger.logLoss > input.champion.logLoss) {
    return { promote: false, reason: "Log loss empeora frente al champion actual." };
  }
  if (input.challenger.roiPerUnit <= input.champion.roiPerUnit) {
    return { promote: false, reason: "ROI por unidad no mejora frente al champion actual." };
  }
  return { promote: true, reason: "Challenger mejora Brier, log loss y ROI fuera de muestra." };
}

function selectCalibrationGroup(input: RoiCalibrationInput): {
  source: CalibrationSource;
  metrics: CalibrationGroupMetrics | null;
} {
  if (input.marketMetrics && input.marketMetrics.sampleSize >= MIN_MARKET_SAMPLE) {
    return { source: "market", metrics: input.marketMetrics };
  }
  if (input.leagueMetrics && input.leagueMetrics.sampleSize >= MIN_LEAGUE_SAMPLE) {
    return { source: "league", metrics: input.leagueMetrics };
  }
  if (input.globalMetrics && input.globalMetrics.sampleSize >= MIN_GLOBAL_SAMPLE) {
    return { source: "global", metrics: input.globalMetrics };
  }
  return { source: "none", metrics: null };
}

function calibrationWeight(sampleSize: number, source: CalibrationSource): number {
  const cap = source === "market" ? 0.45 : source === "league" ? 0.35 : 0.25;
  return Math.min(cap, sampleSize / 200);
}

function reliabilityFromSample(sampleSize: number, source: CalibrationSource): CalibrationReliability {
  if (source === "global") return sampleSize >= MIN_GLOBAL_SAMPLE ? "medium" : "low";
  if (sampleSize >= 80) return "high";
  if (sampleSize >= 20) return "medium";
  return "low";
}

function calibrationReason(source: CalibrationSource, sampleSize: number): string {
  if (source === "market") return `Calibrado con historico del mercado (${sampleSize} picks).`;
  if (source === "league") return `Calibrado con fallback de liga (${sampleSize} picks).`;
  if (source === "global") return `Calibrado con fallback global (${sampleSize} picks).`;
  return "Sin calibracion aplicada.";
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n * 10) / 10}`;
}
