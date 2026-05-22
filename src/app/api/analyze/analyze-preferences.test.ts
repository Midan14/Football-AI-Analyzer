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

describe("GET /api/analyze preferences", () => {
  it("forwards model mode and scenario to analyzeMatch", async () => {
    const analyzeMatch = vi.fn(async () => ({
      fixture: { id: "fixture-1", status: "pre-match" },
      analysis: {
        confidence: {
          score: 55,
          baseScore: 68,
          adjustments: { totalDelta: -13 },
          penalties: [],
        },
      },
    }));

    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({ user: { id: "user-1", role: "USER" } })),
    }));
    vi.doMock("@/backend/server/football/football-service", () => ({ analyzeMatch }));
    vi.doMock("@/lib/cache", () => ({
      cache: { get: vi.fn(async () => null), set: vi.fn(), delete: vi.fn() },
      cacheKeys: {
        analysis: (fixtureId: string, modelMode: string, scenario: string) =>
          `analysis:${fixtureId}:${modelMode}:${scenario}`,
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
      new NextRequest(
        "http://localhost/api/analyze/fixture-1?modelMode=Conservador&scenario=rotation"
      ),
      { params: Promise.resolve({ fixtureId: "fixture-1" }) }
    );

    expect(response.status).toBe(200);
    expect(analyzeMatch).toHaveBeenCalledWith("fixture-1", "user-1", {
      modelMode: "Conservador",
      scenario: "rotation",
    });
  });
});
