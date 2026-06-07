/**
 * Performance metrics: aggregate resolved predictions into hit-rate / ROI /
 * Brier score, grouped by market and (optionally) league.
 *
 * Pure function over a slice of Prediction rows. No DB access here so the
 * route can paginate or change query shape without touching this logic.
 *
 * See docs/engine-roadmap.md (Phase 3).
 */

export type ResolvedPrediction = {
  market: string;
  prediction: string;
  status: "WON" | "LOST" | "VOID";
  probability: number; // model probability, 0..100
  roi: number | null;
  stakeUnits: number;
  clvPercent?: number | null;
  modelKey?: string | null;
  // Optional grouping key. League id when available; falls back to "unknown".
  leagueId?: string | null;
};

export type GroupMetrics = {
  key: string;
  sampleSize: number;
  hitRate: number; // 0..1, excludes VOID
  totalRoi: number; // sum of realized roi
  roiPerUnit: number; // totalRoi / sum(stakeUnits)
  brier: number; // mean Brier score, lower is better
  logLoss: number; // mean binary log loss, lower is better
  avgClvPercent: number | null;
  clvSampleSize: number;
};

export function computeMetrics(
  predictions: ResolvedPrediction[],
  groupBy: "market" | "league" | "model"
): GroupMetrics[] {
  const groups = new Map<string, ResolvedPrediction[]>();
  for (const p of predictions) {
    if (p.status === "VOID") continue;
    const key =
      groupBy === "market"
        ? p.market
        : groupBy === "league"
          ? p.leagueId ?? "unknown"
          : p.modelKey ?? "current-engine";
    const bucket = groups.get(key) ?? [];
    bucket.push(p);
    groups.set(key, bucket);
  }

  const out: GroupMetrics[] = [];
  for (const [key, bucket] of groups) {
    const wins = bucket.filter((p) => p.status === "WON").length;
    const totalStake = bucket.reduce((s, p) => s + p.stakeUnits, 0);
    const totalRoi = bucket.reduce((s, p) => s + (p.roi ?? 0), 0);
    const brierSum = bucket.reduce((s, p) => {
      const won = p.status === "WON" ? 1 : 0;
      const prob = clamp01(p.probability / 100);
      return s + (prob - won) ** 2;
    }, 0);
    const logLossSum = bucket.reduce((s, p) => {
      const won = p.status === "WON" ? 1 : 0;
      const prob = clampLogLossProb(p.probability / 100);
      return s - (won * Math.log(prob) + (1 - won) * Math.log(1 - prob));
    }, 0);
    const clvRows = bucket.filter((p) => typeof p.clvPercent === "number");
    const avgClv =
      clvRows.length === 0
        ? null
        : round2(clvRows.reduce((s, p) => s + (p.clvPercent ?? 0), 0) / clvRows.length);
    out.push({
      key,
      sampleSize: bucket.length,
      hitRate: bucket.length === 0 ? 0 : wins / bucket.length,
      totalRoi: round2(totalRoi),
      roiPerUnit: totalStake === 0 ? 0 : round2(totalRoi / totalStake),
      brier: bucket.length === 0 ? 0 : round4(brierSum / bucket.length),
      logLoss: bucket.length === 0 ? 0 : round4(logLossSum / bucket.length),
      avgClvPercent: avgClv,
      clvSampleSize: clvRows.length,
    });
  }

  out.sort((a, b) => b.sampleSize - a.sampleSize);
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clampLogLossProb(n: number): number {
  return Math.max(0.001, Math.min(0.999, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
