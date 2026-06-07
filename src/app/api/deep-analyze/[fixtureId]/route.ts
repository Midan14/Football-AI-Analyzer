import { NextRequest } from "next/server";
import { analyzeMatchDeep } from "@/backend/server/football/football-service";
import { z } from "zod";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { addBreadcrumb, captureException } from "@/lib/sentry";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const FixtureIdSchema = z.object({
  fixtureId: z.string().min(1, "fixtureId es requerido"),
});

export const GET = withErrorHandling(async (request: NextRequest, context: { params: Promise<{ fixtureId: string }> }) => {
  const { fixtureId } = await context.params;

  const validation = FixtureIdSchema.safeParse({ fixtureId });
  if (!validation.success) {
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { fixtureId: validatedFixtureId } = validation.data;

  // Rate limiting — deep analysis is heavier, lower limits
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "deep-analyze", 50, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta más tarde." }, 429);
  }

  const cacheKey = cacheKeys.deepAnalysis(validatedFixtureId);
  const cached = await cache.get(cacheKey);
  if (cached) {
    addBreadcrumb(`Deep analysis cache hit for ${validatedFixtureId}`, "analysis", "info");
    return successResponse(cached);
  }

  try {
    addBreadcrumb(`Deep analyzing fixture ${validatedFixtureId}`, "analysis", "info");
    const analysisData = await analyzeMatchDeep(validatedFixtureId);
    await cache.set(cacheKey, analysisData, 3600);
    return successResponse(analysisData);
  } catch (error) {
    captureException(error, { fixtureId: validatedFixtureId });
    addBreadcrumb(`Deep analysis failed for ${validatedFixtureId}`, "analysis", "error");
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
