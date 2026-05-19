import { prisma } from "@/lib/db";
import { getActiveProviderName, getDataProvider } from "@/backend/lib/providers/provider-factory";
import { captureException } from "@/lib/sentry";

export type AnalysisResolveSummary = {
  resolved: number;
  skipped: number;
};

function matchResult(homeGoals: number, awayGoals: number): "HOME_WIN" | "DRAW" | "AWAY_WIN" {
  if (homeGoals > awayGoals) return "HOME_WIN";
  if (awayGoals > homeGoals) return "AWAY_WIN";
  return "DRAW";
}

export async function resolveAnalysisHistory(
  userId: string,
  opts: { limit?: number } = {}
): Promise<AnalysisResolveSummary> {
  const pending = await prisma.analysis.findMany({
    where: {
      userId,
      OR: [{ result: null }, { result: "PENDING" }],
      matchDate: { lte: new Date() },
    },
    orderBy: { matchDate: "asc" },
    take: opts.limit ?? 25,
    select: {
      id: true,
      fixtureId: true,
    },
  });

  const summary: AnalysisResolveSummary = { resolved: 0, skipped: 0 };
  if (pending.length === 0) return summary;

  const provider = getDataProvider();
  const providerName = getActiveProviderName();

  for (const analysis of pending) {
    try {
      if ((providerName === "api-football" || providerName === "sportmonks") && !/^\d+$/.test(analysis.fixtureId)) {
        summary.skipped += 1;
        continue;
      }

      const fixture = await provider.getMatch(analysis.fixtureId);
      if (fixture.status !== "final" || !fixture.result) {
        summary.skipped += 1;
        continue;
      }

      const { homeGoals, awayGoals } = fixture.result;
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: {
          result: matchResult(homeGoals, awayGoals),
          homeGoals,
          awayGoals,
        },
      });
      summary.resolved += 1;
    } catch (err) {
      captureException(err, { analysisId: analysis.id, op: "resolve-analysis-history" });
      summary.skipped += 1;
    }
  }

  return summary;
}
