/**
 * Build real ML / hybrid payloads from enriched Fixture + odds snapshots.
 */

import type { Fixture, TeamSnapshot } from "@/shared/domain";
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

/** Neutral baselines used only when API-Football did not return tactical stats. */
const NEUTRAL_TACTICAL = {
  possession: 50,
  corners: 5,
  shotsOnTarget: 4.5,
  fastBreaks: 1,
} as const;

function tacticalFromTeam(team: TeamSnapshot): {
  possession: number;
  corners: number;
  shotsOnTarget: number;
  fastBreaks: number;
  fromApi: boolean;
} {
  if (team.tacticalStatsSource === "api-football") {
    return {
      possession: team.possessionAvg ?? NEUTRAL_TACTICAL.possession,
      corners: team.cornersAvg ?? NEUTRAL_TACTICAL.corners,
      shotsOnTarget: team.shotsOnTargetAvg ?? NEUTRAL_TACTICAL.shotsOnTarget,
      fastBreaks: NEUTRAL_TACTICAL.fastBreaks,
      fromApi: true,
    };
  }
  return { ...NEUTRAL_TACTICAL, fromApi: false };
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
  const homeImpact =
    (fixture.squad?.home.injuries ?? []).reduce((s, i) => s + i.impact, 0) +
    (fixture.squad?.home.suspensions.length ?? 0) * 6;
  const awayImpact =
    (fixture.squad?.away.injuries ?? []).reduce((s, i) => s + i.impact, 0) +
    (fixture.squad?.away.suspensions.length ?? 0) * 6;

  const homeXi = Math.max(0.35, 1 - Math.min(0.55, homeImpact * 0.025));
  const awayXi = Math.max(0.35, 1 - Math.min(0.55, awayImpact * 0.025));

  return {
    expectedXiValue: homeXi,
    squadValue: Math.round((homeXi + awayXi) * 50) / 100,
    xiValueRatio: homeXi / awayXi,
  };
}

function buildTactical(fixture: Fixture): MLContext["tactical"] {
  const home = tacticalFromTeam(fixture.home);
  const away = tacticalFromTeam(fixture.away);
  return {
    homePossession: home.possession,
    awayPossession: away.possession,
    homeCornersAvg: home.corners,
    awayCornersAvg: away.corners,
    homeShotsOnTargetAvg: home.shotsOnTarget,
    awayShotsOnTargetAvg: away.shotsOnTarget,
    homeFastBreaks: home.fastBreaks,
    awayFastBreaks: away.fastBreaks,
  };
}

function recentMatchXgPayload(
  match: NonNullable<TeamSnapshot["recentMatches"]>[number],
  teamName: string
): { homeXg?: number; awayXg?: number; xg_for?: number; xg_against?: number } {
  if (match.statsSource !== "api-football" || match.homeXg == null || match.awayXg == null) {
    return {};
  }
  const isHome = match.homeTeam === teamName;
  return {
    homeXg: match.homeXg,
    awayXg: match.awayXg,
    xg_for: isHome ? match.homeXg : match.awayXg,
    xg_against: isHome ? match.awayXg : match.homeXg,
  };
}

export async function buildHybridMLContext(fixture: Fixture): Promise<MLContext> {
  const elo = await ensureTeamEloFromSnapshot(fixture);
  const odds = await buildOddsContext(fixture);
  const homeMp = Math.max(1, fixture.home.matchesPlayed || 18);
  const awayMp = Math.max(1, fixture.away.matchesPlayed || 18);
  const leagueAvgGoals =
    (fixture.home.goalsFor / homeMp + fixture.away.goalsFor / awayMp + fixture.home.goalsAgainst / homeMp + fixture.away.goalsAgainst / awayMp) /
    2;
  const homeXgRate =
    fixture.home.xgSource === "api-football" ? fixture.home.xgFor / homeMp : undefined;
  const awayXgRate =
    fixture.away.xgSource === "api-football" ? fixture.away.xgFor / awayMp : undefined;
  const leagueAvgXg =
    homeXgRate != null && awayXgRate != null
      ? (homeXgRate + awayXgRate) / 2
      : homeXgRate ?? awayXgRate;

  return {
    elo: { home: elo.home, away: elo.away },
    odds,
    tactical: buildTactical(fixture),
    motivation: buildMotivation(fixture),
    league: {
      avgGoals: Math.round(leagueAvgGoals * 1000) / 1000,
      avgXg: leagueAvgXg != null ? Math.round(leagueAvgXg * 1000) / 1000 : 0,
    },
    squad: buildSquadValue(fixture),
    rest_days_diff: fixture.home.restDays - fixture.away.restDays,
    exchange_volume: 0,
  };
}

