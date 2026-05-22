import { describe, expect, it } from "vitest";
import { syncFixtureCoverageFromMatchData } from "@/backend/lib/fixtures/sync-fixture-coverage";
import type { Fixture, MatchLineup } from "@/shared/domain";

const baseFixture = {
  id: "1",
  coverage: {
    tier: "standard" as const,
    hasLineups: false,
    hasOdds: true,
    hasXg: false,
    hasInjuries: false,
    hasReferee: false,
    hasH2H: false,
    hasMomentum: false,
  },
} as Fixture;

const twoLineups: MatchLineup[] = [
  {
    teamId: "1",
    teamName: "Home",
    formation: "4-3-3",
    startXI: [{ id: 1, name: "A", number: 9, position: "FW" }],
    substitutes: [],
  },
  {
    teamId: "2",
    teamName: "Away",
    formation: "4-4-2",
    startXI: [{ id: 2, name: "B", number: 10, position: "FW" }],
    substitutes: [],
  },
];

describe("syncFixtureCoverageFromMatchData", () => {
  it("marks lineups on when XI are present", () => {
    const synced = syncFixtureCoverageFromMatchData(baseFixture, { lineups: twoLineups });
    expect(synced.coverage.hasLineups).toBe(true);
  });

  it("marks referee on when name is provided", () => {
    const synced = syncFixtureCoverageFromMatchData(baseFixture, {
      refereeName: "Michael Oliver",
    });
    expect(synced.coverage.hasReferee).toBe(true);
    expect(synced.referee?.name).toBe("Michael Oliver");
  });
});
