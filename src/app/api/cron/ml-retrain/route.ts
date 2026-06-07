import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";
import { backtestChampionChallenger } from "@/backend/lib/analysis/roi-calibration";

/**
 * GET /api/cron/ml-retrain
 * Advanced auto-retraining pipeline:
 * 1. Extract new data from resolved predictions
 * 2. Train ensemble model with latest data in a temporary workspace
 * 3. Evaluate Brier Score against the current champion model
 * 4. Promote model if it meets the quality gate, otherwise reject
 *
 * Triggered by Vercel Cron or external scheduler.
 * Secured by CRON_SECRET header.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const secret = request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return errorResponse(Errors.INTERNAL_SERVER_ERROR);
  }

  if (secret !== expected) {
    return errorResponse({ code: "UNAUTHORIZED", message: "Cron secret inválido." }, 401);
  }

  const startTime = Date.now();

  // Continuous evaluation: score persisted analyses against real outcomes,
  // per league, straight from the Analysis table (calibration feedback loop).
  const leagueEvaluation = await evaluateAnalysisByLeague(
    Number(process.env.ML_RETRAIN_DAYS_BACK ?? 180)
  );

  const { runTraining, runExtraction } = await import("@/backend/lib/ml/trainer");

  // Step 1: Extract new training data from recent resolved predictions
  const extraction = await runExtraction({
    limit: Number(process.env.ML_RETRAIN_EXTRACT_LIMIT ?? 500),
    leagueId: process.env.ML_RETRAIN_LEAGUE_ID,
    season: process.env.ML_RETRAIN_SEASON,
    daysBack: Number(process.env.ML_RETRAIN_DAYS_BACK ?? 180),
  });

  if (extraction.error || extraction.inserted < 10) {
    return successResponse({
      retrained: false,
      phase: "extraction",
      error: extraction.error || "Insufficient data for retraining",
      samplesExtracted: extraction.inserted,
      leagueEvaluation,
    });
  }

  // Load current champion model's baseline Brier Score
  let baselineBrier = 0.60; // Default baseline
  let baselineLogLoss: number | null = null;
  let baselineRoiPerUnit: number | null = null;
  const prodModelsDir = path.join(process.cwd(), "ml", "models");
  const prodMetaPath = path.join(prodModelsDir, "meta.json");

  if (fs.existsSync(prodMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(prodMetaPath, "utf-8"));
      if (typeof meta.brier_score === "number") {
        baselineBrier = meta.brier_score;
      }
      if (typeof meta.log_loss === "number") baselineLogLoss = meta.log_loss;
      if (typeof meta.roi_per_unit === "number") baselineRoiPerUnit = meta.roi_per_unit;
    } catch {
      // Ignore reading error, fallback to database metric
    }
  }

  const lastRetrainMetric = await prisma.systemMetric.findFirst({
    where: { metric: "ml-retrain" },
    orderBy: { createdAt: "desc" },
  });
  if (lastRetrainMetric && lastRetrainMetric.value < baselineBrier) {
    baselineBrier = lastRetrainMetric.value;
  }

  // Step 2: Train with expanded dataset in a temporary folder
  const tempModelsDir = path.join(process.cwd(), "ml", "models_temp");
  if (fs.existsSync(tempModelsDir)) {
    fs.rmSync(tempModelsDir, { recursive: true, force: true });
  }

  // Set the environment variable for process output directory
  process.env.ML_MODELS_DIR = tempModelsDir;

  const training = await runTraining({
    minSamples: 200,
    trials: 50,
  });

  if (training.status !== "success") {
    // Clean up temp dir if exists
    if (fs.existsSync(tempModelsDir)) {
      fs.rmSync(tempModelsDir, { recursive: true, force: true });
    }
    return successResponse({
      retrained: false,
      phase: "training",
      error: training.message || "Training execution failed",
      trainingStatus: training.status,
      leagueEvaluation,
    });
  }

  // Read newly trained model's Brier Score
  const tempMetaPath = path.join(tempModelsDir, "meta.json");
  let newBrierScore = 999.0;
  let newLogLoss: number | null = null;
  let newRoiPerUnit: number | null = null;
  if (fs.existsSync(tempMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(tempMetaPath, "utf-8"));
      if (typeof meta.brier_score === "number") {
        newBrierScore = meta.brier_score;
      }
      if (typeof meta.log_loss === "number") newLogLoss = meta.log_loss;
      if (typeof meta.roi_per_unit === "number") newRoiPerUnit = meta.roi_per_unit;
    } catch {
      // Ignore
    }
  }

  // Step 3: Compute calibration on last 30 days (for diagnostic purposes)
  const recentPredictions = await prisma.prediction.findMany({
    where: {
      status: { in: ["WON", "LOST"] },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { probability: true, status: true },
  });

  const diagnosticBrier = computeBrierScore(recentPredictions);
  const winRate = recentPredictions.length > 0
    ? recentPredictions.filter(p => p.status === "WON").length / recentPredictions.length
    : 0;

  // Step 4: Quality Gate comparison
  const challengerGate =
    baselineLogLoss != null && baselineRoiPerUnit != null && newLogLoss != null && newRoiPerUnit != null
      ? backtestChampionChallenger({
          champion: {
            brier: baselineBrier,
            logLoss: baselineLogLoss,
            roiPerUnit: baselineRoiPerUnit,
            sampleSize: Math.max(recentPredictions.length, 40),
          },
          challenger: {
            brier: newBrierScore,
            logLoss: newLogLoss,
            roiPerUnit: newRoiPerUnit,
            sampleSize: Math.max(recentPredictions.length, 40),
          },
        })
      : null;
  const passedQualityGate = challengerGate ? challengerGate.promote : newBrierScore <= baselineBrier;

  if (passedQualityGate) {
    // Promote new models to production
    if (!fs.existsSync(prodModelsDir)) {
      fs.mkdirSync(prodModelsDir, { recursive: true });
    }
    const tempFiles = fs.readdirSync(tempModelsDir);
    for (const file of tempFiles) {
      fs.copyFileSync(path.join(tempModelsDir, file), path.join(prodModelsDir, file));
    }
    // Clean up temp dir
    fs.rmSync(tempModelsDir, { recursive: true, force: true });

    // Update system metrics
    await prisma.systemMetric.create({
      data: {
        metric: "ml-retrain",
        value: newBrierScore,
        tags: {
          samplesExtracted: extraction.inserted,
          trainingStatus: training.status,
          winRate: Math.round(winRate * 100) / 100,
          duration: Date.now() - startTime,
          promoted: true,
          baselineBrier: Math.round(baselineBrier * 1000) / 1000,
          newBrier: Math.round(newBrierScore * 1000) / 1000,
          diagnosticBrier: Math.round(diagnosticBrier * 1000) / 1000,
          qualityGateReason: challengerGate?.reason ?? "Brier score did not degrade",
        },
      },
    });

    return successResponse({
      retrained: true,
      promoted: true,
      phase: "complete",
      samplesExtracted: extraction.inserted,
      trainingStatus: training.status,
      qualityGate: {
        passed: true,
        baselineBrier: Math.round(baselineBrier * 1000) / 1000,
        newBrier: Math.round(newBrierScore * 1000) / 1000,
        reason: challengerGate?.reason ?? undefined,
      },
      calibration: {
        diagnosticBrier: Math.round(diagnosticBrier * 1000) / 1000,
        winRate: Math.round(winRate * 1000) / 1000,
        sampleSize: recentPredictions.length,
      },
      leagueEvaluation,
      duration: Date.now() - startTime,
    });
  } else {
    // Clean up temp dir without promoting
    if (fs.existsSync(tempModelsDir)) {
      fs.rmSync(tempModelsDir, { recursive: true, force: true });
    }

    // Record rejected retraining attempt
    await prisma.systemMetric.create({
      data: {
        metric: "ml-retrain-rejected",
        value: newBrierScore,
        tags: {
          samplesExtracted: extraction.inserted,
          trainingStatus: training.status,
          winRate: Math.round(winRate * 100) / 100,
          duration: Date.now() - startTime,
          promoted: false,
          baselineBrier: Math.round(baselineBrier * 1000) / 1000,
          newBrier: Math.round(newBrierScore * 1000) / 1000,
          reason: "Brier score degradation against current champion",
          qualityGateReason: challengerGate?.reason ?? "Brier score degradation against current champion",
        },
      },
    });

    return successResponse({
      retrained: true,
      promoted: false,
      phase: "complete",
      samplesExtracted: extraction.inserted,
      trainingStatus: training.status,
      qualityGate: {
        passed: false,
        baselineBrier: Math.round(baselineBrier * 1000) / 1000,
        newBrier: Math.round(newBrierScore * 1000) / 1000,
        message: "Rejected: New model did not outperform the current champion baseline.",
        reason: challengerGate?.reason ?? "Brier score degradation against current champion",
      },
      calibration: {
        diagnosticBrier: Math.round(diagnosticBrier * 1000) / 1000,
        winRate: Math.round(winRate * 1000) / 1000,
        sampleSize: recentPredictions.length,
      },
      leagueEvaluation,
      duration: Date.now() - startTime,
    });
  }
});

type LeagueEvalRow = {
  league: string;
  samples: number;
  accuracy: number;
  brier: number;
  logLoss: number;
};

/**
 * Score persisted analyses against real match outcomes, grouped by league, and
 * persist each as a SystemMetric ("ml-eval-league"). This is the continuous
 * evaluation feedback loop the retrainer reads from — accuracy / Brier /
 * log-loss computed directly from the Analysis table.
 */
