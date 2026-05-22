import { describe, expect, it } from "vitest";
import {
  filterLiveFixtures,
  formatLiveStatus,
  sortLiveFixtures,
} from "@/frontend/lib/live-matches-utils";
import { createTestFixture } from "@/frontend/lib/test-fixture";

const base = createTestFixture();
const liveFixture = createTestFixture({
  id: "1",
  elapsed: 55,
  status: "live",
  kickoff: "2026-05-20T18:00:00Z",
  home: { ...base.home, id: "a", name: "Arsenal" },
  away: { ...base.away, id: "b", name: "Brighton" },
});

describe("live-matches-utils", () => {
  it("formats live status with half", () => {
    expect(formatLiveStatus({ ...liveFixture, elapsed: 33 })).toContain("1T");
  });

  it("filters by favorites", () => {
    const filtered = filterLiveFixtures(
      [liveFixture],
      { countryId: "", leagueId: "", query: "", favoritesOnly: true, sortKey: "minute" },
      ["a"]
    );
    expect(filtered).toHaveLength(1);
  });

  it("sorts favorites first", () => {
    const other = createTestFixture({
      id: "2",
      home: { ...base.home, id: "x", name: "X" },
      away: { ...base.away, id: "y", name: "Y" },
    });
    const sorted = sortLiveFixtures([other, liveFixture], "favorites", ["a"]);
    expect(sorted[0].id).toBe("1");
  });
});
