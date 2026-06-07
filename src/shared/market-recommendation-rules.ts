import type { Fixture } from "./domain";

export const HEAVY_FAVORITE_MARKETS = new Set([
  "Under 3.5",
  "Under 2.5",
  "Under 1.5",
  "Over 1.5",
]);

export const MIN_LISTING_ODDS = 1.55;
export const HEAVY_FAVORITE_MIN_LISTING_ODDS = 1.62;
export const HEAVY_FAVORITE_MIN_LISTING_EDGE = 8;

function oddsForMarket(fixture: Fixture, market: string): number {
  const m = fixture.market;
  const map: Record<string, number> = {
    "Local gana": m.homeWinOdds,
    "Empate": m.drawOdds,
    "Visitante gana": m.awayWinOdds,
    "Over 1.5": m.over15Odds,
    "Over 2.5": m.over25Odds,
    "Over 3.5": m.over35Odds ?? 0,
    "Under 1.5": m.under15Odds ?? 0,
    "Under 2.5": m.under25Odds ?? 0,
    "Under 3.5": m.under35Odds,
    "BTTS Sí": m.bttsYesOdds,
    "BTTS No": m.bttsNoOdds,
  };
  return map[market] ?? 0;
}

export function isActionableValueListing(
  row: { market: string; edge: number; modelProbability: number },
  fixture: Fixture
): boolean {
  if (row.edge < 3 || row.modelProbability <= 30) return false;
  const odds = oddsForMarket(fixture, row.market);
  if (odds <= 1.01) return false;
  if (HEAVY_FAVORITE_MARKETS.has(row.market)) {
    return odds >= HEAVY_FAVORITE_MIN_LISTING_ODDS && row.edge >= HEAVY_FAVORITE_MIN_LISTING_EDGE;
  }
  return odds >= MIN_LISTING_ODDS;
}
