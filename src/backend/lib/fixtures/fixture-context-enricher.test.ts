import { describe, expect, it } from "vitest";
import {
  computeRestDays,
  enrichFixtureOperationalContext,
  isSuspensionStatus,
  splitInjuriesAndSuspensions,
} from "@/backend/lib/fixtures/fixture-context-enricher";
import { createTestFixture } from "@/frontend/lib/test-fixture";

describe("fixture-context-enricher", () => {
  it("computes rest days from recent matches", () => {
    const days = computeRestDays("2026-05-21T18:00:00Z", [
      {
        date: "2026-05-18T18:00:00Z",
        homeTeam: "A",
        awayTeam: "B",
        homeGoals: 1,
        awayGoals: 0,
        result: "W",
      },
    ]);
    expect(days).toBe(3);
  });

  it("detects suspension statuses", () => {
    expect(isSuspensionStatus("Suspended")).toBe(true);
    expect(isSuspensionStatus("Muscle Injury")).toBe(false);
  });

  it("splits injuries and suspensions", () => {
    const split = splitInjuriesAndSuspensions([
      { player: "A", position: "DF", status: "Suspended", impact: 7 },
      { player: "B", position: "MF", status: "Knee Injury", impact: 6 },
    ]);
    expect(split.suspensions).toHaveLength(1);
    expect(split.injuries).toHaveLength(1);
  });

  it("enriches venue weather and travel on fixture", () => {
    const fixture = createTestFixture({
      kickoff: "2026-07-10T18:00:00Z",
      home: { ...createTestFixture().home, recentMatches: [] },
      away: { ...createTestFixture().away, recentMatches: [] },
    });

    const enriched = enrichFixtureOperationalContext(
      fixture,
      { name: "Allianz Arena", city: "Munich", country: "Germany" },
      "Paris"
    );

    expect(enriched.venue?.name).toBe("Allianz Arena");
    expect(enriched.weather?.temperatureC).toBeDefined();
    expect(enriched.away.travelKm).toBeGreaterThan(0);
  });
});
