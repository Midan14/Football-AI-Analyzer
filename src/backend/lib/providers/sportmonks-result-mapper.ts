/**
 * Pure helpers for mapping Sportmonks status + scores + events + statistics
 * into our domain. Extracted so the mapping logic can be unit-tested without
 * touching the network. See docs/engine-roadmap.md (Phase 2).
 *
 * Reference shapes (Sportmonks v3, simplified):
 *   - state.developer_name          : "FT" | "AET" | "NS" | ...
 *   - scores[].description          : "1ST_HALF" | "2ND_HALF" | "CURRENT" | ...
 *   - scores[].score.{goals,participant}
 *   - events[].type_id              : 14=GOAL, 16=PEN_GOAL, 19=YELLOW, 20=RED, ...
 *   - events[].player_name, .participant_id, .minute
 *   - statistics[].type.{name|developer_name}, .data.value, .participant_id
 */

import type { Fixture, MatchResult } from "@/shared/domain";

export type SportmonksScore = {
  description: string;
  score: { goals: number; participant: "home" | "away" };
};

export type SportmonksEvent = {
  type_id?: number;
  type?: { developer_name?: string };
  player_name?: string;
  related_player_name?: string;
  participant_id?: number | string;
  minute?: number;
  result?: string;
};

export type SportmonksStatistic = {
  type?: { developer_name?: string; name?: string };
  data?: { value?: number };
  participant_id?: number | string;
  location?: "home" | "away";
};

export type SportmonksParticipantsLookup = {
  homeId: number | string;
  awayId: number | string;
};

const FINAL_STATES = new Set(["FT", "AET", "FT_PEN", "PEN_LIVE", "AWARDED"]);
const ABANDONED_STATES = new Set(["CANCELLED", "POSTPONED", "ABANDONED", "DELETED"]);

// Sportmonks event type_id constants (from the public docs).
const EVENT_GOAL = 14;
const EVENT_OWN_GOAL = 15;
const EVENT_PEN_GOAL = 16;
const EVENT_YELLOW = 19;
const EVENT_RED = 20;
const EVENT_YELLOW_RED = 21;
const EVENT_PENALTY = 22; // penalty awarded (not necessarily scored)

const GOAL_EVENT_NAMES = new Set(["goal", "penalty", "own-goal"]);
const YELLOW_EVENT_NAMES = new Set(["yellowcard", "yellow-card"]);
const RED_EVENT_NAMES = new Set(["redcard", "red-card", "yellowred-card", "yellowredcard"]);
const PENALTY_EVENT_NAMES = new Set(["penalty", "missed-penalty", "penaltyshootout"]);

export function mapFixtureStatus(devName: string | undefined | null): Fixture["status"] {
  if (!devName) return "pre-match";
  if (devName === "NS" || devName === "TBA") return "pre-match";
  if (FINAL_STATES.has(devName) || ABANDONED_STATES.has(devName)) return "final";
  return "live";
}

/**
 * Build MatchResult from raw Sportmonks data. Returns null when the fixture
 * isn't final or the score data is missing/unusable.
 *
 * The optional `extras` argument enriches the result with HT score, corners,
 * cards, scorers and booked players. Callers without these payloads still
 * get a valid (basic) MatchResult — every extra is filled best-effort.
 */
