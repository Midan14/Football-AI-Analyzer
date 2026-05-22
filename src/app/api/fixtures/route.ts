import { NextRequest } from "next/server";
import { z } from "zod";
import { listFixtures } from "@/backend/server/football/football-service";
import { DemoProvider } from "@/backend/lib/providers/demo-provider";
import { getActiveProviderName } from "@/backend/lib/providers/provider-factory";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { captureException } from "@/lib/sentry";

function allowDemoFallback(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_FALLBACK === "true";
}

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

  const cacheKey = `${cacheKeys.fixtures(validatedLeagueId || "all", validatedDate)}:v3`;
  const cached = await cache.get<{
    fixtures?: unknown[];
    dataSource?: string;
  }>(cacheKey);
  const cacheIsDemo =
    cached?.dataSource === "demo-fallback" && getActiveProviderName() === "api-football";
  if (
    cached &&
    Array.isArray(cached.fixtures) &&
    cached.fixtures.length > 0 &&
    !cacheIsDemo
  ) {
    return successResponse(cached);
  }

  try {
    const data = await listFixtures({
      leagueId: validatedLeagueId,
      date: validatedDate,
    });

    const oddsCount = data.fixtures.filter((fixture) => fixture.market.homeWinOdds > 0).length;
    const skipOddsCache =
      getActiveProviderName() === "api-football" &&
      process.env.API_FOOTBALL_PREFETCH_FIXTURE_ODDS !== "false" &&
      data.fixtures.length > 0 &&
      oddsCount === 0;

    if (
      !skipOddsCache &&
      data.fixtures.length > 0 &&
      data.dataSource !== "demo-fallback" &&
      data.dataSource !== "api-football-quota"
    ) {
      const hasLive = data.fixtures.some((fixture) => fixture.status === "live");
      const cacheTtl = hasLive ? 10 : 30;
      await cache.set(
        cacheKey,
        data,
        cacheTtl
      );
    }

    return successResponse(data);
  } catch (error) {
    captureException(error, {
      endpoint: "/api/fixtures",
      leagueId: validatedLeagueId,
      date: validatedDate,
    });
    if (allowDemoFallback() && validatedDate) {
      const demo = new DemoProvider();
      const fixtures = await demo.getFixtures({
        leagueId: validatedLeagueId,
        date: validatedDate,
      });
      const data = { fixtures, dataSource: "demo-fallback" as const };
      if (fixtures.length > 0) {
        await cache.set(cacheKey, data, 30);
      }
      return successResponse(data);
    }
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});
