import { NextRequest } from "next/server";
import { prisma } from "./db";

export async function checkRateLimit(
  userId: string | undefined,
  endpoint: string,
  limit: number = 100,
  windowMinutes: number = 15
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();

  const existing = await prisma.rateLimit.findFirst({
    where: {
      userId: userId ?? null,
      endpoint,
      windowEnd: { gt: now },
    },
    orderBy: { windowEnd: "desc" },
  });

  if (!existing) {
    const roundedStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
    const roundedEnd = new Date(roundedStart.getTime() + windowMinutes * 60 * 1000);
    const record = await prisma.rateLimit.upsert({
      where: {
        userId_endpoint_windowStart: {
          userId: userId ?? null,
          endpoint,
          windowStart: roundedStart,
        },
      },
      create: {
        userId: userId ?? null,
        endpoint,
        requests: 1,
        windowStart: roundedStart,
        windowEnd: roundedEnd,
      },
      update: {
        requests: { increment: 1 },
      },
    });

    const allowed = record.requests <= limit;
    const remaining = Math.max(0, limit - record.requests);

    return { allowed, remaining, resetAt: record.windowEnd };
  }

  const updated = await prisma.rateLimit.update({
    where: { id: existing.id },
    data: { requests: { increment: 1 } },
  });

  const allowed = updated.requests <= limit;
  const remaining = Math.max(0, limit - updated.requests);

  return { allowed, remaining, resetAt: updated.windowEnd };
}

export function getUserIdFromRequest(req: NextRequest): string | undefined {
  return req.headers.get("x-user-id") ?? undefined;
}

export function setRateLimitHeaders(
  headers: Headers,
  rateLimit: { allowed: boolean; remaining: number; resetAt: Date }
) {
  headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString());
  headers.set("X-RateLimit-Reset", rateLimit.resetAt.toISOString());
}
