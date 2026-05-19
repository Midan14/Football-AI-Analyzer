import { spawn } from "child_process";
import { captureException } from "@/lib/sentry";
import type { Fixture } from "@/shared/domain";

export type MLPrediction = {
  prediction: string;
  confidence: number;
  probabilities: Record<string, Record<string, number>>;
  classes: string[];
  shap: {
    top_features: Array<{ feature: string; impact: number }>;
    error?: string;
  };
};

const PYTHON_PATH = process.env.PYTHON_PATH || "python3";
const PREDICT_SCRIPT = process.env.ML_PREDICT_SCRIPT || "ml/predict.py";

/**
 * Run the Python ML predictor on a given fixture.
 * Falls back gracefully if models are not trained or Python is unavailable.
 */
export async function predictWithML(fixture: Fixture): Promise<MLPrediction | null> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_PATH, [PREDICT_SCRIPT], {
      env: { ...process.env, ML_MODELS_DIR: process.env.ML_MODELS_DIR || "ml/models" },
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 8000);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || !stdout.trim()) {
        if (stderr) captureException(new Error(stderr.slice(0, 200)), { fixtureId: fixture.id, op: "ml-predict" });
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as MLPrediction;
        if ("error" in parsed) {
          resolve(null);
          return;
        }
        resolve(parsed);
      } catch {
        resolve(null);
      }
    });

    child.stdin.write(JSON.stringify({ fixture }) + "\n");
    child.stdin.end();
  });
}
