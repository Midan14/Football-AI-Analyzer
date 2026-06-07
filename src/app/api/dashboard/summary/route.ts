import { NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { listFixtures, listOddsByDate } from "@/backend/server/football/football-service";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { cache } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { pickFixtureScanCandidates } from "@/backend/lib/fixtures/pick-candidates";
import { mergeOddsIntoFixtures } from "@/backend/lib/fixtures/merge-fixture-odds";
import {
  scanFixtureInsights,
  topFixtureInsights,
} from "@/backend/server/football/fixture-insights-scan";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leagueId: z.string().min(1).optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const rateLimit = await checkRateLimit(userId, "dashboard:summary", 30, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes de resumen." }, 429);
  }

  const parsed = QuerySchema.safeParse({
    date: request.nextUrl.searchParams.get("date"),
    leagueId: request.nextUrl.searchParams.get("leagueId") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(Errors.VALIDATION_ERROR(parsed.error.flatten()), 400);
  }

  const { date, leagueId } = parsed.data;
  const cacheKey = `football:dashboard-summary:${userId ?? "guest"}:${leagueId ?? "all"}:${date}`;
  const cached = await cache.get<{ insights: Awaited<ReturnType<typeof scanFixtureInsights>>; topPicks: ReturnType<typeof topFixtureInsights> }>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const fixturesPayload = await listFixtures({ leagueId, date });
  let fixtures = fixturesPayload.fixtures ?? [];
  const { odds } = await listOddsByDate({ date, leagueId });
  fixtures = mergeOddsIntoFixtures(fixtures, odds);

  let watchlistIds = new Set<string>();
  if (userId) {
    const rows = await prisma.watchlistItem.findMany({
      where: { userId },
      select: { fixtureId: true },
    });
    watchlistIds = new Set(rows.map((r) => r.fixtureId));
  }

  const candidates = pickFixtureScanCandidates(fixtures, watchlistIds);
  const insights = await scanFixtureInsights(candidates);
  const topPicks = topFixtureInsights(insights);

  const payload = { insights, topPicks };
  await cache.set(cacheKey, payload, 45);

  return successResponse(payload);
});
