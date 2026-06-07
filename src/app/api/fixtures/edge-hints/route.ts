import { NextRequest } from "next/server";
import { z } from "zod";
import { getFixtureEdgeHintsForDate } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

const EdgeHintsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe ser YYYY-MM-DD"),
  leagueId: z.string().min(1).optional(),
  countryId: z.string().min(1).optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  const leagueId = request.nextUrl.searchParams.get("leagueId") ?? undefined;
  const countryId = request.nextUrl.searchParams.get("countryId") ?? undefined;

  const validation = EdgeHintsQuerySchema.safeParse({ date, leagueId, countryId });
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const { date: validatedDate, leagueId: validatedLeagueId, countryId: validatedCountryId } =
    validation.data;

  const cacheKey = cacheKeys.fixtureEdgeHints(
    validatedLeagueId || "all",
    validatedCountryId || "all",
    validatedDate
  );

  const cached = await cache.get<Awaited<ReturnType<typeof getFixtureEdgeHintsForDate>>>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await getFixtureEdgeHintsForDate({
      date: validatedDate,
      leagueId: validatedLeagueId,
      countryId: validatedCountryId,
    });
    await cache.set(cacheKey, data, 300);
    return successResponse(data);
  } catch (error) {
    captureException(error, { endpoint: "/api/fixtures/edge-hints", date: validatedDate });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
