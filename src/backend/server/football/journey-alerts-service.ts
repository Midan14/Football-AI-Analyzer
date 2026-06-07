import type { Fixture } from "@/shared/domain";
import { fixtureStatusLabelEs } from "@/shared/fixture-status";
import { mergeLiveIntoFixtures } from "@/backend/lib/fixtures/merge-live-fixtures";
import { mergeOddsIntoFixtures } from "@/backend/lib/fixtures/merge-fixture-odds";
import { pickFixtureScanCandidates } from "@/backend/lib/fixtures/pick-candidates";
import {
  scanFixtureInsights,
  type FixtureInsight,
} from "@/backend/server/football/fixture-insights-scan";
import {
  listFixtures,
  listLiveFixtures,
  listOddsByDate,
} from "@/backend/server/football/football-service";
import { prisma } from "@/lib/db";

export type JourneyAlertDto = {
  id: string;
  type: "risk" | "value" | "live" | "lineup" | "custom";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  fixtureId: string;
  market?: string;
  edge?: number;
  confidence?: number;
  source: "api-live" | "api-odds" | "model-scan";
};

export type JourneyAlertsPayload = {
  dataSource: string;
  liveProvider: string;
  oddsLoaded: boolean;
  oddsWithQuotes: number;
  fixturesTotal: number;
  liveCount: number;
  alerts: JourneyAlertDto[];
  insights: FixtureInsight[];
  stats: {
    high: number;
    medium: number;
    low: number;
    value: number;
    live: number;
  };
  updatedAt: string;
};

function fixtureLabel(fixture: Fixture): string {
  return `${fixture.home.name} vs ${fixture.away.name}`;
}

function liveScoreLine(fixture: Fixture): string {
  const home = fixture.result?.homeGoals ?? 0;
  const away = fixture.result?.awayGoals ?? 0;
  return `${fixture.home.name} ${home}-${away} ${fixture.away.name}`;
}

function buildLiveAlerts(fixtures: Fixture[]): JourneyAlertDto[] {
  return fixtures
    .filter((fixture) => fixture.status === "live")
    .map((fixture) => {
      const minute =
        fixture.elapsed != null && fixture.elapsed > 0
          ? `${fixture.elapsed}'`
          : fixtureStatusLabelEs(fixture.status, fixture.statusLong);
      return {
        id: `${fixture.id}-api-live`,
        type: "live" as const,
        severity: "medium" as const,
        title: liveScoreLine(fixture),
        description: `En vivo · ${minute} · ${fixture.leagueName} · feed API-Football`,
        fixtureId: fixture.id,
        source: "api-live" as const,
      };
    });
}

function buildValueAlerts(
  fixtures: Fixture[],
  insights: FixtureInsight[]
): JourneyAlertDto[] {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const alerts: JourneyAlertDto[] = [];

  for (const insight of insights) {
    if (insight.topEdge < 5) continue;
    const fixture = byId.get(insight.fixtureId);
    if (!fixture) continue;

    alerts.push({
      id: `${fixture.id}-model-value-${insight.market}`,
      type: "value",
      severity: insight.topEdge >= 10 ? "high" : "medium",
      title: `Edge modelo: ${insight.market}`,
      description: `${fixtureLabel(fixture)} · Edge +${insight.topEdge.toFixed(1)}% · Confianza ${Math.round(insight.confidence)}/100 · ${insight.riskLevel}`,
      fixtureId: fixture.id,
      market: insight.market,
      edge: insight.topEdge,
      confidence: insight.confidence,
      source: "model-scan",
    });
  }

  return alerts;
}

function buildWatchlistOddsAlerts(
  fixtures: Fixture[],
  watchlistIds: Set<string>,
  oddsLoaded: boolean
): JourneyAlertDto[] {
  if (!oddsLoaded || watchlistIds.size === 0) return [];

  const alerts: JourneyAlertDto[] = [];
  for (const fixture of fixtures) {
    if (!watchlistIds.has(fixture.id)) continue;
    if (fixture.status === "final" || fixture.status === "cancelled" || fixture.status === "postponed") {
      continue;
    }
    if (fixture.market.homeWinOdds > 0 || fixture.coverage.hasOdds) continue;

    alerts.push({
      id: `${fixture.id}-api-no-odds`,
      type: "risk",
      severity: "high",
      title: "Sin cuotas en API",
      description: `${fixtureLabel(fixture)} · La API no devolvió cuotas 1X2 para este partido en la jornada consultada.`,
      fixtureId: fixture.id,
      source: "api-odds",
    });
  }

  return alerts;
}

function computeStats(alerts: JourneyAlertDto[]) {
  return {
    high: alerts.filter((alert) => alert.severity === "high").length,
    medium: alerts.filter((alert) => alert.severity === "medium").length,
    low: alerts.filter((alert) => alert.severity === "low").length,
    value: alerts.filter((alert) => alert.type === "value").length,
    live: alerts.filter((alert) => alert.type === "live").length,
  };
}

export async function buildJourneyAlerts(params: {
  date: string;
  leagueId?: string;
  userId?: string;
}): Promise<JourneyAlertsPayload> {
  const { date, leagueId, userId } = params;

  const fixturesPayload = await listFixtures({ leagueId, date });
  let fixtures = fixturesPayload.fixtures ?? [];
  const dataSource = fixturesPayload.dataSource ?? "unknown";

  const oddsPayload = await listOddsByDate({ date, leagueId });
  const oddsLoaded = oddsPayload.count > 0 || Object.keys(oddsPayload.odds).length > 0;
  fixtures = mergeOddsIntoFixtures(fixtures, oddsPayload.odds);

  let liveProvider = "unknown";
  try {
    const livePayload = await listLiveFixtures();
    liveProvider = livePayload.provider;
    fixtures = mergeLiveIntoFixtures(fixtures, livePayload.fixtures);
  } catch {
    // Live feed optional — day list still usable
  }

  let watchlistIds = new Set<string>();
  if (userId) {
    const rows = await prisma.watchlistItem.findMany({
      where: { userId },
      select: { fixtureId: true },
    });
    watchlistIds = new Set(rows.map((row) => row.fixtureId));
  }

  const candidates = pickFixtureScanCandidates(fixtures, watchlistIds);
  const insights = await scanFixtureInsights(candidates);

  const alerts = [
    ...buildLiveAlerts(fixtures),
    ...buildValueAlerts(fixtures, insights),
    ...buildWatchlistOddsAlerts(fixtures, watchlistIds, oddsLoaded),
  ].sort((a, b) => {
    const sev = { high: 3, medium: 2, low: 1 };
    return sev[b.severity] - sev[a.severity];
  });

  const oddsWithQuotes = fixtures.filter(
    (fixture) => fixture.market.homeWinOdds > 0 || fixture.coverage.hasOdds
  ).length;
  const liveCount = fixtures.filter((fixture) => fixture.status === "live").length;

  return {
    dataSource,
    liveProvider,
    oddsLoaded,
    oddsWithQuotes,
    fixturesTotal: fixtures.length,
    liveCount,
    alerts,
    insights,
    stats: computeStats(alerts),
    updatedAt: new Date().toISOString(),
  };
}
