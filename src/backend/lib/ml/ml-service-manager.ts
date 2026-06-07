/**
 * Auto-starts the local ml-service (FastAPI) when analysis needs ML predictions.
 * Only applies to localhost URLs; remote ML_SERVICE_URL is never spawned from here.
 */

import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";

const execFileAsync = promisify(execFile);

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

function mlServiceDir(): string {
  return `${process.cwd()}/ml-service`;
}

/**
 * Keep the Python venv outside the Next.js project tree. Turbopack follows
 * existing symlinks during production builds, and Python venvs contain absolute
 * symlinks that can point outside the project filesystem root.
 */
function venvDir(): string {
  const configured = process.env.ML_SERVICE_VENV_DIR;
  if (configured?.startsWith("~/")) {
    return path.join(homedir(), configured.slice(2));
  }
  if (configured) return configured;
  return (
    path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "football-ai-analyzer", "ml-service-venv")
  );
}

function venvPythonPath(): string {
  return `${venvDir()}/bin/python`;
}

function venvPipPath(): string {
  return `${venvDir()}/bin/pip`;
}

let childProcess: ChildProcess | null = null;
let startPromise: Promise<boolean> | null = null;
let bootstrapPromise: Promise<boolean> | null = null;

function parseServiceTarget(): { host: string; port: number } {
  try {
    const url = new URL(ML_SERVICE_URL);
    const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
    const port = url.port ? Number.parseInt(url.port, 10) : 8000;
    return { host, port };
  } catch {
    return { host: "127.0.0.1", port: 8000 };
  }
}

function isLocalServiceUrl(): boolean {
  try {
    const { hostname } = new URL(ML_SERVICE_URL);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function autoStartEnabled(): boolean {
  if (process.env.ML_SERVICE_AUTO_START === "false") return false;
  if (process.env.NODE_ENV === "production" && process.env.ML_SERVICE_AUTO_START !== "true") {
    return false;
  }
  return isLocalServiceUrl();
}

function bootstrapEnabled(): boolean {
  if (process.env.ML_SERVICE_BOOTSTRAP === "false") return false;
  if (process.env.NODE_ENV === "production") return false;
  return autoStartEnabled();
}

export async function pingMLServiceHealth(timeoutMs = 2000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function resolvePythonExecutable(): string {
  const venvPython = venvPythonPath();
  if (existsSync(venvPython)) return venvPython;
  return process.env.PYTHON_PATH || "python3";
}

async function bootstrapVenvIfNeeded(): Promise<boolean> {
  if (existsSync(venvPythonPath())) return true;
  if (!bootstrapEnabled()) {
    console.warn(
      `[ml-service] No venv local. Se creará en ${venvDir()} en el primer análisis.`
    );
    return false;
  }

  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const systemPython = process.env.PYTHON_PATH || "python3";
    const serviceDir = mlServiceDir();
    const reqFile = `${serviceDir}/requirements-minimal.txt`;
    if (!existsSync(`${serviceDir}/server.py`) || !existsSync(reqFile)) {
      console.error("[ml-service] Falta ml-service/server.py o requirements-minimal.txt");
      return false;
    }

    console.info("[ml-service] Creando venv e instalando dependencias mínimas (primera vez, ~1–3 min)…");
    try {
      await execFileAsync(systemPython, ["-m", "venv", venvDir()], {
        timeout: 120_000,
      });
      await execFileAsync(venvPipPath(), ["install", "-r", "requirements-minimal.txt"], {
        cwd: serviceDir,
        timeout: 600_000,
        env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: "1" },
      });
      return existsSync(venvPythonPath());
    } catch (error) {
      console.error("[ml-service] Bootstrap falló:", error);
      return false;
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

function spawnMLServiceProcess(): void {
  if (childProcess) return;

  const { host, port } = parseServiceTarget();
  const python = resolvePythonExecutable();
  const bindHost = host === "0.0.0.0" ? "127.0.0.1" : host;

  childProcess = spawn(
    python,
    ["-m", "uvicorn", "server:app", "--host", bindHost, "--port", String(port)],
    {
      cwd: mlServiceDir(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    }
  );

  childProcess.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.info(`[ml-service] ${line}`);
  });

  childProcess.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line && !line.includes("Started server process")) {
      console.warn(`[ml-service] ${line}`);
    }
  });

  childProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.warn(`[ml-service] Proceso terminó con código ${code}`);
    }
    childProcess = null;
  });
}

/**
 * Ensures ml-service responds on ML_SERVICE_URL. Starts local uvicorn if needed.
 */
export async function ensureMLServiceRunning(): Promise<boolean> {
  if (await pingMLServiceHealth()) return true;
  if (!autoStartEnabled()) return false;

  if (startPromise) return startPromise;

  startPromise = (async () => {
    const ready = await bootstrapVenvIfNeeded();
    if (!ready && !existsSync(venvPythonPath())) {
      if (!existsSync(`${mlServiceDir()}/server.py`)) return false;
    }

    spawnMLServiceProcess();

    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (await pingMLServiceHealth(3000)) {
        console.info("[ml-service] Listo en", ML_SERVICE_URL);
        return true;
      }
    }

    console.error("[ml-service] No respondió a tiempo en", ML_SERVICE_URL);
    return false;
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

export function getMLServiceManagerState() {
  return {
    url: ML_SERVICE_URL,
    autoStartEnabled: autoStartEnabled(),
    bootstrapEnabled: bootstrapEnabled(),
    processRunning: childProcess !== null && !childProcess.killed,
    venvPresent: existsSync(venvPythonPath()),
  };
}
