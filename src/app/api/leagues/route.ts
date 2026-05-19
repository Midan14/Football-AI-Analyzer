import { NextRequest } from "next/server";
import { z } from "zod";
import { listLeagues } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

const LeaguesQuerySchema = z.object({
  countryId: z.string().min(1, "countryId es requerido").optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const countryId = request.nextUrl.searchParams.get("countryId") ?? undefined;

  const validation = LeaguesQuerySchema.safeParse({ countryId });
  if (!validation.success) {
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { countryId: validatedCountryId } = validation.data;

  const cached = await cache.get(
    cacheKeys.leagues(validatedCountryId || "all")
  );
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await listLeagues(validatedCountryId);
    await cache.set(
      cacheKeys.leagues(validatedCountryId || "all"),
      data,
      43200
    );
    return successResponse(data);
  } catch (error) {
    captureException(error, { endpoint: "/api/leagues", countryId: validatedCountryId });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
