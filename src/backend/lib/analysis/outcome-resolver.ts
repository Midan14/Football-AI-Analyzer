/**
 * Pure outcome resolver: given a stored Prediction and an actual MatchResult,
 * compute the new status (WON / LOST / VOID) and realized ROI.
 *
 * Design notes:
 *  - Pure function. No prisma, no fetch. Test with plain objects.
 *  - Defaults to VOID when the market is not yet implemented or input is
 *    ambiguous. NEVER auto-credits on uncertainty — losing money to a bug
 *    is much worse than missing a legit win that needs manual review.
 *  - When a Tier 3+ market is requested but its data field is missing on
 *    MatchResult, returns VOID with reason "requires_*" so the caller can
 *    surface it to the user instead of silently mis-classifying.
 *  - Idempotent at the call site: caller checks `status === "OPEN"` before
 *    invoking.
 *
 * Prediction string formats per market — see each resolver function.
 * See docs/engine-roadmap.md (Phase 2).
 */

import type { MatchResult } from "@/shared/domain";

export type Resolution = {
  status: "WON" | "LOST" | "VOID";
  roi: number; // realized ROI in stake units. WON: stake*(odds-1). LOST: -stake. VOID: 0.
  reason: string;
};

export type ResolverInput = {
  market: string; // PredictionMarket enum value
  prediction: string;
  stakeUnits: number;
  odds: number | null;
  result: MatchResult;
};

