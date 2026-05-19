import { analyzeFixture, blendAnalysisWithML } from "@/backend/lib/analysis/analysis-engine";
import { analyzeFixtureDeep } from "@/backend/lib/analysis/deep-analysis-engine";
import { getActiveProviderName, getDataProvider } from "@/backend/lib/providers/provider-factory";
import { predictWithML } from "@/backend/lib/ml/predictor";
import { prisma } from "@/lib/db";

type MatchDetailProvider = {
  getMatchDetail: (fixtureId: string) => Promise<{
    lineups?: any[];
    events?: any[];
    statistics?: any[];
  }>;
};

function hasMatchDetail(provider: unknown): provider is MatchDetailProvider {
  return typeof (provider as MatchDetailProvider).getMatchDetail === "function";
}

export async function listCountries() {
  const countries = await getDataProvider().getCountries();
  return { provider: getActiveProviderName(), countries };
}

export async function listLeagues(countryId?: string) {
  const leagues = await getDataProvider().getLeagues(countryId);
  return { leagues };
}

export async function listFixtures(params: { leagueId?: string; date?: string }) {
  const fixtures = await getDataProvider().getFixtures(params);
  return { fixtures };
}

export async function getMatch(fixtureId: string) {
  const match = await getDataProvider().getMatch(fixtureId);
  return { match };
}

export async function analyzeMatch(fixtureId: string, userId?: string) {
  const provider = getDataProvider();
  const fixture = await provider.getMatch(fixtureId);
  const analysis = analyzeFixture(fixture);

  // Fetch lineups, events, and statistics in parallel (non-fatal)
  let lineups: any[] | undefined;
  let events: any[] | undefined;
  let statistics: any[] | undefined;

  try {
    const detail = hasMatchDetail(provider) ? await provider.getMatchDetail(fixtureId) : undefined;
    if (detail) {
      lineups = detail.lineups;
      events = detail.events;
      statistics = detail.statistics;
    }
  } catch {
    // Non-fatal: Match Center will work without these
  }

  // Optional ML prediction (non-blocking)
  let mlPrediction = null;
  try {
    mlPrediction = await predictWithML(fixture);
  } catch {
    // ML not available — keep serving base analysis
  }

  // If ML is available, blend its 1X2 probabilities into the main analysis
  const finalAnalysis = mlPrediction?.probabilities?.ensemble
    ? blendAnalysisWithML(
        analysis,
        fixture,
        mlPrediction.probabilities.ensemble,
        mlPrediction.confidence
      )
    : analysis;

  return { fixture, analysis: finalAnalysis, lineups, events, statistics, mlPrediction };
}

export async function analyzeMatchDeep(fixtureId: string) {
  const fixture = await getDataProvider().getMatch(fixtureId);
  const deepAnalysis = analyzeFixtureDeep(fixture);
  return { fixture, deepAnalysis };
}

/**
 * Get analysis history for a user (from DB)
 */
export async function getAnalysisHistory(userId: string, limit = 20) {
  const analyses = await prisma.analysis.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fixtureId: true,
      league: true,
      country: true,
      homeTeam: true,
      awayTeam: true,
      matchDate: true,
      homeWinProb: true,
      drawProb: true,
      awayWinProb: true,
      confidenceScore: true,
      bestBet: true,
      stakeUnits: true,
      result: true,
      homeGoals: true,
      awayGoals: true,
      createdAt: true,
    },
  });
  return analyses;
}
