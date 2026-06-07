import { NextRequest } from "next/server";
import { getLiveMatchDetail, listLiveFixtures } from "@/backend/server/football/football-service";
import { successResponse, withErrorHandling } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";

/**
 * GET /api/live
 * Returns all live fixtures with real-time data.
 * Query params:
 *   id — optional fixture ID for detailed live data (events + statistics)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const fixtureId = request.nextUrl.searchParams.get("id");

  if (fixtureId) {
    const cacheKey = cacheKeys.liveDetail(fixtureId);
    const cached = await cache.get<Awaited<ReturnType<typeof getLiveMatchDetail>>>(cacheKey);
    if (cached) {
      return successResponse(cached);
    }

    const data = await getLiveMatchDetail(fixtureId);
    await cache.set(cacheKey, data, 8);
    return successResponse(data);
  }

  const cacheKey = cacheKeys.liveFixtures();
  const cached = await cache.get<Awaited<ReturnType<typeof listLiveFixtures>>>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const data = await listLiveFixtures();
  await cache.set(cacheKey, data, 8);
  return successResponse(data);
});
