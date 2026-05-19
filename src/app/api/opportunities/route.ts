import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { z } from "zod";
import { analyzeMatch } from "@/backend/server/football/football-service";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/opportunities
 * Returns detected value bets (edge > threshold) for the authenticated user
 * Query params: minEdge (default 3), minConfidence (default 55), limit (default 10)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const url = new URL(request.url);
  const minEdge = parseFloat(url.searchParams.get("minEdge") || "3");
  const minConfidence = parseFloat(url.searchParams.get("minConfidence") || "55");
  const limit = Math.min(50, parseInt(url.searchParams.get("limit") || "10"));

  // Get user's watchlist or recent fixtures
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { watchlist: { select: { fixtureId: true } } },
  });

  const fixtureIds = user?.watchlist?.map((w: { fixtureId: string }) => w.fixtureId) || [];
  
  if (fixtureIds.length === 0) {
    return successResponse({
      message: "No hay partidos en watchlist. Agrega partidos para detectar oportunidades.",
      opportunities: [],
    });
  }

  const opportunities: any[] = [];

  for (const fixtureId of fixtureIds.slice(0, limit * 2)) {
    try {
      // Skip cache — opportunities need fresh analysis
      const data = await analyzeMatch(fixtureId);
      if (!data?.analysis) continue;

      const analysis = data.analysis;
      const valueBets = analysis.valueTable?.filter(
        (row: any) => row.edge >= minEdge && row.modelProbability >= minConfidence
      ) || [];

      if (valueBets.length > 0) {
        opportunities.push({
          fixtureId,
          fixture: data.fixture,
          timestamp: new Date().toISOString(),
          confidence: analysis.confidence?.score || 0,
          valueBets: valueBets.map((v: any) => ({
            market: v.market,
            modelProbability: v.modelProbability,
            marketProbability: v.marketProbability,
            edge: v.edge,
            verdict: v.verdict,
            fairOdds: Math.round(100 / v.modelProbability * 100) / 100,
          })),
          bestBet: analysis.recommendation || null,
          stakeSuggestion: analysis.recommendation?.stakeUnits || 0,
        });
      }
    } catch (e) {
      // Skip failed fixtures
    }
  }

  // Sort by best edge
  opportunities.sort((a, b) => {
    const maxEdgeA = Math.max(...a.valueBets.map((v: any) => v.edge), 0);
    const maxEdgeB = Math.max(...b.valueBets.map((v: any) => v.edge), 0);
    return maxEdgeB - maxEdgeA;
  });

  return successResponse({
    count: opportunities.length,
    filters: { minEdge, minConfidence, limit },
    opportunities: opportunities.slice(0, limit),
  });
});
