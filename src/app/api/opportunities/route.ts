import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { analyzeMatch, listFixtures } from "@/backend/server/football/football-service";
import { pickFixtureScanCandidates } from "@/backend/lib/fixtures/pick-candidates";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { cache, cacheKeys } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Fixture } from "@/shared/domain";

const QuerySchema = {
  safeParse(params: {
    date?: string | null;
    leagueId?: string | null;
    minEdge?: string | null;
    minConfidence?: string | null;
    limit?: string | null;
    scope?: string | null;
  }) {
    const date = params.date ?? undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false as const, error: "date (YYYY-MM-DD) es requerido" };
    }
    const scope = params.scope === "watchlist" ? "watchlist" : "day";
    const minEdge = parseFloat(params.minEdge || "3");
    const minConfidence = parseFloat(params.minConfidence || "55");
    const limit = Math.min(30, Math.max(1, parseInt(params.limit || "15", 10)));
    const leagueId = params.leagueId ?? undefined;
    return {
      success: true as const,
      data: { date, leagueId, scope, minEdge, minConfidence, limit },
    };
  },
};

type OpportunityRow = {
  fixtureId: string;
  fixture: Fixture;
  timestamp: string;
  confidence: number;
  valueBets: Array<{
    market: string;
    modelProbability: number;
    marketProbability: number;
    edge: number;
    verdict: string;
    fairOdds: number;
  }>;
  bestBet: { market: string; stakeUnits?: number; fairOdds?: number; edge?: number } | null;
  stakeSuggestion: number;
};

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    date: url.searchParams.get("date"),
    leagueId: url.searchParams.get("leagueId"),
    minEdge: url.searchParams.get("minEdge"),
    minConfidence: url.searchParams.get("minConfidence"),
    limit: url.searchParams.get("limit"),
    scope: url.searchParams.get("scope"),
  });

  if (!parsed.success) {
    return errorResponse({ code: "VALIDATION_ERROR", message: parsed.error }, 400);
  }

  const { date, leagueId, scope, minEdge, minConfidence, limit } = parsed.data;

  const rateLimit = await checkRateLimit(session.user.id, "opportunities:scan", 20, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiados escaneos. Espera un momento." }, 429);
  }

  const watchlistRows = await prisma.watchlistItem.findMany({
    where: { userId: session.user.id },
    select: { fixtureId: true },
  });
  const watchlistIds = new Set(watchlistRows.map((r) => r.fixtureId));

  const fixturesPayload = await listFixtures({ leagueId, date });
  if (fixturesPayload.dataSource === "api-football-quota") {
    return successResponse({
      scope,
      date,
      dataSource: "api-football-quota",
      message: "Cuota API agotada — no hay partidos para escanear.",
      opportunities: [],
      scanned: 0,
    });
  }

  const fixtures = fixturesPayload.fixtures ?? [];
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  let candidates: Fixture[] = [];
  if (scope === "watchlist") {
    if (watchlistIds.size === 0) {
      return successResponse({
        scope,
        date,
        message: "No hay partidos en watchlist. Marca ⭐ en el tablero para seguirlos.",
        opportunities: [],
        scanned: 0,
      });
    }
    candidates = Array.from(watchlistIds)
      .map((id) => fixtureById.get(id))
      .filter((f): f is Fixture => Boolean(f))
      .slice(0, limit * 2);
    if (candidates.length === 0) {
      return successResponse({
        scope,
        date,
        message:
          "Ningún partido de tu watchlist está en esta fecha. Cambia la fecha o usa el modo «Día completo».",
        opportunities: [],
        scanned: 0,
        watchlistCount: watchlistIds.size,
      });
    }
  } else {
    candidates = pickFixtureScanCandidates(fixtures, watchlistIds);
  }

  const opportunities: OpportunityRow[] = [];

  for (const candidate of candidates) {
    try {
      const cacheKey = cacheKeys.analysis(candidate.id);
      let data = await cache.get<Awaited<ReturnType<typeof analyzeMatch>>>(cacheKey);
      if (!data) {
        data = await analyzeMatch(candidate.id);
        await cache.set(cacheKey, data, candidate.status === "live" ? 15 : 90);
      }

      const analysis = data.analysis;
      if (!analysis) continue;

      const valueBets =
        analysis.valueTable?.filter(
          (row) => row.edge >= minEdge && row.modelProbability >= minConfidence
        ) ?? [];

      if (valueBets.length === 0) continue;

      opportunities.push({
        fixtureId: candidate.id,
        fixture: data.fixture ?? candidate,
        timestamp: new Date().toISOString(),
        confidence: analysis.confidence?.score ?? 0,
        valueBets: valueBets.map((v) => ({
          market: v.market,
          modelProbability: v.modelProbability,
          marketProbability: v.marketProbability,
          edge: v.edge,
          verdict: v.verdict,
          fairOdds: Math.round((100 / Math.max(v.modelProbability, 1)) * 100) / 100,
        })),
        bestBet: analysis.recommendation ?? null,
        stakeSuggestion: analysis.recommendation?.stakeUnits ?? 0,
      });
    } catch {
      // Skip failed fixtures
    }
  }

  opportunities.sort((a, b) => {
    const maxEdgeA = Math.max(...a.valueBets.map((v) => v.edge), 0);
    const maxEdgeB = Math.max(...b.valueBets.map((v) => v.edge), 0);
    return maxEdgeB - maxEdgeA;
  });

  return successResponse({
    count: opportunities.length,
    scope,
    date,
    dataSource: fixturesPayload.dataSource,
    scanned: candidates.length,
    watchlistCount: watchlistIds.size,
    filters: { minEdge, minConfidence, limit },
    opportunities: opportunities.slice(0, limit),
  });
});
