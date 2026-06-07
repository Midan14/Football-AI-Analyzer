import { NextRequest } from "next/server";
import { z } from "zod";
import { getLeagueStandings } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

const StandingsQuerySchema = z.object({
  countryId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { id: leagueId } = await context.params;
  const countryId = request.nextUrl.searchParams.get("countryId") ?? undefined;
  const limitRaw = request.nextUrl.searchParams.get("limit") ?? "5";

  const validation = StandingsQuerySchema.safeParse({ countryId, limit: limitRaw });
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const limit = validation.data.limit ?? 5;
  const cacheKey = cacheKeys.leagueStandings(leagueId, countryId || "all", limit);
  const cached = await cache.get<Awaited<ReturnType<typeof getLeagueStandings>>>(cacheKey);
  if (cached) {
    return successResponse({ leagueId, rows: cached, count: cached.length });
  }

  try {
    const rows = await getLeagueStandings(leagueId, countryId, limit);
    await cache.set(cacheKey, rows, 900);
    return successResponse({ leagueId, rows, count: rows.length });
  } catch (error) {
    captureException(error, { endpoint: "/api/leagues/[id]/standings", leagueId });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
