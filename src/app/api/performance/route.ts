import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { computeMetrics } from "@/backend/lib/analysis/performance-metrics";

/**
 * GET /api/performance?groupBy=market|league|model&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns hit-rate, ROI, Brier score grouped by market or league for the
 * authenticated user's resolved predictions.
 *
 * Read-only, no calibration applied yet — Phase 3 is about surfacing the data
 * before deciding how to act on it.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const params = new URL(request.url).searchParams;
  const groupByRaw = params.get("groupBy") ?? "market";
  const groupBy: "market" | "league" | "model" =
    groupByRaw === "league" || groupByRaw === "model" ? groupByRaw : "market";
  const from = parseDateParam(params.get("from"));
  const to = parseDateParam(params.get("to"));

  const rows = await prisma.prediction.findMany({
    where: {
      userId: session.user.id,
      status: { in: ["WON", "LOST"] },
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    select: {
      market: true,
      prediction: true,
      status: true,
      probability: true,
      roi: true,
      stakeUnits: true,
      leagueId: true,
      clvPercent: true,
      notes: true,
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
      clvPercent: r.clvPercent,
      modelKey: extractModelKey(r.notes),
    })),
    groupBy
  );

  return successResponse({
    groupBy,
    sampleSize: rows.length,
    filters: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    metrics,
  });
});

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractModelKey(notes: string | null): string {
  const match = notes?.match(/Modelo:\s*([^.;]+)/i) ?? notes?.match(/Motor:\s*([^.;]+)/i);
  return match?.[1]?.trim() || "current-engine";
}
