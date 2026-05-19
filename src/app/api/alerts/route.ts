import { NextRequest } from "next/server";
import { z } from "zod";
import { getActiveAlerts, createAlert } from "@/backend/server/football/alerts-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AlertType } from "@prisma/client";

const CreateAlertSchema = z.object({
  type: z.enum([
    "VALUE_DETECTED",
    "ODD_MOVEMENT",
    "LINEUP_CHANGE",
    "WEATHER_RISK",
    "MARKET_DIVERGENCE",
    "CUSTOM",
  ]),
  fixtureId: z.string().min(1),
  threshold: z.number().min(0).max(100),
  condition: z.record(z.string(), z.unknown()).optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "alerts:get", 60, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const fixtureId = request.nextUrl.searchParams.get("fixtureId") ?? undefined;
  const alerts = await getActiveAlerts(session.user.id, fixtureId);
  return successResponse({ alerts });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "alerts:post", 20, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const body = await request.json();
  const validation = CreateAlertSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const { type, fixtureId, threshold, condition } = validation.data;
  const alert = await createAlert(
    session.user.id,
    type as AlertType,
    fixtureId,
    threshold,
    condition ?? {}
  );
  return successResponse({ alert }, 201);
});
