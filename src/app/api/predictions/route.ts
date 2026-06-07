import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { CreatePredictionSchema } from "@/lib/schemas/predictions";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { auth } from "@/auth";
import { addBreadcrumb } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/predictions
 * Get user's predictions
 */
export const GET = withErrorHandling(async (_request: NextRequest) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const rateLimit = await checkRateLimit(session.user.id, "predictions:get", 60, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  // Try cache first
  const cached = await cache.get(cacheKeys.userPredictions(session.user.id));
  if (cached) {
    return successResponse(cached);
  }

  const predictions = await prisma.prediction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Cache for 15 minutes
  await cache.set(cacheKeys.userPredictions(session.user.id), predictions, 900);

  return successResponse(predictions);
});

/**
 * POST /api/predictions
 * Create a new prediction
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const rateLimit = await checkRateLimit(session.user.id, "predictions:post", 30, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const body = await request.json();
  const validation = CreatePredictionSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { fixtureId, leagueId, market, prediction, probability, odds, fairOdds, bookmaker, stakeUnits, notes } =
    validation.data;

  try {
    const userId = session.user!.id!;
    const pred = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error("User not found");
      }
      
      if (user.bankroll < stakeUnits) {
        throw new Error("Insufficient bankroll");
      }
      
      // Deduct bankroll
      await tx.user.update({
        where: { id: userId },
        data: { bankroll: { decrement: stakeUnits } },
      });
      
      // Create prediction
      return tx.prediction.create({
        data: {
          userId: userId,
          fixtureId,
          leagueId: leagueId ?? null,
          market,
          prediction,
          probability,
          odds: odds || null,
          fairOdds: fairOdds || null,
          bookmaker: bookmaker || null,
          stakeUnits,
          notes: notes || null,
          status: "OPEN",
        },
      });
    });

    // Invalidate cache
    await cache.delete(cacheKeys.userPredictions(userId));

    addBreadcrumb(`Prediction created for ${fixtureId}`, "predictions", "info");

    return successResponse(pred, 201);
  } catch (err: any) {
    if (err.message === "Insufficient bankroll") {
      return errorResponse({ code: "INSUFFICIENT_FUNDS", message: "No tienes saldo suficiente en tu bankroll." }, 400);
    }
    throw err;
  }
});
