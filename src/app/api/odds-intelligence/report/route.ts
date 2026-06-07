import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { listFixtures } from "@/backend/server/football/football-service";
import { getFixtureBookmakerOdds } from "@/backend/lib/odds/bookmaker-odds-service";
import {
  buildOddsQualityReport,
  compareBookmakerOdds,
} from "@/backend/lib/odds/odds-intelligence";
import { pickFixtureScanCandidates } from "@/backend/lib/fixtures/pick-candidates";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const rateLimit = await checkRateLimit(session.user.id, "odds-intelligence:report", 20, 15);
  if (!rateLimit.allowed) {
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes." }, 429);
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return errorResponse({ code: "VALIDATION_ERROR", message: "date (YYYY-MM-DD) es requerido" }, 400);
  }

  const groupByRaw = url.searchParams.get("groupBy") ?? "league";
  const groupBy: "league" | "market" = groupByRaw === "market" ? "market" : "league";
  const limit = Math.min(24, Math.max(4, Number.parseInt(url.searchParams.get("limit") ?? "12", 10)));

  const { fixtures } = await listFixtures({ date });
  const candidates = pickFixtureScanCandidates(fixtures, new Set(), limit);

  const comparisons: Array<{ fixture: (typeof candidates)[number]; compare: ReturnType<typeof compareBookmakerOdds> }> = [];

  for (const fixture of candidates) {
    const bookmakers = await getFixtureBookmakerOdds(fixture.id);
    const compare = compareBookmakerOdds(fixture.id, bookmakers);
    comparisons.push({ fixture, compare });
  }

  const report = buildOddsQualityReport(date, groupBy, comparisons);

  return successResponse({
    report,
    fixtures: comparisons
      .filter((item) => item.compare.bookmakers.length >= 2)
      .slice(0, 8)
      .map((item) => ({
        fixtureId: item.fixture.id,
        home: item.fixture.home.name,
        away: item.fixture.away.name,
        leagueName: item.fixture.leagueName,
        avgSpreadPercent: item.compare.avgSpreadPercent,
        outlierCount: item.compare.outlierCount,
      })),
  });
});
