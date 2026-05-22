import { NextRequest } from "next/server";
import { z } from "zod";
import { getLeagueRecentStats } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

const StatsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe ser YYYY-MM-DD"),
  windowDays: z.coerce.number().int().min(3).max(30).optional(),
});

export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { id: leagueId } = await context.params;
  const date = request.nextUrl.searchParams.get("date") ?? "";
  const windowDaysRaw = request.nextUrl.searchParams.get("windowDays") ?? "14";

  const validation = StatsQuerySchema.safeParse({ date, windowDays: windowDaysRaw });
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const windowDays = validation.data.windowDays ?? 14;
  const cacheKey = cacheKeys.leagueStats(leagueId, validation.data.date, windowDays);
  const cached = await cache.get<Awaited<ReturnType<typeof getLeagueRecentStats>>>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await getLeagueRecentStats(leagueId, validation.data.date, windowDays);
    await cache.set(cacheKey, data, 600);
    return successResponse(data);
  } catch (error) {
    captureException(error, { endpoint: "/api/leagues/[id]/stats", leagueId });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
