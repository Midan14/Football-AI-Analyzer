import { z } from "zod";

// Analysis request/response schemas
export const AnalysisRequestSchema = z.object({
  fixtureId: z.string(),
  modelMode: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).optional(),
});

export const AnalysisResponseSchema = z.object({
  id: z.string(),
  fixtureId: z.string(),
  matchDate: z.date(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  league: z.string(),
  country: z.string(),
  
  // Probabilities
  probabilities: z.object({
    homeWin: z.number(),
    draw: z.number(),
    awayWin: z.number(),
    over15: z.number(),
    over25: z.number(),
    under35: z.number(),
    btts: z.number(),
  }),
  
  // Confidence
  confidenceScore: z.number().min(0).max(100),
  riskFlags: z.array(z.object({
    id: z.string(),
    label: z.string(),
    severity: z.enum(["low", "medium", "high"]),
  })),
  
  // Value opportunities
  valueMarkets: z.array(z.object({
    market: z.string(),
    modelProbability: z.number(),
    marketProbability: z.number(),
    edge: z.number(),
    verdict: z.enum(["Valor", "Evitar", "Justo"]),
  })),
  
  // Best bet
  bestBet: z.string().optional(),
  stakeUnits: z.number(),
  
  createdAt: z.date(),
});

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
