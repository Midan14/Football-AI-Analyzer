import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";
import { cache, cacheKeys } from "@/lib/cache";

/**
 * GET /api/odds/live
 * Returns live odds for a fixture using the configured data provider.
 * Query params: fixtureId (required)
 * 
 * Cache: 30 seconds for live matches, 5 minutes for pre-match
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixtureId");

  if (!fixtureId) {
    return errorResponse({ code: "MISSING_FIXTURE", message: "fixtureId requerido" }, 400);
  }

  // Try cache first
  const cacheKey = `odds:live:${fixtureId}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  try {
    const provider = getDataProvider();
    const fixture = await provider.getMatch(fixtureId);
    
    if (!fixture?.market) {
      return errorResponse(Errors.NOT_FOUND);
    }

    const oddsData = {
      fixtureId,
      status: fixture.status,
      lastUpdated: new Date().toISOString(),
      currentOdds: {
        homeWin: fixture.market.homeWinOdds,
        draw: fixture.market.drawOdds,
        awayWin: fixture.market.awayWinOdds,
        over25: fixture.market.over25Odds,
        under25: fixture.market.under25Odds,
        under35: fixture.market.under35Odds,
        bttsYes: fixture.market.bttsYesOdds,
        bttsNo: fixture.market.bttsNoOdds,
        ahHomeMinus1: fixture.market.ahHomeMinus1,
        ahAwayPlus1: fixture.market.ahAwayPlus1,
      },
      impliedProbabilities: {
        homeWin: fixture.market.homeWinOdds > 0 ? Math.round((100 / fixture.market.homeWinOdds) * 100) / 100 : 0,
        draw: fixture.market.drawOdds > 0 ? Math.round((100 / fixture.market.drawOdds) * 100) / 100 : 0,
        awayWin: fixture.market.awayWinOdds > 0 ? Math.round((100 / fixture.market.awayWinOdds) * 100) / 100 : 0,
      },
      vig: calculateVig(fixture.market),
    };

    // Cache: 30s for live, 5min for pre-match
    const ttl = fixture.status === "live" ? 30 : 300;
    await cache.set(cacheKey, oddsData, ttl);

    return successResponse(oddsData);
  } catch (error) {
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});

function calculateVig(market: any): number {
  const homeProb = 100 / (market.homeWinOdds || 1);
  const drawProb = 100 / (market.drawOdds || 1);
  const awayProb = 100 / (market.awayWinOdds || 1);
  const total = homeProb + drawProb + awayProb;
  return Math.round((total - 100) * 100) / 100;
}
