import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { checkRateLimit, setRateLimitHeaders } from "@/lib/rate-limit";
import { cache } from "@/lib/cache";
import { auth } from "@/auth";
import { UpdateProfileSchema } from "@/lib/schemas/auth";

const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  timezone: true,
  language: true,
  modelMode: true,
  notificationsEnabled: true,
  bankroll: true,
  createdAt: true,
} as const;

/**
 * GET /api/auth/profile
 * Get authenticated user profile
 */
export const GET = withErrorHandling(async (_request: NextRequest) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const rateLimit = await checkRateLimit(session.user.id, "profile:get", 60, 15);
  if (!rateLimit.allowed) {
    const headers = new Headers();
    setRateLimitHeaders(headers, rateLimit);
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta más tarde." }, 429);
  }

  const cachedUser = await cache.get(`user:${session.user.id}:profile`);
  if (cachedUser) {
    return successResponse(cachedUser);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: PROFILE_SELECT,
  });

  if (!user) {
    return errorResponse(Errors.NOT_FOUND);
  }

  await cache.set(`user:${session.user.id}:profile`, user, 3600);

  return successResponse(user);
});

/**
 * PATCH /api/auth/profile
 * Update authenticated user profile
 */
export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();

  if (!session?.user?.id) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const rateLimit = await checkRateLimit(session.user.id, "profile:patch", 20, 15);
  if (!rateLimit.allowed) {
    const headers = new Headers();
    setRateLimitHeaders(headers, rateLimit);
    return errorResponse({ code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta más tarde." }, 429);
  }

  const body = await request.json();
  const validation = UpdateProfileSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const { name, timezone, language, modelMode, notificationsEnabled } = validation.data;

  // Map frontend modelMode strings to Prisma enum
  const modelModeMap: Record<string, "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE"> = {
    Conservador: "CONSERVATIVE",
    Balanceado: "BALANCED",
    Agresivo: "AGGRESSIVE",
    CONSERVATIVE: "CONSERVATIVE",
    BALANCED: "BALANCED",
    AGGRESSIVE: "AGGRESSIVE",
  };

  const updatedUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined && { name }),
      ...(timezone !== undefined && { timezone }),
      ...(language !== undefined && { language }),
      ...(modelMode !== undefined && { modelMode: modelModeMap[modelMode] ?? "BALANCED" }),
      ...(notificationsEnabled !== undefined && { notificationsEnabled }),
    },
    select: PROFILE_SELECT,
  });

  // Invalidate cache
  await cache.delete(`user:${session.user.id}:profile`);

  return successResponse(updatedUser);
});
