import type { Country, Fixture, League } from "@/shared/domain";
import { demoCountries, demoFixtures, demoLeagues } from "@/backend/lib/providers/demo-data";

export class DemoProvider {
  async getCountries(): Promise<Country[]> {
    return demoCountries;
  }

  async getLeagues(countryId?: string): Promise<League[]> {
    return countryId ? demoLeagues.filter((league) => league.countryId === countryId) : demoLeagues;
  }

  async getFixtures(filters: { leagueId?: string; date?: string } = {}): Promise<Fixture[]> {
    return demoFixtures.filter((fixture) => !filters.leagueId || fixture.leagueId === filters.leagueId);
  }

  async getMatch(fixtureId: string): Promise<Fixture> {
    const fixture = demoFixtures.find((item) => item.id === fixtureId);
    if (!fixture) {
      throw new Error(`Fixture not found: ${fixtureId}`);
    }
    return fixture;
  }
}
