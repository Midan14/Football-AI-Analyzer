import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { cache, cacheKeys } from "@/lib/cache";
import { auth } from "@/auth";

const RouteParamsSchema = z.object({
  fixtureId: z.string().min(1),
});

type WatchlistRouteContext = {
  params: Promise<{ fixtureId: string }> | { fixtureId: string };
};

/**
 * DELETE /api/user/watchlist/[fixtureId]
 * Remove fixture from watchlist
 */
export const DELETE = withErrorHandling(async (request: NextRequest, { params }: WatchlistRouteContext) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const routeParams = RouteParamsSchema.safeParse(await Promise.resolve(params));
  if (!routeParams.success) {
    return errorResponse(Errors.VALIDATION_ERROR(routeParams.error.flatten()), 400);
  }
  const { fixtureId } = routeParams.data;

  const item = await prisma.watchlistItem.findUnique({
    where: {
      userId_fixtureId: {
        userId: session.user.id,
        fixtureId,
      },
    },
  });

  if (!item) {
    return errorResponse(Errors.NOT_FOUND);
  }

  await prisma.watchlistItem.delete({
    where: { id: item.id },
  });

  // Invalidate cache
  await cache.delete(cacheKeys.userWatchlist(session.user.id));

  return successResponse({ success: true });
});
