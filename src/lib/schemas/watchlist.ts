import { z } from "zod";

export const AddToWatchlistSchema = z.object({
  fixtureId: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  league: z.string(),
  country: z.string(),
  date: z.union([z.date(), z.string()]).transform((d) => (d instanceof Date ? d : new Date(d))),
  notes: z.string().optional(),
});

export const RemoveFromWatchlistSchema = z.object({
  fixtureId: z.string(),
});

export type AddToWatchlistInput = z.infer<typeof AddToWatchlistSchema>;
export type RemoveFromWatchlistInput = z.infer<typeof RemoveFromWatchlistSchema>;