export function resolvePrediction(input: ResolverInput): Resolution {
  if (input.result.abandoned) {
    return { status: "VOID", reason: "match_abandoned", roi: 0 };
  }

  switch (input.market) {
    // Tier 1
    case "WIN_1X2":             return resolve1X2(input);
    case "DOUBLE_CHANCE":       return resolveDoubleChance(input);
    case "OVER_UNDER":          return resolveOverUnder(input);
    case "BTTS":                return resolveBtts(input);
    case "EXACT_SCORE":         return resolveExactScore(input);
    case "EXACT_TOTAL_GOALS":   return resolveExactTotalGoals(input);
    case "GOALS_ODD_EVEN":      return resolveGoalsOddEven(input);
    case "ASIAN_HANDICAP":      return resolveAsianHandicap(input);
    case "EUROPEAN_HANDICAP":   return resolveEuropeanHandicap(input);
    case "WIN_TO_NIL":          return resolveWinToNil(input);
    case "CLEAN_SHEET":         return resolveCleanSheet(input);
    case "TEAM_TO_SCORE":       return resolveTeamToScore(input);
    // Tier 2
    case "HT_RESULT":           return resolveHtResult(input);
    case "HT_FT":               return resolveHtFt(input);
    case "HT_OVER_UNDER":       return resolveHtOverUnder(input);
    case "HT_BTTS":             return resolveHtBtts(input);
    case "GOAL_BOTH_HALVES":    return resolveGoalBothHalves(input);
    // Tier 3
    case "CORNERS_OVER_UNDER":  return resolveCornersOverUnder(input);
    case "CORNERS_HANDICAP":    return resolveCornersHandicap(input);
    case "CARDS_OVER_UNDER":    return resolveCardsOverUnder(input);
    case "RED_CARD_MATCH":      return resolveRedCardMatch(input);
    case "PENALTY_MATCH":       return resolvePenaltyMatch(input);
    // Tier 4-5
    case "FIRST_GOAL_SCORER":   return resolveFirstGoalScorer(input);
    case "ANYTIME_SCORER":      return resolveAnytimeScorer(input);
    case "HAT_TRICK":           return resolveHatTrick(input);
    case "PLAYER_BOOKED":       return resolvePlayerBooked(input);
    default:
      return { status: "VOID", reason: `market_not_implemented:${input.market}`, roi: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 — derivable from goals only
// ─────────────────────────────────────────────────────────────────────────────

function resolve1X2(input: ResolverInput): Resolution {
  const actual = sideOf(input.result.homeGoals, input.result.awayGoals);
  const won = input.prediction === actual;
  return outcome(won, input, `actual:${actual}`);
}

/** Prediction: "1X" | "X2" | "12" */
function resolveDoubleChance(input: ResolverInput): Resolution {
  const actual = sideOf(input.result.homeGoals, input.result.awayGoals);
  const map: Record<string, Array<"HOME_WIN" | "DRAW" | "AWAY_WIN">> = {
    "1X": ["HOME_WIN", "DRAW"],
    "X2": ["DRAW", "AWAY_WIN"],
    "12": ["HOME_WIN", "AWAY_WIN"],
  };
  const allowed = map[input.prediction];
  if (!allowed) return badFormat(input);
  return outcome(allowed.includes(actual), input, `actual:${actual}`);
}

/** Prediction: "OVER_2.5" | "UNDER_2.5" | etc. Half-line only avoids push complexity. */
function resolveOverUnder(input: ResolverInput): Resolution {
  const m = input.prediction.match(/^(OVER|UNDER)_([\d.]+)$/);
  if (!m) return badFormat(input);
  const side = m[1] as "OVER" | "UNDER";
  const line = Number(m[2]);
  if (!Number.isFinite(line)) return badFormat(input);
  const total = input.result.totalGoals;
  if (total === line) return { status: "VOID", reason: "push_on_line", roi: 0 };
  const won = side === "OVER" ? total > line : total < line;
  return outcome(won, input, `total:${total}`);
}

/** Prediction: "YES" | "NO" */
function resolveBtts(input: ResolverInput): Resolution {
  if (input.prediction !== "YES" && input.prediction !== "NO") return badFormat(input);
  const won = (input.prediction === "YES") === input.result.bttsActual;
  return outcome(won, input, `btts:${input.result.bttsActual}`);
}

/** Prediction: "H-A" e.g. "2-1" */
function resolveExactScore(input: ResolverInput): Resolution {
  const m = input.prediction.match(/^(\d+)-(\d+)$/);
  if (!m) return badFormat(input);
  const ph = Number(m[1]);
  const pa = Number(m[2]);
  const { homeGoals, awayGoals } = input.result;
  return outcome(ph === homeGoals && pa === awayGoals, input, `actual:${homeGoals}-${awayGoals}`);
}

/** Prediction: "0" | "1" | "2" | "3" | "4_PLUS" */
function resolveExactTotalGoals(input: ResolverInput): Resolution {
  const total = input.result.totalGoals;
  if (input.prediction === "4_PLUS") return outcome(total >= 4, input, `total:${total}`);
  const n = Number(input.prediction);
  if (!Number.isInteger(n) || n < 0 || n > 3) return badFormat(input);
  return outcome(total === n, input, `total:${total}`);
}

/** Prediction: "ODD" | "EVEN". By convention 0 goals = EVEN (industry standard). */
function resolveGoalsOddEven(input: ResolverInput): Resolution {
  if (input.prediction !== "ODD" && input.prediction !== "EVEN") return badFormat(input);
  const isEven = input.result.totalGoals % 2 === 0;
  const won = input.prediction === (isEven ? "EVEN" : "ODD");
  return outcome(won, input, `total:${input.result.totalGoals}`);
}

/** Prediction: "HOME_-0.5" | "AWAY_+1.5" etc. Half-line only — no push handling. */
function resolveAsianHandicap(input: ResolverInput): Resolution {
  const m = input.prediction.match(/^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return badFormat(input);
  const side = m[1] as "HOME" | "AWAY";
  const handicap = Number(m[2]);
  if (!Number.isFinite(handicap)) return badFormat(input);
  if (Number.isInteger(handicap) || handicap * 2 !== Math.trunc(handicap * 2)) {
    // Integer or quarter-line — push refunds not supported in this resolver.
    if (Number.isInteger(handicap)) return { status: "VOID", reason: "integer_line_push_unsupported", roi: 0 };
  }
  const adjustedHome = input.result.homeGoals + (side === "HOME" ? handicap : 0);
  const adjustedAway = input.result.awayGoals + (side === "AWAY" ? handicap : 0);
  const won = side === "HOME" ? adjustedHome > adjustedAway : adjustedAway > adjustedHome;
  return outcome(won, input, `adjusted:${adjustedHome.toFixed(1)}-${adjustedAway.toFixed(1)}`);
}

/** Prediction: "HOME_-1" | "AWAY_+1" | "DRAW_-1" — integer handicap, draw allowed (3-way). */
function resolveEuropeanHandicap(input: ResolverInput): Resolution {
  const m = input.prediction.match(/^(HOME|AWAY|DRAW)_([+-]?\d+)$/);
  if (!m) return badFormat(input);
  const pick = m[1] as "HOME" | "AWAY" | "DRAW";
  const handicap = Number(m[2]);
  if (!Number.isInteger(handicap)) return badFormat(input);
  // European handicap is applied to the favorite; convention here: handicap modifies HOME's goals
  // when pick is HOME or DRAW; modifies AWAY's goals when pick is AWAY. Sign chosen by user.
  const adjustedHome = input.result.homeGoals + (pick === "AWAY" ? 0 : handicap);
  const adjustedAway = input.result.awayGoals + (pick === "AWAY" ? handicap : 0);
  const actual = sideOf(adjustedHome, adjustedAway);
  const expected = pick === "HOME" ? "HOME_WIN" : pick === "AWAY" ? "AWAY_WIN" : "DRAW";
  return outcome(actual === expected, input, `adjusted:${adjustedHome}-${adjustedAway}`);
}

/** Prediction: "HOME" | "AWAY" — team wins AND opponent fails to score. */
function resolveWinToNil(input: ResolverInput): Resolution {
  if (input.prediction !== "HOME" && input.prediction !== "AWAY") return badFormat(input);
  const { homeGoals, awayGoals } = input.result;
  const won = input.prediction === "HOME" ? homeGoals > 0 && awayGoals === 0 : awayGoals > 0 && homeGoals === 0;
  return outcome(won, input, `actual:${homeGoals}-${awayGoals}`);
}

/** Prediction: "HOME" | "AWAY" — that team keeps a clean sheet (opponent scores 0). */
function resolveCleanSheet(input: ResolverInput): Resolution {
  if (input.prediction !== "HOME" && input.prediction !== "AWAY") return badFormat(input);
  const won = input.prediction === "HOME" ? input.result.awayGoals === 0 : input.result.homeGoals === 0;
  return outcome(won, input, `actual:${input.result.homeGoals}-${input.result.awayGoals}`);
}

/** Prediction: "HOME" | "AWAY" — that team scores at least one goal. */
function resolveTeamToScore(input: ResolverInput): Resolution {
  if (input.prediction !== "HOME" && input.prediction !== "AWAY") return badFormat(input);
  const won = input.prediction === "HOME" ? input.result.homeGoals > 0 : input.result.awayGoals > 0;
  return outcome(won, input, `actual:${input.result.homeGoals}-${input.result.awayGoals}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 — half-time
// ─────────────────────────────────────────────────────────────────────────────

function resolveHtResult(input: ResolverInput): Resolution {
  const ht = htOrMissing(input);
  if (ht.missing) return ht.missing;
  const actual = sideOf(ht.home, ht.away);
  return outcome(input.prediction === actual, input, `ht_actual:${actual}`);
}

/** Prediction: "HOME_HOME" | "DRAW_HOME" | "AWAY_DRAW" etc. (HT_FT). */
function resolveHtFt(input: ResolverInput): Resolution {
  const ht = htOrMissing(input);
  if (ht.missing) return ht.missing;
  const m = input.prediction.match(/^(HOME|DRAW|AWAY)_(HOME|DRAW|AWAY)$/);
  if (!m) return badFormat(input);
  const pickHt = `${m[1]}_WIN`.replace("DRAW_WIN", "DRAW") as "HOME_WIN" | "DRAW" | "AWAY_WIN";
  const pickFt = `${m[2]}_WIN`.replace("DRAW_WIN", "DRAW") as "HOME_WIN" | "DRAW" | "AWAY_WIN";
  const actualHt = sideOf(ht.home, ht.away);
  const actualFt = sideOf(input.result.homeGoals, input.result.awayGoals);
  return outcome(pickHt === actualHt && pickFt === actualFt, input, `ht:${actualHt}/ft:${actualFt}`);
}

function resolveHtOverUnder(input: ResolverInput): Resolution {
  const ht = htOrMissing(input);
  if (ht.missing) return ht.missing;
  const m = input.prediction.match(/^(OVER|UNDER)_([\d.]+)$/);
  if (!m) return badFormat(input);
  const line = Number(m[2]);
  const total = ht.home + ht.away;
  if (total === line) return { status: "VOID", reason: "push_on_line", roi: 0 };
  const won = m[1] === "OVER" ? total > line : total < line;
  return outcome(won, input, `ht_total:${total}`);
}

function resolveHtBtts(input: ResolverInput): Resolution {
  const ht = htOrMissing(input);
  if (ht.missing) return ht.missing;
  if (input.prediction !== "YES" && input.prediction !== "NO") return badFormat(input);
  const btts = ht.home > 0 && ht.away > 0;
  return outcome((input.prediction === "YES") === btts, input, `ht_btts:${btts}`);
}

/** Prediction: "YES" | "NO" — at least one goal scored in each half (any team). */
function resolveGoalBothHalves(input: ResolverInput): Resolution {
  const ht = htOrMissing(input);
  if (ht.missing) return ht.missing;
  if (input.prediction !== "YES" && input.prediction !== "NO") return badFormat(input);
  const firstHalfGoals = ht.home + ht.away;
  const secondHalfGoals = input.result.totalGoals - firstHalfGoals;
  const both = firstHalfGoals > 0 && secondHalfGoals > 0;
  return outcome((input.prediction === "YES") === both, input, `1h:${firstHalfGoals},2h:${secondHalfGoals}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 3 — match stats (corners, cards, penalty)
// ─────────────────────────────────────────────────────────────────────────────

function resolveCornersOverUnder(input: ResolverInput): Resolution {
  if (!input.result.corners) return missingData("corners");
  const m = input.prediction.match(/^(OVER|UNDER)_([\d.]+)$/);
  if (!m) return badFormat(input);
  const line = Number(m[2]);
  const total = input.result.corners.home + input.result.corners.away;
  if (total === line) return { status: "VOID", reason: "push_on_line", roi: 0 };
  const won = m[1] === "OVER" ? total > line : total < line;
  return outcome(won, input, `corners_total:${total}`);
}

/** Prediction: "HOME_-2.5" — corners handicap (half-line). */
function resolveCornersHandicap(input: ResolverInput): Resolution {
  if (!input.result.corners) return missingData("corners");
  const m = input.prediction.match(/^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return badFormat(input);
  const side = m[1] as "HOME" | "AWAY";
  const h = Number(m[2]);
  if (Number.isInteger(h)) return { status: "VOID", reason: "integer_line_push_unsupported", roi: 0 };
  const adjHome = input.result.corners.home + (side === "HOME" ? h : 0);
  const adjAway = input.result.corners.away + (side === "AWAY" ? h : 0);
  const won = side === "HOME" ? adjHome > adjAway : adjAway > adjHome;
  return outcome(won, input, `adjusted_corners:${adjHome.toFixed(1)}-${adjAway.toFixed(1)}`);
}

function resolveCardsOverUnder(input: ResolverInput): Resolution {
  if (!input.result.cards) return missingData("cards");
  const m = input.prediction.match(/^(OVER|UNDER)_([\d.]+)$/);
  if (!m) return badFormat(input);
  const line = Number(m[2]);
  const c = input.result.cards;
  // Industry convention: total cards = yellows + 2 * reds. Stick to raw count for honesty.
  const total = c.yellowHome + c.yellowAway + c.redHome + c.redAway;
  if (total === line) return { status: "VOID", reason: "push_on_line", roi: 0 };
  const won = m[1] === "OVER" ? total > line : total < line;
  return outcome(won, input, `cards_total:${total}`);
}

function resolveRedCardMatch(input: ResolverInput): Resolution {
  if (!input.result.cards) return missingData("cards");
  if (input.prediction !== "YES" && input.prediction !== "NO") return badFormat(input);
  const reds = input.result.cards.redHome + input.result.cards.redAway > 0;
  return outcome((input.prediction === "YES") === reds, input, `red:${reds}`);
}

function resolvePenaltyMatch(input: ResolverInput): Resolution {
  if (input.result.penaltyAwarded === undefined) return missingData("penalty");
  if (input.prediction !== "YES" && input.prediction !== "NO") return badFormat(input);
  return outcome((input.prediction === "YES") === input.result.penaltyAwarded, input, `pen:${input.result.penaltyAwarded}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 4-5 — player events
// ─────────────────────────────────────────────────────────────────────────────

/** Prediction: player name string. */
function resolveFirstGoalScorer(input: ResolverInput): Resolution {
  if (!input.result.scorers) return missingData("scorers");
  if (input.result.scorers.length === 0) {
    // 0-0: industry standard refunds first-goalscorer bets.
    return { status: "VOID", reason: "no_goals_scored", roi: 0 };
  }
  const first = [...input.result.scorers].sort((a, b) => a.minute - b.minute)[0];
  return outcome(first.player === input.prediction, input, `first:${first.player}`);
}

function resolveAnytimeScorer(input: ResolverInput): Resolution {
  if (!input.result.scorers) return missingData("scorers");
  const scored = input.result.scorers.some((s) => s.player === input.prediction);
  return outcome(scored, input, `scored:${scored}`);
}

function resolveHatTrick(input: ResolverInput): Resolution {
  if (!input.result.scorers) return missingData("scorers");
  const goals = input.result.scorers.filter((s) => s.player === input.prediction).length;
  return outcome(goals >= 3, input, `goals_by_player:${goals}`);
}

function resolvePlayerBooked(input: ResolverInput): Resolution {
  if (!input.result.bookedPlayers) return missingData("booked_players");
  const booked = input.result.bookedPlayers.includes(input.prediction);
  return outcome(booked, input, `booked:${booked}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sideOf(home: number, away: number): "HOME_WIN" | "DRAW" | "AWAY_WIN" {
  if (home > away) return "HOME_WIN";
  if (home < away) return "AWAY_WIN";
  return "DRAW";
}

function htOrMissing(
  input: ResolverInput
): { home: number; away: number; missing?: undefined } | { missing: Resolution; home?: undefined; away?: undefined } {
  const { firstHalfHome, firstHalfAway } = input.result;
  if (firstHalfHome === undefined || firstHalfAway === undefined) {
    return { missing: { status: "VOID", reason: "requires_match_stats:half_time", roi: 0 } };
  }
  return { home: firstHalfHome, away: firstHalfAway };
}

function missingData(field: string): Resolution {
  return { status: "VOID", reason: `requires_match_stats:${field}`, roi: 0 };
}

function badFormat(input: ResolverInput): Resolution {
  return { status: "VOID", reason: `bad_prediction_format:${input.prediction}`, roi: 0 };
}

function outcome(won: boolean, input: ResolverInput, reason: string): Resolution {
  if (!won) return { status: "LOST", reason, roi: -input.stakeUnits };
  if (input.odds === null || input.odds <= 1) {
    return { status: "VOID", reason: "won_but_missing_odds", roi: 0 };
  }
  return { status: "WON", reason, roi: round2(input.stakeUnits * (input.odds - 1)) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
