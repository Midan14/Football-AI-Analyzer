import { NextRequest } from "next/server";
import { successResponse, withErrorHandling } from "@/lib/api-utils";
import { ApiFootballProvider } from "@/backend/lib/providers/api-football-provider";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";

/**
 * GET /api/live
 * Returns all live fixtures with real-time data.
 * Query params:
 *   id — optional fixture ID for detailed live data (events + statistics)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const provider = getDataProvider();
  const fixtureId = request.nextUrl.searchParams.get("id");

  if (fixtureId) {
    // Detailed live data for a specific fixture
    const data = provider instanceof ApiFootballProvider
      ? await provider.getMatchLive(fixtureId)
      : { fixture: await provider.getMatch(fixtureId), events: [], statistics: [] };
    return successResponse(data);
  }

  // All live fixtures
  const fixtures = provider instanceof ApiFootballProvider
    ? await provider.getLiveFixtures()
    : [];
  return successResponse({ fixtures, count: fixtures.length });
});
