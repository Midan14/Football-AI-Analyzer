import { NextRequest } from "next/server";
import { z } from "zod";
import { getMatch } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

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

  const cached = await cache.get(cacheKeys.fixture(fixtureId));
  if (cached) {
    return successResponse(cached);
  }

  try {
    const { match } = await getMatch(fixtureId);
    const ttl = match.status === "live" ? 15 : 60;
    await cache.set(cacheKeys.fixture(fixtureId), match, ttl);
    return successResponse(match);
  } catch (error) {
    captureException(error, { endpoint: "/api/match/:fixtureId", fixtureId });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
