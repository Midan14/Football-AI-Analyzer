import { computeFixtureEdgeHints } from "@/backend/lib/fixtures/fixture-edge-hints";
import { pickFixtureScanCandidates } from "@/backend/lib/fixtures/pick-candidates";
import { mergeOddsIntoFixtures } from "@/backend/lib/fixtures/merge-fixture-odds";
import {
  enumerateIsoDates,
  filterFixturesByCountry,
} from "@/backend/lib/fixtures/fixture-range";
import {
  isApiFootballQuotaError,
  isApiFootballRateLimitError,
} from "@/backend/lib/providers/api-football-errors";
import { getActiveProviderName, getDataProvider } from "@/backend/lib/providers/provider-factory";
import { demoCountries } from "@/backend/lib/providers/demo-data";
import { buildInferredCoverageReport } from "@/backend/lib/leagues/league-confidence";
import { prisma } from "@/lib/db";
import type {
  Fixture,
  LeagueSeasonStats,
  LeagueStandingRow,
  MatchAnalysisResponse,
  MatchEvent,
} from "@/shared/domain";
import {
  DEFAULT_ANALYSIS_PREFERENCES,
  normalizeAnalysisPreferences,
  type AnalysisPreferences,
} from "@/shared/analysis-preferences";
import { syncFixtureCoverageFromMatchData } from "@/backend/lib/fixtures/sync-fixture-coverage";
import {
  ensureAccurateFixtureScore,
  mergeFixtureResult,
  normalizeFixtureScore,
} from "@/backend/lib/fixtures/fixture-score-resolver";
import { computeMetrics } from "@/backend/lib/analysis/performance-metrics";
import { predictionMarketKey } from "@/shared/prediction-market-mapping";
import type { RoiCalibrationContext } from "@/backend/lib/analysis/analysis-orchestrator";

type MatchDetailProvider = {
  getMatchDetail: (fixtureId: string) => Promise<{
    lineups?: MatchAnalysisResponse["lineups"];
    events?: MatchAnalysisResponse["events"];
    statistics?: MatchAnalysisResponse["statistics"];
    refereeName?: string | null;
  }>;
};

function hasMatchDetail(provider: unknown): provider is MatchDetailProvider {
  return typeof (provider as MatchDetailProvider).getMatchDetail === "function";
}

function hasLeagueCoverage(
  provider: unknown
): provider is { getLeagueCoverageReport: (leagueId: string, countryId?: string) => Promise<import("@/shared/domain").LeagueCoverageReport> } {
  return typeof (provider as { getLeagueCoverageReport?: unknown }).getLeagueCoverageReport === "function";
}

function hasLeagueStandings(
  provider: unknown
): provider is { getLeagueStandings: (leagueId: string, countryId?: string, limit?: number) => Promise<LeagueStandingRow[]> } {
  return typeof (provider as { getLeagueStandings?: unknown }).getLeagueStandings === "function";
}

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  const shifted = new Date(utc);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getLeagueCoverageReport(leagueId: string, countryId?: string) {
  const provider = getDataProvider();
  if (hasLeagueCoverage(provider)) {
    return provider.getLeagueCoverageReport(leagueId, countryId);
  }

  const leagues = await provider.getLeagues(countryId);
  const league = leagues.find((item) => item.id === leagueId);
  if (!league) {
    throw new Error(`League not found: ${leagueId}`);
  }

  return buildInferredCoverageReport({
    leagueId: league.id,
    leagueName: league.name,
    tier: league.tier,
    provider: getActiveProviderName(),
    season: league.season,
  });
}

export async function getLeagueStandings(leagueId: string, countryId?: string, limit = 5) {
  const provider = getDataProvider();
  if (hasLeagueStandings(provider)) {
    return provider.getLeagueStandings(leagueId, countryId, limit);
  }
  return [];
}

