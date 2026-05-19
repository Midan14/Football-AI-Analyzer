import { prisma } from "@/lib/db";
import { getDataProvider } from "@/backend/lib/providers/provider-factory";
import { cache, cacheKeys } from "@/lib/cache";
import type { Fixture } from "@/shared/domain";

export type WatchlistItemData = {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  country: string;
  date: Date;
  notes?: string;
};

export async function getWatchlist(userId: string) {
  const cached = await cache.get(cacheKeys.userWatchlist(userId));
  if (cached) return cached;

  const watchlist = await prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  await cache.set(cacheKeys.userWatchlist(userId), watchlist, 1800);
  return watchlist;
}

export async function addToWatchlist(userId: string, data: WatchlistItemData) {
  const existing = await prisma.watchlistItem.findUnique({
    where: {
      userId_fixtureId: {
        userId,
        fixtureId: data.fixtureId,
      },
    },
  });

  if (existing) {
    throw new Error("Fixture already in watchlist");
  }

  const item = await prisma.watchlistItem.create({
    data: {
      userId,
      fixtureId: data.fixtureId,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      league: data.league,
      country: data.country,
      date: data.date,
      notes: data.notes,
    },
  });

  await cache.delete(cacheKeys.userWatchlist(userId));
  return item;
}

export async function removeFromWatchlist(userId: string, fixtureId: string) {
  const item = await prisma.watchlistItem.findUnique({
    where: {
      userId_fixtureId: {
        userId,
        fixtureId,
      },
    },
  });

  if (!item) {
    throw new Error("Watchlist item not found");
  }

  await prisma.watchlistItem.delete({
    where: { id: item.id },
  });

  await cache.delete(cacheKeys.userWatchlist(userId));
  return { fixtureId };
}

export async function getWatchlistFixtures(userId: string) {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  const provider = getDataProvider();
  const results: Array<{
    watchlistItem: (typeof items)[number];
    fixture: Fixture;
  }> = [];

  for (const item of items) {
    try {
      const fixture = await provider.getMatch(item.fixtureId);
      results.push({ watchlistItem: item, fixture });
    } catch {
      continue;
    }
  }

  return results;
}
