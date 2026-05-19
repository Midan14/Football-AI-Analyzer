import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/calibration
 * Returns model calibration data for the authenticated user
 * Shows if predicted probabilities match actual outcomes
 * 
 * Perfect calibration: 70% predictions should win ~70% of the time
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: session.user.id,
      status: { in: ["WON", "LOST"] },
      probability: { gte: 30 }, // Only meaningful probabilities
    },
    select: {
      probability: true,
      status: true,
      market: true,
      leagueId: true,
    },
  });

  if (predictions.length < 10) {
    return successResponse({
      message: "Mínimo 10 predicciones resueltas para calibración. Actual: " + predictions.length,
      sampleSize: predictions.length,
      calibration: null,
    });
  }

  // Bucket by probability ranges
  const buckets: Record<string, { predicted: number; actual: number; count: number; won: number }> = {
    "30-40%": { predicted: 35, actual: 0, count: 0, won: 0 },
    "40-50%": { predicted: 45, actual: 0, count: 0, won: 0 },
    "50-60%": { predicted: 55, actual: 0, count: 0, won: 0 },
    "60-70%": { predicted: 65, actual: 0, count: 0, won: 0 },
    "70-80%": { predicted: 75, actual: 0, count: 0, won: 0 },
    "80-90%": { predicted: 85, actual: 0, count: 0, won: 0 },
    "90-100%": { predicted: 95, actual: 0, count: 0, won: 0 },
  };

  for (const p of predictions) {
    const bucket =
      p.probability < 40 ? "30-40%" :
      p.probability < 50 ? "40-50%" :
      p.probability < 60 ? "50-60%" :
      p.probability < 70 ? "60-70%" :
      p.probability < 80 ? "70-80%" :
      p.probability < 90 ? "80-90%" :
      "90-100%";

    buckets[bucket].count++;
    if (p.status === "WON") buckets[bucket].won++;
  }

  // Calculate actual win rates
  for (const key of Object.keys(buckets)) {
    const b = buckets[key];
    b.actual = b.count > 0 ? Math.round((b.won / b.count) * 1000) / 10 : 0;
  }

  // Overall calibration score (Brier-like)
  let brierSum = 0;
  for (const p of predictions) {
    const outcome = p.status === "WON" ? 1 : 0;
    const prob = p.probability / 100;
    brierSum += Math.pow(prob - outcome, 2);
  }
  const brierScore = Math.round((brierSum / predictions.length) * 1000) / 1000;

  return successResponse({
    sampleSize: predictions.length,
    brierScore,
    calibration: buckets,
    interpretation: brierScore < 0.15
      ? "Excelente calibración"
      : brierScore < 0.22
      ? "Buena calibración"
      : brierScore < 0.30
      ? "Calibración regular"
      : "Mala calibración — modelo sobreestima probabilidades",
  });
});
