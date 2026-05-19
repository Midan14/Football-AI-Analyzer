import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { AddToWatchlistSchema, RemoveFromWatchlistSchema } from "@/lib/schemas/watchlist";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { auth } from "@/auth";

/**
 * GET /api/user/watchlist
 * Get user's watchlist
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  // Try cache first
  const cached = await cache.get(cacheKeys.userWatchlist(session.user.id));
  if (cached) {
    return successResponse(cached);
  }

  const watchlist = await prisma.watchlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "asc" },
  });

  // Cache for 30 minutes
  await cache.set(cacheKeys.userWatchlist(session.user.id), watchlist, 1800);

  return successResponse(watchlist);
});

/**
 * POST /api/user/watchlist
 * Add fixture to watchlist
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const body = await request.json();
  const validation = AddToWatchlistSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(
      Errors.VALIDATION_ERROR(validation.error.flatten()),
      400
    );
  }

  const { fixtureId, homeTeam, awayTeam, league, country, date, notes } = validation.data;

  // Check if already in watchlist
  const existing = await prisma.watchlistItem.findUnique({
    where: {
      userId_fixtureId: {
        userId: session.user.id,
        fixtureId,
      },
    },
  });

  if (existing) {
    return errorResponse(
      Errors.BAD_REQUEST("Fixture already in watchlist"),
      400
    );
  }

  const item = await prisma.watchlistItem.create({
    data: {
      userId: session.user.id,
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      country,
      date,
      notes,
    },
  });

  // Invalidate cache
  await cache.delete(cacheKeys.userWatchlist(session.user.id));

  return successResponse(item, 201);
});
