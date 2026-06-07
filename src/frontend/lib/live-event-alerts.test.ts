import { describe, expect, it } from "vitest";
import {
  buildLiveEventKey,
  classifyLiveEvent,
  detectGoalFromScoreChange,
  detectNewLiveEvents,
  createLiveEventTracker,
  fixtureHasFavoriteTeam,
} from "@/frontend/lib/live-event-alerts";
import { createTestFixture } from "@/frontend/lib/test-fixture";

describe("live-event-alerts", () => {
  it("classifies common event types", () => {
    expect(classifyLiveEvent("Goal", "Normal Goal")).toBe("goal");
    expect(classifyLiveEvent("Card", "Yellow Card")).toBe("card-yellow");
    expect(classifyLiveEvent("Card", "Red Card")).toBe("card-red");
    expect(classifyLiveEvent("Goal", "Penalty")).toBe("goal");
    expect(classifyLiveEvent("Var", "Goal cancelled")).toBe("var");
  });

  it("seeds baseline without alerts on first poll", () => {
    const tracker = createLiveEventTracker();
    const { alerts, next } = detectNewLiveEvents("1", [
      { time: 12, team: "A", teamLogo: "", player: "P", type: "Goal", detail: "Normal Goal" },
    ], tracker);

    expect(alerts).toHaveLength(0);
    expect(next.initialized).toBe(true);
    expect(next.seenKeys.size).toBe(1);
  });

  it("detects new events after baseline", () => {
    let tracker = createLiveEventTracker();
    const eventA = { time: 12, team: "A", teamLogo: "", player: "P", type: "Goal", detail: "Normal Goal" };
    ({ next: tracker } = detectNewLiveEvents("1", [eventA], tracker));

    const eventB = { time: 44, team: "B", teamLogo: "", player: "Q", type: "Card", detail: "Yellow Card" };
    const { alerts } = detectNewLiveEvents("1", [eventA, eventB], tracker);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].detail).toBe("Yellow Card");
  });

  it("builds stable dedup keys", () => {
    const key = buildLiveEventKey("99", {
      time: 33,
      team: "Home",
      teamLogo: "",
      player: "Striker",
      type: "Goal",
      detail: "Normal Goal",
    });
    expect(key).toContain("99");
    expect(key).toContain("Striker");
  });

  it("detects goal from score delta after initialization", () => {
    const fixture = createTestFixture({
      id: "10",
      status: "live",
      elapsed: 55,
      result: { homeGoals: 1, awayGoals: 0, bttsActual: false, totalGoals: 1 },
    });

    let tracker = createLiveEventTracker();
    ({ next: tracker } = detectGoalFromScoreChange(fixture, tracker));
    expect(tracker.goalTotal).toBe(1);

    const updated = createTestFixture({
      ...fixture,
      result: { homeGoals: 2, awayGoals: 0, bttsActual: false, totalGoals: 2 },
    });
    const { alert } = detectGoalFromScoreChange(updated, tracker);
    expect(alert?.type).toBe("Goal");
  });

  it("matches favorite teams in fixture", () => {
    const fixture = createTestFixture({
      home: { ...createTestFixture().home, id: "fav-1" },
    });
    expect(fixtureHasFavoriteTeam(fixture, ["fav-1"])).toBe(true);
    expect(fixtureHasFavoriteTeam(fixture, ["other"])).toBe(false);
  });
});