export async function getLeagueSeasonStats(params: {
  leagueId: string;
  from: string;
  to: string;
}): Promise<LeagueSeasonStats> {
  const range = await listFixturesRange({
    from: params.from,
    to: params.to,
    leagueId: params.leagueId,
    includeFixtures: true,
  });

  const fixtures = Object.values(range.fixturesByDate ?? {}).flat();
  const finished = fixtures.filter((fixture) => fixture.status === "final");
  const live = fixtures.filter((fixture) => fixture.status === "live");
  const totalGoals = finished.reduce((sum, fixture) => sum + (fixture.result?.totalGoals ?? 0), 0);
  const withOdds = fixtures.filter((fixture) => fixture.market.homeWinOdds > 0).length;

  return {
    leagueId: params.leagueId,
    from: params.from,
    to: params.to,
    sampleSize: fixtures.length,
    finishedMatches: finished.length,
    liveMatches: live.length,
    avgGoals: finished.length > 0 ? Number((totalGoals / finished.length).toFixed(2)) : 0,
    withOddsPct: fixtures.length > 0 ? Math.round((withOdds / fixtures.length) * 100) : 0,
  };
}

export async function getLeagueRecentStats(leagueId: string, anchorDate: string, windowDays = 14) {
  const from = shiftIsoDate(anchorDate, -(windowDays - 1));
  return getLeagueSeasonStats({ leagueId, from, to: anchorDate });
}

function hasLiveProvider(
  provider: unknown
): provider is {
  getLiveFixtures: () => Promise<Fixture[]>;
  getMatchLive: (fixtureId: string) => Promise<{
    fixture: Fixture;
    events: Array<{ time: number; team: string; teamLogo: string; player: string; type: string; detail: string }>;
    statistics: Array<{ type: string; home: string; away: string }>;
  }>;
} {
  return (
    typeof (provider as { getLiveFixtures?: unknown }).getLiveFixtures === "function" &&
    typeof (provider as { getMatchLive?: unknown }).getMatchLive === "function"
  );
}

export async function listLiveFixtures() {
  const providerName = getActiveProviderName();
  const provider = getDataProvider();
  if (!hasLiveProvider(provider)) {
    return { fixtures: [] as Fixture[], count: 0, provider: providerName };
  }
  try {
    const fixtures = await provider.getLiveFixtures();
    const demoFallback =
      providerName === "api-football" &&
      fixtures.some((f) => isDemoFixtureId(f.id));
    return {
      fixtures,
      count: fixtures.length,
      provider: demoFallback ? ("demo-fallback" as const) : providerName,
    };
  } catch (error) {
    if (providerName === "api-football" && isApiFootballQuotaError(error)) {
      return { fixtures: [], count: 0, provider: "api-football-quota" as const };
    }
    if (providerName === "api-football" && isApiFootballRateLimitError(error)) {
      return { fixtures: [], count: 0, provider: "api-football-rate-limit" as const };
    }
    throw error;
  }
}

export async function getLiveMatchDetail(fixtureId: string) {
  const provider = getDataProvider();
  if (hasLiveProvider(provider)) {
    return provider.getMatchLive(fixtureId);
  }
  const fixture = await provider.getMatch(fixtureId);
  return { fixture, events: [], statistics: [] };
}

function isDemoFixtureId(id: string): boolean {
  return id.startsWith("fixture-") || id.startsWith("demo-live-");
}

function isDemoCountriesPayload(countries: { id: string; name: string }[]): boolean {
  if (countries.length !== demoCountries.length) return false;
  return demoCountries.every((demo) => countries.some((country) => country.id === demo.id));
}

export async function listCountries() {
  const countries = await getDataProvider().getCountries();
  const provider = getActiveProviderName();
  const demoFallback = provider === "api-football" && isDemoCountriesPayload(countries);
  return { provider: demoFallback ? "demo-fallback" : provider, countries };
}

export async function listLeagues(countryId?: string) {
  const leagues = await getDataProvider().getLeagues(countryId);
  return { leagues };
}

