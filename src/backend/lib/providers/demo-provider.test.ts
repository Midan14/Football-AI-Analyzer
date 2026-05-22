import { describe, expect, it } from "vitest";
import { DemoProvider } from "@/backend/lib/providers/demo-provider";
import { todayIsoDateColombia } from "@/backend/lib/fixtures/colombia-date";

describe("DemoProvider", () => {
  it("returns countries, leagues, fixtures and match details for the global app flow", async () => {
    const provider = new DemoProvider();
    const countries = await provider.getCountries();
    const leagues = await provider.getLeagues(countries[0].id);
    const fixtures = await provider.getFixtures({ leagueId: leagues[0].id, date: todayIsoDateColombia() });
    const allToday = await provider.getFixtures({ date: todayIsoDateColombia() });
    const match = await provider.getMatch(allToday[0]?.id ?? fixtures[0].id);

    expect(countries.length).toBeGreaterThan(2);
    expect(leagues[0].countryId).toBe(countries[0].id);
    expect(allToday.length).toBeGreaterThan(0);
    expect(match.id).toBeTruthy();
  });
});
