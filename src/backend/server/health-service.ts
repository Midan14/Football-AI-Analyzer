import { prisma } from "@/lib/db";
import { getActiveProviderName } from "@/backend/lib/providers/provider-factory";
import { createClient } from "redis";

let startupTime = Date.now();

export function setStartupTime(time?: number) {
  startupTime = time ?? Date.now();
}

export type HealthStatus = {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: string;
  services: {
    postgres: {
      status: "healthy" | "unhealthy";
      latencyMs: number;
    };
    redis: {
      status: "healthy" | "unhealthy" | "unavailable";
      latencyMs: number | null;
    };
    dataProvider: {
      provider: string;
      status: "healthy" | "degraded" | "unhealthy";
      message: string;
    };
  };
};

function checkDataProvider(): HealthStatus["services"]["dataProvider"] {
  const provider = getActiveProviderName();
  if (provider === "sportmonks") {
    return process.env.SPORTMONKS_API_TOKEN
      ? { provider, status: "healthy", message: "Sportmonks token configured" }
      : { provider, status: "unhealthy", message: "SPORTMONKS_API_TOKEN is missing" };
  }

  if (provider === "api-football") {
    return process.env.API_FOOTBALL_KEY
      ? { provider, status: "healthy", message: "API-Football token configured" }
      : { provider, status: "unhealthy", message: "API_FOOTBALL_KEY is missing" };
  }

  if (process.env.NODE_ENV === "production" && provider === "demo") {
    return {
      provider,
      status: "unhealthy",
      message: "Demo data provider is not allowed in production",
    };
  }

  return {
    provider,
    status: provider === "demo" || provider === "scraping" ? "degraded" : "healthy",
    message:
      provider === "demo"
        ? "Demo data provider enabled"
        : provider === "scraping"
          ? "Scraping provider uses synthetic fallback data"
          : "Provider configured",
  };
}

export async function checkHealth(): Promise<HealthStatus> {
  const start = Date.now();

  let pgStatus: HealthStatus["services"]["postgres"] = {
    status: "unhealthy",
    latencyMs: 0,
  };

  try {
    const pgStart = Date.now();
    const result = await prisma.$queryRaw<Array<{ "?column?": number }>>`SELECT 1`;
    const pgLatency = Date.now() - pgStart;
    pgStatus = {
      status: "healthy",
      latencyMs: pgLatency,
    };
  } catch {
    pgStatus = { status: "unhealthy", latencyMs: Date.now() - start };
  }

  let redisStatus: HealthStatus["services"]["redis"] = {
    status: "unavailable",
    latencyMs: null,
  };

  if (process.env.REDIS_URL) {
    try {
      const redisStart = Date.now();
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      const pingResult = await client.ping();
      await client.disconnect();
      const redisLatency = Date.now() - redisStart;

      redisStatus = {
        status: pingResult === "PONG" ? "healthy" : "unhealthy",
        latencyMs: redisLatency,
      };
    } catch {
      redisStatus = { status: "unhealthy", latencyMs: null };
    }
  }

  const uptime = Date.now() - startupTime;
  const dataProviderStatus = checkDataProvider();

  const overallStatus =
    pgStatus.status === "unhealthy" || dataProviderStatus.status === "unhealthy"
      ? "unhealthy"
      : redisStatus.status === "unhealthy" || dataProviderStatus.status === "degraded"
        ? "degraded"
        : redisStatus.status === "healthy" || redisStatus.status === "unavailable"
        ? "healthy"
        : "degraded";

  return {
    status: overallStatus,
    uptime,
    timestamp: new Date().toISOString(),
    services: {
      postgres: pgStatus,
      redis: redisStatus,
      dataProvider: dataProviderStatus,
    },
  };
}
