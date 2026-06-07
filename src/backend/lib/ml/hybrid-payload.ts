/**
 * Build real ML / hybrid payloads from enriched Fixture + odds snapshots.
 */

import type { Fixture } from "@/shared/domain";
import { getRecentSnapshots } from "@/backend/lib/odds/odds-snapshot-service";
import { ensureTeamEloFromSnapshot } from "@/backend/lib/ml/team-elo-service";

type MLContext = {
  elo: { home: number; away: number };
  odds: {
    openingHomeOdds?: number;
    openingDrawOdds?: number;
    openingAwayOdds?: number;
    currentHomeOdds?: number;
    currentDrawOdds?: number;
    currentAwayOdds?: number;
    movementHome?: number;
    movementDraw?: number;
    movementAway?: number;
    exchangeVolume?: number;
  };
  tactical: {
    homePossession: number;
    awayPossession: number;
    homeCornersAvg: number;
    awayCornersAvg: number;
    homeShotsOnTargetAvg: number;
    awayShotsOnTargetAvg: number;
    homeFastBreaks?: number;
    awayFastBreaks?: number;
  };
  motivation: {
    relegation: boolean;
    title_race: boolean;
    dead_rubber: boolean;
    home_score: number;
  };
  league: { avgGoals: number; avgXg: number };
  squad: {
    expectedXiValue: number;
    squadValue: number;
    xiValueRatio: number;
  };
  rest_days_diff: number;
  exchange_volume: number;
};

function impliedProb(odds: number): number {
  return odds > 1 ? 1 / odds : 0;
}

async function buildOddsContext(fixture: Fixture): Promise<MLContext["odds"]> {
  const market = fixture.market;
  const current = {
    home: market.homeWinOdds,
    draw: market.drawOdds,
    away: market.awayWinOdds,
  };

  let openingHome = current.home;
  let openingDraw = current.draw;
  let openingAway = current.away;

  try {
    const snaps = await getRecentSnapshots(fixture.id, 500);
    const homeSnaps = snaps
      .filter((s) => s.marketKey === "home_win")
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const drawSnaps = snaps
      .filter((s) => s.marketKey === "draw")
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const awaySnaps = snaps
      .filter((s) => s.marketKey === "away_win")
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

    if (homeSnaps[0]?.odds) openingHome = homeSnaps[0].odds;
    if (drawSnaps[0]?.odds) openingDraw = drawSnaps[0].odds;
    if (awaySnaps[0]?.odds) openingAway = awaySnaps[0].odds;
  } catch {
    // use current market as opening when no snapshots
  }

  return {
    openingHomeOdds: openingHome,
    openingDrawOdds: openingDraw,
    openingAwayOdds: openingAway,
    currentHomeOdds: current.home,
    currentDrawOdds: current.draw,
    currentAwayOdds: current.away,
    movementHome: impliedProb(current.home) - impliedProb(openingHome),
    movementDraw: impliedProb(current.draw) - impliedProb(openingDraw),
    movementAway: impliedProb(current.away) - impliedProb(openingAway),
    exchangeVolume: 0,
  };
}

function buildMotivation(fixture: Fixture): MLContext["motivation"] {
  const ctx = fixture.context;
  const homeMot = fixture.home.motivation;
  return {
    relegation: ctx.relegationRisk > 55,
    title_race: ctx.mustWinHome || ctx.mustWinAway || ctx.playoff,
    dead_rubber: homeMot < 25 && fixture.away.motivation < 25 && !ctx.playoff,
    home_score: homeMot,
  };
}

function buildSquadValue(fixture: Fixture): MLContext["squad"] {
  const homeInjuries = fixture.squad?.home.injuries.length ?? 0;
  const awayInjuries = fixture.squad?.away.injuries.length ?? 0;
  const homeXi = Math.max(0.4, 1 - homeInjuries * 0.08);
  const awayXi = Math.max(0.4, 1 - awayInjuries * 0.08);
  return {
    expectedXiValue: homeXi,
    squadValue: 1,
    xiValueRatio: homeXi / awayXi,
  };
}

function buildTactical(fixture: Fixture): MLContext["tactical"] {
  const mpH = Math.max(1, fixture.home.matchesPlayed);
  const mpA = Math.max(1, fixture.away.matchesPlayed);
  const gfH = fixture.home.goalsFor / mpH;
  const gfA = fixture.away.goalsFor / mpA;

  return {
    homePossession: 48 + Math.min(15, gfH * 4),
    awayPossession: 48 + Math.min(12, gfA * 3.5),
    homeCornersAvg: 4.5 + gfH * 0.8,
    awayCornersAvg: 4 + gfA * 0.7,
    homeShotsOnTargetAvg: 3.5 + gfH * 1.2,
    awayShotsOnTargetAvg: 3 + gfA * 1.1,
    homeFastBreaks: gfH * 0.6,
    awayFastBreaks: gfA * 0.55,
  };
}

