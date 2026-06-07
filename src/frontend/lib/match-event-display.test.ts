import { describe, expect, it } from "vitest";
import {
  classifyMatchEventForDisplay,
  buildSquadAvailability,
} from "@/frontend/lib/match-event-display";
import { createTestFixture } from "@/frontend/lib/test-fixture";

describe("match-event-display", () => {
  it("classifies detailed event types", () => {
    expect(classifyMatchEventForDisplay("Goal", "Normal Goal").category).toBe("goal-normal");
    expect(classifyMatchEventForDisplay("Goal", "Penalty").category).toBe("goal-penalty");
    expect(classifyMatchEventForDisplay("Goal", "Own Goal").category).toBe("goal-own");
    expect(classifyMatchEventForDisplay("Goal", "Missed Penalty").category).toBe("penalty-missed");
    expect(classifyMatchEventForDisplay("Card", "Second Yellow card").category).toBe("card-second-yellow");
    expect(classifyMatchEventForDisplay("subst", "Substitution 1").category).toBe("substitution");
    expect(classifyMatchEventForDisplay("subst", "Substitution 2 because of injury").category).toBe(
      "substitution-injury"
    );
  });

  it("builds squad availability crossing injuries and lineups", () => {
    const fixture = createTestFixture({
      home: { ...createTestFixture().home, id: "h1", name: "Home FC" },
      away: { ...createTestFixture().away, id: "a1", name: "Away FC" },
      squad: {
        home: {
          injuries: [{ player: "Striker A", position: "FW", status: "Lesionado", impact: 8 }],
          suspensions: [],
          lastLineup: [],
          tacticalChangeRisk: 10,
        },
        away: {
          injuries: [],
          suspensions: [{ player: "Mid B", position: "MF" }],
          lastLineup: [],
          tacticalChangeRisk: 10,
        },
      },
    });

    const availability = buildSquadAvailability(fixture, [
      {
        teamId: "h1",
        teamName: "Home FC",
        formation: "4-3-3",
        startXI: [
          { id: 1, name: "Striker A", number: 9, position: "FW" },
          { id: 2, name: "Keeper", number: 1, position: "GK" },
        ],
        substitutes: [{ id: 3, name: "Sub 1", number: 12, position: "MF" }],
      },
    ]);

    expect(availability.home.unavailable.some((u) => u.player === "Striker A")).toBe(true);
    expect(availability.away.unavailable.some((u) => u.player === "Mid B")).toBe(true);
    expect(availability.home.starters).toContain("Keeper");
  });
});
