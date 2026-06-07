import type { TeamRecentMatch, TeamSnapshot } from "@/shared/domain";

export type ParsedFixtureTeamStats = {
  expectedGoals?: number;
  possessionPct?: number;
  corners?: number;
  shotsOnTarget?: number;
};

export type FixtureStatisticsSide = {
  teamId: number;
  stats: ParsedFixtureTeamStats;
};

function parseStatValue(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = String(raw).trim().replace("%", "").replace(",", ".");
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeStatType(type: string): string {
  return type.trim().toLowerCase();
}

export function parseTeamStatisticsBlock(
  statistics: Array<{ type?: string; value?: string | number | null }> | undefined
): ParsedFixtureTeamStats {
  const out: ParsedFixtureTeamStats = {};
  for (const row of statistics ?? []) {
    const type = normalizeStatType(row.type ?? "");
    const value = parseStatValue(row.value);
    if (value === undefined) continue;

    if (type === "expected goals" || type === "expected_goals") {
      out.expectedGoals = value;
    } else if (type === "ball possession") {
      out.possessionPct = value;
    } else if (type === "corner kicks" || type === "corners") {
      out.corners = value;
    } else if (
      type === "shots on goal" ||
      type === "shots on target" ||
      type === "on target"
    ) {
      out.shotsOnTarget = value;
    }
  }
  return out;
}

export function parseFixtureStatisticsResponse(
  rows: Array<{
    team?: { id?: number };
    statistics?: Array<{ type?: string; value?: string | number | null }>;
  }>
): FixtureStatisticsSide[] {
  return (rows ?? [])
    .filter((row) => row.team?.id != null)
    .map((row) => ({
      teamId: row.team!.id!,
      stats: parseTeamStatisticsBlock(row.statistics),
    }));
}

function avg(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function enrichRecentMatchWithTeamStats(
  match: TeamRecentMatch,
  teamId: number,
  sides: FixtureStatisticsSide[]
): TeamRecentMatch {
  const homeSide = sides.find((s) => s.teamId === Number(match.homeTeamId));
  const awaySide = sides.find((s) => s.teamId === Number(match.awayTeamId));
  const isHome = String(teamId) === String(match.homeTeamId);
  const teamSide = isHome ? homeSide : awaySide;
  const oppSide = isHome ? awaySide : homeSide;

  if (!teamSide && !oppSide) {
    return match;
  }

  return {
    ...match,
    homeXg: homeSide?.stats.expectedGoals,
    awayXg: awaySide?.stats.expectedGoals,
    teamPossession: teamSide?.stats.possessionPct,
    teamCorners: teamSide?.stats.corners,
    teamShotsOnTarget: teamSide?.stats.shotsOnTarget,
    statsSource: teamSide || oppSide ? "api-football" : match.statsSource,
  };
}

export function applyRollingMetricsToTeam(
  team: TeamSnapshot,
  teamId: number,
  recent: TeamRecentMatch[]
): TeamSnapshot {
  const withStats = recent.filter((m) => m.statsSource === "api-football");
  if (withStats.length === 0) return team;

  const possession = avg(
    withStats.map((m) => m.teamPossession).filter((v): v is number => v != null)
  );
  const corners = avg(withStats.map((m) => m.teamCorners).filter((v): v is number => v != null));
  const shots = avg(
    withStats.map((m) => m.teamShotsOnTarget).filter((v): v is number => v != null)
  );

  let xgFor = team.xgFor;
  let xgAgainst = team.xgAgainst;
  const xgForSamples: number[] = [];
  const xgAgainstSamples: number[] = [];

  for (const m of withStats) {
    const isHome = String(teamId) === String(m.homeTeamId);
    const teamXg = isHome ? m.homeXg : m.awayXg;
    const oppXg = isHome ? m.awayXg : m.homeXg;
    if (teamXg != null) xgForSamples.push(teamXg);
    if (oppXg != null) xgAgainstSamples.push(oppXg);
  }

  const xgForRate = avg(xgForSamples);
  const xgAgainstRate = avg(xgAgainstSamples);
  const mp = Math.max(1, team.matchesPlayed || withStats.length);
  if (xgForRate != null) xgFor = Math.round(xgForRate * mp * 10) / 10;
  if (xgAgainstRate != null) xgAgainst = Math.round(xgAgainstRate * mp * 10) / 10;

  return {
    ...team,
    xgFor,
    xgAgainst,
    possessionAvg: possession != null ? Math.round(possession * 10) / 10 : team.possessionAvg,
    cornersAvg: corners != null ? Math.round(corners * 10) / 10 : team.cornersAvg,
    shotsOnTargetAvg: shots != null ? Math.round(shots * 10) / 10 : team.shotsOnTargetAvg,
    tacticalStatsSource: "api-football",
    xgSource: xgForRate != null || xgAgainstRate != null ? "api-football" : team.xgSource,
  };
}

export function recentMatchesHaveRealXg(recent: TeamRecentMatch[] | undefined): boolean {
  return (recent ?? []).some((m) => m.homeXg != null && m.awayXg != null);
}

export function teamHasRealTacticalStats(team: TeamSnapshot): boolean {
  return team.tacticalStatsSource === "api-football";
}
