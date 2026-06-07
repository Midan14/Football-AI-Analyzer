import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const allowedRateLimit = {
  allowed: true,
  remaining: 10,
  resetAt: new Date("2026-05-20T00:00:00.000Z"),
};

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("API security hardening", () => {
  it("blocks ML training for non-admin users", async () => {
    const runTraining = vi.fn();
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({ user: { id: "user-1", role: "USER" } })),
    }));
    vi.doMock("@/backend/lib/ml/trainer", () => ({
      runTraining,
      runExtraction: vi.fn(),
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(async () => allowedRateLimit),
    }));

    const { POST } = await import("@/app/api/ml/train/route");
    const response = await POST(
      new NextRequest("http://localhost/api/ml/train", {
        method: "POST",
        body: JSON.stringify({ trials: 5 }),
      })
    );

    expect(response.status).toBe(403);
    expect(runTraining).not.toHaveBeenCalled();
  });

  it("validates ML training input for admins", async () => {
    const runTraining = vi.fn();
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({ user: { id: "admin-1", role: "ADMIN" } })),
    }));
    vi.doMock("@/backend/lib/ml/trainer", () => ({
      runTraining,
      runExtraction: vi.fn(),
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(async () => allowedRateLimit),
    }));

    const { POST } = await import("@/app/api/ml/train/route");
    const response = await POST(
      new NextRequest("http://localhost/api/ml/train", {
        method: "POST",
        body: JSON.stringify({ limit: 1, trials: 5 }),
      })
    );

    expect(response.status).toBe(400);
    expect(runTraining).not.toHaveBeenCalled();
  });

  it("fails closed when ML retrain cron secret is not configured", async () => {
    const previousSecret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    const runExtraction = vi.fn();
    vi.doMock("@/backend/lib/ml/trainer", () => ({
      runTraining: vi.fn(),
      runExtraction,
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        prediction: { findMany: vi.fn() },
        systemMetric: { create: vi.fn() },
      },
    }));

    const { GET } = await import("@/app/api/cron/ml-retrain/route");
    const response = await GET(new NextRequest("http://localhost/api/cron/ml-retrain?secret=football-ai-cron"));

    expect(response.status).toBe(500);
    expect(runExtraction).not.toHaveBeenCalled();

    if (previousSecret) process.env.CRON_SECRET = previousSecret;
  });

  it("requires auth before running fixture analysis", async () => {
    const analyzeMatch = vi.fn();
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => null),
    }));
    vi.doMock("@/backend/server/football/football-service", () => ({
      analyzeMatch,
    }));
    vi.doMock("@/lib/cache", () => ({
      cache: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      cacheKeys: {
        analysis: (fixtureId: string) => `analysis:${fixtureId}`,
        fixture: (fixtureId: string) => `fixture:${fixtureId}`,
      },
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: { analysis: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() } },
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(async () => allowedRateLimit),
    }));

    const { GET } = await import("@/app/api/analyze/[fixtureId]/route");
    const response = await GET(
      new NextRequest("http://localhost/api/analyze/fixture-1"),
      { params: Promise.resolve({ fixtureId: "fixture-1" }) }
    );

    expect(response.status).toBe(401);
    expect(analyzeMatch).not.toHaveBeenCalled();
  });

  it("rate limits fixture analysis before provider work", async () => {
    const analyzeMatch = vi.fn();
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({ user: { id: "user-1", role: "USER" } })),
    }));
    vi.doMock("@/backend/server/football/football-service", () => ({
      analyzeMatch,
    }));
    vi.doMock("@/lib/cache", () => ({
      cache: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      cacheKeys: {
        analysis: (fixtureId: string) => `analysis:${fixtureId}`,
        fixture: (fixtureId: string) => `fixture:${fixtureId}`,
      },
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: { analysis: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() } },
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(async () => ({
        allowed: false,
        remaining: 0,
        resetAt: new Date("2026-05-20T00:00:00.000Z"),
      })),
    }));

    const { GET } = await import("@/app/api/analyze/[fixtureId]/route");
    const response = await GET(
      new NextRequest("http://localhost/api/analyze/fixture-1"),
      { params: Promise.resolve({ fixtureId: "fixture-1" }) }
    );

    expect(response.status).toBe(429);
    expect(analyzeMatch).not.toHaveBeenCalled();
  });

  it("streams real alert checks without mock alert payloads", async () => {
    vi.useFakeTimers();
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({ user: { id: "user-1", role: "USER" } })),
    }));
    vi.doMock("@/backend/server/football/alerts-service", () => ({
      getActiveAlerts: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(async () => allowedRateLimit),
    }));

    const { GET } = await import("@/app/api/alerts/stream/route");
    const response = await GET(new NextRequest("http://localhost/api/alerts/stream"));

    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    const firstChunk = await reader?.read();
    const text = new TextDecoder().decode(firstChunk?.value);
    await reader?.cancel().catch(() => {});
    vi.useRealTimers();

    expect(text).toContain("\"type\":\"connected\"");
    expect(text).not.toContain("mock-");
  });

  it("rejects real-money prediction stake without real bookmaker edge", async () => {
    const createPrediction = vi.fn();
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({ user: { id: "user-1", role: "USER" } })),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        prediction: { create: createPrediction },
      },
    }));
    vi.doMock("@/lib/cache", () => ({
      cache: { delete: vi.fn(), get: vi.fn(), set: vi.fn() },
      cacheKeys: { userPredictions: (userId: string) => `predictions:${userId}` },
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(async () => allowedRateLimit),
    }));

    const { POST } = await import("@/app/api/predictions/route");
    const response = await POST(
      new NextRequest("http://localhost/api/predictions", {
        method: "POST",
        body: JSON.stringify({
          fixtureId: "fixture-1",
          market: "WIN_1X2",
          prediction: "HOME_WIN",
          probability: 58,
          stakeUnits: 0.5,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("blocks dashboard summary for guests before provider work", async () => {
    const listFixtures = vi.fn();
    const listOddsByDate = vi.fn();
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => null),
    }));
    vi.doMock("@/backend/server/football/football-service", () => ({
      listFixtures,
      listOddsByDate,
    }));
    vi.doMock("@/lib/cache", () => ({
      cache: { get: vi.fn(), set: vi.fn() },
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: { watchlistItem: { findMany: vi.fn() } },
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(async () => allowedRateLimit),
    }));
    vi.doMock("@/backend/server/football/fixture-insights-scan", () => ({
      scanFixtureInsights: vi.fn(),
      topFixtureInsights: vi.fn(),
    }));

    const { GET } = await import("@/app/api/dashboard/summary/route");
    const response = await GET(
      new NextRequest("http://localhost/api/dashboard/summary?date=2026-05-20")
    );

    expect(response.status).toBe(401);
    expect(listFixtures).not.toHaveBeenCalled();
    expect(listOddsByDate).not.toHaveBeenCalled();
  });

  it("labels arbitrage as simulation and exposes no real opportunities", async () => {
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({ user: { id: "user-1", role: "USER" } })),
    }));
    vi.doMock("@/backend/lib/odds/bookmaker-odds-service", () => ({
      getFixtureBookmakerOdds: vi.fn(async () => ({})),
    }));
    vi.doMock("@/backend/server/football/football-service", () => ({
      analyzeMatch: vi.fn(async () => ({
        fixture: {
          home: { name: "Home" },
          away: { name: "Away" },
          leagueName: "League",
          kickoff: "2026-05-20T20:00:00.000Z",
          market: {
            homeWinOdds: 2.1,
            drawOdds: 3.4,
            awayWinOdds: 3.8,
            over25Odds: 2.0,
            under25Odds: 2.05,
          },
        },
        analysis: {},
      })),
    }));

    const { GET } = await import("@/app/api/arbitrage/route");
    const response = await GET(
      new NextRequest("http://localhost/api/arbitrage?fixtureId=fixture-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.simulationMode).toBe(true);
    expect(body.data.isArbitrageAvailable).toBe(false);
    expect(body.data.arbitrageCount).toBe(0);
    expect(body.data.opportunities).toEqual([]);
    expect(Array.isArray(body.data.simulatedOpportunities)).toBe(true);
  });
});
