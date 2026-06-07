import type { Fixture, MatchEvent, MatchResult } from "@/shared/domain";

export type ApiScorePair = {
  home: number | null;
  away: number | null;
};

export type ApiFootballScorePayload = {
  goals?: ApiScorePair | null;
  score?: {
    halftime?: ApiScorePair | null;
    fulltime?: ApiScorePair | null;
    extratime?: ApiScorePair | null;
    penalty?: ApiScorePair | null;
  } | null;
  fixture?: { status?: { short?: string } };
};

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readPair(pair?: ApiScorePair | null): { homeGoals: number; awayGoals: number } | null {
  if (!pair || pair.home == null || pair.away == null) return null;
  return { homeGoals: safeNum(pair.home, 0), awayGoals: safeNum(pair.away, 0) };
}

function totalGoals(score: { homeGoals: number; awayGoals: number }) {
  return score.homeGoals + score.awayGoals;
}

function isFinishedStatus(statusShort?: string) {
  const code = (statusShort ?? "").toUpperCase();
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(code);
}

function isLiveStatus(statusShort?: string) {
  const code = (statusShort ?? "").toUpperCase();
  return ["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(code);
}

function looksLikeStaleZeroScore(
  candidate: { homeGoals: number; awayGoals: number },
  fulltime: { homeGoals: number; awayGoals: number } | null,
  halftime: { homeGoals: number; awayGoals: number } | null
) {
  if (totalGoals(candidate) > 0) return false;
  if (fulltime && totalGoals(fulltime) > 0) return true;
  if (halftime && totalGoals(halftime) > 0) return true;
  return false;
}

/**
 * Resolve FT goals from API-Football payload.
 * Some responses leave `goals` at 0-0 while `score.fulltime` (or events) has the real result.
 */
export function resolveApiFootballGoals(payload: ApiFootballScorePayload): {
  homeGoals: number;
  awayGoals: number;
} {
  const statusShort = payload.fixture?.status?.short;
  const fromGoals = readPair(payload.goals ?? undefined);
  const fromFulltime = readPair(payload.score?.fulltime ?? undefined);
  const fromExtratime = readPair(payload.score?.extratime ?? undefined);
  const fromHalftime = readPair(payload.score?.halftime ?? undefined);

  if (isFinishedStatus(statusShort)) {
    if (fromGoals && !looksLikeStaleZeroScore(fromGoals, fromFulltime, fromHalftime)) {
      return fromGoals;
    }
    if (fromExtratime && totalGoals(fromExtratime) > 0) return fromExtratime;
    if (fromFulltime) return fromFulltime;
    if (fromGoals) return fromGoals;
  }

  if (isLiveStatus(statusShort)) {
    if (fromGoals) return fromGoals;
    if (fromFulltime) return fromFulltime;
  }

  return fromGoals ?? fromFulltime ?? { homeGoals: 0, awayGoals: 0 };
}

export function resolveGoalsFromEvents(
  events: Array<Pick<MatchEvent, "type" | "detail" | "team">>,
  homeTeamName: string,
  awayTeamName: string
): { homeGoals: number; awayGoals: number } | null {
  let homeGoals = 0;
  let awayGoals = 0;
  let found = false;

  for (const event of events) {
    if (event.type !== "Goal") continue;
    const detail = (event.detail ?? "").toLowerCase();
    if (detail.includes("missed") || detail.includes("cancel") || detail.includes("disallow")) continue;

    found = true;
    if (event.team === homeTeamName) homeGoals += 1;
    else if (event.team === awayTeamName) awayGoals += 1;
  }

  return found ? { homeGoals, awayGoals } : null;
}

export function buildMatchResult(
  goals: { homeGoals: number; awayGoals: number },
  halftime?: { homeGoals: number; awayGoals: number } | null,
  extras?: Partial<Pick<MatchResult, "corners" | "cards" | "scorers" | "bookedPlayers" | "penaltyAwarded">>
): MatchResult {
  return {
    homeGoals: goals.homeGoals,
    awayGoals: goals.awayGoals,
    totalGoals: goals.homeGoals + goals.awayGoals,
    bttsActual: goals.homeGoals > 0 && goals.awayGoals > 0,
    firstHalfHome: halftime?.homeGoals,
    firstHalfAway: halftime?.awayGoals,
    ...extras,
  };
}

/** HT > FT or 0-0 final with HT goals — indicates stale API goals field. */
export function isSuspiciousMatchResult(fixture: Pick<Fixture, "status" | "result">): boolean {
  if (!fixture.result) return false;
  if (fixture.status !== "final" && fixture.status !== "live") return false;
  const ftTotal = totalGoals(fixture.result);
  const htTotal = safeNum(fixture.result.firstHalfHome, 0) + safeNum(fixture.result.firstHalfAway, 0);
  return htTotal > ftTotal || (fixture.status === "final" && ftTotal === 0 && htTotal > 0);
}

/** Overlay fresh status/result from a newly fetched fixture (keeps enriched market/team data). */
export function mergeFixtureResult(base: Fixture, fresh: Fixture): Fixture {
  if (!fresh.result) return base;
  return {
    ...base,
    status: fresh.status,
    elapsed: fresh.elapsed,
    result: fresh.result,
  };
}

export function normalizeFixtureScore(fixture: Fixture, events?: MatchEvent[]): Fixture {
  if (!events?.length) return fixture;
  return reconcileFixtureResult(fixture, events);
}

export async function ensureAccurateFixtureScore(
  fixture: Fixture,
  fetchEvents?: () => Promise<MatchEvent[] | undefined>
): Promise<Fixture> {
  if (!isSuspiciousMatchResult(fixture)) return fixture;
  const events = await fetchEvents?.();
  if (!events?.length) return fixture;
  return reconcileFixtureResult(fixture, events);
}

/** Prefer event-derived goals when API FT score is missing or inconsistent with HT/events. */
export function reconcileFixtureResult(
  fixture: Fixture,
  events?: MatchEvent[]
): Fixture {
  if (!fixture.result || (fixture.status !== "final" && fixture.status !== "live")) {
    return fixture;
  }

  const current = fixture.result;
  const fromEvents = events?.length
    ? resolveGoalsFromEvents(events, fixture.home.name, fixture.away.name)
    : null;

  if (!fromEvents) return fixture;

  const currentTotal = totalGoals(current);
  const eventsTotal = totalGoals(fromEvents);
  const htTotal = safeNum(current.firstHalfHome, 0) + safeNum(current.firstHalfAway, 0);
  const suspiciousZero = currentTotal === 0 && (eventsTotal > 0 || htTotal > 0);
  const htBeatsFt = fixture.status === "final" && htTotal > currentTotal;

  if (!suspiciousZero && !htBeatsFt && eventsTotal <= currentTotal) {
    return fixture;
  }

  return {
    ...fixture,
    result: buildMatchResult(fromEvents, {
      homeGoals: current.firstHalfHome ?? 0,
      awayGoals: current.firstHalfAway ?? 0,
    }),
  };
}