/** Team stats shape aligned with ml-service/features.py and API-Football statistics. */
export function buildMLStatsPayload(fixture: Fixture) {
  const homeMP = Math.max(1, fixture.home.matchesPlayed || 18);
  const awayMP = Math.max(1, fixture.away.matchesPlayed || 18);
  const homeHomeMP = Math.max(1, Math.ceil(homeMP / 2));
  const awayAwayMP = Math.max(1, Math.ceil(awayMP / 2));

  const homeWins = fixture.home.form.filter((f) => f === "W").length * Math.ceil(homeMP / 5);
  const awayWins = fixture.away.form.filter((f) => f === "W").length * Math.ceil(awayMP / 5);
  const homeDraws = fixture.home.form.filter((f) => f === "D").length * Math.ceil(homeMP / 5);
  const awayDraws = fixture.away.form.filter((f) => f === "D").length * Math.ceil(awayMP / 5);

  const homeTactical = tacticalFromTeam(fixture.home);
  const awayTactical = tacticalFromTeam(fixture.away);

  const homeStats = {
    fixtures: {
      played: { total: homeMP, home: homeHomeMP },
      wins: { total: Math.min(homeMP, homeWins), home: Math.round(Math.min(homeMP, homeWins) * 0.55) },
      draws: { total: Math.min(homeMP, homeDraws) },
    },
    goals: {
      for: { total: { total: fixture.home.goalsFor, home: Math.round(fixture.home.goalsFor * 0.55) } },
      against: { total: { total: fixture.home.goalsAgainst } },
    },
    form: fixture.home.form.join(""),
    clean_sheet: {
      total: Math.round(homeMP * (fixture.home.goalsAgainst / homeMP < 1 ? 0.35 : 0.2)),
    },
    failed_to_score: { total: Math.round(homeMP * 0.22) },
    penalty: { scored: { total: Math.round(homeMP * 0.04) } },
    xg_for: fixture.home.xgFor,
    xg_against: fixture.home.xgAgainst,
    possession_avg: homeTactical.possession,
    corners_avg: homeTactical.corners,
    shots_on_target_avg: homeTactical.shotsOnTarget,
  };

  const awayStats = {
    fixtures: {
      played: { total: awayMP, away: awayAwayMP },
      wins: { total: Math.min(awayMP, awayWins), away: Math.round(Math.min(awayMP, awayWins) * 0.45) },
      draws: { total: Math.min(awayMP, awayDraws) },
    },
    goals: {
      for: { total: { total: fixture.away.goalsFor, away: Math.round(fixture.away.goalsFor * 0.42) } },
      against: { total: { total: fixture.away.goalsAgainst } },
    },
    form: fixture.away.form.join(""),
    clean_sheet: {
      total: Math.round(awayMP * (fixture.away.goalsAgainst / awayMP < 1.1 ? 0.28 : 0.18)),
    },
    failed_to_score: { total: Math.round(awayMP * 0.24) },
    penalty: { scored: { total: Math.round(awayMP * 0.035) } },
    xg_for: fixture.away.xgFor,
    xg_against: fixture.away.xgAgainst,
    possession_avg: awayTactical.possession,
    corners_avg: awayTactical.corners,
    shots_on_target_avg: awayTactical.shotsOnTarget,
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
        ...recentMatchXgPayload(m, fixture.home.name),
        isHome: m.homeTeam === fixture.home.name,
        isAway: m.awayTeam === fixture.home.name,
        venue: m.homeTeam === fixture.home.name ? "home" : "away",
      })),
    },
    away: {
      ...fixture.away,
      recentMatches: fixture.away.recentMatches?.map((m) => ({
        ...m,
        ...recentMatchXgPayload(m, fixture.away.name),
        isHome: m.homeTeam === fixture.away.name,
        isAway: m.awayTeam === fixture.away.name,
        venue: m.homeTeam === fixture.away.name ? "home" : "away",
      })),
    },
  };
  return { homeStats, awayStats, fixture: fixturePayload };
}
