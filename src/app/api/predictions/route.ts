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

  const { fixtureId, leagueId, market, prediction, probability, odds, stakeUnits, notes } =
    validation.data;

  const pred = await prisma.prediction.create({
    data: {
      userId: session.user.id,
      fixtureId,
      leagueId: leagueId ?? null,
      market,
      prediction,
      probability,
      odds: odds || null,
      stakeUnits,
      notes: notes || null,
      status: "OPEN",
    },
  });

  // Invalidate cache
  await cache.delete(cacheKeys.userPredictions(session.user.id));

  addBreadcrumb(`Prediction created for ${fixtureId}`, "predictions", "info");

  return successResponse(pred, 201);
});
