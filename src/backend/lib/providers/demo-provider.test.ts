import { describe, expect, it } from "vitest";
import { DemoProvider } from "@/backend/lib/providers/demo-provider";

describe("DemoProvider", () => {
  it("returns countries, leagues, fixtures and match details for the global app flow", async () => {
    const provider = new DemoProvider();
    const countries = await provider.getCountries();
    const leagues = await provider.getLeagues(countries[0].id);
    const fixtures = await provider.getFixtures({ leagueId: leagues[0].id });
    const match = await provider.getMatch(fixtures[0].id);

    expect(countries.length).toBeGreaterThan(2);
    expect(leagues[0].countryId).toBe(countries[0].id);
    expect(fixtures.length).toBeGreaterThan(0);
    expect(match.id).toBe(fixtures[0].id);
  });
});
