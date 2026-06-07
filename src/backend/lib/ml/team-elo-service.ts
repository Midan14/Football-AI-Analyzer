/**
 * Dynamic Elo ratings persisted per team/league/season.
 */

import { prisma } from "@/lib/db";
import type { Fixture } from "@/shared/domain";

const BASE_ELO = 1500;
const HOME_ADVANTAGE = 65;
const K_FACTOR = 24;

function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

function actualScore(result: "HOME_WIN" | "DRAW" | "AWAY_WIN", side: "home" | "away"): number {
  if (result === "DRAW") return 0.5;
  if (side === "home") return result === "HOME_WIN" ? 1 : 0;
  return result === "AWAY_WIN" ? 1 : 0;
}

export async function getTeamElo(
  teamId: string,
  leagueId: string,
  season: string
): Promise<number> {
  const row = await prisma.teamEloRating.findUnique({
    where: { teamId_leagueId_season: { teamId, leagueId, season } },
  });
  return row?.elo ?? BASE_ELO;
}

export async function getFixtureElo(fixture: Fixture, season = "current"): Promise<{
  home: number;
  away: number;
  delta: number;
}> {
  const home = await getTeamElo(fixture.home.id, fixture.leagueId, season);
  const away = await getTeamElo(fixture.away.id, fixture.leagueId, season);
  return { home: home + HOME_ADVANTAGE, away, delta: home + HOME_ADVANTAGE - away };
}

/** Seed Elo from snapshot when no history exists. */
export async function ensureTeamEloFromSnapshot(fixture: Fixture, season = "current"): Promise<{
  home: number;
  away: number;
  delta: number;
}> {
  const mpH = Math.max(1, fixture.home.matchesPlayed || 18);
  const mpA = Math.max(1, fixture.away.matchesPlayed || 18);
  const ppgH = fixture.home.pointsTotal / mpH;
  const ppgA = fixture.away.pointsTotal / mpA;

  const estimate = (ppg: number, xgDiff: number) =>
    BASE_ELO + (ppg - 1.5) * 120 + xgDiff * 25;

  const homeEst = estimate(ppgH, fixture.home.xgFor - fixture.home.xgAgainst);
  const awayEst = estimate(ppgA, fixture.away.xgFor - fixture.away.xgAgainst);

  await upsertElo(fixture.home.id, fixture.leagueId, season, homeEst);
  await upsertElo(fixture.away.id, fixture.leagueId, season, awayEst);

  return { home: homeEst + HOME_ADVANTAGE, away: awayEst, delta: homeEst + HOME_ADVANTAGE - awayEst };
}

async function upsertElo(teamId: string, leagueId: string, season: string, elo: number) {
  await prisma.teamEloRating.upsert({
    where: { teamId_leagueId_season: { teamId, leagueId, season } },
    create: { teamId, leagueId, season, elo: Math.round(elo) },
    update: { elo: Math.round(elo) },
  });
}

/** Update Elo after a finished match (called from training data ingestion). */
export async function updateEloAfterMatch(params: {
  homeTeamId: string;
  awayTeamId: string;
  leagueId: string;
  season: string;
  result: "HOME_WIN" | "DRAW" | "AWAY_WIN";
  homeEloOverride?: number;
  awayEloOverride?: number;
}): Promise<void> {
  const homeElo = params.homeEloOverride ?? (await getTeamElo(params.homeTeamId, params.leagueId, params.season));
  const awayElo = params.awayEloOverride ?? (await getTeamElo(params.awayTeamId, params.leagueId, params.season));

  const expHome = expectedScore(homeElo, awayElo);
  const expAway = expectedScore(awayElo, homeElo);
  const actHome = actualScore(params.result, "home");
  const actAway = actualScore(params.result, "away");

  const newHome = homeElo + K_FACTOR * (actHome - expHome);
  const newAway = awayElo + K_FACTOR * (actAway - expAway);

  await upsertElo(params.homeTeamId, params.leagueId, params.season, newHome);
  await upsertElo(params.awayTeamId, params.leagueId, params.season, newAway);
}