export function mapMatchResult(
  devName: string | undefined | null,
  scores: SportmonksScore[] | undefined | null,
  extras?: {
    events?: SportmonksEvent[] | null;
    statistics?: SportmonksStatistic[] | null;
    participants?: SportmonksParticipantsLookup | null;
  }
): MatchResult | null {
  if (!devName) return null;

  if (ABANDONED_STATES.has(devName)) {
    return { homeGoals: 0, awayGoals: 0, totalGoals: 0, bttsActual: false, abandoned: true };
  }
  if (!FINAL_STATES.has(devName)) return null;
  if (!scores || scores.length === 0) return null;

  // Prefer CURRENT (most reliable for the actual final tally per Sportmonks docs).
  const current = scores.filter((s) => s.description === "CURRENT");
  const source = current.length >= 2 ? current : scores;

  const homeEntry = source.find((s) => s.score?.participant === "home");
  const awayEntry = source.find((s) => s.score?.participant === "away");
  if (!homeEntry || !awayEntry) return null;

  const homeGoals = Number(homeEntry.score.goals);
  const awayGoals = Number(awayEntry.score.goals);
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return null;

  const base: MatchResult = {
    homeGoals,
    awayGoals,
    totalGoals: homeGoals + awayGoals,
    bttsActual: homeGoals > 0 && awayGoals > 0,
  };

  // ── Half-time score from scores[] ───────────────────────────────────────
  const ht = mapHalfTimeScore(scores);
  if (ht) {
    base.firstHalfHome = ht.home;
    base.firstHalfAway = ht.away;
  }

  if (!extras) return base;

  // ── Match stats (corners) and events (cards, penalties, scorers) ────────
  if (extras.statistics && extras.participants) {
    const corners = mapCornersFromStats(extras.statistics, extras.participants);
    if (corners) base.corners = corners;
  }
  if (extras.events && extras.participants) {
    const cards = mapCardsFromEvents(extras.events, extras.participants);
    if (cards) base.cards = cards;
    base.penaltyAwarded = mapPenaltyAwarded(extras.events);
    const scorers = mapScorersFromEvents(extras.events, extras.participants);
    if (scorers.length > 0) base.scorers = scorers;
    const booked = mapBookedPlayersFromEvents(extras.events);
    if (booked.length > 0) base.bookedPlayers = booked;
  }

  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field-level mappers (exported for testability)
// ─────────────────────────────────────────────────────────────────────────────

export function mapHalfTimeScore(
  scores: SportmonksScore[] | undefined | null
): { home: number; away: number } | null {
  if (!scores) return null;
  const ht = scores.filter((s) => s.description === "1ST_HALF");
  const home = ht.find((s) => s.score?.participant === "home");
  const away = ht.find((s) => s.score?.participant === "away");
  if (!home || !away) return null;
  const h = Number(home.score.goals);
  const a = Number(away.score.goals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { home: h, away: a };
}

export function mapCornersFromStats(
  stats: SportmonksStatistic[],
  participants: SportmonksParticipantsLookup
): { home: number; away: number } | null {
  const cornerStat = stats.filter((s) => {
    const name = (s.type?.developer_name ?? s.type?.name ?? "").toLowerCase();
    return name.includes("corner");
  });
  if (cornerStat.length === 0) return null;
  const homeRow = cornerStat.find((s) => sameId(s.participant_id, participants.homeId) || s.location === "home");
  const awayRow = cornerStat.find((s) => sameId(s.participant_id, participants.awayId) || s.location === "away");
  const home = Number(homeRow?.data?.value ?? NaN);
  const away = Number(awayRow?.data?.value ?? NaN);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

export function mapCardsFromEvents(
  events: SportmonksEvent[],
  participants: SportmonksParticipantsLookup
): { yellowHome: number; yellowAway: number; redHome: number; redAway: number } | null {
  let yellowHome = 0;
  let yellowAway = 0;
  let redHome = 0;
  let redAway = 0;
  let touched = false;

  for (const ev of events) {
    const kind = classifyCard(ev);
    if (!kind) continue;
    touched = true;
    const isHome = sameId(ev.participant_id, participants.homeId);
    if (kind === "yellow") {
      if (isHome) yellowHome += 1;
      else yellowAway += 1;
    } else {
      if (isHome) redHome += 1;
      else redAway += 1;
    }
  }

  if (!touched) return null;
  return { yellowHome, yellowAway, redHome, redAway };
}

export function mapPenaltyAwarded(events: SportmonksEvent[]): boolean {
  return events.some((ev) => {
    if (ev.type_id === EVENT_PENALTY || ev.type_id === EVENT_PEN_GOAL) return true;
    const name = (ev.type?.developer_name ?? "").toLowerCase();
    return PENALTY_EVENT_NAMES.has(name);
  });
}

export function mapScorersFromEvents(
  events: SportmonksEvent[],
  participants: SportmonksParticipantsLookup
): Array<{ player: string; team: "home" | "away"; minute: number }> {
  const out: Array<{ player: string; team: "home" | "away"; minute: number }> = [];
  for (const ev of events) {
    if (!isGoalEvent(ev)) continue;
    const player = ev.player_name?.trim();
    if (!player) continue;
    const team: "home" | "away" = sameId(ev.participant_id, participants.homeId) ? "home" : "away";
    const minute = Number(ev.minute ?? 0);
    out.push({ player, team, minute: Number.isFinite(minute) ? minute : 0 });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

export function mapBookedPlayersFromEvents(events: SportmonksEvent[]): string[] {
  const set = new Set<string>();
  for (const ev of events) {
    if (!classifyCard(ev)) continue;
    const player = ev.player_name?.trim();
    if (player) set.add(player);
  }
  return [...set];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function sameId(a: number | string | undefined, b: number | string): boolean {
  if (a === undefined || a === null) return false;
  return String(a) === String(b);
}

function classifyCard(ev: SportmonksEvent): "yellow" | "red" | null {
  if (ev.type_id === EVENT_YELLOW) return "yellow";
  if (ev.type_id === EVENT_RED || ev.type_id === EVENT_YELLOW_RED) return "red";
  const name = (ev.type?.developer_name ?? "").toLowerCase();
  if (YELLOW_EVENT_NAMES.has(name)) return "yellow";
  if (RED_EVENT_NAMES.has(name)) return "red";
  return null;
}

function isGoalEvent(ev: SportmonksEvent): boolean {
  if (ev.type_id === EVENT_GOAL || ev.type_id === EVENT_PEN_GOAL || ev.type_id === EVENT_OWN_GOAL) return true;
  const name = (ev.type?.developer_name ?? "").toLowerCase();
  return GOAL_EVENT_NAMES.has(name);
}
