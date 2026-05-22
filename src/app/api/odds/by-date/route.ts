import { NextRequest } from "next/server";
import { z } from "zod";
import { listOddsByDate } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

const OddsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe ser YYYY-MM-DD"),
  leagueId: z.string().min(1).optional(),
  fixtureIds: z.string().optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  const leagueId = request.nextUrl.searchParams.get("leagueId") ?? undefined;
  const fixtureIdsRaw = request.nextUrl.searchParams.get("fixtureIds") ?? undefined;
  const fixtureIds = fixtureIdsRaw
    ? fixtureIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id))
        .slice(0, 120)
    : undefined;

  const validation = OddsQuerySchema.safeParse({ date, leagueId, fixtureIds: fixtureIdsRaw });
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const { date: validatedDate, leagueId: validatedLeagueId } = validation.data;
  const cacheKey = cacheKeys.oddsByDate(validatedLeagueId || "all", validatedDate);

  const cached = await cache.get<{ odds: Record<string, unknown>; count: number }>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await listOddsByDate({
      date: validatedDate,
      leagueId: validatedLeagueId,
      fixtureIds,
    });

    if (data.count > 0) {
      await cache.set(cacheKey, data, 60);
    }

    return successResponse(data);
  } catch (error) {
    captureException(error, {
      endpoint: "/api/odds/by-date",
      date: validatedDate,
      leagueId: validatedLeagueId,
    });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
