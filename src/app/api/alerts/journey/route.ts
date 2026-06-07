import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { cache } from "@/lib/cache";
import { buildJourneyAlerts } from "@/backend/server/football/journey-alerts-service";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leagueId: z.string().min(1).optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    const rateLimit = await checkRateLimit(userId, "alerts:journey", 20, 15);
    if (!rateLimit.allowed) {
      return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes de alertas." }, 429);
    }
  }

  const parsed = QuerySchema.safeParse({
    date: request.nextUrl.searchParams.get("date"),
    leagueId: request.nextUrl.searchParams.get("leagueId") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(Errors.VALIDATION_ERROR(parsed.error.flatten()), 400);
  }

  const { date, leagueId } = parsed.data;
  const cacheKey = `football:journey-alerts:${userId ?? "guest"}:${leagueId ?? "all"}:${date}`;
  const cached = await cache.get<Awaited<ReturnType<typeof buildJourneyAlerts>>>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const payload = await buildJourneyAlerts({ date, leagueId, userId });
  await cache.set(cacheKey, payload, 20);

  return successResponse(payload);
});