export async function listFixtures(params: {
  leagueId?: string;
  date?: string;
  countryId?: string;
}) {
  const provider = getActiveProviderName();
  try {
    const fixtures = await getDataProvider().getFixtures(params);
    const demoFallback =
      provider === "api-football" &&
      fixtures.some((f) => isDemoFixtureId(f.id));
    return {
      fixtures,
      dataSource: demoFallback ? ("demo-fallback" as const) : provider,
    };
  } catch (error) {
    if (provider === "api-football" && isApiFootballQuotaError(error)) {
      return { fixtures: [], dataSource: "api-football-quota" as const };
    }
    if (provider === "api-football" && isApiFootballRateLimitError(error)) {
      // Transient per-second/minute throttle. Caller should retry shortly;
      // for now return an empty set with a distinct marker so the UI shows a
      // soft "saturación temporal" hint instead of the hard quota banner.
      return { fixtures: [], dataSource: "api-football-rate-limit" as const };
    }
    throw error;
  }
}

export async function listFixturesRange(params: {
  from: string;
  to: string;
  leagueId?: string;
  countryId?: string;
  includeFixtures?: boolean;
}) {
  const dates = enumerateIsoDates(params.from, params.to);
  const rows = await Promise.all(
    dates.map(async (date) => {
      const { fixtures } = await listFixtures({
        leagueId: params.leagueId,
        date,
        countryId: params.countryId,
      });
      const filtered = filterFixturesByCountry(fixtures, params.countryId);
      return { date, fixtures: filtered };
    })
  );

  const counts: Record<string, number> = {};
  const fixturesByDate: Record<string, Fixture[]> = {};

  for (const row of rows) {
    counts[row.date] = row.fixtures.length;
    if (params.includeFixtures) {
      fixturesByDate[row.date] = row.fixtures;
    }
  }

  return {
    from: params.from,
    to: params.to,
    counts,
    fixturesByDate: params.includeFixtures ? fixturesByDate : undefined,
    totalFixtures: rows.reduce((sum, row) => sum + row.fixtures.length, 0),
  };
}

export async function getFixtureEdgeHintsForDate(params: {
  date: string;
  leagueId?: string;
  countryId?: string;
}) {
  const { fixtures } = await listFixtures({
    leagueId: params.leagueId,
    date: params.date,
    countryId: params.countryId,
  });
  const filtered = filterFixturesByCountry(fixtures, params.countryId);
  const { odds } = await listOddsByDate({
    date: params.date,
    leagueId: params.leagueId,
  });
  const withOdds = mergeOddsIntoFixtures(filtered, odds);
  const candidates = pickFixtureScanCandidates(withOdds, new Set(), 24);
  const hints = computeFixtureEdgeHints(candidates);
  return { date: params.date, hints, count: Object.keys(hints).length };
}

export async function listOddsByDate(params: {
  date: string;
  leagueId?: string;
  fixtureIds?: string[];
}) {
  const provider = getDataProvider();
  if (!("getOddsMapForDate" in provider) || typeof provider.getOddsMapForDate !== "function") {
    return { odds: {}, count: 0 };
  }

  const odds = await provider.getOddsMapForDate(
    params.date,
    params.leagueId,
    params.fixtureIds
  );
  const count = Object.values(odds).filter((market) => (market.homeWinOdds ?? 0) > 0).length;
  return { odds, count };
}

export async function getMatch(fixtureId: string) {
  const match = await getDataProvider().getMatch(fixtureId);
  return { match };
}

