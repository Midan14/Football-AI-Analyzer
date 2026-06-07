import { getDataProvider } from "@/backend/lib/providers/provider-factory";
import type { FixtureMarket } from "@/shared/domain";

type BookmakerOddsCapableProvider = {
  getBookmakersOddsForFixture?: (fixtureId: string) => Promise<Record<string, FixtureMarket>>;
};

export async function getFixtureBookmakerOdds(
  fixtureId: string
): Promise<Record<string, FixtureMarket>> {
  const provider = getDataProvider() as BookmakerOddsCapableProvider;
  if (typeof provider.getBookmakersOddsForFixture !== "function") {
    return {};
  }
  return provider.getBookmakersOddsForFixture(fixtureId);
}
