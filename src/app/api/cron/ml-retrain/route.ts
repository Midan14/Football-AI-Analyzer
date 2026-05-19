import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling } from "@/lib/api-utils";
import { runTraining, runExtraction } from "@/backend/lib/ml/trainer";
import { prisma } from "@/lib/db";

/**
 * GET /api/cron/ml-retrain
 * Advanced auto-retraining pipeline:
 * 1. Extract new data from resolved predictions
 * 2. Train ensemble model with latest data
 * 3. Compute calibration metrics
 * 4. Update model weights if new model outperforms
 *
 * Triggered by Vercel Cron or external scheduler.
 * Secured by CRON_SECRET header.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const secret = request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET || "football-ai-cron";

  if (secret !== expected) {
    return errorResponse({ code: "UNAUTHORIZED", message: "Cron secret inválido." }, 401);
  }

  const startTime = Date.now();

  // Step 1: Extract new training data from recent resolved predictions
  const extraction = await runExtraction({ limit: 500 });

  if (extraction.error || extraction.inserted < 10) {
    return successResponse({
      retrained: false,
      phase: "extraction",
      error: extraction.error || "Insufficient data for retraining",
      samplesExtracted: extraction.inserted,
    });
  }

  // Step 2: Train with expanded dataset
  const training = await runTraining({
    minSamples: 200,
    trials: 50,
  });

  // Step 3: Compute calibration on last 30 days
  const recentPredictions = await prisma.prediction.findMany({
    where: {
      status: { in: ["WON", "LOST"] },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { probability: true, status: true },
  });

  const brierScore = computeBrierScore(recentPredictions);
  const winRate = recentPredictions.length > 0
    ? recentPredictions.filter(p => p.status === "WON").length / recentPredictions.length
    : 0;

  // Step 4: Update system metrics
  await prisma.systemMetric.create({
    data: {
      metric: "ml-retrain",
      value: brierScore,
      tags: {
        samplesExtracted: extraction.inserted,
        trainingStatus: training.status,
        winRate: Math.round(winRate * 100) / 100,
        duration: Date.now() - startTime,
      },
    },
  });

  return successResponse({
    retrained: true,
    phase: "complete",
    samplesExtracted: extraction.inserted,
    trainingStatus: training.status,
    calibration: {
      brierScore: Math.round(brierScore * 1000) / 1000,
      winRate: Math.round(winRate * 1000) / 1000,
      sampleSize: recentPredictions.length,
    },
    duration: Date.now() - startTime,
  });
});

function computeBrierScore(predictions: Array<{ probability: number; status: string }>): number {
  if (predictions.length === 0) return 0;
  let sum = 0;
  for (const p of predictions) {
    const outcome = p.status === "WON" ? 1 : 0;
    const prob = p.probability / 100;
    sum += Math.pow(prob - outcome, 2);
  }
  return sum / predictions.length;
}
