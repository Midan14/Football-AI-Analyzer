import { NextRequest } from "next/server";
import { analyzeMatch } from "@/backend/server/football/football-service";
import { z } from "zod";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { addBreadcrumb, captureException } from "@/lib/sentry";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { MatchResult } from "@prisma/client";

const FixtureIdSchema = z.object({
  fixtureId: z.string().min(1, "fixtureId es requerido"),
});

export const GET = withErrorHandling(async (request: NextRequest, context: { params: Promise<{ fixtureId: string }> }) => {
  const { fixtureId } = await context.params;

  const validation = FixtureIdSchema.safeParse({ fixtureId });
  if (!validation.success) {
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { fixtureId: validatedFixtureId } = validation.data;

  const cacheKey = cacheKeys.analysis(validatedFixtureId);
  const cached = await cache.get(cacheKey);
  if (cached) {
    addBreadcrumb(`Analysis cache hit for ${validatedFixtureId}`, "analysis", "info");
    return successResponse(cached);
  }

  try {
    addBreadcrumb(`Analyzing fixture ${validatedFixtureId}`, "analysis", "info");
    const analysisData = await analyzeMatch(validatedFixtureId);
    // Dynamic cache: 15s for live matches, 60s for pre-match/final
    const fixture = (analysisData as any)?.fixture;
    const ttl = fixture?.status === "live" ? 15 : 60;
    await cache.set(cacheKey, analysisData, ttl);

    // Persist to DB if user is authenticated (non-blocking)
    persistAnalysis(validatedFixtureId, analysisData).catch(() => {});

    return successResponse(analysisData);
  } catch (error) {
    captureException(error, { fixtureId: validatedFixtureId });
    addBreadcrumb(`Analysis failed for ${validatedFixtureId}`, "analysis", "error");
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});

async function persistAnalysis(fixtureId: string, data: any) {
  try {
    const session = await auth();
    if (!session?.user?.id) return;

    const fixture = data.fixture;
    const analysis = data.analysis;
    if (!fixture || !analysis) return;
    const actualResult: MatchResult | undefined =
      fixture.status === "final" && fixture.result
        ? fixture.result.homeGoals > fixture.result.awayGoals
          ? "HOME_WIN"
          : fixture.result.awayGoals > fixture.result.homeGoals
            ? "AWAY_WIN"
            : "DRAW"
        : undefined;

    // Check if already exists for this user+fixture
    const existing = await prisma.analysis.findFirst({
      where: { userId: session.user.id, fixtureId },
      orderBy: { createdAt: "desc" },
    });

    const analysisPayload = {
      homeWinProb: analysis.probabilities?.homeWin ?? 0,
      drawProb: analysis.probabilities?.draw ?? 0,
      awayWinProb: analysis.probabilities?.awayWin ?? 0,
      over15Prob: analysis.probabilities?.over15 ?? 0,
      over25Prob: analysis.probabilities?.over25 ?? 0,
      under35Prob: analysis.probabilities?.under35 ?? 0,
      bttsProb: analysis.probabilities?.btts ?? 0,
      confidenceScore: analysis.confidence?.score ?? 0,
      riskFlags: analysis.riskFlags ?? [],
      penalties: analysis.confidence?.penalties ?? [],
      homeWinOdds: fixture.market?.homeWinOdds || null,
      drawOdds: fixture.market?.drawOdds || null,
      awayWinOdds: fixture.market?.awayWinOdds || null,
      over25Odds: fixture.market?.over25Odds || null,
      valueMarkets: analysis.valueTable?.filter((r: any) => r.edge > 0).slice(0, 5) ?? [],
      bestBet: analysis.recommendation?.market ?? null,
      stakeUnits: analysis.recommendation?.stakeUnits ?? 0.5,
      ...(actualResult && fixture.result
        ? {
            result: actualResult,
            homeGoals: fixture.result.homeGoals,
            awayGoals: fixture.result.awayGoals,
          }
        : {}),
    };

    if (existing) {
      await prisma.analysis.update({
        where: { id: existing.id },
        data: analysisPayload,
      });
    } else {
      await prisma.analysis.create({
        data: {
          userId: session.user.id,
          fixtureId,
          league: fixture.leagueName ?? "",
          country: fixture.countryId ?? "",
          homeTeam: fixture.home?.name ?? "",
          awayTeam: fixture.away?.name ?? "",
          matchDate: new Date(fixture.kickoff),
          ...analysisPayload,
          modelMode: "BALANCED",
          dataProvider: process.env.DATA_PROVIDER ?? "api-football",
        },
      });
    }
  } catch {
    // Silent fail — persistence is non-critical
  }
}

/**
 * DELETE /api/analyze/:fixtureId
 * Clears the Redis cache for this fixture so the next GET re-runs the analysis.
 */
export const DELETE = withErrorHandling(async (_request: NextRequest, context: { params: Promise<{ fixtureId: string }> }) => {
  const { fixtureId } = await context.params;
  await cache.delete(cacheKeys.analysis(fixtureId));
  await cache.delete(cacheKeys.fixture(fixtureId));
  return successResponse({ cleared: true, fixtureId });
});
