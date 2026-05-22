import { describe, expect, it } from "vitest";
import { filterDemoFixturesByDate, getDatedDemoFixtures } from "@/backend/lib/providers/demo-fixture-dates";
import { todayIsoDateColombia } from "@/backend/lib/fixtures/colombia-date";

describe("demo-fixture-dates", () => {
  it("anchors demo fixtures to today in Colombia", () => {
    const today = todayIsoDateColombia();
    const fixtures = getDatedDemoFixtures();
    const todayFixtures = filterDemoFixturesByDate(fixtures, today);
    expect(todayFixtures.length).toBeGreaterThan(0);
  });
});