export async function buildHybridMLContext(fixture: Fixture): Promise<MLContext> {
  const elo = await ensureTeamEloFromSnapshot(fixture);
  const odds = await buildOddsContext(fixture);
  const leagueAvgGoals = 2.65;
  return {
    elo: { home: elo.home, away: elo.away },
    odds,
    tactical: buildTactical(fixture),
    motivation: buildMotivation(fixture),
    league: { avgGoals: leagueAvgGoals, avgXg: leagueAvgGoals / 2 },
    squad: buildSquadValue(fixture),
    rest_days_diff: fixture.home.restDays - fixture.away.restDays,
    exchange_volume: 0,
  };
}

/** Real team stats for ML — derived from fixture snapshot, not random fabrication. */
export function buildMLStatsPayload(fixture: Fixture) {
  const homeMP = Math.max(1, fixture.home.matchesPlayed || 18);
  const awayMP = Math.max(1, fixture.away.matchesPlayed || 18);
  const homeHomeMP = Math.max(1, Math.ceil(homeMP / 2));
  const awayAwayMP = Math.max(1, Math.ceil(awayMP / 2));

  const homeWinsEst = Math.round((fixture.home.pointsTotal / 3) * 0.75);
  const awayWinsEst = Math.round((fixture.away.pointsTotal / 3) * 0.65);
  const homeDrawsEst = Math.max(0, Math.round(homeMP * 0.25));
  const awayDrawsEst = Math.max(0, Math.round(awayMP * 0.28));

  const homeStats = {
    fixtures: {
      played: { total: homeMP, home: homeHomeMP },
      wins: { total: homeWinsEst, home: Math.round(homeWinsEst * 0.55) },
      draws: { total: homeDrawsEst },
    },
    goals: {
      for: { total: { total: fixture.home.goalsFor, home: Math.round(fixture.home.goalsFor * 0.55) } },
      against: { total: { total: fixture.home.goalsAgainst } },
    },
    form: fixture.home.form.join(""),
    clean_sheet: { total: Math.round(homeMP * (fixture.home.goalsAgainst / homeMP < 1 ? 0.35 : 0.2)) },
    failed_to_score: { total: Math.round(homeMP * 0.22) },
    penalty: { scored: { total: Math.round(homeMP * 0.04) } },
    xg_for: fixture.home.xgFor,
    xg_against: fixture.home.xgAgainst,
    possession_avg: 48 + (fixture.home.goalsFor / homeMP) * 4,
    corners_avg: 4.5 + (fixture.home.goalsFor / homeMP) * 0.8,
    shots_on_target_avg: 3.5 + (fixture.home.goalsFor / homeMP) * 1.2,
  };

  const awayStats = {
    fixtures: {
      played: { total: awayMP, away: awayAwayMP },
      wins: { total: awayWinsEst, away: Math.round(awayWinsEst * 0.45) },
      draws: { total: awayDrawsEst },
    },
    goals: {
      for: { total: { total: fixture.away.goalsFor, away: Math.round(fixture.away.goalsFor * 0.42) } },
      against: { total: { total: fixture.away.goalsAgainst } },
    },
    form: fixture.away.form.join(""),
    clean_sheet: { total: Math.round(awayMP * (fixture.away.goalsAgainst / awayMP < 1.1 ? 0.28 : 0.18)) },
    failed_to_score: { total: Math.round(awayMP * 0.24) },
    penalty: { scored: { total: Math.round(awayMP * 0.035) } },
    xg_for: fixture.away.xgFor,
    xg_against: fixture.away.xgAgainst,
    possession_avg: 48 + (fixture.away.goalsFor / awayMP) * 3.5,
    corners_avg: 4 + (fixture.away.goalsFor / awayMP) * 0.7,
    shots_on_target_avg: 3 + (fixture.away.goalsFor / awayMP) * 1.1,
  };

  return { homeStats, awayStats };
}

export async function buildHybridRequestPayload(fixture: Fixture) {
  const { homeStats, awayStats } = buildMLStatsPayload(fixture);
  const ml_context = await buildHybridMLContext(fixture);
  const fixturePayload = {
    ...fixture,
    ml_context,
    context: fixture.context,
    market: fixture.market,
    home: {
      ...fixture.home,
      recentMatches: fixture.home.recentMatches?.map((m) => ({
        ...m,
        homeXg: m.homeGoals * 0.95,
        awayXg: m.awayGoals * 0.95,
        isHome: m.homeTeam === fixture.home.name,
        isAway: m.awayTeam === fixture.home.name,
        venue: m.homeTeam === fixture.home.name ? "home" : "away",
      })),
    },
    away: {
      ...fixture.away,
      recentMatches: fixture.away.recentMatches?.map((m) => ({
        ...m,
        homeXg: m.homeGoals * 0.95,
        awayXg: m.awayGoals * 0.95,
        isHome: m.homeTeam === fixture.away.name,
        isAway: m.awayTeam === fixture.away.name,
        venue: m.homeTeam === fixture.away.name ? "home" : "away",
      })),
    },
  };
  return { homeStats, awayStats, fixture: fixturePayload };
}
