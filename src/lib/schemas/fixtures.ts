import { z } from "zod";

// Fixture and match schemas
export const FixtureSchema = z.object({
  id: z.string(),
  fixtureId: z.string().or(z.number()),
  homeTeam: z.string(),
  awayTeam: z.string(),
  league: z.string(),
  country: z.string(),
  date: z.string().or(z.date()).transform(d => new Date(d)),
  status: z.enum(["scheduled", "live", "finished", "cancelled"]).optional(),
  homeGoals: z.number().optional(),
  awayGoals: z.number().optional(),
});

export const TeamStatsSchema = z.object({
  goalsFor: z.number().min(0),
  goalsAgainst: z.number().min(0),
  xgFor: z.number().min(0).optional(),
  xgAgainst: z.number().min(0).optional(),
  form: z.array(z.enum(["W", "D", "L"])).optional(),
  travelKm: z.number().min(0).optional(),
});

export const MarketOddsSchema = z.object({
  homeWinOdds: z.number().min(1),
  drawOdds: z.number().min(1),
  awayWinOdds: z.number().min(1),
  over15Odds: z.number().min(1).optional(),
  over25Odds: z.number().min(1).optional(),
  under35Odds: z.number().min(1).optional(),
  bttsYesOdds: z.number().min(1).optional(),
});

export type Fixture = z.infer<typeof FixtureSchema>;
export type TeamStats = z.infer<typeof TeamStatsSchema>;
export type MarketOdds = z.infer<typeof MarketOddsSchema>;
