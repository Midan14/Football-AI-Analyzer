import { z } from "zod";

/**
 * All markets that the BD models. Mirrors `PredictionMarket` in schema.prisma.
 * Resolver coverage:
 *   - Tier 1+2 (goals + HT): fully closed loop today.
 *   - Tier 3 (match stats):  resolves only when MatchResult.corners/cards present.
 *   - Tier 4-5 (players):    resolves only when MatchResult.scorers/bookedPlayers present.
 * Markets without their required data field are marked VOID with a clear reason.
 */
export const PREDICTION_MARKETS = [
  "WIN_1X2",
  "DOUBLE_CHANCE",
  "OVER_UNDER",
  "BTTS",
  "EXACT_SCORE",
  "EXACT_TOTAL_GOALS",
  "GOALS_ODD_EVEN",
  "ASIAN_HANDICAP",
  "EUROPEAN_HANDICAP",
  "WIN_TO_NIL",
  "CLEAN_SHEET",
  "TEAM_TO_SCORE",
  "HT_RESULT",
  "HT_FT",
  "HT_OVER_UNDER",
  "HT_BTTS",
  "GOAL_BOTH_HALVES",
  "CORNERS_OVER_UNDER",
  "CORNERS_HANDICAP",
  "CARDS_OVER_UNDER",
  "RED_CARD_MATCH",
  "PENALTY_MATCH",
  "FIRST_GOAL_SCORER",
  "ANYTIME_SCORER",
  "HAT_TRICK",
  "PLAYER_BOOKED",
] as const;

// Prediction schemas
export const CreatePredictionSchema = z.object({
  fixtureId: z.string(),
  leagueId: z.string().optional(),
  market: z.enum(PREDICTION_MARKETS),
  prediction: z.string(),
  probability: z.number().min(0).max(100),
  odds: z.number().min(1).optional(),
  stakeUnits: z.number().min(0.1),
  notes: z.string().optional(),
});

export const UpdatePredictionSchema = CreatePredictionSchema.partial();

export type CreatePredictionInput = z.infer<typeof CreatePredictionSchema>;
export type UpdatePredictionInput = z.infer<typeof UpdatePredictionSchema>;
