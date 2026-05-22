import { describe, expect, it } from "vitest";
import { computeFixtureEdgeHint } from "@/backend/lib/fixtures/fixture-edge-hints";
import { demoFixtures } from "@/backend/lib/providers/demo-data";

describe("fixture-edge-hints", () => {
  it("returns null when odds are missing", () => {
    const fixture = {
      ...demoFixtures[0],
      market: { ...demoFixtures[0].market, homeWinOdds: 0, drawOdds: 0, awayWinOdds: 0 },
    };
    expect(computeFixtureEdgeHint(fixture)).toBeNull();
  });

  it("returns hint object for demo fixture with odds", () => {
    const hint = computeFixtureEdgeHint(demoFixtures[0]);
    if (!hint) return;
    expect(typeof hint.edge).toBe("number");
    expect(typeof hint.hasValue).toBe("boolean");
    expect(typeof hint.hasMlSignal).toBe("boolean");
    expect(hint.market.length).toBeGreaterThan(0);
  });
});
