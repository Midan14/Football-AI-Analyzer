import { prisma } from "@/lib/db";
import { computeClvPercent, type ClvSummary } from "@/shared/odds-intelligence";
import {
  getClosingOddsForMarket,
  markClosingSnapshots,
} from "@/backend/lib/odds/odds-snapshot-service";

const PREDICTION_TO_MARKET_LABEL: Record<string, string> = {
  HOME_WIN: "Local gana",
  DRAW: "Empate",
  AWAY_WIN: "Visitante gana",
  "1X": "Doble Chance 1X",
  X2: "Doble Chance X2",
  "12": "Doble Chance 12",
  "OVER_1.5": "Over 1.5",
  "OVER_2.5": "Over 2.5",
  "OVER_3.5": "Over 3.5",
  "UNDER_1.5": "Under 1.5",
  "UNDER_2.5": "Under 2.5",
  "UNDER_3.5": "Under 3.5",
  YES: "BTTS Sí",
  NO: "BTTS No",
  "HOME_-1": "AH Local -1",
  "AWAY_+1": "AH Visitante +1",
};

export function marketLabelFromPrediction(prediction: string): string | null {
  return PREDICTION_TO_MARKET_LABEL[prediction] ?? null;
}

export async function enrichPredictionWithClosingLine(pred: {
  id: string;
  fixtureId: string;
  prediction: string;
  odds: number | null;
  bookmaker: string | null;
}): Promise<{ closingOdds: number | null; clvPercent: number | null; bookmaker: string | null }> {
  await markClosingSnapshots(pred.fixtureId);

  const label = marketLabelFromPrediction(pred.prediction);
  if (!label || !pred.odds || pred.odds <= 1) {
    return { closingOdds: null, clvPercent: null, bookmaker: pred.bookmaker };
  }

  const closing = await getClosingOddsForMarket(pred.fixtureId, label, pred.bookmaker);
  if (!closing) {
    return { closingOdds: null, clvPercent: null, bookmaker: pred.bookmaker };
  }

  return {
    closingOdds: closing.odds,
    clvPercent: computeClvPercent(pred.odds, closing.odds),
    bookmaker: pred.bookmaker ?? closing.bookmaker,
  };
}

export async function getUserClvSummary(userId: string): Promise<ClvSummary> {
  const rows = await prisma.prediction.findMany({
    where: {
      userId,
      clvPercent: { not: null },
      closingOdds: { not: null },
      odds: { not: null },
    },
    select: {
      clvPercent: true,
      odds: true,
      closingOdds: true,
      leagueId: true,
    },
    take: 2000,
  });

  if (rows.length === 0) {
    return {
      sampleSize: 0,
      avgClvPercent: 0,
      positiveClvRate: 0,
      avgTakenOdds: 0,
      avgClosingOdds: 0,
      byLeague: [],
    };
  }

  const avgClvPercent =
    Math.round((rows.reduce((sum, row) => sum + (row.clvPercent ?? 0), 0) / rows.length) * 10) / 10;
  const positiveClvRate =
    Math.round((rows.filter((row) => (row.clvPercent ?? 0) > 0).length / rows.length) * 1000) / 10;
  const avgTakenOdds =
    Math.round((rows.reduce((sum, row) => sum + (row.odds ?? 0), 0) / rows.length) * 100) / 100;
  const avgClosingOdds =
    Math.round((rows.reduce((sum, row) => sum + (row.closingOdds ?? 0), 0) / rows.length) * 100) / 100;

  const leagueMap = new Map<string, { sampleSize: number; totalClv: number }>();
  for (const row of rows) {
    const key = row.leagueId ?? "unknown";
    const bucket = leagueMap.get(key) ?? { sampleSize: 0, totalClv: 0 };
    bucket.sampleSize += 1;
    bucket.totalClv += row.clvPercent ?? 0;
    leagueMap.set(key, bucket);
  }

  const byLeague = [...leagueMap.entries()]
    .map(([leagueId, bucket]) => ({
      leagueId,
      sampleSize: bucket.sampleSize,
      avgClvPercent: Math.round((bucket.totalClv / bucket.sampleSize) * 10) / 10,
    }))
    .sort((a, b) => b.sampleSize - a.sampleSize)
    .slice(0, 12);

  return {
    sampleSize: rows.length,
    avgClvPercent,
    positiveClvRate,
    avgTakenOdds,
    avgClosingOdds,
    byLeague,
  };
}
