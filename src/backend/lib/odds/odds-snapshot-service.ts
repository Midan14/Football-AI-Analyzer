import { prisma } from "@/lib/db";
import type { FixtureMarket } from "@/shared/domain";
import { marketKeyFromRecommendationLabel, marketLabelFromKey } from "@/shared/odds-intelligence";
import {
  flattenBookmakerMarkets,
  type SnapshotPoint,
} from "@/backend/lib/odds/odds-intelligence";
import { getFixtureBookmakerOdds } from "@/backend/lib/odds/bookmaker-odds-service";

export async function captureFixtureOddsSnapshots(
  fixtureId: string,
  source = "provider"
): Promise<number> {
  const bookmakers = await getFixtureBookmakerOdds(fixtureId);
  if (Object.keys(bookmakers).length === 0) return 0;

  const rows = flattenBookmakerMarkets(fixtureId, bookmakers, source);
  if (rows.length === 0) return 0;

  await prisma.oddsSnapshot.createMany({ data: rows });
  return rows.length;
}

export async function getRecentSnapshots(
  fixtureId: string,
  limit = 200
): Promise<SnapshotPoint[]> {
  const rows = await prisma.oddsSnapshot.findMany({
    where: { fixtureId },
    orderBy: { capturedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    fixtureId: row.fixtureId,
    bookmaker: row.bookmaker,
    marketKey: row.marketKey,
    label: row.selection || marketLabelFromKey(row.marketKey),
    odds: row.odds,
    impliedProb: row.impliedProb ?? 0,
    capturedAt: row.capturedAt,
  }));
}

export async function getClosingOddsForMarket(
  fixtureId: string,
  marketLabel: string,
  bookmaker?: string | null
): Promise<{ odds: number; bookmaker: string } | null> {
  const marketKey = marketKeyFromRecommendationLabel(marketLabel);
  if (!marketKey) return null;

  const where = bookmaker
    ? { fixtureId, marketKey, bookmaker }
    : { fixtureId, marketKey };

  const row = await prisma.oddsSnapshot.findFirst({
    where,
    orderBy: { capturedAt: "desc" },
  });

  if (!row || row.odds <= 1) return null;
  return { odds: row.odds, bookmaker: row.bookmaker };
}

export async function markClosingSnapshots(fixtureId: string): Promise<number> {
  const latest = await prisma.oddsSnapshot.findMany({
    where: { fixtureId, source: { not: "closing" } },
    orderBy: { capturedAt: "desc" },
    take: 500,
  });

  if (latest.length === 0) return 0;

  const seen = new Set<string>();
  const closingRows = [];
  for (const row of latest) {
    const key = `${row.bookmaker}|${row.marketKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    closingRows.push({
      fixtureId: row.fixtureId,
      bookmaker: row.bookmaker,
      marketKey: row.marketKey,
      selection: row.selection,
      odds: row.odds,
      impliedProb: row.impliedProb,
      source: "closing",
    });
  }

  if (closingRows.length === 0) return 0;
  await prisma.oddsSnapshot.createMany({ data: closingRows });
  return closingRows.length;
}

export async function getLineMovementForFixture(
  fixtureId: string,
  thresholdPercent = 5
) {
  const snapshots = await getRecentSnapshots(fixtureId, 400);
  const { detectLineMovements } = await import("@/backend/lib/odds/odds-intelligence");
  return detectLineMovements(snapshots, thresholdPercent);
}

export type BookmakersMap = Record<string, FixtureMarket>;
