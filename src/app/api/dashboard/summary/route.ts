import { NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { analyzeMatch, listFixtures } from "@/backend/server/football/football-service";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { cache, cacheKeys } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { pickFixtureScanCandidates } from "@/backend/lib/fixtures/pick-candidates";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leagueId: z.string().min(1).optional(),
});

const MAX_SCAN = 8;
const TOP_PICKS = 5;

type FixtureInsight = {
  fixtureId: string;
  confidence: number;
  topEdge: number;
  market: string;
  riskLevel: "BAJO" | "MODERADO" | "ALTO";
};

function riskFromConfidence(score: number): FixtureInsight["riskLevel"] {
  if (score >= 72) return "BAJO";
  if (score >= 58) return "MODERADO";
  return "ALTO";
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    const rateLimit = await checkRateLimit(userId, "dashboard:summary", 30, 15);
    if (!rateLimit.allowed) {
      return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes de resumen." }, 429);
    }
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
  const cached = await cache.get<{ insights: FixtureInsight[]; topPicks: FixtureInsight[] }>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const fixturesPayload = await listFixtures({ leagueId, date });
  const fixtures = fixturesPayload.fixtures ?? [];

  let watchlistIds = new Set<string>();
  if (userId) {
    const rows = await prisma.watchlistItem.findMany({
      where: { userId },
      select: { fixtureId: true },
    });
    watchlistIds = new Set(rows.map((r) => r.fixtureId));
  }

  const candidates = pickFixtureScanCandidates(fixtures, watchlistIds, MAX_SCAN);
  const insights: FixtureInsight[] = [];

  for (const candidate of candidates) {
    try {
      const cacheAnalysisKey = cacheKeys.analysis(candidate.id);
      let analysisData = await cache.get<Awaited<ReturnType<typeof analyzeMatch>>>(cacheAnalysisKey);
      if (!analysisData) {
        analysisData = await analyzeMatch(candidate.id);
        await cache.set(cacheAnalysisKey, analysisData, candidate.status === "live" ? 15 : 60);
      }

      const analysis = analysisData.analysis;
      if (!analysis) continue;

      const confidence = analysis.confidence?.score ?? 0;
      const topValue = analysis.valueTable?.reduce(
        (best, row) => (row.edge > best.edge ? row : best),
        { edge: 0, market: analysis.recommendation?.market ?? "—" }
      );

      insights.push({
        fixtureId: candidate.id,
        confidence,
        topEdge: topValue?.edge ?? 0,
        market: analysis.recommendation?.market ?? topValue?.market ?? "—",
        riskLevel: riskFromConfidence(confidence),
      });
    } catch {
      // Skip fixtures that fail analysis
    }
  }

  const topPicks = [...insights]
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.topEdge - a.topEdge;
    })
    .slice(0, TOP_PICKS);

  const payload = { insights, topPicks };
  await cache.set(cacheKey, payload, 45);

  return successResponse(payload);
});
