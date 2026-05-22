/**
 * ML Predictor — FastAPI service first, local ml/predict.py fallback.
 * No manual `uvicorn` required when models exist under ml/models/.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { Fixture } from "@/shared/domain";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TIMEOUT = 8000;
const PYTHON_PATH = process.env.PYTHON_PATH || "python3";
const ML_PREDICT_SCRIPT = process.env.ML_PREDICT_SCRIPT || "ml/predict.py";
const ML_MODELS_DIR = process.env.ML_MODELS_DIR || "ml/models";

export type MLPrediction = {
  prediction: string;
  confidence: number;
  probabilities: {
    ensemble: Record<string, number>;
    xgboost?: Record<string, number>;
    lightgbm?: Record<string, number>;
    catboost?: Record<string, number>;
    neural_net?: Record<string, number>;
  };
  over_25: { over: number; under: number };
  btts: { yes: number; no: number };
  models_used: string[];
  feature_importance?: Record<string, number>;
  classes: string[];
  shap: {
    top_features: Array<{ feature: string; impact: number }>;
    error?: string;
  };
  source?: "fastapi" | "local-script";
};

type LocalPredictResponse = {
  prediction?: string;
  confidence?: number;
  probabilities?: Record<string, Record<string, number>>;
  classes?: string[];
  shap?: { top_features?: Array<{ feature: string; impact: number }>; error?: string };
  error?: string;
};

let mlAvailable: boolean | null = null;
let lastHealthCheck = 0;

function normalizeProbabilities(probs: Record<string, number>): Record<string, number> {
  const values = Object.values(probs);
  if (values.length === 0) return probs;
  const max = Math.max(...values);
  if (max <= 1) {
    return Object.fromEntries(
      Object.entries(probs).map(([key, value]) => [key, Math.round(value * 1000) / 10])
    );
  }
  return probs;
}

function mapLocalResponse(data: LocalPredictResponse): MLPrediction | null {
  if (data.error || !data.probabilities?.ensemble) return null;

  const ensemble = normalizeProbabilities(data.probabilities.ensemble);
  const classes = data.classes ?? ["AWAY_WIN", "DRAW", "HOME_WIN"];
  const prediction =
    data.prediction ??
    Object.entries(ensemble).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "DRAW";

  const confidenceRaw = data.confidence ?? ensemble[prediction] ?? 0;
  const confidence = confidenceRaw <= 1 ? Math.round(confidenceRaw * 1000) / 10 : confidenceRaw;

  const shapFeatures = data.shap?.top_features ?? [];

  return {
    prediction,
    confidence,
    probabilities: {
      ensemble,
      xgboost: data.probabilities.xgboost ? normalizeProbabilities(data.probabilities.xgboost) : undefined,
      lightgbm: data.probabilities.lightgbm ? normalizeProbabilities(data.probabilities.lightgbm) : undefined,
      catboost: data.probabilities.catboost ? normalizeProbabilities(data.probabilities.catboost) : undefined,
    },
    over_25: { over: ensemble.HOME_WIN ? 50 : 50, under: 50 },
    btts: { yes: 50, no: 50 },
    models_used: Object.keys(data.probabilities).filter((k) => k !== "ensemble"),
    classes,
    shap: {
      top_features: shapFeatures,
      error: data.shap?.error,
    },
    source: "local-script",
  };
}

async function checkMLHealth(): Promise<boolean> {
  const now = Date.now();
  if (mlAvailable !== null && now - lastHealthCheck < 30000) return mlAvailable;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    mlAvailable = res.ok;
  } catch {
    mlAvailable = false;
  }
  lastHealthCheck = now;
  return mlAvailable;
}

function localModelsAvailable(): boolean {
  const metaPath = join(process.cwd(), ML_MODELS_DIR, "meta.json");
  return existsSync(metaPath);
}

async function predictWithLocalScript(fixture: Fixture): Promise<MLPrediction | null> {
  if (!localModelsAvailable()) return null;

  const scriptPath = join(process.cwd(), ML_PREDICT_SCRIPT);
  if (!existsSync(scriptPath)) return null;

  return new Promise((resolve) => {
    const child = spawn(
      PYTHON_PATH,
      [ML_PREDICT_SCRIPT],
      {
        cwd: process.cwd(),
        env: { ...process.env, ML_MODELS_DIR },
      }
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(null);
    }, ML_TIMEOUT);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as LocalPredictResponse;
        resolve(mapLocalResponse(parsed));
      } catch {
        resolve(null);
      }
    });

    child.stdin.write(JSON.stringify({ fixture }));
    child.stdin.end();
  });
}

/**
 * Build team stats payload from Fixture data for the ML service.
 */
