import { NextRequest } from "next/server";
import { listCountries } from "@/backend/server/football/football-service";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const cached = await cache.get(cacheKeys.countries());
  if (cached) {
    return successResponse(cached);
  }

  try {
    const data = await listCountries();
    await cache.set(cacheKeys.countries(), data, 86400);
    return successResponse(data);
  } catch (error) {
    captureException(error, { endpoint: "/api/countries" });
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