async function evaluateAnalysisByLeague(daysBack: number): Promise<LeagueEvalRow[]> {
  try {
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const rows = await prisma.analysis.findMany({
      where: {
        result: { not: null },
        createdAt: { gte: since },
      },
      select: {
        league: true,
        result: true,
        homeWinProb: true,
        drawProb: true,
        awayWinProb: true,
      },
    });

    const grouped = new Map<string, Array<{ p: number[]; outcome: number }>>();
    const idxByResult: Record<string, number> = { HOME_WIN: 0, DRAW: 1, AWAY_WIN: 2 };

    for (const r of rows) {
      const outcome = idxByResult[r.result as string];
      if (outcome === undefined) continue;
      const raw = [r.homeWinProb, r.drawProb, r.awayWinProb].map((v) => Math.max(0, v) / 100);
      const total = raw.reduce((s, v) => s + v, 0) || 1;
      const p = raw.map((v) => v / total);
      const key = r.league || "unknown";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({ p, outcome });
    }

    const results: LeagueEvalRow[] = [];
    for (const [league, items] of grouped) {
      if (items.length < 10) continue; // not enough to be meaningful
      let correct = 0;
      let brierSum = 0;
      let logLossSum = 0;
      for (const { p, outcome } of items) {
        const pred = p.indexOf(Math.max(...p));
        if (pred === outcome) correct += 1;
        for (let c = 0; c < 3; c += 1) {
          const y = c === outcome ? 1 : 0;
          brierSum += (p[c] - y) ** 2;
        }
        const pc = Math.min(1 - 1e-12, Math.max(1e-12, p[outcome]));
        logLossSum += -Math.log(pc);
      }
      const n = items.length;
      results.push({
        league,
        samples: n,
        accuracy: Math.round((correct / n) * 1000) / 1000,
        brier: Math.round((brierSum / n) * 1000) / 1000,
        logLoss: Math.round((logLossSum / n) * 1000) / 1000,
      });
    }

    await Promise.all(
      results.map((row) =>
        prisma.systemMetric.create({
          data: {
            metric: "ml-eval-league",
            value: row.brier,
            tags: {
              league: row.league,
              samples: row.samples,
              accuracy: row.accuracy,
              logLoss: row.logLoss,
            },
          },
        })
      )
    );

    return results.sort((a, b) => b.samples - a.samples);
  } catch {
    return [];
  }
}

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
