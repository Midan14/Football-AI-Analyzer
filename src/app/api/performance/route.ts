import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { computeMetrics } from "@/backend/lib/analysis/performance-metrics";

/**
 * GET /api/performance?groupBy=market|league
 * Returns hit-rate, ROI, Brier score grouped by market or league for the
 * authenticated user's resolved predictions.
 *
 * Read-only, no calibration applied yet — Phase 3 is about surfacing the data
 * before deciding how to act on it.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const groupByRaw = new URL(request.url).searchParams.get("groupBy") ?? "market";
  const groupBy: "market" | "league" = groupByRaw === "league" ? "league" : "market";

  const rows = await prisma.prediction.findMany({
    where: {
      userId: session.user.id,
      status: { in: ["WON", "LOST"] },
    },
    select: {
      market: true,
      prediction: true,
      status: true,
      probability: true,
      roi: true,
      stakeUnits: true,
      leagueId: true,
    },
    take: 5000,
  });

  const metrics = computeMetrics(
    rows.map((r) => ({
      market: r.market,
      prediction: r.prediction,
      status: r.status as "WON" | "LOST",
      probability: r.probability,
      roi: r.roi,
      stakeUnits: r.stakeUnits,
      leagueId: r.leagueId,
    })),
    groupBy
  );

  return successResponse({ groupBy, sampleSize: rows.length, metrics });
});
