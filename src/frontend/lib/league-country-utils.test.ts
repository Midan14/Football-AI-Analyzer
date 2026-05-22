import { describe, expect, it } from "vitest";
import {
  countEdgeFixtures,
  findNextLeagueFixture,
  sortLeagues,
} from "@/frontend/lib/league-country-utils";
import type { Fixture, League } from "@/shared/domain";

const leagueA = {
  id: "a",
  name: "Alpha",
  coverageScore: 90,
  tier: "elite",
} as League;

const leagueB = {
  id: "b",
  name: "Beta",
  coverageScore: 70,
  tier: "standard",
} as League;

describe("league-country-utils", () => {
  it("sorts leagues by coverage score", () => {
    const sorted = sortLeagues([leagueB, leagueA], "coverageScore", new Map());
    expect(sorted[0].id).toBe("a");
  });

  it("finds next league fixture", () => {
    const fixtures = [
      { id: "1", leagueId: "a", kickoff: "2026-05-21T18:00:00Z" },
      { id: "2", leagueId: "a", kickoff: "2026-05-22T18:00:00Z" },
    ] as Fixture[];
    const next = findNextLeagueFixture(fixtures, "a", "2026-05-21");
    expect(next?.id).toBe("1");
  });

  it("counts edge fixtures", () => {
    const fixtures = [{ id: "1" }, { id: "2" }] as Fixture[];
    const count = countEdgeFixtures(fixtures, {
      "1": { hasValue: true },
      "2": { hasMlSignal: true },
    });
    expect(count).toBe(2);
  });
});
