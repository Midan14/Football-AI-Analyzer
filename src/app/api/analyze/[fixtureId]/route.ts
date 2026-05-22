import { NextRequest } from "next/server";
import { analyzeMatch } from "@/backend/server/football/football-service";
import { z } from "zod";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { addBreadcrumb, captureException } from "@/lib/sentry";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import type { MatchResult } from "@prisma/client";
import type { MatchAnalysisResponse } from "@/shared/domain";
import {
  normalizeAnalysisPreferences,
  analysisModelModeToPrisma,
  ANALYSIS_MODEL_MODES,
  ANALYSIS_SCENARIO_IDS,
  type AnalysisPreferences,
} from "@/shared/analysis-preferences";
import { AnalysisQuerySchema } from "@/lib/schemas/analysis";

const FixtureIdSchema = z.object({
  fixtureId: z.string().min(1, "fixtureId es requerido"),
});

export const GET = withErrorHandling(async (_request: NextRequest, context: { params: Promise<{ fixtureId: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "analyze:get", 120, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes de análisis." }, 429);
  }

  const { fixtureId } = await context.params;

  const validation = FixtureIdSchema.safeParse({ fixtureId });
  if (!validation.success) {
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { fixtureId: validatedFixtureId } = validation.data;
  const query = Object.fromEntries(new URL(_request.url).searchParams.entries());
  const queryValidation = AnalysisQuerySchema.safeParse(query);
  if (!queryValidation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(queryValidation.error.flatten()), 400);
  }

  const preferences = normalizeAnalysisPreferences({
    modelMode: queryValidation.data.modelMode,
    scenario: queryValidation.data.scenario,
  });
  const forceRefresh = queryValidation.data.refresh === "1";

  const cacheKey = cacheKeys.analysis(
    validatedFixtureId,
    preferences.modelMode,
    preferences.scenario
  );
  if (!forceRefresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      addBreadcrumb(`Analysis cache hit for ${validatedFixtureId}`, "analysis", "info");
      return successResponse(cached);
    }
  }

  try {
    addBreadcrumb(`Analyzing fixture ${validatedFixtureId}`, "analysis", "info");
    const analysisData: MatchAnalysisResponse = await analyzeMatch(
      validatedFixtureId,
      session.user.id,
      preferences
    );
    const ttl = analysisData.fixture.status === "live" ? 15 : 60;
    await cache.set(cacheKey, analysisData, ttl);

    // Persist to DB if user is authenticated (non-blocking)
    persistAnalysis(validatedFixtureId, analysisData, preferences).catch(() => {});

    return successResponse(analysisData);
  } catch (error) {
    captureException(error, { fixtureId: validatedFixtureId });
    addBreadcrumb(`Analysis failed for ${validatedFixtureId}`, "analysis", "error");
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});

async function persistAnalysis(
  fixtureId: string,
  data: MatchAnalysisResponse,
  preferences: AnalysisPreferences
) {
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
          modelMode: analysisModelModeToPrisma(preferences.modelMode),
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
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "analyze:clear", 30, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes de limpieza de caché." }, 429);
  }

  const { fixtureId } = await context.params;
  for (const modelMode of ANALYSIS_MODEL_MODES) {
    for (const scenario of ANALYSIS_SCENARIO_IDS) {
      await cache.delete(cacheKeys.analysis(fixtureId, modelMode, scenario));
    }
  }
  await cache.delete(cacheKeys.fixture(fixtureId));
  return successResponse({ cleared: true, fixtureId });
});
