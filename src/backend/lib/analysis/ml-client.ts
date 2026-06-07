/**
 * ML Service Client — Connects to the Python FastAPI ML microservice.
 * Falls back gracefully if the service is not running.
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TIMEOUT = 8000;
const EXTENDED_TIMEOUT = 15000;

export type MLPrediction = {
  probabilities: { HOME_WIN: number; DRAW: number; AWAY_WIN: number };
  over_25: { over: number; under: number };
  btts: { yes: number; no: number };
  confidence: number;
  models_used: string[];
  feature_importance?: Record<string, number>;
};

let mlAvailable: boolean | null = null;
let lastCheck = 0;

/**
 * Check if ML service is available (cached for 60s).
 */
async function isMLAvailable(): Promise<boolean> {
  const now = Date.now();
  if (mlAvailable !== null && now - lastCheck < 60000) return mlAvailable;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    mlAvailable = res.ok;
  } catch {
    mlAvailable = false;
  }
  lastCheck = now;
  return mlAvailable;
}

/**
 * Get ML predictions for a fixture.
 * Returns null if ML service is unavailable.
 */
export async function getMLPrediction(
  homeStats: Record<string, any>,
  awayStats: Record<string, any>,
  fixture?: Record<string, any>
): Promise<MLPrediction | null> {
  if (!(await isMLAvailable())) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT);

    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home_stats: homeStats, away_stats: awayStats, fixture }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Get ML service status.
 */
export async function getMLStatus(): Promise<{
  available: boolean;
  models: string[];
  metadata?: any;
  extended_libraries?: Record<string, boolean>;
  extended_ready?: boolean;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    return {
      available: true,
      models: data.models_loaded || [],
      metadata: data.metadata,
      extended_libraries: data.extended_libraries,
      extended_ready: data.extended_ready,
    };
  } catch {
    return { available: false, models: [] };
  }
}

import type { ExtendedMLResponse } from "./merge-extended-models";

export type { ExtendedMLResponse };

/**
 * Run extended models (Prophet, ARIMA, MLflow, Qiskit, etc.) on the Python service.
 */
export async function getExtendedMLPrediction(params: {
  homeStats: Record<string, unknown>;
  awayStats: Record<string, unknown>;
  fixture: Record<string, unknown>;
  baseProbabilities?: Record<string, number>;
  valueEdges?: number[];
}): Promise<ExtendedMLResponse | null> {
  if (!(await isMLAvailable())) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTENDED_TIMEOUT);

    const res = await fetch(`${ML_SERVICE_URL}/predict/extended`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        home_stats: params.homeStats,
        away_stats: params.awayStats,
        fixture: params.fixture,
        base_probabilities: params.baseProbabilities,
        value_edges: params.valueEdges,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
