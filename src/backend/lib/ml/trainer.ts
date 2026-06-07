import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { cache } from "@/lib/cache";
import { captureException } from "@/lib/sentry";
import { prisma } from "@/lib/db";

export type TrainingStatus = {
  status: "idle" | "running" | "success" | "error";
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  samples?: number;
  models?: string[];
};

const PYTHON_PATH = process.env.PYTHON_PATH || "python3";
const TRAIN_SCRIPT = process.env.ML_TRAIN_SCRIPT || "train.py";

const STATUS_KEY = "ml:training:status";

function projectPath(...segments: string[]): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), ...segments);
}

function trainingCwd(): string {
  return process.env.ML_TRAIN_SCRIPT ? /* turbopackIgnore: true */ process.cwd() : projectPath("ml");
}

export async function getTrainingStatus(): Promise<TrainingStatus> {
  const cached = await cache.get(STATUS_KEY);
  return (cached as TrainingStatus) ?? { status: "idle" };
}

export async function runTraining(opts: { minSamples?: number; trials?: number } = {}): Promise<TrainingStatus> {
  const current = await getTrainingStatus();
  if (current.status === "running") {
    return { ...current, message: "Entrenamiento ya en curso." };
  }

  const samples = await prisma.trainingData.count();
  if (samples < (opts.minSamples ?? 200)) {
    return {
      status: "error",
      message: `Datos insuficientes: ${samples} registros. Mínimo requerido: ${opts.minSamples ?? 200}. Ejecuta el extractor primero.`,
      samples,
    };
  }

  const started: TrainingStatus = {
    status: "running",
    startedAt: new Date().toISOString(),
    message: "Entrenando CatBoost + XGBoost + LightGBM...",
    samples,
  };
  await cache.set(STATUS_KEY, started, 3600);

  return new Promise((resolve) => {
    const child = spawn(PYTHON_PATH, [
      TRAIN_SCRIPT,
      "--min-samples", String(opts.minSamples ?? 200),
      "--trials", String(opts.trials ?? 30),
      "--output", process.env.ML_MODELS_DIR || projectPath("ml", "models"),
    ], {
      env: { ...process.env, ML_MODELS_DIR: process.env.ML_MODELS_DIR || projectPath("ml", "models") },
      cwd: trainingCwd(),
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      const errorStatus: TrainingStatus = {
        status: "error",
        startedAt: started.startedAt,
        finishedAt: new Date().toISOString(),
        message: "Timeout: el entrenamiento superó los 10 minutos.",
        samples,
      };
      cache.set(STATUS_KEY, errorStatus, 3600).catch(() => {});
      resolve(errorStatus);
    }, 10 * 60 * 1000);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", async (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const errorMsg = stderr.slice(0, 500) || stdout.slice(0, 500) || `Error ${code}`;
        captureException(new Error(errorMsg), { op: "ml-train" });
        const errorStatus: TrainingStatus = {
          status: "error",
          startedAt: started.startedAt,
          finishedAt: new Date().toISOString(),
          message: `Error de entrenamiento: ${errorMsg}`,
          samples,
        };
        await cache.set(STATUS_KEY, errorStatus, 3600);
        resolve(errorStatus);
        return;
      }

      // Detect trained models from filesystem
      const models = ["catboost", "xgboost", "lightgbm"].filter((m) => {
        try {
          const p = path.join(process.env.ML_MODELS_DIR || projectPath("ml", "models"), `${m}_1x2`);
          return existsSync(p + ".cbm") || existsSync(p + ".json") || existsSync(p + ".txt");
        } catch { return false; }
      });

      const successStatus: TrainingStatus = {
        status: "success",
        startedAt: started.startedAt,
        finishedAt: new Date().toISOString(),
        message: `Entrenamiento completado. Modelos: ${models.join(", ")}`,
        samples,
        models,
      };
      await cache.set(STATUS_KEY, successStatus, 3600);
      resolve(successStatus);
    });
  });
}

export function buildExtractionArgs(opts: { leagueId?: string; season?: string; limit?: number; daysBack?: number } = {}) {
  return [
    "tsx",
    "ml-extractor.ts",
    `--limit=${opts.limit ?? 100}`,
    ...(opts.leagueId ? [`--league=${opts.leagueId}`] : []),
    ...(opts.season ? [`--season=${opts.season}`] : []),
    ...(opts.daysBack ? [`--days-back=${opts.daysBack}`] : []),
  ];
}

export async function runExtraction(opts: { leagueId?: string; season?: string; limit?: number; daysBack?: number } = {}) {
  const extractor = spawn("npx", buildExtractionArgs(opts), {
    env: process.env,
    cwd: projectPath("scripts"),
  });

  return new Promise<{ inserted: number; skipped: number; error?: string }>((resolve) => {
    let stdout = "";
    extractor.stdout.on("data", (d) => { stdout += d.toString(); });
    extractor.stderr.on("data", (d) => { stdout += d.toString(); });
    extractor.on("close", () => {
      const insertedMatch = stdout.match(/Inserted (\d+)/);
      const skippedMatch = stdout.match(/Skipped (\d+)/);
      resolve({
        inserted: Number(insertedMatch?.[1] ?? 0),
        skipped: Number(skippedMatch?.[1] ?? 0),
        error: stdout.includes("Error") ? stdout.slice(0, 200) : undefined,
      });
    });
  });
}