export async function analyzeMatch(
  fixtureId: string,
  _userId?: string,
  preferences: AnalysisPreferences = DEFAULT_ANALYSIS_PREFERENCES
): Promise<MatchAnalysisResponse> {
  const prefs = normalizeAnalysisPreferences(preferences);
  const provider = getDataProvider();
  let fixture = await provider.getMatch(fixtureId);

  // Fetch lineups, events, statistics (and sync coverage chips) before analysis
  let lineups: MatchAnalysisResponse["lineups"];
  let events: MatchAnalysisResponse["events"];
  let statistics: MatchAnalysisResponse["statistics"];

  try {
    const detail = hasMatchDetail(provider) ? await provider.getMatchDetail(fixtureId) : undefined;
    if (detail) {
      lineups = detail.lineups;
      events = detail.events;
      statistics = detail.statistics;
      fixture = syncFixtureCoverageFromMatchData(fixture, {
        lineups: detail.lineups,
        refereeName: detail.refereeName ?? fixture.referee?.name,
      });
      fixture = normalizeFixtureScore(fixture, events as MatchEvent[]);
      fixture = await ensureAccurateFixtureScore(fixture, async () => events as MatchEvent[]);
    }
  } catch {
    // Non-fatal: Match Center will work without these
  }

  const { runFullAnalysis, applyRoiCalibrationToAnalysis } = await import("@/backend/lib/analysis/analysis-orchestrator");
  const { analysis: fullAnalysis, mlPrediction, analysisPipeline } = await runFullAnalysis(fixture, {
    events: events as MatchEvent[] | undefined,
    preferences: prefs,
  });
  const roiCalibration = _userId
    ? await buildRoiCalibrationContext(_userId, fixture.leagueId, fullAnalysis.recommendation.market)
    : undefined;
  const calibratedAnalysis = applyRoiCalibrationToAnalysis(fullAnalysis, fixture, roiCalibration);

  void import("@/backend/lib/odds/odds-snapshot-service").then(({ captureFixtureOddsSnapshots }) =>
    captureFixtureOddsSnapshots(fixtureId).catch(() => {})
  );

  return {
    fixture,
    analysis: calibratedAnalysis,
    lineups,
    events,
    statistics,
    mlPrediction: mlPrediction as MatchAnalysisResponse["mlPrediction"],
    analysisPipeline,
  };
}

async function buildRoiCalibrationContext(
  userId: string,
  leagueId: string | null | undefined,
  recommendationMarket: string
): Promise<RoiCalibrationContext | undefined> {
  const marketKey = predictionMarketKey(recommendationMarket);
  if (!marketKey) return undefined;

  const rows = await prisma.prediction.findMany({
    where: {
      userId,
      status: { in: ["WON", "LOST"] },
    },
    select: {
      market: true,
      prediction: true,
      status: true,
      probability: true,
      roi: true,
      stakeUnits: true,
      leagueId: true,
      clvPercent: true,
    },
    take: 5000,
  });
  if (rows.length === 0) return undefined;

  const normalizedRows = rows.map((r) => ({
    market: r.market,
    prediction: r.prediction,
    status: r.status as "WON" | "LOST",
    probability: r.probability,
    roi: r.roi,
    stakeUnits: r.stakeUnits,
    leagueId: r.leagueId,
    clvPercent: r.clvPercent,
    modelKey: "current-engine",
  }));
  const marketMetrics = computeMetrics(normalizedRows, "market").find((m) => m.key === marketKey) ?? null;
  const leagueMetrics = leagueId
    ? computeMetrics(normalizedRows, "league").find((m) => m.key === leagueId) ?? null
    : null;
  const globalMetrics = computeMetrics(
    normalizedRows.map((row) => ({ ...row, modelKey: "global" })),
    "model"
  ).find((m) => m.key === "global") ?? null;

  return { marketMetrics, leagueMetrics, globalMetrics };
}

export async function analyzeMatchDeep(fixtureId: string) {
  const fixture = await getDataProvider().getMatch(fixtureId);
  const { runFullAnalysis } = await import("@/backend/lib/analysis/analysis-orchestrator");
  const { analyzeFixtureDeep } = await import("@/backend/lib/analysis/deep-analysis-engine");

  const { analysis } = await runFullAnalysis(fixture);
  const deepBase = analyzeFixtureDeep(fixture);

  return {
    fixture,
    deepAnalysis: {
      ...deepBase,
      probabilities: analysis.probabilities,
      valueTable: analysis.valueTable,
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
      kelly: analysis.kelly,
      ensemble: analysis.ensemble,
      advancedModels: analysis.advancedModels,
    },
  };
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