export function buildMLStatsPayload(fixture: Fixture) {
  const homeMP = fixture.home.matchesPlayed || 18;
  const awayMP = fixture.away.matchesPlayed || 18;

  const homeStats = {
    fixtures: {
      played: { total: homeMP, home: Math.ceil(homeMP / 2) },
      wins: { total: Math.round(fixture.home.pointsTotal / 3 * 0.8), home: Math.round(fixture.home.pointsTotal / 3 * 0.5) },
      draws: { total: Math.round((homeMP - fixture.home.pointsTotal / 3) * 0.4) },
    },
    goals: {
      for: { total: { total: fixture.home.goalsFor } },
      against: { total: { total: fixture.home.goalsAgainst } },
    },
    form: fixture.home.form.join(""),
    clean_sheet: { total: Math.round(homeMP * 0.3) },
    failed_to_score: { total: Math.round(homeMP * 0.2) },
    penalty: { scored: { total: Math.round(homeMP * 0.05) } },
  };

  const awayStats = {
    fixtures: {
      played: { total: awayMP, away: Math.ceil(awayMP / 2) },
      wins: { total: Math.round(fixture.away.pointsTotal / 3 * 0.8), away: Math.round(fixture.away.pointsTotal / 3 * 0.3) },
      draws: { total: Math.round((awayMP - fixture.away.pointsTotal / 3) * 0.4) },
    },
    goals: {
      for: { total: { total: fixture.away.goalsFor } },
      against: { total: { total: fixture.away.goalsAgainst } },
    },
    form: fixture.away.form.join(""),
    clean_sheet: { total: Math.round(awayMP * 0.25) },
    failed_to_score: { total: Math.round(awayMP * 0.25) },
    penalty: { scored: { total: Math.round(awayMP * 0.04) } },
  };

  return { homeStats, awayStats };
}

async function predictHeuristicFromExtended(fixture: Fixture): Promise<MLPrediction | null> {
  if (!(await checkMLHealth())) return null;
  try {
    const { homeStats, awayStats } = buildMLStatsPayload(fixture);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT);
    const res = await fetch(`${ML_SERVICE_URL}/predict/extended`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home_stats: homeStats, away_stats: awayStats, fixture }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const ext = await res.json();
    const blend = ext.temporalBlend;
    if (!blend) return null;
    const ensemble = normalizeProbabilities({
      HOME_WIN: blend.homeWin,
      DRAW: blend.draw,
      AWAY_WIN: blend.awayWin,
    });
    const topClass = Object.entries(ensemble).sort((a, b) => b[1] - a[1])[0][0];
    return {
      prediction: topClass,
      confidence: 58,
      probabilities: { ensemble },
      over_25: { over: 50, under: 50 },
      btts: { yes: 50, no: 50 },
      models_used: ["heuristic-extended"],
      classes: ["HOME_WIN", "DRAW", "AWAY_WIN"],
      shap: { top_features: [] },
      source: "fastapi",
    };
  } catch {
    return null;
  }
}

async function predictWithFastAPI(fixture: Fixture): Promise<MLPrediction | null> {
  if (!(await checkMLHealth())) return null;

  try {
    const { homeStats, awayStats } = buildMLStatsPayload(fixture);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT);

    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home_stats: homeStats, away_stats: awayStats, fixture }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) {
      return predictHeuristicFromExtended(fixture);
    }

    const data = await res.json();
    const rawProbs = data.probabilities ?? {};
    const ensemble = normalizeProbabilities({
      HOME_WIN: rawProbs.HOME_WIN ?? rawProbs.homeWin ?? 33.3,
      DRAW: rawProbs.DRAW ?? rawProbs.draw ?? 33.3,
      AWAY_WIN: rawProbs.AWAY_WIN ?? rawProbs.awayWin ?? 33.4,
    });

    const topClass = Object.entries(ensemble).sort((a, b) => b[1] - a[1])[0][0];

    const prediction: MLPrediction = {
      prediction: topClass,
      confidence: data.confidence ?? ensemble[topClass] ?? 60,
      probabilities: {
        ensemble,
        xgboost: data.xgboost_1x2 ? normalizeProbabilities(data.xgboost_1x2) : undefined,
      },
      over_25: data.over_25 ?? { over: 50, under: 50 },
      btts: data.btts ?? { yes: 50, no: 50 },
      models_used: data.models_used ?? [],
      feature_importance: data.feature_importance,
      classes: ["HOME_WIN", "DRAW", "AWAY_WIN"],
      shap: {
        top_features: data.feature_importance
          ? Object.entries(data.feature_importance)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .slice(0, 8)
              .map(([feature, impact]) => ({ feature, impact: impact as number }))
          : [],
      },
      source: "fastapi",
    };

    return prediction;
  } catch {
    return null;
  }
}

/**
 * Get ML predictions: tries FastAPI, then local Python script with trained models.
 */
export async function predictWithML(fixture: Fixture): Promise<MLPrediction | null> {
  const fromApi = await predictWithFastAPI(fixture);
  if (fromApi) return fromApi;

  return predictWithLocalScript(fixture);
}
