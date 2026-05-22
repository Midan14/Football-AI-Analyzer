import { NextRequest } from "next/server";
import { z } from "zod";
import { listFixturesRange } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

const RangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser YYYY-MM-DD"),
  leagueId: z.string().min(1).optional(),
  countryId: z.string().min(1).optional(),
  includeFixtures: z.enum(["true", "false"]).optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const leagueId = request.nextUrl.searchParams.get("leagueId") ?? undefined;
  const countryId = request.nextUrl.searchParams.get("countryId") ?? undefined;
  const includeFixtures = request.nextUrl.searchParams.get("includeFixtures") ?? "false";

  const validation = RangeQuerySchema.safeParse({ from, to, leagueId, countryId, includeFixtures });
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const {
    from: validatedFrom,
    to: validatedTo,
    leagueId: validatedLeagueId,
    countryId: validatedCountryId,
    includeFixtures: validatedIncludeFixtures,
  } = validation.data;

  const withFixtures = validatedIncludeFixtures === "true";
  const cacheKey = cacheKeys.fixturesRange(
    validatedLeagueId || "all",
    validatedCountryId || "all",
    validatedFrom,
    validatedTo,
    withFixtures
  );

  const cached = await cache.get<Awaited<ReturnType<typeof listFixturesRange>>>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await listFixturesRange({
      from: validatedFrom,
      to: validatedTo,
      leagueId: validatedLeagueId,
      countryId: validatedCountryId,
      includeFixtures: withFixtures,
    });

    const ttl = withFixtures ? 90 : 180;
    await cache.set(cacheKey, data, ttl);
    return successResponse(data);
  } catch (error) {
    captureException(error, {
      endpoint: "/api/fixtures/range",
      from: validatedFrom,
      to: validatedTo,
    });
    const message = error instanceof Error ? error.message : "Range error";
    if (message.includes("rango") || message.includes("Range") || message.includes("YYYY")) {
      return errorResponse(Errors.VALIDATION_ERROR(message), 400);
    }
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
