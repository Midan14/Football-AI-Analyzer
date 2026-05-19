import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

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

  // Simulate current odds (in real implementation, fetch from odds provider)
  const currentOdds = prediction.odds ? prediction.odds * 0.85 : 0; // Simulated: odds dropped 15%
  const originalStake = prediction.stakeUnits * (prediction.user.bankroll * 0.01);
  const potentialReturn = originalStake * (prediction.odds || 1);
  const cashOutValue = originalStake * 0.75; // Simulated: 75% of stake as cash-out offer
  const profitIfCashOut = cashOutValue - originalStake;
  const profitIfWin = potentialReturn - originalStake;

  // Hedge calculation
  const hedgeStake = originalStake / (currentOdds || 1);
  const hedgeProfitIfOriginalWins = potentialReturn - originalStake - hedgeStake;
  const hedgeProfitIfHedgeWins = (hedgeStake * (currentOdds || 1)) - originalStake - hedgeStake;

  return successResponse({
    predictionId,
    canCashOut: true,
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
