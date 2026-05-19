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
};

export function computeMetrics(
  predictions: ResolvedPrediction[],
  groupBy: "market" | "league"
): GroupMetrics[] {
  const groups = new Map<string, ResolvedPrediction[]>();
  for (const p of predictions) {
    if (p.status === "VOID") continue;
    const key = groupBy === "market" ? p.market : p.leagueId ?? "unknown";
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
    out.push({
      key,
      sampleSize: bucket.length,
      hitRate: bucket.length === 0 ? 0 : wins / bucket.length,
      totalRoi: round2(totalRoi),
      roiPerUnit: totalStake === 0 ? 0 : round2(totalRoi / totalStake),
      brier: bucket.length === 0 ? 0 : round4(brierSum / bucket.length),
    });
  }

  out.sort((a, b) => b.sampleSize - a.sampleSize);
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
