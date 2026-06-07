import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";

/**
 * GET /api/cash-out
 * Recommends cash-out value for an active prediction
 * Query params: predictionId (required)
 * 
 * Cash-out is profitable when:
 * - The current odds have moved in your favor (implied probability dropped)
 * - You can lock in profit before the match ends
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const url = new URL(request.url);
  const predictionId = url.searchParams.get("predictionId");

  if (!predictionId) {
    return errorResponse({ code: "MISSING_PREDICTION", message: "predictionId requerido" }, 400);
  }

  const prediction = await prisma.prediction.findFirst({
    where: { id: predictionId, userId: session.user.id },
    include: {
      user: { select: { bankroll: true } },
    },
  });

  if (!prediction) return errorResponse(Errors.NOT_FOUND);
  if (prediction.status !== "OPEN") {
    return successResponse({
      predictionId,
      canCashOut: false,
      reason: `Predicción ya resuelta: ${prediction.status}`,
    });
  }

  const provider = getDataProvider();
  let liveOdds = 0;
  try {
    let market;
    if (typeof (provider as any).getLiveOdds === "function") {
      market = await (provider as any).getLiveOdds(prediction.fixtureId);
    }
    if (!market || !market.homeWinOdds) {
      const fixture = await provider.getMatch(prediction.fixtureId);
      market = fixture?.market;
    }

    if (prediction.prediction === "HOME_WIN") liveOdds = market?.homeWinOdds || 0;
    else if (prediction.prediction === "DRAW") liveOdds = market?.drawOdds || 0;
    else if (prediction.prediction === "AWAY_WIN") liveOdds = market?.awayWinOdds || 0;
    else if (prediction.prediction === "OVER_2.5") liveOdds = market?.over25Odds || 0;
    else liveOdds = prediction.odds ? prediction.odds * 0.9 : 0; // Fallback if market not supported here
  } catch {
    liveOdds = prediction.odds ? prediction.odds * 0.9 : 0; // Simulate on fail
  }

  const currentOdds = liveOdds;
  const originalStake = prediction.stakeUnits;
  const potentialReturn = originalStake * (prediction.odds || 1);
  
  // Real cashout formula roughly: (Stake * OriginalOdds) / CurrentOdds - margin
  // Margin of 5-10% is standard.
  const fairValue = (originalStake * (prediction.odds || 1)) / (currentOdds || 1);
  const bookmakerMargin = 0.08;
  const cashOutValue = currentOdds > 0 ? fairValue * (1 - bookmakerMargin) : originalStake * 0.5;

  const profitIfCashOut = cashOutValue - originalStake;
  const profitIfWin = potentialReturn - originalStake;

  // Hedge calculation
  const hedgeStake = currentOdds > 0 ? potentialReturn / currentOdds : 0;
  const hedgeProfitIfOriginalWins = potentialReturn - originalStake - hedgeStake;
  const hedgeProfitIfHedgeWins = (hedgeStake * (currentOdds || 1)) - originalStake - hedgeStake;

  return successResponse({
    predictionId,
    canCashOut: currentOdds > 1.01,
    originalStake: Math.round(originalStake * 100) / 100,
    cashOutValue: Math.round(cashOutValue * 100) / 100,
    profitIfCashOut: Math.round(profitIfCashOut * 100) / 100,
    profitIfWin: Math.round(profitIfWin * 100) / 100,
    recommendation: profitIfCashOut > 0
      ? "CASH_OUT_RECOMMENDED"
      : profitIfCashOut > -originalStake * 0.3
      ? "HOLD"
      : "CUT_LOSSES",
    hedge: {
      currentOdds: Math.round(currentOdds * 100) / 100,
      hedgeStake: Math.round(hedgeStake * 100) / 100,
      profitIfOriginalWins: Math.round(hedgeProfitIfOriginalWins * 100) / 100,
      profitIfHedgeWins: Math.round(hedgeProfitIfHedgeWins * 100) / 100,
      isHedgeViable: Math.abs(hedgeProfitIfOriginalWins - hedgeProfitIfHedgeWins) < originalStake * 0.1,
    },
    disclaimer: "Cash-out y hedge son simulaciones. Integrar proveedor de odds real para valores exactos.",
  });
});
