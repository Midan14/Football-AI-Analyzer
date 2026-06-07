import type { Country, Fixture, League, LeagueCoverageReport, LeagueStandingRow } from "@/shared/domain";
import { demoCountries, demoLeagues } from "@/backend/lib/providers/demo-data";
import { demoLeagueStandings } from "@/backend/lib/providers/demo-league-standings";
import { buildDemoRecentMatches } from "@/backend/lib/providers/demo-recent-matches";
import { demoLiveEvents, demoLiveStatistics } from "@/backend/lib/providers/demo-live-data";
import {
  filterDemoFixturesByDate,
  getDatedDemoFixtures,
  getDatedDemoLiveFixtures,
} from "@/backend/lib/providers/demo-fixture-dates";
import type { ApiLiveEvent, ApiLiveStatistic } from "@/backend/lib/providers/api-football-provider";
import { buildInferredCoverageReport } from "@/backend/lib/leagues/league-confidence";

export class DemoProvider {
  async getCountries(): Promise<Country[]> {
    return demoCountries;
  }

  async getLeagues(countryId?: string): Promise<League[]> {
    return countryId ? demoLeagues.filter((league) => league.countryId === countryId) : demoLeagues;
  }

  async getFixtures(filters: { leagueId?: string; date?: string } = {}): Promise<Fixture[]> {
    let fixtures = getDatedDemoFixtures();
    if (filters.leagueId && !/^\d+$/.test(filters.leagueId)) {
      fixtures = fixtures.filter((fixture) => fixture.leagueId === filters.leagueId);
    }
    return filterDemoFixturesByDate(fixtures, filters.date);
  }

  async getMatch(fixtureId: string): Promise<Fixture> {
    const fixture =
      getDatedDemoFixtures().find((item) => item.id === fixtureId) ??
      getDatedDemoLiveFixtures().find((item) => item.id === fixtureId);
    if (!fixture) {
      throw new Error(`Fixture not found: ${fixtureId}`);
    }
    return {
      ...fixture,
      home: {
        ...fixture.home,
        recentMatches: buildDemoRecentMatches(fixture.home.name, fixture.home.form),
      },
      away: {
        ...fixture.away,
        recentMatches: buildDemoRecentMatches(fixture.away.name, fixture.away.form),
      },
    };
  }

  async getLeagueCoverageReport(leagueId: string): Promise<LeagueCoverageReport> {
    const league = demoLeagues.find((item) => item.id === leagueId);
    if (!league) {
      throw new Error(`League not found: ${leagueId}`);
    }

    const report = buildInferredCoverageReport({
      leagueId: league.id,
      leagueName: league.name,
      tier: league.tier,
      provider: "demo",
      season: league.season,
      capabilities: {
        standings: league.tier !== "low",
        odds: league.tier !== "low",
        lineups: league.tier === "elite",
        xg: league.tier === "elite",
        injuries: league.tier === "elite",
        h2h: league.tier !== "low",
        momentum: league.tier === "elite",
      },
    });

    return {
      ...report,
      coverageScore: league.coverageScore,
      confidenceImpact: report.confidenceImpact,
      source: "provider-metadata",
    };
  }

  async getLeagueStandings(leagueId: string, _countryId?: string, limit = 5): Promise<LeagueStandingRow[]> {
    return (demoLeagueStandings[leagueId] ?? []).slice(0, limit);
  }

  async getLiveFixtures(): Promise<Fixture[]> {
    return getDatedDemoLiveFixtures();
  }

  async getMatchLive(fixtureId: string): Promise<{
    fixture: Fixture;
    events: ApiLiveEvent[];
    statistics: ApiLiveStatistic[];
  }> {
    const fixture = getDatedDemoLiveFixtures().find((item) => item.id === fixtureId);
    if (!fixture) {
      return { fixture: await this.getMatch(fixtureId), events: [], statistics: [] };
    }
    return {
      fixture,
      events: demoLiveEvents[fixtureId] ?? [],
      statistics: demoLiveStatistics[fixtureId] ?? [],
    };
  }

  async getBookmakersOddsForFixture(fixtureId: string): Promise<Record<string, import("@/shared/domain").FixtureMarket>> {
    const fixture = await this.getMatch(fixtureId);
    const base = fixture.market;
    const tweak = (value: number, delta: number) =>
      Math.max(1.05, Math.round((value + delta) * 100) / 100);

    return {
      Bet365: base,
      "1xBet": {
        ...base,
        homeWinOdds: tweak(base.homeWinOdds, 0.05),
        drawOdds: tweak(base.drawOdds, -0.04),
        awayWinOdds: tweak(base.awayWinOdds, 0.08),
        over25Odds: tweak(base.over25Odds, 0.05),
        under35Odds: tweak(base.under35Odds, -0.03),
        bttsYesOdds: tweak(base.bttsYesOdds, 0.04),
        bttsNoOdds: tweak(base.bttsNoOdds, -0.03),
      },
    };
  }
}
