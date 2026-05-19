import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { z } from "zod";

const UpdateBankrollSchema = z.object({
  amount: z.number().min(0).max(1000000),
});

/**
 * GET /api/bankroll
 * Returns current bankroll and metrics
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { bankroll: true, createdAt: true },
  });

  if (!user) return errorResponse(Errors.NOT_FOUND);

  // Get bankroll metrics
  const predictions = await prisma.prediction.findMany({
    where: {
      userId: session.user.id,
      status: { in: ["WON", "LOST"] },
    },
    select: { status: true, roi: true, stakeUnits: true },
  });

  const totalWon = predictions.filter(p => p.status === "WON").reduce((s, p) => s + (p.roi || 0), 0);
  const totalLost = predictions.filter(p => p.status === "LOST").reduce((s, p) => s + Math.abs(p.roi || 0), 0);
  const netProfit = totalWon - totalLost;
  const roiPct = predictions.length > 0 ? (netProfit / predictions.length) : 0;

  return successResponse({
    bankroll: user.bankroll,
    totalPredictions: predictions.length,
    totalWon,
    totalLost,
    netProfit: Math.round(netProfit * 100) / 100,
    roi: Math.round(roiPct * 100) / 100,
    maxRecommendedStake: Math.round(user.bankroll * 0.05 * 100) / 100, // 5% max
    unitSize: Math.round(user.bankroll * 0.01 * 100) / 100, // 1% = 1 unit
  });
});

/**
 * PATCH /api/bankroll
 * Update bankroll amount
 */
export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const body = await request.json();
  const validation = UpdateBankrollSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { bankroll: validation.data.amount },
    select: { bankroll: true },
  });

  return successResponse({ bankroll: updated.bankroll });
});
