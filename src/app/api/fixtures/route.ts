import { NextRequest } from "next/server";
import { z } from "zod";
import { listFixtures } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

const FixturesQuerySchema = z.object({
  leagueId: z.string().min(1, "leagueId es requerido").optional(),
  date: z.string().optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const leagueId = request.nextUrl.searchParams.get("leagueId") ?? undefined;
  const date = request.nextUrl.searchParams.get("date") ?? undefined;

  const validation = FixturesQuerySchema.safeParse({ leagueId, date });
  if (!validation.success) {
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { leagueId: validatedLeagueId, date: validatedDate } = validation.data;

  const cached = await cache.get(
    cacheKeys.fixtures(validatedLeagueId || "all", validatedDate)
  );
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await listFixtures({
      leagueId: validatedLeagueId,
      date: validatedDate,
    });

    await cache.set(
      cacheKeys.fixtures(validatedLeagueId || "all", validatedDate),
      data,
      30 // 30 seconds — live scores need frequent updates
    );

    return successResponse(data);
  } catch (error) {
    captureException(error, {
      endpoint: "/api/fixtures",
      leagueId: validatedLeagueId,
      date: validatedDate,
    });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
