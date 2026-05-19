import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { auth } from "@/auth";

const RouteParamsSchema = z.object({
  id: z.string().min(1),
});

const UpdatePredictionResultSchema = z.object({
  status: z.enum(["OPEN", "WON", "LOST", "VOID", "CANCELED"]).optional(),
  roi: z.number().nullable().optional(),
});

type PredictionRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * GET /api/predictions/[id]
 * Get a specific prediction
 */
export const GET = withErrorHandling(async (request: NextRequest, { params }: PredictionRouteContext) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const routeParams = RouteParamsSchema.safeParse(await Promise.resolve(params));
  if (!routeParams.success) {
    return errorResponse(Errors.VALIDATION_ERROR(routeParams.error.flatten()), 400);
  }
  const { id } = routeParams.data;

  const prediction = await prisma.prediction.findUnique({
    where: { id },
  });

  if (!prediction || prediction.userId !== session.user.id) {
    return errorResponse(Errors.NOT_FOUND);
  }

  return successResponse(prediction);
});

/**
 * PATCH /api/predictions/[id]
 * Update prediction status (after match result)
 */
export const PATCH = withErrorHandling(async (request: NextRequest, { params }: PredictionRouteContext) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const routeParams = RouteParamsSchema.safeParse(await Promise.resolve(params));
  if (!routeParams.success) {
    return errorResponse(Errors.VALIDATION_ERROR(routeParams.error.flatten()), 400);
  }
  const { id } = routeParams.data;
  const body = await request.json();
  const validation = UpdatePredictionResultSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }
  const { status, roi } = validation.data;

  const prediction = await prisma.prediction.findUnique({
    where: { id },
  });

  if (!prediction || prediction.userId !== session.user.id) {
    return errorResponse(Errors.NOT_FOUND);
  }

  const updated = await prisma.prediction.update({
    where: { id },
    data: {
      status: status || prediction.status,
      roi: roi !== undefined ? roi : prediction.roi,
      resultDate: status && status !== "OPEN" ? new Date() : prediction.resultDate,
    },
  });

  // Invalidate cache
  await cache.delete(cacheKeys.userPredictions(session.user.id));

  return successResponse(updated);
});
