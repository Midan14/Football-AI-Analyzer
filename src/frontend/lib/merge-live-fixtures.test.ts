import { describe, expect, it } from "vitest";
import { mergeLiveIntoFixtures } from "@/frontend/lib/merge-live-fixtures";
import type { Fixture } from "@/shared/domain";

const baseFixture = {
  id: "100",
  status: "live",
  elapsed: 40,
  result: { homeGoals: 1, awayGoals: 0, totalGoals: 1, bttsActual: false },
  market: { homeWinOdds: 2.1, drawOdds: 3.2, awayWinOdds: 3.5 },
} as Fixture;

describe("mergeLiveIntoFixtures", () => {
  it("updates elapsed and score from live snapshot", () => {
    const merged = mergeLiveIntoFixtures([baseFixture], [
      {
        ...baseFixture,
        elapsed: 52,
        result: { homeGoals: 2, awayGoals: 0, totalGoals: 2, bttsActual: false },
      },
    ]);
    expect(merged[0].elapsed).toBe(52);
    expect(merged[0].result?.homeGoals).toBe(2);
  });

  it("leaves unrelated fixtures unchanged", () => {
    const other = { ...baseFixture, id: "200", elapsed: 10 };
    const merged = mergeLiveIntoFixtures([other], [
      { ...baseFixture, elapsed: 55 },
    ]);
    expect(merged[0].elapsed).toBe(10);
  });

  it("appends live fixtures missing from the daily list", () => {
    const scheduled = { ...baseFixture, id: "200", status: "pre-match" as const };
    const merged = mergeLiveIntoFixtures([scheduled], [baseFixture]);
    expect(merged).toHaveLength(2);
    expect(merged.some((f) => f.id === "100" && f.status === "live")).toBe(true);
  });
});
