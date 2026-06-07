import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";
import { cache } from "@/lib/cache";

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
    
    // Attempt to get live odds directly if provider supports it
    let market;
    if (typeof (provider as any).getLiveOdds === "function") {
      market = await (provider as any).getLiveOdds(fixtureId);
    }
    
    // Fallback to full match data if no market found
    let fixtureStatus = "unknown";
    if (!market || market.homeWinOdds === 0) {
      const fixture = await provider.getMatch(fixtureId);
      market = fixture?.market;
      fixtureStatus = fixture?.status ?? "unknown";
    }

    if (!market || market.homeWinOdds === 0) {
      return errorResponse(Errors.NOT_FOUND);
    }

    const oddsData = {
      fixtureId,
      status: fixtureStatus,
      lastUpdated: new Date().toISOString(),
      currentOdds: {
        homeWin: market.homeWinOdds,
        draw: market.drawOdds,
        awayWin: market.awayWinOdds,
        over25: market.over25Odds,
        under25: market.under25Odds,
        under35: market.under35Odds,
        bttsYes: market.bttsYesOdds,
        bttsNo: market.bttsNoOdds,
        ahHomeMinus1: market.ahHomeMinus1,
        ahAwayPlus1: market.ahAwayPlus1,
      },
      impliedProbabilities: {
        homeWin: market.homeWinOdds > 0 ? Math.round((100 / market.homeWinOdds) * 100) / 100 : 0,
        draw: market.drawOdds > 0 ? Math.round((100 / market.drawOdds) * 100) / 100 : 0,
        awayWin: market.awayWinOdds > 0 ? Math.round((100 / market.awayWinOdds) * 100) / 100 : 0,
      },
      vig: calculateVig(market),
    };

    // Cache: 30s for live, 5min for pre-match
    const ttl = fixtureStatus === "live" ? 30 : 300;
    await cache.set(cacheKey, oddsData, ttl);

    return successResponse(oddsData);
  } catch {
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
