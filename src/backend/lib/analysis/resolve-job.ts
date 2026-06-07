/**
 * Shared resolve job — used by both the user-scoped POST /api/predictions/resolve
 * and the system-scoped GET /api/cron/resolve-predictions.
 *
 * Idempotent: only touches OPEN predictions; skips fixtures without a result.
 * See docs/engine-roadmap.md (Phase 2).
 */

import { prisma } from "@/lib/db";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";
import { resolvePrediction } from "@/backend/lib/analysis/outcome-resolver";
import { enrichPredictionWithClosingLine } from "@/backend/lib/odds/clv-service";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

export type ResolveSummary = {
  resolved: number;
  skipped: number;
  predictions: Array<{ id: string; status: string; roi: number; reason: string }>;
};

export async function runResolveJob(opts: { userId?: string } = {}): Promise<ResolveSummary> {
  const where = opts.userId
    ? { userId: opts.userId, status: "OPEN" as const }
    : { status: "OPEN" as const };

  const open = await prisma.prediction.findMany({
    where,
    select: {
      id: true,
      userId: true,
      fixtureId: true,
      market: true,
      prediction: true,
      stakeUnits: true,
      odds: true,
      bookmaker: true,
    },
  });

  const summary: ResolveSummary = { resolved: 0, skipped: 0, predictions: [] };
  if (open.length === 0) return summary;

  const provider = getDataProvider();
  const touchedUsers = new Set<string>();

  for (const pred of open) {
    try {
      const fixture = await provider.getMatch(pred.fixtureId);
      if (fixture.status !== "final" || !fixture.result) {
        summary.skipped += 1;
        continue;
      }
      const resolution = resolvePrediction({
        market: pred.market,
        prediction: pred.prediction,
        stakeUnits: pred.stakeUnits,
        odds: pred.odds,
        result: fixture.result,
      });

      const closing = await enrichPredictionWithClosingLine(pred);

      await prisma.prediction.update({
        where: { id: pred.id },
        data: {
          status: resolution.status,
          roi: resolution.roi,
          resultDate: new Date(),
          closingOdds: closing.closingOdds,
          clvPercent: closing.clvPercent,
          bookmaker: closing.bookmaker,
        },
      });
      touchedUsers.add(pred.userId);
      summary.predictions.push({
        id: pred.id,
        status: resolution.status,
        roi: resolution.roi,
        reason: resolution.reason,
      });
      summary.resolved += 1;
    } catch (err) {
      captureException(err, { predictionId: pred.id, op: "resolve" });
      summary.skipped += 1;
    }
  }

  await Promise.all(
    [...touchedUsers].map((uid) => cache.delete(cacheKeys.userPredictions(uid)))
  );

  return summary;
}
